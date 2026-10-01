/**
 * Frugal proxy — a small Cloudflare Worker that holds API keys so they never ship in the app.
 *
 *   GET  /shopping      ?q=&location=&gl=     → { items, judged, meaning }  store prices, ranked by AI + value
 *   GET  /products      ?q=&country=&page=     → Open Food Facts search (cached; works from browsers too)
 *   GET  /nutrition     ?title=&country=       → { product }  the Open Food Facts product matching a store listing
 *   GET  /lookup        ?code=                 → { product }  barcode → name/brand/category (books, food, everything else)
 *   GET  /stores        ?lat=&lon=&radius=     → { stores }   nearby grocery stores (OpenStreetMap), cached per area
 *   POST /identify      photo (base64 JPEG)    → { product: { name, brand, size, query } | null }
 *   GET  /kroger/prices ?upc=&lat=&lon=        → { items }   (official Kroger API, US only)
 *   GET  /img/:id                              → cached product image
 *   GET  /health
 *
 * Privacy: nothing is stored or logged. Photos are forwarded for identification and discarded.
 */

import { extractResults, normalize, parseSize, rank, ShopItem, unitPriceOf, Unit } from './shopping';
import { chainShortName, estimateSizes, identifyWithWorkersAi, judge, readSizesFromPhotos, rerank, rewriteQuery, Identified } from './ai';
import brandIndex from '../../src/services/brandIndex.json';

interface Env {
  BRIGHTDATA_API_KEY?: string;
  BRIGHTDATA_ZONE?: string; // name of your SERP API zone in the Bright Data dashboard (default "serp_api1")
  SEARCHAPI_KEY?: string;
  SERPAPI_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  APP_KEY?: string;
  KROGER_CLIENT_ID?: string;
  KROGER_CLIENT_SECRET?: string;
  AI?: { run(model: string, inputs: unknown): Promise<any> };
  SELF?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  STORES_DB?: D1Database;
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra } });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, X-App-Key', 'Access-Control-Allow-Methods': 'GET, POST' },
      });
    }
    if (url.pathname === '/health') return json({ ok: true });
    // Product images are public and requested by the image loader (no custom headers).
    if (url.pathname.startsWith('/img/') && req.method === 'GET') return productImage(url);

    if (env.APP_KEY && req.headers.get('X-App-Key') !== env.APP_KEY) return json({ error: 'unauthorized' }, 401);

    if (env.LIMITER) {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'rate-limited' }, 429);
    }

    try {
      if (url.pathname === '/shopping' && req.method === 'GET') return await shopping(url, env, ctx);
      if (url.pathname === '/refine' && req.method === 'GET') return await refine(url, env);
      if (url.pathname === '/products' && req.method === 'GET') return await products(url, ctx);
      if (url.pathname === '/nutrition' && req.method === 'GET') return await nutrition(url, env, ctx);
      if (url.pathname === '/lookup' && req.method === 'GET') return await lookup(url, ctx);
      if (url.pathname === '/stores' && req.method === 'GET') return await stores(url, env, ctx);
      if (url.pathname === '/identify' && req.method === 'POST') return await identify(req, env);
      if (url.pathname === '/kroger/prices' && req.method === 'GET') return await krogerPrices(url, env);
    } catch (e) {
      return json({ error: 'upstream-failed' }, 502);
    }
    return json({ error: 'not-found' }, 404);
  },
};

// ---------- shared cache helpers ----------

const cacheGet = async (key: string) => {
  const hit = await caches.default.match(new Request(`https://cache.frugal/${key}`));
  return hit ? hit.json<any>() : null;
};
const cachePut = (key: string, value: unknown, seconds: number) =>
  caches.default.put(
    new Request(`https://cache.frugal/${key}`),
    new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}` } }),
  );

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** /img/<bundle>/<id>: one image out of a search's image bundle (see shopping()). */
async function productImage(url: URL) {
  const [, , bundleId, imgId] = url.pathname.split('/');
  const bundle = bundleId && imgId ? await cacheGet(`imgs/${bundleId}`) : null;
  const entry = bundle?.[imgId];
  if (!entry) return new Response('not found', { status: 404 });
  const bytes = Uint8Array.from(atob(entry[1]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': entry[0], 'Cache-Control': 'public, max-age=86400', ...CORS } });
}

// ---------- Location: turn "Winnipeg, MB" into Google's "Winnipeg,Manitoba,Canada" ----------

const REGIONS: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/**
 * Search providers only understand Google's canonical location names. Phones report places in
 * many forms ("Winnipeg, MB", "Winnipeg, Manitoba, Canada"), so resolve them via SerpApi's free
 * locations lookup (no search credit used) and cache the answer for 30 days.
 * Unknown places return '' — results are then country-wide instead of empty.
 */
async function canonicalLocation(location: string, gl: string, ctx: ExecutionContext): Promise<string> {
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length || /current location/i.test(parts[0])) return '';
  const key = `loc/v1/${gl}/${hashString(parts.join('|').toLowerCase())}`;
  const cached = await cacheGet(key);
  if (cached) return cached.name;

  const region = parts[1] ? REGIONS[parts[1].toUpperCase()] ?? parts[1] : '';
  let name = '';
  try {
    const res = await fetch(`https://serpapi.com/locations.json?q=${encodeURIComponent(parts[0])}&limit=10`);
    const list: any[] = res.ok ? await res.json() : [];
    const inCountry = list.filter((l) => String(l.country_code).toLowerCase() === gl);
    const score = (l: any) =>
      (region && String(l.canonical_name).toLowerCase().includes(region.toLowerCase()) ? 4 : 0) +
      (l.target_type === 'City' ? 2 : 0) +
      (l.reach ?? 0) / 1e9;
    name = inCountry.sort((a, b) => score(b) - score(a))[0]?.canonical_name ?? '';
  } catch {
    // fall back to country-wide results
  }
  ctx.waitUntil(cachePut(key, { name }, 30 * 86400));
  return name;
}

// ---------- Store prices (Google Shopping via a search API provider) ----------

