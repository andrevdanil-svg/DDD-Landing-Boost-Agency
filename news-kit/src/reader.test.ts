import { describe, expect, it, vi } from "vitest";

import { NewsHttpError, type NewsHttpGet } from "./http";
import { createNewsReader } from "./reader";

function pages(map: Readonly<Record<string, string | NewsHttpError>>): NewsHttpGet {
  return vi.fn(async (url: string) => {
    const page = map[url];
    if (page === undefined) throw new NewsHttpError("not_found");
    if (page instanceof NewsHttpError) throw page;
    return { body: page, contentType: page.startsWith("<rss") ? "application/rss+xml" : "text/html; charset=utf-8", url };
  });
}

const article = `<html><head><meta property="og:type" content="article"><title>Охваты постов в Telegram — исследование</title>
  <script type="application/ld+json">{"@type": "NewsArticle"}</script></head>
  <body><article><p>${"Исследование охватов постов в Telegram за год. ".repeat(6)}</p></article></body></html>`;

// Owner, 2026-10-14: the generator reads only the publication the owner gave — one article, one Telegram
// post, a newsletter — and follows nothing.
describe("news reader", () => {
  it("reads an article's page as that one article", async () => {
    const get = pages({ "https://ppc.world/news/ohvaty-postov-telegram-issledovanie/": article });
    await expect(createNewsReader(get).article("https://ppc.world/news/ohvaty-postov-telegram-issledovanie/")).resolves.toMatchObject({
      title: "Охваты постов в Telegram — исследование", url: "https://ppc.world/news/ohvaty-postov-telegram-issledovanie/",
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("refuses a site's front page, a section, a feed and an empty page as an article", async () => {
    const reader = createNewsReader(pages({
      "https://site.example/news": `<html><head><title>Новости</title></head><body><ul><li><a href="/a">Статья</a></li></ul></body></html>`,
      "https://site.example/rss": `<rss><channel><title>Лента</title></channel></rss>`,
      "https://site.example/news/2026/10/14/empty": "<html><head><meta property=\"article:published_time\" content=\"2026-10-14\"></head><body></body></html>",
    }));
    await expect(reader.article("https://site.example/news")).rejects.toMatchObject({ code: "not_an_article" });
    await expect(reader.article("https://site.example/rss")).rejects.toMatchObject({ code: "not_an_article" });
    await expect(reader.article("https://site.example/news/2026/10/14/empty")).rejects.toMatchObject({ code: "no_text" });
    expect(() => reader.newsletter("<html><body> </body></html>")).toThrow(expect.objectContaining({ code: "no_text" }));
  });

  it("reads one Telegram post through its embed page", async () => {
    const reader = createNewsReader(pages({
      "https://t.me/spotuz/40562?embed=1&mode=tme": `<div class="tgme_widget_message" data-post="spotuz/40562"><div class="tgme_widget_message_text">Марко Рубио прибудет в Узбекистан на этой неделе</div></div>`,
    }));
    await expect(reader.telegramPost("https://t.me/spotuz/40562?embed=1&mode=tme", "spotuz", "https://t.me/spotuz/40562")).resolves.toMatchObject({
      text: "Марко Рубио прибудет в Узбекистан на этой неделе", url: "https://t.me/spotuz/40562",
    });
    await expect(reader.telegramPost("https://t.me/spotuz/40562?embed=1&mode=tme", "spotuz", "https://t.me/spotuz/1")).rejects.toMatchObject({ code: "channel_unavailable" });
  });

  it("names why a page could not be read", async () => {
    const blocked = createNewsReader(pages({ "https://inside.example/a": new NewsHttpError("address_blocked") }));
    await expect(blocked.article("https://inside.example/a")).rejects.toMatchObject({ code: "address_blocked" });
    const broken = createNewsReader(vi.fn(async () => { throw new Error("socket"); }));
    await expect(broken.article("https://x.example/a")).rejects.toMatchObject({ code: "fetch_failed" });
  });
});
