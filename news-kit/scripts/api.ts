// JSON API через stdin/stdout — для вызова из бэкенда платформы.
//
// Протокол: один JSON по stdin, один JSON по stdout. Любая ошибка → {"ok": false, "error": "..."}
//
// Запросы:
//   {"action": "preview", "input": "https://..." | "@channel" | "t.me/.../.."}
//     → {"ok": true, "material": {title, text, url?, publishedAt?, fullText, sourceType}}
//
//   {"action": "preview_html", "html": "..."}
//     → {"ok": true, "material": {title, text, fullText, sourceType: "newsletter"}}
//
//   {"action": "rewrite", "material": {title, text, instruction?}}
//     → {"ok": true, "post": {...}, "warnings": [...]}  или {"ok": true, "skip": true, "reason": "..."}

import { createClaudeCliModel } from "../src/claude";
import { factcheckPost } from "../src/factcheck";
import { drawIllustrations, illustrationOrders } from "../src/illustrate";
import { numbersIn, parseWriterVerdict, postText, type WrittenNewsPost } from "../src/writing";
import { renderSvg } from "../src/render";
import { createNewsReader, type NewsMaterial } from "../src/reader";
import { rewriteNews } from "../src/rewrite";
import { newsLinkAddress, telegramChannelAddress, telegramPostAddress } from "../src/source";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Пост, который вернул rewrite (и прошёл через backend), — обратно в WrittenNewsPost.
function writtenPost(value: unknown): WrittenNewsPost | null {
  const v = (value ?? {}) as Record<string, unknown> & { visuals?: Record<string, unknown> };
  const verdict = parseWriterVerdict({
    businessNote: v.businessNote, chart: v.visuals?.chart ?? null, coverSubtitle: v.coverSubtitle ?? "",
    coverTitle: v.coverTitle, highlights: v.visuals?.highlights ?? [], keyFigure: v.keyFigure ?? null,
    lead: v.lead, paragraphs: v.paragraphs, rubric: v.rubric, skip: false, skipReason: "",
    table: v.visuals?.table ?? null, title: v.title,
  });
  return verdict?.kind === "post" ? verdict.post : null;
}

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value));
}

