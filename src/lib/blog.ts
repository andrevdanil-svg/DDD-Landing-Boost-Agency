import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export type Rubric = Readonly<{ name: string; slug: string; lead: string }>;

// Каталог рубрик — тот же список, что у генератора постов (news-kit writeSystemPrompt)
// и в редакторе платформы (Editor.jsx RUBRICS). Порядок = порядок в меню и фильтрах.
export const RUBRICS: readonly Rubric[] = [
  { name: 'Таргет', slug: 'targeting', lead: 'Таргетированная реклама в Meta, TikTok, Telegram и других соцсетях: форматы, аудитории, ставки.' },
  { name: 'Контекст', slug: 'search', lead: 'Поисковая и медийная реклама в Google Ads и Яндекс Директе: настройка, объявления, оптимизация.' },
  { name: 'Соцсети', slug: 'social', lead: 'Продвижение в Instagram, Telegram, TikTok и YouTube: контент, блогеры, работа с сообществом.' },
  { name: 'ТВ и радио', slug: 'tv-radio', lead: 'Реклама на телевидении и радио в Узбекистане: каналы, форматы, медиапланирование.' },
  { name: 'Платформы', slug: 'platforms', lead: 'Новости рекламных платформ и площадок Узбекистана: запуски, обновления, новые возможности.' },
  { name: 'Инструменты', slug: 'tools', lead: 'Инструкции по рекламным кабинетам, аналитике и сервисам для маркетолога.' },
  { name: 'Кейсы', slug: 'cases', lead: 'Разборы рекламных кампаний с цифрами: что делали и что получили.' },
  { name: 'Регулирование', slug: 'regulation', lead: 'Законы и правила рекламы в Узбекистане: что меняется для рекламодателей.' },
];

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

// Рубрика поста: из каталога, а если генератор или редактор вписали свою — отдельный раздел.
export function rubricOf(name: string): Rubric {
  const clean = name.trim();
  const known = RUBRICS.find((r) => r.name.toLowerCase() === clean.toLowerCase());
  if (known) return known;
  const slug = [...clean.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other';
  return { name: clean, slug, lead: `Статьи блога Boost! Agency в рубрике «${clean}».` };
}

export const postUrl = (post: BlogPost) => `/blog/${post.id.replace(/\.md$/, '')}/`;
export const rubricUrl = (rubric: Rubric) => `/blog/rubric/${rubric.slug}/`;

export async function publishedPosts(): Promise<BlogPost[]> {
  return (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf(),
  );
}

// Рубрики, в которых есть посты, — в порядке каталога, свои рубрики в конце. Пустых
// разделов не показываем ни в меню, ни в фильтрах.
export function rubricsWithPosts(posts: readonly BlogPost[]): { rubric: Rubric; count: number }[] {
  const counts = new Map<string, { rubric: Rubric; count: number }>();
  for (const post of posts) {
    if (!post.data.rubric?.trim()) continue;
    const rubric = rubricOf(post.data.rubric);
    const entry = counts.get(rubric.slug) ?? { rubric, count: 0 };
    entry.count += 1;
    counts.set(rubric.slug, entry);
  }
  const order = (slug: string) => {
    const i = RUBRICS.findIndex((r) => r.slug === slug);
    return i === -1 ? RUBRICS.length : i;
  };
  return [...counts.values()].sort((a, b) => order(a.rubric.slug) - order(b.rubric.slug));
}
