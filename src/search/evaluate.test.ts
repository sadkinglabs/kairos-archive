import { describe, expect, it } from "vitest";
import { resolveEnum, search } from "./evaluate";
import { DATA, SLUG_HISTORY } from "./fixture";

const names = (q: string) => search(q, DATA, SLUG_HISTORY).hits.map((h) => h.card.name);
const prints = (q: string) => search(q, DATA, SLUG_HISTORY).hits.map((h) => h.printing?.printing_id ?? null);

describe("bare words", () => {
  it("match the name, every word, case-insensitively", () => {
    expect(names("polar")).toEqual(["Polar Bears"]);
    expect(names("BEARS polar")).toEqual(["Polar Bears"]);
    expect(names("wiz")).toEqual(["Apprentice Wizard"]);
  });
  it("!\"exact\" matches the whole name", () => {
    expect(names('!"polar bears"')).toEqual(["Polar Bears"]);
    expect(names('!"polar"')).toEqual([]);
  });
  it("rules-text matches are a separate, labelled group", () => {
    const r = search("bears", DATA);
    expect(r.hits.map((h) => h.card.name)).toEqual(["Polar Bears"]);
    expect(r.rulesTextHits.map((c) => c.name)).toEqual(["Druid"]);
  });
});

describe("card keys", () => {
  it("r: is rules text; n: is the name", () => {
    expect(names('r:"draw a spell"')).toEqual(["Apprentice Wizard", "Druid"]);
    expect(names("n:witch")).toEqual(["Witch"]);
  });
  it("enums accept unambiguous prefixes and reject ambiguous ones", () => {
    expect(names("rarity:ex")).toEqual(["Polar Bears"]);
    expect(names("rarity:el")).toEqual(["Witch"]);
    expect(names("t:art")).toEqual([]);
    expect(names("t:si")).toEqual(["Broken Site"]);
    expect(names("cat:token")).toEqual([]);
    expect(resolveEnum("e", ["Exceptional", "Elite"])).toBeNull();
  });
  it("lists: subtypes, keywords, umbrellas; repeat for AND", () => {
    expect(names("sub:beast")).toEqual(["Polar Bears"]);
    expect(names("k:genesis")).toEqual(["Apprentice Wizard"]);
    expect(names("k:spell k:gen")).toEqual(["Apprentice Wizard"]);
    expect(names("u:evil")).toEqual(["Witch"]);
  });
  it("elements: contains, both, exactly, none, first letters", () => {
    expect(names("e:water")).toEqual(["Polar Bears", "Witch"]);
    expect(names("e:water e:air")).toEqual(["Witch"]);
    expect(names("e=water")).toEqual(["Polar Bears"]);
    expect(names("e=wa")).toEqual(["Polar Bears"]);
    expect(names("e:w")).toEqual(["Polar Bears", "Witch"]);
    expect(names("e:none")).toEqual(["Broken Site"]);
    expect(names("e!=air")).toEqual(["Broken Site", "Polar Bears"]);
  });
  it("thresholds and numbers with every operator", () => {
    expect(names("water>=1")).toEqual(["Polar Bears", "Witch"]);
    expect(names("air:1")).toEqual(["Apprentice Wizard", "Druid", "Witch"]);
    expect(names("cost<=2")).toEqual(["Witch"]);
    expect(names("cost!=3")).toEqual(["Broken Site", "Druid", "Witch"]);
    expect(names("cost:x")).toEqual(["Broken Site", "Druid"]);
    expect(names("cost:odd")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("life>=20")).toEqual(["Druid"]);
  });
  it("power is the derived value; atk and def are the raw ones; keys compare to keys", () => {
    expect(names("pow:3")).toEqual(["Druid", "Polar Bears"]);
    expect(names("atk:4")).toEqual(["Druid"]);
    expect(names("def>=3")).toEqual(["Polar Bears"]);
    expect(names("atk>def")).toEqual(["Druid"]);
    expect(names("atk=def")).toEqual(["Apprentice Wizard", "Polar Bears"]);
  });
  it("id: and slug: resolve, including a superseded slug", () => {
    expect(names("id:C000003")).toEqual(["Witch"]);
    expect(names("id:p000005")).toEqual(["Polar Bears"]);
    expect(names("slug:004-witch_old-b-s")).toEqual(["Witch"]);
    expect(names("slug:nope")).toEqual([]);
  });
});

