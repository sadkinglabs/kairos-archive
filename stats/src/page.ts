/** The dashboard as one HTML page: counters, tables and sparklines,
 * rendered from a Report. No script, no external asset, one request. */
import type { Report, Result, Row } from "./sources";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const num = (v: unknown) => (typeof v === "number" ? Math.round(v).toLocaleString("en-GB") : esc(v));

/** Total of the `n` column of a result. */
export function total(r: Result<Row[]>): number {
  return r.ok ? r.value.reduce((sum, row) => sum + (Number(row.n) || 0), 0) : 0;
}

/** A polyline over the daily counts, one point per day of the window,
 * zero for days with no row. */
export function sparkline(r: Result<Row[]>, days: number): string {
  if (!r.ok) return "";
  const byDay = new Map(r.value.map((row) => [String(row.day).slice(0, 10), Number(row.n) || 0]));
  const points: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    points.push(byDay.get(day) ?? 0);
  }
  const max = Math.max(1, ...points);
  const w = 240; const h = 40;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="daily counts"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${path}"/></svg>`;
}

function table(title: string, r: Result<Row[]>, columns: [string, string][]): string {
  if (!r.ok) return `<section><h3>${esc(title)}</h3><p class="err">${esc(r.error)}</p></section>`;
  if (!r.value.length) return `<section><h3>${esc(title)}</h3><p class="muted">Nothing yet.</p></section>`;
  const head = columns.map(([, label]) => `<th>${esc(label)}</th>`).join("");
  const rows = r.value.map((row) => `<tr>${columns.map(([key]) => `<td>${num(row[key])}</td>`).join("")}</tr>`).join("");
  return `<section><h3>${esc(title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function counter(label: string, value: string, note = ""): string {
  return `<div class="counter"><div class="value">${value}</div><div class="label">${esc(label)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}

export function render(report: Report, who: string): string {
  const d = report.days;
  const bot = report.bot; const q = report.query; const site = report.site;
  const botTotal = total(bot.daily); const qTotal = total(q.daily); const clicks = total(site.daily);
  const servers = bot.servers.ok ? Number(bot.servers.value[0]?.servers ?? 0) : 0;
  const installs = bot.installs.ok ? `${bot.installs.value.servers.toLocaleString("en-GB")} servers · ${bot.installs.value.users.toLocaleString("en-GB")} accounts` : bot.installs.error;
  const latency = bot.latency.ok && bot.latency.value[0] ? `p50 ${num(bot.latency.value[0].p50)} ms · p95 ${num(bot.latency.value[0].p95)} ms` : "";
  const empty = total(q.empty);
  const listTotal = q.routes.ok ? Number(q.routes.value.find((r) => r.route === "/cards")?.n ?? 0) : 0;
  const discordClicks = site.tracks.ok ? Number(site.tracks.value.find((r) => r.track === "discord-install")?.n ?? 0) : 0;
  const windows = [1, 7, 30, 90].map((n) => (n === d ? `<strong>${n}d</strong>` : `<a href="/?days=${n}">${n}d</a>`)).join(" · ");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kairos Archive · usage</title>
<style>
:root{--bg:#fff;--fg:#1c1b19;--muted:#6b6862;--line:#e4e1da;--accent:#8a5a2b}
@media(prefers-color-scheme:dark){:root{--bg:#161513;--fg:#ece8df;--muted:#9a958b;--line:#2c2a26;--accent:#d9a066}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:16px}
main{max-width:1100px;margin:0 auto}h1{font-size:1.4rem;margin:.2rem 0}h2{font-size:1.15rem;margin:2rem 0 .6rem;border-bottom:1px solid var(--line);padding-bottom:.3rem}h3{font-size:.95rem;margin:0 0 .4rem;color:var(--muted);font-weight:600}
.top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:baseline;color:var(--muted)}
.counters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.counter{border:1px solid var(--line);border-radius:8px;padding:12px}.value{font-size:1.6rem;font-weight:700}.label{color:var(--muted)}.note{font-size:.85rem;color:var(--muted);margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:top}td:last-child,th:last-child{text-align:right}th{color:var(--muted);font-weight:600}
.spark{color:var(--accent);display:block;margin:6px 0}.err{color:#c8412b;font-size:.9rem}.muted{color:var(--muted)}a{color:var(--accent)}
</style></head><body><main>
<div class="top"><h1>Kairos Archive · usage</h1><div>${windows} · ${esc(who)}</div></div>
<p class="muted">Counts from Analytics Engine are exact and weighted for sampling. Zone numbers are Cloudflare's sampled request analytics: trends, not audits. Window: last ${d} day${d === 1 ? "" : "s"}.</p>

<h2>Discord bot</h2>
<div class="counters">
${counter("interactions", num(botTotal), latency)}
${counter("distinct servers", num(servers), "keyed hash, not ids")}
${counter("installed in", esc(installs), "Discord's count, live")}
</div>
${sparkline(bot.daily, d)}
<div class="grid">
${table("By command", bot.commands, [["kind", "Kind"], ["name", "Name"], ["n", "Count"]])}
${table("How answers ended", bot.outcomes, [["outcome", "Outcome"], ["n", "Count"]])}
${table("Where from", bot.contexts, [["context", "Context"], ["n", "Count"]])}
${table("Names that missed", bot.misses, [["miss", "Typed"], ["n", "Count"]])}
</div>

<h2>Query API</h2>
<div class="counters">
${counter("requests", num(qTotal))}
${counter("searches with no match", num(empty), pct(empty, listTotal) + " of list queries")}
</div>
${sparkline(q.daily, d)}
<div class="grid">
${table("By route", q.routes, [["route", "Route"], ["n", "Count"]])}
${table("Public or bound", q.sources, [["source", "Source"], ["n", "Count"]])}
${table("Client software", q.agents, [["agent", "Agent"], ["n", "Count"]])}
${table("Countries", q.countries, [["country", "Country"], ["n", "Count"]])}
${table("Status", q.statuses, [["status", "Status"], ["n", "Count"]])}
${table("Keys used", q.keys, [["keys", "Keys"], ["n", "Count"]])}
</div>

<h2>Site</h2>
<div class="counters">
${counter("outbound clicks", num(clicks))}
${counter("Add to Discord clicks", num(discordClicks), "divide by /discord views in Web Analytics")}
</div>
${sparkline(site.daily, d)}
<div class="grid">
${table("Where clicks go", site.hosts, [["host", "Host"], ["n", "Count"]])}
${table("From which page", site.pages, [["page", "Page"], ["host", "To"], ["n", "Count"]])}
${table("Labelled links", site.tracks, [["track", "Label"], ["n", "Count"]])}
</div>
<p class="muted">Page views, visitors and referrers live in Cloudflare Web Analytics for the zone.</p>

<h2>Hosts (zone analytics, sampled)</h2>
<div class="grid">
${table("Requests by host", report.zone.hosts, [["host", "Host"], ["requests", "Requests"], ["hits", "Cache hits"], ["bytes", "Bytes"]])}
${table("Top paths on the API host", report.zone.paths, [["path", "Path"], ["requests", "Requests"]])}
</div>
</main></body></html>`;
}
