// Cloudflare Workers AI: understanding what a shopper means, ranking results, reading photos.
// General-purpose — no per-product word lists. Every function degrades gracefully (returns
// null) so search still works if AI is slow or unavailable.

import type { Unit } from './shopping';

export type AiEnv = { AI?: { run(model: string, inputs: unknown): Promise<any> } };

const RERANKER = '@cf/baai/bge-reranker-base';
const JUDGE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION = '@cf/meta/llama-4-scout-17b-16e-instruct';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** Relevance of each title to the search, 0..1 (cross-encoder). Fast (~0.5 s for 40 titles). */
export async function rerank(env: AiEnv, query: string, titles: string[]): Promise<number[] | null> {
  if (!env.AI || !titles.length) return null;
  try {
    const out: any = await withTimeout(env.AI.run(RERANKER, { query, contexts: titles.map((text) => ({ text })), top_k: titles.length }), 4000);
    if (!out?.response) return null;
    const scores = new Array<number>(titles.length).fill(0);
    for (const r of out.response) if (typeof r.id === 'number') scores[r.id] = r.score;
    return scores;
  } catch {
    return null;
  }
}

export type Judgement = { meaning: string; unit?: Unit; isFood: boolean; exact: Set<number>; variant: Set<number> };

const JUDGE_PROMPT =
  'You help a grocery price-comparison app. A shopper typed a search. First decide what they most likely mean: ' +
  'the everyday default product a typical shopper expects when they type exactly that (if they typed something ' +
  'specific — a brand, flavour or size — that is what they mean). Then, from the numbered store listings, return ' +
  'the numbers of listings that ARE that product (any brand or size) as "exact", and listings of the same product ' +
  'family but a different kind (another flavour, plant-based, lactose-free, a different form or format, a different ' +
  'edition, or used / refurbished / collectible / first-edition copies, or bulk wholesale cases meant for businesses) as "variant". ' +
  'Leave out anything else. Also give the unit its value is normally compared in, and the product category. ' +
  'Respond as JSON: {"meaning": string, "unit": "ml" | "g" | "each", ' +
  '"category": "food" | "drink" | "household" | "personal care" | "baby" | "pet" | "books" | "electronics" | "other", ' +
  '"exact": number[], "variant": number[]}';

