import { describe, expect, it } from "vitest";

import { applyClaimEdits, factcheckPost, factcheckSystemPrompt, factcheckUserPrompt, parseCheckedClaims, type CheckedClaim } from "./factcheck";
import { NewsWriterError, type NewsWriterModel } from "./rewrite";
import { parseWriterVerdict, type WrittenNewsPost } from "./writing";

const answer = {
  businessNote: "Протестируйте формат с бюджетом $25.", chart: null, coverSubtitle: "Новый канал", coverTitle: "Реклама в ChatGPT",
  highlights: ["1,2 млрд в неделю"], keyFigure: { caption: "пользователей ChatGPT в неделю", value: "1,2 млрд" },
  lead: "27 октября OpenAI открыла рекламу.", paragraphs: ["Абзац 1: 27 октября запуск.", "[[ILL:1|Схема]]", "Аудитория ChatGPT — 1,2 млрд в неделю.\n— пункт один\n— пункт два"], rubric: "Платформы",
  skip: false, skipReason: "", table: null, title: "Реклама в ChatGPT в Узбекистане",
};
const post = (parseWriterVerdict(answer) as { post: WrittenNewsPost }).post;
const claim = (overrides: Partial<CheckedClaim>): CheckedClaim => ({
  claim: "x", correction: "", edits: [], sourceTitle: "", sourceUrl: "", verdict: "corrected", ...overrides,
});

