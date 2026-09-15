/** GET /random - a real 302 to a random card, for clients that are not
 * browsers: curl, a Discord bot, a launcher action, a link in someone
 * else's page.
 *
 * This is the one piece of the site that is not static. functions/random.ts
 * exports this as a Cloudflare Pages Function, which claims the /random
 * route ahead of the built /random.html, so it answers first; on any
 * failure it calls next(), which serves that page instead and picks in the
 * browser as before. Nothing about the button path depends on this file
 * working.
 *
 * The card list is the site's own /data/names.json, read through the
 * ASSETS binding - the deployed static asset, not a public round trip -
 * and held in the isolate so repeat visits parse nothing. A release
 * deploys a new build, which retires these isolates, so the list cannot
 * go stale. */

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
  /** Hands the request on to static asset serving: the built /random.html. */
  next(): Promise<Response>;
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
  try {
    const paths = await cardPaths(context);
    return new Response(null, {
      status: 302,
      headers: {
        location: paths[Math.floor(Math.random() * paths.length)],
        // A cached redirect is the same card forever, which is the one
        // thing this endpoint must not be. Both the browser and the edge
        // are told, since Cloudflare will happily cache a 302.
        "cache-control": "no-store",
        "cdn-cache-control": "no-store",
      },
    });
  } catch {
    return context.next();
  }
}
