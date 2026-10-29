// Ссылки в постах блога — плагин Markdown-процессора Astro (Sätteri), работает при сборке.
// 1. Внешних ссылок в постах нет: они уводят вес сайта на чужие домены. Ссылка на
//    другой сайт превращается в обычный текст — даже если её вписали руками в редакторе.
// 2. Первое упоминание термина из глоссария ведёт на его определение (/glossary/#slug),
//    не больше MAX_TERM_LINKS ссылок на пост. Заголовки, картинки и ссылки не трогаем.
// 3. HTML-комментарии (платформа писала в них адрес материала, с которого переписан пост)
//    в код страницы не попадают.
// Работает при каждой сборке, поэтому касается и уже опубликованных постов.

import type { MdastPluginDefinition, PluginFactoryContext } from 'satteri';
import { glossary, glossaryHref } from '../data/glossary';

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[]; data?: Record<string, unknown> };

const MAX_TERM_LINKS = 8;
const OWN_HOST = /^(?:www\.)?boostagency\.uz$/i;
const SKIP = new Set(['heading', 'link', 'linkReference', 'tableCell']);

const WORD = '\\p{L}\\p{N}_';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Регистр важен только у аббревиатур: «CR» — термин, «cr» в тексте — нет.
const MATCHERS = glossary.flatMap((t) => [
  ...(t.abbr ?? []).map((a) => ({ slug: t.slug, re: new RegExp(`(?<![${WORD}-])${escapeRe(a)}(?![${WORD}])`, 'u') })),
  ...(t.match ?? []).map((m) => ({ slug: t.slug, re: new RegExp(`(?<![${WORD}-])(?:${m})(?![${WORD}])`, 'iu') })),
]);

export function isExternal(url: string): boolean {
  if (!/^(?:https?:)?\/\//i.test(url)) return false;
  try {
    return !OWN_HOST.test(new URL(url, 'https://boostagency.uz').hostname);
  } catch {
    return true;
  }
}

// Самое раннее упоминание ещё не связанного термина; на одной позиции — самое длинное
// («поведенческий таргетинг», а не «таргетинг»).
function firstTerm(text: string, used: Set<string>) {
  let best: { slug: string; index: number; length: number } | null = null;
  for (const { slug, re } of MATCHERS) {
    if (used.has(slug)) continue;
    const m = re.exec(text);
    if (!m) continue;
    if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.length)) {
      best = { slug, index: m.index, length: m[0].length };
    }
  }
  return best;
}

// Какие термины глоссария упоминаются в тексте — для блока «Статьи блога» на странице термина.
export function mentionedTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const { slug, re } of MATCHERS) if (re.test(text)) out.add(slug);
  return out;
}

// Текст → [текст, ссылка на термин, текст…]; null — терминов нет (или лимит ссылок исчерпан).
export function linkTerms(value: string, used: Set<string>): MdNode[] | null {
  const out: MdNode[] = [];
  let rest = value;
  while (rest && used.size < MAX_TERM_LINKS) {
    const hit = firstTerm(rest, used);
    if (!hit) break;
    used.add(hit.slug);
    if (hit.index > 0) out.push({ type: 'text', value: rest.slice(0, hit.index) });
    out.push({
      type: 'link',
      url: glossaryHref(hit.slug),
      children: [{ type: 'text', value: rest.slice(hit.index, hit.index + hit.length) }],
      data: { hProperties: { className: ['gl-term'] } },
    });
    rest = rest.slice(hit.index + hit.length);
  }
  if (!out.length) return null;
  if (rest) out.push({ type: 'text', value: rest });
  return out;
}

// Фабрика вызывается на каждый документ: плагин работает только для постов блога,
// а счётчик связанных терминов у каждого поста свой.
export function blogLinks(ctx: PluginFactoryContext): MdastPluginDefinition | null {
  if (!ctx.fileURL?.pathname.includes('/src/content/blog/')) return null;
  const used = new Set<string>();
  return {
    name: 'boost-blog-links',
    link(node, c) {
      if (isExternal(node.url)) c.replaceNode(node, { type: 'text', value: c.textContent(node) });
    },
    html(node, c) {
      if (/^\s*<!--[\s\S]*-->\s*$/.test(node.value)) c.removeNode(node);
    },
    text(node, c) {
      if (used.size >= MAX_TERM_LINKS) return;
      for (let p = c.parent(node); p; p = c.parent(p)) {
        if (SKIP.has(p.type)) return;
      }
      const parts = linkTerms(node.value, used);
      if (parts) c.replaceNode(node, parts as never);
    },
  };
}
