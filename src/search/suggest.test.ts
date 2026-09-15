import { describe, expect, it } from "vitest";
import { suggest, type NameEntry } from "./suggest";

const item = (name: string, codex_id: string): NameEntry => ({ name, codex_id, path: `/cards/${codex_id}/x` });

const NAMES: NameEntry[] = [
  item("Polar Bears", "C000001"),
  item("Polarity Well", "C000002"),
  item("Apprentice Wizard", "C000003"),
  item("Frost Wizard", "C000004"),
  item("Bear Trap", "C000005"),
  item("Émigré Scholar", "C000006"),
];

describe("suggest", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(suggest(NAMES, "")).toEqual([]);
    expect(suggest(NAMES, "   ")).toEqual([]);
  });

  it("puts an exact name match first", () => {
    const names = [item("Bear", "C1"), item("Bear Trap", "C2"), item("Polar Bear", "C3")];
    expect(suggest(names, "bear").map((n) => n.name)).toEqual(["Bear", "Bear Trap", "Polar Bear"]);
  });

  it("ranks prefix matches before word-start and substring matches", () => {
    const names = [item("Wizardry", "C1"), item("Frost Wizard", "C2"), item("Apprentice Wizard", "C3")];
    // "wiz" is a prefix of Wizardry, a word-start match in the other two.
    expect(suggest(names, "wiz").map((n) => n.name)).toEqual(["Wizardry", "Frost Wizard", "Apprentice Wizard"]);
  });

  it("ranks a word-start match before a mid-word substring match", () => {
    const names = [item("Unwizardly Scheme", "C1"), item("Frost Wizard", "C2")];
    // "wiz" only starts a word in "Frost Wizard"; in the other it's mid-word.
    expect(suggest(names, "wiz").map((n) => n.name)).toEqual(["Frost Wizard", "Unwizardly Scheme"]);
  });

  it("orders the full set: exact, prefix, word-start, substring", () => {
    const names = [
      item("Interpolar Field", "C1"), // "polar" mid-word only
      item("Polar Bears", "C2"), // prefix
      item("Something Polar", "C3"), // word-start, not prefix
      item("Polar", "C4"), // exact
    ];
    expect(suggest(names, "polar").map((n) => n.name)).toEqual(["Polar", "Polar Bears", "Something Polar", "Interpolar Field"]);
  });

  it("is case-insensitive", () => {
    expect(suggest(NAMES, "POLAR").map((n) => n.name)).toEqual(["Polar Bears", "Polarity Well"]);
    expect(suggest(NAMES, "wIzArD").map((n) => n.name)).toEqual(["Apprentice Wizard", "Frost Wizard"]);
  });

  it("is diacritic-insensitive", () => {
    expect(suggest(NAMES, "emigre").map((n) => n.name)).toEqual(["Émigré Scholar"]);
    expect(suggest(NAMES, "émigré").map((n) => n.name)).toEqual(["Émigré Scholar"]);
  });

  it("caps results at the limit, keeping rank order", () => {
    const names = Array.from({ length: 20 }, (_, i) => item(`Bear ${i}`, `C${i}`));
    const result = suggest(names, "bear", 3);
    expect(result).toHaveLength(3);
    expect(result.map((n) => n.name)).toEqual(["Bear 0", "Bear 1", "Bear 2"]);
  });

  it("defaults the limit to 8", () => {
    const names = Array.from({ length: 20 }, (_, i) => item(`Bear ${i}`, `C${i}`));
    expect(suggest(names, "bear")).toHaveLength(8);
  });

  it("returns no matches when nothing matches", () => {
    expect(suggest(NAMES, "xyzzy")).toEqual([]);
  });
});
