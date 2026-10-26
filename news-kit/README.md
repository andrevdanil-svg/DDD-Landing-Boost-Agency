# news-kit (Boost!)

Внутренний инструмент для подготовки постов блога Boost! Agency на `boostagency.uz/blog/`. Делает три вещи:

1. **Читает** статьи сайтов, посты и каналы Telegram, рассылки — через `src/cli.ts`.
2. **Рерайтит** материал в пост по правилам Boost! через локальный Claude Code (`claude -p`).
3. **Создаёт** `.md`-файл в `src/content/blog/` лендинга — через `scripts/to-md.ts`.

Публикация — вручную. Автоматический постинг не делаем, пока не договоримся об очереди и ответственном за одобрение.

## Установка

```bash
cd news-kit
npm install
npx tsc --noEmit        # 0 ошибок
npx vitest run          # 69 passed, 1 skipped
```

Для рерайта нужен Claude Code CLI (установлен в `devDependencies`) и локальная авторизация:

```bash
# Один раз — залогинься через свою подписку Max
claude /login
```

Используем **только подписку**. `ANTHROPIC_API_KEY` не нужен и не задействован (правило из `~/.claude/CLAUDE.md`).

## CLI

```bash
# Прочитать один материал (статья или пост Telegram)
npx tsx src/cli.ts read https://www.gazeta.uz/ru/2026/10/01/some-article/
npx tsx src/cli.ts read https://t.me/spotuz/40715

# Последние ~20 постов публичного канала
npx tsx src/cli.ts channel @spotuz

# Лента сайта
npx tsx src/cli.ts site https://www.gazeta.uz

# Рерайт одного материала через Claude (локальный вход)
npx tsx src/cli.ts rewrite https://t.me/spotuz/40715
```

## Из рерайта в блог лендинга

Для создания `.md`-файла поста в `src/content/blog/` лендинга — используй `scripts/to-md.ts`:

```bash
# Создать .md из рерайта
npx tsx scripts/to-md.ts https://t.me/spotuz/40715 some-slug
# → ../src/content/blog/some-slug.md
```

Скрипт берёт результат `rewriteNews` и формирует `.md` c frontmatter под схему `src/content.config.ts` лендинга. После генерации — руками проверить:

- заголовок, лид, абзацы — звучат ли на русском без калек с источника;
- `highlights` (3–4 пункта) и `businessNote` — есть ли польза для рекламодателя;
- `warnings` в выводе — если `copied` или `numbers`, доработать текст;
- `rubric` и теги — соответствуют каталогу (Таргет / Контекст / Соцсети / ТВ и радио / Платформы / Инструменты / Кейсы / Регулирование).

Затем в лендинге:

```bash
cd ..
npm run build       # проверить сборку
# Открыть http://localhost:4391/blog/<slug>/ в npm run dev
./scripts/deploy.sh # после коммита — выкатить
```

## Источники

Пока список источников держим в голове / в CSV. План — добавить `sources.yml` и бегать по нему расписанием, но сейчас всё вручную — чтобы отфильтровывать «мусор» на входе.

Главные источники для блога Boost!:
- **UZ-медиа:** gazeta.uz, kun.uz, spot.uz, review.uz, repost.uz
- **UZ Telegram:** @spotuz, @gazeta_uz, @hookuz
- **Платформы и инструкции:** Meta Newsroom (en), Google Ads blog (en), TikTok Business, YouTube Ads blog
- **Международная аналитика:** think.google, searchengineland.com (en), adindex.ru, vc.ru/marketing
- **Регулирование:** uznews.uz, lex.uz, пресс-службы ANTIM и Антимонополии

Любой пост с этих источников = материал для `rewrite`, не публикация.

## Что адаптировано под Boost!

Относительно исходного `news-kit` (dairy Ledokol Group):

- `writeSystemPrompt()` переписан под маркетологов Узбекистана: фокус на рекламе и платформах, список рубрик соответствует разделам сайта.
- Поле `businessNote` работает как «Что это значит для рекламодателя» (визуально выделено на странице поста).
- Остальной код (http, html, feed, reader, visuals, claude, rewrite) — без изменений: правила 1–3 и 7 промпта сохранены.

## Что НЕ делает kit

- Не хранит материалы и не дедуплицирует их — пока это ручная работа.
- Не планирует публикацию и не постит в соцсети.
- Не парсит закрытые каналы Telegram, комментарии и медиа.
- Не делает OCR и не обрабатывает картинки.
