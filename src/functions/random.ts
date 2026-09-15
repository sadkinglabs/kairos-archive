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
 * retires the isolates holding it, so it cannot go stale. */

interface NameEntry {
  path: string;
}

interface Env {
  /** Pages' static-asset binding. Declared optional because the fallback
   * below is what runs if a runtime ever does not provide it. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface Context {
  request: Request;
  env: Env;
}

let cached: Promise<string[]> | null = null;

function cardPaths(context: Context): Promise<string[]> {
  cached ??= (async () => {
    const request = new Request(new URL("/data/names.json", context.request.url), {
      headers: { accept: "application/json" },
    });
    const response = await (context.env.ASSETS?.fetch(request) ?? fetch(request));
    if (!response.ok) throw new Error(`names.json: HTTP ${response.status}`);
    const entries = (await response.json()) as NameEntry[];
    // Keeping only paths under /cards/ is what makes the Location header
    // provably a path on this site rather than somewhere else.
    const paths = entries.map((entry) => entry.path).filter((path) => path?.startsWith("/cards/"));
    if (paths.length === 0) throw new Error("names.json listed no card paths");
    return paths;
  })().catch((error: unknown) => {
    cached = null; // A failed load must not be the answer for this isolate's life.
    throw error;
  });
  return cached;
}

export async function onRequest(context: Context): Promise<Response> {
  let paths: string[];
  try {
    paths = await cardPaths(context);
  } catch (error) {
    // Reading our own deployed asset should not fail, so say so plainly
    // rather than redirecting somewhere that would look like a card.
    return new Response(`The card index could not be read: ${String(error)}\n`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "30" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: paths[Math.floor(Math.random() * paths.length)],
      // A cached redirect is the same card forever, which is the one thing
      // this endpoint must not be. Both the browser and the edge are told,
      // since Cloudflare will happily cache a 302.
      "cache-control": "no-store",
      "cdn-cache-control": "no-store",
      // Not a page, and never the same twice: nothing here to index.
      "x-robots-tag": "noindex",
    },
  });
}
