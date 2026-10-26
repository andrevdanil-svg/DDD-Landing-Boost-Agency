import { describe, expect, it } from "vitest";

import { extractArticle, extractNewsletter, looksLikeArticle, parseTelegramChannel } from "./html";

const paragraph = (text: string) => `<p>${text} ${"Подробности события для читателя. ".repeat(3)}</p>`;

// Owner, 2026-10-14: a page becomes a title, its words and a date — nothing of its markup.
describe("news pages", () => {
  it("takes the article's paragraphs, not the menu, the sidebar or the footer", () => {
    const article = extractArticle(`<html><head>
        <title>Как реформируют рынок газа – Газета.uz</title>
        <meta property="og:site_name" content="Газета.uz">
        <meta property="article:published_time" content="2026-10-14T08:48:38+05:00">
      </head><body>
        <nav><ul><li><a href="/">Главная страница сайта и все разделы новостей</a></li></ul></nav>
        <header><p>Шапка сайта с длинным слоганом, который не относится к статье вовсе.</p></header>
        <div class="article-body">${paragraph("В Узбекистане либерализуют цены на сжиженный газ.")}${paragraph("Частные поставщики смогут продавать баллоны.")}<script>track()</script></div>
        <aside>${paragraph("Читайте также другую новость.")}</aside>
        <footer><p>© Газета.uz, все права защищены, перепечатка запрещена без ссылки.</p></footer>
      </body></html>`);
    expect(article.title).toBe("Как реформируют рынок газа");
    expect(article.publishedAt).toEqual(new Date("2026-10-14T03:48:38Z"));
    expect(article.text).toMatch(/^В Узбекистане либерализуют цены/u);
    expect(article.text).toContain("Частные поставщики смогут продавать баллоны.");
    for (const outside of ["Главная", "Шапка", "Читайте также", "©", "track"]) expect(article.text).not.toContain(outside);
  });

  it("finds the article when every paragraph sits in its own blocks, as on vc.ru", () => {
    const block = (text: string) => `<div class="block-wrapper"><div class="block-wrapper__content"><div class="block-text">${paragraph(text)}</div></div></div>`;
    const article = extractArticle(`<html><head>
        <meta property="og:title" content="OpenAI нашла прослушку в переговорной — Право на vc.ru">
        <meta property="og:description" content="Короткое описание">
        <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-14T06:20:01.000Z"}</script>
      </head><body><article><div class="content">
        <div class="block-wrapper"><ul><li>Сотрудники нашли звукозаписывающее устройство в конференц-зале руководства.</li></ul></div>
        ${block("Подозреваемого арестовало ФБР.")}${block("В компании признаков кражи данных не обнаружили.")}${block("Устройство было подключено к телевизору.")}
      </div></article>
      <div class="related"><ul><li><a href="/1">Другая статья с длинным заголовком про технологии и стартапы</a></li><li><a href="/2">Ещё одна статья с длинным заголовком про рынок и деньги</a></li></ul></div>
      </body></html>`);
    expect(article.title).toBe("OpenAI нашла прослушку в переговорной");
    expect(article.publishedAt).toEqual(new Date("2026-10-14T06:20:01.000Z"));
    expect(article.text).toMatch(/^• Сотрудники нашли/u);
    expect(article.text).toContain("Подозреваемого арестовало ФБР.");
    expect(article.text).toContain("Устройство было подключено к телевизору.");
    expect(article.text).not.toContain("Другая статья");
  });

  it("keeps a title's own last part and falls back to the description on a page without text", () => {
    const article = extractArticle(`<html><head><title>Рынок напитков вырос — итоги года</title>
      <meta name="description" content="Описание страницы, которое длиннее, чем её видимый текст на странице."></head>
      <body><time datetime="2026-10-13T10:00:00Z">вчера</time><p>Мало.</p></body></html>`);
    expect(article.title).toBe("Рынок напитков вырос — итоги года");
    expect(article.text).toBe("Описание страницы, которое длиннее, чем её видимый текст на странице.");
    expect(article.publishedAt).toEqual(new Date("2026-10-13T10:00:00Z"));
  });

  it("tells one article's page from a site or a section, even where every page says og:type=article", () => {
    const head = (extra: string) => `<html><head>${extra}</head><body><p>Короткий текст.</p></body></html>`;
    const og = '<meta property="og:type" content="article">';
    expect(looksLikeArticle(head(og), "https://ppc.world/")).toBe(false);
    expect(looksLikeArticle(head(og), "https://ppc.world/news/")).toBe(false);
    expect(looksLikeArticle(head(og), "https://ppc.world/news/ohvaty-postov-vovlechennost-i-reklamnaya-aktivnost/")).toBe(true);
    expect(looksLikeArticle(head('<meta property="article:published_time" content="2026-10-14">'), "https://www.spot.uz/ru/2026/10/14/uzpost/")).toBe(true);
    expect(looksLikeArticle(head('<script type="application/ld+json">{"@type":"NewsArticle"}</script>'), "https://vc.ru/legal/3193875")).toBe(true);
    expect(looksLikeArticle(head('<meta property="og:type" content="website">'), "https://kun.uz/ru")).toBe(false);
    expect(looksLikeArticle(`<html><body><article>${"<p>Длинный абзац новости о рынке и его участниках, достаточный для статьи.</p>".repeat(12)}</article></body></html>`, "https://site.uz/ru/2026/10/14/news/")).toBe(true);
    expect(looksLikeArticle(head(""), "https://site.uz/ru/2026/10/14/news/")).toBe(false);
  });

  it("reads a newsletter's subject and visible text without its hidden preheader", () => {
    const letter = extractNewsletter(`<html><head><title>Дайджест рынка FMCG — октябрь</title><style>p{color:red}</style></head><body>
      <div style="display:none;max-height:0;overflow:hidden">Прехедер, который повторяет первые строки</div>
      <table><tr><td><h1>Главное за неделю</h1></td></tr><tr><td>Продажи напитков выросли на 12%.</td><td>Ритейл открыл 40 магазинов.</td></tr></table>
      <img src="https://track.example/pixel.gif">
    </body></html>`);
    expect(letter.title).toBe("Дайджест рынка FMCG — октябрь");
    expect(letter.text).toContain("Главное за неделю");
    expect(letter.text).toContain("Продажи напитков выросли на 12%.");
    expect(letter.text).toContain("Ритейл открыл 40 магазинов.");
    expect(letter.text).not.toContain("Прехедер");
    expect(letter.text).not.toContain("color");
  });

  it("reads a public channel's posts with text and refuses a page without the channel", () => {
    const post = (id: number, text: string, extra = "") => `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="spotuz/${id}">
      ${extra}<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>
      <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/spotuz/${id}"><time datetime="2026-10-14T10:5${id % 10}:00+00:00" class="time">10:5${id % 10}</time></a></div></div></div>`;
    const channel = parseTelegramChannel(`<html><body>
      <div class="tgme_channel_info"><div class="tgme_channel_info_header_title"><span dir="auto">Spot.uz – бизнес и технологии</span></div></div>
      ${post(40561, "Мечта посадить пробковый лес<br>История «ЭкоПробки» и её основателей")}
      ${post(40562, "Коротко")}
      ${post(40563, "Марко Рубио прибудет в Узбекистан уже на этой неделе — Госдеп США", '<div class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text">Цитата из другого поста</div></div>')}
      <div class="tgme_widget_message" data-post="otherchan/1"><div class="tgme_widget_message_text">Пост другого канала с достаточно длинным текстом</div></div>
    </body></html>`, "SpotUz");
    expect(channel?.title).toBe("Spot.uz – бизнес и технологии");
    expect(channel?.posts).toEqual([
      { publishedAt: new Date("2026-10-14T10:51:00Z"), text: "Мечта посадить пробковый лес\nИстория «ЭкоПробки» и её основателей", url: "https://t.me/spotuz/40561" },
      { publishedAt: new Date("2026-10-14T10:53:00Z"), text: "Марко Рубио прибудет в Узбекистан уже на этой неделе — Госдеп США", url: "https://t.me/spotuz/40563" },
    ]);
    expect(parseTelegramChannel("<html><head><meta property=\"og:title\" content=\"Telegram\"></head><body>Contact @closed</body></html>", "closed")).toBeNull();
  });
});
