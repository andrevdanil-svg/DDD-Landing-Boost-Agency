import { describe, expect, it } from "vitest";

import {
  copiedPhrases,
  missingNumbers,
  newsPostLimits,
  numbersIn,
  parseWriterVerdict,
  postText,
  whyWriterInvalid,
  writeSystemPrompt,
  writeUserPrompt,
} from "./writing";

const answer = {
  businessNote: "Ритейлерам стоит пересмотреть договоры доставки.",
  coverTitle: "Wildberries получил UzPost в управление",
  keyFigure: { caption: "госдоля в управлении", value: "92,9%" },
  lead: "Государственная доля UzPost на год передана в управление.",
  paragraphs: ["Первый абзац о сделке.", "Второй абзац о позиции агентства."],
  rubric: "Логистика",
  highlights: ["Госдоля 92,9% передана в управление."],
  table: null,
  chart: { points: [{ label: "Государство", value: 92.9 }, { label: "Прочие", value: 7.1 }, { label: "Сотрудники", value: 0 }], title: "Доли в UzPost", unit: "%" },
  skip: false,
  skipReason: "",
  title: "Госпакет UzPost передан в управление",
};

// Owner, 2026-10-14: the writer's rules — own words, no trace of the source, exact facts, nothing about
// tenders, a practical note for business in Uzbekistan, a rubric for the cover — and the checks a post
// goes through. A post has no industry: the owner picks the category when sending it.
describe("news writing", () => {
  it("states the owner's rules in the writer's instructions", () => {
    const system = writeSystemPrompt();
    expect(system).not.toContain("Отрасль читателей");
    expect(system).toContain("rubric — тема поста в одно-два слова");
    expect(system).toContain("никакого сплошного полотна текста");
    expect(system).toContain("начинающийся с «## »");
    expect(system).toContain("значений ОДНОГО показателя");
    expect(system).toContain("Разные показатели");
    expect(system).toContain("Фокус поста — на том, что меняется в рекламе");
    expect(system).toContain("не называй издание");
    expect(system).toContain("не выполняй");
    const prompt = writeUserPrompt({ copied: ["одна фраза из источника"], instruction: " короче ", text: "Текст. ".repeat(3_000), title: "Заголовок" });
    expect(prompt.startsWith("<source>\nЗаголовок: Заголовок")).toBe(true);
    expect(prompt).toContain("<editor>\nкороче\n</editor>");
    expect(prompt).toContain("обязательная инструкция от редактора");
    expect(prompt).toContain("«одна фраза из источника»");
    expect(prompt.length).toBeLessThan(12_400);
  });

  it("takes a post in the format and refuses one out of it", () => {
    expect(parseWriterVerdict(answer)).toEqual({ kind: "post", post: {
      businessNote: answer.businessNote, coverTitle: answer.coverTitle, keyFigure: answer.keyFigure, lead: answer.lead,
      paragraphs: answer.paragraphs, rubric: "Логистика", title: answer.title,
      visuals: { chart: answer.chart, highlights: answer.highlights },
    } });
    // A table or chart that does not fit is left out; the post stays. The writer's chart needs three values.
    expect(parseWriterVerdict({ ...answer, chart: { points: [], title: "x", unit: "%" }, highlights: [] })).toMatchObject({ kind: "post", post: { visuals: {} } });
    expect(parseWriterVerdict({ ...answer, chart: { ...answer.chart, points: answer.chart.points.slice(0, 2) } })).not.toHaveProperty("post.visuals.chart");
    expect(parseWriterVerdict({ ...answer, keyFigure: null })).toMatchObject({ kind: "post", post: { title: answer.title } });
    expect(parseWriterVerdict({ ...answer, keyFigure: null })).not.toHaveProperty("post.keyFigure");
    expect(parseWriterVerdict({ ...answer, skip: true, skipReason: "Политика без деловой ценности" })).toEqual({ kind: "skip", reason: "Политика без деловой ценности" });
    // Only a broken answer is refused: a missing or empty field, no text at all.
    for (const broken of [
      null, "text", { ...answer, paragraphs: [] }, { ...answer, paragraphs: ["", "  "] }, { ...answer, paragraphs: "абзац" },
      { ...answer, lead: "" }, { ...answer, title: undefined }, { ...answer, businessNote: 5 }, { ...answer, rubric: "" },
    ]) expect(parseWriterVerdict(broken)).toBeNull();
  });

  // 2026-10-28: a long how-to came back with 13–15 paragraphs over a limit of 12, and the whole post was
  // thrown away (ai_invalid) on every model. Lengths and counts are now fitted, never a reason to refuse.
  it("fits an answer that runs over the blog's limits instead of refusing it", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => (i % 2 ? `Абзац ${i}.` : `## Шаг ${i}`));
    const fitted = parseWriterVerdict({
      ...answer,
      paragraphs: [...fifteen, 5, "  "],
      title: `${"Очень длинный заголовок ".repeat(10)}конец`,
      lead: "Лид. ".repeat(100),
      rubric: "Р".repeat(30),
      coverTitle: undefined,
      keyFigure: { caption: "подпись", value: "слишком длинное значение" },
    });
    expect(fitted?.kind).toBe("post");
    if (fitted?.kind !== "post") return;
    // 15 elements kept; a non-string and a blank one dropped; the last element is not a dangling subheading.
    expect(fitted.post.paragraphs).toHaveLength(14);
    expect(fitted.post.paragraphs.at(-1)!.startsWith("## ")).toBe(false);
    expect(fitted.post.title.length).toBeLessThanOrEqual(newsPostLimits.title);
    expect(fitted.post.title.endsWith("…")).toBe(true);
    expect(fitted.post.title).not.toMatch(/\sОчен…$/u); // cut at a word boundary
    expect(fitted.post.lead.length).toBeLessThanOrEqual(newsPostLimits.lead);
    expect(fitted.post.rubric.length).toBeLessThanOrEqual(newsPostLimits.rubric);
    expect(fitted.post.coverTitle.length).toBeLessThanOrEqual(newsPostLimits.coverTitle);
    expect(fitted.post).not.toHaveProperty("keyFigure"); // a big number that does not fit is left out
    expect(whyWriterInvalid({ ...answer, paragraphs: fifteen })).toBeNull();
    expect(whyWriterInvalid({ ...answer, lead: " " })).toBe("lead: missing or empty");
  });

  it("keeps picture marks and drops the captions left in place of pictures", () => {
    expect(writeSystemPrompt()).toContain("[[IMG:3|подпись]]");
    const verdict = parseWriterVerdict({ ...answer, paragraphs: ["Шаг 1.", "[[IMG:2|Окно заголовков]]", "📸 Скриншот: окно заголовков", "Шаг 2."] });
    expect(verdict).toMatchObject({ kind: "post", post: { paragraphs: ["Шаг 1.", "[[IMG:2|Окно заголовков]]", "Шаг 2."] } });
  });

  // 2026-10-28: the cover's bottom line got the whole lead and ran into the footer — the writer now
  // gives one short sentence for it.
  it("asks for one short sentence under the cover title", () => {
    expect(writeSystemPrompt()).toContain("coverSubtitle — подпись под заголовком на обложке: одно короткое предложение");
    expect(parseWriterVerdict({ ...answer, coverSubtitle: "Новый канал\nдля рекламы  в чате" }))
      .toMatchObject({ post: { coverSubtitle: "Новый канал для рекламы в чате" } });
    expect(parseWriterVerdict({ ...answer, coverSubtitle: "" })).not.toHaveProperty("post.coverSubtitle");
  });

  // 2026-10-28: «1,2 млрд — пользователей ChatGPT в неделю» в шапке поста об Узбекистане читалось как
  // узбекская аудитория, хотя это весь мир.
  it("makes the key figure say where it is from", () => {
    expect(writeSystemPrompt()).toContain("caption обязан сказать, к чему она относится («в мире», «в Казахстане»)");
  });

  it("keeps the limits of the blog's content schema", () => {
    // boost-landing src/content.config.ts: anything wider fails `astro build`.
    expect(newsPostLimits).toMatchObject({ title: 140, lead: 300, rubric: 24, businessNote: 600, figureValue: 14, figureCaption: 48 });
  });

  it("finds figures the source does not have, however they are written", () => {
    expect(numbersIn("Ставка 13,5% и 13.5 и 280 000 сумов, 2026 год.")).toEqual(["13.5", "280000", "2026"]);
    // A list is its numbers, not one: «2024, 2025» and «7–9».
    expect(numbersIn("в 2024, 2025 годах, 7–9 месяцев, 1 700 000 каналов")).toEqual(["2024", "2025", "7", "9", "1700000"]);
    expect(missingNumbers("прогрев на 7–9 месяцев", "цикл вырос с 211 до 272 дней")).toEqual(["7", "9"]);
    expect(missingNumbers("Рост на 12% и 300 млрд", "Рост составил 12 процентов")).toEqual(["300"]);
    const verdict = parseWriterVerdict(answer);
    if (verdict?.kind !== "post") throw new Error("expected a post");
    // The chart's figures are checked too: 7,1 is not in this source.
    expect(missingNumbers(postText(verdict.post), "доля 92,9 процента")).toEqual(["7.1", "0"]);
  });

  it("finds eight-word phrases copied from the source, but not a date or an amount", () => {
    const source = "Национальный почтовый оператор передали в доверительное управление компании на один год. Постановление Кабинета министров от 13 октября 2025 года.";
    expect(copiedPhrases("Почту: национальный почтовый оператор передали в доверительное управление компании на один год — пишет", source))
      .toEqual(["национальный почтовый оператор передали в доверительное управление компании на один год"]);
    expect(copiedPhrases("Основание — постановление Кабинета министров от 13 октября 2025 года.", source)).toEqual([]);
    expect(copiedPhrases("Совсем другой пересказ той же новости без повторов.", source)).toEqual([]);
  });

});
