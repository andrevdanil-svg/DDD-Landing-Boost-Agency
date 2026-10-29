import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { pages, type Section, type PageData } from '../data/pages';
import { servicePages } from '../data/services';
import { platforms, nameIn, categories } from '../data/platforms';
import { cases } from '../data/cases';
import { business } from '../data/business';
import { glossary, glossaryGroups, glossaryHref, GLOSSARY_URL } from '../data/glossary';

// Полный текст сайта для ИИ-ассистентов. Собирается на build-time из тех же
// структур данных, что рендерят страницы, — значит, никогда не рассинхронизируется.

function sectionToText(s: Section): string {
  switch (s.type) {
    case 'list':
    case 'grid':
    case 'steps':
      return [
        `## ${s.title}`,
        s.intro ?? '',
        ...s.items.map((item) => `- ${item.title}: ${item.text}`),
      ]
        .filter(Boolean)
        .join('\n');
    case 'checks':
      return [`## ${s.title}`, s.intro ?? '', ...s.items.map((it) => `- ${it}`)]
        .filter(Boolean)
        .join('\n');
    case 'stats':
      return [`## ${s.title}`, ...s.items.map((it) => `- ${it.value} — ${it.label}`)].join('\n');
    case 'text':
      return `## ${s.title}\n\n${s.text}`;
    case 'faq':
      return [`## ${s.title}`, ...s.items.map((it) => `**${it.q}**\n${it.a}`)].join('\n\n');
    case 'prose':
      return s.blocks
        .map((b) => {
          if ('h2' in b) return `## ${b.h2}`;
          if ('p' in b) return b.p;
          return b.ul.map((it) => `- ${it}`).join('\n');
        })
        .join('\n\n');
    case 'duo':
      return s.columns
        .map((col) => {
          const parts = [`## ${col.title}`];
          if (col.text) parts.push(...col.text);
          if (col.items) parts.push(...col.items.map((it) => `- ${it}`));
          return parts.join('\n');
        })
        .join('\n\n');
    case 'formats':
      return [`## ${s.title}`, s.intro ?? '', ...s.items.map((it) => `- ${it.title}: ${it.text}`)]
        .filter(Boolean)
        .join('\n');
    default:
      return '';
  }
}

function pageToText(slug: string, data: PageData): string {
  const url = `${business.url}/${slug}/`;
  return [
    `# ${data.hero.title}`,
    url,
    '',
    data.hero.lead,
    '',
    ...data.sections.map(sectionToText),
    data.cta ? `\n## ${data.cta.title}\n${data.cta.text ?? ''}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function platformToText(p: (typeof platforms)[number]): string {
  const url = `${business.url}/platforms/${p.slug}/`;
  const lines = [
    `# Реклама в ${nameIn(p)}`,
    url,
    '',
    `Категория: ${categories[p.category].title}. География: ${p.geo}.`,
    '',
    p.lead,
    '',
    '## О площадке',
    ...p.about.map((it) => `- ${it}`),
  ];
  if (p.stats.length) {
    lines.push('', '## Аудитория в цифрах', ...p.stats.map((s) => `- ${s.value} — ${s.label}`));
  }
  if (p.audience.length) {
    lines.push('', '## Кто аудитория', ...p.audience.map((it) => `- ${it}`));
  }
  if (p.formats.length) {
    lines.push('', '## Рекламные форматы', ...p.formats.map((f) => `- ${f.title}: ${f.text}`));
  }
  if (p.targeting.length) {
    lines.push('', '## Таргетинги', ...p.targeting.map((it) => `- ${it}`));
  }
  if (p.useCases.length) {
    lines.push('', '## Для каких задач', ...p.useCases.map((it) => `- ${it}`));
  }
  return lines.join('\n');
}

function caseToText(c: (typeof cases)[number]): string {
  const url = `${business.url}/cases/${c.slug}/`;
  return [
    `# ${c.title}`,
    url,
    '',
    `Отрасль: ${c.industry}. Клиент: ${c.client}. ${c.meta}.`,
    '',
    c.lead,
    '',
    '## Задача и решение',
    c.description,
    '',
    '## Результат',
    ...c.stats.map((s) => `- ${s.label}: ${s.value}${s.sub ? ` (${s.sub})` : ''}`),
  ].join('\n');
}

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf(),
  );
  const out = [
    '# Boost! Agency — полный текст сайта',
    '',
    business.description,
    '',
    `Сайт: ${business.url}`,
    `Контакт: ${business.telegram}`,
    `Город: ${business.address.locality}, ${business.address.countryName}`,
    '',
    '---',
    '',
    '# СТРАНИЦЫ',
    '',
    ...Object.entries(pages).map(([slug, data]) => pageToText(slug, data)),
    '',
    '---',
    '',
    '# УСЛУГИ',
    '',
    ...Object.entries(servicePages).map(([slug, data]) => pageToText(slug, data)),
    '',
    '---',
    '',
    '# РЕКЛАМНЫЕ ПЛОЩАДКИ',
    '',
    ...platforms.map(platformToText),
    '',
    '---',
    '',
    '# КЕЙСЫ',
    '',
    ...cases.map(caseToText),
    '',
    '---',
    '',
    '# ГЛОССАРИЙ РЕКЛАМЫ И МАРКЕТИНГА',
    `${business.url}${GLOSSARY_URL}`,
    '',
    ...Object.entries(glossaryGroups).map(([id, title]) => [
      `## ${title}`,
      ...glossary
        .filter((t) => t.group === id)
        .map((t) => `- **${t.term}**${t.full ? ` (${t.full})` : ''} — ${t.text} ${business.url}${glossaryHref(t.slug)}`),
    ].join('\n')),
    '',
    '---',
    '',
    '# БЛОГ',
    '',
    ...posts.map((p) => [
      `# ${p.data.title}`,
      `${business.url}/blog/${p.id.replace(/\.md$/, '')}/`,
      '',
      `Опубликовано: ${p.data.publishedAt.toISOString().slice(0, 10)}. Рубрика: ${p.data.rubric ?? '—'}.`,
      '',
      p.data.description,
      '',
      ...(p.data.highlights && p.data.highlights.length > 0
        ? ['## Главное', ...p.data.highlights.map((h) => `- ${h}`), '']
        : []),
      p.body ?? '',
      ...(p.data.businessNote ? ['', `## Что это значит для рекламодателя`, p.data.businessNote] : []),
    ].join('\n')),
  ].join('\n\n');

  return new Response(out, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
