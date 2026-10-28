import { parse, type DefaultTreeAdapterMap } from "parse5";

// Text out of HTML: an article on a news page (the block holding the most paragraph text, the way
// reading modes find it), a newsletter's visible text, a public Telegram channel's web preview
// (t.me/s/<channel>) or one post's embed page, the feeds a site announces. Only words, a title and a
// date are kept — no markup, scripts or images.

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

const maxText = 100_000;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function classes(element: Element): readonly string[] {
  return (attribute(element, "class") ?? "").split(/\s+/u).filter(Boolean);
}

function* elements(root: ParentNode): Generator<Element> {
  for (const child of root.childNodes) {
    if (!isElement(child)) continue;
    yield child;
    if (child.tagName !== "template") yield* elements(child);
  }
}

function find(root: ParentNode, test: (element: Element) => boolean): Element | undefined {
  for (const element of elements(root)) if (test(element)) return element;
  return undefined;
}

const skipped = new Set([
  "button", "canvas", "form", "head", "iframe", "img", "input", "noscript", "object", "picture", "script", "select",
  "style", "svg", "template", "textarea", "video", "audio",
]);
const chrome = new Set(["aside", "footer", "header", "nav"]);
const blocks = new Set([
  "address", "article", "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "li", "main", "ol", "p", "pre", "section", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);

function hidden(element: Element): boolean {
  if (attribute(element, "hidden") !== undefined || attribute(element, "aria-hidden") === "true") return true;
  const style = (attribute(element, "style") ?? "").toLowerCase().replace(/\s+/gu, "");
  // Newsletters hide their preheader this way; it repeats the first lines.
  return /display:none|visibility:hidden|mso-hide:all|max-height:0(?:px)?(?:;|$)|font-size:0(?:px)?(?:;|$)|opacity:0(?:;|$)/u.test(style);
}

export function cleanText(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v\r]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, maxText);
}

// An illustration of the article (a screenshot, a chart): where it stood is marked in the text as
// «[[IMG:<id>]]» on its own line, so the writer can keep it in place.
export type ArticleImage = Readonly<{ alt: string; id: number; src: string }>;

const maxImages = 12;

