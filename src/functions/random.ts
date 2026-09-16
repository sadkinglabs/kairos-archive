/** GET /random - a 302 to a random card.
 *
 * Exported as a Cloudflare Pages Function by functions/random.ts, which is
 * the only part of this site that is not static. It is a Function and not
 * a page on purpose: a page would have to carry the card list as a
 * build-time constant, which grows with the catalogue and is stale the
 * moment a set is added. This reads the list at request time, so the
 * endpoint never needs touching again.
 *
 * The list is the site's own /data/names.json - the same index the search
 * box's autocomplete uses - read through the ASSETS binding, which serves
 * the deployed asset without leaving the edge. It is held in the isolate,
 * so repeat visits parse nothing; a release deploys a new build and
 * retires the isolates holding it, so it cannot go stale.
 *
 * Every invocation counts against the account's daily Function allowance,
 * which is the one finite thing on this site - so the handler does as
 * little as it can for anything that is not a real visitor: a method it
 * does not serve gets a 405 before any work, a hostname that is not the
 * site's gets a redirect to the one that is (where the edge rate rule
 * applies), and a failed index load is not retried for thirty seconds. */

interface NameEntry {
  path: string;
}

interface Env {
  /** Pages' static-asset binding. Required: without it the only way to
   * read the index is a public round trip, which is the wrong thing to do
   * quietly. If a runtime ever lacks it, say so and stop. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface Context {
  request: Request;
  env: Env;
}

/** The site. Anything else that reaches this Function is the project's
 * pages.dev hostname or a stranger, and is sent here - previews excepted,
 * because a preview is where a change to this file gets reviewed. */
export const CANONICAL_HOST = "kairosarchive.net";
const PREVIEW_HOST_SUFFIX = ".kairos-archive.pages.dev";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** After a failed index load, how long to answer 503 without trying again.
 * A persistent asset failure would otherwise be one ASSETS fetch per
 * request for as long as it lasted. */
export const FAILURE_HOLD_MS = 30_000;

let cached: Promise<string[]> | null = null;
let holdUntil = 0;

function servesHost(host: string): boolean {
  return host === CANONICAL_HOST || host.endsWith(PREVIEW_HOST_SUFFIX) || LOCAL_HOSTS.has(host);
}

function cardPaths(context: Context): Promise<string[]> {
  if (cached) return cached;
  if (Date.now() < holdUntil) return Promise.reject(new Error("index load is on hold after a failure"));
  cached = (async () => {
    const assets = context.env.ASSETS;
    if (!assets) throw new Error("no ASSETS binding: this must run as a Pages Function");
    const request = new Request(new URL("/data/names.json", context.request.url), {
      headers: { accept: "application/json" },
    });
    const response = await assets.fetch(request);
    if (!response.ok) throw new Error(`names.json: HTTP ${response.status}`);
    const entries = (await response.json()) as NameEntry[];
    // Keeping only paths under /cards/ is what makes the Location header
    // provably a path on this site rather than somewhere else.
    const paths = entries.map((entry) => entry.path).filter((path) => path?.startsWith("/cards/"));
    if (paths.length === 0) throw new Error("names.json listed no card paths");
    return paths;
  })().catch((error: unknown) => {
    cached = null;
    holdUntil = Date.now() + FAILURE_HOLD_MS;
    throw error;
  });
  return cached;
}

const NO_STORE = { "cache-control": "no-store", "cdn-cache-control": "no-store" } as const;

export async function onRequest(context: Context): Promise<Response> {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD", ...NO_STORE } });
  }
  const url = new URL(request.url);
  if (!servesHost(url.hostname)) {
    // Permanent, and cacheable by the client: this hostname will never be
    // the site. A loop that follows it arrives where the rate rule is; one
    // that does not gets nothing for its trouble.
    return new Response(null, {
      status: 301,
      headers: { location: `https://${CANONICAL_HOST}${url.pathname}`, "cache-control": "public, max-age=86400" },
    });
  }
  let paths: string[];
  try {
    paths = await cardPaths(context);
  } catch (error) {
    // Reading our own deployed asset should not fail. The detail goes to
    // the Function's log, where whoever fixes it will look; the visitor
    // gets a sentence and a reason to try again.
    console.error("[random]", error);
    return new Response("The random card index could not be read. Try again in a moment.\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "30", ...NO_STORE },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: paths[Math.floor(Math.random() * paths.length)],
      // A cached redirect is the same card forever, which is the one thing
      // this endpoint must not be. Both the browser and the edge are told,
      // since Cloudflare will happily cache a 302.
      ...NO_STORE,
      // Not a page, and never the same twice: nothing here to index.
      "x-robots-tag": "noindex",
    },
  });
}
