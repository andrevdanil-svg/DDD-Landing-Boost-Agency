// npx tsx scripts/to-md.ts <address> <slug>
// Рерайтит материал через news-kit и сохраняет .md в ../src/content/blog/<slug>.md под схему
// src/content.config.ts лендинга. Публикация — вручную: проверить и закоммитить.

import fs from "node:fs/promises";
import path from "node:path";

import { createClaudeCliModel } from "../src/claude";
import { createNewsReader, type NewsMaterial } from "../src/reader";
import { rewriteNews } from "../src/rewrite";
import { newsLinkAddress, telegramPostAddress } from "../src/source";
import type { WrittenNewsPost } from "../src/writing";

const [address, slug] = process.argv.slice(2);
if (!address || !slug) {
  console.error("Usage: tsx scripts/to-md.ts <address> <slug>");
  process.exit(2);
}

async function material(link: string): Promise<NewsMaterial> {
  const reader = createNewsReader();
  const post = telegramPostAddress(link);
  if (post) return reader.telegramPost(post.embedUrl, post.handle, post.url);
  const url = newsLinkAddress(link);
  if (!url) throw new Error("Не похоже на ссылку на статью или пост Telegram.");
  return reader.article(url);
}

function yamlString(value: string): string {
  // Безопасная строка в YAML flow: экранируем кавычки, оборачиваем в двойные.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toMd(post: WrittenNewsPost, slugValue: string, sourceUrl: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const frontmatter: string[] = ["---"];
  frontmatter.push(`title: ${yamlString(post.title)}`);
  frontmatter.push(`description: ${yamlString(post.lead)}`);
  frontmatter.push(`rubric: ${yamlString(post.rubric)}`);
  frontmatter.push(`publishedAt: ${today}`);
  frontmatter.push(`author: "Boost! Agency"`);
  if (post.keyFigure) {
    frontmatter.push("keyFigure:");
    frontmatter.push(`  value: ${yamlString(post.keyFigure.value)}`);
    frontmatter.push(`  caption: ${yamlString(post.keyFigure.caption)}`);
  }
  if (post.visuals.highlights && post.visuals.highlights.length > 0) {
    frontmatter.push("highlights:");
    for (const h of post.visuals.highlights) frontmatter.push(`  - ${yamlString(h)}`);
  }
  frontmatter.push(`businessNote: ${yamlString(post.businessNote)}`);
  frontmatter.push(`tags: []`);
  frontmatter.push(`draft: true`); // всегда создаём черновиком — руками проверить и снять draft
  frontmatter.push("---");
  frontmatter.push("");

  const body: string[] = [];
  for (const para of post.paragraphs) {
    body.push(para.startsWith("## ") ? para : para);
    body.push("");
  }

  if (post.visuals.table) {
    body.push(`## ${post.visuals.table.title}`);
    body.push("");
    body.push(`| ${post.visuals.table.columns.join(" | ")} |`);
    body.push(`| ${post.visuals.table.columns.map(() => "---").join(" | ")} |`);
    for (const row of post.visuals.table.rows) body.push(`| ${row.join(" | ")} |`);
    body.push("");
  }

  body.push(`<!-- source: ${sourceUrl} · slug: ${slugValue} -->`);

  return [...frontmatter, ...body].join("\n");
}

const source = await material(address);
console.log(`→ материал: «${source.title}», ${source.text.length} знаков`);

const model = createClaudeCliModel(
  process.env.CLAUDE_CODE_OAUTH_TOKEN
    ? { token: process.env.CLAUDE_CODE_OAUTH_TOKEN }
    : {},
);

const result = await rewriteNews(source, model);
if (result.kind === "skip") {
  console.error(`! пропущено: ${result.reason}`);
  process.exit(1);
}

const dest = path.resolve(import.meta.dirname ?? ".", "..", "..", "src", "content", "blog", `${slug}.md`);
await fs.writeFile(dest, toMd(result.post, slug, source.url ?? address), "utf8");
console.log(`✓ ${dest}`);

if (result.warnings.length > 0) {
  console.log("\n⚠ предупреждения — проверить и доработать перед снятием draft:");
  for (const w of result.warnings) {
    if (w.kind === "copied") console.log(`  copied: ${w.phrases.map((p) => `«${p}»`).join("; ")}`);
    if (w.kind === "numbers") console.log(`  numbers (не нашлись в источнике): ${w.values.join(", ")}`);
  }
}
