import { distanceKm } from './geo';
import { currencyFor, getPricesForBarcode } from './openPrices';
import { getKrogerPrices } from './proxyApi';
import { PriceObservation, Product, UserLocation } from './types';

export type PriceResult = {
  nearby: PriceObservation[]; // within the user's radius (or their own logged prices), cheapest first
  elsewhere: PriceObservation[]; // same country but further away, newest first
  cheapest?: PriceObservation;
  failed: boolean; // at least one source errored (shown as a soft warning)
};

const sameBarcode = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '');

/** Gathers prices from every source in parallel; one slow/failed source never blocks the others. */
export async function getPrices(
  product: Pick<Product, 'code' | 'name' | 'brand'>,
  myPrices: (PriceObservation & { code?: string })[],
  location: UserLocation | undefined,
  radiusKm: number,
): Promise<PriceResult> {
  const jobs: Promise<PriceObservation[]>[] = [getPricesForBarcode(product.code)];
  if (location?.countryCode === 'US') {
    jobs.push(getKrogerPrices([product.brand, product.name].filter(Boolean).join(' '), product.code, location.lat, location.lon));
  }
  const settled = await Promise.allSettled(jobs);
  const failed = settled.some((s) => s.status === 'rejected');
  const remote = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const mine = myPrices.filter((p) => p.code && sameBarcode(p.code, product.code));

  const all = [...mine, ...remote].map((p) => ({
    ...p,
    distanceKm: location && p.lat != null && p.lon != null ? distanceKm(location.lat, location.lon, p.lat, p.lon) : undefined,
  }));

  const nearby = all
    .filter((p) => p.source === 'mine' || (p.distanceKm != null && p.distanceKm <= radiusKm))
    .sort((a, b) => a.price - b.price);

  const nearbyIds = new Set(nearby.map((p) => p.id));
  const currency = currencyFor(location?.countryCode);
  const elsewhere = all
    .filter((p) => !nearbyIds.has(p.id))
    // Only show prices in the user's own currency — a Paris price isn't useful in Winnipeg.
    .filter((p) => !currency || p.currency === currency)
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, 20);

  return { nearby, elsewhere, cheapest: nearby[0], failed };
}
