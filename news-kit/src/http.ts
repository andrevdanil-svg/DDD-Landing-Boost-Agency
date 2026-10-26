import dns from "node:dns/promises";
import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

// Safe page fetch for addresses that come from outside (a user, a feed, a channel): only http(s) on the
// standard ports, every name resolved and refused unless all of its addresses are public (no requests
// into the server's own network — SSRF), the connection pinned to the checked address, each redirect
// checked again, and every answer bounded in size and time. Gzip/deflate/brotli, charset from the
// header or <meta>.

export type NewsHttpErrorCode =
  | "address_blocked"
  | "fetch_failed"
  | "invalid_url"
  | "not_found"
  | "response_too_large"
  | "too_many_redirects"
  | "unsupported_content";

export class NewsHttpError extends Error {
  readonly code: NewsHttpErrorCode;

  constructor(code: NewsHttpErrorCode) {
    super(`News page could not be read: ${code}`);
    this.code = code;
    this.name = "NewsHttpError";
  }
}

export type NewsHttpPage = Readonly<{ body: string; contentType: string; url: string }>;
export type NewsHttpGet = (url: string, signal?: AbortSignal) => Promise<NewsHttpPage>;

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(network, prefix, "ipv6");
// No ::ffff:0:0/96 rule: Node's BlockList checks an IPv4-mapped address against the IPv4 rules (and an
// IPv4 address against that rule, which would refuse every IPv4 address).

// An address on the public internet: no loopback, private, link-local, shared, documentation,
// multicast or reserved range, and no IPv4 hidden inside an IPv6 form.
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family !== 6) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(address);
  if (mapped) return isPublicAddress(mapped[1]!);
  return !blocked.check(address, "ipv6");
}

const internalSuffix = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/iu;

// The owner's address as one the reader may open, or invalid_url / address_blocked.
export function newsHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new NewsHttpError("invalid_url");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) {
    throw new NewsHttpError("invalid_url");
  }
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new NewsHttpError("address_blocked");
  } else if (!host.includes(".") || host.length > 253 || internalSuffix.test(host)) {
    throw new NewsHttpError(internalSuffix.test(host) ? "address_blocked" : "invalid_url");
  }
  url.hash = "";
  if (url.href.length > 2_048) throw new NewsHttpError("invalid_url");
  return url;
}

const textTypes = /^(?:text\/html|application\/xhtml\+xml|application\/(?:rss|atom|rdf)\+xml|application\/xml|text\/xml|text\/plain)$/u;

function charsetOf(contentType: string, head: string): string {
  const declared = /charset\s*=\s*["']?([\w-]+)/iu.exec(contentType)?.[1]
    ?? /<meta[^>]+charset\s*=\s*["']?([\w-]+)/iu.exec(head)?.[1]
    ?? /<\?xml[^>]+encoding\s*=\s*["']([\w-]+)["']/iu.exec(head)?.[1];
  return declared?.toLowerCase() ?? "utf-8";
}

function decode(bytes: Buffer, contentType: string): string {
  const charset = charsetOf(contentType, bytes.subarray(0, 4_096).toString("latin1"));
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

type RequestImpl = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

export function createNewsHttp(options: Readonly<{
  allowAddress?: (address: string) => boolean;
  maxBytes?: number;
  maxRedirects?: number;
  request?: Readonly<{ http: RequestImpl; https: RequestImpl }>;
  resolve?: (hostname: string) => Promise<readonly string[]>;
  timeoutMs?: number;
}> = {}): NewsHttpGet {
  const allowAddress = options.allowAddress ?? isPublicAddress;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const resolve = options.resolve ?? (async (hostname: string) =>
    (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address));
  const send = options.request ?? { http: httpRequest as RequestImpl, https: httpsRequest as RequestImpl };

  async function addressesOf(url: URL): Promise<readonly string[]> {
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    if (isIP(host)) {
      if (!allowAddress(host)) throw new NewsHttpError("address_blocked");
      return [host];
    }
    let addresses: readonly string[];
    try {
      addresses = await resolve(host);
    } catch {
      throw new NewsHttpError("fetch_failed");
    }
    if (addresses.length === 0) throw new NewsHttpError("fetch_failed");
    // One private answer is enough to refuse the name: a rebinding resolver may hand out both.
    if (!addresses.every(allowAddress)) throw new NewsHttpError("address_blocked");
    return addresses;
  }

  function once(url: URL, addresses: readonly string[], signal: AbortSignal): Promise<IncomingMessage> {
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      const list = addresses.map((address) => ({ address, family: isIP(address) }));
      if ((lookupOptions as { all?: boolean }).all) {
        (callback as unknown as (error: null, entries: typeof list) => void)(null, list);
      } else {
        callback(null, list[0]!.address, list[0]!.family);
      }
    };
    return new Promise((resolveResponse, reject) => {
      const outgoing = (url.protocol === "https:" ? send.https : send.http)({
        headers: {
          Accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "ru,uz;q=0.9,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; NewsReader/1.0)",
        },
        hostname: url.hostname.replace(/^\[|\]$/gu, ""),
        lookup,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        protocol: url.protocol,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        signal,
      } as RequestOptions, resolveResponse);
      outgoing.on("error", () => reject(new NewsHttpError("fetch_failed")));
      outgoing.end();
    });
  }

  async function body(response: IncomingMessage): Promise<Buffer> {
    const encoding = String(response.headers["content-encoding"] ?? "identity").trim().toLowerCase();
    // pipeline, not pipe: a connection cut by the deadline must end the decompressor too, or the read
    // below would wait for ever.
    const ignore = () => undefined;
    let stream: Readable = response;
    if (encoding === "gzip" || encoding === "x-gzip") stream = pipeline(response, createGunzip(), ignore);
    else if (encoding === "deflate") stream = pipeline(response, createInflate(), ignore);
    else if (encoding === "br") stream = pipeline(response, createBrotliDecompress(), ignore);
    else if (encoding !== "identity" && encoding !== "") {
      response.destroy();
      throw new NewsHttpError("unsupported_content");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) {
          response.destroy();
          throw new NewsHttpError("response_too_large");
        }
        chunks.push(chunk as Buffer);
      }
    } catch (error) {
      if (error instanceof NewsHttpError) throw error;
      throw new NewsHttpError("fetch_failed");
    }
    return Buffer.concat(chunks);
  }

  return async (raw, outerSignal) => {
    const signal = outerSignal ? AbortSignal.any([outerSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let url = newsHttpUrl(raw);
    for (let redirects = 0; ; redirects += 1) {
      const response = await once(url, await addressesOf(url), signal);
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= maxRedirects) throw new NewsHttpError("too_many_redirects");
        let next: URL;
        try {
          next = new URL(response.headers.location, url);
        } catch {
          throw new NewsHttpError("fetch_failed");
        }
        url = newsHttpUrl(next.href);
        continue;
      }
      if (status === 404 || status === 410) {
        response.resume();
        throw new NewsHttpError("not_found");
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new NewsHttpError("fetch_failed");
      }
      const contentType = String(response.headers["content-type"] ?? "").trim();
      const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
      if (mediaType && !textTypes.test(mediaType)) {
        response.resume();
        throw new NewsHttpError("unsupported_content");
      }
      return Object.freeze({ body: decode(await body(response), contentType), contentType: mediaType, url: url.href });
    }
  };
}
