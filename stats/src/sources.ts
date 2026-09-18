/** Where the dashboard's numbers come from. Three Analytics Engine
 * datasets through the SQL API (the query API's, the site's clicks and
 * searches, the bot's), Discord's own list of the servers the bot user
 * is in, and the zone's request analytics through GraphQL for the API
 * host, which is R2 behind the CDN with no Worker to count for it.
 * Every source answers a value or an error string; a source that
 * fails leaves its section saying why, never the whole page. */
import type { Fetch } from "./access";

export interface Sources { fetchImpl: Fetch; token: string; account: string; zone?: string; botToken?: string; apiBase?: string }

/** A source's answer. `note` is a caveat worth showing next to the
 * value, such as a window narrower than the one asked for. */
export type Result<T> = { ok: true; value: T; note?: string } | { ok: false; error: string };
export type Row = Record<string, string | number | null>;

const CF = "https://api.cloudflare.com/client/v4";

/** Run one SQL statement against Analytics Engine. Numbers come back
 * as strings for 64-bit columns; they are coerced here. */
export async function sql(s: Sources, query: string): Promise<Result<Row[]>> {
  try {
    const res = await s.fetchImpl(`${CF}/accounts/${s.account}/analytics_engine/sql`, { method: "POST", headers: { authorization: `Bearer ${s.token}` }, body: query });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    const body = JSON.parse(text) as { data?: Row[] };
    return { ok: true, value: (body.data ?? []).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "day" ? Number(v) : v]))) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** The clauses every query shares: the window, and sampling-aware counts. */
const window = (days: number) => `timestamp > NOW() - INTERVAL '${Math.max(1, Math.min(90, Math.floor(days)))}' DAY`;
/** The deploy workflow proves the beacon route with one synthetic click
 * per deploy, to a host that can never resolve. Kept in the dataset as
 * evidence, never counted as a click. */
export const DEPLOY_CHECK_HOST = "deploy-check.invalid";
const CLICKS = `blob5 != 'search' AND blob1 != '${DEPLOY_CHECK_HOST}'`;
const N = "SUM(_sample_interval) AS n";
const DAY = "toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day";

export interface Guild { id: string; name: string; members: number }
export interface Report {
  days: number;
  api: ZoneReport;
  search: {
    siteDaily: Result<Row[]>; siteKeys: Result<Row[]>; siteEmptyTotal: Result<Row[]>; siteRejected: Result<Row[]>;
    apiDaily: Result<Row[]>; keys: Result<Row[]>; emptyTotal: Result<Row[]>;
    routes: Result<Row[]>; sources: Result<Row[]>; agents: Result<Row[]>; countries: Result<Row[]>; statuses: Result<Row[]>;
  };
  site: { daily: Result<Row[]>; hosts: Result<Row[]>; pages: Result<Row[]>; tracks: Result<Row[]> };
  bot: {
    daily: Result<Row[]>; commands: Result<Row[]>; outcomes: Result<Row[]>; contexts: Result<Row[]>; servers: Result<Row[]>; misses: Result<Row[]>; latency: Result<Row[]>;
    guilds: Result<Guild[]>; installs: Result<{ users: number | null; app: string }>;
  };
}

