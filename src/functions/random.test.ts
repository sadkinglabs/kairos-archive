/** The Function is the whole of /random, and no build can exercise it, so
 * its behaviour is pinned here: what it redirects to, what it refuses to
 * cache, and what it says when the card index cannot be read. */
import { describe, expect, it, vi } from "vitest";

const NAMES = [
  { name: "Polar Bears", codex_id: "C000230", path: "/cards/C000230/polar-bears" },
  { name: "Frog", codex_id: "C001100", path: "/cards/C001100/frog" },
  { name: "Rubble", codex_id: "C000459", path: "/cards/C000459/rubble" },
];
const PATHS = NAMES.map((entry) => entry.path);

/** A fresh module each time: the path list is cached in module scope, so a
 * test that shares it with the last one is not testing what it says. */
async function load() {
  vi.resetModules();
  return (await import("./random")).onRequest;
}

function context(asset: () => Promise<Response>, options: { binding?: boolean } = {}) {
  // Typed with the request it receives, so a test can assert what it asked for.
  const fetchAsset = vi.fn((_request: Request) => asset());
  if (options.binding === false) vi.stubGlobal("fetch", fetchAsset);
  return {
    fetchAsset,
    ctx: {
      request: new Request("https://kairosarchive.net/random"),
      env: options.binding === false ? {} : { ASSETS: { fetch: fetchAsset } },
    },
  };
}

const served = async () => new Response(JSON.stringify(NAMES), { headers: { "content-type": "application/json" } });

describe("GET /random", () => {
  it("redirects to a card page on this site", async () => {
    const onRequest = await load();
    const { ctx } = context(served);
    const response = await onRequest(ctx);
    expect(response.status).toBe(302);
    expect(PATHS).toContain(response.headers.get("location"));
  });

  it("is never cached, by the browser or the edge", async () => {
    const onRequest = await load();
    const { ctx } = context(served);
    const response = await onRequest(ctx);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("can land on any card, and reads the list once", async () => {
    const onRequest = await load();
    const { ctx, fetchAsset } = context(served);
    const seen = new Set<string | null>();
    for (let i = 0; i < 200; i++) seen.add((await onRequest(ctx)).headers.get("location"));
    expect([...seen].sort()).toEqual([...PATHS].sort());
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("reads the index from the deployment it is serving", async () => {
    const onRequest = await load();
    const { ctx, fetchAsset } = context(served);
    await onRequest(ctx);
    expect(fetchAsset.mock.calls[0][0].url).toBe("https://kairosarchive.net/data/names.json");
  });

  it("says so, and does not pretend, when the index cannot be read", async () => {
    const onRequest = await load();
    const { ctx } = context(async () => new Response("nope", { status: 500 }));
    const response = await onRequest(ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("HTTP 500");
  });

  it("does not remember a failed read", async () => {
    const onRequest = await load();
    let ok = false;
    const { ctx } = context(async () => (ok ? await served() : new Response("nope", { status: 500 })));
    expect((await onRequest(ctx)).status).toBe(503);
    ok = true;
    expect((await onRequest(ctx)).status).toBe(302);
  });

  it("works without the ASSETS binding", async () => {
    const onRequest = await load();
    const { ctx } = context(served, { binding: false });
    const response = await onRequest(ctx);
    expect(response.status).toBe(302);
    expect(PATHS).toContain(response.headers.get("location"));
    vi.unstubAllGlobals();
  });

  it("will not send a Location off this site", async () => {
    const onRequest = await load();
    const { ctx } = context(async () => new Response(JSON.stringify([{ path: "https://example.com/" }])));
    expect((await onRequest(ctx)).status).toBe(503);
  });
});
