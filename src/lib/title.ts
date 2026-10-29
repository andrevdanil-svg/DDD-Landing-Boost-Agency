// Правило владельца (2026-10-29): Title каждой страницы кончается на « | Реклама в Ташкенте».
// Применяется в Base.astro, поэтому новые страницы получают приписку сами. Хвост с названием
// агентства («— Boost! Agency», «| Boost!», «— блог Boost! Agency») она заменяет, чтобы Title
// не разрастался; название в середине Title остаётся. Проверка — scripts/seo-check.ts.
export const TITLE_SUFFIX = 'Реклама в Ташкенте';

const OWN_SUFFIX = new RegExp(`\\s*\\|\\s*${TITLE_SUFFIX}\\s*$`, 'u');
const BRAND_TAIL = /\s*(?:—|–|-|\|)\s*(?:блог\s+)?Boost!(?:\s+Agency)?\s*$/u;

export function pageTitle(title: string): string {
  const base = title.trim().replace(OWN_SUFFIX, '').replace(BRAND_TAIL, '').trim();
  return base ? `${base} | ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}
