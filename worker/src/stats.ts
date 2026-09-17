/** One data point per request into Workers Analytics Engine, written
 * after the answer leaves (waitUntil). What it carries: the route; whether
 * the request came over the public hostname or a service binding (a
 * bound request carries no client address); the client's software as a
 * family ("firefox", "curl", "kairos-bot"), never the full User-Agent;
 * the country Cloudflare saw; the keys the query used ("e t is:errata")
 * and the query itself, clipped; the status, the time taken and, for a
 * list, how many cards matched. No address, no identifier. */

export interface QueryEvent {
  route: string; source: "public" | "binding"; agent: string; country: string; keys: string; q: string;
  status: number; ms: number; total: number;
}

/** The order of the blobs in a data point, for the reader's SQL. */
export const BLOBS = ["route", "source", "agent", "country", "keys", "q"] as const;
/** The query text is kept whole up to this many characters. */
export const MAX_QUERY = 200;
/** The order of the doubles. */
export const DOUBLES = ["status", "ms", "total"] as const;

const BROWSERS: [RegExp, string][] = [[/Edg\//, "edge"], [/OPR\//, "opera"], [/Firefox\//, "firefox"], [/Chrome\//, "chrome"], [/Safari\//, "safari"]];

/** "Mozilla/5.0 (…) Firefox/155.0" → "firefox"; "curl/8.6.0" → "curl";
 * "kairos-bot/0.1 (+https://…)" → "kairos-bot". Lower case, at most 32 characters. */
export function agentFamily(userAgent: string | null): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "";
  for (const [re, name] of BROWSERS) if (re.test(ua)) return name;
  return ua.split(/[/\s(]/)[0]!.toLowerCase().slice(0, 32);
}

/** The keys a query used, sorted and unique: "e t", "a unique:prints",
 * "is:errata sort:cost". Flag-like keys keep their value, since the value
 * is the whole point of the key; every other value is dropped. */
export function queryKeys(q: string): string {
  const keys = new Set<string>();
  for (const m of q.matchAll(/(?:^|[\s(])-?([a-z]+)(?:[:=]([a-z-]*)|[<>!])/gi)) {
    const key = m[1]!.toLowerCase();
    const value = (m[2] ?? "").toLowerCase();
    keys.add(["is", "has", "unique", "sort", "order"].includes(key) && value ? `${key}:${value}` : key);
  }
  return [...keys].sort().join(" ").slice(0, 200);
}

/** Build and write the point from the request and a clone of the answer.
 * Never throws. */
export async function record(stats: AnalyticsEngineDataset | undefined, request: Request, copy: Response, started: number): Promise<QueryEvent | null> {
  try {
    const url = new URL(request.url);
    const route = /^\/cards(\/(named|random|autocomplete|[CP]\d{6}))?$/i.test(url.pathname.replace(/\/+$/, "") || "/") ? url.pathname.replace(/\/[CP]\d{6}$/i, "/id") : "other";
    let total = -1;
    if (copy.headers.get("content-type")?.includes("json")) {
      const body = (await copy.json().catch(() => null)) as { object?: string; total?: number } | null;
      if (body?.object === "list" && typeof body.total === "number") total = body.total;
      else if (body?.object === "card") total = 1;
      else if (body?.object === "error" && copy.status === 404) total = 0;
    }
    const event: QueryEvent = {
      route,
      source: request.headers.get("cf-connecting-ip") ? "public" : "binding",
      agent: agentFamily(request.headers.get("user-agent")),
      country: ((request as { cf?: { country?: string } }).cf?.country ?? "").slice(0, 2),
      keys: queryKeys(url.searchParams.get("q") ?? ""),
      q: (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY),
      status: copy.status,
      ms: Math.max(0, Date.now() - started),
      total,
    };
    stats?.writeDataPoint({ indexes: [route], blobs: BLOBS.map((k) => event[k]), doubles: DOUBLES.map((k) => event[k]) });
    return event;
  } catch (err) {
    console.error("stats", err);
    return null;
  }
}
