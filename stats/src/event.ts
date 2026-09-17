/** The site's beacon. Two events, both only from the site's origin, a
 * small body, nothing about who sent it; the country Cloudflare saw is
 * kept. A click: {h: host the link goes to, p: page it was on, t: the
 * link's label}. A search: {k: "search", q: the query typed, n: how
 * many results it found (-1 when the query was rejected), p: page}. */

/** The order of the blobs in a data point, for the reader's SQL. Rows
 * written before searches existed have no kind and no q, and read as
 * clicks. */
export const BLOBS = ["host", "page", "track", "country", "kind", "q"] as const;
/** The order of the doubles: a search's result count. */
export const DOUBLES = ["n"] as const;
const MAX_BODY = 512;
export const MAX_QUERY = 200;

export async function record(request: Request, stats: AnalyticsEngineDataset | undefined, site: string, cors: Record<string, string>): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  if (origin !== site) return new Response("origin not allowed\n", { status: 403, headers: cors });
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response("too long\n", { status: 413, headers: cors });
  let body: { k?: unknown; h?: unknown; p?: unknown; t?: unknown; q?: unknown; n?: unknown };
  try { body = JSON.parse(text) as typeof body; } catch { return new Response("bad json\n", { status: 400, headers: cors }); }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const page = str(body.p, 120);
  const country = ((request as { cf?: { country?: string } }).cf?.country ?? "").slice(0, 2);
  let event: { host: string; page: string; track: string; country: string; kind: string; q: string; n: number };
  if (body.k === "search") {
    const q = str(body.q, MAX_QUERY).trim();
    const n = typeof body.n === "number" && Number.isInteger(body.n) && body.n >= -1 ? body.n : NaN;
    if (!q || !page.startsWith("/") || Number.isNaN(n)) return new Response("bad event\n", { status: 400, headers: cors });
    event = { host: "", page, track: "", country, kind: "search", q, n };
  } else {
    const host = str(body.h, 80);
    if (!host || !page.startsWith("/")) return new Response("bad event\n", { status: 400, headers: cors });
    event = { host, page, track: str(body.t, 40), country, kind: "click", q: "", n: 0 };
  }
  try { stats?.writeDataPoint({ indexes: [event.kind === "search" ? "search" : event.host], blobs: BLOBS.map((k) => event[k]), doubles: DOUBLES.map((k) => event[k]) }); } catch (err) { console.error("stats", err); }
  return new Response(null, { status: 204, headers: cors });
}
