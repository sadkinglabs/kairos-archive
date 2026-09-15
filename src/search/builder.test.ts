import { describe, expect, it } from "vitest";
import { buildQuery, listTerm, quoteValue, term } from "./builder";
import { parse } from "./query";
import { search } from "./evaluate";
import { DATA, SLUG_HISTORY } from "./fixture";

/** Anything the form can build has to be something the parser accepts. */
const parses = (q: string) => parse(q).errors;
const names = (q: string) => search(q, DATA, SLUG_HISTORY).hits.map((h) => h.card.name);

describe("quoteValue", () => {
  it("leaves plain values bare and quotes the rest", () => {
    expect(quoteValue("Minion")).toBe("Minion");
    expect(quoteValue("006")).toBe("006");
    expect(quoteValue("thr.total")).toBe("thr.total");
    expect(quoteValue("Jeff A. Menges")).toBe('"Jeff A. Menges"');
    expect(quoteValue("Adam Kašpar")).toBe('"Adam Kašpar"');
    expect(quoteValue("polar bears")).toBe('"polar bears"');
  });
});

describe("term", () => {
  it("writes a key, an operator and a value", () => {
    expect(term({ key: "t", value: "Minion" })).toBe("t:Minion");
    expect(term({ key: "m", op: "<=", value: "3" })).toBe("m<=3");
    expect(term({ key: "thr", op: ">=", value: "2" })).toBe("thr>=2");
    expect(term({ key: "is", value: "errata", negate: true })).toBe("-is:errata");
    expect(term({ key: "a", value: "Jeff A. Menges" })).toBe('a:"Jeff A. Menges"');
    expect(term({ key: "n", value: "   " })).toBe("");
  });
  it("produces queries the parser accepts", () => {
    for (const pick of [
      { key: "t", value: "Minion" }, { key: "rar", value: "Exceptional" }, { key: "sub", value: "Beast" },
      { key: "k", value: "Genesis" }, { key: "u", value: "Evil" }, { key: "m", op: "<=", value: "3" },
      { key: "thr", op: ">=", value: "2" }, { key: "water", op: ":", value: "1" }, { key: "atk", op: ">", value: "4" },
      { key: "pow", op: "!=", value: "0" }, { key: "l", op: ">=", value: "20" }, { key: "s", value: "006" },
      { key: "pro", value: "BoxTopper" }, { key: "f", value: "Foil" }, { key: "a", value: "Jeff A. Menges" },
      { key: "year", op: ">=", value: "2024" }, { key: "has", value: "image" }, { key: "is", value: "errata", negate: true },
      { key: "unique", value: "prints" }, { key: "sort", value: "threshold" }, { key: "order", value: "desc" },
    ]) expect(parses(term(pick)), term(pick)).toEqual([]);
  });
});

describe("listTerm", () => {
  it("joins the ticked values by mode", () => {
    expect(listTerm("e", [], "+")).toBe("");
    expect(listTerm("e", ["Water"], "+")).toBe("e:Water");
    expect(listTerm("e", ["Water"], "=")).toBe("e=Water");
    expect(listTerm("e", ["Water", "Air"], "+")).toBe("e:Water+Air");
    expect(listTerm("e", ["Water", "Air"], ",")).toBe("e:Water,Air");
    expect(listTerm("e", ["Water", "Air"], "=")).toBe("e=Water+Air");
    expect(listTerm("sub", ["Beast", "Spirit"], "+")).toBe("sub:Beast+Spirit");
    expect(listTerm("k", ["Airborne", "Lethal"], ",")).toBe("k:Airborne,Lethal");
  });
  it("quotes the whole list when a value is not a plain word", () => {
    const q = listTerm("sub", ["Beast", "Sea Serpent"], "+");
    expect(q).toBe('sub:"Beast+Sea Serpent"');
    expect(parses(q)).toEqual([]);
  });
  it("means on the fixture what the form label promises", () => {
    // Witch is Water and Air; Polar Bears is Water alone.
    expect(names(listTerm("e", ["Water", "Air"], "+"))).toEqual(["Witch"]);
    expect(names(listTerm("e", ["Water", "Air"], ","))).toEqual(["Apprentice Wizard", "Druid", "Polar Bears", "Witch"]);
    expect(names(listTerm("e", ["Water", "Air"], "="))).toEqual(["Witch"]);
    expect(names(listTerm("e", ["Water", "Fire"], "="))).toEqual([]);
    // Apprentice Wizard is the only card with both keywords; Polar Bears is
    // the only Beast, and it is the only card with Submerge.
    expect(names(listTerm("k", ["Spellcaster", "Genesis"], "+"))).toEqual(["Apprentice Wizard"]);
    expect(names(listTerm("k", ["Spellcaster", "Submerge"], ","))).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names(listTerm("k", ["Spellcaster", "Submerge"], "+"))).toEqual([]);
    expect(names(listTerm("sub", ["Beast", "Mortal"], ","))).toEqual(["Apprentice Wizard", "Druid", "Polar Bears", "Witch"]);
    expect(names(listTerm("sub", ["Beast", "Mortal"], "+"))).toEqual([]);
  });
});

describe("buildQuery", () => {
  it("keeps what was typed and appends the choices", () => {
    const q = buildQuery(" k:genesis ", [listTerm("e", ["Air"], "+"), term({ key: "m", op: "<=", value: "3" }), ""]);
    expect(q).toBe("k:genesis e:Air m<=3");
    expect(parses(q)).toEqual([]);
    expect(names(q)).toEqual(["Apprentice Wizard"]);
  });
  it("an empty form leaves an empty query", () => {
    expect(buildQuery("", [listTerm("e", [], "+"), term({ key: "t", value: "" })])).toBe("");
  });
});