/** Everything the page shows, gathered in parallel. */
export async function gather(s: Sources, days: number, hosts: { api: string; query: string; bot: string; site: string; stats?: string }): Promise<Report> {
  const w = window(days);
  const q = (text: string) => sql(s, text);
  const [
    api,
    sDaily, sKeys, sEmptyTotal, sRejected, aDaily, keys, emptyTotal, routes, sources, agents, countries, statuses,
    cDaily, cHosts, cPages, cTracks,
    bDaily, bCommands, bOutcomes, bContexts, bServers, bMisses, bLatency, guilds, installs,
  ] = await Promise.all([
    zone(s, days, hosts),
    q(`SELECT ${DAY}, ${N} FROM kairos_site WHERE ${w} AND blob5 = 'search' GROUP BY day ORDER BY day`),
    q(`SELECT blob7 AS keys, ${N}, AVG(double1) AS results FROM kairos_site WHERE ${w} AND blob5 = 'search' AND double1 >= 0 GROUP BY keys ORDER BY n DESC LIMIT 25`),
    q(`SELECT ${N} FROM kairos_site WHERE ${w} AND blob5 = 'search' AND double1 = 0`),
    q(`SELECT ${N} FROM kairos_site WHERE ${w} AND blob5 = 'search' AND double1 < 0`),
    q(`SELECT ${DAY}, ${N} FROM kairos_query WHERE ${w} GROUP BY day ORDER BY day`),
    q(`SELECT blob5 AS keys, ${N}, AVG(double3) AS results FROM kairos_query WHERE ${w} AND blob1 = '/cards' AND double3 >= 0 GROUP BY keys ORDER BY n DESC LIMIT 25`),
    q(`SELECT ${N} FROM kairos_query WHERE ${w} AND blob1 = '/cards' AND double3 = 0`),
    q(`SELECT blob1 AS route, ${N} FROM kairos_query WHERE ${w} GROUP BY route ORDER BY n DESC`),
    q(`SELECT blob2 AS source, ${N} FROM kairos_query WHERE ${w} GROUP BY source ORDER BY n DESC`),
    q(`SELECT blob3 AS agent, ${N} FROM kairos_query WHERE ${w} GROUP BY agent ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob4 AS country, ${N} FROM kairos_query WHERE ${w} AND blob4 != '' GROUP BY country ORDER BY n DESC LIMIT 10`),
    q(`SELECT double1 AS status, ${N} FROM kairos_query WHERE ${w} GROUP BY status ORDER BY n DESC`),
    q(`SELECT ${DAY}, ${N} FROM kairos_site WHERE ${w} AND ${CLICKS} GROUP BY day ORDER BY day`),
    q(`SELECT blob1 AS host, ${N} FROM kairos_site WHERE ${w} AND ${CLICKS} GROUP BY host ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob2 AS page, blob1 AS host, ${N} FROM kairos_site WHERE ${w} AND ${CLICKS} GROUP BY page, host ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob3 AS track, ${N} FROM kairos_site WHERE ${w} AND ${CLICKS} AND blob3 != '' GROUP BY track ORDER BY n DESC`),
    q(`SELECT ${DAY}, ${N} FROM kairos_bot WHERE ${w} GROUP BY day ORDER BY day`),
    q(`SELECT blob1 AS kind, blob2 AS name, ${N} FROM kairos_bot WHERE ${w} AND blob1 != 'ping' GROUP BY kind, name ORDER BY n DESC LIMIT 20`),
    q(`SELECT blob3 AS outcome, ${N} FROM kairos_bot WHERE ${w} GROUP BY outcome ORDER BY n DESC`),
    q(`SELECT blob4 AS context, ${N} FROM kairos_bot WHERE ${w} AND blob1 IN ('command', 'menu', 'component') GROUP BY context ORDER BY n DESC`),
    q(`SELECT COUNT(DISTINCT blob5) AS servers FROM kairos_bot WHERE ${w} AND blob5 != ''`),
    q(`SELECT blob7 AS miss, ${N} FROM kairos_bot WHERE ${w} AND blob7 != '' GROUP BY miss ORDER BY n DESC LIMIT 15`),
    q(`SELECT quantileWeighted(0.5)(double1, _sample_interval) AS p50, quantileWeighted(0.95)(double1, _sample_interval) AS p95 FROM kairos_bot WHERE ${w} AND blob1 IN ('command', 'menu', 'component')`),
    discordGuilds(s),
    discordInstalls(s),
  ]);
  return {
    days,
    api,
    search: { siteDaily: sDaily, siteKeys: sKeys, siteEmptyTotal: sEmptyTotal, siteRejected: sRejected, apiDaily: aDaily, keys, emptyTotal, routes, sources, agents, countries, statuses },
    site: { daily: cDaily, hosts: cHosts, pages: cPages, tracks: cTracks },
    bot: { daily: bDaily, commands: bCommands, outcomes: bOutcomes, contexts: bContexts, servers: bServers, misses: bMisses, latency: bLatency, guilds, installs },
  };
}

// ---------------------------------------------------------------- Discord

const DISCORD = "https://discord.com/api/v10";
const discordHeaders = (token: string) => ({ authorization: `Bot ${token}`, "user-agent": "kairos-stats (+https://kairosarchive.net)" });

/** The servers the bot user is a member of, from Discord's own list:
 * exact, unlike the approximate counts on the application object, and
 * with each server's name and size. Only servers installed with the
 * `bot` scope have a bot user in them; a commands-only install shows
 * up in the interactions, never here. */
