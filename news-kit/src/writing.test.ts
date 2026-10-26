import { describe, expect, it } from "vitest";

import {
  copiedPhrases,
  missingNumbers,
  numbersIn,
  parseWriterVerdict,
  postText,
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
    expect(prompt).toContain("Пожелание редактора к этому посту: короче");
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
    for (const broken of [
      null, "text", { ...answer, title: "Т".repeat(101) }, { ...answer, paragraphs: [] }, { ...answer, paragraphs: ["a", "b", "c", "d", "e", "f", "g"] },
      { ...answer, paragraphs: ["ok", 5] }, { ...answer, lead: "" }, { ...answer, coverTitle: undefined },
      { ...answer, rubric: "" }, { ...answer, rubric: "Р".repeat(25) },
    ]) expect(parseWriterVerdict(broken)).toBeNull();
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
