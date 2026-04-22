# Boost! Agency — Landing

Статический лендинг на собственном домене `boostagency.uz`, развёрнут через GitHub Pages. Форма лидов отправляет данные в платформу на `platform.boostagency.uz/api/leads`.

Дизайн — dark enterprise, бренд-акцент `#655BFA`. Стек: HTML + CSS + один `main.js` без зависимостей.

## Структура

```
.
├── index.html                   главная (14 секций)
├── styles.css                   все стили, :root-токены
├── main.js                      формы, FAQ, меню, анимации (~270 строк)
├── sitemap.xml / robots.txt
├── CNAME                        boostagency.uz
├── partials/
│   └── lead-form.html           единственный разделяемый партиал — форма лидов
├── about/ · analytics/ · cases/ · channels/ · contact/ · faq/
├── platform/ · process/ · self-launch/ · sites/ · technology/ · topup/
├── privacy/ · terms/ · data-processing/
└── assets/
    ├── logo_boost*.svg / favicon.svg / hero_pattern.svg
    ├── og-image.svg             превью для соцсетей (1200×630)
    ├── dashboard_mock.svg       ⚠ placeholder — заменить на скрин кабинета
    ├── analytics_mock.svg       ⚠ placeholder — заменить на скрин аналитики
    └── platforms/               логотипы внешних платформ (DV360, Google Ads, Meta, Yandex)
```

**Навигация:** header и footer вшиты (inline) в каждую страницу — чтобы сайт корректно отображался без JS и нормально индексировался. Исходники лежат в `partials/header.html` и `partials/footer.html` как reference — **правки в partials нужно распространять на все страницы** (см. раздел «Правка хедера/футера»).

**Форма лидов:** описана в `partials/lead-form.html`, подгружается `main.js` через `data-include` на главной и на `/contact/`. Изменение формы в одном файле автоматически попадает в обе страницы.

## Локальный запуск

```bash
cd /Users/danilandreev/Documents/Claude/DDD-Landing-Boost-Agency
python3 -m http.server 8000
```

Открыть → <http://localhost:8000>

## Деплой

GitHub Pages деплоит автоматически при push в `main`. Файл `CNAME` держит домен `boostagency.uz`.

```bash
git add .
git commit -m "landing: <что изменилось>"
git push origin main
```

После деплоя нужно **Cmd+Shift+R** в браузере, чтобы сбросить кеш CSS/JS.

## Правка хедера/футера

1. Править `partials/header.html` или `partials/footer.html`.
2. Прогнать небольшой скрипт, чтобы синхронизировать изменения во всех HTML-страницах:

```bash
python3 - <<'PY'
import os, glob
root = os.getcwd()
with open(f"{root}/partials/header.html") as f: header = f.read().rstrip()
with open(f"{root}/partials/footer.html") as f: footer = f.read().rstrip()
# заменяем ранее вшитые блоки по первой строке-маркеру — см. <header class="header"...> / <footer class="footer"...>
# (точный паттерн зависит от изменений; обычно проще переинлайнить руками)
PY
```

Если изменения крупные — проще пересобрать инлайн через пару минут работы. Форма `partials/lead-form.html` этого не требует (она грузится через fetch).

## Переменные и настройки

- `<meta name="leads-api">` — переопределяет endpoint формы. По умолчанию (fallback в `main.js`) используется `https://platform.boostagency.uz/api/leads`.
- `<base href>` — скрипт в `<head>` ставит корректный base: `/` для собственных доменов, `/DDD-Landing-Boost-Agency/` для github.io-превью.

## Что ещё нужно доделать

- [ ] Подключить Google Analytics 4 и Яндекс.Метрику (user делает вручную).
- [ ] Заменить `assets/dashboard_mock.svg` и `assets/analytics_mock.svg` реальными скриншотами кабинета platform.boostagency.uz.
- [ ] Рендерить `assets/og-image.svg` в PNG для максимальной совместимости соцсетей (Telegram, Facebook).
- [ ] Английская и узбекская локализация (см. задачу в переписке).

## SEO

Подключено: `canonical`, Open Graph, Twitter Cards, JSON-LD Organization (на главной), `sitemap.xml`, `robots.txt`.

При добавлении новой страницы:
1. Скопировать `<head>` с существующей страницы, обновить `<title>`, `<meta name="description">`, `og:*`, `twitter:*` и `canonical`.
2. Добавить URL в `sitemap.xml`.
