/** A fetch that serves the site's two query payloads from the search
 * fixture, and remembers what was asked for. */
import { CARDS, PRINTINGS } from "../../src/search/fixture";
import type { Fetch } from "../src/data";

export const SITE = "https://site.test";
export const TAG = "v9.9.9";

export function fakeFetch(overrides: Record<string, unknown> = {}): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const path = url.replace(`${SITE}/`, "");
    const body = overrides[path] ?? route(path);
    if (body === undefined) return new Response("not found", { status: 404 });
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as Fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function route(path: string): unknown {
  if (path === "data/query/cards.json") return { tag: TAG, cards: CARDS };
  if (path === "data/query/printings.json") return { tag: TAG, printings: PRINTINGS };
  return undefined;
}
