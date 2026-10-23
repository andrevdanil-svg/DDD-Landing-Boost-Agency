import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://boostagency.uz',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
