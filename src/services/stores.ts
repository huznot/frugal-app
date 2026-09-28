import { fetchJson, memoCache } from './http';
import { API_APP_KEY, API_BASE_URL } from '../config';
import { coarse, distanceKm } from './geo';
import { Store, StoreKind } from './types';

// Store locations come from OpenStreetMap (ODbL, "© OpenStreetMap contributors") via the
// public Overpass API. Its usage policy allows moderate use, so results are cached and
// coordinates are coarsened. For large scale, self-host Overpass or use a paid provider.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const SHOP_KIND: Record<string, StoreKind> = {
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

const cache = memoCache<Store[]>(30 * 60 * 1000);

// A lookup already in flight for the same area is shared instead of repeated.
const inflight = new Map<string, Promise<Store[]>>();

/**
 * Grocery stores around a point. Uses Frugal's own store database on our server (answers in
 * ~0.3 s for any radius); falls back to the public OpenStreetMap servers — all asked at once, first
 * answer wins — only if our server can't be reached.
 */
export async function getNearbyStores(lat: number, lon: number, radiusKm: number): Promise<Store[]> {
  const cLat = coarse(lat);
  const cLon = coarse(lon);
  const radius = Math.min(radiusKm, 50);
  const key = `${cLat.toFixed(2)},${cLon.toFixed(2)},${radius}`;
  const cached = cache.get(key);
  if (cached) return withDistance(cached, lat, lon);

  let job = inflight.get(key);
  if (!job) {
    job = (API_BASE_URL ? fromServer(cLat, cLon, radius).catch(() => fromOverpass(cLat, cLon, radius)) : fromOverpass(cLat, cLon, radius))
      .then((stores) => {
        cache.set(key, stores);
        return stores;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return withDistance(await job, lat, lon);
}

async function fromServer(lat: number, lon: number, radiusKm: number): Promise<Store[]> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radiusKm) });
  const data = await fetchJson<{ stores: Store[] }>(`${API_BASE_URL}/stores?${params}`, { headers: { 'X-App-Key': API_APP_KEY }, timeoutMs: 10000 });
  return data.stores ?? [];
}

async function fromOverpass(lat: number, lon: number, radiusKm: number): Promise<Store[]> {
  const shops = Object.keys(SHOP_KIND).join('|');
  const query = `[out:json][timeout:20];nwr["shop"~"^(${shops})$"]["name"](around:${Math.round(radiusKm * 1000)},${lat},${lon});out center tags 250;`;
  const attempt = (url: string) =>
    fetchJson(url, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeoutMs: 15000,
    }).then((data) => (data.elements ?? []).map(toStore).filter(Boolean) as Store[]);
  // All mirrors at once; the first good answer wins.
  return new Promise<Store[]>((resolve, reject) => {
    let failures = 0;
    for (const url of MIRRORS) {
      attempt(url).then(resolve, () => {
        if (++failures === MIRRORS.length) reject(new Error('Store lookup failed'));
      });
    }
  });
}

function toStore(el: any): Store | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null || !t.name) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    id: `${el.type}/${el.id}`,
    name: t.name,
    brand: t.brand,
    wikidata: t['brand:wikidata'],
    kind: SHOP_KIND[t.shop] ?? 'specialty',
    lat,
    lon,
    address: [street, t['addr:city']].filter(Boolean).join(', ') || undefined,
    openingHours: t.opening_hours,
    website: t.website || t['contact:website'],
    phone: t.phone || t['contact:phone'],
  };
}

function withDistance(stores: Store[], lat: number, lon: number): Store[] {
  return stores
    .map((s) => ({ ...s, distanceKm: distanceKm(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distanceKm! - b.distanceKm!);
}
