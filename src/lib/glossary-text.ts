import { typo } from './typo';
import { glossaryHref } from '../data/glossary';
import { TERM_LINK } from '../data/glossary-pages';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Абзац страницы термина → HTML: типографика и ссылки [текст](slug) на другие термины.
export function richText(text: string): string {
  return typo(escape(text)).replace(TERM_LINK, (_, label: string, slug: string) => `<a href="${glossaryHref(slug)}" class="gl-link">${label}</a>`);
}
