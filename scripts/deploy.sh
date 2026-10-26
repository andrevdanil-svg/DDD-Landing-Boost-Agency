#!/bin/zsh
# Выкладка сайта: собрать Astro и положить готовые файлы в ветку main рядом лежащего клона.
# GitHub Pages раздаёт main «как есть» (legacy-сборка), поэтому в main — только результат сборки,
# исходники живут в этой ветке. Push делается отдельно и только вручную: git -C ../boost-landing push
set -euo pipefail

SRC=${0:A:h:h}
SITE=${SITE:-$SRC/../boost-landing}

[[ $(git -C $SITE branch --show-current) == main ]] || { echo "в $SITE не ветка main" >&2; exit 1; }
[[ -z $(git -C $SITE status --porcelain) ]] || { echo "в $SITE есть незакоммиченные изменения" >&2; exit 1; }

cd $SRC
npx astro build
# SEO-валидация собранного dist: title/description/canonical/JSON-LD, дубли.
# При ошибках (не предупреждениях) выход != 0 → деплой остановится.
npx tsx scripts/seo-check.ts
# старый адрес карты сайта, который мог быть добавлен в Search Console / Вебмастер
cp dist/sitemap-0.xml dist/sitemap.xml

rsync -a --delete --exclude .git --exclude .gitignore --exclude README.md --exclude .claude --exclude .DS_Store dist/ $SITE/

cd $SITE
git add -A
git status --short | tail -5
echo "файлов изменено: $(git status --porcelain | wc -l | tr -d ' ')"
git commit -q -m "deploy: сборка $(git -C $SRC rev-parse --short HEAD) из ветки redesign" && git log --oneline -1
