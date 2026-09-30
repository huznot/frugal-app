import { API_APP_KEY, API_BASE_URL } from '../config';
import { fetchJson, memoCache } from './http';
import { currencyFor } from './openPrices';
import { getNearbyStores } from './stores';
import { wikidataFor } from './logos';
import { Offer, Store, UserLocation } from './types';

// Store prices for any product, from Google Shopping (through our proxy so the API key
// never ships in the app). The proxy caches results for 6 h, and so do we in memory.

export const shoppingEnabled = !!API_BASE_URL;

export type OfferResult = { offers: Offer[]; judged: boolean; more: boolean; meaning?: string; isFood?: boolean };

/**
 * How long to wait between check-ins while the server finishes a search (~30 s in all): first the
 * AI ranking (best value, cheapest) after a few seconds, then listings from the big chains near you.
 */
export const POLL_DELAYS = [2000, 2000, 2500, 2500, 3000, 3000, 3500, 4000, 4000, 5000];

/** Nothing more is coming for this search. */
export const settled = (r: OfferResult) => r.judged && !r.more;

const cache = memoCache<OfferResult>(15 * 60 * 1000);

const COUNTRY_NAMES: Record<string, string> = {
  CA: 'Canada',
  US: 'United States',
  GB: 'United Kingdom',
  AU: 'Australia',
  IE: 'Ireland',
  NZ: 'New Zealand',
};

