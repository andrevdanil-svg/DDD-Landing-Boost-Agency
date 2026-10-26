import { createHash } from "node:crypto";

// Addresses as people type them: one Telegram post (t.me/channel/123), a public channel (@channel,
// t.me/channel, t.me/s/channel), an article or a site. Plus a title for a text that has none and the
// hash that tells the same material apart from a new one.

const telegramReserved = new Set(["addlist", "addstickers", "c", "iv", "joinchat", "proxy", "s", "share", "socks"]);

// A link to one Telegram post is that post: read through its embed page.
export function telegramPostAddress(raw: string): Readonly<{ embedUrl: string; handle: string; url: string }> | null {
  const match = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})\/(\d{1,12})(?:[/?#].*)?$/iu.exec(raw.trim());
  if (!match || telegramReserved.has(match[1]!.toLowerCase())) return null;
  const url = `https://t.me/${match[1]}/${match[2]}`;
  return Object.freeze({ embedUrl: `${url}?embed=1&mode=tme`, handle: match[1]!, url });
}

// A public channel: its handle and its web preview with the latest posts (t.me/s/<channel>). A private
// channel (t.me/+…, joinchat) has no preview and is refused.
export function telegramChannelAddress(raw: string): Readonly<{ feedUrl: string; handle: string }> | null {
  const match = /^(?:@|(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?)([A-Za-z][A-Za-z0-9_]{3,31})\/?$/iu.exec(raw.trim());
  if (!match || telegramReserved.has(match[1]!.toLowerCase())) return null;
  return Object.freeze({ feedUrl: `https://t.me/s/${match[1]}`, handle: match[1]! });
}

// An article's (or, with allowRoot, a site's) address: http(s) on the standard port, no credentials, a
// public-looking host, not Telegram. Without allowRoot a site's bare front page is no article.
export function newsLinkAddress(raw: string, options: Readonly<{ allowRoot?: boolean }> = {}): string | null {
  const value = raw.trim();
  if (!value || /\s/u.test(value)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
  if (!url.hostname.includes(".") || /^(?:www\.)?(?:t\.me|telegram\.me)$/iu.test(url.hostname)) return null;
  if (!options.allowRoot && url.pathname.replace(/\/+$/u, "") === "") return null;
  url.hash = "";
  return url.href.length <= 2_048 ? url.href : null;
}

// A title for a publication that has none: its first line, cut at a word near 140 characters.
export function newsTitleFromText(text: string): string {
  const first = text.trim().split("\n", 1)[0]?.trim() ?? "";
  if (first.length <= 140) return first;
  const cut = first.slice(0, 140);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/u, "")}…`;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// The same words are the same material, whichever way they came (a site, its feed, a channel repost):
// keep this hash and the address, and skip a material whose hash or address is already kept.
export function newsContentHash(title: string, text: string): string {
  return createHash("sha256").update(`${normalized(title)}\n${normalized(text.slice(0, 4_000))}`, "utf8").digest("hex");
}
