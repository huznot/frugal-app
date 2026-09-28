// Turns raw Google Shopping results (from Bright Data / SerpApi / SearchAPI) into clean,
// location-aware listings ranked by what the shopper meant and by value.
// Relevance is decided by AI (see ai.ts) — this file only parses and ranks. Pure functions.

export type Unit = 'ml' | 'g' | 'each';
export type Match = 'exact' | 'variant' | 'related';

export type ShopItem = {
  id: string;
  title: string;
  price: number;
  oldPrice?: number;
  seller: string;
  thumbnail?: string;
  link?: string;
  rating?: number;
  reviews?: number;
  delivery?: string;
  tag?: string; // e.g. "6% OFF", "LOW PRICE"
  nearby: boolean; // Google reports the item in stock at a store near the searched location
  nearbyKm?: number; // Google's distance to that store ("Nearby, 4 km")
  score?: number; // AI relevance score 0..1 (reranker)
  match?: Match; // AI judgement: the product the shopper meant, another kind of it, or just related
  size?: { amount: number; unit: Unit; label: string; estimated?: boolean }; // total size, e.g. 4000 ml "4 L"
  unitPrice?: number; // price per 100 ml / 100 g / 1 each
  best?: boolean; // best value among matching items you can buy nearby
};

export const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    // "$1,299.00" -> 1299 ; "5,49 €" -> 5.49
    const n = parseFloat(v.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
};

// ---- sizes & unit prices -------------------------------------------------------------

const UNIT: Record<string, [Unit, number]> = {
  ml: ['ml', 1],
  l: ['ml', 1000],
  litre: ['ml', 1000],
  liter: ['ml', 1000],
  litres: ['ml', 1000],
  liters: ['ml', 1000],
  floz: ['ml', 29.5735],
  g: ['g', 1],
  gr: ['g', 1],
  kg: ['g', 1000],
  lb: ['g', 453.592],
  lbs: ['g', 453.592],
  oz: ['g', 28.3495],
};

const unitKey = (u: string) => u.toLowerCase().replace(/[^a-z]/g, '');

const fmtAmount = (amount: number, unit: Unit) => {
  if (unit === 'each') return `${amount} ct`;
  if (unit === 'ml') return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} L` : `${Math.round(amount)} mL`;
  return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} kg` : `${Math.round(amount)} g`;
};

/** Reads the total size from a product title: "4L", "2 x 1 L", "12 x 200-g", "Dozen eggs", "6-pack". */
export function parseSize(title: string): ShopItem['size'] {
  const t = title.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const NUM = '(\\d+(?:\\.\\d+)?)';
  const U = '(fl\\.? ?oz|ml|litres?|liters?|l|kg|g|gr|lbs?|oz)(?![a-z])';

  // multipack: "12 x 355 ml", "4x1l", "12 x 200-g"
  let m = t.match(new RegExp(`(\\d+)\\s*[x×]\\s*${NUM}\\s*-?\\s*${U}`));
  if (m) {
    const [u, f] = UNIT[unitKey(m[3])] ?? [];
    if (u && +m[1] > 0) return { amount: +m[1] * +m[2] * f, unit: u, label: `${m[1]} × ${+m[2]} ${m[3].replace('-', '')}` };
  }
  // single size ("4 l", "1.36 kg", "500g"), optionally with a pack count ("6-pack")
  m = t.match(new RegExp(`${NUM}\\s*-?\\s*${U}`));
  if (m) {
    const [u, f] = UNIT[unitKey(m[2])] ?? [];
    if (u) {
      const one = +m[1] * f;
      const packs = t.match(/(\d+)\s*-?\s*(?:pack|pk)\b/);
      const n = packs && +packs[1] > 1 && +packs[1] <= 48 ? +packs[1] : 1;
      return { amount: one * n, unit: u, label: n > 1 ? `${n} × ${fmtAmount(one, u)}` : fmtAmount(one, u) };
    }
  }
  // priced by weight: "Bananas, per lb", "$4.39/kg"
  m = t.match(/(?:per|\/)\s*(lb|kg|100\s*g)\b/);
  if (m) {
    const unitW = m[1].replace(/\s/g, '');
    const grams = unitW === 'lb' ? 453.592 : unitW === 'kg' ? 1000 : 100;
    return { amount: grams, unit: 'g', label: `per ${unitW === '100g' ? '100 g' : unitW}` };
  }
  // counted items: "dozen", "12 eggs", "18 ct", "6-pack"
  if (/\bdozen\b/.test(t)) return { amount: 12, unit: 'each', label: '12 ct' };
  m = t.match(/(\d+)\s*-?\s*(?:pack|pk|ct|count|eggs|rolls|pieces|pcs|bags|cans|bottles)\b/);
  if (m && +m[1] > 0 && +m[1] <= 200) return { amount: +m[1], unit: 'each', label: `${m[1]} ct` };
  return undefined;
}

