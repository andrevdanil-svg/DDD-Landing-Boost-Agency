import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://boostagency.uz',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      // переадресации /en/ и /uz/ и страница 404 в карту сайта не попадают;
      // llms-full.txt тоже исключаем — это текстовый endpoint, не страница
      filter: (page) => !/boostagency\.uz\/(en|uz|404|llms-full\.txt)(\/|$)/.test(page),
      // приоритеты и частота обновления — чтобы поисковые боты знали, что главнее
      serialize(item) {
        const url = new URL(item.url);
        const path = url.pathname.replace(/\/+$/, '') || '/';

        // Главная — максимальный приоритет
        if (path === '/') return { ...item, priority: 1.0, changefreq: 'weekly' };

        // Услуги и площадки — высокий приоритет
        if (
          /^\/(services|channels|search|social|media|bloggers|tv|radio|outdoor|creative|sites|topup)$/.test(path) ||
          path === '/platforms' ||
          path.startsWith('/platforms/') ||
          path === '/cases' ||
          path.startsWith('/cases/')
        ) {
          return { ...item, priority: 0.9, changefreq: 'monthly' };
        }

        // Технологические и справка — средний
        if (/^\/(about|platform|analytics|technology|process|contact|faq)$/.test(path)) {
          return { ...item, priority: 0.7, changefreq: 'monthly' };
        }

        // Юр.страницы и прочие служебные — низкий
        return { ...item, priority: 0.5, changefreq: 'yearly' };
      },
    }),
  ],
});
