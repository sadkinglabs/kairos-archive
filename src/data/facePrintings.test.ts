import { describe, expect, it } from "vitest";
import { bySet, facePrintings, fieldLabel, listWords } from "./facePrintings";
import type { HistoryRow, RegistryPrinting } from "./registry";

const face = (over: Partial<HistoryRow>): HistoryRow => ({
  codex_id: "C000002", valid_from: "2023-06-22", valid_to: null, source: "api", back: null,
  type: "Minion", category: "Spell", rarity: "Ordinary", slot: "Ordinary", subtypes: ["Beast"], elements: ["Air"], keywords: ["Airborne"], umbrellas: [],
  cost: 2, attack: 1, defense: 1, power: 1, life: null, thr_air: 1, thr_earth: 0, thr_fire: 0, thr_water: 0, rules_text: "Old.", ...over,
});
const printing = (id: string, set: string, released: string | null, current: boolean | null): RegistryPrinting => ({
  printing_id: id, codex_id: "C000002", card_name: "Blood Ravens", set_name: set, set_code: "001", released_at: released, product: "Booster", finish: "Standard",
  slug: id, back: null, image_hash: null, printed_as_current: current, retired_at: null, api_url: "", kairos_url: "", image_status: "missing",
  artist: null, artist_slug: null, flavour_text: null, typeline: null, image_urls: null,
} as unknown as RegistryPrinting);

const old = face({ valid_from: "2023-06-22", valid_to: "2026-09-15", source: "card" });
const current = face({ valid_from: "2026-09-15", rules_text: "New.", attack: 2 });

describe("facePrintings", () => {
  it("puts each printing under the face in force on its release date", () => {
    const out = facePrintings([current, old], [printing("P000009", "Beta", "2023-10-06", false), printing("P000007", "Alpha", "2023-06-22", false)]);
    expect(out.faces.map((g) => g.row.valid_from)).toEqual(["2023-06-22", "2026-09-15"]);
    expect(out.faces[0]!.printings.map((p) => p.printing_id)).toEqual(["P000007", "P000009"]);
    expect(out.faces[1]!.printings).toEqual([]);
    expect(out.faces[0]!.changed).toEqual([]);
    expect(out.faces[1]!.changed).toEqual(["attack", "rules_text"]);
  });
  it("places a reprint after the change under the current face", () => {
    const out = facePrintings([old, current], [printing("P000007", "Alpha", "2023-06-22", false), printing("P004000", "Revised", "2026-11-01", true)]);
    expect(out.faces[1]!.printings.map((p) => p.printing_id)).toEqual(["P004000"]);
  });
  it("sets aside textless and undated printings", () => {
    const out = facePrintings([old, current], [printing("P000100", "Promo", "2024-01-01", null), printing("P000101", "Promo", null, false)]);
    expect(out.textless.map((p) => p.printing_id)).toEqual(["P000100"]);
    expect(out.undated.map((p) => p.printing_id)).toEqual(["P000101"]);
    expect(out.faces.every((g) => g.printings.length === 0)).toBe(true);
  });
  it("names a back-face change as one word", () => {
    const withBack = face({ valid_from: "2026-09-15", back: face({}) });
    expect(facePrintings([old, withBack], []).faces[1]!.changed).toEqual(["back"]);
  });
});

describe("words", () => {
  it("groups printings by set in order of appearance", () => {
    const groups = bySet([printing("a", "Alpha", "1", false), printing("b", "Beta", "2", false), printing("c", "Alpha", "3", false)]);
    expect(groups.map(([set, ps]) => [set, ps.length])).toEqual([["Alpha", 2], ["Beta", 1]]);
  });
  it("reads field names as words and lists them", () => {
    expect(fieldLabel("rules_text")).toBe("rules text");
    expect(fieldLabel("thr_fire")).toBe("fire threshold");
    expect(fieldLabel("attack")).toBe("attack");
    expect(listWords(["rules text"])).toBe("rules text");
    expect(listWords(["cost", "attack", "defense"])).toBe("cost, attack and defense");
  });
});
