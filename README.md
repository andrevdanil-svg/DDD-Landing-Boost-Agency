# Boost! Agency — Landing

Статический одностраничный лендинг. Dark enterprise в стиле The Trade Desk, бренд-акцент `#655BFA`.
Собран так, чтобы потом без боли перенести в Tilda Zero Block.

## Структура

```
landing/
├── index.html          # 14 секций, семантичная разметка
├── styles.css          # все стили, :root-токены
├── main.js             # ~180 строк, без зависимостей
└── assets/
    ├── logo_boost*.svg
    ├── favicon.svg
    ├── hero_pattern.svg
    ├── dashboard_mock.svg    # placeholder, заменить на скрин кабинета
    ├── analytics_mock.svg    # placeholder, заменить на скрин Reporting
    └── clients/              # 6 placeholder-логотипов клиентов
```

## Локальный запуск

```bash
cd /Users/danilandreev/Documents/DDD/landing
python3 -m http.server 8000
```

Открыть → http://localhost:8000

## Секции (по порядку)

1. Header (sticky) · 2. Hero · 3. Logos strip · 4. Approach (problem/solution) ·
5. Platform (mockup) · 6. Channels (6 карточек) · 7. Algo (3 карточки) ·
8. Analytics (reverse-mockup) · 9. Results (4 KPI + counter) · 10. Case study ·
11. Process (4 шага) · 12. Contact form · 13. FAQ (accordion) · 14. Footer.

## Что нужно заменить перед продом

- `assets/dashboard_mock.svg` → скрин реального кабинета (1440×900 @2x).
- `assets/analytics_mock.svg` → скрин раздела Reporting.
- `assets/clients/client-*.svg` → реальные логотипы клиентов.
- В `case study` — логотип и цифры клиента (placeholder «CLIENT LOGO», «×3.1 ROAS»).
- В форме `action=""` — добавить endpoint либо подключить Tilda CRM.
- `hello@boost.agency`, `@boost_agency` (Telegram) — заменить на реальные контакты.
- Ссылки `#` в footer (Privacy / Terms / Блог) — на реальные страницы.

## Перенос в Tilda

1. **Шрифты.** В Tilda → Настройки сайта → Шрифты и цвета → подключить «Space Grotesk» (заголовки) и «Inter» (body).
2. **Цвета.** Скопировать палитру из `:root` в Tilda Custom CSS (вкладка «Настройки сайта» → «Custom CSS»). Все секции используют только CSS-переменные, поэтому перекрашивание — в одном месте.
3. **Секции.** Каждая `<section>` в `index.html` самодостаточна и не зависит от соседних селекторов → копируется в **Zero Block T123** или **Code Block T123** один в один.
4. **Форма.** В Zero Block, где стоит `<form id="contact-form">`, **заменить** на стандартный Tilda-форм-блок `T830`/`T854`: там уже встроены поля, валидация, CRM-интеграция и подключение TG-бота через Tilda-Notifier. JS-хендлер из `main.js` (функция `bindContactForm`) тогда удалить — комментарий `// TODO при переносе в Tilda ...` в коде указывает нужное место.
5. **FAQ.** Либо оставить как есть (Code Block), либо переложить на стандартный Tilda-блок `T585` / `T638`. В нашей разметке `details`-стиль сделан через `<button>` + CSS `grid-template-rows` → это валидная ARIA-реализация, работает прямо в Code Block.
6. **Анимации.** `IntersectionObserver` fade-in и counter-анимация работают в Code Block. Если Tilda покажет тёмный flash перед hydration — добавить `display: none` на `.section` только при наличии `js` класса (progressive enhancement).
7. **Ассеты.** Все SVG из `assets/` загрузить в Tilda Files Storage, пути в HTML заменить на Tilda CDN.
8. **Мобильное меню.** В Tilda обычно используется стандартный ME401/ME403. Можно удалить наш `.mobile-menu` и заменить его стандартным бургером Tilda.

## Контрольный чек перед публикацией

- `python3 -m http.server 8000` → открыть http://localhost:8000, пройти по якорям.
- DevTools → Responsive: 375 / 768 / 1280 / 1920. Горизонтального скролла быть не должно.
- Lighthouse → Perf/Acc/SEO ≥ 90.
- DOM: `document.querySelectorAll('[href=""], [src=""]').length === 0`.
- Форма: без согласия submit не проходит, email валидируется, success-state появляется.
- FAQ: Tab/Enter раскрывают блоки.
- `prefers-reduced-motion` в DevTools → Rendering → отключает fade-in и counter.
