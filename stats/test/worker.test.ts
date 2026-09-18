/** The beacon route and the dashboard, end to end with fake sources. */
import { beforeEach, describe, expect, it } from "vitest";
import { forgetKeys } from "../src/access";
import { BLOBS, DOUBLES } from "../src/event";
import { handle, type Env } from "../src/worker";
import { NOW, fakeCerts, good, token } from "./helpers";

type Point = { indexes?: (string | ArrayBuffer | null)[]; blobs?: (string | ArrayBuffer | null)[]; doubles?: number[] };
function dataset() {
  const points: Point[] = [];
  return { points, writeDataPoint: (p?: Point) => { if (p) points.push(p); } };
}
const SITE = "https://site.test";
const env: Env = { SITE_BASE_URL: SITE, API_HOST: "api.test", ACCESS_TEAM_DOMAIN: "kairos.cloudflareaccess.com", ACCESS_AUD: "aud-0123", CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acc", CF_ZONE_ID: "zone", DISCORD_BOT_TOKEN: "bot" };

interface Opts { zoneMaxDays?: number; discord?: Record<string, unknown>; guilds?: Record<string, unknown>[] | number; untimed?: boolean; noVersions?: boolean }

/** Answers every source with plausible data, or fails the ones named. */
function sources(failing: string[] = [], opts: Opts = {}) {
  const asked: string[] = [];
  const bodies: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    asked.push(url);
    if (url.includes("/cdn-cgi/access/certs")) return fakeCerts(url);
    if (url === "https://api.test/versions.json") {
      if (opts.noVersions) return new Response("nf", { status: 404 });
      return new Response(JSON.stringify({ latest: { v3: "v3.4.1" }, releases: [{ tag: "v3.4.0" }, { tag: "v3.4.1" }] }));
    }
    if (url.endsWith("/analytics_engine/sql")) {
      const q = String(init?.body);
      bodies.push(q);
      if (failing.some((f) => q.includes(f))) return new Response("boom", { status: 500 });
      if (q.includes("AS day")) return new Response(JSON.stringify({ data: [{ day: "2027-01-05 00:00:00", n: "12" }, { day: "2027-01-06 00:00:00", n: "30" }] }));
      if (q.includes("COUNT(DISTINCT")) return new Response(JSON.stringify({ data: [{ servers: "4" }] }));
      if (q.includes("quantileWeighted")) return new Response(JSON.stringify({ data: [opts.untimed ? { p50: null, p95: null } : { p50: 41.5, p95: 120 }] }));
      if (q.includes("AS kind")) return new Response(JSON.stringify({ data: [{ kind: "command", name: "card", n: "25" }, { kind: "component", name: "pick", n: "5" }] }));
      if (q.includes("AS track")) return new Response(JSON.stringify({ data: [{ track: "discord-install", n: "3" }] }));
      if (q.includes("AS route")) return new Response(JSON.stringify({ data: [{ route: "/cards", n: "40" }, { route: "/cards/random", n: "2" }] }));
      if (q.includes("blob7 AS keys")) return new Response(JSON.stringify({ data: [{ keys: "e t <b>", n: "9", results: 12.4 }, { keys: "", n: "3", results: 1 }] }));
      if (q.includes("kairos_site") && q.includes("double1 = 0")) return new Response(JSON.stringify({ data: [{ n: "5" }] }));
      if (q.includes("kairos_site") && q.includes("double1 < 0")) return new Response(JSON.stringify({ data: [{ n: "2" }] }));
      if (q.includes("kairos_query") && q.includes("double3 = 0")) return new Response(JSON.stringify({ data: [{ n: "8" }] }));
      // Anything else: one row with every alias the query names set to a
      // string that must come out escaped.
      const aliases = [...q.matchAll(/ AS (\w+)/g)].map((m) => m[1]!).filter((a) => a !== "n");
      return new Response(JSON.stringify({ data: [{ ...Object.fromEntries(aliases.map((a) => [a, "<b>"])), n: "1" }] }));
    }
    if (url.includes("discord.com/api/v10/applications/@me")) return new Response(JSON.stringify(opts.discord ?? { name: "Kairos", approximate_guild_count: 7, approximate_user_install_count: 19 }));
    if (url.includes("discord.com/api/v10/users/@me/guilds")) {
      if (typeof opts.guilds === "number") return new Response("nope", { status: opts.guilds });
      const after = new URL(url).searchParams.get("after");
      const all = opts.guilds ?? [{ id: "1", name: "Sorcerer's <Summit>", approximate_member_count: 1200 }, { id: "2", name: "Kitchen table", approximate_member_count: 9 }];
      const from = after ? all.findIndex((g) => g.id === after) + 1 : 0;
      return new Response(JSON.stringify(all.slice(from, from + 200)));
    }
    if (url.endsWith("/graphql")) {
      const body = JSON.parse(String(init?.body)) as { query: string; variables: { since: string; until: string; bulk: string[] } };
      bodies.push(String(init?.body));
      if (failing.includes("graphql")) return new Response(JSON.stringify({ errors: [{ message: "zone analytics: not allowed" }] }));
      const span = (Date.parse(body.variables.until) - Date.parse(body.variables.since)) / 86400000;
      if (opts.zoneMaxDays !== undefined && span > opts.zoneMaxDays + 0.01) {
        return new Response(JSON.stringify({ errors: [{ message: `zone "z" cannot request a time range wider than ${opts.zoneMaxDays}d, but your query time range spans 1w` }] }));
      }
      const g = (count: number, dimensions: Record<string, string | number>, extra: Record<string, unknown> = {}) => ({ count, avg: { sampleInterval: 2 }, ...extra, dimensions });
      const zone = {
        externalRequests: [g(600, {}, { sum: { edgeResponseBytes: 2950 } })],
        externalDownloads: [g(4, {})], externalImages: [g(12348, {})], externalHead: [g(5, {})],
        internalRequests: [g(20, {})], internalDownloads: [g(1, {})], internalImages: [g(19, {})], internalHead: [g(19, {})],
        internal: [g(19, { userAgent: "sorcery-registry-release/schema11", clientRequestHTTPMethodName: "HEAD" })],
        imageCache: [g(90, { cacheStatus: "hit" }), g(10, { cacheStatus: "miss" })],
        hosts: [g(500, { clientRequestHTTPHost: "api.test", cacheStatus: "hit" }, { sum: { edgeResponseBytes: 2500 } }), g(100, { clientRequestHTTPHost: "api.test", cacheStatus: "miss" }, { sum: { edgeResponseBytes: 450 } }), g(50, { clientRequestHTTPHost: "site.test", cacheStatus: "hit" }, { sum: { edgeResponseBytes: 100 } })],
        paths: [g(300, { clientRequestPath: "/images/P000937.ab12cd34ef56.normal.webp" }), g(20, { clientRequestPath: "/v3.4.1/cards/C000230.json" }), g(5, { clientRequestPath: "/v3.4.1/registry.json" }), g(2, { clientRequestPath: "/v3/cards/C000230.json" }), g(1, { clientRequestPath: "/versions.json" }), g(1, { clientRequestPath: "/<x>" })],
        downloads: [g(4, { clientRequestPath: "/v3.4.1/registry.json", edgeResponseStatus: 200, userAgent: "sorcery-registry-mcp (+https://kairosarchive.net)" }), g(1, { clientRequestPath: "/v3.4.1/registry.json", edgeResponseStatus: 304, userAgent: "curl/8.6.0" })],
        agents: [g(300, { userAgent: "Mozilla/5.0 (X11) Chrome/140.0" }), g(4, { userAgent: "sorcery-registry-mcp (+https://kairosarchive.net)" })],
        images: [g(200, { userAgent: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" }), g(100, { userAgent: "Mozilla/5.0 (X11) Chrome/140.0" })],
        countries: [g(200, { clientCountryName: "AU" }), g(100, { clientCountryName: "US" })],
        statuses: [g(290, { edgeResponseStatus: 200 }), g(10, { edgeResponseStatus: 404 })],
      };
      return new Response(JSON.stringify({ data: { viewer: { zones: [zone] } } }));
    }
    return new Response("nf", { status: 404 });
  };
  return { fetchImpl, asked, bodies };
}

describe("POST /event", () => {
  const post = async (body: string, origin: string | null = SITE, cf?: { country: string }) => {
    const stats = dataset();
    const req = new Request("https://stats.test/event", { method: "POST", body, headers: origin ? { origin, "content-type": "text/plain" } : {} });
    if (cf) Object.defineProperty(req, "cf", { value: cf });
    const res = await handle(req, { ...env, STATS: stats });
    return { res, points: stats.points };
  };
  const named = (p: Point) => Object.fromEntries(BLOBS.map((k, i) => [k, p.blobs![i]]));
  it("writes a click's host, page, label and country, and answers 204 for the site's origin", async () => {
    const { res, points } = await post(JSON.stringify({ h: "discord.com", p: "/discord", t: "discord-install" }), SITE, { country: "ES" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(points).toHaveLength(1);
    expect(named(points[0]!)).toEqual({ host: "discord.com", page: "/discord", track: "discord-install", country: "ES", kind: "click", unused: "", keys: "" });
    expect(points[0]!.indexes).toEqual(["discord.com"]);
    expect(points[0]!.doubles).toEqual([0]);
  });
  it("writes a search's keys and result count, never its words, and refuses a malformed one", async () => {
    const { res, points } = await post(JSON.stringify({ k: "search", keys: " e t ", n: 12, p: "/search", q: "polar bears" }), SITE, { country: "AU" });
    expect(res.status).toBe(204);
    expect(named(points[0]!)).toEqual({ host: "", page: "/search", track: "", country: "AU", kind: "search", unused: "", keys: "e t" });
    expect(JSON.stringify(points[0])).not.toContain("polar");
    expect(points[0]!.indexes).toEqual(["search"]);
    expect(DOUBLES.map((_, i) => points[0]!.doubles![i])).toEqual([12]);
    const bare = await post(JSON.stringify({ k: "search", keys: "", n: 3, p: "/cards" }));
    expect(bare.res.status).toBe(204);
    expect(named(bare.points[0]!).keys).toBe("");
    const rejected = await post(JSON.stringify({ k: "search", n: -1, p: "/cards" }));
    expect(rejected.points[0]!.doubles).toEqual([-1]);
    const long = await post(JSON.stringify({ k: "search", keys: "x".repeat(300), n: 0, p: "/search" }));
    expect(named(long.points[0]!).keys).toHaveLength(200);
    expect((await post(JSON.stringify({ k: "search", keys: "a", n: -2, p: "/search" }))).res.status).toBe(400);
    expect((await post(JSON.stringify({ k: "search", keys: "a", n: 1.5, p: "/search" }))).res.status).toBe(400);
    expect((await post(JSON.stringify({ k: "search", keys: "a", n: 1, p: "search" }))).res.status).toBe(400);
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
  const page = async (src = sources(), path = "/", env2: Env = env) => (await get(await token(good), env2, src, path)).text();

  it("refuses without a valid Access token and says why", async () => {
    const res = await get(null);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("No Access token");
    expect((await get(await token({ ...good, aud: "other" }))).status).toBe(403);
  });
  it("renders the report for a good token, sections in priority order", async () => {
    const src = sources();
    const res = await get(await token(good), env, src);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Kairos Archive · usage");
    const order = ["Data and images", "<h2>Search</h2>", "<h2>Site</h2>", "Discord bot"].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > 0)).toBe(true);
    // GraphQL aggregates already account for sampling.
    expect(html).toContain('<td class="text">api.test</td><td class="n bar" style="--w:100%">600</td><td class="n">500</td><td class="n">2.9 KB</td>');
    expect(html).toContain("whole-dataset downloads");
    expect(html).toMatch(/<div class="value">4<\/div><div class="label">whole-dataset downloads<\/div>/);   // Four GET 200s, the 304 not counted
    expect(html).toContain("sorcery-registry-mcp");
    expect(html).toContain('<span class="status s3">304</span>');
    expect(html).toContain("<td class=\"text\">images</td>");
    expect(html).toContain("<td class=\"text\">whole dataset</td>");
    expect(html).toContain("<td class=\"text\">alias (/vN → release)</td>");
    expect(html).toContain("<td class=\"text\">discordbot</td>");
    expect(html).toContain("&lt;x&gt;");                                                // escaped path
    expect(html).toContain("<code>e t &lt;b&gt;</code>");                              // escaped keys
    expect(html).toContain("<code>(bare words only)</code>");                          // a search with no keys
    expect(html).not.toMatch(/blob6/);                                                  // the old query-text slot is never read
    expect(html).toContain("5 found nothing (12%)");                                   // site: 5 of 42 searches
    expect(html).toContain('<div class="value">2</div><div class="label">queries the site rejected</div>');
    expect(html).toContain("8 found nothing (20%)");                                   // API: 8 of 40
    expect(html).toContain("p50 42 ms · p95 120 ms");
    expect(html).toContain('<td class="text">command</td><td class="text">card</td><td class="n bar" style="--w:100%">25</td>');
    expect(html).toContain("Sorcerer&#39;s &lt;Summit&gt;");
    expect(html).toContain('<div class="value">2</div><div class="label">servers it is installed in</div>');
    expect(html).toContain('<div class="value">19</div><div class="label">accounts it is installed on</div>');
    expect(html).toContain("Discord&#39;s live count for Kairos");
    expect(html).toContain("<polyline");
    expect(src.asked.filter((u) => u.endsWith("/analytics_engine/sql")).length).toBeGreaterThan(20);
    const bulk = (JSON.parse(src.bodies.find((b) => b.startsWith("{"))!) as { variables: { bulk: string[] } }).variables.bulk;
    expect(bulk).toEqual(["/v3.4.0/registry.json", "/v3.4.0/registry.json.gz", "/v3.4.1/registry.json", "/v3.4.1/registry.json.gz"]);
  });
  it("shows a failed source in its own section and keeps the rest", async () => {
    const html = await page(sources(["AS kind", "graphql"]));
    expect(html).toContain("HTTP 500: boom");
    expect(html).toContain("zone analytics: not allowed");
    expect(html).toContain("Sorcerer&#39;s &lt;Summit&gt;");
  });
  it("asks the zone day by day when the plan allows no more, and says how much it covered", async () => {
    const src = sources([], { zoneMaxDays: 1 });
    const html = await page(src, "/?days=7");
    expect(html).toContain("The whole window, in 7 requests of 1 day: the zone&#39;s plan allows no wider query.");
    expect(html).toContain('<td class="text">api.test</td><td class="n bar" style="--w:100%">4,200</td>');   // 7 × 600
    expect(html).not.toContain("wider than");
    expect(src.asked.filter((u) => u.endsWith("/graphql")).length).toBe(8);   // the whole window once, then 7 slices
    const narrow = sources([], { zoneMaxDays: 1 });
    const day = await page(narrow, "/?days=1");
    expect(day).not.toContain("plan allows");
    expect(narrow.asked.filter((u) => u.endsWith("/graphql")).length).toBe(1);
    const long = sources([], { zoneMaxDays: 1 });
    const html90 = await page(long, "/?days=90");
    expect(html90).toContain("15 days covered; gaps may be present, in 15 requests of 1 day");
    expect(long.asked.filter((u) => u.endsWith("/graphql")).length).toBe(16);
  });
  it("reports Discord's answers honestly: no guild list, no user count, no timed answers", async () => {
    const html = await page(sources([], { guilds: 401, discord: { name: "Kairos" }, untimed: true }));
    expect(html).toContain("Discord: HTTP 401");
    expect(html).toContain('<div class="value">not reported</div><div class="label">accounts it is installed on</div>');
    expect(html).toContain("no timed answers yet");
    expect(html).not.toContain("p50");
    const many = Array.from({ length: 250 }, (_, i) => ({ id: String(i + 1), name: `g${i}`, approximate_member_count: i }));
    const src = sources([], { guilds: many });
    const paged = await page(src);
    expect(paged).toContain('<div class="value">250</div><div class="label">servers it is installed in</div>');
    expect(src.asked.filter((u) => u.includes("/users/@me/guilds")).length).toBe(2);
  });
  it("never counts the deploy workflow's synthetic click", async () => {
    const src = sources();
    await page(src);
    const site = src.bodies.filter((b) => b.includes("kairos_site") && !b.includes("'search'  ") && b.includes("blob5 != 'search'"));
    expect(site.length).toBe(4);
    for (const q of site) expect(q).toContain("blob1 != 'deploy-check.invalid'");
  });
  it("reports unavailable totals when the release index fails", async () => {
    const src = sources([], { noVersions: true });
    const html = await page(src);
    expect(html).toContain("Release index unavailable");
    expect(html).toContain('<div class="value">–</div><div class="label">external API requests</div>');
    expect(src.asked.some((u) => u.endsWith("/graphql"))).toBe(false);
  });
  it("uses independent totals and separates verification methods from public usage", async () => {
    const src = sources();
    const html = await page(src);
    // The top-path fixture has only 300 image requests, while the aggregate
    // includes all 12,348. Neither may be multiplied by sampleInterval=2.
    expect(html).toContain('<div class="value">12,348</div><div class="label">external image requests</div>');
    expect(html).toContain('<div class="value">90%</div><div class="label">image GET cache hits</div>');
    expect(html).toContain("Internal API clients");
    expect(html).toContain("HEAD");
    const query = JSON.parse(src.bodies.find((b) => b.startsWith("{"))!).query as string;
    expect(query).not.toContain("sampleInterval");
    expect(query).toContain('userAgent_notlike: "sorcery-registry-release%"');
    expect(query).not.toContain('userAgent_notlike: "kairos-bot');
    expect(query).not.toContain('userAgent_notlike: "sorcery-registry-mcp');
    expect(query).toContain('clientRequestHTTPMethodName: "GET", edgeResponseStatus: 200');
    expect(query).toContain("datetime_lt: $until");
    expect(query).not.toContain("datetime_leq");
  });
  it("honours the window and refuses an unconfigured dashboard", async () => {
    const src = sources();
    await page(src, "/?days=30");
    expect(src.asked.length).toBeGreaterThan(0);
    const res = await get(await token(good), { ...env, CF_API_TOKEN: undefined }, src);
    expect(res.status).toBe(503);
  });
  it("answers /health without a token and 404 elsewhere", async () => {
    expect((await get(null, env, sources(), "/health")).status).toBe(200);
    expect((await get(null, env, sources(), "/nope")).status).toBe(404);
  });
});
