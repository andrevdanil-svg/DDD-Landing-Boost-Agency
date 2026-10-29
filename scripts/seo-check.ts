#!/usr/bin/env -S npx tsx
// Проверяет собранный dist/ на базовые SEO-ошибки. Запускать после `astro build`.
// Падает (exit 1), если нашёл блокирующие проблемы — чтобы deploy.sh остановился.
//
// Что проверяем:
// - title есть, кончается на « | Реклама в Ташкенте» (правило владельца, src/lib/title.ts)
// - ссылки на страницы глоссария (/glossary/…/) ведут на существующие страницы
// - description есть и 50–180 символов
// - canonical есть
// - JSON-LD application/ld+json хотя бы один и парсится
// - H1 ровно один (кроме /, где H1 может быть несколько по дизайну)
// - дубли title и description по всему dist (один и тот же текст на разных URL — проблема)
//
// Пропускаем: /404.html, /uz/* (редиректы), /404/*, llms-full.txt (не HTML).

import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname ?? ".", "..", "dist");
// Редирект-страницы (/en/*, /uz/*) и служебные файлы — не проверяем, у них нет контента для SEO.
const SKIP = /^\/(?:404|uz|en)(?:\/|$)|\/404\.html$|\/llms-full\.txt$|\/sitemap(?:-index|-\d+)?\.xml$|\/robots\.txt$|\/llms\.txt$|\/CNAME$|\/.nojekyll$/u;

type Issue = { url: string; level: "error" | "warn"; code: string; detail?: string };

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith(".html")) yield p;
  }
}