export async function discordGuilds(s: Sources): Promise<Result<Guild[]>> {
  if (!s.botToken) return { ok: false, error: "DISCORD_BOT_TOKEN is not set." };
  try {
    const guilds: Guild[] = [];
    let after = "";
    for (let page = 0; page < 10; page++) {
      const res = await s.fetchImpl(`${DISCORD}/users/@me/guilds?with_counts=true&limit=200${after ? `&after=${after}` : ""}`, { headers: discordHeaders(s.botToken) });
      if (!res.ok) return { ok: false, error: `Discord: HTTP ${res.status}` };
      const batch = (await res.json()) as { id: string; name: string; approximate_member_count?: number }[];
      for (const g of batch) guilds.push({ id: g.id, name: g.name, members: g.approximate_member_count ?? 0 });
      if (batch.length < 200) break;
      after = batch.at(-1)!.id;
    }
    return { ok: true, value: guilds.sort((a, b) => b.members - a.members) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Discord's approximate count of the accounts the app is installed on
 * (user installs), with the app's name so a token for the wrong app is
 * visible. A response without the count reports null, never zero. */
export async function discordInstalls(s: Sources): Promise<Result<{ users: number | null; app: string }>> {
  if (!s.botToken) return { ok: false, error: "DISCORD_BOT_TOKEN is not set." };
  try {
    const res = await s.fetchImpl(`${DISCORD}/applications/@me`, { headers: discordHeaders(s.botToken) });
    if (!res.ok) return { ok: false, error: `Discord: HTTP ${res.status}` };
    const app = (await res.json()) as { name?: string; approximate_user_install_count?: number };
    return { ok: true, value: { users: typeof app.approximate_user_install_count === "number" ? app.approximate_user_install_count : null, app: app.name ?? "unnamed app" } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ------------------------------------------------------------------- Zone

/** What the zone's request analytics say about the API host and the
 * others, over as much of the window as the plan allows. */
export interface ZoneReport {
  /** Days the numbers cover, and the days asked for. */
  covered: number; asked: number;
  hosts: Result<Row[]>;
  totals: Result<Row[]>; internal: Result<Row[]>; imageCache: Result<Row[]>;
  /** The API host's traffic by what was asked for: the whole dataset,
   * indexes, single objects, images, the alias, metadata. */
  kinds: Result<Row[]>;
  /** Whole-dataset downloads by file, status and client software. */
  downloads: Result<Row[]>;
  paths: Result<Row[]>; agents: Result<Row[]>; imageAgents: Result<Row[]>; countries: Result<Row[]>; statuses: Result<Row[]>;
}

/** Only known maintenance agents are excluded. kairos-bot and registry-mcp
 * serve real users and remain external. User-Agent attribution is a label,
 * not authentication or a reliable human/bot distinction. */
export const INTERNAL_AGENTS = ["sorcery-registry-release", "sorcery-registry-images", "sorcery-registry-audit", "sorcery-registry-check", "kairos-archive-build", "kairos-stats"];
const internalFilter = `OR: [${INTERNAL_AGENTS.map((ua) => `{userAgent_like: "${ua}%"}`).join(", ")}]`;
const externalFilter = `AND: [${INTERNAL_AGENTS.map((ua) => `{userAgent_notlike: "${ua}%"}`).join(", ")}]`;
const apiFilter = "datetime_geq: $since, datetime_lt: $until, clientRequestHTTPHost: $api";

/** Adaptive GraphQL aggregates are already estimates. Never multiply count
 * or sum by sampleInterval again. Analytics Engine SQL is a different API
 * and still requires SUM(_sample_interval).
 * https://developers.cloudflare.com/analytics/graphql-api/sampling/
 * Aggregate headline queries have no path/agent dimensions or top-N loss. */
const ZONE_QUERY = `query($zone: String!, $since: Time!, $until: Time!, $hosts: [String!], $api: String!, $bulk: [String!]) {
  viewer { zones(filter: { zoneTag: $zone }) {
    hosts: httpRequestsAdaptiveGroups(limit: 100, filter: { datetime_geq: $since, datetime_lt: $until, clientRequestHTTPHost_in: $hosts }) {
      count sum { edgeResponseBytes } dimensions { clientRequestHTTPHost cacheStatus } }
    paths: httpRequestsAdaptiveGroups(limit: 1000, orderBy: [count_DESC], filter: { ${apiFilter}, ${externalFilter} }) {
      count dimensions { clientRequestPath } }
    downloads: httpRequestsAdaptiveGroups(limit: 200, orderBy: [count_DESC], filter: { ${apiFilter}, ${externalFilter}, clientRequestHTTPMethodName: "GET", clientRequestPath_in: $bulk }) {
      count dimensions { clientRequestPath edgeResponseStatus userAgent } }
    agents: httpRequestsAdaptiveGroups(limit: 200, orderBy: [count_DESC], filter: { ${apiFilter}, ${externalFilter} }) {
      count dimensions { userAgent } }
    images: httpRequestsAdaptiveGroups(limit: 200, orderBy: [count_DESC], filter: { ${apiFilter}, ${externalFilter}, clientRequestPath_like: "/images/%" }) {
      count dimensions { userAgent } }
    internal: httpRequestsAdaptiveGroups(limit: 200, orderBy: [count_DESC], filter: { ${apiFilter}, ${internalFilter} }) {
      count dimensions { userAgent clientRequestHTTPMethodName } }
    countries: httpRequestsAdaptiveGroups(limit: 50, orderBy: [count_DESC], filter: { ${apiFilter}, ${externalFilter} }) {
      count dimensions { clientCountryName } }
    statuses: httpRequestsAdaptiveGroups(limit: 100, filter: { ${apiFilter}, ${externalFilter} }) {
      count dimensions { edgeResponseStatus } }
    imageCache: httpRequestsAdaptiveGroups(limit: 30, filter: { ${apiFilter}, ${externalFilter}, clientRequestPath_like: "/images/%", clientRequestHTTPMethodName: "GET", edgeResponseStatus: 200 }) {
      count dimensions { cacheStatus } }
    ${["external", "internal"].flatMap((scope) => [
      ["Requests", ""],
      ["Images", ', clientRequestPath_like: "/images/%"'],
      ["Downloads", ', clientRequestHTTPMethodName: "GET", edgeResponseStatus: 200, clientRequestPath_in: $bulk'],
      ["Head", ', clientRequestHTTPMethodName: "HEAD"'],
    ].map(([metric, filter]) => `${scope}${metric}: httpRequestsAdaptiveGroups(limit: 1, filter: { ${apiFilter}, ${scope === "internal" ? internalFilter : externalFilter}${filter} }) { count sum { edgeResponseBytes } }`)).join("\n")}
  } } }`;

type Group = { count: number; avg?: { sampleInterval?: number }; sum?: { edgeResponseBytes?: number }; dimensions: Record<string, string | number> };
type ZoneSlice = Record<string, Group[]>;

/** The widest window the zone's plan allows, read from the API's own
 * refusal ("cannot request a time range wider than 1d"), in days. */
export function allowedDays(error: string): number | undefined {
  const m = /wider than (\d+)([hdw])/.exec(error);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === "w" ? n * 7 : m[2] === "h" ? n / 24 : n;
}

/** At most this many slices per page view, so a 90-day window on a
 * plan limited to one day stays below the 300-query analytics budget
 * even with 17 aggregate nodes per slice and an initial refused query. */
export const MAX_SLICES = 15;

/** [since, until] pairs walking back from now in steps of `width` days. */
export function slices(days: number, width: number, now = Date.now()): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  const count = Math.min(MAX_SLICES, Math.ceil(days / width));
  for (let i = 0; i < count; i++) {
    const until = now - i * width * 86400 * 1000;
    const since = Math.max(until - width * 86400 * 1000, now - days * 86400 * 1000);
    out.push({ since: new Date(since).toISOString(), until: new Date(until).toISOString() });
  }
  return out;
}

async function zoneRequest(s: Sources, variables: Record<string, unknown>): Promise<Result<ZoneSlice>> {
  try {
    const res = await s.fetchImpl(`${CF}/graphql`, { method: "POST", headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: JSON.stringify({ query: ZONE_QUERY, variables: { zone: s.zone, ...variables } }) });
    if (!res.ok) return { ok: false, error: `Zone analytics: HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { viewer?: { zones?: ZoneSlice[] } }; errors?: { message: string }[] };
    if (body.errors?.length) return { ok: false, error: body.errors.map((e) => e.message).join("; ").slice(0, 300) };
    const value = body.data?.viewer?.zones?.[0];
    if (!value) return { ok: false, error: "Zone analytics returned no zone data." };
    const required = ["hosts", "paths", "downloads", "agents", "images", "internal", "countries", "statuses", "imageCache", ...["external", "internal"].flatMap((scope) => ["Requests", "Images", "Downloads", "Head"].map((metric) => `${scope}${metric}`))];
    if (required.some((field) => !Array.isArray(value[field]))) return { ok: false, error: "Zone analytics returned incomplete data." };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** The whole-dataset files every release publishes, so the download
 * count filters on exact paths rather than guessing from a pattern.
 * Read from the API's own versions.json; empty when it cannot be read. */
export async function bulkPaths(s: Sources): Promise<string[]> {
  const base = s.apiBase ?? "https://api.kairosarchive.net";
  try {
    const res = await s.fetchImpl(`${base}/versions.json`, { headers: { "user-agent": "kairos-stats (+https://kairosarchive.net)" } });
    if (!res.ok) return [];
    const doc = (await res.json()) as { latest?: Record<string, string>; releases?: { tag: string }[] };
    const tags = new Set<string>([...(doc.releases ?? []).map((r) => r.tag), ...Object.values(doc.latest ?? {})]);
    return [...tags].flatMap((tag) => [`/${tag}/registry.json`, `/${tag}/registry.json.gz`]);
  } catch {
    return [];
  }
}

const estimate = (g: Group) => g.count;

/** "/v3.4.1/registry.json" → "whole dataset"; "/images/…" → "images". */
export function kindOf(path: string): string {
  if (/^\/images\//.test(path)) return "images";
  if (/^\/v\d+\//.test(path)) return "alias (/vN → release)";
  if (/^\/v[\d.]+\/registry\.json(\.gz)?$/.test(path)) return "whole dataset";
  if (/^\/v[\d.]+\/index\//.test(path)) return "indexes";
  if (/^\/v[\d.]+\/(cards|printings|sets|slugs|history)\//.test(path) || /^\/v[\d.]+\/sets\.json$/.test(path)) return "single objects";
  if (path === "/versions.json" || /^\/v[\d.]+\/(index|schema|changes|manifest|registry\.json\.sha256|types\.d\.ts|RELEASED)/.test(path)) return "release metadata";
  return "other";
}

const BROWSERS: [RegExp, string][] = [[/Discordbot/i, "discordbot"], [/Edg\//, "edge"], [/OPR\//, "opera"], [/Firefox\//, "firefox"], [/Chrome\//, "chrome"], [/Safari\//, "safari"]];

/** A User-Agent as a family name, the same rule the query API uses. */
export function agentFamily(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "(none)";
  for (const [re, name] of BROWSERS) if (re.test(ua)) return name;
  return ua.split(/[/\s(]/)[0]!.toLowerCase().slice(0, 32);
}

/** Sum groups across slices by a key drawn from their dimensions. */
function merge(slicesDone: ZoneSlice[], field: string, key: (g: Group) => string, extra?: (row: Row, g: Group) => void): Row[] {
  const rows = new Map<string, Row>();
  for (const slice of slicesDone) {
    for (const g of slice[field] ?? []) {
      const k = key(g);
      const row = rows.get(k) ?? { key: k, n: 0 };
      row.n = (row.n as number) + estimate(g);
      extra?.(row, g);
      rows.set(k, row);
    }
  }
  return [...rows.values()].map((r) => ({ ...r, n: Math.round(r.n as number) })).sort((a, b) => (b.n as number) - (a.n as number));
}

export async function zone(s: Sources, days: number, hosts: { api: string; query: string; bot: string; site: string; stats?: string }): Promise<ZoneReport> {
  const fail = (error: string): ZoneReport => {
    const r: Result<Row[]> = { ok: false, error };
    return { covered: 0, asked: days, hosts: r, totals: r, internal: r, imageCache: r, kinds: r, downloads: r, paths: r, agents: r, imageAgents: r, countries: r, statuses: r };
  };
  if (!s.zone) return fail("CF_ZONE_ID is not set.");
  const bulk = await bulkPaths(s);
  if (!bulk.length) return fail("Release index unavailable: download totals cannot be determined.");
  const vars = { hosts: [hosts.site, hosts.api, hosts.query, hosts.bot, ...(hosts.stats ? [hosts.stats] : [])], api: hosts.api, bulk };

  // The whole window first; when the plan refuses it, as many slices of
  // the widest window it allows as fit, in parallel.
  let done: ZoneSlice[] = [];
  let covered = days;
  let note: string | undefined;
  const now = Date.now();
  const whole = await zoneRequest(s, { ...slices(days, days, now)[0], ...vars });
  if (whole.ok) {
    done = [whole.value];
  } else {
    const width = allowedDays(whole.error);
    if (width === undefined || width <= 0 || width >= days) return fail(whole.error);
    const wanted = slices(days, width, now);
    const answers = await Promise.all(wanted.map((sl) => zoneRequest(s, { ...sl, ...vars })));
    done = answers.filter((a): a is { ok: true; value: ZoneSlice } => a.ok).map((a) => a.value);
    if (!done.length) return fail(answers.find((a) => !a.ok)?.error ?? "no zone data");
    covered = wanted.reduce((sum, sl, i) => sum + (answers[i]!.ok ? (Date.parse(sl.until) - Date.parse(sl.since)) / 86400000 : 0), 0);
    const failed = answers.length - done.length;
    note = `${covered === days ? "The whole window" : `${covered} day${covered === 1 ? "" : "s"} covered; gaps may be present`}, in ${answers.length} request${answers.length === 1 ? "" : "s"} of ${width} day${width === 1 ? "" : "s"}${failed ? ` (${failed} answered with an error)` : ""}: the zone's plan allows no wider query.`;
  }

  const ok = (value: Row[]): Result<Row[]> => ({ ok: true, value, note });
  const hostRows = merge(done, "hosts", (g) => String(g.dimensions.clientRequestHTTPHost), (row, g) => {
    row.host = String(g.dimensions.clientRequestHTTPHost);
    row.bytes = ((row.bytes as number) ?? 0) + (g.sum?.edgeResponseBytes ?? 0);
    if (g.dimensions.cacheStatus === "hit") row.hits = ((row.hits as number) ?? 0) + estimate(g);
  }).map((r) => ({ ...r, hits: Math.round((r.hits as number) ?? 0), bytes: Math.round((r.bytes as number) ?? 0) }));
  const pathRows = merge(done, "paths", (g) => String(g.dimensions.clientRequestPath), (row, g) => { row.path = String(g.dimensions.clientRequestPath); });
  const kindRows = merge(done, "paths", (g) => kindOf(String(g.dimensions.clientRequestPath)), (row, g) => { row.kind = kindOf(String(g.dimensions.clientRequestPath)); });
  const downloadRows = merge(done, "downloads", (g) => `${g.dimensions.clientRequestPath}\t${g.dimensions.edgeResponseStatus}\t${agentFamily(String(g.dimensions.userAgent))}`, (row, g) => {
    row.path = String(g.dimensions.clientRequestPath); row.status = Number(g.dimensions.edgeResponseStatus); row.agent = agentFamily(String(g.dimensions.userAgent));
  });
  const agentRows = merge(done, "agents", (g) => agentFamily(String(g.dimensions.userAgent)), (row, g) => { row.agent = agentFamily(String(g.dimensions.userAgent)); });
  const imageAgentRows = merge(done, "images", (g) => agentFamily(String(g.dimensions.userAgent)), (row, g) => { row.agent = agentFamily(String(g.dimensions.userAgent)); });
  const countryRows = merge(done, "countries", (g) => String(g.dimensions.clientCountryName), (row, g) => { row.country = String(g.dimensions.clientCountryName); });
  const statusRows = merge(done, "statuses", (g) => String(g.dimensions.edgeResponseStatus), (row, g) => { row.status = Number(g.dimensions.edgeResponseStatus); });
  const totals = ["external", "internal"].map((scope) => {
    const row: Row = { scope };
    for (const metric of ["Requests", "Images", "Downloads", "Head"]) {
      row[metric.toLowerCase()] = Math.round(done.reduce((sum, slice) => sum + (slice[`${scope}${metric}`] ?? []).reduce((n, g) => n + g.count, 0), 0));
    }
    row.bytes = Math.round(done.reduce((sum, slice) => sum + (slice[`${scope}Requests`] ?? []).reduce((n, g) => n + (g.sum?.edgeResponseBytes ?? 0), 0), 0));
    return row;
  });
  const internalRows = merge(done, "internal", (g) => `${agentFamily(String(g.dimensions.userAgent))}\t${g.dimensions.clientRequestHTTPMethodName}`, (row, g) => {
    row.agent = agentFamily(String(g.dimensions.userAgent)); row.method = String(g.dimensions.clientRequestHTTPMethodName);
  });
  const imageCacheRows = merge(done, "imageCache", (g) => String(g.dimensions.cacheStatus), (row, g) => { row.status = String(g.dimensions.cacheStatus); });
  return {
    covered, asked: days,
    hosts: ok(hostRows), totals: ok(totals), internal: ok(internalRows), imageCache: ok(imageCacheRows), kinds: ok(kindRows), downloads: ok(downloadRows), paths: ok(pathRows.slice(0, 25)),
    agents: ok(agentRows.slice(0, 15)), imageAgents: ok(imageAgentRows.slice(0, 10)), countries: ok(countryRows.slice(0, 12)), statuses: ok(statusRows),
  };
}
