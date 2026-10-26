import { describe, expect, it } from "vitest";

import { newsLinkAddress, newsTitleFromText, telegramPostAddress } from "./source";

// Owner, 2026-10-14: the owner gives one publication at a time, its address typed the way it is written.
describe("news publication addresses", () => {
  it("tells a link to one Telegram post from the channel", () => {
    expect(telegramPostAddress("https://t.me/spotuz/40562")).toEqual({
      embedUrl: "https://t.me/spotuz/40562?embed=1&mode=tme", handle: "spotuz", url: "https://t.me/spotuz/40562",
    });
    expect(telegramPostAddress("t.me/s/spotuz/40562?single")?.url).toBe("https://t.me/spotuz/40562");
    expect(telegramPostAddress("telegram.me/Kun_uz_news/7")?.url).toBe("https://t.me/Kun_uz_news/7");
    expect(telegramPostAddress("@spotuz")).toBeNull();
    expect(telegramPostAddress("https://t.me/spotuz")).toBeNull();
    expect(telegramPostAddress("https://t.me/c/123/45")).toBeNull();
  });

  it("reads an article's address with or without its scheme", () => {
    expect(newsLinkAddress(" kun.uz/news/2026/10/14/minfin#top ")).toBe("https://kun.uz/news/2026/10/14/minfin");
    expect(newsLinkAddress("http://gazeta.uz/ru/2026/10/14/bank/")).toBe("http://gazeta.uz/ru/2026/10/14/bank/");
  });

  // A site's front page and a channel are not one publication: the owner gives the article itself.
  it.each(["", "kun.uz", "https://kun.uz/", "localhost/news", "ftp://kun.uz/a", "https://user:pass@kun.uz/a",
    "https://kun.uz:8443/a", "kun uz/a", "https://t.me/spotuz", "t.me/spotuz"])("refuses «%s»", (raw) => {
    expect(newsLinkAddress(raw)).toBeNull();
  });

  it("titles a publication by its first line, cut near 140 characters at a word", () => {
    expect(newsTitleFromText("Короткий заголовок\nТекст поста")).toBe("Короткий заголовок");
    const long = `${"Минфин Узбекистана объявил о новых правилах ".repeat(5)}конец`;
    const title = newsTitleFromText(long);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(141);
    expect(title).not.toMatch(/\s…$/u);
  });
});
