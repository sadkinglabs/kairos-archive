/** One way to match text, for every free-text key and every surface.
 *
 * `r:drag` asks whether the text contains those characters anywhere, so
 * it finds "Dragon". `r==drag` asks for the complete word, so it finds
 * "drag" and not "Dragon". A quoted value works the same way with the
 * whole phrase: `r=="draw a spell"` needs those three words together,
 * with a boundary at each end.
 *
 * A boundary is any position where the neighbouring character is not a
 * letter or a number, in Unicode's sense rather than JavaScript's `\b`,
 * which counts only ASCII and would part company with the text the
 * moment a card is named Ârd. Punctuation and spaces therefore divide
 * words, so "step," holds the word step and "force-move" holds both
 * force and move.
 *
 * The needle is never compiled into a regular expression: it is scanned
 * for literally, so a query full of metacharacters searches for those
 * characters and cannot become a pattern of its own. */

/** Letters and numbers are what a word is made of; everything else is a
 * boundary. */
const WORD = /[\p{L}\p{N}]/u;

/** Runs of whitespace count as one space on both sides, so a phrase
 * still matches across the line break a rules box prints it with. */
export const collapse = (s: string): string => s.replace(/\s+/gu, " ");

/** Case-insensitive, and empty where a field is absent. */
export const fold = (s: string | null | undefined): string => (s ?? "").toLowerCase();

/** The whole character before or after an offset, surrogate pair and
 * all, so an emoji or an astral letter is not read as half of itself. */
function charBefore(s: string, i: number): string {
  if (i <= 0) return "";
  const code = s.charCodeAt(i - 1);
  if (code >= 0xdc00 && code <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s[i - 1]!;
}
function charAfter(s: string, i: number): string {
  if (i >= s.length) return "";
  const cp = s.codePointAt(i);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

const isWord = (c: string): boolean => c !== "" && WORD.test(c);

/** Where `needle` sits inside `haystack`, as [start, end) offsets into
 * the collapsed, folded haystack. With `whole`, only the occurrences
 * that stand as complete words count.
 *
 * A boundary is required only at an end where the needle's own edge is
 * a letter or number: searching for "+1" should not demand that the
 * text has no digit before the plus. */
export function findRanges(haystack: string, needle: string, whole: boolean): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (needle === "" || haystack === "") return out;
  const needsStart = whole && isWord(charAfter(needle, 0));
  const needsEnd = whole && isWord(charBefore(needle, needle.length));
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return out;
    const end = at + needle.length;
    const openOk = !needsStart || !isWord(charBefore(haystack, at));
    const closeOk = !needsEnd || !isWord(charAfter(haystack, end));
    if (openOk && closeOk) {
      out.push({ start: at, end });
      from = end;                // Matches never overlap.
    } else {
      from = at + 1;             // Keep looking past a match inside a word.
    }
  }
}

/** Whether a field holds the value: anywhere in it, or as a complete
 * word or phrase when `whole`. The one function every text key, every
 * surface and the result highlighting all go through. */
export function textMatches(field: string | null | undefined, value: string, whole: boolean): boolean {
  const haystack = collapse(fold(field));
  const needle = collapse(fold(value)).trim();
  if (needle === "") return false;
  if (!whole) return haystack.includes(needle);
  return findRanges(haystack, needle, true).length > 0;
}