/** Which listings are the product the shopper meant. ~2.5 s, so it runs after results are sent. */
export async function judge(env: AiEnv, query: string, titles: string[]): Promise<Judgement | null> {
  if (!env.AI || !titles.length) return null;
  try {
    const out: any = await withTimeout(
      env.AI.run(JUDGE, {
        messages: [
          { role: 'system', content: JUDGE_PROMPT },
          { role: 'user', content: `Search: "${query}"\n${titles.map((t, i) => `${i}: ${t}`).join('\n')}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
        temperature: 0,
      }),
      12000,
    );
    let r = out?.response;
    if (typeof r === 'string') r = JSON.parse(r);
    if (!r || !Array.isArray(r.exact)) return null;
    const ints = (a: unknown) => new Set((Array.isArray(a) ? a : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < titles.length));
    return {
      meaning: String(r.meaning ?? query).slice(0, 120),
      unit: ['ml', 'g', 'each'].includes(r.unit) ? r.unit : undefined,
      isFood: ['food', 'drink'].includes(String(r.category).toLowerCase()),
      exact: ints(r.exact),
      variant: ints(r.variant),
    };
  } catch {
    return null;
  }
}

export type Identified = { name: string; brand?: string; size?: string; query: string };

const VISION_PROMPT =
  'Identify the grocery or household product in this photo by reading its packaging. Reply as JSON: ' +
  '{"isProduct": boolean, "brand": string, "name": string, "size": string, "query": string} where query is a short ' +
  'shopping search (brand + product + key variant, max 6 words). If there is no identifiable product, isProduct is false.';

/** Photo → product, with Workers AI vision (no API key). */
export async function identifyWithWorkersAi(env: AiEnv, base64: string, mimeType: string): Promise<Identified | null> {
  if (!env.AI) return null;
  try {
    const out: any = await withTimeout(
      env.AI.run(VISION, {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 150,
        temperature: 0,
      }),
      15000,
    );
    let r = out?.response;
    if (typeof r === 'string') r = JSON.parse(r.replace(/^```(json)?|```$/g, '').trim());
    if (!r?.isProduct || !r.query) return null;
    return {
      name: String(r.name || r.query).slice(0, 120),
      brand: r.brand ? String(r.brand).slice(0, 60) : undefined,
      size: r.size ? String(r.size).slice(0, 30) : undefined,
      query: String(r.query).slice(0, 80),
    };
  } catch {
    return null;
  }
}

const SIZE_PROMPT =
  'For each numbered store listing, give the package size it is almost certainly sold in when the title does not say ' +
  '(e.g. a carton of eggs in Canada is normally 12 eggs; a standard loaf of sliced bread is normally 675 g; one medium ' +
  'apple weighs about 180 g, one banana about 120 g). Use the ' +
  'same unit type given. If the product is commonly sold in several sizes and you cannot tell which, use null. ' +
  'Respond as JSON: {"sizes": {"<number>": "<size like 12 eggs, 675 g, 1 L>" | null}}';

/** Likely package size for listings whose titles don't state one. Estimates only — never used for "Best value". */
export async function estimateSizes(env: AiEnv, meaning: string, unit: Unit | undefined, titles: string[]): Promise<(string | null)[] | null> {
  if (!env.AI || !titles.length) return null;
  try {
    const out: any = await withTimeout(
      env.AI.run(JUDGE, {
        messages: [
          { role: 'system', content: SIZE_PROMPT },
          {
            role: 'user',
            content: `Product: ${meaning}. Unit type: ${unit === 'each' ? 'count (items)' : unit === 'g' ? 'weight' : 'volume'}.\n${titles
              .map((t, i) => `${i}: ${t}`)
              .join('\n')}`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 400,
        temperature: 0,
      }),
      10000,
    );
    let r = out?.response;
    if (typeof r === 'string') r = JSON.parse(r);
    const sizes = r?.sizes ?? {};
    return titles.map((_, i) => (typeof sizes[i] === 'string' ? sizes[i] : typeof sizes[String(i)] === 'string' ? sizes[String(i)] : null));
  } catch {
    return null;
  }
}

const REWRITE_PROMPT =
  'You turn what a shopper typed into a grocery price-comparison app into the best Google Shopping search for finding ' +
  'that product at grocery stores. Keep any brand, size, flavour or variety they typed. If the words are ambiguous ' +
  'outside a grocery store (e.g. "apple" could be a phone), make it clearly the grocery item. For fresh produce, meat, ' +
  'seafood, bakery and deli items add context such as "fresh" or "produce" (e.g. "banana" -> "fresh bananas produce"). ' +
  'For packaged or branded products return the search nearly unchanged. If it is not a grocery item at all (a book, ' +
  'electronics, clothing), return it unchanged. Respond as JSON: {"query": string}';

/** Rewrites a search so a general shopping engine finds the grocery item. ~0.8 s; cache the result. */
export async function rewriteQuery(env: AiEnv, query: string): Promise<string | null> {
  if (!env.AI) return null;
  try {
    const out: any = await withTimeout(
      env.AI.run(JUDGE, {
        messages: [
          { role: 'system', content: REWRITE_PROMPT },
          { role: 'user', content: query },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 60,
        temperature: 0,
      }),
      4000,
    );
    let r = out?.response;
    if (typeof r === 'string') r = JSON.parse(r);
    const q = typeof r?.query === 'string' ? r.query.trim().slice(0, 120) : '';
    return q || null;
  } catch {
    return null;
  }
}
