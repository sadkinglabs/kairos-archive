/** Site paths for records, pure and free of Node imports, so the browser
 * bundle and the query Worker can share them with the build. */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
}
export const cardPath = (card: { codex_id: string; name: string }) => `/cards/${card.codex_id}/${slugify(card.name)}`;
export const printingPath = (printing: { printing_id: string }) => `/printings/${printing.printing_id}`;
