import { describe, expect, it } from "vitest";
import { search } from "./evaluate";
import { directLookup } from "./query";
import { DATA, SLUG_HISTORY } from "./fixture";
import type { Printing, SearchData } from "./types";

/** The fixture plus what schema 12 brings: a promo whose release is
 * recorded (Polar Bears' rainbow promo came out with Beta) and a curio of
 * the Witch, recorded by hand in the registry's own set CUR. */
const curio: Printing = {
  ...DATA.printings.find((p) => p.printing_id === "P000006")!,
  printing_id: "P000009", slug: "cur-witch-c-s", set_code: "CUR", set_name: "Curios",
  product: "Curio", released_at: null, artist: null, artist_slug: null,
  released_with: "004", origin: "manual",
};
const data: SearchData = {
  cards: DATA.cards.map((c) => (c.codex_id === "C000003" ? { ...c, set_codes: [...c.set_codes, "CUR"], printing_ids: [...c.printing_ids, "P000009"] } : c)),
  printings: [
    ...DATA.printings.map((p) => (p.printing_id === "P000005" ? { ...p, released_with: "002" } : p)),
    curio,
  ],
};
const prints = (q: string) => search(q, data, SLUG_HISTORY).hits.map((h) => h.printing?.printing_id ?? null);

describe("sets of the registry's own", () => {
  it("s: takes a letter code, and the set's name", () => {
    expect(prints("s:cur unique:prints")).toEqual(["P000009"]);
    expect(prints("s:CUR unique:prints")).toEqual(["P000009"]);
    expect(prints("s:curios unique:prints")).toEqual(["P000009"]);
  });
  it("a code is a label, written in full", () => {
    expect(prints("s:004 unique:prints").sort()).toEqual(["P000006", "P000008"]);
    expect(prints("s:4 unique:prints")).toEqual([]);
  });
});

describe("with: the release a printing came out with", () => {
  it("finds a set's own printings and the promos and curios released with it", () => {
    expect(prints("with:beta unique:prints")).toEqual(["P000003", "P000005"]);
    expect(prints("with:004 unique:prints").sort()).toEqual(["P000006", "P000008", "P000009"]);
    expect(prints("rw:arthurian unique:prints").sort()).toEqual(["P000006", "P000008", "P000009"]);
  });
  it("with: and s: together separate the set's own printings from the rest", () => {
    expect(prints("with:004 -s:004 unique:prints")).toEqual(["P000009"]);
  });
  it("a promo with no recorded release matches no with: at all", () => {
    const unrecorded = { ...data, printings: data.printings.map((p) => (p.printing_id === "P000005" ? { ...p, released_with: null } : p)) };
    expect(search("with:beta unique:prints", unrecorded, SLUG_HISTORY).hits.map((h) => h.printing?.printing_id)).toEqual(["P000003"]);
  });
});

describe("is:manual", () => {
  it("finds the printings the registry recorded by hand", () => {
    expect(prints("is:manual unique:prints")).toEqual(["P000009"]);
    expect(prints("-is:manual s:004 unique:prints").sort()).toEqual(["P000006", "P000008"]);
  });
});

describe("a manual printing's slug", () => {
  it("is a direct lookup like any other", () => {
    expect(directLookup("cur-witch-c-s")).toEqual({ kind: "slug", value: "cur-witch-c-s" });
    expect(directLookup("999-the_champion_002-op-f")).toEqual({ kind: "slug", value: "999-the_champion_002-op-f" });
  });
  it("finds its card through slug:", () => {
    expect(search("slug:cur-witch-c-s", data, SLUG_HISTORY).hits.map((h) => h.card.name)).toEqual(["Witch"]);
  });
});
