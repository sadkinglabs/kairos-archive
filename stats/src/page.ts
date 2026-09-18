/** The dashboard as one HTML page: tiles, bar tables and sparklines,
 * rendered from a Report. No script, no external asset, one request.
 * Sections in the order they matter: the data and images served, what
 * people search for, the site, the bot. */
import type { Report, Result, Row } from "./sources";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fmt = (v: unknown) => (typeof v === "number" ? Math.round(v).toLocaleString("en-GB") : esc(v));

/** 1234567 → "1.2 MB". */
export function bytes(v: unknown): string {
  const n = typeof v === "number" ? v : 0;
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = n / 1024; let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x < 10 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
}

/** Total of the `n` column of a result. */
export function total(r: Result<Row[]>): number {
  return r.ok ? r.value.reduce((sum, row) => sum + (Number(row.n) || 0), 0) : 0;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}

/** A filled line over the daily counts, one point per day of the
 * window, zero for days with no row; the peak and the ends labelled. */
export function sparkline(r: Result<Row[]>, days: number, label = "per day"): string {
  if (!r.ok) return "";
  const byDay = new Map(r.value.map((row) => [String(row.day).slice(0, 10), Number(row.n) || 0]));
  const points: number[] = []; const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    dates.push(day); points.push(byDay.get(day) ?? 0);
  }
  const max = Math.max(1, ...points);
  const w = 600; const h = 64; const pad = 4;
  const step = points.length > 1 ? (w - 2 * pad) / (points.length - 1) : 0;
  const xy = points.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - 2 * pad)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${(pad + (points.length - 1) * step).toFixed(1)},${h - pad}`;
  const short = (d: string) => d.slice(5).replace("-", "/");
  return `<figure class="spark"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}, daily"><polygon class="area" points="${area}"/><polyline class="line" fill="none" points="${line}"/></svg><figcaption><span>${short(dates[0]!)}</span><span>peak ${fmt(max === 1 && !points.some((v) => v > 0) ? 0 : max)} ${esc(label)}</span><span>${short(dates.at(-1)!)}</span></figcaption></figure>`;
}

type Format = "n" | "bytes" | "text" | "q" | "status";
type Column = [key: string, label: string, format?: Format];

/** A table whose first numeric column is drawn as a bar against the
 * column's largest value. */
export function table(title: string, r: Result<Row[]>, columns: Column[], note?: string): string {
  const caption = note ? `<p class="note">${esc(note)}</p>` : "";
  if (!r.ok) return `<section class="tbl"><h3>${esc(title)}</h3><p class="err">${esc(r.error)}</p></section>`;
  if (!r.value.length) return `<section class="tbl"><h3>${esc(title)}</h3><p class="muted">Nothing yet.</p>${caption}</section>`;
  const barKey = columns.find(([, , f]) => (f ?? "n") === "n")?.[0];
  const max = barKey ? Math.max(1, ...r.value.map((row) => Number(row[barKey]) || 0)) : 1;
  const head = columns.map(([, label, f]) => `<th class="${f ?? "n"}">${esc(label)}</th>`).join("");
  const cell = (row: Row, [key, , f]: Column) => {
    const v = row[key];
    const format = f ?? "n";
    if (format === "bytes") return `<td class="n">${bytes(v)}</td>`;
    if (format === "text") return `<td class="text">${esc(v)}</td>`;
    if (format === "q") return `<td class="text"><code>${esc(v)}</code></td>`;
    if (format === "status") return `<td class="text"><span class="status s${String(v).charAt(0)}">${esc(v)}</span></td>`;
    if (key === barKey) return `<td class="n bar" style="--w:${Math.round(((Number(v) || 0) / max) * 100)}%">${fmt(v)}</td>`;
    return `<td class="n">${fmt(v)}</td>`;
  };
  const rows = r.value.map((row) => `<tr>${columns.map((c) => cell(row, c)).join("")}</tr>`).join("");
  return `<section class="tbl"><h3>${esc(title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>${caption}</section>`;
}

