/** Two jobs on one hostname. POST /event takes the site's beacon (an
 * outbound click or a search) and writes it to Analytics Engine; it accepts only the site's
 * origin and a tiny body, and answers 204. GET / is the owner's
 * dashboard: the Cloudflare Access token is verified, the sources are
 * read, the page is rendered. GET /health answers for the deploy check. */
import { verifyAccess, type Fetch } from "./access";
import { render } from "./page";
import { gather } from "./sources";
import { record } from "./event";

export interface Env {
  SITE_BASE_URL?: string; API_HOST?: string; QUERY_HOST?: string; BOT_HOST?: string; SITE_HOST?: string; STATS_HOST?: string;
  CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_ZONE_ID?: string;
  ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string;
  DISCORD_BOT_TOKEN?: string;
  STATS?: AnalyticsEngineDataset;
}

export const DEFAULT_SITE = "https://kairosarchive.net";

export interface Deps { fetchImpl?: Fetch; now?: () => number }

export async function handle(request: Request, env: Env, deps: Deps = {}, ctx?: ExecutionContext): Promise<Response> {
  const fetchImpl: Fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const site = env.SITE_BASE_URL ?? DEFAULT_SITE;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const cors = { "access-control-allow-origin": site, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };

  if (path === "/event") {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-max-age": "86400" } });
    if (request.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });
    return record(request, env.STATS, site, cors);
  }
  if (path === "/health") return new Response("ok\n", { headers: { "content-type": "text/plain" } });
  if (path !== "/") return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405 });

  const verdict = await verifyAccess(request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, fetchImpl, deps.now?.());
  if (!verdict.ok) return new Response(`Forbidden. ${verdict.reason}\n`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return new Response("The dashboard is not configured: CF_API_TOKEN and CF_ACCOUNT_ID are needed.\n", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });

  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "7") || 7));
  const report = await gather(
    { fetchImpl, token: env.CF_API_TOKEN, account: env.CF_ACCOUNT_ID, zone: env.CF_ZONE_ID, botToken: env.DISCORD_BOT_TOKEN, apiBase: `https://${env.API_HOST ?? "api.kairosarchive.net"}` },
    days,
    { api: env.API_HOST ?? "api.kairosarchive.net", query: env.QUERY_HOST ?? "query.kairosarchive.net", bot: env.BOT_HOST ?? "bot.kairosarchive.net", site: env.SITE_HOST ?? "kairosarchive.net", stats: env.STATS_HOST ?? "stats.kairosarchive.net" },
  );
  void ctx;
  return new Response(render(report, verdict.email ?? "you"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
