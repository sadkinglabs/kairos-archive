/** Turning form choices into query text.
 *
 * The advanced-search page never filters anything itself: it writes a
 * query, which the same parser and evaluator then run. Keeping that
 * translation here means it can be tested - and every test asserts the
 * result parses without errors, so the form cannot produce a query the
 * language does not accept. */

/** How several ticked values combine: + every one of them, , any one of
 * them, = exactly that set (elements only - it is the only key whose
 * values the evaluator can compare as a whole set). */
export type ListMode = "+" | "," | "=";

/** Quote only what the tokenizer would otherwise split on whitespace or
 * read as a value list, so a built query stays readable. */
export function quoteValue(value: string): string {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : JSON.stringify(value);
}

export interface Pick {
  key: string;
  /** default ":" */
  op?: string;
  value: string;
  negate?: boolean;
}

export function term(pick: Pick): string {
  const value = pick.value.trim();
  if (value === "") return "";
  return `${pick.negate ? "-" : ""}${pick.key}${pick.op ?? ":"}${quoteValue(value)}`;
}

/** A list value keeps its separators bare when every value is a plain
 * word, so e:Water+Fire reads as itself; anything else is quoted whole,
 * which the tokenizer then splits inside the quotes. */
function quoteList(joined: string): string {
  return /^[A-Za-z0-9._+,-]+$/.test(joined) ? joined : JSON.stringify(joined);
}

/** Ticked values as one term: sub:Beast+Spirit, k:Airborne,Lethal,
 * e=Water+Fire. One value needs no separator, so the mode falls away. */
export function listTerm(key: string, picked: string[], mode: ListMode): string {
  const values = picked.map((p) => p.trim()).filter(Boolean);
  if (values.length === 0) return "";
  return `${key}${mode === "=" ? "=" : ":"}${quoteList(values.join(mode === "=" ? "+" : mode))}`;
}

export function buildQuery(base: string, terms: string[]): string {
  return [base.trim(), ...terms].filter(Boolean).join(" ");
}
