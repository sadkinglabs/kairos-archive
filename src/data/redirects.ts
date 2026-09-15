/** _redirects lines for the static build: one per card's old bare-id
 * link, plus one per closed old name so a renamed card's previous slug
 * still resolves. Pure and narrowly typed (just the shape it needs, not
 * the full Registry) so it's easy to unit-test against a tiny fixture
 * instead of a real registry export — see redirects.test.ts. */

import { cardPath, slugify } from "./registry";

export interface RedirectRegistry {
  cards: { codex_id: string; name: string }[];
  name_history: { name: string; codex_id: string; valid_from: string; valid_to: string | null }[];
}

export function redirectLines(registry: RedirectRegistry): string[] {
  const cardById = new Map(registry.cards.map((c) => [c.codex_id, c]));
  const lines: string[] = [];

  // Bare /cards/{id} (the old permanent link, before pages had slugs)
  // always resolves to the card's current canonical path.
  for (const card of registry.cards) lines.push(`/cards/${card.codex_id} ${cardPath(card)} 302`);

  // A closed name_history row is a name the card no longer has. If its
  // slug differs from the current one, a link to the old
  // /cards/{id}/{old-slug} page would otherwise 404 after the rename.
  for (const row of registry.name_history) {
    if (!row.valid_to) continue; // still the current name, nothing to redirect from
    const card = cardById.get(row.codex_id);
    if (!card) continue;
    const oldSlug = slugify(row.name);
    if (oldSlug === slugify(card.name)) continue; // renamed, but the slug didn't change
    lines.push(`/cards/${row.codex_id}/${oldSlug} ${cardPath(card)} 302`);
  }

  // A card can have more than one closed row that slugifies to the same
  // old value (e.g. punctuation-only edits); keep the file free of dupes.
  return [...new Set(lines)];
}
