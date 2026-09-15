import { describe, expect, it } from "vitest";
import { browserHeading, refineQuery, refinementUrl, resultHref, resultNoun } from "./browserState";
import { parse } from "./query";
import { search } from "./evaluate";
import { DATA, SLUG_HISTORY } from "./fixture";

describe("browser presentation", () => {
  it("names an unfiltered collection after its actual result unit", () => {
    expect(browserHeading("unique:cards sort:cost")).toBe("All cards");
    expect(browserHeading("unique:prints")).toBe("All printings");
    expect(browserHeading("unique:art order:desc")).toBe("All artwork");
    expect(resultNoun("cards")).toBe("card");
    expect(resultNoun("prints")).toBe("printing");
    expect(resultNoun("art")).toBe("artwork");
  });
  it("shows filters and invalid queries rather than calling them all cards", () => {
    for (const q of ["e:Water", "polar bears", "unique:prints f:Foil", "sort:invalid"]) {
      expect(browserHeading(q)).toBe(`Search: ${q}`);
    }
    expect(browserHeading(" ")).toBe("Search");
  });
});

describe("refining a browse", () => {
  const previous = "e:Fire unique:prints sort:cost order:desc";
  it("replaces filters but keeps the chosen display options", () => {
    const q = refineQuery("e:Water", previous);
    expect(parse(q).options).toEqual({ unique: "prints", sort: "cost", order: "desc" });
    expect(q).not.toContain("e:Fire");
    expect(search(q, DATA, SLUG_HISTORY).hits.every(hit => hit.card.elements.includes("Water"))).toBe(true);
    expect(search(q, DATA, SLUG_HISTORY).total).toBeGreaterThan(0);
  });
  it("lets explicitly typed options replace inherited ones, including defaults", () => {
    const q = refineQuery("e:Water unique:cards sort:name order:asc", previous);
    expect(parse(q).errors).toEqual([]);
    expect(parse(q).options).toEqual({ unique: "cards", sort: "name", order: "asc" });
  });
  it("does not mistake option-looking text inside quotes for an override", () => {
    const q = refineQuery('r:"sort:name unique:cards order:asc"', previous);
    expect(parse(q).options).toEqual({ unique: "prints", sort: "cost", order: "desc" });
    expect(q).toContain('r:"sort:name unique:cards order:asc"');
  });
  it("clears the filter while preserving browsing, even with all defaults", () => {
    expect(browserHeading(refineQuery("", previous))).toBe("All printings");
    expect(refineQuery("", "")).toBe("unique:cards");
  });
  it("keeps direct card, printing and slug lookups navigable", () => {
    for (const q of ["C000001", "P000001", "001-polar_bears-b-s"]) {
      expect(refineQuery(q, previous)).toBe(q);
    }
  });
  it("retains the current entry point and resets the page in a shareable URL", () => {
    for (const path of ["/cards", "/search"]) {
      const url = new URL(refinementUrl(path, `?q=${encodeURIComponent(previous)}&page=8`, "e:Water"), "https://example.test");
      expect(url.pathname).toBe(path);
      expect(url.searchParams.has("page")).toBe(false);
      expect(parse(url.searchParams.get("q")!).options.unique).toBe("prints");
      expect(url.searchParams.get("q")).toContain("e:Water");
    }
    expect(new URL(refinementUrl("/cards", "", "", "unique:cards"), "https://example.test").searchParams.get("q")).toBe("unique:cards");
  });
});

describe("result destinations", () => {
  const card = { codex_id: "C000002", name: "Polar Bears" };
  it("opens the card for card results and the represented printing for editions and artwork", () => {
    expect(resultHref(card, "P000004", "cards")).toBe("/cards/C000002/polar-bears");
    expect(resultHref(card, "P000004", "prints")).toBe("/printings/P000004");
    expect(resultHref(card, "P000005", "prints")).toBe("/printings/P000005");
    expect(resultHref(card, "P000005", "art")).toBe("/printings/P000005");
    expect(resultHref(card, null, "prints")).toBe("/cards/C000002/polar-bears");
  });
});
