import { directLookup, parse, tokenize } from "./query";
import type { Unit } from "./keys";

export const resultNoun = (unit: Unit): string =>
  unit === "prints" ? "printing" : unit === "art" ? "artwork" : "card";

export function browserHeading(query: string): string {
  const q = query.trim();
  if (!q) return "Search";
  const parsed = parse(q);
  return parsed.ast || parsed.errors.length ? `Search: ${q}`
    : parsed.options.unique === "art" ? "All artwork" : `All ${resultNoun(parsed.options.unique)}s`;
}

/** New text replaces the filter expression, while explicit options in it
 * override the previous browse settings. Read keys through the tokenizer
 * so words such as sort:date inside a quoted rules phrase are left alone. */
export function refineQuery(typed: string, previous: string): string {
  const q = typed.trim();
  if (directLookup(q)) return q;
  const explicit = new Set(tokenize(q).tokens.map(token => token.key));
  const options = parse(previous).options;
  const inherited = (["unique", "sort", "order"] as const)
    .filter(key => !explicit.has(key) && options[key] !== null)
    .map(key => `${key}:${options[key]}`);
  return [q, ...inherited].filter(Boolean).join(" ");
}

export function refinementUrl(path: string, search: string, typed: string, defaultQuery = ""): string {
  const params = new URLSearchParams(search);
  params.set("q", refineQuery(typed, params.get("q")?.trim() || defaultQuery));
  params.delete("page");
  return `${path}?${params.toString()}`;
}

export function resultHref(card: { codex_id: string; name: string }, printingId: string | null, unit: Unit): string {
  if (printingId && unit !== "cards") return `/printings/${printingId}`;
  const slug = card.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
  return `/cards/${card.codex_id}/${slug}`;
}
