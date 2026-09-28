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
import { estimateSizes, identifyWithWorkersAi, judge, rerank, rewriteQuery, Identified } from './ai';

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
const RANK_VERSION = 11;

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
          .map((l) => Promise.race([l.promise, new Promise<ShopItem[]>((r) => setTimeout(() => r([]), 20000))]).catch(() => [] as ShopItem[])),
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

async function groceryQuery(env: Env, q: string, ctx: ExecutionContext): Promise<string> {
  const key = `rewrite/v1/${encodeURIComponent(q.toLowerCase())}`;
  const hit = await cacheGet(key);
  if (hit?.q) return hit.q;
  const rewritten = (await rewriteQuery(env, q)) ?? q;
  ctx.waitUntil(cachePut(key, { q: rewritten }, 30 * 86400));
  return rewritten;
}

async function shopping(url: URL, env: Env, ctx: ExecutionContext) {
  const q = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const gl = (url.searchParams.get('gl') ?? 'ca').toLowerCase().slice(0, 2);
  if (!q) return json({ items: [], judged: true });
  const location = await canonicalLocation((url.searchParams.get('location') ?? '').slice(0, 100), gl, ctx);

  // Shared cache across all users: the same query in the same city is only paid for once per 6 h.
  const cacheKey = `shopping/r${RANK_VERSION}/${gl}/${hashString(location.toLowerCase())}/${encodeURIComponent(q.toLowerCase())}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });

  // Turn what the shopper typed into the search that finds it at grocery stores ("apple" →
  // "fresh apples produce", not iPhones). Cached for 30 days per search term.
  const searchQ = await groceryQuery(env, q, ctx);
  const providers: { name: string; run: () => Promise<Raw> }[] = [];
  if (env.BRIGHTDATA_API_KEY) providers.push({ name: 'brightdata', run: () => fromBrightData({ q: searchQ, gl, location }, env) });
  if (env.SERPAPI_KEY) providers.push({ name: 'serpapi', run: () => fromSerpStyle({ q: searchQ, gl, location }, 'serpapi', env.SERPAPI_KEY!) });
  if (env.SEARCHAPI_KEY) providers.push({ name: 'searchapi', run: () => fromSerpStyle({ q: searchQ, gl, location }, 'searchapi', env.SEARCHAPI_KEY!) });
  if (!providers.length) return json({ error: 'shopping-disabled' }, 503);

  const found = await raceProviders(providers);
  if (!found) return json({ error: 'shopping-failed' }, 502);
  let items = found.items;

  // Inline (base64) product images would make the response ~1 MB. Keep them all in ONE cache
  // entry (Cloudflare limits outgoing calls per request) and give the app short URLs instead.
  const origin = url.origin;
  const bundleId = hashString(cacheKey);
  const bundle: Record<string, [string, string]> = {};
  for (const item of items) {
    const m = item.thumbnail?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) continue;
    const imgId = hashString(item.id + item.seller + item.title);
    bundle[imgId] = [m[1], m[2]];
    item.thumbnail = `${origin}/img/${bundleId}/${imgId}`;
  }
  if (Object.keys(bundle).length) ctx.waitUntil(cachePut(`imgs/${bundleId}`, bundle, 24 * 3600));

  // Step 1 (fast, ~0.5 s): an AI reranker scores every title against the search and drops
  // unrelated listings (iPhones for "apple"). Scores give a provisional order.
  {
    const scores = await rerank(env, searchQ, items.map((i) => i.title));
    if (scores) {
      items.forEach((it, i) => (it.score = Math.round(scores[i] * 1000) / 1000));
      const top = Math.max(...scores);
      items = items.filter((i) => (i.score ?? 0) >= Math.min(0.02, top * 0.1));
    }
  }
  items = rank(items).slice(0, 40);
  const first = { items, judged: false, meaning: null as string | null, isFood: null as boolean | null, unit: null as Unit | null, source: found.source };

  // Step 2 runs as a separate request (/refine) so it gets its own budget of outgoing calls:
  // the AI decides what the shopper meant, fills missing sizes, and the refined ranking replaces
  // this result in the cache. The app picks it up a few seconds later.
  ctx.waitUntil(
    (async () => {
      await cachePut(cacheKey, first, CACHE_SECONDS);
      // Merge in results from a slower provider that was still running, so the refined list has
      // the best of both (e.g. Bright Data's local produce listings arriving after SerpApi's).
      const extra = (await found.later).filter((e) => !items.some((i) => i.seller === e.seller && i.title === e.title && i.price === e.price));
      if (extra.length) {
        const scores = await rerank(env, searchQ, extra.map((i) => i.title));
        const top = Math.max(0, ...items.map((i) => i.score ?? 0));
        const kept = extra.filter((e, idx) => {
          e.score = scores ? Math.round(scores[idx] * 1000) / 1000 : undefined;
          return !scores || (e.score ?? 0) >= Math.min(0.02, top * 0.1);
        });
        // Their inline images go into a second bundle, same as the first batch.
        const extraBundle: Record<string, [string, string]> = {};
        for (const e of kept) {
          const m = e.thumbnail?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
          if (!m) continue;
          const imgId = hashString(e.id + e.seller + e.title);
          extraBundle[imgId] = [m[1], m[2]];
          e.thumbnail = `${origin}/img/${bundleId}x/${imgId}`;
        }
        if (Object.keys(extraBundle).length) await cachePut(`imgs/${bundleId}x`, extraBundle, 24 * 3600);
        const merged = rank([...items, ...kept]).slice(0, 50);
        await cachePut(cacheKey, { ...first, items: merged, source: `${found.source}+more` }, CACHE_SECONDS);
      }
      if (!items.length && !extra.length) return;
      const params = new URLSearchParams({ key: cacheKey, q, gl });
      const call = env.SELF ? env.SELF.fetch.bind(env.SELF) : fetch;
      await call(`${origin}/refine?${params}`, { headers: { 'X-App-Key': env.APP_KEY ?? '' } }).catch(() => {});
    })(),
  );

  return json(first, 200, { 'X-Source': found.source });
}

async function refine(url: URL, env: Env) {
  const cacheKey = url.searchParams.get('key') ?? '';
  const q = url.searchParams.get('q') ?? '';
  const gl = url.searchParams.get('gl') ?? 'ca';
  if (!cacheKey.startsWith('shopping/') || !q) return json({ ok: false }, 400);
  const first = await cacheGet(cacheKey);
  if (!first || first.judged) return json({ ok: true, skipped: true });
  const items: ShopItem[] = first.items;

  const candidates = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25);
  const verdict = await judge(env, q, candidates.map((i) => i.title));
  if (!verdict) {
    await cachePut(cacheKey, { ...first, judged: true }, CACHE_SECONDS);
    return json({ ok: true, judged: false });
  }
  const refined = items.map((i) => ({ ...i }));
  const byTitle = new Map(candidates.map((c, idx) => [c.id + c.title, idx]));
  for (const it of refined) {
    const idx = byTitle.get(it.id + it.title);
    it.match = idx == null ? 'related' : verdict.exact.has(idx) ? 'exact' : verdict.variant.has(idx) ? 'variant' : 'related';
  }
  // Listings that don't state their size can't be compared on value. Fill the size from the
  // product catalog (Open Food Facts) when the matching product there has one…
  if (verdict.isFood) await fillSizesFromCatalog(env, refined, gl.toUpperCase(), verdict.unit);
  // …and otherwise let the AI estimate the standard pack / typical item weight (marked "est.").
  const unsized = refined.filter((i) => !i.size && i.match === 'exact').slice(0, 20);
  if (unsized.length && verdict.unit) {
    const guesses = await estimateSizes(env, verdict.meaning, verdict.unit, unsized.map((i) => i.title));
    guesses?.forEach((g, idx) => {
      if (!g) return;
      const it = unsized[idx];
      let size = parseSize(g);
      const n = parseFloat(g);
      if (!size && verdict.unit === 'each' && n > 0) size = { amount: n, unit: 'each', label: `${n} ct` };
      if (size && size.unit === verdict.unit) {
        it.size = { ...size, estimated: true };
        it.unitPrice = unitPriceOf(it.price, it.size);
      }
    });
  }
  await cachePut(
    cacheKey,
    { items: rank(refined, verdict.unit), judged: true, meaning: verdict.meaning, isFood: verdict.isFood, unit: verdict.unit ?? null, source: first.source },
    CACHE_SECONDS,
  );
  return json({ ok: true, judged: true });
}

/** Sizes for listings whose titles omit them ("Great Value White Eggs"), from the matching catalog product. */
async function fillSizesFromCatalog(env: Env, items: ShopItem[], country: string, unit?: Unit) {
  const missing = items.filter((i) => !i.size && i.match === 'exact').slice(0, 6); // ≤ 3 calls each; stays within limits
  await Promise.all(
    missing.map(async (item) => {
      try {
        const data: any = await Promise.race([offSearch(item.title, country, 1, 6), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
        const hits: any[] = (data.hits ?? []).filter((h: any) => h.product_name && h.quantity);
        if (!hits.length) return;
        const names = hits.map((h) => [Array.isArray(h.brands) ? h.brands[0] : h.brands, h.product_name].filter(Boolean).join(' '));
        const scores = await rerank(env, item.title, names);
        if (!scores) return;
        const best = scores.indexOf(Math.max(...scores));
        if (scores[best] < 0.6) return; // only when the catalog product is clearly the same one
        const q = String(hits[best].quantity);
        let size = parseSize(q);
        const n = parseFloat(q);
        if (!size && unit === 'each' && n > 0 && /^\s*\d+(\s*(eggs?|pcs|pieces|ct|count|units?))?\s*$/i.test(q)) size = { amount: n, unit: 'each', label: `${n} ct` };
        if (size && (!unit || size.unit === unit)) {
          item.size = { ...size, label: `${size.label}*` }; // * = size from catalog, not the listing
          item.unitPrice = unitPriceOf(item.price, item.size);
        }
      } catch {
        // leave the size unknown
      }
    }),
  );
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
