// A post read on a phone is no wall of text: «Главное» in a few points, a table when the source compares
// things, a chart when it gives a row of comparable numbers — all from the source's own figures. The
// writer's JSON is checked here (parseNewsVisuals); the text forms below let a person edit them: a point
// per line; a table as its title, then « | »-separated columns and rows; a chart as its title, then
// «подпись — число единица» per line.

export type NewsPostTable = Readonly<{ columns: readonly string[]; rows: readonly (readonly string[])[]; title: string }>;
export type NewsPostChartPoint = Readonly<{ label: string; value: number }>;
export type NewsPostChart = Readonly<{ points: readonly NewsPostChartPoint[]; title: string; unit: string }>;
export type NewsPostVisuals = Readonly<{ chart?: NewsPostChart; highlights?: readonly string[]; table?: NewsPostTable }>;

export const newsVisualLimits = Object.freeze({
  cell: 48,
  chartLabel: 32,
  chartPoints: 8,
  highlight: 160,
  highlights: 4,
  tableColumns: 4,
  tableRows: 8,
  title: 80,
  unit: 16,
});

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

// A text fitted into max characters: cut at the last word boundary, ended with «…».
export function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.search(/\s\S*$/u);
  const head = space >= max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:.—–-]+$/u, "")}…`;
}

function highlightsOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/gu, " ").trim() : ""))
    .filter((item) => item.length > 0)
    .map((item) => clip(item, newsVisualLimits.highlight));
  return points.length >= 1 ? Object.freeze(points.slice(0, newsVisualLimits.highlights)) : undefined;
}

function tableOf(value: unknown): NewsPostTable | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const title = clean(record.title, newsVisualLimits.title);
  if (!title || !Array.isArray(record.columns) || !Array.isArray(record.rows)) return undefined;
  const columns = record.columns.map((column) => clean(column, newsVisualLimits.cell));
  if (columns.length < 2 || columns.length > newsVisualLimits.tableColumns || columns.some((column) => column === null)) return undefined;
  const rows = record.rows.map((row) => Array.isArray(row) && row.length === columns.length ? row.map((cell) => clean(cell, newsVisualLimits.cell)) : null);
  if (rows.length < 1 || rows.length > newsVisualLimits.tableRows || rows.some((row) => row === null || row.some((cell) => cell === null))) return undefined;
  return Object.freeze({ columns: Object.freeze(columns as string[]), rows: Object.freeze(rows.map((row) => Object.freeze(row as string[]))), title });
}

function chartOf(value: unknown): NewsPostChart | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const title = clean(record.title, newsVisualLimits.title);
  const unit = typeof record.unit === "string" ? record.unit.replace(/\s+/gu, " ").trim() : "";
  if (!title || unit.length > newsVisualLimits.unit || !Array.isArray(record.points)) return undefined;
  const points = record.points.map((point) => {
    if (!point || typeof point !== "object") return null;
    const label = clean((point as Record<string, unknown>).label, newsVisualLimits.chartLabel);
    const number = (point as Record<string, unknown>).value;
    return label && typeof number === "number" && Number.isFinite(number) ? Object.freeze({ label, value: number }) : null;
  });
  if (points.length < 2 || points.length > newsVisualLimits.chartPoints || points.some((point) => point === null)) return undefined;
  return Object.freeze({ points: Object.freeze(points as NewsPostChartPoint[]), title, unit });
}

// What the writer gave or the database keeps, the parts that do not fit left out.
export function parseNewsVisuals(value: unknown): NewsPostVisuals {
  if (!value || typeof value !== "object") return Object.freeze({});
  const record = value as Record<string, unknown>;
  const highlights = highlightsOf(record.highlights);
  const table = tableOf(record.table);
  const chart = chartOf(record.chart);
  return Object.freeze({ ...(chart ? { chart } : {}), ...(highlights ? { highlights } : {}), ...(table ? { table } : {}) });
}

// A number as Russian text: «12,5», «1 700 000».
export function formatNewsNumber(value: number): string {
  const [whole, fraction] = Math.abs(value).toString().split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${value < 0 ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

// «53%» or «280 млрд сумов».
export function newsChartValue(value: number, unit: string): string {
  if (!unit) return formatNewsNumber(value);
  return /^[%‰°]/u.test(unit) ? `${formatNewsNumber(value)}${unit}` : `${formatNewsNumber(value)} ${unit}`;
}

// Everything the visuals say, for the checks of figures and copied phrases.
export function newsVisualsPlainText(visuals: NewsPostVisuals): string {
  return [
    ...(visuals.highlights ?? []),
    ...(visuals.table ? [visuals.table.title, visuals.table.columns.join(" "), ...visuals.table.rows.map((row) => row.join(" "))] : []),
    ...(visuals.chart ? [visuals.chart.title, ...visuals.chart.points.map((point) => `${point.label} ${newsChartValue(point.value, visuals.chart!.unit)}`)] : []),
  ].join("\n");
}

export type NewsVisualsText = Readonly<{ chart: string; highlights: string; table: string }>;

export function newsVisualsText(visuals: NewsPostVisuals): NewsVisualsText {
  return {
    chart: visuals.chart
      ? [visuals.chart.title, ...visuals.chart.points.map((point) => `${point.label} — ${newsChartValue(point.value, visuals.chart!.unit)}`)].join("\n")
      : "",
    highlights: (visuals.highlights ?? []).join("\n"),
    table: visuals.table ? [visuals.table.title, visuals.table.columns.join(" | "), ...visuals.table.rows.map((row) => row.join(" | "))].join("\n") : "",
  };
}

function lines(value: string): string[] {
  return value.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
}

// The owner's text back into visuals; null names the part that does not fit, so the form can say which.
export function newsVisualsFromText(input: NewsVisualsText): Readonly<{ visuals: NewsPostVisuals } | { error: "chart" | "highlights" | "table" }> {
  const points = lines(input.highlights);
  if (points.length > newsVisualLimits.highlights || points.some((point) => point.length > newsVisualLimits.highlight)) return { error: "highlights" };

  let table: NewsPostTable | undefined;
  const tableLines = lines(input.table);
  if (tableLines.length > 0) {
    const [title, header, ...rows] = tableLines;
    table = tableOf({ columns: header?.split("|") ?? [], rows: rows.map((row) => row.split("|")), title });
    if (!table) return { error: "table" };
  }

  let chart: NewsPostChart | undefined;
  const chartLines = lines(input.chart);
  if (chartLines.length > 0) {
    const [title, ...rows] = chartLines;
    let unit: string | undefined;
    const parsed = rows.map((row) => {
      const match = /^(.+?)\s+[—–-]\s+(−|-)?(\d[\d\s ]*(?:[.,]\d+)?)\s*(.*)$/u.exec(row);
      if (!match) return null;
      const value = Number(`${match[2] ? "-" : ""}${match[3]!.replace(/[\s ]/gu, "").replace(",", ".")}`);
      unit ??= match[4]!.trim();
      return { label: match[1]!, value };
    });
    chart = parsed.some((point) => point === null) ? undefined : chartOf({ points: parsed, title, unit: unit ?? "" });
    if (!chart) return { error: "chart" };
  }

  return {
    visuals: Object.freeze({
      ...(chart ? { chart } : {}),
      ...(points.length > 0 ? { highlights: Object.freeze(points) } : {}),
      ...(table ? { table } : {}),
    }),
  };
}