describe("printing keys bind to one printing", () => {
  it("set by code, number, name and name prefix", () => {
    expect(names("s:001")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("s:1")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("s:gothic")).toEqual(["Broken Site"]);
    expect(names('set:"arthurian legends"')).toEqual(["Druid", "Witch"]);
    expect(names("s:arth")).toEqual(["Druid", "Witch"]);
  });
  it("product leniently, finish by name or code", () => {
    expect(names("pro:bt")).toEqual(["Druid"]);
    expect(names('pro:"box topper"')).toEqual(["Druid"]);
    expect(names("pro:organized")).toEqual(["Polar Bears"]);
    expect(names("f:rf")).toEqual(["Polar Bears"]);
    expect(names("f:foil")).toEqual(["Apprentice Wizard"]);
    expect(names("f!=standard")).toEqual(["Apprentice Wizard", "Polar Bears"]);
  });
  it("all printing terms must hold for a single printing", () => {
    // Apprentice Wizard has an Alpha foil (P000002) and a Beta standard: Alpha+foil matches, Beta+foil does not.
    expect(prints("s:alpha f:foil")).toEqual(["P000002"]);
    expect(names("s:beta f:foil")).toEqual([]);
    // or between printing terms is judged per printing
    expect(names("(s:beta or f:foil) t:minion")).toEqual(["Apprentice Wizard"]);
  });
  it("the shown printing is the one that matched, default first otherwise", () => {
    expect(prints("polar")).toEqual(["P000005"]);       // default printing
    expect(prints("polar s:alpha")).toEqual(["P000004"]); // the Alpha one
  });
  it("dates: year, partial dates, ranges", () => {
    expect(names("year:2023")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("date>=2025-08-01")).toEqual(["Broken Site", "Polar Bears"]);
    expect(names("date<2024")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("date:2024-05")).toEqual(["Druid", "Witch"]);
    expect(names("year>2024")).toEqual(["Broken Site", "Polar Bears"]);
  });
  it("artist, typeline, flavour", () => {
    expect(names("a:menges")).toEqual(["Witch"]);
    expect(names("a:jeff_a")).toEqual(["Witch"]);
    expect(names('tl:"ordinary mortal"').length).toBe(5);
    expect(names("ft:anything")).toEqual([]);
  });
});

