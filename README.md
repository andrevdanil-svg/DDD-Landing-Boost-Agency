# Boost! Agency — сайт boostagency.uz

Ветка `main` — **готовая сборка**, её «как есть» раздаёт GitHub Pages (домен в `CNAME`).
Руками здесь ничего не правим: каждый деплой перезаписывает файлы целиком.

Исходники — Astro, ветка `redesign` (локально — worktree `~/Documents/Claude/boost-landing-v2`).
Старый статический сайт сохранён в ветке `legacy-site`.

## Деплой

```bash
cd ~/Documents/Claude/boost-landing-v2
./scripts/deploy.sh            # astro build → копия dist/ сюда → коммит в main
git -C ../boost-landing push origin main
```

Скрипт откажется работать, если здесь не `main` или есть незакоммиченные изменения.
Файлы `README.md`, `.gitignore` и `.git` он не трогает.

## Что важно

- `.nojekyll` обязателен — без него Pages не отдаст папку `_astro/` со стилями и скриптами.
- Форма заявки шлёт `POST https://platform.boostagency.uz/api/leads` (имя, телефон/Telegram, бюджет).
  Домен сайта должен быть в `CORS_ORIGINS` бэкенда платформы.
- `/en/…` и `/uz/…` — переадресации на русские страницы, пока нет переводов.
- Карта сайта: `sitemap-index.xml` (+ копия `sitemap.xml` по старому адресу).