// 2026-10-28: «1,2 млрд» в шапке поста про Узбекистан и «100 тыс. рекламодателей» — без источников.
// Проверка фактов: поиск, ссылки на подтверждения, исправление неверного и неподтверждённого.
describe("fact check", () => {
  it("asks for primary sources, not the rewritten site, and leaves the editor's facts alone", () => {
    expect(factcheckSystemPrompt()).toContain("только из результатов поиска");
    const prompt = factcheckUserPrompt(post, { sourceUrl: "https://netpeak.net/ru/blog/x/", trusted: "Минимальный бюджет $25" });
    expect(prompt).toContain("<editor>\nМинимальный бюджет $25\n</editor>");
    expect(prompt).toContain("netpeak.net/ru/blog/x/ — этот сайт подтверждением не считается");
    expect(prompt).not.toContain("[[ILL:1");
    // Абзацы пронумерованы как в посте — с картинками, чтобы правка попала на место.
    expect(prompt).toContain("Абзац 1: Абзац 1: 27 октября запуск.");
    expect(prompt).toContain("Абзац 3: Аудитория ChatGPT");
    expect(prompt).toContain("Главная цифра — подпись: пользователей ChatGPT в неделю");
  });

  // 2026-10-28: в шапке — «1,2 млрд пользователей ChatGPT в неделю» без «в мире»; одна проверка это
  // исправляла, следующая — нет. Правило про географию цифр — явное.
  it("demands the territory of every market figure and a local main figure", () => {
    const system = factcheckSystemPrompt();
    expect(system).toContain("это corrected, даже если сама цифра верна");
    expect(system).toContain("Uzbekistan users");
    expect(system).toContain("подпись главной цифры явно говорит «в мире»");
    expect(system).toContain("Не добавляй утверждений, которых нет в найденных источниках");
  });

  // 2026-10-29: проверка каждого утверждения (15–25 поисков Opus) и второй вызов Opus, переписывающий
  // весь пост ради двух фраз, съедали большую часть лимита и на длинной статье не успевали.
  it("is bounded: a few key claims, a few searches", () => {
    expect(factcheckSystemPrompt()).toContain("Выбери не больше 6 самых важных");
    expect(factcheckSystemPrompt()).toContain("Поисков — не больше 6");
  });

  // 2026-10-29: цифры кейса из самой статьи («60 конверсий по последнему клику») поиск не находил —
  // проверка их вычёркивала, гайд терял конкретику, а поиски тратились впустую.
  it("leaves the article's own example data alone, only making it read as an example", () => {
    expect(factcheckSystemPrompt()).toContain("Не проверяй и данные примера или кейса из самой статьи");
  });

  it("does not take a confirmation without a source, nor a made-up address", () => {
    expect(parseCheckedClaims({ claims: [
      { claim: "1,2 млрд", correction: "", edits: [], sourceTitle: "TechCrunch", sourceUrl: "https://techcrunch.com/a", verdict: "confirmed" },
      { claim: "100 тыс.", correction: "", edits: [{ find: "100 тыс.", place: "Абзац 1", replace: "" }], sourceTitle: "x", sourceUrl: "", verdict: "confirmed" },
      { claim: "дата", correction: "", edits: [], sourceTitle: "x", sourceUrl: "javascript:alert(1)", verdict: "corrected" },
      { claim: "", correction: "", edits: [], sourceTitle: "", sourceUrl: "", verdict: "confirmed" },
    ] })).toEqual([
      { claim: "1,2 млрд", correction: "", edits: [], sourceTitle: "TechCrunch", sourceUrl: "https://techcrunch.com/a", verdict: "confirmed" },
      { claim: "100 тыс.", correction: "", edits: [{ find: "100 тыс.", place: "Абзац 1", replace: "" }], sourceTitle: "", sourceUrl: "", verdict: "unconfirmed" },
      { claim: "дата", correction: "", edits: [], sourceTitle: "", sourceUrl: "", verdict: "corrected" },
    ]);
    expect(parseCheckedClaims({ nope: 1 })).toBeNull();
  });

  it("applies exact edits in their places, everywhere the figure is", () => {
    const { applied, post: fixed } = applyClaimEdits(post, [
      claim({ edits: [
        { find: "27 октября", place: "Лид", replace: "21 октября" },
        { find: "27 октября", place: "Абзац 1", replace: "21 октября" },
      ] }),
      claim({ edits: [
        { find: "пользователей ChatGPT в неделю", place: "Главная цифра — подпись", replace: "пользователей ChatGPT в неделю в мире" },
        // Метка не та — но фрагмент есть ровно в одном месте.
        { find: "Аудитория ChatGPT — 1,2 млрд в неделю.", place: "Абзац 2", replace: "Аудитория ChatGPT в мире — 1,2 млрд в неделю." },
      ] }),
      claim({ verdict: "confirmed" }),
    ]);
    expect(applied).toEqual([true, true, false]);
    expect(fixed.lead).toBe("21 октября OpenAI открыла рекламу.");
    expect(fixed.keyFigure).toEqual({ caption: "пользователей ChatGPT в неделю в мире", value: "1,2 млрд" });
    expect(fixed.paragraphs).toEqual([
      "Абзац 1: 21 октября запуск.", "[[ILL:1|Схема]]", "Аудитория ChatGPT в мире — 1,2 млрд в неделю.\n— пункт один\n— пункт два",
    ]);
    expect(fixed.businessNote).toBe(post.businessNote);
  });

  it("skips an edit it cannot place, a hero figure that would not fit, and keeps «$25» literal", () => {
    const { applied, post: fixed } = applyClaimEdits(post, [
      claim({ edits: [{ find: "нет такого текста", place: "Лид", replace: "x" }] }),
      claim({ edits: [{ find: "1,2 млрд", place: "Главная цифра — значение", replace: "1,2 млрд в неделю в мире" }] }),
      claim({ edits: [{ find: "с бюджетом $25.", place: "Что это значит для рекламодателя", replace: "с бюджетом от $25 в день." }] }),
    ]);
    expect(applied).toEqual([false, false, true]);
    expect(fixed.keyFigure?.value).toBe("1,2 млрд");
    expect(fixed.businessNote).toBe("Протестируйте формат с бюджетом от $25 в день.");
  });

  it("removes an unconfirmed sentence and drops a paragraph left empty", () => {
    const { post: fixed } = applyClaimEdits(post, [
      claim({ verdict: "unconfirmed", edits: [{ find: "Абзац 1: 27 октября запуск.", place: "Абзац 1", replace: "" }] }),
    ]);
    expect(fixed.paragraphs).toEqual(["[[ILL:1|Схема]]", "Аудитория ChatGPT — 1,2 млрд в неделю.\n— пункт один\n— пункт два"]);
  });

  it("checks and fixes in one call", async () => {
    const kinds: string[] = [];
    const model: NewsWriterModel = {
      async complete(input) {
        kinds.push(input.kind);
        return { claims: [
          { claim: "27 октября", correction: "21 октября", edits: [{ find: "27 октября", place: "Лид", replace: "21 октября" }], sourceTitle: "OpenAI", sourceUrl: "https://openai.com/a", verdict: "corrected" },
          { claim: "$25", correction: "", edits: [], sourceTitle: "Help", sourceUrl: "https://help.openai.com/b", verdict: "confirmed" },
        ] };
      },
    };
    const result = await factcheckPost(post, {}, model);
    expect(kinds).toEqual(["factcheck"]);
    expect(result.fixed).toBe(true);
    expect(result.post.lead).toBe("21 октября OpenAI открыла рекламу.");
    expect(result.claims.map((item) => item.fixed)).toEqual([true, false]);
  });

  it("reports a failed check as the model's error", async () => {
    const model: NewsWriterModel = { async complete() { throw new NewsWriterError("ai_timeout"); } };
    await expect(factcheckPost(post, {}, model)).rejects.toMatchObject({ code: "ai_timeout" });
  });
});