// The picture's real address: lazy loaders keep it in data-*, a srcset lists sizes (the widest wins).
function imageSource(element: Element, pageUrl: string): string | undefined {
  const srcset = attribute(element, "data-srcset") ?? attribute(element, "srcset");
  const widest = srcset
    ?.split(",")
    .map((item) => item.trim().split(/\s+/u))
    .map(([url, size]) => ({ url, width: Number.parseInt(size ?? "", 10) || 0 }))
    .filter((item) => item.url)
    .sort((left, right) => right.width - left.width)[0]?.url;
  const raw = attribute(element, "data-src") ?? attribute(element, "data-lazy-src") ?? attribute(element, "data-original") ?? widest ?? attribute(element, "src");
  if (!raw || raw.startsWith("data:")) return undefined;
  try {
    const url = new URL(raw.trim(), pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    // Icons, logos and counters are not illustrations.
    if (/\.svg(?:$|\?)/iu.test(url.pathname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function tooSmall(element: Element): boolean {
  const size = (name: string) => Number.parseInt(attribute(element, name) ?? "", 10);
  const width = size("width");
  const height = size("height");
  return (Number.isFinite(width) && width < 200) || (Number.isFinite(height) && height < 120);
}

// The readable text under a node: blocks on their own lines, list items with a bullet, page chrome
// (navigation, header, footer, aside) left out when asked. With `images`, the article's pictures are
// collected there and marked in the text.
export function textOf(
  root: ParentNode,
  options: Readonly<{ images?: ArticleImage[]; pageUrl?: string; withoutChrome?: boolean }> = {},
): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (!isElement(node)) {
      if ("value" in node && node.nodeName === "#text") parts.push(node.value.replace(/\s+/gu, " "));
      return;
    }
    if (options.images && options.pageUrl && !hidden(node)) {
      if (node.tagName === "picture") {
        const img = find(node, (element) => element.tagName === "img");
        if (img) visit(img);
        return;
      }
      if (node.tagName === "img") {
        const src = imageSource(node, options.pageUrl);
        if (src && !tooSmall(node) && options.images.length < maxImages && !options.images.some((image) => image.src === src)) {
          const id = options.images.length + 1;
          options.images.push(Object.freeze({ alt: cleanText(attribute(node, "alt") ?? "").slice(0, 200), id, src }));
          parts.push(`\n[[IMG:${id}]]\n`);
        }
        return;
      }
    }
    if (skipped.has(node.tagName) || hidden(node) || (options.withoutChrome && chrome.has(node.tagName))) return;
    if (node.tagName === "br") {
      parts.push("\n");
      return;
    }
    const block = blocks.has(node.tagName);
    if (block) parts.push("\n");
    if (node.tagName === "li") parts.push("• ");
    if (node.tagName === "td" || node.tagName === "th") parts.push(" ");
    for (const child of node.childNodes) visit(child);
    if (block) parts.push("\n");
  };
  for (const child of root.childNodes) visit(child);
  return cleanText(parts.join(""));
}

function meta(root: ParentNode, ...names: readonly string[]): string | undefined {
  for (const name of names) {
    const element = find(root, (item) => item.tagName === "meta" &&
      (attribute(item, "property") === name || attribute(item, "name") === name || attribute(item, "itemprop") === name));
    const content = element ? attribute(element, "content")?.trim() : undefined;
    if (content) return content;
  }
  return undefined;
}

function date(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

// «Заголовок — Газета.uz» → «Заголовок»: the last part after a dash or bar goes when it names the
// site (its og:site_name, or a domain such as «Право на vc.ru»); a title's own last part stays.
function withoutSiteName(title: string, siteName: string | undefined): string {
  const match = /^(.{20,}?)\s+[—–|·-]\s+([^—–|·]{2,40})$/u.exec(title);
  if (!match) return title;
  const suffix = match[2]!.toLowerCase();
  const names = siteName ? suffix.includes(siteName.toLowerCase()) : false;
  return names || /[\p{L}\d-]+\.[\p{L}]{2,}/u.test(suffix) ? match[1]!.trim() : title;
}

function documentTitle(document: ParentNode): string | undefined {
  const title = find(document, (element) => element.tagName === "title");
  const text = title ? textOf(title) : "";
  return text ? withoutSiteName(text, meta(document, "og:site_name", "application-name")) : undefined;
}

function jsonLdDate(document: ParentNode): Date | undefined {
  for (const element of elements(document)) {
    if (element.tagName !== "script" || attribute(element, "type") !== "application/ld+json") continue;
    const raw = element.childNodes.map((child) => ("value" in child ? child.value : "")).join("");
    const found = /"datePublished"\s*:\s*"([^"]{8,40})"/u.exec(raw)?.[1];
    if (found) return date(found);
  }
  return undefined;
}

export type ExtractedArticle = Readonly<{ images?: readonly ArticleImage[]; publishedAt?: Date; text: string; title: string }>;

// The article on a news page: the element holding the most paragraph text (the way reading modes find
// it), or the page's <article>, without navigation, header, footer and asides. With the page's address,
// its pictures come along (ArticleImage).
export function extractArticle(html: string, pageUrl?: string): ExtractedArticle {
  const document = parse(html);
  const body = find(document, (element) => element.tagName === "body") ?? document;
  const siteName = meta(document, "og:site_name", "application-name");
  const declaredTitle = meta(document, "og:title", "twitter:title");
  const title = (declaredTitle ? withoutSiteName(declaredTitle, siteName) : undefined) ?? documentTitle(document)
    ?? (() => { const heading = find(body, (element) => element.tagName === "h1"); return heading ? textOf(heading) : undefined; })()
    ?? "";
  const publishedAt = date(meta(document, "article:published_time", "datePublished", "pubdate", "og:article:published_time"))
    ?? date((() => { const time = find(body, (element) => element.tagName === "time" && Boolean(attribute(element, "datetime"))); return time ? attribute(time, "datetime") : undefined; })())
    ?? jsonLdDate(document);

  const declared = find(body, (element) => attribute(element, "itemprop") === "articleBody");
  // Each paragraph (or a long list item) scores its parent and, with less weight, the ancestors above:
  // a site that wraps every paragraph in its own blocks (vc.ru) still has one element holding them all.
  // Text that is mostly links (menus, «читайте также») scores nothing.
  const scores = new Map<Element, number>();
  const parents = new Map<Node, Element>();
  for (const element of elements(body)) for (const child of element.childNodes) if (isElement(child)) parents.set(child, element);
  const weights = [1, 1, 0.75, 0.5, 0.4];
  for (const element of elements(body)) {
    if (element.tagName !== "p" && element.tagName !== "li") continue;
    const length = textOf(element).length;
    if (length < 40) continue;
    const linked = [...elements(element)].filter((item) => item.tagName === "a").reduce((sum, link) => sum + textOf(link).length, 0);
    if (linked > length / 2) continue;
    let ancestor = parents.get(element);
    for (const weight of weights) {
      if (!ancestor) break;
      scores.set(ancestor, (scores.get(ancestor) ?? 0) + length * weight);
      ancestor = parents.get(ancestor);
    }
  }
  const best = [...scores.entries()]
    .filter(([element]) => !chrome.has(element.tagName) && element.tagName !== "ul" && element.tagName !== "ol")
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  const container = declared ?? best ?? find(body, (element) => element.tagName === "article") ?? body;
  const images: ArticleImage[] = [];
  let text = textOf(container, { withoutChrome: true, ...(pageUrl ? { images, pageUrl } : {}) });
  if (text.replace(/\[\[IMG:\d+\]\]/gu, "").trim().length < 200) {
    const description = meta(document, "og:description", "description", "twitter:description");
    if (description && description.length > text.length) {
      text = cleanText(description);
      images.length = 0;
    }
  }
  return Object.freeze({
    ...(images.length > 0 ? { images: Object.freeze(images) } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    text,
    title: cleanText(title).slice(0, 300),
  });
}

// A newsletter saved as HTML: its subject (the <title> or the first heading) and its visible text.
export function extractNewsletter(html: string): Readonly<{ text: string; title: string }> {
  const document = parse(html);
  const body = find(document, (element) => element.tagName === "body") ?? document;
  const text = textOf(body);
  const heading = find(body, (element) => /^h[1-3]$/u.test(element.tagName));
  const title = documentTitle(document) ?? (heading ? textOf(heading) : undefined) ?? text.split("\n", 1)[0] ?? "";
  return Object.freeze({ text, title: cleanText(title).slice(0, 300) });
}

export type TelegramChannelPost = Readonly<{ publishedAt?: Date; text: string; url: string }>;

// A public channel's web preview (t.me/s/<channel>): its title and its latest posts with text. A page
// without the channel's header is a private, missing or closed channel.
export function parseTelegramChannel(html: string, handle: string): Readonly<{ posts: readonly TelegramChannelPost[]; title: string }> | null {
  const document = parse(html);
  const header = find(document, (element) => classes(element).includes("tgme_channel_info_header_title"));
  const posts: TelegramChannelPost[] = [];
  for (const element of elements(document)) {
    if (!classes(element).includes("tgme_widget_message")) continue;
    const post = attribute(element, "data-post") ?? "";
    const match = /^([A-Za-z][A-Za-z0-9_]{3,31})\/(\d{1,12})$/u.exec(post);
    if (!match || match[1]!.toLowerCase() !== handle.toLowerCase()) continue;
    const textElement = find(element, (item) => classes(item).includes("tgme_widget_message_text")
      && !classes(item).includes("js-message_reply_text"));
    const text = textElement ? textOf(textElement) : "";
    if (text.length < 20) continue;
    const time = find(element, (item) => item.tagName === "time" && Boolean(attribute(item, "datetime")));
    const publishedAt = date(time ? attribute(time, "datetime") : undefined);
    posts.push(Object.freeze({ ...(publishedAt ? { publishedAt } : {}), text, url: `https://t.me/${match[1]}/${match[2]}` }));
  }
  if (!header && posts.length === 0) return null;
  const title = (header ? textOf(header) : undefined) || meta(document, "og:title") || handle;
  return Object.freeze({ posts, title: cleanText(title).slice(0, 200) });
}

// An HTML fragment (a feed item's description or content) as text.
export function htmlFragmentText(html: string): string {
  return textOf(parse(`<body>${html}</body>`));
}

const feedTypes = new Set(["application/rss+xml", "application/atom+xml", "application/rdf+xml", "application/xml", "text/xml"]);

// A site's own feeds, as its pages announce them (<link rel="alternate">); same-site «/rss» and «/feed»
// links after them.
export function discoverFeedUrls(html: string, pageUrl: string): readonly string[] {
  const document = parse(html);
  const found: string[] = [];
  const add = (href: string | undefined) => {
    if (!href) return;
    try {
      const url = new URL(href, pageUrl);
      if ((url.protocol === "https:" || url.protocol === "http:") && !found.includes(url.href)) found.push(url.href);
    } catch {
      // A malformed link is not a feed.
    }
  };
  for (const element of elements(document)) {
    if (element.tagName !== "link") continue;
    const rel = (attribute(element, "rel") ?? "").toLowerCase().split(/\s+/u);
    if (rel.includes("alternate") && feedTypes.has((attribute(element, "type") ?? "").toLowerCase())) add(attribute(element, "href"));
  }
  const origin = new URL(pageUrl).origin;
  for (const element of elements(document)) {
    if (element.tagName !== "a") continue;
    const href = attribute(element, "href");
    if (!href || !/(?:^|\/)(?:rss|feed)(?:[./?_-]|$)/iu.test(href)) continue;
    try {
      if (new URL(href, pageUrl).origin === origin) add(href);
    } catch {
      // ignored
    }
  }
  return found.slice(0, 8);
}

const articleTypes = /"@type"\s*:\s*"(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|AnalysisNewsArticle)"/u;

// Whether a page is one article rather than a site's front page, a section or a feed. A page is taken for
// one when it is not the site's root and says so — a publication time or Article structured data — or
// when its address is an article's (a date in the path, a long slug, an id) and it calls itself an
// article or carries an article's worth of text. A site's root or a section stays a source (some sites
// mark every page og:type=article).
export function looksLikeArticle(html: string, pageUrl: string): boolean {
  const path = new URL(pageUrl).pathname.replace(/\/+$/u, "");
  if (!path) return false;
  const document = parse(html);
  if (meta(document, "article:published_time")) return true;
  const ld = [...elements(document)]
    .filter((element) => element.tagName === "script" && attribute(element, "type") === "application/ld+json")
    .map((element) => element.childNodes.map((child) => ("value" in child ? child.value : "")).join(""))
    .join("\n");
  if (articleTypes.test(ld)) return true;
  const last = path.split("/").pop() ?? "";
  const deep = /\/\d{4}\/\d{1,2}\/\d{1,2}(?:\/|$)/u.test(path) || last.split(/[-_]/u).length >= 3 || /\d{5,}/u.test(last) || last.length >= 25;
  if (!deep) return false;
  return meta(document, "og:type") === "article" || extractArticle(html).text.length >= 600;
}