/** Price per 100 mL / 100 g, or per item. */
export const unitPriceOf = (price: number, size?: ShopItem['size']) =>
  size && size.amount > 0 ? (size.unit === 'each' ? price / size.amount : (price / size.amount) * 100) : undefined;

// ---- normalisation -------------------------------------------------------------------

// Resale/import marketplaces list collectibles and overseas imports, not grocery prices.
const MARKETPLACES = /\b(ebay|aliexpress|etsy|temu|wish\.com|snapklik|desertcart|ubuy|shein|poshmark|mercari)\b/i;

function nearbyInfo(r: any, fromNearbyGroup: boolean): { nearby: boolean; km?: number } {
  // SerpApi puts "Nearby, 4 km" in extensions; Bright Data uses a `distance` field.
  const ext = [...(Array.isArray(r.extensions) ? r.extensions : []), r.distance, r.tag, r.delivery].filter(Boolean).join(' ; ');
  const m = ext.match(/nearby,\s*([\d.]+)\s*(km|mi)/i);
  const km = m ? parseFloat(m[1]) * (m[2].toLowerCase() === 'mi' ? 1.609 : 1) : undefined;
  return { nearby: fromNearbyGroup || /nearby/i.test(ext) || !!r.in_store, km };
}

export function toItem(r: any, i: number, fromNearbyGroup = false): ShopItem | null {
  const price = toNumber(r.extracted_price) ?? toNumber(r.price);
  const seller = r.seller ?? r.source ?? r.merchant ?? r.shop;
  if (price == null || price <= 0 || !seller || !r.title) return null;
  if (MARKETPLACES.test(String(seller))) return null;
  const title = String(r.title);

  // Prefer a normal image URL. Bright Data often inlines images as base64 instead; those are
  // turned into short cached URLs by the worker before reaching the app.
  let thumbnail: string | undefined = [r.thumbnail, r.image_url, r.image].find((u) => typeof u === 'string' && /^https?:/.test(u));
  if (!thumbnail) {
    const b64 = [r.image_base64, r.image].find((u) => typeof u === 'string' && u.length > 100 && u.length < 250000);
    if (b64) thumbnail = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
  }

  const { nearby, km } = nearbyInfo(r, fromNearbyGroup);
  const oldPrice = toNumber(r.extracted_old_price) ?? toNumber(r.old_price);
  const size = parseSize(title);
  return {
    id: String(r.product_id ?? r.cid ?? r.position ?? r.rank ?? i),
    title,
    price,
    oldPrice: oldPrice && oldPrice > price ? oldPrice : undefined,
    seller: String(seller),
    thumbnail,
    link: r.product_link ?? r.link ?? r.offers_link,
    rating: toNumber(r.rating),
    reviews: toNumber(r.reviews ?? r.reviews_cnt),
    delivery: typeof (r.delivery ?? r.shipping) === 'string' ? r.delivery ?? r.shipping : undefined,
    tag: typeof r.tag === 'string' ? r.tag : undefined,
    nearby,
    nearbyKm: km,
    size,
    unitPrice: unitPriceOf(price, size),
  };
}

/** Pulls every result list out of a SerpApi/SearchAPI/Bright Data response. */
export function extractResults(data: any): { r: any; nearbyGroup: boolean }[] {
  const out: { r: any; nearbyGroup: boolean }[] = [];
  for (const r of data?.shopping_results ?? []) out.push({ r, nearbyGroup: false });
  for (const r of data?.inline_shopping_results ?? []) out.push({ r, nearbyGroup: false });
  for (const group of data?.categorized_shopping_results ?? []) {
    const nearbyGroup = /nearby|in store/i.test(String(group.title ?? ''));
    for (const r of group.shopping_results ?? []) out.push({ r, nearbyGroup });
  }
  for (const r of data?.shopping ?? []) out.push({ r, nearbyGroup: false }); // Bright Data
  for (const r of data?.product_listing_ads ?? []) out.push({ r, nearbyGroup: false });
  return out;
}

