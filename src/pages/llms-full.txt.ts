import type { APIRoute } from 'astro';
import { pages, type Section, type PageData } from '../data/pages';
import { servicePages } from '../data/services';
import { platforms, nameIn, categories } from '../data/platforms';
import { cases } from '../data/cases';
import { business } from '../data/business';

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

export const GET: APIRoute = () => {
  const out = [
    '# Boost! Agency — полный текст сайта',
    '',
    business.description,
    '',
    `Сайт: ${business.url}`,
    `Контакт: ${business.telegram}`,
    `Основано: ${business.foundingYear}`,
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
  ].join('\n\n');

  return new Response(out, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
