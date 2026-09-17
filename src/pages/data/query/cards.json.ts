import type { APIRoute } from "astro";
import { loadRegistry, toSearchData } from "../../../data/registry";

/** The query API's card list: the same compact records the site's search
 * page evaluates, on their own so a query that never reads a printing
 * costs the Worker one parse of the smaller half. Tagged with the release
 * it came from, so an answer can say so. */
export const GET: APIRoute = async () => {
  const { registry, source } = await loadRegistry();
  const body = { tag: source.tag, cards: toSearchData(registry).cards };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
