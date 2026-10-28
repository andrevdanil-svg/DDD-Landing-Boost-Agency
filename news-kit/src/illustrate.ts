// Own illustrations for a post: where the writer ordered one («[[ILL:1|подпись]]»), Claude draws an SVG
// in the blog's style from the caption and the paragraph it explains; render.ts turns it into a PNG.
// The SVG is held to a small safe subset — no scripts, images, external links — and is never served
// as SVG: only the rendered picture reaches the site.

import { NewsWriterError, type NewsWriterModel } from "./rewrite";

export type IllustrationOrder = Readonly<{ caption: string; context: string; id: number }>;
export type DrawnIllustration = Readonly<{ id: number; svg: string }>;

const mark = /\[\[ILL:(\d+)(?:\|([^\]]*))?\]\]/gu;
export const maxIllustrations = 4;
const maxSvg = 80_000;

// The writer's orders, with the text just before each (what the picture has to explain).
export function illustrationOrders(paragraphs: readonly string[]): readonly IllustrationOrder[] {
  const orders: IllustrationOrder[] = [];
  paragraphs.forEach((paragraph, index) => {
    for (const match of paragraph.matchAll(mark)) {
      const id = Number(match[1]);
      if (orders.some((order) => order.id === id) || orders.length >= maxIllustrations) continue;
      const before = paragraph.slice(0, match.index).replace(mark, "").trim()
        || paragraphs.slice(0, index).reverse().find((item) => !/^\[\[(?:ILL|IMG):/u.test(item.trim()) && !item.startsWith("!["))
        || "";
      orders.push(Object.freeze({ caption: (match[2] ?? "").trim(), context: before.slice(0, 700), id }));
    }
  });
  return Object.freeze(orders);
}

// One call per illustration, all at once: four SVGs in one answer took Opus ~4 minutes; one each in
// parallel takes as long as the slowest, and a failed one does not cost the others.
export const illustrateSchema = Object.freeze({
  additionalProperties: false,
  properties: { svg: { type: "string" } },
  required: ["svg"],
  type: "object",
});

export function illustrateSystemPrompt(): string {
  return [
    "Ты — иллюстратор блога Boost! Agency, рекламного агентства в Узбекистане. Рисуешь иллюстрации к посту в виде SVG. Правила:",
    '1. Одна иллюстрация — один корневой <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">. Только rect, circle, ellipse, line, polyline, polygon, path, text, tspan, g, defs, linearGradient, radialGradient, stop, clipPath. Никаких <image>, <script>, <style>, <foreignObject>, <use>, внешних ссылок и обработчиков событий.',
    "2. Стиль блога: фон всей картинки #111119, карточки и окна #1b1b26 со скруглением 16–24, обводки и разделители #2e2e3d, основной текст #f5f5f7, второстепенный #a8a8b4, акцент #655bfa (кнопки, выделения, заполненные шкалы, стрелки), успех #3ecf8e, предупреждение #ff8a5b. Шрифт везде font-family=\"Montserrat\" (font-weight 400, 600 или 700). Плоско, без теней и фотореализма.",
    "3. Что рисовать: схематичный макет экрана рекламного кабинета (поля, кнопки, счётчики символов, подсказки), схему шагов или простую диаграмму — так, чтобы картинка объясняла абзац рядом с ней. Все надписи — по-русски, кроме названий продуктов и терминов интерфейса (Google Ads, Ad Strength). Цифры, лимиты и названия — только как в посте. Цены в примерах — в сумах. Логотипы брендов не рисуй — только название текстом.",
    "4. SVG не переносит строки сам: каждая строка — отдельный <text> или <tspan>; при размере 22 — не длиннее 45 знаков, при 32 — не длиннее 30. Размер текста не меньше 20. Весь текст и все элементы — внутри 1200×675 с полями не меньше 48; текст внутри кнопок, полей и карточек — с отступом не меньше 16 от их краёв; ничего не должно наезжать друг на друга.",
    "Только буквы, цифры и обычные знаки препинания: никаких эмодзи и значков-символов (✓ ✗ ★ ● ▶) — галочки, стрелки и иконки рисуй через path и line.",
    "5. Держи картинку простой: до 60 элементов, без мелких декоративных деталей — она должна читаться с телефона.",
  ].join("\n");
}

export function illustrateUserPrompt(post: Readonly<{ paragraphs: readonly string[]; title: string }>, order: IllustrationOrder): string {
  const text = post.paragraphs.filter((paragraph) => !/^\[\[(?:ILL|IMG):/u.test(paragraph.trim()) && !paragraph.startsWith("![")).join("\n\n");
  return `<post>\nЗаголовок: ${post.title}\n\n${text.slice(0, 9000)}\n</post>\n\n`
    + `Нарисуй одну иллюстрацию: ${order.caption || "иллюстрация к абзацу"}.\nОна стоит сразу после абзаца: «${order.context}»`;
}

// Why an SVG cannot be rendered safely (null — it can).
export function svgProblem(svg: string): string | null {
  const value = svg.trim();
  if (!/^<svg[\s>]/u.test(value) || !/<\/svg>\s*$/u.test(value)) return "not a single <svg> element";
  if (value.length > maxSvg) return `too large (${value.length} > ${maxSvg})`;
  if (/<\s*(?:script|foreignObject|image|use|style|iframe|a)\b/iu.test(value)) return "forbidden element";
  if (/\son[a-z]+\s*=/iu.test(value)) return "event handler";
  if (/(?:href|src)\s*=\s*["']\s*(?!#)/iu.test(value) || /url\(\s*['"]?\s*(?!#)/iu.test(value) || /@import/iu.test(value)) return "external reference";
  return null;
}

export async function drawIllustrations(
  post: Readonly<{ paragraphs: readonly string[]; title: string }>,
  orders: readonly IllustrationOrder[],
  model: NewsWriterModel,
  signal?: AbortSignal,
): Promise<readonly DrawnIllustration[]> {
  if (orders.length === 0) return [];
  const results = await Promise.allSettled(orders.map((order) => model.complete({
    kind: "illustrate",
    prompt: illustrateUserPrompt(post, order),
    schema: illustrateSchema,
    ...(signal ? { signal } : {}),
    system: illustrateSystemPrompt(),
  })));
  const drawn: DrawnIllustration[] = [];
  results.forEach((result, index) => {
    const id = orders[index]!.id;
    if (result.status === "rejected") {
      const code = result.reason instanceof NewsWriterError ? result.reason.code : "error";
      process.stderr.write(`[illustrator] svg ${id} failed: ${code}\n`);
      return;
    }
    const svg = String((result.value as { svg?: unknown } | null)?.svg ?? "");
    const problem = svgProblem(svg);
    if (problem) {
      process.stderr.write(`[illustrator] svg ${id} rejected: ${problem}\n`);
      return;
    }
    drawn.push(Object.freeze({ id, svg: svg.trim() }));
  });
  // Nothing drawn at all is a failure the caller should see (limit, auth, timeout).
  const firstError = results.find((result) => result.status === "rejected");
  if (drawn.length === 0 && firstError?.status === "rejected") {
    throw firstError.reason instanceof NewsWriterError ? firstError.reason : new NewsWriterError("ai_failed");
  }
  return Object.freeze(drawn);
}
