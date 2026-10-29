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

// An attribute written twice in one tag (font-size="14" … font-size="16") is an XML error resvg refuses
// the whole picture for (2026-10-29: a paid illustration lost so). The first one stays, as a browser does.
export function withoutRepeatedAttributes(svg: string): string {
  return svg.replace(/<([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))+)(\s*\/?)>/gu, (_tag, name: string, attributes: string, end: string) => {
    const seen = new Set<string>();
    const kept = [...attributes.matchAll(/\s+([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/gu)]
      .filter((match) => !seen.has(match[1]!) && seen.add(match[1]!))
      .map((match) => ` ${match[1]}=${match[2]}`)
      .join("");
    return `<${name}${kept}${end}>`;
  });
}

export function renderSvg(svg: string): Buffer {
  const png = new Resvg(withoutRepeatedAttributes(svg), {
    background: "#111119",
    fitTo: { mode: "width", value: 1200 },
    font: { defaultFontFamily: "Montserrat", fontFiles, loadSystemFonts: false, sansSerifFamily: "Montserrat" },
  }).render().asPng();
  return Buffer.from(png);
}