const DOMAINS: Record<string, string> = { ca: 'google.ca', us: 'google.com', gb: 'google.co.uk', au: 'google.com.au', ie: 'google.ie', nz: 'google.co.nz', in: 'google.co.in' };
const CACHE_SECONDS = 6 * 3600; // prices barely move within hours; caching saves quota and makes repeat searches instant
// Bump whenever ranking/AI logic changes so users never see results ranked by old logic.
const RANK_VERSION = 26;

type Query = { q: string; gl: string; location: string };
type Raw = { r: any; nearbyGroup: boolean }[];

/** Bright Data SERP API — 5,000 free requests/month, then ~$1.50 per 1,000. */
async function fromBrightData({ q, gl, location }: Query, env: Env): Promise<Raw> {
  const params = new URLSearchParams({ q, tbm: 'shop', gl, hl: 'en', brd_json: '1' });
  if (location) params.set('uule', location);
  const res = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BRIGHTDATA_API_KEY}` },
    body: JSON.stringify({ zone: env.BRIGHTDATA_ZONE ?? 'serp_api1', url: `https://www.${DOMAINS[gl] ?? 'google.com'}/search?${params}`, format: 'raw' }),
  });
  if (!res.ok) throw new Error(`brightdata ${res.status}`);
  const text = await res.text();
  if (!text.startsWith('{')) throw new Error(`brightdata: ${text.slice(0, 80)}`); // e.g. "This query recently failed…"
  return extractResults(JSON.parse(text));
}

