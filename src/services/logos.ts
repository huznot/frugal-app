import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import brandIndex from './brandIndex.json';
import { fetchJson } from './http';

// Real store logos, from open data:
//   store → Wikidata ID (OSM "brand:wikidata" tag, or the Name Suggestion Index by name)
//         → Wikidata "small logo or icon" (P8972) / "logo image" (P154)
//         → the file on Wikimedia Commons, which only hosts public-domain or freely licensed files.
// Logos remain trademarks of their owners; they're shown only to identify the store.

const INDEX = brandIndex as unknown as Record<string, [string, string][]>;
const STORAGE_KEY = 'frugal/logos/v1';
const TTL = 30 * 24 * 3600 * 1000;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let compact: Record<string, [string, string][]> | null = null;
const compactIndex = () => {
  if (!compact) {
    compact = {};
    for (const [k, v] of Object.entries(INDEX)) compact[k.replace(/ /g, '')] ??= v;
  }
  return compact;
};

/** Candidate Wikidata IDs for a store, best first. */
export function wikidataFor(name: string, wikidata?: string, country?: string): string[] {
  const ids: string[] = [];
  if (wikidata && /^Q\d+$/.test(wikidata)) ids.push(wikidata);
  let key = norm(name);
  // Try the full name, then progressively shorter prefixes ("Safeway Pembina" → "Safeway"),
  // and a space-insensitive match for web-style names ("foodbasics" → "Food Basics").
  let hits = INDEX[key] ?? compactIndex()[key.replace(/ /g, '')];
  while (!hits && key.includes(' ')) {
    key = key.slice(0, key.lastIndexOf(' '));
    hits = INDEX[key];
  }
  if (hits) {
    const sorted = [...hits].sort((a, b) => Number(b[1] === country) - Number(a[1] === country));
    for (const [q] of sorted) if (!ids.includes(q)) ids.push(q);
  }
  return ids;
}

// ---- cache (memory + device storage) ----

type Entry = { url: string | null; at: number };
let cache: Record<string, Entry> = {};
const loaded = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw) cache = { ...JSON.parse(raw), ...cache };
  })
  .catch(() => {});
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const persist = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {}), 1000);
};

// ---- batched Wikidata lookups (one request for up to 50 brands) ----

let queue = new Map<string, ((url: string | null) => void)[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function pickFile(claims: any): string | null {
  for (const prop of ['P8972', 'P154']) {
    const list: any[] = (claims?.[prop] ?? []).filter((c: any) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);
    const best = list.find((c) => c.rank === 'preferred') ?? list[0];
    if (best) return best.mainsnak.datavalue.value as string;
  }
  return null;
}

async function flush() {
  flushTimer = null;
  const batch = queue;
  queue = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let entities: Record<string, any> = {};
    try {
      const data = await fetchJson(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&props=claims&format=json&origin=*`,
        { timeoutMs: 10000 },
      );
      entities = data.entities ?? {};
    } catch {
      // Network failure: don't cache, just fall back to the monogram this time.
      chunk.forEach((id) => batch.get(id)?.forEach((cb) => cb(null)));
      continue;
    }
    for (const id of chunk) {
      const file = pickFile(entities[id]?.claims);
      const url = file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=160` : null;
      cache[id] = { url, at: Date.now() };
      batch.get(id)?.forEach((cb) => cb(url));
    }
    persist();
  }
}

function lookup(id: string): Promise<string | null> {
  const hit = cache[id];
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    const cbs = queue.get(id) ?? [];
    cbs.push(resolve);
    queue.set(id, cbs);
    if (!flushTimer) flushTimer = setTimeout(flush, 40);
  });
}

/** First candidate that has a logo wins (e.g. Safeway Canada has none on Wikidata, Safeway US does). */
export async function resolveLogo(ids: string[]): Promise<string | null> {
  await loaded;
  for (const id of ids) {
    const url = await lookup(id);
    if (url) return url;
  }
  return null;
}

export function useStoreLogo(name: string, wikidata?: string, country?: string): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    const first = wikidataFor(name, wikidata, country)[0];
    return (first && cache[first]?.url) || null;
  });
  useEffect(() => {
    let alive = true;
    const ids = wikidataFor(name, wikidata, country);
    if (!ids.length) {
      setUrl(null);
      return;
    }
    resolveLogo(ids).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [name, wikidata, country]);
  return url;
}
