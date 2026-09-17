import type { APIRoute } from "astro";
import { loadRegistry, toSearchData } from "../../../data/registry";

/** The query API's printing list, loaded by the Worker only for a query
 * that reads printings (a set, finish, product, artist or date term, a
 * printing flag, or unique:prints / unique:art). */
export const GET: APIRoute = async () => {
  const { registry, source } = await loadRegistry();
  const body = { tag: source.tag, printings: toSearchData(registry).printings };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
