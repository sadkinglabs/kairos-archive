import type { APIRoute } from "astro";
import { cardPath, loadRegistry } from "../../data/registry";

/** A light payload for the header/home autocomplete: names only. The
 * full /data/search.json carries every filterable field and is too big
 * to fetch on first keystroke, so this endpoint emits just what the
 * suggestion box needs — a card's name, codex_id, canonical path and
 * type (shown as the suggestion's muted subtitle). */
export const GET: APIRoute = async () => {
  const { registry } = await loadRegistry();
  const names = registry.cards.map((c) => ({ name: c.name, codex_id: c.codex_id, path: cardPath(c), type: c.type }));
  return new Response(JSON.stringify(names), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