/** SerpApi (250 free searches/month) or SearchAPI.io — same Google Shopping result shape. */
async function fromSerpStyle({ q, gl, location }: Query, host: 'serpapi' | 'searchapi', key: string): Promise<Raw> {
  const params = new URLSearchParams({ engine: 'google_shopping', q, gl, hl: 'en', google_domain: DOMAINS[gl] ?? 'google.com', api_key: key });
  if (location) params.set('location', location);
  const endpoint = host === 'serpapi' ? `https://serpapi.com/search.json?${params}` : `https://www.searchapi.io/api/v1/search?${params}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`${host} ${res.status}`);
  return extractResults(await res.json());
}

const HEDGE_AFTER_MS = 4000;

type RaceResult = { items: ShopItem[]; source: string; later: Promise<ShopItem[]> };

/**
 * Ask the preferred provider first. If it hasn't answered within HEDGE_AFTER_MS (or fails /
 * returns nothing), also ask the next one. Respond with whichever gives results first — and
 * `later` resolves with whatever the slower, already-running providers return afterwards, so
 * the background refinement can merge in their (often better) results instead of wasting them.
 */
async function raceProviders(providers: { name: string; run: () => Promise<Raw> }[]): Promise<RaceResult | null> {
  const launched: { name: string; promise: Promise<ShopItem[]> }[] = [];
  return new Promise<RaceResult | null>((resolve) => {
    let settled = false;
    let pending = 0;
    let next = 0;
    let fallback: { items: ShopItem[]; source: string } | null = null;

    const laterFor = (winner: string) =>
      Promise.all(
        launched
          .filter((l) => l.name !== winner)
          .map((l) => Promise.race([l.promise, new Promise<ShopItem[]>((r) => setTimeout(() => r([]), 15000))]).catch(() => [] as ShopItem[])),
      ).then((lists) => lists.flat());

    const launch = () => {
      if (settled || next >= providers.length) return;
      const p = providers[next++];
      pending++;
      const timer = setTimeout(launch, HEDGE_AFTER_MS);
      const promise = p.run().then(normalize);
      launched.push({ name: p.name, promise });
      promise
        .then((items) => {
          if (items.length && !settled) {
            settled = true;
            resolve({ items, source: p.name, later: laterFor(p.name) });
          } else if (!fallback) fallback = { items, source: p.name };
        })
        .catch(() => {})
        .finally(() => {
          clearTimeout(timer);
          pending--;
          if (settled) return;
          if (next < providers.length) launch(); // failed/empty → try the next one right away
          else if (pending === 0) resolve(fallback ? { ...fallback, later: Promise.resolve([]) } : null);
        });
    };
    launch();
  });
}

// ---------- Chains near the shopper (so each one's own listings are searched too) ----------

const BRANDS = brandIndex as unknown as Record<string, [string, string][]>;
const brandKey = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

/** Store name → chain (Wikidata id + its official name), via the Name Suggestion Index. "Safeway Pembina" → Safeway. */
function chainOf(name: string, country: string): { id: string; name: string } | null {
  let key = brandKey(name);
  while (key) {
    const hits = BRANDS[key];
    if (hits) {
      const hit = hits.find((h) => h[1] === country) ?? hits.find((h) => h[1] === '001') ?? hits[0];
      return { id: hit[0], name: key };
    }
    key = key.includes(' ') ? key.slice(0, key.lastIndexOf(' ')) : '';
  }
  return null;
}

const CHAIN_COUNT = 5;
// Where most people actually shop (Wikidata ids). Always searched first when there's one near the
// shopper; the remaining slots go to whichever chains have the most branches nearby.
const MAJOR_CHAINS: Record<string, string[]> = {
  CA: ['Q483551' /* Walmart */, 'Q7300856' /* Real Canadian Superstore */, 'Q715583' /* Costco */],
  US: ['Q483551' /* Walmart */, 'Q715583' /* Costco */, 'Q153417' /* Kroger */, 'Q1046951' /* Target */],
};
const CHAIN_RADIUS_KM = 15;
const CHAIN_DEADLINE_MS = 14000;

/**
 * The grocery chains shoppers near this point can walk into, biggest presence first (most
 * branches within 15 km, then nearest). General store data — no hand-made chain lists.
 */
async function nearbyChains(env: Env, lat: number, lon: number, gl: string, ctx: ExecutionContext): Promise<{ id: string; name: string }[]> {
  if (!env.STORES_DB || !isFinite(lat) || !isFinite(lon)) return [];
  const tLat = Math.round(lat * 10) / 10;
  const tLon = Math.round(lon * 10) / 10;
  const key = `chains/v2/${gl}/${tLat}/${tLon}`;
  const hit = await cacheGet(key);
  if (hit) return hit.chains;

  const dLat = CHAIN_RADIUS_KM / 111;
  const dLon = CHAIN_RADIUS_KM / (111 * Math.cos((tLat * Math.PI) / 180));
  const { results } = await env.STORES_DB.prepare(
    "SELECT name, brand, lat, lon FROM stores WHERE kind IN ('supermarket', 'wholesale') AND lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4 LIMIT 3000",
  )
    .bind(tLat - dLat, tLat + dLat, tLon - dLon, tLon + dLon)
    .all<any>();
  const country = gl.toUpperCase();
  const tally = new Map<string, { id: string; name: string; count: number; nearest: number }>();
  for (const s of results ?? []) {
    const chain = chainOf(s.brand || s.name, country) ?? (s.brand ? chainOf(s.name, country) : null);
    if (!chain) continue;
    const km = metres({ lat: tLat, lon: tLon }, s) / 1000;
    if (km > CHAIN_RADIUS_KM) continue;
    const t = tally.get(chain.id) ?? { ...chain, count: 0, nearest: Infinity };
    t.count++;
    t.nearest = Math.min(t.nearest, km);
    tally.set(chain.id, t);
  }
  const major = (id: string) => (MAJOR_CHAINS[country] ?? []).includes(id);
  const chains = [...tally.values()]
    .filter((c) => major(c.id) || c.count >= 2) // a real presence in the area, not a one-off
    .sort((a, b) => Number(major(b.id)) - Number(major(a.id)) || b.count - a.count || a.nearest - b.nearest)
    .slice(0, CHAIN_COUNT)
    .map(({ id, name }) => ({ id, name }));
  ctx.waitUntil(cachePut(key, { chains }, 7 * 86400));
  return chains;
}

/** What shoppers call a chain in a search ("real canadian superstore" → "superstore"). Cached 90 days. */
async function chainSearchName(env: Env, chain: { id: string; name: string }, ctx: ExecutionContext): Promise<string> {
  const key = `chainname/v1/${chain.id}`;
  const hit = await cacheGet(key);
  if (hit?.name) return hit.name;
  const name = (await chainShortName(env, chain.name)) ?? chain.name;
  ctx.waitUntil(cachePut(key, { name }, 90 * 86400));
  return name;
}

/**
 * One chain's own listings for a search. A general Google Shopping search only returns ~40
 * listings, often none from the store down the street; "<search> <chain>" returns that store's
 * range (its big packs and store brands included). Bright Data sometimes can't read the page Google
 * shows for a store-named search; then SerpApi is asked instead (at most `budget.serp` times per
 * search, to spare its small quota), otherwise Bright Data once more.
 */
async function chainListings(
  env: Env,
  searchQ: string,
  typed: string,
  chainName: string,
  gl: string,
  location: string,
  started: number,
  budget: { serp: number },
): Promise<ShopItem[]> {
  // Google shows some store-named searches as a store page Bright Data can't read; other wording
  // of the same search usually gets listings, so try the shopper's own words next.
  const wordings = [...new Set([`${searchQ} ${chainName}`, `${typed} ${chainName}`])];
  for (let attempt = 0; attempt < 3; attempt++) {
    // Everything must land within Cloudflare's ~30 s for background work, refinement included.
    const left = CHAIN_DEADLINE_MS - (Date.now() - started);
    if (left < 3000) break;
    const useSerp = attempt >= wordings.length && env.SERPAPI_KEY && budget.serp > 0;
    if (attempt >= wordings.length && !useSerp) break;
    if (useSerp) budget.serp--;
    const q = wordings[Math.min(attempt, wordings.length - 1)];
    try {
      const raw = useSerp ? fromSerpStyle({ q, gl, location }, 'serpapi', env.SERPAPI_KEY!) : fromBrightData({ q, gl, location }, env);
      const items = normalize(await withDeadline(raw, left));
      if (items.length) return items;
    } catch {
      // next wording, or the other provider
    }
  }
  return [];
}

const withDeadline = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// ---------- Search ----------

async function groceryQuery(env: Env, q: string, ctx: ExecutionContext): Promise<string> {
  const key = `rewrite/v1/${encodeURIComponent(q.toLowerCase())}`;
  const hit = await cacheGet(key);
  if (hit?.q) return hit.q;
  const rewritten = (await rewriteQuery(env, q)) ?? q;
  ctx.waitUntil(cachePut(key, { q: rewritten }, 30 * 86400));
  return rewritten;
}

/** Inline (base64) images would make responses ~1 MB: keep them in one cache entry, hand out short URLs. */
function bundleImages(items: ShopItem[], origin: string, bundleId: string): Record<string, [string, string]> {
  const bundle: Record<string, [string, string]> = {};
  for (const item of items) {
    const m = item.thumbnail?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) continue;
    const imgId = hashString(item.id + item.seller + item.title);
    bundle[imgId] = [m[1], m[2]];
    item.thumbnail = `${origin}/img/${bundleId}/${imgId}`;
  }
  return bundle;
}

const sameListing = (a: ShopItem, b: ShopItem) => a.seller === b.seller && a.title === b.title && a.price === b.price;

/**
 * Search, in three quick steps so the shopper sees results right away:
 *   1. (~2–4 s, this response) a general Google Shopping search near them, junk removed by an AI reranker
 *   2. (+~3 s, /refine) the AI decides what they meant and fills missing pack sizes → best value + cheapest
 *   3. (+~10 s, background) each big chain near them is searched by name too, merged and judged the same way
 * `judged` tells the app step 2 is done, `more: false` that step 3 is.
 */
async function shopping(url: URL, env: Env, ctx: ExecutionContext) {
  const q = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const gl = (url.searchParams.get('gl') ?? 'ca').toLowerCase().slice(0, 2);
  if (!q) return json({ items: [], judged: true, more: false });
  const lat = Number(url.searchParams.get('lat') ?? NaN);
  const lon = Number(url.searchParams.get('lon') ?? NaN);
  const location = await canonicalLocation((url.searchParams.get('location') ?? '').slice(0, 100), gl, ctx);
  const area = location ? location.toLowerCase() : isFinite(lat) && isFinite(lon) ? `${Math.round(lat * 10) / 10},${Math.round(lon * 10) / 10}` : '';

  // Shared cache across all users: the same query in the same area is only paid for once per 6 h.
  const cacheKey = `shopping/r${RANK_VERSION}/${gl}/${hashString(area)}/${encodeURIComponent(q.toLowerCase())}`;
  const origin = url.origin;
  // Steps 2 and 3 run as separate /refine requests so each gets its own budget of outgoing calls.
  const call = env.SELF ? env.SELF.fetch.bind(env.SELF) : fetch;
  const refineCall = (phase: number) =>
    call(`${origin}/refine?${new URLSearchParams({ key: cacheKey, q, phase: String(phase) })}`, { headers: { 'X-App-Key': env.APP_KEY ?? '' } }).catch(() => {});

  const hit = await cacheGet(cacheKey);
  if (hit) {
    // Store listings merged in after the first answer still need judging. Background work only
    // gets ~30 s, so the app's next check-in (a fresh request) starts that, once.
    if (hit.toJudge && !(hit.judging > Date.now() - 20000)) {
      ctx.waitUntil(cachePut(cacheKey, { ...hit, judging: Date.now() }, CACHE_SECONDS).then(() => refineCall(2)));
    }
    return json(hit, 200, { 'X-Cache': 'HIT' });
  }

  // Turn what the shopper typed into the search that finds it at grocery stores ("apple" →
  // "fresh apples produce", not iPhones). Cached for 30 days per search term.
  const [searchQ, chains] = await Promise.all([groceryQuery(env, q, ctx), nearbyChains(env, lat, lon, gl, ctx).catch(() => [])]);
  const started = Date.now();
  const budget = { serp: 2 };
  // Chain searches start now, in parallel with the general one; they're merged in step 3.
  const chainJob =
    env.BRIGHTDATA_API_KEY && chains.length
      ? Promise.all(chains.map(async (c) => chainListings(env, searchQ, q, await chainSearchName(env, c, ctx), gl, location, started, budget))).then((l) => l.flat())
      : Promise.resolve([] as ShopItem[]);

  const providers: { name: string; run: () => Promise<Raw> }[] = [];
  if (env.BRIGHTDATA_API_KEY) providers.push({ name: 'brightdata', run: () => fromBrightData({ q: searchQ, gl, location }, env) });
  if (env.SERPAPI_KEY) providers.push({ name: 'serpapi', run: () => fromSerpStyle({ q: searchQ, gl, location }, 'serpapi', env.SERPAPI_KEY!) });
  if (env.SEARCHAPI_KEY) providers.push({ name: 'searchapi', run: () => fromSerpStyle({ q: searchQ, gl, location }, 'searchapi', env.SEARCHAPI_KEY!) });
  if (!providers.length) return json({ error: 'shopping-disabled' }, 503);

  const found = await raceProviders(providers);
  if (!found) return json({ error: 'shopping-failed' }, 502);
  let items = found.items;

  const bundleId = hashString(cacheKey);
  const bundle = bundleImages(items, origin, bundleId);
  if (Object.keys(bundle).length) ctx.waitUntil(cachePut(`imgs/${bundleId}`, bundle, 24 * 3600));

  // Step 1: an AI reranker scores every title against the search and drops unrelated listings
  // (iPhones for "apple"). Scores give a provisional order.
  const scores = await rerank(env, searchQ, items.map((i) => i.title));
  if (scores) {
    items.forEach((it, i) => (it.score = Math.round(scores[i] * 1000) / 1000));
    const top = Math.max(...scores);
    items = items.filter((i) => (i.score ?? 0) >= Math.min(0.02, top * 0.1));
  }
  items = rank(items).slice(0, 40);
  const first = { items, judged: false, more: true, meaning: null as string | null, isFood: null as boolean | null, unit: null as Unit | null, source: found.source };


  ctx.waitUntil(
    (async () => {
      await cachePut(cacheKey, first, CACHE_SECONDS);
      // Step 2 right away, while the slower provider and the chain searches are still running.
      const [, later, fromChains] = await Promise.all([refineCall(1), found.later, chainJob.catch(() => [] as ShopItem[])]);

      // Step 3: merge in everything new and drop junk the same way; the next check-in has it judged.
      const current = (await cacheGet(cacheKey)) ?? first;
      const have: ShopItem[] = current.items;
      const extra: ShopItem[] = [];
      for (const e of [...later, ...fromChains]) if (!have.some((i) => sameListing(i, e)) && !extra.some((i) => sameListing(i, e))) extra.push(e);
      if (!extra.length) {
        await cachePut(cacheKey, { ...current, more: false }, CACHE_SECONDS);
        return;
      }
      const extraScores = await rerank(env, searchQ, extra.map((i) => i.title));
      const top = Math.max(0, ...have.map((i) => i.score ?? 0));
      const kept = extra.filter((e, idx) => {
        e.score = extraScores ? Math.round(extraScores[idx] * 1000) / 1000 : undefined;
        return !extraScores || (e.score ?? 0) >= Math.min(0.02, top * 0.1);
      });
      const extraBundle = bundleImages(kept, origin, `${bundleId}x`);
      if (Object.keys(extraBundle).length) await cachePut(`imgs/${bundleId}x`, extraBundle, 24 * 3600);
      const merged = [...have, ...kept.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 60)];
      await cachePut(cacheKey, { ...current, items: current.judged ? rank(merged, current.unit ?? undefined) : rank(merged), more: true, toJudge: true, source: `${current.source}+stores` }, CACHE_SECONDS);
    })(),
  );

  return json(first, 200, { 'X-Source': found.source });
}

/**
 * Each listing's product photo as a data URL, for reading the size off the package. Bright Data
 * photos come from this search's image bundle (no download); others are fetched (capped).
 */
async function photosFor(items: ShopItem[]): Promise<(string | undefined)[]> {
  const refs = items.map((i) => i.thumbnail?.match(/\/img\/([^/]+)\/([^/?#]+)$/));
  const bundles = new Map<string, any>();
  await Promise.all([...new Set(refs.filter(Boolean).map((m) => m![1]))].map(async (b) => bundles.set(b, await cacheGet(`imgs/${b}`))));
  let fetched = 0;
  return Promise.all(
    items.map(async (it, i) => {
      const m = refs[i];
      if (m) {
        const e = bundles.get(m[1])?.[m[2]];
        return e ? `data:${e[0]};base64,${e[1]}` : undefined;
      }
      if (!it.thumbnail || !/^https:/.test(it.thumbnail) || fetched >= MAX_PHOTO_FETCHES) return undefined;
      fetched++;
      try {
        const res = await withDeadline(fetch(it.thumbnail), 4000);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!res.ok || buf.length > 250000) return undefined;
        let bin = '';
        for (let j = 0; j < buf.length; j++) bin += String.fromCharCode(buf[j]);
        return `data:${res.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`;
      } catch {
        return undefined;
      }
    }),
  );
}

const MAX_PHOTO_FETCHES = 12;

const JUDGE_BATCH = 30;
const MAX_BATCHES = 4;

/**
 * Phase 1: judge the first results (what the shopper meant, missing sizes) in one AI call.
 * Phase 2: judge only the listings merged in since, told the meaning phase 1 settled on.
 */
async function refine(url: URL, env: Env) {
  const cacheKey = url.searchParams.get('key') ?? '';
  const q = url.searchParams.get('q') ?? '';
  const phase = url.searchParams.get('phase') === '2' ? 2 : 1;
  if (!cacheKey.startsWith('shopping/') || !q) return json({ ok: false }, 400);
  const current = await cacheGet(cacheKey);
  if (!current) return json({ ok: true, skipped: true });
  if (phase === 1 && current.judged) return json({ ok: true, skipped: true });

  const items: ShopItem[] = current.items.map((i: ShopItem) => ({ ...i }));
  const judgedAs = (m: string) => items.filter((i) => i.match === m).slice(0, 8).map((i) => i.title);
  const known =
    phase === 2 && current.judged && current.meaning
      ? { meaning: current.meaning as string, unit: (current.unit ?? undefined) as Unit | undefined, exact: judgedAs('exact'), variant: judgedAs('variant') }
      : undefined;
  const todo = items.filter((i) => !i.match);
  // Every listing gets judged (a store's best deal can be anywhere in the list), in batches that run
  // at the same time. The first batch settles what the shopper meant; the others are told, so they agree.
  const candidates = [...todo].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, JUDGE_BATCH * MAX_BATCHES);
  const batches: ShopItem[][] = [];
  for (let i = 0; i < candidates.length; i += JUDGE_BATCH) batches.push(candidates.slice(i, i + JUDGE_BATCH));
  const unsized = candidates.filter((c) => !c.size);
  const sizeBatches: ShopItem[][] = [];
  for (let i = 0; i < unsized.length; i += JUDGE_BATCH) sizeBatches.push(unsized.slice(i, i + JUDGE_BATCH));

  // Stated sizes (not earlier estimates) as price references, spread across sizes.
  const references = items
    .filter((i) => i.size && !i.size.estimated)
    .sort((a, b) => a.size!.amount - b.size!.amount)
    .filter((_, i, all) => all.length <= 14 || i % Math.ceil(all.length / 14) === 0)
    .map((i) => ({ title: i.title, price: i.price, size: i.size!.label }));
  const sizeJob = Promise.all(sizeBatches.map((b) => estimateSizes(env, q, b.map((c) => ({ title: c.title, price: c.price })), references)));
  // The size printed on the package, read from each listing's photo: the real size, not a guess.
  const photoJob = photosFor(unsized).then((imgs) => {
    const withImg = unsized.map((c, i) => ({ c, image: imgs[i] })).filter((x): x is { c: ShopItem; image: string } => !!x.image);
    return readSizesFromPhotos(env, withImg.map((x) => ({ title: x.c.title, image: x.image }))).then(
      (sizes) => new Map(withImg.map((x, i) => [x.c, sizes[i]] as const)),
    );
  });
  const first = batches.length ? await judge(env, q, batches[0].map((c) => c.title), known) : null;
  const rest = first
    ? await Promise.all(
        batches.slice(1).map((b) =>
          judge(env, q, b.map((c) => c.title), {
            meaning: first.meaning,
            unit: first.unit,
            exact: batches[0].filter((_, i) => first.exact.has(i)).slice(0, 8).map((c) => c.title),
            variant: batches[0].filter((_, i) => first.variant.has(i)).slice(0, 8).map((c) => c.title),
          }),
        ),
      )
    : [];
  const verdict = first;
  const guesses = (await sizeJob).flatMap((g, i) => g ?? sizeBatches[i].map(() => null));

  if (!verdict) {
    // Nothing (more) to judge, or the AI is unavailable: keep what we have, mark as done.
    const out = { ...current, items: items.map((i) => ({ ...i, match: i.match ?? (current.judged ? 'related' : undefined) })), judged: true, more: phase === 1 ? current.more : false, toJudge: false };
    await cachePut(cacheKey, out, CACHE_SECONDS);
    return json({ ok: true, judged: false });
  }

  const unit = verdict.unit;
  batches.forEach((batch, b) => {
    const v = b === 0 ? verdict : rest[b - 1];
    batch.forEach((c, idx) => {
      c.match = !v ? 'related' : v.exact.has(idx) ? 'exact' : v.variant.has(idx) ? 'variant' : 'related';
    });
  });
  const fromPhotos = await photoJob.catch(() => new Map<ShopItem, string | null>());
  const toSize = (text: string | null | undefined) => {
    if (!text || !unit) return undefined;
    let size = parseSize(text);
    const n = parseFloat(text);
    if (!size && unit === 'each' && n > 0) size = { amount: n, unit: 'each' as const, label: `${n} ct` };
    return size && size.unit === unit ? size : undefined;
  };
  unsized.forEach((c, idx) => {
    if (c.match === 'related') return;
    // Printed on the package beats the AI's estimate (which stays marked "est.").
    const printed = toSize(fromPhotos.get(c));
    const guessed = printed ? undefined : toSize(guesses?.[idx]);
    const size = printed ?? guessed;
    if (!size) return;
    c.size = { ...size, estimated: !printed };
    c.unitPrice = unitPriceOf(c.price, c.size);
  });
  const byId = new Map(candidates.map((c) => [c.id + c.seller + c.title + c.price, c]));
  const refined = items.map((i) => byId.get(i.id + i.seller + i.title + i.price) ?? { ...i, match: i.match ?? 'related' });

  // Phase 1 may finish after phase 3 merged new listings in: keep those, phase 2 judges them.
  const latest = phase === 1 ? await cacheGet(cacheKey) : null;
  const added: ShopItem[] = latest ? latest.items.filter((l: ShopItem) => !refined.some((r) => sameListing(r, l))) : [];

  await cachePut(
    cacheKey,
    {
      items: rank([...refined, ...added], unit),
      judged: true,
      more: phase === 1 ? (latest?.more ?? current.more) : false,
      meaning: verdict.meaning,
      isFood: phase === 2 && current.isFood != null ? current.isFood : verdict.isFood,
      unit: unit ?? null,
      source: latest?.source ?? current.source,
    },
    CACHE_SECONDS,
  );
  return json({ ok: true, judged: true });
}

// ---------- Open Food Facts (products + nutrition), cached at the edge ----------

const OFF_TAGS: Record<string, string> = {
  CA: 'en:canada', US: 'en:united-states', GB: 'en:united-kingdom', IE: 'en:ireland', AU: 'en:australia',
  NZ: 'en:new-zealand', FR: 'en:france', DE: 'en:germany', ES: 'en:spain', IT: 'en:italy', MX: 'en:mexico', IN: 'en:india',
};
const OFF_FIELDS = 'code,product_name,brands,quantity,nutriscore_grade,image_front_small_url,image_front_url';
const OFF_UA = 'Frugal/2.0 (huzisgreat@gmail.com)';

async function offSearch(q: string, country: string, page: number, pageSize = 24) {
  const clean = q.replace(/[:"()[\]{}\\/^~*?!+\-&|<>=]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return { hits: [], page: 1, page_count: 0 };
  const tag = OFF_TAGS[country.toUpperCase()];
  const run = async (withCountry: boolean) => {
    const params = new URLSearchParams({ q: withCountry && tag ? `${clean} countries_tags:"${tag}"` : clean, page: String(page), page_size: String(pageSize), langs: 'en', fields: OFF_FIELDS });
    const res = await fetch(`https://search.openfoodfacts.org/search?${params}`, { headers: { 'User-Agent': OFF_UA } });
    if (!res.ok) throw new Error(`off ${res.status}`);
    return res.json<any>();
  };
  let data = await run(true);
  if (!data.hits?.length && tag && page === 1) data = await run(false);
  return data;
}