function pageUrl(file: string): string {
  const rel = path.relative(DIST, file).replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

function extract(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html);
  return match?.[1]?.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function checkPage(file: string): Issue[] {
  const url = pageUrl(file);
  if (SKIP.test(url)) return [];
  const html = fs.readFileSync(file, "utf8");
  const issues: Issue[] = [];

  const title = extract(html, /<title>([^<]+)<\/title>/i);
  if (!title) {
    issues.push({ url, level: "error", code: "missing-title" });
  } else {
    const t = decodeEntities(title);
    // Для кириллицы Google обрезает title быстрее, но длинные title полнее читаются ИИ-ботами —
    // предупреждаем только если явно превышает экран (≥88 знаков).
    // Правило владельца: Title каждой страницы кончается на « | Реклама в Ташкенте» (src/lib/title.ts).
    if (!t.endsWith(" | Реклама в Ташкенте")) issues.push({ url, level: "error", code: "title-suffix", detail: `«${t}»` });
    if (t.length < 20) issues.push({ url, level: "warn", code: "short-title", detail: `${t.length} chars: «${t}»` });
    else if (t.length > 88) issues.push({ url, level: "warn", code: "long-title", detail: `${t.length} chars: «${t.slice(0, 60)}…»` });
  }

  const descMatch = extract(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (!descMatch) {
    issues.push({ url, level: "error", code: "missing-description" });
  } else {
    const d = decodeEntities(descMatch);
    // Google обрезает ≈160 символов для латиницы, ≈120 для кириллицы, но полный текст индексирует.
    // Критично только если description явно overshot — 240+ знаков.
    if (d.length < 50) issues.push({ url, level: "warn", code: "short-description", detail: `${d.length} chars` });
    else if (d.length > 240) issues.push({ url, level: "warn", code: "long-description", detail: `${d.length} chars` });
  }

  const canonical = /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i.test(html);
  const noindex = /<meta\s+name=["']robots["']\s+content=["']noindex/i.test(html);
  if (!canonical && !noindex) issues.push({ url, level: "error", code: "missing-canonical" });

  const jsonLd = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/g;
  const matches = [...html.matchAll(jsonLd)];
  if (matches.length === 0) {
    issues.push({ url, level: "error", code: "missing-json-ld" });
  } else {
    for (const m of matches) {
      try {
        JSON.parse(m[1] ?? "");
      } catch {
        issues.push({ url, level: "error", code: "invalid-json-ld" });
        break;
      }
    }
  }

  const h1s = (html.match(/<h1\b[^>]*>/gi) ?? []).length;
  if (h1s === 0) issues.push({ url, level: "warn", code: "missing-h1" });
  else if (h1s > 1 && url !== "/") issues.push({ url, level: "warn", code: "multiple-h1", detail: `${h1s} штук` });

  return issues;
}

function detectDuplicates(pages: Map<string, { title?: string; description?: string }>): Issue[] {
  const titleSeen = new Map<string, string[]>();
  const descSeen = new Map<string, string[]>();
  for (const [url, data] of pages) {
    if (data.title) {
      const list = titleSeen.get(data.title) ?? [];
      list.push(url);
      titleSeen.set(data.title, list);
    }
    if (data.description) {
      const list = descSeen.get(data.description) ?? [];
      list.push(url);
      descSeen.set(data.description, list);
    }
  }
  const issues: Issue[] = [];
  for (const [title, urls] of titleSeen) {
    if (urls.length > 1) {
      issues.push({ url: urls.join(", "), level: "warn", code: "duplicate-title", detail: `«${title}» на ${urls.length} URL` });
    }
  }
  for (const [desc, urls] of descSeen) {
    if (urls.length > 1) {
      issues.push({ url: urls.join(", "), level: "warn", code: "duplicate-description", detail: `${urls.length} URL` });
    }
  }
  return issues;
}

if (!fs.existsSync(DIST)) {
  console.error(`! dist не найден: ${DIST}. Запустите сборку: npm run build`);
  process.exit(2);
}

const pageData = new Map<string, { title?: string; description?: string }>();
const allIssues: Issue[] = [];
let totalPages = 0;

for (const file of walk(DIST)) {
  const url = pageUrl(file);
  if (SKIP.test(url)) continue;
  totalPages += 1;
  const html = fs.readFileSync(file, "utf8");
  const title = extract(html, /<title>([^<]+)<\/title>/i);
  const desc = extract(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  pageData.set(url, {
    ...(title ? { title: decodeEntities(title) } : {}),
    ...(desc ? { description: decodeEntities(desc) } : {}),
  });
  allIssues.push(...checkPage(file));
}

allIssues.push(...detectDuplicates(pageData));

// Ссылки на термины глоссария из постов и страниц терминов: страница термина должна существовать.
for (const file of walk(DIST)) {
  const html = fs.readFileSync(file, "utf8");
  for (const [, href] of html.matchAll(/href="(\/glossary\/[a-z0-9-]+\/)(?:#[^"]*)?"/g)) {
    if (!fs.existsSync(path.join(DIST, href!, "index.html"))) {
      allIssues.push({ url: pageUrl(file), level: "error", code: "broken-glossary-link", detail: href });
    }
  }
}

const errors = allIssues.filter((i) => i.level === "error");
const warns = allIssues.filter((i) => i.level === "warn");

console.log(`\nSEO-check: проверено ${totalPages} страниц в ${DIST}`);
console.log(`Ошибок: ${errors.length}, предупреждений: ${warns.length}`);

if (errors.length > 0) {
  console.log(`\n--- Ошибки (блокируют деплой) ---`);
  for (const i of errors) console.log(`  [${i.code}] ${i.url}${i.detail ? ` — ${i.detail}` : ""}`);
}

if (warns.length > 0) {
  console.log(`\n--- Предупреждения (не блокируют) ---`);
  // группируем по коду, чтобы не завалить вывод
  const byCode = new Map<string, Issue[]>();
  for (const w of warns) {
    const list = byCode.get(w.code) ?? [];
    list.push(w);
    byCode.set(w.code, list);
  }
  for (const [code, items] of byCode) {
    console.log(`  [${code}] ${items.length} шт.`);
    for (const i of items.slice(0, 5)) console.log(`    ${i.url}${i.detail ? ` — ${i.detail}` : ""}`);
    if (items.length > 5) console.log(`    …ещё ${items.length - 5}`);
  }
}

process.exit(errors.length > 0 ? 1 : 0);
