import { describe, expect, it } from "vitest";

import { factcheckPost, factcheckSystemPrompt, factcheckUserPrompt, fixUserPrompt, parseCheckedClaims } from "./factcheck";
import { NewsWriterError, type NewsWriterModel } from "./rewrite";
import { parseWriterVerdict, type WrittenNewsPost } from "./writing";

const answer = {
  businessNote: "Протестируйте формат.", chart: null, coverSubtitle: "Новый канал", coverTitle: "Реклама в ChatGPT",
  highlights: ["1,2 млрд в неделю"], keyFigure: { caption: "пользователей в неделю в мире", value: "1,2 млрд" },
  lead: "OpenAI открыла рекламу.", paragraphs: ["Абзац 1.", "[[ILL:1|Схема]]", "Абзац 2."], rubric: "Платформы",
  skip: false, skipReason: "", table: null, title: "Реклама в ChatGPT в Узбекистане",
};
const post = (parseWriterVerdict(answer) as { post: WrittenNewsPost }).post;

// 2026-10-28: «1,2 млрд» в шапке поста про Узбекистан и «100 тыс. рекламодателей» — без источников.
// Проверка фактов: поиск, ссылки на подтверждения, исправление неверного и неподтверждённого.
describe("fact check", () => {
  it("asks for primary sources, not the rewritten site, and leaves the editor's facts alone", () => {
    expect(factcheckSystemPrompt()).toContain("только из результатов поиска");
    const prompt = factcheckUserPrompt(post, { sourceUrl: "https://netpeak.net/ru/blog/x/", trusted: "Минимальный бюджет $25" });
    expect(prompt).toContain("<editor>\nМинимальный бюджет $25\n</editor>");
    expect(prompt).toContain("netpeak.net/ru/blog/x/ — этот сайт подтверждением не считается");
    expect(prompt).not.toContain("[[ILL:1");
  });

  it("does not take a confirmation without a source, nor a made-up address", () => {
    expect(parseCheckedClaims({ claims: [
      { claim: "1,2 млрд", correction: "", sourceTitle: "TechCrunch", sourceUrl: "https://techcrunch.com/a", verdict: "confirmed" },
      { claim: "100 тыс.", correction: "", sourceTitle: "x", sourceUrl: "", verdict: "confirmed" },
      { claim: "дата", correction: "", sourceTitle: "x", sourceUrl: "javascript:alert(1)", verdict: "corrected" },
      { claim: "", correction: "", sourceTitle: "", sourceUrl: "", verdict: "confirmed" },
    ] })).toEqual([
      { claim: "1,2 млрд", correction: "", sourceTitle: "TechCrunch", sourceUrl: "https://techcrunch.com/a", verdict: "confirmed" },
      { claim: "100 тыс.", correction: "", sourceTitle: "", sourceUrl: "", verdict: "unconfirmed" },
      { claim: "дата", correction: "", sourceTitle: "", sourceUrl: "", verdict: "corrected" },
    ]);
    expect(parseCheckedClaims({ nope: 1 })).toBeNull();
  });

  it("fixes the post only when something is wrong, keeping picture marks in the request", async () => {
    const kinds: string[] = [];
    const model: NewsWriterModel = {
      async complete(input) {
        kinds.push(input.kind);
        if (input.kind === "factcheck") return { claims: [{ claim: "1,2 млрд", correction: "", sourceTitle: "TC", sourceUrl: "https://techcrunch.com/a", verdict: "confirmed" }] };
        throw new Error("no fix expected");
      },
    };
    const clean = await factcheckPost(post, {}, model);
    expect(kinds).toEqual(["factcheck"]);
    expect(clean.fixed).toBe(false);

    kinds.length = 0;
    const fixing: NewsWriterModel = {
      async complete(input) {
        kinds.push(input.kind);
        if (input.kind === "factcheck") return { claims: [{ claim: "100 тыс. рекламодателей", correction: "", sourceTitle: "", sourceUrl: "", verdict: "unconfirmed" }] };
        expect(input.prompt).toContain("[[ILL:1|Схема]]");
        expect(input.prompt).toContain("«100 тыс. рекламодателей» не подтверждено");
        return { ...answer, paragraphs: ["Абзац 1 без цифры.", "[[ILL:1|Схема]]", "Абзац 2."] };
      },
    };
    const fixed = await factcheckPost(post, {}, fixing);
    expect(kinds).toEqual(["factcheck", "fix"]);
    expect(fixed.fixed).toBe(true);
    expect(fixed.post.paragraphs[0]).toBe("Абзац 1 без цифры.");
  });

  it("keeps the post as written when the fix fails", async () => {
    const model: NewsWriterModel = {
      async complete(input) {
        if (input.kind === "factcheck") return { claims: [{ claim: "x", correction: "y", sourceTitle: "s", sourceUrl: "https://s.uz/a", verdict: "corrected" }] };
        throw new NewsWriterError("ai_timeout");
      },
    };
    const result = await factcheckPost(post, {}, model);
    expect(result).toMatchObject({ fixed: false, post: { title: post.title } });
    expect(fixUserPrompt(post, result.claims)).toContain("«x» неверно; верно: y");
  });
});
