import { describe, expect, it } from "vitest";
import { buildQuery, elementQuery, listTerm, quoteValue, term } from "./builder";
import { parse } from "./query";
import { search } from "./evaluate";
import { CARDS, DATA, SLUG_HISTORY } from "./fixture";

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

describe("elementQuery", () => {
  // Apprentice Wizard and Druid are Air, Polar Bears Water, Witch Water and
  // Air, the Broken Site colourless.
  const q = (picked: string[], match: Parameters<typeof elementQuery>[2]) => elementQuery("e", picked, match);
  it("writes one term set per match, with count modes usable without ticks", () => {
    expect(q([], "all")).toBe("");
    expect(q([], "any")).toBe("");
    expect(q([], "only")).toBe("");
    expect(q(["Multi"], "all")).toBe("is:multi-element");
    expect(q([], "mono")).toBe("(is:mono-element or e=None)");
    expect(q(["Water", "Air"], "all")).toBe("e:Water+Air");
    expect(q(["Water", "Air"], "any")).toBe("e:Water,Air");
    expect(q(["Water", "Air"], "only")).toBe("e=Water+Air");
    expect(q(["Multi", "Water"], "all")).toBe("is:multi-element e:Water");
    expect(q(["Water", "Fire"], "mono")).toBe("e=Water,Fire");
  });
  it("reads Multi as a count that narrows, not as an element", () => {
    // Alone: every card with two or more elements, whichever they are.
    expect(q(["Multi"], "all")).toBe("is:multi-element");
    expect(q(["Multi"], "any")).toBe("is:multi-element");
    expect(q(["Multi"], "only")).toBe("is:multi-element");
    // With elements: the same question, narrowed to those.
    expect(q(["Multi", "Water"], "all")).toBe("is:multi-element e:Water");
    expect(q(["Multi", "Water", "Air"], "all")).toBe("is:multi-element e:Water+Air");
    expect(q(["Multi", "Water", "Air"], "any")).toBe("is:multi-element e:Water,Air");
    // The fixture: Witch is the only card with two elements.
    expect(names(q(["Multi"], "all"))).toEqual(["Witch"]);
    expect(names(q(["Multi", "Water"], "all"))).toEqual(["Witch"]);
    expect(names(q(["Multi", "Fire"], "all"))).toEqual([]);
    // Asking for one element and more than one is answered, not prevented.
    expect(q(["Multi"], "mono")).toBe("is:multi-element (is:mono-element or e=None)");
    expect(names(q(["Multi"], "mono"))).toEqual([]);
  });
  it("treats No element as the fifth value, with no rule of its own", () => {
    // Every Artifact and every Avatar carries it, so it is a value like Water
    // and every match applies to it unchanged.
    expect(q(["None"], "all")).toBe("e:None");
    expect(q(["None"], "only")).toBe("e=None");
    expect(q(["None", "Water"], "any")).toBe("e:None,Water");
    expect(q(["None", "Water"], "all")).toBe("e:None+Water");
    expect(q(["None", "Water"], "only")).toBe("e=None+Water");
    expect(q(["None", "Water", "Fire"], "any")).toBe("e:None,Water,Fire");
    // The Broken Site is the fixture's colourless card, Polar Bears its Water.
    expect(names(q(["None"], "all"))).toEqual(["Broken Site"]);
    expect(names(q(["None"], "only"))).toEqual(["Broken Site"]);
    expect(names(q(["None", "Water"], "any"))).toEqual(["Broken Site", "Polar Bears", "Witch"]);
    // Asking for both is answerable, and the answer is that no card is both.
    expect(names(q(["None", "Water"], "all"))).toEqual([]);
  });
  it("matches the selected classifications across every subset and mode, including zero results", () => {
    const classifications = ["None", "Air", "Earth", "Fire", "Water"];
    for (let mask = 0; mask < 1 << classifications.length; mask++) {
      const picked = classifications.filter((_, i) => mask & (1 << i));
      for (const match of ["all", "any", "only", "mono"] as const) {
        const built = q(picked, match);
        expect(parses(built), built).toEqual([]);
        const expected = CARDS.filter(card => {
          const all = picked.every(value => card.elements.includes(value));
          const any = picked.length === 0 || picked.some(value => card.elements.includes(value));
          switch (match) {
            case "all": return all;
            case "any": return any;
            case "only": return picked.length === 0 || (all && card.elements.length === picked.length);
            case "mono": return any && card.elements.length === 1;
          }
        }).map(card => card.name).sort();
        expect(names(buildQuery("unique:cards", [built])), `${match}: ${picked.join(",")}`).toEqual(expected);
      }
    }
  });
  it("counts No element as one classification without changing typed mono-element searches", () => {
    expect(names(q(["None"], "mono"))).toEqual(["Broken Site"]);
    expect(names(q(["None", "Water"], "mono"))).toEqual(["Broken Site", "Polar Bears"]);
    expect(names("is:mono-element")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears"]);
    // Both sides of the generated OR must obey other form choices.
    expect(names(buildQuery("t:Site", [q([], "mono")]))).toEqual(["Broken Site"]);
    expect(names(buildQuery("t:Minion", [q([], "mono")]))).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names(buildQuery("t:Site", [q(["None", "Water"], "mono")]))).toEqual(["Broken Site"]);
  });
  it("answers on the fixture what each option promises", () => {
    expect(names(q(["Water", "Air"], "all"))).toEqual(["Witch"]);
    expect(names(q(["Water", "Air"], "any"))).toEqual(["Apprentice Wizard", "Druid", "Polar Bears", "Witch"]);
    expect(names(q(["Water", "Air"], "only"))).toEqual(["Witch"]);
    expect(names(q([], "mono"))).toEqual(["Apprentice Wizard", "Broken Site", "Druid", "Polar Bears"]);
    expect(names(q(["Water"], "mono"))).toEqual(["Polar Bears"]);
    expect(names(q(["Water", "Air"], "mono"))).toEqual(["Apprentice Wizard", "Druid", "Polar Bears"]);
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
