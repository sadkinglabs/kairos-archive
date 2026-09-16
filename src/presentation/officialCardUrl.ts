/** Links out to the publisher's own record for a card or a printing.
 *
 * Kept out of src/data/registry.ts on purpose, even though the Kairos path
 * helpers live there: this is the publisher's normalisation of their names,
 * not ours, and the two must never be tidied into one function. Changing
 * this file must never change a kairosarchive.net URL.
 *
 * Their route is /cards/{stem}, and we hold the stem already: a printing's
 * official slug is {set}-{name}-{product}-{finish}, and segment 1 is the
 * publisher's own spelling of the name. Reading it beats deriving it,
 * because their rule has to be guessed at - apostrophes are dropped rather
 * than replaced (mariners_curse), diacritics folded (alvalinne_dryads),
 * hyphens turned into underscores (wills_o_the_wisp) - and a guess that is
 * right for all 1,100 cards today is still a guess about the next one.
 *
 * Slugs are mutable and have changed for whole sets before. These are
 * links, correct as of the release the site was built from, never keys. */

export const OFFICIAL_BASE = "https://sorcerytcg.com";

/** The publisher's spelling of the card name, out of one of their slugs. */
export function officialStem(slug: string): string | null {
  return slug.split("-")[1] || null;
}

/** The card's page, from every slug the card has been printed under.
 *
 * Two cards - Foot Soldier and Frog - are one card here and several records
 * upstream, one per art variant: foot_soldier, foot_soldier_english,
 * foot_soldier_saracen. A card page should open the card, not one of its
 * variants, and a variant stem is the base plus a suffix, so the shortest
 * stem is the card. (Ties broken alphabetically so a build is repeatable.) */
export function officialCardUrl(slugs: readonly string[]): string | null {
  const stems = slugs.map(officialStem).filter((s): s is string => s !== null);
  if (stems.length === 0) return null;
  const base = stems.reduce((a, b) => (b.length < a.length || (b.length === a.length && b < a) ? b : a));
  return `${OFFICIAL_BASE}/cards/${base}`;
}

/** One printing's own record, which for those two cards is a different page
 * from the card's - the Saracen Foot Soldier is foot_soldier_saracen. */
export function officialPrintingUrl(printing: { slug: string } | null | undefined): string | null {
  const stem = printing ? officialStem(printing.slug) : null;
  return stem ? `${OFFICIAL_BASE}/cards/${stem}` : null;
}

/** The publisher's normalisation of a card name, derived rather than read.
 *
 * Not used to build links - it exists to be checked against the stems above
 * at build time, so that a release where the two disagree fails the build
 * instead of shipping a page of 404s. Lowercase, strip diacritics, drop
 * apostrophes, everything else to underscores. */
export function officialSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
