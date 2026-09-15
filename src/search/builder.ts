/** Turning form choices into query text.
 *
 * The advanced-search page never filters anything itself: it writes a
 * query, which the same parser and evaluator then run. Keeping that
 * translation here means it can be tested - and every test asserts the
 * result parses without errors, so the form cannot produce a query the
 * language does not accept. */

export type ElementMode = "+" | "," | "=";

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

/** Ticked elements as one term: + needs every one of them, , any one of
 * them, = exactly that set and nothing else. */
export function elementTerm(picked: string[], mode: ElementMode): string {
  const values = picked.map((p) => p.trim()).filter(Boolean);
  if (values.length === 0) return "";
  if (mode === "=") return `e=${values.join("+")}`;
  if (values.length === 1) return `e:${values[0]}`;
  return `e:${values.join(mode)}`;
}

export function buildQuery(base: string, terms: string[]): string {
  return [base.trim(), ...terms].filter(Boolean).join(" ");
}
