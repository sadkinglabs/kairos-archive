/** The Function is the whole of /random, and no build can exercise it, so
 * its behaviour is pinned here: what it redirects to, what it refuses to
 * cache, what it says when the card index cannot be read, and what it does
 * for callers that are not a visitor on the site. */
import { afterEach, describe, expect, it, vi } from "vitest";

const NAMES = [
  { name: "Polar Bears", codex_id: "C000230", path: "/cards/C000230/polar-bears" },
  { name: "Frog", codex_id: "C001100", path: "/cards/C001100/frog" },
  { name: "Rubble", codex_id: "C000459", path: "/cards/C000459/rubble" },
];
const PATHS = NAMES.map((entry) => entry.path);

/** A fresh module each time: the path list and the failure hold are module
 * state, so a test that shares them with the last one is not testing what
 * it says. */
async function load() {
  vi.resetModules();
  return await import("./random");
}

type Asset = () => Promise<Response>;

function context(asset: Asset, options: { binding?: boolean; url?: string; method?: string } = {}) {
  // Typed with the request it receives, so a test can assert what it asked for.
  const fetchAsset = vi.fn((_request: Request) => asset());
  return {
    fetchAsset,
    ctx: {
      request: new Request(options.url ?? "https://kairosarchive.net/random", { method: options.method ?? "GET" }),
      env: options.binding === false ? {} : { ASSETS: { fetch: fetchAsset } },
    },
  };
}

const served: Asset = async () => new Response(JSON.stringify(NAMES), { headers: { "content-type": "application/json" } });
const broken: Asset = async () => new Response("nope", { status: 500 });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("GET /random", () => {
  it("redirects to a card page on this site", async () => {
    const { onRequest } = await load();
    const response = await onRequest(context(served).ctx);
    expect(response.status).toBe(302);
    expect(PATHS).toContain(response.headers.get("location"));
  });

  it("is never cached, by the browser or the edge, and never indexed", async () => {
    const { onRequest } = await load();
    const response = await onRequest(context(served).ctx);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("can land on any card, and reads the list once", async () => {
    const { onRequest } = await load();
    const { ctx, fetchAsset } = context(served);
    const seen = new Set<string | null>();
    for (let i = 0; i < 200; i++) seen.add((await onRequest(ctx)).headers.get("location"));
    expect([...seen].sort()).toEqual([...PATHS].sort());
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("reads the index from the deployment it is serving", async () => {
    const { onRequest } = await load();
    const { ctx, fetchAsset } = context(served);
    await onRequest(ctx);
    expect(fetchAsset.mock.calls[0][0].url).toBe("https://kairosarchive.net/data/names.json");
  });

  it("answers HEAD like GET, without a body", async () => {
    const { onRequest } = await load();
    const response = await onRequest(context(served, { method: "HEAD" }).ctx);
    expect(response.status).toBe(302);
    expect(PATHS).toContain(response.headers.get("location"));
  });
});

describe("callers that are not a visitor on the site", () => {
  it("refuses methods it does not serve before doing any work", async () => {
    const { onRequest } = await load();
    for (const method of ["POST", "PUT", "DELETE"]) {
      const { ctx, fetchAsset } = context(served, { method });
      const response = await onRequest(ctx);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(fetchAsset).not.toHaveBeenCalled();
    }
  });

  it("sends the project's pages.dev hostname to the site, where the rate rule is", async () => {
    const { onRequest } = await load();
    const { ctx, fetchAsset } = context(served, { url: "https://kairos-archive.pages.dev/random" });
    const response = await onRequest(ctx);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://kairosarchive.net/random");
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("sends any stranger's hostname there too", async () => {
    const { onRequest } = await load();
    const response = await onRequest(context(served, { url: "https://evil.example/random" }).ctx);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://kairosarchive.net/random");
  });

  it("still serves preview deployments, where changes to it are reviewed", async () => {
    const { onRequest } = await load();
    for (const host of ["ce37a2a4.kairos-archive.pages.dev", "feat-cards-index.kairos-archive.pages.dev", "localhost"]) {
      const response = await onRequest(context(served, { url: `https://${host}/random` }).ctx);
      expect(response.status, host).toBe(302);
    }
  });
});

describe("when the index cannot be read", () => {
  it("says so plainly, without the internals, and does not pretend", async () => {
    const { onRequest } = await load();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await onRequest(context(broken).ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("retry-after")).toBe("30");
    const body = await response.text();
    expect(body).toContain("could not be read");
    expect(body).not.toContain("HTTP 500");            // the detail is for the log
    expect(spy).toHaveBeenCalledWith("[random]", expect.any(Error));
  });

  it("holds off retrying for thirty seconds, then tries again", async () => {
    vi.useFakeTimers();
    const { onRequest, FAILURE_HOLD_MS } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let ok = false;
    const { ctx, fetchAsset } = context(async () => (ok ? served() : broken()));
    expect((await onRequest(ctx)).status).toBe(503);
    ok = true;
    // Inside the hold: still 503, and the asset is not asked again.
    expect((await onRequest(ctx)).status).toBe(503);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FAILURE_HOLD_MS + 1);
    expect((await onRequest(ctx)).status).toBe(302);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("refuses to run without the ASSETS binding rather than fetching in public", async () => {
    const { onRequest } = await load();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const publicFetch = vi.fn();
    vi.stubGlobal("fetch", publicFetch);
    const response = await onRequest(context(served, { binding: false }).ctx);
    expect(response.status).toBe(503);
    expect(publicFetch).not.toHaveBeenCalled();
    expect(String(spy.mock.calls[0][1])).toContain("ASSETS");
    vi.unstubAllGlobals();
  });

  it("will not send a Location off this site", async () => {
    const { onRequest } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await onRequest(context(async () => new Response(JSON.stringify([{ path: "https://example.com/" }]))).ctx);
    expect(response.status).toBe(503);
  });
});
