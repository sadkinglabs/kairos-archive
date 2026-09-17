/** Whether a printing has anything to compare: it was printed with an
 * earlier face, and that face (or the name at the time) differs from
 * the card now. Pure, shared by the card page's fold and the printing page. */
import { changedFields, rowInForce, type HistoryRow, type RegistryCard, type RegistryPrinting } from "./registry";

export interface NameRow { name: string; valid_from: string; valid_to: string | null }

export function hasAsPrinted(printing: Pick<RegistryPrinting, "printed_as_current" | "released_at">, card: Pick<RegistryCard, "name"> & Parameters<typeof changedFields>[1] & { back: HistoryRow["back"] }, history: HistoryRow[], names: NameRow[]): boolean {
  const row = printing.printed_as_current === false && printing.released_at ? rowInForce(history, printing.released_at) : null;
  if (!row) return false;
  const nameRow = printing.released_at ? rowInForce(names, printing.released_at) : null;
  return changedFields(row, card).length > 0 || changedFields(row.back, card.back).length > 0 || Boolean(nameRow && nameRow.name !== card.name);
}
