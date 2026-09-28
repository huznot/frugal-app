import { USER_AGENT } from '../config';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Options = {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function fetchJson<T = any>(url: string, opts: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      body: opts.body,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...opts.headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `Request failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Tiny in-memory TTL cache so repeat views don't hit the free public APIs again. */
export function memoCache<T>(ttlMs: number) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      store.delete(key);
      return undefined;
    },
    set(key: string, value: T) {
      store.set(key, { at: Date.now(), value });
    },
  };
}