describe("flags", () => {
  it("card flags", () => {
    expect(names("is:errata")).toEqual(["Polar Bears"]);
    expect(names("is:dfc")).toEqual(["Druid"]);
    expect(names("has:back")).toEqual(["Druid"]);
    expect(names("is:avatar")).toEqual(["Druid"]);
    expect(names("is:site")).toEqual(["Broken Site"]);
    expect(names("is:spell")).toEqual(["Apprentice Wizard", "Polar Bears", "Witch"]);
    expect(names("is:reprint")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    expect(names("is:unique-printing")).toEqual(["Broken Site", "Druid", "Witch"]);
  });
  it("counts elements rather than naming them", () => {
    // Witch is Water and Air; the Broken Site's ["None"] is no element at all,
    // so it is neither multi nor mono.
    expect(names("is:multi-element")).toEqual(["Witch"]);
    expect(names("is:mono-element")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears"]);
    expect(names("e:none")).toEqual(["Broken Site"]);
    expect(names("is:multi-element")).toEqual(names("is:multi"));
    expect(names("is:mono-element")).toEqual(names("is:monoelement"));
    // It composes like any other flag.
    expect(names("is:multi-element e:water")).toEqual(["Witch"]);
    expect(names("is:multi-element e:fire")).toEqual([]);
    expect(names("-is:multi-element t:minion")).toEqual(["Apprentice Wizard", "Polar Bears"]);
  });
  it("thr: is the four thresholds added up", () => {
    // Apprentice Wizard and Druid ask for 1 Air, Polar Bears 1 Water,
    // Witch 1 Air and 1 Water, the Broken Site nothing.
    expect(names("thr:2")).toEqual(["Witch"]);
    expect(names("thr:0")).toEqual(["Broken Site"]);
    expect(names("thr>=1")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears", "Witch"]);
    expect(names("threshold<2 -thr:0")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears"]);
    expect(names("thr.total:2")).toEqual(names("thr:2"));
    // It reads as a right-hand side too, like the other numeric keys.
    expect(names("cost>=thr")).toEqual(["Apprentice Wizard", "Polar Bears", "Witch"]);
    // And it sorts.
    expect(names("t:minion sort:threshold order:desc")).toEqual(["Witch", "Apprentice Wizard", "Polar Bears"]);
  });
  it("e= with a list is the exact set of elements", () => {
    // Witch is Water and Air and nothing else.
    expect(names("e=water+air")).toEqual(["Witch"]);
    expect(names("e=w+a")).toEqual(["Witch"]);
    expect(names("e=water+fire")).toEqual([]);
    // One element behaves as before: exactly that element.
    expect(names("e=water")).toEqual(["Polar Bears"]);
    // A comma list stays a list of exact matches.
    expect(names("e=water,air")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears"]);
  });
  it("value lists: , is either, + is every one", () => {
    // The pair a player actually wants: both elements on one card, versus
    // either element on any card.
    expect(names("e:water+air")).toEqual(["Witch"]);
    expect(names("e:water,air")).toEqual(["Apprentice Wizard", "Druid", "Polar Bears", "Witch"]);
    expect(names("e:w+a")).toEqual(names("e:water e:air"));
    // Any listable key, not just elements.
    expect(names("t:minion,site")).toEqual(["Apprentice Wizard", "Broken Site", "Polar Bears", "Witch"]);
    expect(names("id:C000003,C000004")).toEqual(["Broken Site", "Witch"]);
    // != negates the list as a whole: neither element, not "not both".
    expect(names("e!=water,air")).toEqual(["Broken Site"]);
    expect(names("-e:water,air")).toEqual(["Broken Site"]);
  });
  it("a list of printing values still binds to one printing", () => {
    // Either finish on any printing of the card...
    expect(names("f:foil,rainbow")).toEqual(["Apprentice Wizard", "Polar Bears"]);
    // ...but + asks one printing to be both, which no printing is.
    expect(names("f:foil+rainbow")).toEqual([]);
    expect(prints("unique:prints s:001,999")).toEqual(["P000001", "P000002", "P000005", "P000004"]);
  });
  it("printing flags", () => {
    expect(names("is:promo")).toEqual(["Druid", "Polar Bears"]);
    expect(names("is:foil")).toEqual(["Apprentice Wizard"]);
    expect(names("is:rainbow")).toEqual(["Polar Bears"]);
    expect(names("is:outdated")).toEqual(["Polar Bears"]);
    expect(names("is:retired")).toEqual(["Broken Site"]);
    expect(names("has:image")).toEqual(["Druid", "Polar Bears"]);
    // Negating a printing term still binds to one printing: "a printing
    // without an image" - Polar Bears has one (its Alpha print).
    expect(names("-has:image")).toEqual(["Apprentice Wizard", "Broken Site", "Polar Bears", "Witch"]);
  });
});

describe("logic, units and sorting", () => {
  it("negation and or", () => {
    expect(names("-e:water t:minion")).toEqual(["Apprentice Wizard"]);
    expect(names("not e:water t:minion")).toEqual(["Apprentice Wizard"]);
    expect(names("is:site or is:avatar")).toEqual(["Broken Site", "Druid"]);
  });
  it("unique:prints lists every matching printing; unique:art one per artwork", () => {
    expect(prints("s:alpha unique:prints")).toEqual(["P000001", "P000002", "P000004"]);
    expect(prints("polar unique:prints")).toEqual(["P000005", "P000004"]);
    expect(prints("polar unique:art")).toEqual(["P000005", "P000004"]); // P000004 has no hash: counts as its own art
  });
  it("sort and order", () => {
    expect(names("t:minion sort:cost")).toEqual(["Witch", "Apprentice Wizard", "Polar Bears"]);
    expect(names("t:minion sort:cost order:desc")).toEqual(["Apprentice Wizard", "Polar Bears", "Witch"]); // ties by name
    expect(names("sort:date")).toEqual(["Polar Bears", "Broken Site", "Druid", "Witch", "Apprentice Wizard"]);
    expect(names("sort:rarity order:desc")).toEqual(["Broken Site", "Druid", "Witch", "Polar Bears", "Apprentice Wizard"]);
  });
  it("an empty query matches nothing and an erroneous one reports", () => {
    expect(search("", DATA).hits).toEqual([]);
    expect(search("o:x", DATA).errors.length).toBe(1);
  });
});