function tile(value: string, label: string, note = "", wide = false): string {
  return `<div class="tile${wide ? " wide" : ""}"><div class="value">${value}</div><div class="label">${esc(label)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function render(report: Report, who: string): string {
  const d = report.days;
  const api = report.api; const s = report.search; const site = report.site; const bot = report.bot;

  // Data and images.
  const external = api.totals.ok ? api.totals.value.find((r) => r.scope === "external") : undefined;
  const apiRequests = Number(external?.requests ?? 0);
  const downloads = Number(external?.downloads ?? 0);
  const images = Number(external?.images ?? 0);
  const cacheRequests = total(api.imageCache);
  const apiHits = api.imageCache.ok ? api.imageCache.value.filter((r) => r.status === "hit").reduce((n, r) => n + Number(r.n), 0) : 0;
  const coverage = api.covered && api.covered < api.asked ? `${days(api.covered)} covered; see coverage note` : `last ${days(d)}`;
  const zoneNote = api.hosts.ok ? api.hosts.note : undefined;

  // Search.
  const siteSearches = total(s.siteDaily);
  const siteEmpty = total(s.siteEmptyTotal);
  const siteRejected = total(s.siteRejected);
  const bare = (r: Result<Row[]>): Result<Row[]> => (r.ok ? { ...r, value: r.value.map((row) => ({ ...row, keys: row.keys || "(bare words only)" })) } : r);
  const apiLists = s.routes.ok ? Number(s.routes.value.find((r) => r.route === "/cards")?.n ?? 0) : 0;
  const apiEmpty = total(s.emptyTotal);

  // Site.
  const clicks = total(site.daily);
  const discordClicks = site.tracks.ok ? Number(site.tracks.value.find((r) => r.track === "discord-install")?.n ?? 0) : 0;

  // Bot.
  const interactions = total(bot.daily);
  const activeServers = bot.servers.ok ? Number(bot.servers.value[0]?.servers ?? 0) : 0;
  const timed = bot.latency.ok ? bot.latency.value[0] : undefined;
  const latency = typeof timed?.p50 === "number" ? `p50 ${fmt(timed.p50)} ms · p95 ${fmt(timed.p95)} ms` : "no timed answers yet";
  const guildRows: Result<Row[]> = bot.guilds.ok ? { ok: true, value: bot.guilds.value.map((g) => ({ name: g.name, n: g.members })) } : bot.guilds;
  const installed = bot.guilds.ok ? fmt(bot.guilds.value.length) : "–";
  const accounts = bot.installs.ok ? (bot.installs.value.users === null ? "not reported" : fmt(bot.installs.value.users)) : "–";
  const installNote = bot.installs.ok ? `Discord's live count for ${bot.installs.value.app}` : bot.installs.ok === false ? bot.installs.error : "";

  const windows = [1, 7, 30, 90].map((n) => (n === d ? `<strong>${n}d</strong>` : `<a href="/?days=${n}">${n}d</a>`)).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kairos Archive · usage</title>
<style>
:root{--bg:#f6f4ef;--fg:#24211e;--muted:#70685f;--line:#d9d3c9;--card:#fffdf9;--accent:#88481f;--badge:#eee7dc;--bar:#e9d9c6;--ok:#286139;--warn:#815512;--bad:#8b3430;--display:Georgia,'Times New Roman',serif;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#17161b;--fg:#eeeae2;--muted:#b2aaa0;--line:#363239;--card:#201e24;--accent:#e3a16c;--badge:#302b31;--bar:#3b2f26;--ok:#a6d7ae;--warn:#efc478;--bad:#f0bab1;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{max-width:1120px;margin:auto;padding:1.5rem 16px 4rem}
h1,h2{font-family:var(--display);font-weight:600;letter-spacing:-.02em;line-height:1.15}h1{font-size:2rem;margin:0}
h2{font-size:1.6rem;margin:0 0 .25rem}h3{font:600 .8rem/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 .5rem}
.top{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:baseline;justify-content:space-between;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.who{color:var(--muted);font-size:.9rem}.windows{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--card);vertical-align:middle;margin-right:.75rem}
.windows a,.windows strong{padding:.3rem .8rem;text-decoration:none;color:var(--fg);font-size:.9rem}.windows strong{background:var(--accent);color:#fff}
.lede{color:var(--muted);margin:.75rem 0 0;max-width:70ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:1rem 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.8rem .9rem;min-width:0}.tile.wide{grid-column:span 2}
.value{font:600 1.7rem/1.1 var(--display);letter-spacing:-.02em;overflow-wrap:anywhere}.label{color:var(--muted);margin-top:.15rem}.note{font-size:.82rem;color:var(--muted);margin:.3rem 0 0}
section.part{margin-top:2.5rem}.eyebrow{font:600 .72rem/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:.5rem}
.tbl{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.9rem 1rem;min-width:0;overflow:hidden}
table{border-collapse:collapse;width:100%;font-size:.92rem;table-layout:auto}th,td{padding:.3rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
th{color:var(--muted);font-weight:600;text-align:left;font-size:.8rem}th.n,td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.text{overflow-wrap:anywhere}td.bar{background:linear-gradient(90deg,var(--bar) var(--w),transparent var(--w));background-repeat:no-repeat;border-radius:3px}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--badge);padding:.05rem .3rem;border-radius:4px}
.status{font-variant-numeric:tabular-nums}.s2{color:var(--ok)}.s3{color:var(--warn)}.s4,.s5{color:var(--bad)}
.spark{margin:1rem 0 0}.spark svg{width:100%;height:64px;display:block}.spark .area{fill:var(--accent);opacity:.14}.spark .line{stroke:var(--accent);stroke-width:1.5;vector-effect:non-scaling-stroke}
.spark figcaption{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted)}
.err{color:var(--bad);font-size:.9rem;margin:0}.muted{color:var(--muted);margin:0}a{color:var(--accent)}
</style></head><body><main>
<div class="top"><h1>Kairos Archive · usage</h1><div class="who"><span class="windows">${windows}</span>${esc(who)}</div></div>
<p class="lede">Last ${days(d)}. Analytics Engine counts are weighted for sampling. API traffic is estimated by Cloudflare; separate queries may differ. These are request counts, not people or billable R2 operations.</p>

<div class="tiles">
${tile(api.totals.ok ? fmt(downloads) : "–", "whole-dataset downloads", coverage)}
${tile(api.totals.ok ? fmt(apiRequests) : "–", "external API requests", coverage)}
${tile(api.totals.ok ? fmt(images) : "–", "external image requests", coverage)}
${tile(fmt(siteSearches + apiLists), "searches", "site and query API")}
${tile(fmt(interactions), "bot interactions")}
${tile(fmt(clicks), "outbound clicks")}
</div>

<section class="part">
<div class="eyebrow">1 · api.kairosarchive.net</div>
<h2>Data and images</h2>
<p class="muted">External traffic excludes known build, release, audit and dashboard agents. It still includes crawlers and scanners; a browser label does not prove a human visitor. Internal traffic is counted separately below.</p>
${zoneNote ? `<p class="muted">${esc(zoneNote)}</p>` : ""}
<div class="tiles">
${tile(api.totals.ok ? fmt(downloads) : "–", "whole-dataset downloads", "external GET requests returning 200")}
${tile(api.imageCache.ok ? pct(apiHits, cacheRequests) : "–", "image GET cache hits", `${fmt(apiHits)} of ${fmt(cacheRequests)} external image GETs returning 200; HIT only`)}
${tile(api.totals.ok ? bytes(external?.bytes ?? 0) : "–", "external bytes served", "estimated edge response bytes")}
</div>
<div class="grid">
${table("Whole-dataset downloads", api.downloads, [["path", "File", "text"], ["status", "Status", "status"], ["agent", "Client", "text"], ["n", "Requests"]], "Top external GET groups only. 200 responses are counted in the independent download total; 304 is revalidation and 206 is a partial range. Completion by the client is not measured.")}
${table("Popular API paths by kind", api.kinds, [["kind", "Kind", "text"], ["n", "Requests"]], "Partial breakdown from up to 1,000 paths per query window. Never used for headline totals.")}
${table("Who fetches the data", api.agents, [["agent", "Client", "text"], ["n", "Requests"]])}
${table("Who fetches images", api.imageAgents, [["agent", "Client", "text"], ["n", "Requests"]], "Top external client groups, including GET and HEAD. User-Agent labels are self-reported.")}
${table("Requests by host · all traffic", api.hosts, [["host", "Host", "text"], ["n", "Requests"], ["hits", "Cache hits"], ["bytes", "Bytes", "bytes"]])}
${table("External and internal API traffic", api.totals, [["scope", "Traffic", "text"], ["requests", "Requests"], ["head", "HEAD"], ["bytes", "Bytes", "bytes"]], "Independent aggregates covering all matching paths. Internal requests remain part of total infrastructure load.")}
${table("External and internal downloads", api.totals, [["scope", "Traffic", "text"], ["images", "Image requests"], ["downloads", "Dataset GET 200s"]], "Image requests include all methods. Dataset counts exclude HEAD checks.")}
${table("Internal API clients", api.internal, [["agent", "Client", "text"], ["method", "Method", "text"], ["n", "Requests"]])}
${table("Image GET cache status", api.imageCache, [["status", "Cache status", "text"], ["n", "Requests"]], "External image GETs returning 200 only. A check may hit an existing cache; HEAD checks and errors are excluded.")}
${table("Countries", api.countries, [["country", "Country", "text"], ["n", "Requests"]])}
${table("Status", api.statuses, [["status", "Status", "status"], ["n", "Requests"]])}
${table("Top paths", api.paths, [["path", "Path", "text"], ["n", "Requests"]])}
</div>
</section>

<section class="part">
<div class="eyebrow">2 · how people look</div>
<h2>Search</h2>
<div class="tiles">
${tile(fmt(siteSearches), "searches on the site", `${fmt(siteEmpty)} found nothing (${pct(siteEmpty, siteSearches)})`)}
${tile(fmt(siteRejected), "queries the site rejected", `a syntax error, ${pct(siteRejected, siteSearches)} of searches`)}
${tile(fmt(apiLists), "query API list requests", `${fmt(apiEmpty)} found nothing (${pct(apiEmpty, apiLists)})`)}
</div>
${sparkline(s.siteDaily, d, "site searches")}
<div class="grid">
${table("How searches are asked, on the site", bare(s.siteKeys), [["keys", "Keys", "q"], ["n", "Searches"], ["results", "Avg results"]], "The keys a query used, never the words typed. Bare words match card names.")}
${table("How searches are asked, through the API", bare(s.keys), [["keys", "Keys", "q"], ["n", "Searches"], ["results", "Avg results"]])}
</div>
<h3 style="margin-top:1.25rem">Query API</h3>
${sparkline(s.apiDaily, d, "API requests")}
<div class="grid">
${table("By route", s.routes, [["route", "Route", "text"], ["n", "Requests"]])}
${table("Client software", s.agents, [["agent", "Client", "text"], ["n", "Requests"]])}
${table("Countries", s.countries, [["country", "Country", "text"], ["n", "Requests"]])}
${table("Status", s.statuses, [["status", "Status", "status"], ["n", "Requests"]])}
${table("Public or bound", s.sources, [["source", "Source", "text"], ["n", "Requests"]], "Bound requests come from the site's own functions over a service binding.")}
</div>
</section>

<section class="part">
<div class="eyebrow">3 · kairosarchive.net</div>
<h2>Site</h2>
<div class="tiles">
${tile(fmt(clicks), "outbound clicks")}
${tile(fmt(discordClicks), "Add to Discord clicks", "divide by /discord views in Web Analytics")}
</div>
${sparkline(site.daily, d, "clicks")}
<div class="grid">
${table("Where clicks go", site.hosts, [["host", "Host", "text"], ["n", "Clicks"]])}
${table("From which page", site.pages, [["page", "Page", "text"], ["host", "To", "text"], ["n", "Clicks"]])}
${table("Labelled links", site.tracks, [["track", "Label", "text"], ["n", "Clicks"]])}
</div>
<p class="muted">Page views, visitors and referrers live in Cloudflare Web Analytics for the zone.</p>
</section>

<section class="part">
<div class="eyebrow">4 · bot.kairosarchive.net</div>
<h2>Discord bot</h2>
<div class="tiles">
${tile(fmt(interactions), "interactions", latency)}
${tile(fmt(activeServers), "servers that used it", "keyed hash, not ids")}
${tile(installed, "servers it is installed in", bot.guilds.ok ? "servers with the bot user; Discord's list" : bot.guilds.error)}
${tile(accounts, "accounts it is installed on", installNote)}
</div>
${sparkline(bot.daily, d, "interactions")}
<div class="grid">
${table("Servers", guildRows, [["name", "Server", "text"], ["n", "Members"]], "Only installs with the bot scope put a bot user in a server; a commands-only install shows in the interactions, never here.")}
${table("By command", bot.commands, [["kind", "Kind", "text"], ["name", "Name", "text"], ["n", "Count"]])}
${table("How answers ended", bot.outcomes, [["outcome", "Outcome", "text"], ["n", "Count"]])}
${table("Where from", bot.contexts, [["context", "Context", "text"], ["n", "Count"]])}
${table("Names that missed", bot.misses, [["miss", "Typed", "q"], ["n", "Count"]])}
</div>
</section>
</main></body></html>`;
}
