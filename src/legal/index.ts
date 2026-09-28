import docs from './documents.json';
import business from './business.json';

export type LegalDocKey = 'privacy' | 'terms' | 'licenses';
export type LegalSection = { heading: string; body?: string[]; bullets?: string[]; after?: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String((business as Record<string, unknown>)[k] ?? ''));

export function getLegalDoc(key: LegalDocKey): LegalDoc {
  const d = (docs as Record<LegalDocKey, LegalDoc>)[key];
  return {
    title: d.title,
    intro: fill(d.intro),
    sections: d.sections.map((s) => ({
      heading: fill(s.heading),
      body: s.body?.map(fill),
      bullets: s.bullets?.map(fill),
      after: s.after?.map(fill),
    })),
  };
}