/** Normalise + dedupe (keeps the richer duplicate: the one that knows it's nearby). */
export function normalize(raw: { r: any; nearbyGroup: boolean }[]): ShopItem[] {
  const byKey = new Map<string, ShopItem>();
  raw.forEach(({ r, nearbyGroup }, i) => {
    const item = toItem(r, i, nearbyGroup);
    if (!item) return;
    const key = `${item.seller.toLowerCase()}|${item.title.toLowerCase().slice(0, 60)}|${item.price}`;
    const prev = byKey.get(key);
    if (!prev || (item.nearby && !prev.nearby) || (item.nearbyKm != null && prev.nearbyKm == null)) byKey.set(key, item);
  });
  return [...byKey.values()];
}

/**
 * Some stores (e.g. Voilà) put their warehouse case pack in the title — "Milk 2% 9X2L" at $6.65 is
 * one 2 L jug. Read literally it looks absurdly cheap. Statistical check, not a store list: if a
 * multipack's unit price is under a third of the typical unit price, count it as a single unit.
 */
export function fixCasePacks(items: ShopItem[]): ShopItem[] {
  const singles = items.filter((i) => i.unitPrice != null && i.size && !/×/.test(i.size.label));
  const byUnit = new Map<Unit, number[]>();
  for (const i of singles) byUnit.set(i.size!.unit, [...(byUnit.get(i.size!.unit) ?? []), i.unitPrice!]);
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const i of items) {
    if (!i.size || !/×/.test(i.size.label) || i.unitPrice == null) continue;
    const typical = byUnit.get(i.size.unit);
    if (!typical || typical.length < 3 || i.unitPrice >= median(typical) / 3) continue;
    const count = parseFloat(i.size.label);
    if (!(count > 1)) continue;
    const single = i.size.amount / count;
    i.size = { amount: single, unit: i.size.unit, label: fmtAmount(single, i.size.unit) };
    i.unitPrice = unitPriceOf(i.price, i.size);
  }
  return items;
}

const MATCH_RANK: Record<Match, number> = { exact: 0, variant: 1, related: 2 };

/**
 * Deterministic ranking: same input → same order.
 *   1. the product the shopper meant (AI "exact") before other kinds — or, before the AI judge
 *      has run, the reranker's relevance tier
 *   2. best value (price per 100 mL / 100 g / item, in the unit the AI chose)
 *   3. in stock nearby → price → name (stable tie-breaks)
 * Marks the best-value listing of the product the shopper meant as `best`.
 */
export function rank(items: ShopItem[], unit?: Unit): ShopItem[] {
  fixCasePacks(items);
  const mainUnit: Unit | undefined =
    unit ??
    ([...items.reduce((m, i) => (i.size ? m.set(i.size.unit, (m.get(i.size.unit) ?? 0) + 1) : m), new Map<Unit, number>())].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as Unit | undefined);
  const comparable = (i: ShopItem) => i.unitPrice != null && i.size?.unit === mainUnit;
  const valueCmp = (a: ShopItem, b: ShopItem) =>
    comparable(a) && comparable(b) ? a.unitPrice! - b.unitPrice! : comparable(a) ? -1 : comparable(b) ? 1 : 0;

  const judged = items.some((i) => i.match);
  const topScore = Math.max(0, ...items.map((i) => i.score ?? 0));
  const group = (i: ShopItem) =>
    judged ? MATCH_RANK[i.match ?? 'related'] : topScore ? ((i.score ?? 0) >= topScore * 0.5 ? 0 : 1) : 0;

  const ranked = [...items].sort(
    (a, b) =>
      group(a) - group(b) ||
      valueCmp(a, b) ||
      Number(b.nearby) - Number(a.nearby) ||
      a.price - b.price ||
      a.seller.localeCompare(b.seller) ||
      a.title.localeCompare(b.title),
  );

  // "Best" only once the AI has confirmed which listings are the product the shopper meant.
  ranked.forEach((i) => delete i.best);
  const best = judged ? ranked.find((i) => i.match === 'exact' && comparable(i)) : undefined;
  if (best) best.best = true;
  return ranked;
}
