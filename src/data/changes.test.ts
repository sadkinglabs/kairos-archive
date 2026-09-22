import { describe, expect, it } from "vitest";
import { isEmpty, summaryParts, type Changes } from "./changes";

const base: Changes = {
  from: "v3.3.0", to: "v3.3.1", schema_version: { from: 11, to: 11 },
  summary: { cards_added: 0, cards_changed: 1, cards_removed: 0, printings_added: 4, printings_changed: 0, printings_removed: 0, sets_added: 0, images_added: 0, images_replaced: 1, history_rows_added: 0, identifiers_removed: 0 },
  cards: { added: [], changed: [{ codex_id: "C000459", name: "Druid", fields: ["rules_text", "back"] }], removed: [] },
  printings: { added: [], changed: [], removed: [] }, sets: { added: [] }, images: { added: [], replaced: ["P000001"] }, history: { added: [] },
};

describe("summaryParts", () => {
  it("names the non-zero counts and always the identifier count", () => {
    expect(summaryParts(base)).toEqual(["1 card changed", "4 printings added", "1 image replaced", "0 identifiers removed"]);
  });
  it("reads an unchanged release as only the identifier line", () => {
    const none = { ...base, summary: Object.fromEntries(Object.keys(base.summary).map((k) => [k, 0])) as Changes["summary"] };
    expect(summaryParts(none)).toEqual(["0 identifiers removed"]);
    expect(isEmpty(none)).toBe(true);
    expect(isEmpty(base)).toBe(false);
  });
  it("names notes and records kept by hand (schema 12)", () => {
    const v340 = { ...base, from: "v3.3.3", to: "v3.4.0", summary: { ...base.summary, cards_changed: 0, printings_added: 0, images_replaced: 0,
      printings_changed: 1, notes_added: 1, notes_removed: 0, manual_added: 4, manual_confirmed: 0, manual_withdrawn: 0 } };
    expect(summaryParts(v340)).toEqual(["1 printing changed", "1 note added", "4 records added by hand", "0 identifiers removed"]);
    // A notes-only release is a release with changes, and says which.
    const notesOnly = { ...base, summary: { ...Object.fromEntries(Object.keys(base.summary).map((k) => [k, 0])) as Changes["summary"], notes_added: 1 } };
    expect(isEmpty(notesOnly)).toBe(false);
    expect(summaryParts(notesOnly)).toEqual(["1 note added", "0 identifiers removed"]);
  });
});
