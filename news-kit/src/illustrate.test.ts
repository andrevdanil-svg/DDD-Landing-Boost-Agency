import { describe, expect, it } from "vitest";

import { drawIllustrations, illustrationOrders, illustrateSystemPrompt, svgProblem } from "./illustrate";
import { NewsWriterError, type NewsWriterModel } from "./rewrite";
import { writeSystemPrompt } from "./writing";

const svg = (body = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#111119"/>${body}</svg>`;

// 2026-10-28: the source's screenshots showed a Ukrainian interface and prices in hryvnias. The writer
// adapts the post to Uzbekistan and orders its own pictures where none of the source's fits.
describe("own illustrations", () => {
  it("asks the writer for the Uzbek market and for its own pictures", () => {
    const system = writeSystemPrompt();
    expect(system).toContain("Пиши для рынка Узбекистана");
    expect(system).toContain("в сумах");
    expect(system).toContain("[[ILL:1|подпись]]");
    expect(illustrateSystemPrompt()).toContain("Никаких <image>, <script>");
  });

  it("takes the orders with the text each picture explains", () => {
    const orders = illustrationOrders(["## Шаг 1", "Откройте кабинет.", "[[ILL:1|Выбор типа объявления]]", "[[IMG:2|Скриншот]]", "Текст. [[ILL:2|Шкала]]", "[[ILL:1|повтор]]"]);
    expect(orders).toEqual([
      { caption: "Выбор типа объявления", context: "Откройте кабинет.", id: 1 },
      { caption: "Шкала", context: "Текст.", id: 2 },
    ]);
  });

  it("refuses an SVG that could reach outside or run code", () => {
    expect(svgProblem(svg('<text x="60" y="80">Ок</text>'))).toBeNull();
    expect(svgProblem(svg('<linearGradient id="g"/><rect fill="url(#g)"/>'))).toBeNull();
    for (const [body, reason] of [
      ["<script>alert(1)</script>", "forbidden element"],
      ['<image href="https://x/y.png"/>', "forbidden element"],
      ['<rect onclick="x()"/>', "event handler"],
      ['<rect fill="url(https://x/a)"/>', "external reference"],
      ['<foreignObject><div/></foreignObject>', "forbidden element"],
    ] as const) expect(svgProblem(svg(body))).toBe(reason);
    expect(svgProblem("<div>не svg</div>")).toBe("not a single <svg> element");
  });

  it("draws each picture on its own; a failed one costs only itself", async () => {
    const asked: string[] = [];
    const model: NewsWriterModel = {
      async complete(input) {
        asked.push(input.prompt);
        if (input.prompt.includes("Шкала")) throw new NewsWriterError("ai_timeout");
        if (input.prompt.includes("Плохая")) return { svg: svg("<script/>") };
        return { svg: svg() };
      },
    };
    const orders = illustrationOrders(["Абзац", "[[ILL:1|Окно]]", "[[ILL:2|Шкала]]", "[[ILL:3|Плохая]]"]);
    const drawn = await drawIllustrations({ paragraphs: [], title: "t" }, orders, model);
    expect(asked).toHaveLength(3);
    expect(drawn.map((item) => item.id)).toEqual([1]);
  });

  it("reports the failure when nothing could be drawn", async () => {
    const model: NewsWriterModel = { complete: async () => { throw new NewsWriterError("ai_limit"); } };
    await expect(drawIllustrations({ paragraphs: [], title: "t" }, illustrationOrders(["[[ILL:1|Окно]]"]), model))
      .rejects.toMatchObject({ code: "ai_limit" });
  });
});
