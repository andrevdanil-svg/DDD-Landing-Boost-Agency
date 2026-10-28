// An illustration's SVG → PNG with the blog's font, nothing loaded from outside.

import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const fontDir = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
// DejaVu (есть на сервере) — запасной для знаков, которых нет в Montserrat: иначе пустые квадраты.
const fallback = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"];
const fontFiles = [
  ...readdirSync(fontDir).filter((name) => name.endsWith(".ttf")).map((name) => fontDir + name),
  ...fallback.filter((file) => existsSync(file)),
];

export function renderSvg(svg: string): Buffer {
  const png = new Resvg(svg, {
    background: "#111119",
    fitTo: { mode: "width", value: 1200 },
    font: { defaultFontFamily: "Montserrat", fontFiles, loadSystemFonts: false, sansSerifFamily: "Montserrat" },
  }).render().asPng();
  return Buffer.from(png);
}
