import { cleanText, htmlFragmentText } from "./html";

// A site is read through its own news feed — RSS 2.0, RSS 1.0 (RDF) or Atom. The
// reader is deliberately small and tolerant: items, their title, link, date and text, with CDATA and
// entities decoded; anything else in the feed is ignored.

export type FeedItem = Readonly<{
  // The item's full text (content:encoded, Atom content) when the feed carries it.
  content?: string;
  publishedAt?: Date;
  summary?: string;
  title: string;
  url?: string;
}>;

export type ParsedFeed = Readonly<{ items: readonly FeedItem[]; title: string }>;

const namedEntities: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/giu, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return namedEntities[name.toLowerCase()] ?? whole;
  });
}

// An element's content as text: CDATA sections are literal, everything else has its entities decoded.
function contentOf(raw: string): string {
  let out = "";
  let rest = raw;
  for (;;) {
    const start = rest.indexOf("<![CDATA[");
    if (start < 0) return out + decodeEntities(rest);
    const end = rest.indexOf("]]>", start + 9);
    out += decodeEntities(rest.slice(0, start)) + rest.slice(start + 9, end < 0 ? undefined : end);
    if (end < 0) return out;
    rest = rest.slice(end + 3);
  }
}

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function element(block: string, ...names: readonly string[]): Readonly<{ attributes: string; content: string }> | undefined {
  for (const name of names) {
    const match = new RegExp(`<${escape(name)}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${escape(name)}\\s*>)`, "iu").exec(block);
    if (match) return { attributes: match[1] ?? "", content: match[2] ?? "" };
  }
  return undefined;
}

function attributeOf(attributes: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "iu").exec(attributes);
  return value ? decodeEntities(value[2] ?? value[3] ?? "") : undefined;
}

function text(block: string, ...names: readonly string[]): string | undefined {
  const found = element(block, ...names);
  if (!found) return undefined;
  const value = contentOf(found.content).trim();
  return value || undefined;
}

function date(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function link(block: string, base: string): string | undefined {
  // Atom: <link rel="alternate" href="…"/> (or the first link without rel); RSS: <link>…</link>.
  const atomLinks = [...block.matchAll(/<link(\s[^>]*?)\/?>/giu)].map((match) => match[1] ?? "");
  const alternate = atomLinks.find((attributes) => (attributeOf(attributes, "rel") ?? "alternate") === "alternate" && attributeOf(attributes, "href"));
  const candidate = (alternate ? attributeOf(alternate, "href") : undefined)
    ?? text(block, "link")
    ?? (() => {
      const guid = element(block, "guid");
      const permalink = guid && attributeOf(guid.attributes, "isPermaLink") !== "false" ? contentOf(guid.content).trim() : undefined;
      return permalink && /^https?:\/\//iu.test(permalink) ? permalink : undefined;
    })();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? withoutTracking(url).href : undefined;
  } catch {
    return undefined;
  }
}

const trackingParameters = /^(?:utm_[a-z_]+|from|ref|fbclid|gclid|yclid|_openstat)$/iu;

// The same article under «?from=rss» or «?utm_source=…» is the same article: the marks go.
export function withoutTracking(url: URL): URL {
  const clean = new URL(url.href);
  for (const key of [...clean.searchParams.keys()]) if (trackingParameters.test(key)) clean.searchParams.delete(key);
  clean.hash = "";
  return clean;
}

export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2_048).replace(/<\?xml[^>]*\?>/u, "").replace(/<!--[\s\S]*?-->/gu, "").trimStart();
  return /^<(?:rss|feed|rdf:RDF)[\s>]/u.test(head);
}

// null when the body is not a feed.
export function parseFeed(body: string, feedUrl: string): ParsedFeed | null {
  if (!looksLikeFeed(body)) return null;
  const atom = /^<feed[\s>]/u.test(body.slice(0, 2_048).replace(/<\?xml[^>]*\?>/u, "").replace(/<!--[\s\S]*?-->/gu, "").trimStart());
  const blocks = [...body.matchAll(atom ? /<entry[\s>][\s\S]*?<\/entry\s*>/giu : /<item[\s>][\s\S]*?<\/item\s*>/giu)].map((match) => match[0]);
  const firstBlock = blocks.length > 0 ? body.indexOf(blocks[0]!) : body.length;
  const head = body.slice(0, firstBlock);
  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, 100)) {
    const rawTitle = text(block, "title");
    const title = rawTitle ? cleanText(htmlFragmentText(rawTitle)).slice(0, 300) : "";
    const content = text(block, "content:encoded", "content", "yandex:full-text", "rbc_news:full-text", "turbo:content");
    const summary = text(block, "description", "summary");
    const url = link(block, feedUrl);
    const publishedAt = date(text(block, "pubDate", "published", "dc:date", "updated"));
    const contentText = content ? htmlFragmentText(content) : "";
    const summaryText = summary ? htmlFragmentText(summary) : "";
    if (!title && !summaryText && !contentText) continue;
    items.push(Object.freeze({
      ...(contentText ? { content: contentText } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(summaryText ? { summary: summaryText } : {}),
      title,
      ...(url ? { url } : {}),
    }));
  }
  const rawTitle = text(head, "title");
  return Object.freeze({ items, title: rawTitle ? cleanText(htmlFragmentText(rawTitle)).slice(0, 200) : "" });
}
