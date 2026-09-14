import { describe, expect, it } from "vitest";
import { changedFields, rowInForce } from "./registry";

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
