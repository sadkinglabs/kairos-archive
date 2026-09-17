/** Where the dashboard's numbers come from. Three Analytics Engine
 * datasets through the SQL API (the bot's, the query API's and the
 * site's clicks), Discord's own count of installs, and the zone's
 * request analytics through GraphQL for the hosts no Worker runs on.
 * Every source answers a value or an error string; a source that
 * fails leaves its section saying why, never the whole page. */
import type { Fetch } from "./access";

export interface Sources { fetchImpl: Fetch; token: string; account: string; zone?: string; botToken?: string; appId?: string }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
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
const N = "SUM(_sample_interval) AS n";

export interface Series { day: string; n: number }
export interface Report {
  days: number;
  bot: {
    daily: Result<Row[]>; commands: Result<Row[]>; outcomes: Result<Row[]>; contexts: Result<Row[]>; servers: Result<Row[]>; misses: Result<Row[]>; latency: Result<Row[]>;
    installs: Result<{ servers: number; users: number }>;
  };
  query: { daily: Result<Row[]>; routes: Result<Row[]>; sources: Result<Row[]>; agents: Result<Row[]>; countries: Result<Row[]>; statuses: Result<Row[]>; keys: Result<Row[]>; empty: Result<Row[]> };
  site: { daily: Result<Row[]>; hosts: Result<Row[]>; pages: Result<Row[]>; tracks: Result<Row[]> };
  zone: { hosts: Result<Row[]>; paths: Result<Row[]> };
}

/** Everything the page shows, gathered in parallel. */
export async function gather(s: Sources, days: number, hosts: { api: string; query: string; bot: string; site: string }): Promise<Report> {
  const w = window(days);
  const q = (text: string) => sql(s, text);
  const [
    botDaily, botCommands, botOutcomes, botContexts, botServers, botMisses, botLatency, installs,
    qDaily, qRoutes, qSources, qAgents, qCountries, qStatuses, qKeys, qEmpty,
    sDaily, sHosts, sPages, sTracks, zHosts, zPaths,
  ] = await Promise.all([
    q(`SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, ${N} FROM kairos_bot WHERE ${w} GROUP BY day ORDER BY day`),
    q(`SELECT blob1 AS kind, blob2 AS name, ${N} FROM kairos_bot WHERE ${w} AND blob1 != 'ping' GROUP BY kind, name ORDER BY n DESC LIMIT 20`),
    q(`SELECT blob3 AS outcome, ${N} FROM kairos_bot WHERE ${w} GROUP BY outcome ORDER BY n DESC`),
    q(`SELECT blob4 AS context, ${N} FROM kairos_bot WHERE ${w} AND blob1 IN ('command', 'menu', 'component') GROUP BY context ORDER BY n DESC`),
    q(`SELECT COUNT(DISTINCT blob5) AS servers FROM kairos_bot WHERE ${w} AND blob5 != ''`),
    q(`SELECT blob7 AS miss, ${N} FROM kairos_bot WHERE ${w} AND blob7 != '' GROUP BY miss ORDER BY n DESC LIMIT 15`),
    q(`SELECT quantileWeighted(0.5)(double1, _sample_interval) AS p50, quantileWeighted(0.95)(double1, _sample_interval) AS p95 FROM kairos_bot WHERE ${w} AND blob1 IN ('command', 'menu', 'component')`),
    discordInstalls(s),
    q(`SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, ${N} FROM kairos_query WHERE ${w} GROUP BY day ORDER BY day`),
    q(`SELECT blob1 AS route, ${N} FROM kairos_query WHERE ${w} GROUP BY route ORDER BY n DESC`),
    q(`SELECT blob2 AS source, ${N} FROM kairos_query WHERE ${w} GROUP BY source ORDER BY n DESC`),
    q(`SELECT blob3 AS agent, ${N} FROM kairos_query WHERE ${w} GROUP BY agent ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob4 AS country, ${N} FROM kairos_query WHERE ${w} AND blob4 != '' GROUP BY country ORDER BY n DESC LIMIT 10`),
    q(`SELECT double1 AS status, ${N} FROM kairos_query WHERE ${w} GROUP BY status ORDER BY n DESC`),
    q(`SELECT blob5 AS keys, ${N} FROM kairos_query WHERE ${w} AND blob5 != '' GROUP BY keys ORDER BY n DESC LIMIT 15`),
    q(`SELECT ${N} FROM kairos_query WHERE ${w} AND blob1 = '/cards' AND double3 = 0`),
    q(`SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, ${N} FROM kairos_site WHERE ${w} GROUP BY day ORDER BY day`),
    q(`SELECT blob1 AS host, ${N} FROM kairos_site WHERE ${w} GROUP BY host ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob2 AS page, blob1 AS host, ${N} FROM kairos_site WHERE ${w} GROUP BY page, host ORDER BY n DESC LIMIT 15`),
    q(`SELECT blob3 AS track, ${N} FROM kairos_site WHERE ${w} AND blob3 != '' GROUP BY track ORDER BY n DESC`),
    zoneHosts(s, days, [hosts.site, hosts.api, hosts.query, hosts.bot]),
    zonePaths(s, days, hosts.api),
  ]);
  return {
    days,
    bot: { daily: botDaily, commands: botCommands, outcomes: botOutcomes, contexts: botContexts, servers: botServers, misses: botMisses, latency: botLatency, installs },
    query: { daily: qDaily, routes: qRoutes, sources: qSources, agents: qAgents, countries: qCountries, statuses: qStatuses, keys: qKeys, empty: qEmpty },
    site: { daily: sDaily, hosts: sHosts, pages: sPages, tracks: sTracks },
    zone: { hosts: zHosts, paths: zPaths },
  };
}

