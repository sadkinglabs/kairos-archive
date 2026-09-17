/** The third view of an errata card: not per printing, not per date, but
 * per face. Which physical cards carry each recorded set of values? The
 * rule is the one the printing entries already use, pivoted: a printing
 * carries the face in force on its release date. A face nobody has
 * printed yet says so, which is the sentence a player at a table needs
 * once a card has been changed after printing. Pure, so it is tested. */
import { changedFields, rowInForce, type Face, type HistoryRow, type RegistryPrinting } from "./registry";

export interface FaceGroup {
  row: HistoryRow;
  /** Fields that differ from the face before this one; empty for the first. */
  changed: string[];
  /** Printings carrying this face, by release date then id. */
  printings: RegistryPrinting[];
}

export interface FacePrintings {
  /** Every recorded face in time order, each with its printings. */
  faces: FaceGroup[];
  /** Printings that show no face at all (a textless promo). */
  textless: RegistryPrinting[];
  /** Printings with no release date, which cannot be placed. */
  undated: RegistryPrinting[];
}

export function facePrintings(history: HistoryRow[], printings: RegistryPrinting[]): FacePrintings {
  const rows = [...history].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const faces: FaceGroup[] = rows.map((row, i) => ({
    row,
    changed: i === 0 ? [] : [...changedFields(rows[i - 1]!, row), ...(changedFields(rows[i - 1]!.back, row.back).length ? ["back"] : [])],
    printings: [],
  }));
  const textless: RegistryPrinting[] = [];
  const undated: RegistryPrinting[] = [];
  const ordered = [...printings].sort((a, b) => (a.released_at ?? "").localeCompare(b.released_at ?? "") || a.printing_id.localeCompare(b.printing_id));
  for (const p of ordered) {
    if (p.printed_as_current === null && p.released_at !== null) { textless.push(p); continue; }
    if (p.released_at === null) { undated.push(p); continue; }
    const row = rowInForce(rows, p.released_at);
    const group = faces.find((g) => g.row === row);
    if (group) group.printings.push(p);
    else undated.push(p);
  }
  return { faces, textless, undated };
}

/** Printings grouped by set, in the order they first appear. */
export function bySet(printings: RegistryPrinting[]): [string, RegistryPrinting[]][] {
  const groups = new Map<string, RegistryPrinting[]>();
  for (const p of printings) groups.set(p.set_name, [...(groups.get(p.set_name) ?? []), p]);
  return [...groups.entries()];
}

const LABELS: Partial<Record<keyof Face | "back", string>> = {
  rules_text: "rules text", thr_air: "air threshold", thr_earth: "earth threshold", thr_fire: "fire threshold", thr_water: "water threshold", back: "back face",
};

/** "rules text", "attack", "back face": a field name as words. */
export function fieldLabel(field: string): string {
  return LABELS[field as keyof typeof LABELS] ?? field.replaceAll("_", " ");
}

/** "rules text and attack", "cost, attack and defense". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
