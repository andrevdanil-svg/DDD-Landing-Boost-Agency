import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://boostagency.uz',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // переадресации /en/ и /uz/ и страница 404 в карту сайта не попадают
  integrations: [sitemap({ filter: (page) => !/boostagency\.uz\/(en|uz|404)(\/|$)/.test(page) })],
});
