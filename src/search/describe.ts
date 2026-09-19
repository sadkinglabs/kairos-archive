/** Saying in words what a picker was set to.
 *
 * The advanced form writes query text, which is exact but is still query
 * text; a folded group needs to report its filter in the language a
 * person would use. Same inputs as builder.ts, so the two can be read
 * side by side - and tested against each other. */

import { MULTI, NO_ELEMENT, type ElementMatch, type ListMode } from "./builder";

/** "Water", "Water and Fire", "Air, Earth and Water". */
function sentence(values: string[], join: "and" | "or"): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} ${join} ${values[values.length - 1]}`;
}

export function describeElements(picked: string[], match: ElementMatch): string {
  // No element is a value like the rest; only its wording differs. Multi is
  // not a value at all - it says how many, and narrows whatever follows.
  const multi = picked.some((p) => p.trim() === MULTI) ? "two or more elements" : "";
  const values = picked
    .filter((p) => p.trim() !== MULTI)
    .map((p) => (p.trim() === NO_ELEMENT ? "no element" : p.trim()))
    .filter(Boolean);
  const said = (): string => {
    if (values.length === 0) {
      return match === "mono" ? "one classification only (including no element)" : "";
    }
    switch (match) {
      case "all": return sentence(values, "and");
      case "any": return sentence(values, "or");
      case "only": return `only ${sentence(values, "and")}`;
      case "mono": return `one classification, ${sentence(values, "or")}`;
    }
  };
  return [multi, said()].filter(Boolean).join(", ");
}

export function describeList(picked: string[], mode: ListMode): string {
  const values = picked.map((p) => p.trim()).filter(Boolean);
  return sentence(values, mode === "," ? "or" : "and");
}

/** One control's contribution to a summary, as the page reads it off the
 * DOM: the value chosen, an option's own wording where there is one, the
 * word on the operator beside a number, and either a phrase to fill in
 * (data-say) or a label to put in front. */
export interface Choice {
  value: string;
  /** a select's selected option text, which is already written for a reader */
  optionText?: string;
  /** "at most", "over" - the operator select beside a number */
  operatorWord?: string;
  /** "mana cost", "released" */
  label?: string;
  /** a phrase with %s for the value: "named %s" */
  say?: string;
  /** the text field asked for whole words (=) rather than any run of
   * letters (:), which changes what the filter means and so has to be
   * said, not left to the query box. */
  wholeWords?: boolean;
}

export function describeChoice(choice: Choice): string {
  const value = choice.value.trim();
  if (value === "") return "";
  const text = choice.optionText ?? value;
  const said = (): string => {
    if (choice.operatorWord && choice.label) return `${choice.label} ${choice.operatorWord} ${text}`;
    if (choice.say) return choice.say.replace("%s", text);
    return choice.label ? `${choice.label} ${text}` : text;
  };
  return choice.wholeWords ? `${said()} (whole words)` : said();
}
