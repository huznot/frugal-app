import { fetchJson, memoCache } from './http';
import { PriceObservation } from './types';

// Open Prices (prices.openfoodfacts.org): crowdsourced receipts and shelf tags, ODbL.
// Every price is tied to a real OpenStreetMap store, so we can sort by distance.
const API = 'https://prices.openfoodfacts.org/api/v1';
const cache = memoCache<PriceObservation[]>(10 * 60 * 1000);

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
export function currencyFor(country?: string): string {
  if (!country) return '';
  if (EURO.includes(country)) return 'EUR';
  return ({ CA: 'CAD', US: 'USD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', CH: 'CHF', IN: 'INR', MX: 'MXN' } as Record<string, string>)[country] ?? '';
}

export async function getPricesForBarcode(code: string): Promise<PriceObservation[]> {
  const cached = cache.get(code);
  if (cached) return cached;
  const params = new URLSearchParams({ product_code: code, order_by: '-date', size: '100' });
  const data = await fetchJson(`${API}/prices?${params}`);
  const out: PriceObservation[] = (data.items ?? [])
    .filter((p: any) => typeof p.price === 'number' && p.location)
    .map((p: any) => {
      const loc = p.location;
      const online = loc.type === 'ONLINE';
      return {
        id: `op-${p.id}`,
        source: 'openprices',
        price: p.price,
        currency: p.currency || currencyFor(loc.osm_address_country_code),
        storeName: online ? loc.website_url || 'Online store' : loc.osm_brand || loc.osm_name || 'Store',
        storeAddress: online ? undefined : shortAddress(loc),
        lat: loc.osm_lat ?? undefined,
        lon: loc.osm_lon ?? undefined,
        date: p.date || p.created,
        isPromo: !!p.price_is_discounted,
        regularPrice: p.price_without_discount ?? undefined,
        per: p.price_per === 'KILOGRAM' ? 'kg' : 'unit',
        online,
      } as PriceObservation;
    });
  cache.set(code, out);
  return out;
}

function shortAddress(loc: any): string | undefined {
  // osm_display_name is "Name, number, street, district, city, region, postcode, country"
  const parts: string[] = (loc.osm_display_name ?? '').split(',').map((s: string) => s.trim());
  const street = parts.slice(1, 3).join(' ');
  return [street, loc.osm_address_city].filter(Boolean).join(', ') || undefined;
}

export const OPEN_PRICES_CONTRIBUTE_URL = 'https://prices.openfoodfacts.org/prices/add';
