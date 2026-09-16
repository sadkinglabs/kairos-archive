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

/** The browser's copy of the slug rule. It cannot import the one in
 * src/data/registry.ts, which pulls node:fs and node:crypto in with it, so
 * a test holds the two to the same answer instead. */
export const slugify = (name: string): string =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";

export function resultHref(card: { codex_id: string; name: string }, printingId: string | null, unit: Unit): string {
  if (printingId && unit !== "cards") return `/printings/${printingId}`;
  return `/cards/${card.codex_id}/${slugify(card.name)}`;
}

/** How results are laid out. Presentation, not a question about cards, so
 * it lives in its own URL parameter rather than in q: a future API answers
 * the same q and has no view. Images is the default and is never written. */
export const VIEWS = ["images", "text", "full"] as const;
export type View = (typeof VIEWS)[number];

export function viewFrom(search: string): View {
  const v = new URLSearchParams(search).get("view");
  return (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "images";
}

/** The same query and page in another view. */
export function viewUrl(path: string, search: string, view: View): string {
  const params = new URLSearchParams(search);
  if (view === "images") params.delete("view"); else params.set("view", view);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
