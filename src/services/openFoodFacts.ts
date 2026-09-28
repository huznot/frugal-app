import { fetchJson, HttpError, memoCache } from './http';
import { API_APP_KEY, API_BASE_URL } from '../config';
import { Nutrition, Product, ProductSummary } from './types';

// Open Food Facts: open database, ODbL licence — commercial use allowed with attribution
// (shown in Settings → Data sources). Rate limits: be polite, cache, identify via User-Agent.
const OFF = 'https://world.openfoodfacts.org';
const SEARCH = 'https://search.openfoodfacts.org/search';

const COUNTRY_TAGS: Record<string, string> = {
  CA: 'en:canada',
  US: 'en:united-states',
  GB: 'en:united-kingdom',
  IE: 'en:ireland',
  AU: 'en:australia',
  NZ: 'en:new-zealand',
  FR: 'en:france',
  DE: 'en:germany',
  ES: 'en:spain',
  IT: 'en:italy',
  MX: 'en:mexico',
  IN: 'en:india',
};

const productCache = memoCache<Product | null>(30 * 60 * 1000);
const searchCache = memoCache<SearchPage>(10 * 60 * 1000);

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
const cleanTag = (t: string) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
const first = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : undefined);

function pickNutrition(n: any, suffix: '_100g' | '_serving'): Nutrition {
  const salt = num(n[`salt${suffix}`]);
  return {
    energyKcal: num(n[`energy-kcal${suffix}`]) ?? (num(n[`energy${suffix}`]) ? n[`energy${suffix}`] / 4.184 : undefined),
    fat: num(n[`fat${suffix}`]),
    saturatedFat: num(n[`saturated-fat${suffix}`]),
    carbs: num(n[`carbohydrates${suffix}`]),
    sugars: num(n[`sugars${suffix}`]),
    fiber: num(n[`fiber${suffix}`]),
    protein: num(n[`proteins${suffix}`]),
    salt,
  };
}

const hasAny = (n: Nutrition) => Object.values(n).some((v) => v != null);

const grade = (g: unknown) => (typeof g === 'string' && /^[a-e]$/.test(g) ? g : undefined);

export async function getProduct(code: string): Promise<Product | null> {
  const cached = productCache.get(code);
  if (cached !== undefined) return cached;
  const fields = [
    'code', 'product_name', 'product_name_en', 'generic_name', 'brands', 'quantity',
    'image_front_url', 'image_url', 'nutriscore_grade', 'nova_group', 'allergens_tags',
    'traces_tags', 'labels_tags', 'ingredients_text', 'ingredients_text_en', 'serving_size', 'nutriments',
  ].join(',');
  try {
    const data = await fetchJson(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
    if (data.status !== 1 || !data.product) {
      productCache.set(code, null);
      return null;
    }
    const p = data.product;
    const n = p.nutriments ?? {};
    const serving = pickNutrition(n, '_serving');
    const product: Product = {
      code: p.code ?? code,
      name: p.product_name_en || p.product_name || p.generic_name || 'Unnamed product',
      brand: first(p.brands)?.split(',')[0]?.trim(),
      quantity: p.quantity || undefined,
      imageUrl: p.image_front_url || p.image_url || undefined,
      nutriscore: grade(p.nutriscore_grade),
      nova: num(p.nova_group),
      allergens: (p.allergens_tags ?? []).map(cleanTag),
      traces: (p.traces_tags ?? []).map(cleanTag),
      labels: (p.labels_tags ?? []).filter((t: string) => t.startsWith('en:')).map(cleanTag).slice(0, 6),
      ingredients: p.ingredients_text_en || p.ingredients_text || undefined,
      servingSize: p.serving_size || undefined,
      nutrition100g: pickNutrition(n, '_100g'),
      nutritionServing: hasAny(serving) ? serving : undefined,
    };
    productCache.set(code, product);
    return product;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      productCache.set(code, null);
      return null;
    }
    throw e;
  }
}

export type SearchPage = { items: ProductSummary[]; page: number; pageCount: number };