async function previewFromUrl(input: string): Promise<unknown> {
  const reader = createNewsReader();
  // Telegram-пост
  const post = telegramPostAddress(input);
  if (post) {
    const m = await reader.telegramPost(post.embedUrl, post.handle, post.url);
    return { ok: true, material: { ...m, sourceType: "telegram_post" } };
  }
  // Telegram-канал (возвращаем первый пост)
  const channel = telegramChannelAddress(input);
  if (channel) {
    const feed = await reader.telegramChannel(channel.feedUrl, channel.handle);
    const first = feed.items[0];
    if (!first) return { ok: false, error: "Канал пуст или недоступен." };
    return { ok: true, material: { ...first, sourceType: "telegram_channel" } };
  }
  // Статья
  const url = newsLinkAddress(input);
  if (!url) return { ok: false, error: "Не похоже на ссылку на статью или пост Telegram." };
  const m = await reader.article(url);
  return { ok: true, material: { ...m, sourceType: "article" } };
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let req: Record<string, unknown>;
  try {
    req = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    out({ ok: false, error: "Невалидный JSON в stdin." });
    return;
  }

  const action = req.action;
  try {
    if (action === "preview") {
      const input = typeof req.input === "string" ? req.input : "";
      if (!input) throw new Error("input пустой");
      out(await previewFromUrl(input));
      return;
    }
    if (action === "preview_html") {
      const html = typeof req.html === "string" ? req.html : "";
      if (!html) throw new Error("html пустой");
      const reader = createNewsReader();
      const letter = reader.newsletter(html);
      out({
        ok: true,
        material: { title: letter.title, text: letter.text, fullText: true, sourceType: "newsletter" },
      });
      return;
    }
    if (action === "rewrite") {
      const material = req.material as NewsMaterial & { instruction?: string } | undefined;
      if (!material || typeof material.title !== "string" || typeof material.text !== "string") {
        throw new Error("material.title и material.text обязательны");
      }
      // Модель и бюджет времени задаёт backend (fallback между моделями — там).
      const writeModel = typeof req.model === "string" && req.model ? req.model : "sonnet";
      // Сколько backend ждёт этот вызов; оставляем 15 с на запуск node и ответ.
      const budgetMs = (typeof req.timeoutSec === "number" && req.timeoutSec > 30 ? req.timeoutSec : 240) * 1000 - 15_000;
      const deadline = Date.now() + budgetMs;
      const model = createClaudeCliModel({
        models: { write: writeModel },
        timeoutMs: budgetMs,
        ...(process.env.CLAUDE_CODE_OAUTH_TOKEN ? { token: process.env.CLAUDE_CODE_OAUTH_TOKEN } : {}),
      });
      const result = await rewriteNews(
        {
          title: material.title,
          text: material.text,
          ...(material.instruction ? { instruction: material.instruction } : {}),
        },
        model,
        AbortSignal.timeout(budgetMs),
        deadline,
      );
      if (result.kind === "skip") {
        out({ ok: true, skip: true, reason: result.reason });
        return;
      }
      out({ ok: true, post: result.post, warnings: result.warnings });
      return;
    }
    if (action === "factcheck") {
      // Проверка фактов поста веб-поиском + исправление неверного/неподтверждённого.
      const post = writtenPost(req.post);
      if (!post) throw new Error("post: нужен пост в формате rewrite");
      const budgetMs = (typeof req.timeoutSec === "number" && req.timeoutSec > 30 ? req.timeoutSec : 240) * 1000 - 15_000;
      const model = createClaudeCliModel({
        models: { factcheck: "opus", fix: "opus", write: "opus" },
        // Без «размышлений» — иначе каждый вызов в разы дольше (см. claude.ts).
        thinkingTokens: { factcheck: 0, fix: 0 },
        // Только поиск на стороне Anthropic: никаких загрузок страниц с этого сервера.
        tools: { factcheck: ["WebSearch"] },
        timeoutMs: budgetMs,
        ...(process.env.CLAUDE_CODE_OAUTH_TOKEN ? { token: process.env.CLAUDE_CODE_OAUTH_TOKEN } : {}),
      });
      const result = await factcheckPost(post, {
        ...(typeof req.sourceUrl === "string" ? { sourceUrl: req.sourceUrl } : {}),
        ...(typeof req.trusted === "string" ? { trusted: req.trusted } : {}),
      }, model, { deadline: Date.now() + budgetMs, signal: AbortSignal.timeout(budgetMs) });
      // «Цифры, которых нет в источнике» (warnings rewrite): исправленные проверкой из поста ушли.
      const left = new Set(numbersIn(postText(result.post)));
      const numbers = Array.isArray(req.numbers) ? req.numbers.filter((value): value is string => typeof value === "string" && left.has(value)) : [];
      out({ ok: true, claims: result.claims, fixed: result.fixed, numbers, post: result.post });
      return;
    }
    if (action === "illustrate") {
      // Свои иллюстрации к посту: метки [[ILL:n|подпись]] → SVG от Claude → PNG (base64).
      const post = req.post as { paragraphs?: unknown; title?: unknown } | undefined;
      const paragraphs = Array.isArray(post?.paragraphs) ? post.paragraphs.filter((item): item is string => typeof item === "string") : [];
      const title = typeof post?.title === "string" ? post.title : "";
      const orders = illustrationOrders(paragraphs);
      const budgetMs = (typeof req.timeoutSec === "number" && req.timeoutSec > 30 ? req.timeoutSec : 240) * 1000 - 15_000;
      const model = createClaudeCliModel({
        models: { illustrate: typeof req.model === "string" && req.model ? req.model : "opus", write: "opus" },
        // Без «размышлений»: иначе одна SVG — ~4 минуты вместо ~30 секунд.
        thinkingTokens: { illustrate: 0 },
        timeoutMs: budgetMs,
        ...(process.env.CLAUDE_CODE_OAUTH_TOKEN ? { token: process.env.CLAUDE_CODE_OAUTH_TOKEN } : {}),
      });
      const drawn = await drawIllustrations({ paragraphs, title }, orders, model, AbortSignal.timeout(budgetMs));
      const images: { id: number; png: string }[] = [];
      for (const item of drawn) {
        try {
          images.push({ id: item.id, png: renderSvg(item.svg).toString("base64") });
        } catch (error) {
          process.stderr.write(`[illustrator] svg ${item.id} not rendered: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
      out({ ok: true, images, ordered: orders.length });
      return;
    }
    out({ ok: false, error: `Неизвестный action: ${String(action)}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string } | null)?.code;
    out({ ok: false, error: message, ...(code ? { code } : {}) });
  }
}

await main();
