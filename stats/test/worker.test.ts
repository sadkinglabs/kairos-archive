/** The beacon route and the dashboard, end to end with fake sources. */
import { beforeEach, describe, expect, it } from "vitest";
import { forgetKeys } from "../src/access";
import { BLOBS } from "../src/event";
import { handle, type Env } from "../src/worker";
import { NOW, fakeCerts, good, token } from "./helpers";

type Point = { indexes?: (string | ArrayBuffer | null)[]; blobs?: (string | ArrayBuffer | null)[]; doubles?: number[] };
function dataset() {
  const points: Point[] = [];
  return { points, writeDataPoint: (p?: Point) => { if (p) points.push(p); } };
}
const SITE = "https://site.test";
const env: Env = { SITE_BASE_URL: SITE, ACCESS_TEAM_DOMAIN: "kairos.cloudflareaccess.com", ACCESS_AUD: "aud-0123", CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acc", CF_ZONE_ID: "zone", DISCORD_BOT_TOKEN: "bot" };

/** Answers every source with plausible data, or fails the ones named. */
function sources(failing: string[] = []) {
  const asked: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    asked.push(url);
    if (url.includes("/cdn-cgi/access/certs")) return fakeCerts(url);
    if (url.endsWith("/analytics_engine/sql")) {
      const q = String(init?.body);
      if (failing.some((f) => q.includes(f))) return new Response("boom", { status: 500 });
      if (q.includes("AS day")) return new Response(JSON.stringify({ data: [{ day: "2027-01-05 00:00:00", n: "12" }, { day: "2027-01-06 00:00:00", n: "30" }] }));
      if (q.includes("COUNT(DISTINCT")) return new Response(JSON.stringify({ data: [{ servers: "4" }] }));
      if (q.includes("quantileWeighted")) return new Response(JSON.stringify({ data: [{ p50: 41.5, p95: 120 }] }));
      if (q.includes("AS kind")) return new Response(JSON.stringify({ data: [{ kind: "command", name: "card", n: "25" }, { kind: "component", name: "pick", n: "5" }] }));
      if (q.includes("AS track")) return new Response(JSON.stringify({ data: [{ track: "discord-install", n: "3" }] }));
      if (q.includes("AS route")) return new Response(JSON.stringify({ data: [{ route: "/cards", n: "40" }, { route: "/cards/random", n: "2" }] }));
      if (q.includes("double3 = 0")) return new Response(JSON.stringify({ data: [{ n: "8" }] }));
      // Anything else: one row with every alias the query names set to a
      // string that must come out escaped.
      const aliases = [...q.matchAll(/ AS (\w+)/g)].map((m) => m[1]!).filter((a) => a !== "n");
      return new Response(JSON.stringify({ data: [{ ...Object.fromEntries(aliases.map((a) => [a, "<b>"])), n: "1" }] }));
    }
    if (url.includes("discord.com/api/v10/applications/@me")) return new Response(JSON.stringify({ approximate_guild_count: 7, approximate_user_install_count: 19 }));
    if (url.endsWith("/graphql")) {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (failing.includes("graphql")) return new Response(JSON.stringify({ errors: [{ message: "zone analytics: not allowed" }] }));
      const groups = body.query.includes("clientRequestPath")
        ? [{ count: 900, dimensions: { clientRequestPath: "/v3/cards/C000230.json" } }]
        : [{ count: 1000, sum: { edgeResponseBytes: 5000 }, dimensions: { clientRequestHTTPHost: "api.kairosarchive.net", cacheStatus: "hit" } }, { count: 200, sum: { edgeResponseBytes: 900 }, dimensions: { clientRequestHTTPHost: "api.kairosarchive.net", cacheStatus: "miss" } }];
      return new Response(JSON.stringify({ data: { viewer: { zones: [{ groups }] } } }));
    }
    return new Response("nf", { status: 404 });
  };
  return { fetchImpl, asked };
}