// search-a-licious uses Lucene syntax; strip operators so user text can't break the query.
const sanitize = (q: string) => q.replace(/[:"()[\]{}\\/^~*?!+\-&|<>=]/g, ' ').replace(/\s+/g, ' ').trim();

export async function searchProducts(query: string, countryCode?: string, page = 1): Promise<SearchPage> {
  const q = sanitize(query);
  if (!q) return { items: [], page: 1, pageCount: 0 };
  const key = `${q}|${countryCode}|${page}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const toSummary = (h: any): ProductSummary => ({
    code: h.code,
    name: h.product_name,
    brand: first(h.brands)?.split(',')[0]?.trim(),
    quantity: h.quantity || undefined,
    imageUrl: h.image_front_small_url || h.image_front_url || undefined,
    nutriscore: grade(h.nutriscore_grade),
  });

  // Through our server when available: cached at the edge, and it works from browsers
  // (Open Food Facts' search service doesn't allow direct browser requests).
  if (API_BASE_URL) {
    try {
      const params = new URLSearchParams({ q, country: countryCode ?? '', page: String(page) });
      const data = await fetchJson(`${API_BASE_URL}/products?${params}`, { headers: { 'X-App-Key': API_APP_KEY } });
      const result: SearchPage = {
        items: (data.hits ?? []).filter((h: any) => h.code && h.product_name).map(toSummary),
        page: data.page ?? page,
        pageCount: data.page_count ?? 0,
      };
      searchCache.set(key, result);
      return result;
    } catch {
      // fall through to a direct request
    }
  }

  const run = async (country?: string) => {
    const tag = country && COUNTRY_TAGS[country];
    const params = new URLSearchParams({
      q: tag ? `${q} countries_tags:"${tag}"` : q,
      page: String(page),
      page_size: '24',
      langs: 'en',
      fields: 'code,product_name,brands,quantity,nutriscore_grade,image_front_small_url,image_front_url',
    });
    const data = await fetchJson(`${SEARCH}?${params}`);
    const items: ProductSummary[] = (data.hits ?? []).filter((h: any) => h.code && h.product_name).map(toSummary);
    return { items, page: data.page ?? page, pageCount: data.page_count ?? 0 } as SearchPage;
  };

  // Prefer products sold in the user's country, fall back to worldwide.
  let result = await run(countryCode);
  if (result.items.length === 0 && countryCode && page === 1) result = await run();
  searchCache.set(key, result);
  return result;
}

export type BarcodeIdentity = { name: string; brand?: string; size?: string; category?: string; isFood: boolean; source: string };
const identityCache = memoCache<BarcodeIdentity | null>(60 * 60 * 1000);

/**
 * What a barcode actually is — books via Open Library (ISBN), food via Open Food Facts, everything
 * else via UPCitemdb — so we search stores by the real product name. Searching the raw number
 * returns unrelated listings.
 */
export async function lookupBarcode(code: string): Promise<BarcodeIdentity | null> {
  const cached = identityCache.get(code);
  if (cached !== undefined) return cached;
  if (!API_BASE_URL) return null;
  const data = await fetchJson(`${API_BASE_URL}/lookup?code=${encodeURIComponent(code)}`, { headers: { 'X-App-Key': API_APP_KEY }, timeoutMs: 12000 });
  const found: BarcodeIdentity | null = data.product ?? null;
  identityCache.set(code, found);
  return found;
}

const nutritionCache = memoCache<ProductSummary | null>(60 * 60 * 1000);

/**
 * The Open Food Facts product that matches a store listing title, e.g.
 * "Kraft Dinner Original Macaroni and Cheese, 12 x 200-g" → Kraft Dinner (200 g).
 * The server searches Open Food Facts and uses AI to pick the candidate that is really the same
 * product. Returns null when nothing matches well enough.
 */
export async function findProductForTitle(title: string, countryCode?: string): Promise<ProductSummary | null> {
  const key = `${title}|${countryCode}`;
  const cached = nutritionCache.get(key);
  if (cached !== undefined) return cached;
  if (!API_BASE_URL) {
    const res = await searchProducts(title.replace(/[,(|].*$/, ''), countryCode);
    return res.items[0] ?? null;
  }
  const params = new URLSearchParams({ title, country: countryCode ?? '' });
  const data = await fetchJson(`${API_BASE_URL}/nutrition?${params}`, { headers: { 'X-App-Key': API_APP_KEY }, timeoutMs: 15000 });
  const h = data.product;
  const found: ProductSummary | null = h
    ? {
        code: h.code,
        name: h.product_name,
        brand: first(h.brands)?.split(',')[0]?.trim(),
        quantity: h.quantity || undefined,
        imageUrl: h.image_front_small_url || h.image_front_url || undefined,
        nutriscore: grade(h.nutriscore_grade),
      }
    : null;
  nutritionCache.set(key, found);
  return found;
}

export const offProductUrl = (code: string) => `${OFF}/product/${encodeURIComponent(code)}`;
export const offAddProductUrl = (code: string) => `${OFF}/cgi/product.pl?type=add&code=${encodeURIComponent(code)}`;
