import { createServer, request as httpRequest, type IncomingMessage, type RequestOptions, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNewsHttp, isPublicAddress, NewsHttpError, newsHttpUrl } from "./http";

// Owner, 2026-10-14 (T-NEWS-FETCH): the owner's address never steers the server into its own network.
describe("news reader addresses", () => {
  it.each(["93.184.216.34", "185.8.212.10", "2a00:1450:4001:82a::200e", "::ffff:93.184.216.34"])("takes %s as public", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:a00:1::1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("opens only http(s) on the standard ports, without credentials or internal names", () => {
    expect(newsHttpUrl("https://kun.uz/news#x").href).toBe("https://kun.uz/news");
    for (const [raw, code] of [
      ["ftp://kun.uz/", "invalid_url"],
      ["https://user:pw@kun.uz/", "invalid_url"],
      ["https://kun.uz:8443/", "invalid_url"],
      ["http://localhost/", "address_blocked"],
      ["http://router.local/", "address_blocked"],
      ["http://metadata.internal/", "address_blocked"],
      ["http://127.0.0.1/", "address_blocked"],
      ["http://[::1]/", "address_blocked"],
      ["http://169.254.169.254/latest/meta-data", "address_blocked"],
      ["not a url", "invalid_url"],
    ] as const) {
      expect(() => newsHttpUrl(raw), raw).toThrow(expect.objectContaining({ code }));
    }
  });
});

describe("news reader requests", () => {
  let server: Server;
  let port = 0;
  const routes = new Map<string, (request: IncomingMessage, response: import("node:http").ServerResponse) => void>();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const route = routes.get(request.url ?? "");
      if (route) route(request, response);
      else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // The test server is on loopback: the names resolve there, the port is the test's, and loopback is
  // allowed only where a test says so.
  function local(overrides: Parameters<typeof createNewsHttp>[0] = {}) {
    const toLocal = (options: RequestOptions, callback: (response: IncomingMessage) => void) =>
      httpRequest({ ...options, port, protocol: "http:" }, callback);
    return createNewsHttp({
      allowAddress: () => true,
      request: { http: toLocal, https: toLocal },
      resolve: async () => ["127.0.0.1"],
      ...overrides,
    });
  }

  it("reads a page, follows a redirect, inflates gzip and decodes its charset", async () => {
    routes.set("/start", (_request, response) => {
      response.writeHead(301, { location: "/article" });
      response.end();
    });
    routes.set("/article", (request, response) => {
      expect(request.headers["user-agent"]).toBe("Mozilla/5.0 (compatible; NewsReader/1.0)");
      response.writeHead(200, { "content-encoding": "gzip", "content-type": "text/html; charset=windows-1251" });
      response.end(gzipSync(Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])));
    });
    const page = await local()("http://news.example/start");
    expect(page).toEqual({ body: "Привет", contentType: "text/html", url: "http://news.example/article" });
  });

  it("refuses a name that resolves to a private address, even next to a public one", async () => {
    const read = createNewsHttp({ resolve: async () => ["93.184.216.34", "10.0.0.7"] });
    await expect(read("https://rebind.example/")).rejects.toMatchObject({ code: "address_blocked" });
    const loopback = createNewsHttp({ resolve: async () => ["127.0.0.1"] });
    await expect(loopback("https://news.example/")).rejects.toMatchObject({ code: "address_blocked" });
  });

  it("checks a redirect's target again", async () => {
    routes.set("/to-metadata", (_request, response) => {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
      response.end();
    });
    routes.set("/loop", (_request, response) => {
      response.writeHead(302, { location: "/loop" });
      response.end();
    });
    await expect(local()("http://news.example/to-metadata")).rejects.toMatchObject({ code: "address_blocked" });
    await expect(local({ maxRedirects: 3 })("http://news.example/loop")).rejects.toMatchObject({ code: "too_many_redirects" });
  });

  it("bounds the answer's size and type and names a missing page", async () => {
    routes.set("/big", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("x".repeat(5_000));
    });
    routes.set("/image", (_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end("png");
    });
    routes.set("/broken", (_request, response) => {
      response.writeHead(500);
      response.end();
    });
    await expect(local({ maxBytes: 1_000 })("http://news.example/big")).rejects.toMatchObject({ code: "response_too_large" });
    await expect(local()("http://news.example/image")).rejects.toMatchObject({ code: "unsupported_content" });
    await expect(local()("http://news.example/missing")).rejects.toMatchObject({ code: "not_found" });
    await expect(local()("http://news.example/broken")).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it("gives up on a page that does not answer in time, even in the middle of a compressed answer", async () => {
    routes.set("/slow", () => undefined);
    await expect(local({ timeoutMs: 200 })("http://news.example/slow")).rejects.toBeInstanceOf(NewsHttpError);
    routes.set("/stalled-gzip", (_request, response) => {
      response.writeHead(200, { "content-encoding": "gzip", "content-type": "text/html" });
      response.write(gzipSync(Buffer.from("x".repeat(10_000))).subarray(0, 40));
    });
    await expect(local({ timeoutMs: 300 })("http://news.example/stalled-gzip")).rejects.toMatchObject({ code: "fetch_failed" });
  });
});