describe("POST /event", () => {
  const post = async (body: string, origin: string | null = SITE, cf?: { country: string }) => {
    const stats = dataset();
    const req = new Request("https://stats.test/event", { method: "POST", body, headers: origin ? { origin, "content-type": "text/plain" } : {} });
    if (cf) Object.defineProperty(req, "cf", { value: cf });
    const res = await handle(req, { ...env, STATS: stats });
    return { res, points: stats.points };
  };
  it("writes host, page, label and country, and answers 204 for the site's origin", async () => {
    const { res, points } = await post(JSON.stringify({ h: "discord.com", p: "/discord", t: "discord-install" }), SITE, { country: "ES" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(points).toHaveLength(1);
    expect(Object.fromEntries(BLOBS.map((k, i) => [k, points[0]!.blobs![i]]))).toEqual({ host: "discord.com", page: "/discord", track: "discord-install", country: "ES" });
    expect(points[0]!.indexes).toEqual(["discord.com"]);
  });
  it("refuses other origins, bad bodies and long bodies, and preflights", async () => {
    expect((await post("{}", "https://evil.example")).res.status).toBe(403);
    expect((await post("{}", null)).res.status).toBe(403);
    expect((await post("{not json")).res.status).toBe(400);
    expect((await post(JSON.stringify({ h: "x.test", p: "nope" }))).res.status).toBe(400);
    expect((await post(JSON.stringify({ p: "/" }))).res.status).toBe(400);
    expect((await post("x".repeat(600))).res.status).toBe(413);
    const pre = await handle(new Request("https://stats.test/event", { method: "OPTIONS" }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SITE);
  });
});

describe("GET /", () => {
  beforeEach(forgetKeys);
  const get = (t: string | null, env2: Env = env, src = sources(), path = "/") =>
    handle(new Request(`https://stats.test${path}`, { headers: t ? { "cf-access-jwt-assertion": t } : {} }), env2, { fetchImpl: src.fetchImpl, now: () => NOW });
  it("refuses without a valid Access token and says why", async () => {
    const res = await get(null);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("No Access token");
    expect((await get(await token({ ...good, aud: "other" }))).status).toBe(403);
  });
  it("renders the report for a good token", async () => {
    const src = sources();
    const res = await get(await token(good), env, src);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Kairos Archive · usage");
    expect(html).toContain("owner@example.com");
    expect(html).toContain("<div class=\"value\">42</div>");          // 12 + 30 interactions
    expect(html).toContain("7 servers · 19 accounts");
    expect(html).toContain("p50 42 ms · p95 120 ms");
    expect(html).toContain("<td>command</td><td>card</td><td>25</td>");
    expect(html).toContain("20% of list queries");                     // 8 of 40
    expect(html).toContain("&lt;b&gt;");                               // escaped
    expect(html).toContain("<polyline");
    expect(html).toContain("<td>api.kairosarchive.net</td><td>1,200</td><td>1,000</td><td>5,900</td>");
    expect(html).toContain("/v3/cards/C000230.json");
    expect(src.asked.filter((u) => u.endsWith("/analytics_engine/sql")).length).toBeGreaterThan(15);
  });
  it("shows a failed source in its own section and keeps the rest", async () => {
    const res = await get(await token(good), env, sources(["AS kind", "graphql"]));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("HTTP 500: boom");
    expect(html).toContain("zone analytics: not allowed");
    expect(html).toContain("7 servers · 19 accounts");
  });
  it("honours the window and refuses an unconfigured dashboard", async () => {
    const src = sources();
    await get(await token(good), env, src, "/?days=30");
    expect(src.asked.length).toBeGreaterThan(0);
    const res = await get(await token(good), { ...env, CF_API_TOKEN: undefined }, src);
    expect(res.status).toBe(503);
  });
  it("answers /health without a token and 404 elsewhere", async () => {
    expect((await get(null, env, sources(), "/health")).status).toBe(200);
    expect((await get(null, env, sources(), "/nope")).status).toBe(404);
  });
});
