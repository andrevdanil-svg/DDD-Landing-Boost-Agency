import { describe, expect, it } from "vitest";

import { newsChartValue, newsVisualsFromText, newsVisualsPlainText, newsVisualsText, parseNewsVisuals } from "./visuals";

const visuals = {
  chart: { points: [{ label: "2024", value: 152 }, { label: "2025", value: 70 }], title: "Медианный охват поста", unit: "просмотров" },
  highlights: ["Охваты упали на 53%.", "Реклама держится стабильно."],
  table: { columns: ["Формат", "Доля"], rows: [["Посты", "61%"], ["Истории", "12,5%"]], title: "Форматы рекламы" },
};

// Owner, 2026-10-14: a post is no wall of text — «Главное», a table, a chart, from the source's figures.
describe("news post visuals", () => {
  it("takes what fits from the writer and leaves out what does not", () => {
    expect(parseNewsVisuals(visuals)).toEqual(visuals);
    expect(parseNewsVisuals({
      chart: { points: [{ label: "один", value: 1 }], title: "Мало точек", unit: "%" },
      highlights: ["  Пункт  ", "", 5, "Пункт два", "три", "четыре", "пять"],
      table: { columns: ["A", "B"], rows: [["1", "2", "3"]], title: "Строка не той ширины" },
    })).toEqual({ highlights: ["Пункт", "Пункт два", "три", "четыре"] });
    expect(parseNewsVisuals(null)).toEqual({});
    expect(parseNewsVisuals({ chart: null, highlights: [], table: null })).toEqual({});
  });

  it("writes numbers the Russian way and puts the unit after them", () => {
    expect(newsChartValue(53, "%")).toBe("53%");
    expect(newsChartValue(1_700_000, "каналов")).toBe("1 700 000 каналов");
    expect(newsChartValue(12.5, "")).toBe("12,5");
    expect(newsChartValue(-3, "п.п.")).toBe("−3 п.п.");
  });

  it("gives the checks every figure and word of the visuals", () => {
    const text = newsVisualsPlainText(visuals);
    expect(text).toContain("Охваты упали на 53%.");
    expect(text).toContain("Истории 12,5%");
    expect(text).toContain("2025 70 просмотров");
  });

  it("goes to the owner's text and back unchanged", () => {
    const text = newsVisualsText(visuals);
    expect(text).toEqual({
      chart: "Медианный охват поста\n2024 — 152 просмотров\n2025 — 70 просмотров",
      highlights: "Охваты упали на 53%.\nРеклама держится стабильно.",
      table: "Форматы рекламы\nФормат | Доля\nПосты | 61%\nИстории | 12,5%",
    });
    expect(newsVisualsFromText(text)).toEqual({ visuals });
    expect(newsVisualsFromText({ chart: "", highlights: "", table: "" })).toEqual({ visuals: {} });
    expect(newsVisualsFromText({ chart: "Доля\nПервый — 53%\nВторой – 12,5 %\nТретий - −2%", highlights: "", table: "" })).toEqual({
      visuals: { chart: { points: [{ label: "Первый", value: 53 }, { label: "Второй", value: 12.5 }, { label: "Третий", value: -2 }], title: "Доля", unit: "%" } },
    });
  });

  it("names the part the owner wrote wrong", () => {
    expect(newsVisualsFromText({ chart: "", highlights: "1\n2\n3\n4\n5", table: "" })).toEqual({ error: "highlights" });
    expect(newsVisualsFromText({ chart: "", highlights: "", table: "Таблица\nA | B\n1 | 2 | 3" })).toEqual({ error: "table" });
    expect(newsVisualsFromText({ chart: "", highlights: "", table: "Только заголовок" })).toEqual({ error: "table" });
    expect(newsVisualsFromText({ chart: "Диаграмма\nбез числа", highlights: "", table: "" })).toEqual({ error: "chart" });
    expect(newsVisualsFromText({ chart: "Одна точка\nА — 1", highlights: "", table: "" })).toEqual({ error: "chart" });
  });
});
