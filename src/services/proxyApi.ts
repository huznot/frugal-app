import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { API_APP_KEY, API_BASE_URL } from '../config';
import { fetchJson, memoCache } from './http';
import { coarse } from './geo';
import { PriceObservation } from './types';

/** Features that need our backend proxy (API keys must never ship inside the app). */
export const proxyEnabled = !!API_BASE_URL;

const headers = { 'Content-Type': 'application/json', 'X-App-Key': API_APP_KEY };

export type Identified = { name: string; brand?: string; size?: string; query: string };

/** Which step of a photo lookup failed — shown to the user so device-specific problems can be diagnosed. */
export class PhotoError extends Error {
  constructor(public step: 'capture' | 'resize' | 'upload' | 'server', detail: string) {
    super(`${step}: ${detail}`);
  }
}

/** Shrinks a photo to a ~640 px JPEG (base64). Tries the current API, then the legacy one. */
async function shrink(uri: string): Promise<string | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 640 });
    const rendered = await ctx.renderAsync();
    const out = await rendered.saveAsync({ compress: 0.55, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return out.base64;
  } catch {
    // fall through to the legacy API
  }
  try {
    const out = await manipulateAsync(uri, [{ resize: { width: 640 } }], { compress: 0.55, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return out.base64;
  } catch {
    // caller falls back to the camera's own low-quality base64
  }
  return null;
}

/**
 * Photo → product name. Speed matters, so the photo is shrunk to ~640 px (~50–90 KB) before
 * upload; if shrinking fails on a device, the camera's own small base64 copy is sent instead.
 */
export async function identifyPhoto(uri: string, cameraBase64?: string): Promise<Identified | null> {
  if (!proxyEnabled) throw new Error('photo-disabled');
  const image = (await shrink(uri)) ?? cameraBase64;
  if (!image) throw new PhotoError('resize', 'could not read the photo');
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/identify`, { method: 'POST', headers, body: JSON.stringify({ image, mimeType: 'image/jpeg' }) });
  } catch (e: any) {
    throw new PhotoError('upload', e?.message ?? 'network error');
  }
  if (!res.ok) throw new PhotoError('server', `HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 80)}`);
  const data = (await res.json()) as { product: Identified | null };
  return data.product;
}

const krogerCache = memoCache<PriceObservation[]>(10 * 60 * 1000);

/** Official Kroger Developer API (US only) via the proxy, which holds the client secret. */
export async function getKrogerPrices(term: string, upc: string | undefined, lat: number, lon: number): Promise<PriceObservation[]> {
  if (!proxyEnabled) return [];
  const params = new URLSearchParams({ term, lat: String(coarse(lat)), lon: String(coarse(lon)) });
  if (upc) params.set('upc', upc);
  const key = params.toString();
  const cached = krogerCache.get(key);
  if (cached) return cached;
  const data = await fetchJson<{ items: any[] }>(`${API_BASE_URL}/kroger/prices?${params}`, { headers, timeoutMs: 10000 });
  const out: PriceObservation[] = (data.items ?? []).map((i, idx) => ({
    id: `kr-${i.productId ?? idx}-${i.store?.id ?? ''}`,
    source: 'kroger',
    price: i.promoPrice || i.price,
    regularPrice: i.promoPrice ? i.price : undefined,
    isPromo: !!i.promoPrice,
    currency: 'USD',
    storeName: i.store?.name ?? 'Kroger',
    storeAddress: i.store?.address,
    lat: i.store?.lat,
    lon: i.store?.lon,
    date: new Date().toISOString(),
    per: 'unit',
  }));
  krogerCache.set(key, out);
  return out;
}
