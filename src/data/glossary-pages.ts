// Страницы терминов глоссария (/glossary/<slug>/): разделы с примерами, графики, вопросы.
// Тексты — src/data/glossary-pages/<группа>.json, по объекту на термин из glossary.ts.
// Ошибку в данных (неизвестный термин, ссылка на несуществующий, пустая страница) ловит
// сборка — страница со сломанной ссылкой на сайт не попадёт.

import { glossary, type GlossaryTerm } from './glossary';

export type GlossaryVisual =
  | Readonly<{ type: 'formula'; caption: string; expression: string; inputs: readonly { label: string; value: string }[]; result: { label: string; value: string } }>
  | Readonly<{ type: 'bars'; caption: string; unit?: string; items: readonly { label: string; value: number }[] }>
  | Readonly<{ type: 'funnel'; caption: string; steps: readonly { label: string; value: number }[] }>
  | Readonly<{ type: 'steps'; caption: string; steps: readonly { title: string; text?: string }[] }>
  | Readonly<{ type: 'compare'; caption: string; columns: readonly { title: string; items: readonly string[] }[] }>;

export type GlossarySection = Readonly<{
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  visual?: GlossaryVisual;
}>;

export type GlossaryPage = Readonly<{
  slug: string;
  seoTitle: string;
  description: string;
  sections: readonly GlossarySection[];
  faq: readonly { q: string; a: string }[];
}>;

// [текст](slug) — ссылка на другой термин глоссария.
export const TERM_LINK = /\[([^\]]+)\]\(([a-z0-9-]+)\)/g;

const terms = new Map<string, GlossaryTerm>(glossary.map((t) => [t.slug, t]));

const files = import.meta.glob<{ default: GlossaryPage[] }>('./glossary-pages/*.json', { eager: true });

function texts(page: GlossaryPage): string[] {
  return [
    ...page.sections.flatMap((s) => [...(s.paragraphs ?? []), ...(s.items ?? [])]),
    ...page.faq.flatMap((f) => [f.q, f.a]),
  ];
}

function check(page: GlossaryPage, file: string): GlossaryPage {
  const where = `${file}: ${page.slug}`;
  if (!terms.has(page.slug)) throw new Error(`${where} — нет такого термина в glossary.ts`);
  if (!page.seoTitle?.trim() || !page.description?.trim()) throw new Error(`${where} — нет seoTitle или description`);
  if (!page.sections?.length) throw new Error(`${where} — нет разделов`);
  for (const text of texts(page)) {
    for (const [, , slug] of text.matchAll(TERM_LINK)) {
      if (!terms.has(slug!)) throw new Error(`${where} — ссылка на несуществующий термин «${slug}»`);
    }
  }
  return page;
}

export const glossaryPages: ReadonlyMap<string, GlossaryPage> = new Map(
  Object.entries(files).flatMap(([file, mod]) => mod.default.map((page) => [page.slug, check(page, file)] as const)),
);

// Термины, на которые страница ссылается в тексте, — для блока «Связанные термины».
export function linkedTerms(page: GlossaryPage): string[] {
  const out = new Set<string>();
  for (const text of texts(page)) for (const [, , slug] of text.matchAll(TERM_LINK)) out.add(slug!);
  out.delete(page.slug);
  return [...out];
}

// Текст без разметки ссылок — для description, FAQ в JSON-LD и llms-full.txt.
export const plainText = (text: string) => text.replace(TERM_LINK, '$1');
