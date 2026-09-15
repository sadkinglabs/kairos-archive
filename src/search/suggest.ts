/** Name autocomplete, Scryfall style: given the card names known to the
 * site and a partial query, rank the best matches. Pure, no DOM — the
 * inline script in Base.astro is the only caller in the browser, and
 * this file is unit-tested on its own. */

export interface NameEntry {
  name: string;
  codex_id: string;
  path: string;
}

function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best matches for `query`, ordered: exact name match, then names
 * starting with the query, then names containing it at a word start,
 * then any other substring match. Ties keep the input order. Matching
 * is case- and diacritic-insensitive. An empty (or whitespace-only)
 * query returns no suggestions. */
export function suggest<T extends NameEntry>(names: readonly T[], query: string, limit = 8): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const wordStart = new RegExp(`\\b${escapeRegExp(q)}`);
  const ranked: { item: T; rank: number }[] = [];
  for (const item of names) {
    const n = fold(item.name);
    let rank: number;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (wordStart.test(n)) rank = 2;
    else if (n.includes(q)) rank = 3;
    else continue;
    ranked.push({ item, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, limit).map((r) => r.item);
}
