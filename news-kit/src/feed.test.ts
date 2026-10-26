import { describe, expect, it } from "vitest";

import { looksLikeFeed, parseFeed, withoutTracking } from "./feed";

// Owner, 2026-10-14: the sites' own news feeds — RSS 2.0 (Spot, Gazeta, vc.ru, РБК), Atom and RDF.
describe("news feeds", () => {
  it("reads RSS items with CDATA, entities, full text and dates, without tracking marks", () => {
    const feed = parseFeed(`<?xml version="1.0" encoding="utf-8"?>
      <!-- generated -->
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Spot – Деловые новости</title>
          <atom:link href="https://www.spot.uz/ru/rss/" rel="self"/>
          <item>
            <title><![CDATA[UzPost передали в &laquo;управление&raquo;]]></title>
            <link>https://www.spot.uz/ru/2026/10/14/uzpost/?utm_source=rss&amp;id=7</link>
            <description>&lt;p&gt;Национальный почтовый оператор &amp;amp; акционеры&lt;/p&gt;</description>
            <content:encoded><![CDATA[<p>${"Полный текст статьи. ".repeat(30)}</p><script>alert(1)</script>]]></content:encoded>
            <pubDate>Tue, 14 Oct 2026 10:33:00 +0500</pubDate>
          </item>
          <item>
            <title>Без текста только заголовок про рынок</title>
            <guid isPermaLink="true">https://vc.ru/money/1-x?from=rss</guid>
          </item>
          <item><link>https://empty.example/</link></item>
        </channel>
      </rss>`, "https://www.spot.uz/ru/rss/");
    expect(feed?.title).toBe("Spot – Деловые новости");
    expect(feed?.items).toHaveLength(2);
    const [first, second] = feed!.items;
    expect(first).toMatchObject({
      publishedAt: new Date("2026-10-14T05:33:00.000Z"),
      summary: "Национальный почтовый оператор & акционеры",
      // A title's CDATA is HTML: its entities are decoded too.
      title: "UzPost передали в «управление»",
      url: "https://www.spot.uz/ru/2026/10/14/uzpost/?id=7",
    });
    expect(first!.content).toMatch(/^Полный текст статьи\./u);
    expect(first!.content).not.toContain("alert");
    expect(second).toEqual({ title: "Без текста только заголовок про рынок", url: "https://vc.ru/money/1-x" });
  });

  it("reads Atom entries and their alternate link", () => {
    const feed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom news</title>
      <entry><title type="html">Банк &amp; рынок</title>
        <link rel="self" href="https://a.example/self"/><link rel="alternate" href="/news/42"/>
        <summary>Коротко о главном</summary><content type="html">&lt;p&gt;Длинный текст&lt;/p&gt;</content>
        <published>2026-10-14T08:00:00Z</published></entry></feed>`, "https://a.example/feed");
    expect(feed).toEqual({
      items: [{ content: "Длинный текст", publishedAt: new Date("2026-10-14T08:00:00Z"), summary: "Коротко о главном", title: "Банк & рынок", url: "https://a.example/news/42" }],
      title: "Atom news",
    });
  });

  it("reads RDF items and the full text of RBC's export", () => {
    const rdf = parseFeed(`<rdf:RDF><channel><title>RDF</title></channel><item><title>Пункт</title><link>https://r.example/1</link><dc:date>2026-10-14T07:00:00+05:00</dc:date></item></rdf:RDF>`, "https://r.example/");
    expect(rdf?.items[0]).toMatchObject({ publishedAt: new Date("2026-10-14T02:00:00Z"), title: "Пункт", url: "https://r.example/1" });
    const rbc = parseFeed(`<rss><channel><title>www.rbc.ru</title><item><title>Новость</title><link>https://www.rbc.ru/n/1</link>
      <rbc_news:full-text>${"Текст новости РБК. ".repeat(30)}</rbc_news:full-text></item></channel></rss>`, "https://rssexport.rbc.ru/");
    expect(rbc?.items[0]?.content).toMatch(/^Текст новости РБК\./u);
  });

  it("is not fooled by a page that only mentions a feed", () => {
    expect(looksLikeFeed("<!DOCTYPE html><html><body><rss>no</rss></body></html>")).toBe(false);
    expect(parseFeed("<html><head><title>Сайт</title></head></html>", "https://a.example/")).toBeNull();
    expect(withoutTracking(new URL("https://a.example/x?utm_medium=tg&from=rss&page=2#top")).href).toBe("https://a.example/x?page=2");
  });
});
