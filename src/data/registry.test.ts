import { describe, expect, it } from "vitest";
import { changedFields, historySource, rowInForce, showsCurrentValues } from "./registry";

describe("rowInForce", () => {
  const rows = [
    { valid_from: "2024-01-01", label: "first" },
    { valid_from: "2025-06-01", label: "second" },
    { valid_from: "2025-06-01", label: "second-again" }, // same day: last one in source order wins
  ];

  it("picks the row in force at a date within its range", () => {
    expect(rowInForce(rows, "2024-05-01")?.label).toBe("first");
    expect(rowInForce(rows, "2025-12-31")?.label).toBe("second-again");
  });
  it("gives the earliest row to a date before every row's valid_from — the first row stands for everything before", () => {
    expect(rowInForce(rows, "2000-01-01")?.label).toBe("first");
  });
  it("does not require rows to be pre-sorted", () => {
    expect(rowInForce([...rows].reverse(), "2024-05-01")?.label).toBe("first");
  });
  it("returns null for no rows", () => {
    expect(rowInForce([], "2024-01-01")).toBeNull();
  });
});

describe("changedFields", () => {
  const face = (over: Partial<{ rules_text: string; attack: number | null }> = {}) => ({
    type: "Minion", category: "Spell", rarity: "Ordinary", slot: "Ordinary", subtypes: [], elements: [], keywords: [],
    umbrellas: [], cost: 3, attack: 1, defense: 1, power: 1, life: null, thr_air: 0, thr_earth: 0, thr_fire: 0, thr_water: 0,
    rules_text: "text", ...over,
  });
  it("lists only fields that differ", () => {
    expect(changedFields(face(), face())).toEqual([]);
    expect(changedFields(face(), face({ rules_text: "new text", attack: 2 }))).toEqual(["attack", "rules_text"]);
  });
  it("treats one side null as a face-level change, both null as none", () => {
    expect(changedFields(null, face())).toEqual(["face"]);
    expect(changedFields(face(), null)).toEqual(["face"]);
    expect(changedFields(null, null)).toEqual([]);
  });
});

describe("historySource", () => {
  it("labels a face the registry observed in the API", () => {
    expect(historySource({ source: "api" })).toMatchObject({ fromCard: false, dated: "recorded on" });
  });
  it("treats a row without the field as observed, as older releases were", () => {
    expect(historySource({}).fromCard).toBe(false);
  });
  it("labels a face transcribed from the printed card", () => {
    expect(historySource({ source: "card" })).toMatchObject({ fromCard: true, label: "read from the printed card" });
  });
});

describe("showsCurrentValues", () => {
  it("says yes for a printing that shows the current face", () => {
    expect(showsCurrentValues({ printed_as_current: true, released_at: "2024-01-01" }).verdict).toBe("yes");
  });
  it("says no, and points at the history, for older printed values", () => {
    const v = showsCurrentValues({ printed_as_current: false, released_at: "2023-06-22" });
    expect(v.verdict).toBe("no");
    expect(v.long).toContain("older values");
  });
  it("distinguishes a printing with no card text from one with no release date", () => {
    expect(showsCurrentValues({ printed_as_current: null, released_at: "2025-03-01" })).toMatchObject({ verdict: "no-text" });
    expect(showsCurrentValues({ printed_as_current: null, released_at: null })).toMatchObject({ verdict: "undated" });
  });
});
