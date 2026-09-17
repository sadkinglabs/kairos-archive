/** The site's click beacon: {h: host the link goes to, p: page it was
 * on, t: the link's label}. Only from the site's origin, only a small
 * body, nothing about who clicked; the country Cloudflare saw is kept. */

/** The order of the blobs in a data point, for the reader's SQL. */
export const BLOBS = ["host", "page", "track", "country"] as const;
const MAX_BODY = 512;

export async function record(request: Request, stats: AnalyticsEngineDataset | undefined, site: string, cors: Record<string, string>): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  if (origin !== site) return new Response("origin not allowed\n", { status: 403, headers: cors });
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response("too long\n", { status: 413, headers: cors });
  let body: { h?: unknown; p?: unknown; t?: unknown };
  try { body = JSON.parse(text) as typeof body; } catch { return new Response("bad json\n", { status: 400, headers: cors }); }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const host = str(body.h, 80);
  const page = str(body.p, 120);
  if (!host || !page.startsWith("/")) return new Response("bad event\n", { status: 400, headers: cors });
  const country = ((request as { cf?: { country?: string } }).cf?.country ?? "").slice(0, 2);
  const event = { host, page, track: str(body.t, 40), country };
  try { stats?.writeDataPoint({ indexes: [host], blobs: BLOBS.map((k) => event[k]) }); } catch (err) { console.error("stats", err); }
  return new Response(null, { status: 204, headers: cors });
}