/** "Voila by Sobeys" → "Sobeys", "Walmart.ca" → "Walmart", "DoorDash - No Frills" → "No Frills". */
export function cleanSeller(raw: string): string {
  return raw
    .replace(/^(voil[aà]|doordash|instacart|uber\s*eats|pc express)\s*(by|-|–|:)?\s*/i, '')
    .replace(/\s*(-|–|\|)\s*(instacart|doordash|delivery).*$/i, '')
    .replace(/\.(ca|com|co\.uk)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function nearestBranch(seller: string, stores: Store[]): Store | undefined {
  const ids = new Set(wikidataFor(seller));
  const n = norm(seller);
  // stores are already sorted nearest-first
  return stores.find((s) => {
    if (s.wikidata && ids.has(s.wikidata)) return true;
    const sn = norm(s.brand ?? s.name);
    return sn === n || (n.length > 3 && (sn.startsWith(n) || n.startsWith(sn)));
  });
}

/**
 * Store prices for a search. The server answers fast with a first ranking, then refines it with
 * AI a few seconds later — pass `fresh` to skip the local cache and pick up the refined version.
 */
type Ranked = Offer & { unit?: 'ml' | 'g' | 'each' };

/**
 * Final order shown to the user, within each group (what you meant → other kinds → related):
 * stores near you first, then online-only sellers, then chains with no branch near you; within
 * each, best value (price per 100 mL / 100 g / item), then cheapest. "Best value" is the lowest
 * price per amount for what the shopper meant — from a nearby store when possible.
 */
function arrange(list: Ranked[], judged: boolean, unit?: 'ml' | 'g' | 'each'): Offer[] {
  const counts = new Map<string, number>();
  for (const o of list) if (o.unit && o.unitPrice != null) counts.set(o.unit, (counts.get(o.unit) ?? 0) + 1);
  const mainUnit = unit ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Sanity-check value data against what's typical for this search (statistics, not rules):
  //  • a price far below typical is a placeholder/error ("50 oranges for $0.01") → drop the listing
  //  • an estimated size that makes an item far pricier than typical is a bad guess (a whole case
  //    guessed as "1 banana") → drop the estimate, keep the listing
  const typical = list.filter((o) => o.unitPrice != null && o.unit === mainUnit && !o.sizeEstimated).map((o) => o.unitPrice!);
  const pool = typical.length >= 3 ? typical : list.filter((o) => o.unitPrice != null && o.unit === mainUnit).map((o) => o.unitPrice!);
  const median = pool.length ? [...pool].sort((a, b) => a - b)[Math.floor(pool.length / 2)] : undefined;
  const cleaned = list.filter((o) => !(median && o.unitPrice != null && o.unit === mainUnit && o.unitPrice < median / 6));
  for (const o of cleaned) {
    if (median && o.sizeEstimated && o.unitPrice != null && o.unitPrice > median * 6) {
      o.unitPrice = undefined;
      o.unitLabel = undefined;
      o.sizeLabel = undefined;
      o.sizeEstimated = false;
      o.unit = undefined;
    }
  }

  const comparable = (o: Ranked) => o.unitPrice != null && o.unit === mainUnit;
  // Where you can get it: a store near you first, then online.
  const channel = (o: Offer) => (o.nearbyStore ? 0 : 1);
  const group = (o: Offer) => (!judged ? 0 : o.match === 'exact' ? 0 : o.match === 'variant' ? 1 : 2);
  const valueCmp = (a: Ranked, b: Ranked) => {
    const ca = comparable(a);
    const cb = comparable(b);
    if (ca && cb) return a.unitPrice! - b.unitPrice!;
    if (ca !== cb) return ca ? -1 : 1;
    return 0;
  };

  // What you meant → where you can buy it (nearby stores first) → best value → cheapest.
  const sorted = [...cleaned].sort((a, b) => group(a) - group(b) || channel(a) - channel(b) || valueCmp(a, b) || a.price - b.price);

  sorted.forEach((o) => {
    o.best = false;
    o.cheapest = false;
  });
  if (judged) {
    const meant = sorted.filter((o) => o.match === 'exact');
    const valued = meant.filter(comparable);
    // Best value (lowest price per amount) from stores near you when they have one, else anywhere.
    // AI size estimates count (only standard packs are estimated) and stay marked "est.".
    // Nothing comparable per amount (e.g. a specific book)? Then it's simply the lowest price.
    const best =
      valued.find((o) => o.nearbyStore) ??
      valued[0] ??
      (meant.length && !counts.size ? [...meant].sort((a, b) => a.price - b.price)[0] : undefined);
    if (best) best.best = true;
    // Cheapest: the lowest price you'd pay for what you meant, near you when possible.
    const byPrice = (list: Offer[]) => [...list].sort((a, b) => a.price - b.price)[0];
    const cheapest = byPrice(meant.filter((o) => o.nearbyStore)) ?? byPrice(meant);
    if (cheapest) cheapest.cheapest = true;
  }
  return sorted.map(({ unit: _u, ...o }) => o);
}

export async function searchOffers(query: string, location: UserLocation | undefined, radiusKm = 25, fresh = false): Promise<OfferResult> {
  if (!shoppingEnabled) throw new Error('shopping-disabled');
  const q = query.trim();
  if (!q) return { offers: [], judged: true, more: false };
  const country = location?.countryCode ?? 'CA';
  const place = location ? [location.label, COUNTRY_NAMES[country]].filter(Boolean).join(', ') : '';
  const key = `${q.toLowerCase()}|${place}`;
  const cached = cache.get(key);
  if (cached && (settled(cached) || !fresh)) return cached;

  const params = new URLSearchParams({ q, gl: country.toLowerCase() });
  if (place && location?.label !== 'Current location') params.set('location', place);
  // Rounded to ~1 km: enough to know which grocery chains are near you.
  if (location) {
    params.set('lat', location.lat.toFixed(2));
    params.set('lon', location.lon.toFixed(2));
  }

  // Nearby stores are usually already cached (prefetched at startup), so this adds no delay.
  const [data, stores] = await Promise.all([
    fetchJson<{ items: any[]; judged?: boolean; more?: boolean; meaning?: string; isFood?: boolean | null; unit?: 'ml' | 'g' | 'each' | null }>(`${API_BASE_URL}/shopping?${params}`, { headers: { 'X-App-Key': API_APP_KEY }, timeoutMs: 20000 }),
    location ? getNearbyStores(location.lat, location.lon, radiusKm).catch(() => [] as Store[]) : Promise.resolve([] as Store[]),
  ]);

  const currency = currencyFor(country) || 'CAD';
  const seen = new Set<string>();
  const offers: Ranked[] = [];
  for (const item of data.items ?? []) {
    const seller = cleanSeller(item.seller);
    const dedupe = `${norm(seller)}|${item.price}|${norm(item.title).slice(0, 40)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const branch = nearestBranch(seller, stores);
    // Our distance uses the user's real position + the chain's nearest branch (OpenStreetMap);
    // fall back to Google's own "Nearby, 4 km" figure.
    const distance = branch?.distanceKm ?? (typeof item.nearbyKm === 'number' ? item.nearbyKm : undefined);
    offers.push({
      id: `${item.id}-${offers.length}`,
      title: item.title,
      price: item.price,
      currency,
      seller,
      thumbnail: item.thumbnail,
      link: item.link,
      rating: item.rating,
      reviews: item.reviews,
      // In store only if you can actually walk into one: a branch of this seller within your
      // radius in our store database, or Google says it's in stock nearby. A chain existing
      // somewhere else in the world (e.g. Amazon Go in the US) doesn't count.
      local: !!(branch || item.nearby),
      online: !(branch || item.nearby),
      nearbyStore: !!(branch || item.nearby),
      inStockNearby: !!item.nearby,
      oldPrice: typeof item.oldPrice === 'number' ? item.oldPrice : undefined,
      tag: typeof item.tag === 'string' && /off|sale|low price/i.test(item.tag) ? item.tag : undefined,
      distanceKm: distance,
      lat: branch?.lat,
      lon: branch?.lon,
      match: item.match,
      sizeLabel: item.size?.label,
      sizeEstimated: !!item.size?.estimated,
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : undefined,
      unitLabel: item.size ? (item.size.unit === 'each' ? '/ea' : item.size.unit === 'ml' ? '/100 mL' : '/100 g') : undefined,
      unit: item.size?.unit,
    });
  }

  const judged = data.judged !== false;
  const result: OfferResult = {
    offers: arrange(offers, judged, data.unit ?? undefined),
    judged,
    more: data.more === true,
    meaning: data.meaning ?? undefined,
    isFood: data.isFood ?? undefined,
  };
  cache.set(key, result);
  return result;
}
