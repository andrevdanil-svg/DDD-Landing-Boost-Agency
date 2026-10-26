import { parseFeed, type FeedItem } from "./feed";
import { discoverFeedUrls, extractArticle, extractNewsletter, looksLikeArticle, parseTelegramChannel } from "./html";
import { createNewsHttp, NewsHttpError, type NewsHttpGet } from "./http";
import { newsTitleFromText } from "./source";

// Reading news: one article, one Telegram post, the latest posts of a public channel, a site's news feed
// (found on its pages or at the usual places), a feed by its address, a newsletter's HTML. Every page
// goes through the safe fetch (http.ts).

export type NewsMaterial = Readonly<{
  // The material carries the whole text (a page, a post, a feed's full content), not only a summary.
  fullText: boolean;
  publishedAt?: Date;
  text: string;
  title: string;
  url?: string;
}>;

export type NewsReadErrorCode =
  | "address_blocked"
  | "channel_unavailable"
  | "feed_not_found"
  | "fetch_failed"
  | "invalid_url"
  | "no_text"
  | "not_an_article"
  | "not_found"
  | "response_too_large"
  | "too_many_redirects"
  | "unsupported_content";

export class NewsReadError extends Error {
  readonly code: NewsReadErrorCode;

  constructor(code: NewsReadErrorCode) {
    super(`News could not be read: ${code}`);
    this.code = code;
    this.name = "NewsReadError";
  }
}

// A feed item keeps its full text when the feed carries one long enough to be the article; otherwise
// its summary — read the item's page (article) for the whole text.
function feedMaterial(item: FeedItem): NewsMaterial {
  const full = Boolean(item.content && item.content.length >= 400 && item.content.length >= (item.summary?.length ?? 0));
  return Object.freeze({
    fullText: full,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    text: (full ? item.content : item.summary ?? item.content ?? item.title) ?? "",
    title: item.title,
    ...(item.url ? { url: item.url } : {}),
  });
}

// Same-site places a feed usually lives when the page does not announce one.
const usualFeedPaths = ["/rss", "/feed", "/rss.xml", "/feed.xml", "/rss/all"];

export function createNewsReader(get: NewsHttpGet = createNewsHttp()) {
  async function fetchPage(url: string, signal?: AbortSignal) {
    try {
      return await get(url, signal);
    } catch (error) {
      if (error instanceof NewsHttpError) throw new NewsReadError(error.code);
      throw new NewsReadError("fetch_failed");
    }
  }

  async function readFeed(url: string, signal?: AbortSignal) {
    const page = await fetchPage(url, signal);
    const parsed = parseFeed(page.body, page.url);
    if (!parsed) throw new NewsReadError("feed_not_found");
    return { feed: parsed, url: page.url };
  }

  return Object.freeze({
    // One article: a page that is not one (a site's front page, a section, a feed) is refused.
    async article(url: string, signal?: AbortSignal): Promise<NewsMaterial & Readonly<{ url: string }>> {
      const page = await fetchPage(url, signal);
      if (!/html/iu.test(page.contentType)) throw new NewsReadError("not_an_article");
      const article = extractArticle(page.body);
      if (!looksLikeArticle(page.body, page.url)) throw new NewsReadError("not_an_article");
      if (article.text.length < 20) throw new NewsReadError("no_text");
      return Object.freeze({
        fullText: true,
        ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
        text: article.text,
        title: article.title,
        url: page.url,
      });
    },

    // One Telegram post through its embed page (telegramPostAddress gives the three values).
    async telegramPost(embedUrl: string, handle: string, url: string, signal?: AbortSignal): Promise<NewsMaterial & Readonly<{ url: string }>> {
      const page = await fetchPage(embedUrl, signal);
      const post = parseTelegramChannel(page.body, handle)?.posts.find((item) => item.url.toLowerCase() === url.toLowerCase());
      if (!post) throw new NewsReadError("channel_unavailable");
      return Object.freeze({
        fullText: true,
        ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
        text: post.text,
        title: newsTitleFromText(post.text),
        url: post.url,
      });
    },

    // The latest posts of a public channel (about twenty, newest first), from its web preview
    // (telegramChannelAddress gives the feed address and the handle).
    async telegramChannel(feedUrl: string, handle: string, signal?: AbortSignal): Promise<Readonly<{ items: readonly NewsMaterial[]; title: string }>> {
      const page = await fetchPage(feedUrl, signal);
      const channel = parseTelegramChannel(page.body, handle);
      if (!channel) throw new NewsReadError("channel_unavailable");
      const items = [...channel.posts].reverse().map((post) => Object.freeze({
        fullText: true,
        ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
        text: post.text,
        title: newsTitleFromText(post.text),
        url: post.url,
      }));
      return Object.freeze({ items, title: channel.title });
    },

    // A site to follow: its feed — the address itself when it is one, else the feeds its page announces,
    // else the usual places (/rss, /feed…). Keep the feedUrl it finds and read it with feed() afterwards.
    async siteFeed(siteUrl: string, signal: AbortSignal = AbortSignal.timeout(45_000)): Promise<Readonly<{ feedUrl: string; items: readonly NewsMaterial[]; title: string }>> {
      const page = await fetchPage(siteUrl, signal);
      const direct = parseFeed(page.body, page.url);
      if (direct) return Object.freeze({ feedUrl: page.url, items: direct.items.map(feedMaterial), title: direct.title || new URL(page.url).hostname });
      const siteTitle = extractArticle(page.body).title;
      const origin = new URL(page.url).origin;
      const candidates = [...discoverFeedUrls(page.body, page.url), ...usualFeedPaths.map((path) => `${origin}${path}`)]
        .filter((candidate, index, all) => all.indexOf(candidate) === index)
        .slice(0, 6);
      for (const candidate of candidates) {
        if (signal.aborted) break;
        try {
          const { feed, url } = await readFeed(candidate, signal);
          if (feed.items.length === 0) continue;
          return Object.freeze({ feedUrl: url, items: feed.items.map(feedMaterial), title: siteTitle || feed.title || new URL(url).hostname });
        } catch (error) {
          if (error instanceof NewsReadError && error.code === "address_blocked") throw error;
        }
      }
      throw new NewsReadError("feed_not_found");
    },

    // A feed found before (RSS 2.0, RSS 1.0, Atom): its items, newest as the feed orders them.
    async feed(feedUrl: string, signal?: AbortSignal): Promise<readonly NewsMaterial[]> {
      return (await readFeed(feedUrl, signal)).feed.items.map(feedMaterial);
    },

    // A newsletter saved as HTML: its subject and visible text.
    newsletter(html: string): Readonly<{ text: string; title: string }> {
      const letter = extractNewsletter(html);
      if (letter.text.length < 20) throw new NewsReadError("no_text");
      return letter;
    },
  });
}

export type NewsReader = ReturnType<typeof createNewsReader>;