async function products(url: URL, ctx: ExecutionContext) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const country = (url.searchParams.get('country') ?? '').slice(0, 2);
  const page = Math.max(1, Math.min(10, Number(url.searchParams.get('page')) || 1));
  const key = `off/v1/${country}/${page}/${encodeURIComponent(q.toLowerCase())}`;
  const hit = await cacheGet(key);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });
  const data = await offSearch(q, country, page);
  const out = { hits: data.hits ?? [], page: data.page ?? page, page_count: data.page_count ?? 0 };
  if (out.hits.length) ctx.waitUntil(cachePut(key, out, 24 * 3600));
  return json(out);
}

/** Store listing title → the matching Open Food Facts product (for nutrition facts). */
async function nutrition(url: URL, env: Env, ctx: ExecutionContext) {
  const title = (url.searchParams.get('title') ?? '').trim().slice(0, 160);
  const country = (url.searchParams.get('country') ?? '').slice(0, 2);
  if (!title) return json({ product: null });
  const key = `nutrition/v1/${country}/${hashString(title.toLowerCase())}`;
  const hit = await cacheGet(key);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });

  // Search with the title minus sizes/pack counts, then let the reranker pick the candidate that
  // is really the same product (brand + product + variant), not just a similar word match.
  const query = title
    .replace(/\d+(?:[.,]\d+)?\s*(?:x|×)?\s*\d*(?:[.,]\d+)?\s*(ml|l|g|kg|lb|lbs|oz|ct|pk|pack|count)\b/gi, ' ')
    .replace(/[,|()].*$/, '')
    .trim();
  const data = await offSearch(query || title, country, 1, 12);
  const hits: any[] = (data.hits ?? []).filter((h: any) => h.code && h.product_name);
  let product: any = null;
  if (hits.length) {
    const names = hits.map((h) => [Array.isArray(h.brands) ? h.brands[0] : h.brands, h.product_name, h.quantity].filter(Boolean).join(' '));
    const scores = await rerank(env, title, names);
    const bestIdx = scores ? scores.indexOf(Math.max(...scores)) : 0;
    if (!scores || scores[bestIdx] >= 0.2) product = { ...hits[bestIdx], matchScore: scores?.[bestIdx] };
  }
  const out = { product };
  ctx.waitUntil(cachePut(key, out, 7 * 86400));
  return json(out);
}

