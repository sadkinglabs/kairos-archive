import type { APIRoute } from "astro";
import { loadRegistry, toSearchData } from "../../data/registry";

/** The search payload the results page evaluates in the browser: the
 * compact card and printing lists plus every slug ever issued, generated
 * from the same verified release as every page. */
export const GET: APIRoute = async () => {
  const { registry, source } = await loadRegistry();
  const data = toSearchData(registry);
  const body = {
    tag: source.tag,
    cards: data.cards,
    printings: data.printings,
    slug_history: registry.slug_history.map((r) => ({ slug: r.slug, printing_id: r.printing_id })),
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
