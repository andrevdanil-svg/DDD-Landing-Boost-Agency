import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Блог Boost! Agency: пост = один .md файл в src/content/blog/
// Создаётся вручную из рерайта news-kit (ручной CLI → .md).
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().max(140),
    description: z.string().max(300),
    rubric: z.string().max(24).optional(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('Boost! Agency'),
    // Главная цифра — выведем в hero поста
    keyFigure: z
      .object({ value: z.string().max(14), caption: z.string().max(48) })
      .optional(),
    // «Главное» — буллеты для цитирования ИИ
    highlights: z.array(z.string().max(160)).max(4).optional(),
    // «Что это значит для рекламодателя» — закрывающий блок
    businessNote: z.string().max(600).optional(),
    // Теги для фильтрации (не для navigation, только для внутренней связи)
    tags: z.array(z.string()).default([]),
    // Исключить из списка (черновик)
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