// ---------- Barcode → product identity (so we search by the real name, not a number) ----------

type LookupResult = { name: string; brand?: string; size?: string; category?: string; isFood: boolean; source: string } | null;

const isbn13 = (code: string) => (/^97[89]\d{10}$/.test(code) ? code : null);

async function fromOpenLibrary(isbn: string): Promise<LookupResult> {
  const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { 'User-Agent': OFF_UA }, redirect: 'follow' });
  if (!res.ok) return null;
  const b: any = await res.json();
  if (!b?.title) return null;
  let author = typeof b.by_statement === 'string' ? b.by_statement.replace(/^by\s+/i, '').replace(/;.*$/, '').replace(/\.\s*$/, '').trim() : '';
  if (!author && b.authors?.[0]?.key) {
    const a = await fetch(`https://openlibrary.org${b.authors[0].key}.json`, { redirect: 'follow' }).then((r) => (r.ok ? r.json<any>() : null)).catch(() => null);
    author = a?.name ?? '';
  }
  return { name: String(b.title), brand: author || undefined, category: 'Books', isFood: false, source: 'openlibrary' };
}

async function fromOpenFoodFacts(code: string): Promise<LookupResult> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,quantity`, { headers: { 'User-Agent': OFF_UA } });
  if (!res.ok) return null;
  const d: any = await res.json();
  const p = d?.product;
  const name = p?.product_name_en || p?.product_name;
  if (d.status !== 1 || !name) return null;
  return { name, brand: String(p.brands ?? '').split(',')[0].trim() || undefined, size: p.quantity || undefined, category: 'Food', isFood: true, source: 'openfoodfacts' };
}

async function fromUpcItemDb(code: string): Promise<LookupResult> {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const d: any = await res.json();
  const it = d?.items?.[0];
  if (!it?.title) return null;
  const category = String(it.category ?? '');
  return { name: String(it.title), brand: it.brand || undefined, size: it.size || undefined, category: category || undefined, isFood: /^food/i.test(category), source: 'upcitemdb' };
}

async function lookup(url: URL, ctx: ExecutionContext) {
  const code = (url.searchParams.get('code') ?? '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(code)) return json({ product: null });
  const key = `lookup/v2/${code}`;
  const hit = await cacheGet(key);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });

  const isbn = isbn13(code);
  let product: LookupResult = null;
  if (isbn) {
    product = (await fromOpenLibrary(isbn).catch(() => null)) ?? (await fromUpcItemDb(code).catch(() => null));
  } else {
    // Open Food Facts is user-edited: great nutrition data, but names are sometimes wrong
    // ("My Bff" for Cheerios). Retail titles from UPCitemdb are more reliable for searching.
    const [off, upc] = await Promise.all([fromOpenFoodFacts(code).catch(() => null), fromUpcItemDb(code).catch(() => null)]);
    product = upc ? { ...upc, isFood: upc.isFood || !!off, size: upc.size ?? off?.size } : off;
  }
  const out = { product };
  ctx.waitUntil(cachePut(key, out, product ? 30 * 86400 : 86400));
  return json(out);
}

// ---------- Nearby stores (OpenStreetMap via Overpass), raced + cached at the edge ----------

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const SHOP_KIND: Record<string, 'supermarket' | 'convenience' | 'specialty' | 'wholesale'> = {
  supermarket: 'supermarket',
  department_store: 'supermarket',
  grocery: 'convenience',
  convenience: 'convenience',
  wholesale: 'wholesale',
  greengrocer: 'specialty',
  butcher: 'specialty',
  bakery: 'specialty',
  health_food: 'specialty',
  deli: 'specialty',
  cheese: 'specialty',
  seafood: 'specialty',
};

const RADIUS_BUCKETS = [2, 5, 10, 15, 25, 50];

const normName = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

/**
 * Store data comes from several sources, so one store can appear twice — e.g. "Save-On-Foods" and
 * "Bridgwater" (its branch name, brand Save-On-Foods) at the same address. Same brand (or same
 * name) within 250 m = one store; keep the most detailed record and fill gaps from the other.
 */
function dedupeStores<T extends { name: string; brand?: string; wikidata?: string; lat: number; lon: number; address?: string; phone?: string; website?: string }>(list: T[]): T[] {
  const richness = (s: T) => Number(!!s.wikidata) * 4 + Number(!!s.brand) * 2 + Number(!!s.phone) + Number(!!s.website) + Number(!!s.address);
  const kept: T[] = [];
  for (const s of [...list].sort((a, b) => richness(b) - richness(a))) {
    const key = normName(s.brand || s.name);
    const dup = kept.find(
      (k) => (normName(k.brand || k.name) === key || normName(k.name) === normName(s.name)) && metres(k, s) <= 250,
    );
    if (!dup) {
      kept.push({ ...s });
      continue;
    }
    dup.wikidata ??= s.wikidata;
    dup.brand ??= s.brand;
    dup.phone ??= s.phone;
    dup.website ??= s.website;
    dup.address ??= s.address;
  }
  // Show the chain name first, with the branch name when the record only had the branch name.
  for (const k of kept) {
    if (k.brand && normName(k.name) !== normName(k.brand) && !normName(k.name).includes(normName(k.brand))) k.name = `${k.brand} (${k.name})`;
  }
  return kept;
}

/**
 * Public Overpass servers are often slow or overloaded. Ask all of them at once and take the
 * first good answer (instead of waiting on each in turn), and cache per ~1 km tile + radius so
 * the next lookup nearby is instant for everyone.
 */
async function stores(url: URL, env: Env, ctx: ExecutionContext) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const want = Number(url.searchParams.get('radius')) || 10;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'bad-location' }, 400);
  const radiusKm = RADIUS_BUCKETS.find((r) => r >= want) ?? 50;
  const tLat = Math.round(lat * 100) / 100;
  const tLon = Math.round(lon * 100) / 100;
  const key = `stores/v3/${tLat}/${tLon}/${radiusKm}`;
  const hit = await cacheGet(key);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });

  // 1) Our own store database (fast, always available).
  if (env.STORES_DB) {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.cos((tLat * Math.PI) / 180));
    const { results } = await env.STORES_DB.prepare(
      'SELECT id, name, brand, wikidata, kind, lat, lon, address, phone, website FROM stores WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4 LIMIT 4000',
    )
      .bind(tLat - dLat, tLat + dLat, tLon - dLon, tLon + dLon)
      .all<any>();
    const toRad = (d: number) => (d * Math.PI) / 180;
    const within = dedupeStores(results ?? [])
      .map((s) => {
        const a = Math.sin(toRad(s.lat - tLat) / 2) ** 2 + Math.cos(toRad(tLat)) * Math.cos(toRad(s.lat)) * Math.sin(toRad(s.lon - tLon) / 2) ** 2;
        return { ...s, km: 12742 * Math.asin(Math.sqrt(a)) };
      })
      .filter((s) => s.km <= radiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, 600)
      .map(({ km: _km, ...s }) => ({ ...s, brand: s.brand ?? undefined, wikidata: s.wikidata ?? undefined, address: s.address ?? undefined, phone: s.phone ?? undefined, website: s.website ?? undefined }));
    if (within.length) {
      const out = { stores: within, center: { lat: tLat, lon: tLon }, radiusKm, source: 'frugal-db' };
      ctx.waitUntil(cachePut(key, out, 24 * 3600));
      return json(out);
    }
  }

  // 2) Fallback for regions not in our database yet: public OpenStreetMap servers.

  const query = `[out:json][timeout:20];nwr["shop"~"^(${Object.keys(SHOP_KIND).join('|')})$"]["name"](around:${radiusKm * 1000},${tLat},${tLon});out center tags 300;`;
  const controllers = OVERPASS.map(() => new AbortController());
  const attempt = (endpoint: string, i: number) =>
    fetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OFF_UA },
      signal: controllers[i].signal,
    }).then(async (res) => {
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) throw new Error(`overpass ${res.status}`);
      return JSON.parse(text);
    });

  let data: any;
  try {
    data = await Promise.race([
      Promise.any(OVERPASS.map(attempt)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
  } catch {
    return json({ error: 'stores-unavailable' }, 503);
  } finally {
    controllers.forEach((c) => c.abort()); // stop the slower servers
  }

  const list = dedupeStores((data.elements ?? [])
    .map((el: any) => {
      const t = el.tags ?? {};
      const la = el.lat ?? el.center?.lat;
      const lo = el.lon ?? el.center?.lon;
      if (la == null || lo == null || !t.name) return null;
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
      return {
        id: `${el.type}/${el.id}`,
        name: t.name,
        brand: t.brand,
        wikidata: t['brand:wikidata'],
        kind: SHOP_KIND[t.shop] ?? 'specialty',
        lat: la,
        lon: lo,
        address: [street, t['addr:city']].filter(Boolean).join(', ') || undefined,
        openingHours: t.opening_hours,
        website: t.website || t['contact:website'],
        phone: t.phone || t['contact:phone'],
      };
    })
    .filter(Boolean));

  const out = { stores: list, center: { lat: tLat, lon: tLon }, radiusKm };
  if (list.length) ctx.waitUntil(cachePut(key, out, 24 * 3600));
  return json(out);
}

// ---------- Photo identification: Gemini if its key works, otherwise Cloudflare Workers AI ----------

const GEMINI_PROMPT =
  'Identify the grocery or household product in this photo. Read the brand and product name from the packaging. ' +
  'Return a short search query (brand + product + key variant, max 6 words) suitable for a shopping search. ' +
  'If there is no identifiable product, set isProduct to false.';

async function identifyWithGemini(env: Env, image: string, mimeType: string): Promise<Identified | null | 'failed'> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: image } }, { text: GEMINI_PROMPT }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 150,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { isProduct: { type: 'BOOLEAN' }, name: { type: 'STRING' }, brand: { type: 'STRING' }, size: { type: 'STRING' }, query: { type: 'STRING' } },
          required: ['isProduct', 'query'],
        },
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) return 'failed';
  const data: any = await res.json();
  try {
    const p = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!p?.isProduct || !p.query) return null;
    return {
      name: String(p.name ?? p.query).slice(0, 120),
      brand: p.brand ? String(p.brand).slice(0, 60) : undefined,
      size: p.size ? String(p.size).slice(0, 30) : undefined,
      query: String(p.query).slice(0, 80),
    };
  } catch {
    return 'failed';
  }
}

async function identify(req: Request, env: Env) {
  const body = (await req.json().catch(() => null)) as { image?: string; mimeType?: string } | null;
  if (!body?.image || body.image.length > 12_000_000) return json({ error: 'bad-image' }, 400);
  const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

  if (env.GEMINI_API_KEY) {
    const g = await identifyWithGemini(env, body.image, mimeType).catch(() => 'failed' as const);
    if (g !== 'failed') return json({ product: g, via: 'gemini' });
  }
  const w = await identifyWithWorkersAi(env, body.image, mimeType);
  return json({ product: w, via: 'workers-ai' });
}

// ---------- Kroger (official public API) ----------

let krogerToken: { value: string; expires: number } | null = null;

async function getKrogerToken(env: Env) {
  if (krogerToken && krogerToken.expires > Date.now() + 60_000) return krogerToken.value;
  const res = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`)}`,
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) throw new Error('kroger-auth');
  const data: any = await res.json();
  krogerToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return krogerToken.value;
}

/** Kroger product IDs are the UPC without its check digit, zero-padded to 13 digits. */
function krogerIdsFor(code: string) {
  const digits = code.replace(/\D/g, '');
  const withoutCheck = digits.slice(0, -1);
  return [...new Set([withoutCheck.padStart(13, '0'), digits.padStart(13, '0')])];
}

async function krogerPrices(url: URL, env: Env) {
  if (!env.KROGER_CLIENT_ID || !env.KROGER_CLIENT_SECRET) return json({ items: [] });
  const upc = url.searchParams.get('upc');
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  // Only exact barcode matches — showing a "similar" product's price would be misleading.
  if (!upc || !isFinite(lat) || !isFinite(lon)) return json({ items: [] });

  const token = await getKrogerToken(env);
  const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const locRes = await fetch(
    `https://api.kroger.com/v1/locations?filter.latLong.near=${lat.toFixed(3)},${lon.toFixed(3)}&filter.radiusInMiles=15&filter.limit=3`,
    { headers: auth },
  );
  if (!locRes.ok) return json({ items: [] });
  const locations: any[] = ((await locRes.json()) as any).data ?? [];

  const items = (
    await Promise.all(
      locations.map(async (loc) => {
        for (const id of krogerIdsFor(upc)) {
          const r = await fetch(`https://api.kroger.com/v1/products/${id}?filter.locationId=${loc.locationId}`, { headers: auth });
          if (!r.ok) continue;
          const p: any = ((await r.json()) as any).data;
          const price = p?.items?.[0]?.price;
          if (!price?.regular) return null;
          return {
            productId: p.productId,
            name: p.description,
            price: price.regular,
            promoPrice: price.promo && price.promo < price.regular ? price.promo : undefined,
            store: {
              id: loc.locationId,
              name: loc.name,
              address: [loc.address?.addressLine1, loc.address?.city].filter(Boolean).join(', '),
              lat: loc.geolocation?.latitude,
              lon: loc.geolocation?.longitude,
            },
          };
        }
        return null;
      }),
    )
  ).filter(Boolean);

  return json({ items });
}