/** Discord's approximate counts of the servers and the accounts the
 * app is installed in. */
export async function discordInstalls(s: Sources): Promise<Result<{ servers: number; users: number }>> {
  if (!s.botToken) return { ok: false, error: "DISCORD_BOT_TOKEN is not set." };
  try {
    const res = await s.fetchImpl("https://discord.com/api/v10/applications/@me", { headers: { authorization: `Bot ${s.botToken}`, "user-agent": "kairos-stats (+https://kairosarchive.net)" } });
    if (!res.ok) return { ok: false, error: `Discord: HTTP ${res.status}` };
    const app = (await res.json()) as { approximate_guild_count?: number; approximate_user_install_count?: number };
    return { ok: true, value: { servers: app.approximate_guild_count ?? 0, users: app.approximate_user_install_count ?? 0 } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function graphql(s: Sources, query: string, variables: Record<string, unknown>): Promise<Result<unknown>> {
  if (!s.zone) return { ok: false, error: "CF_ZONE_ID is not set." };
  try {
    const res = await s.fetchImpl(`${CF}/graphql`, { method: "POST", headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables: { zone: s.zone, ...variables } }) });
    const body = (await res.json()) as { data?: { viewer?: { zones?: { groups?: unknown }[] } }; errors?: { message: string }[] };
    if (body.errors?.length) return { ok: false, error: body.errors.map((e) => e.message).join("; ").slice(0, 300) };
    return { ok: true, value: body.data?.viewer?.zones?.[0]?.groups ?? [] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function since(days: number): { since: string; until: string } {
  const until = new Date();
  const from = new Date(until.getTime() - days * 86400 * 1000);
  return { since: from.toISOString(), until: until.toISOString() };
}

/** Requests, cache hits and bytes per hostname, from the zone's sampled
 * request analytics. */
export async function zoneHosts(s: Sources, days: number, hosts: string[]): Promise<Result<Row[]>> {
  const r = await graphql(s, `query($zone: String!, $since: Time!, $until: Time!, $hosts: [String!]) {
    viewer { zones(filter: { zoneTag: $zone }) {
      groups: httpRequestsAdaptiveGroups(limit: 200, filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost_in: $hosts }) {
        count sum { edgeResponseBytes } dimensions { clientRequestHTTPHost cacheStatus } } } } }`, { ...since(days), hosts });
  if (!r.ok) return r;
  const groups = r.value as { count: number; sum: { edgeResponseBytes: number }; dimensions: { clientRequestHTTPHost: string; cacheStatus: string } }[];
  const byHost = new Map<string, Row>();
  for (const g of groups) {
    const host = g.dimensions.clientRequestHTTPHost;
    const row = byHost.get(host) ?? { host, requests: 0, hits: 0, bytes: 0 };
    row.requests = (row.requests as number) + g.count;
    row.bytes = (row.bytes as number) + g.sum.edgeResponseBytes;
    if (g.dimensions.cacheStatus === "hit") row.hits = (row.hits as number) + g.count;
    byHost.set(host, row);
  }
  return { ok: true, value: [...byHost.values()].sort((a, b) => (b.requests as number) - (a.requests as number)) };
}

/** The most requested paths on the API host. */
export async function zonePaths(s: Sources, days: number, host: string): Promise<Result<Row[]>> {
  const r = await graphql(s, `query($zone: String!, $since: Time!, $until: Time!, $host: String!) {
    viewer { zones(filter: { zoneTag: $zone }) {
      groups: httpRequestsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host }) {
        count dimensions { clientRequestPath } } } } }`, { ...since(days), host });
  if (!r.ok) return r;
  const groups = r.value as { count: number; dimensions: { clientRequestPath: string } }[];
  return { ok: true, value: groups.map((g) => ({ path: g.dimensions.clientRequestPath, requests: g.count })) };
}
