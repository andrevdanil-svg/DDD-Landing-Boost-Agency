import { describe, expect, it } from "vitest";

import { renderSvg, withoutRepeatedAttributes } from "./render";

// 2026-10-29: иллюстрация с font-size, записанным дважды в одном теге, не отрисовалась
// («attribute 'font-size' … is already defined») — оплаченная картинка пропала из поста.
describe("SVG rendering", () => {
  const broken = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><text x="60" y="80" font-size="28" fill="#fff" font-size="32">Сравнение моделей</text><rect x="0" y="0" width="10" height="10"/></svg>';

  it("keeps the first of a repeated attribute and leaves the rest of the markup alone", () => {
    expect(withoutRepeatedAttributes(broken)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><text x="60" y="80" font-size="28" fill="#fff">Сравнение моделей</text><rect x="0" y="0" width="10" height="10"/></svg>',
    );
  });

  it("renders such a picture instead of refusing it", () => {
    expect(renderSvg(broken).subarray(1, 4).toString()).toBe("PNG");
  });
});
