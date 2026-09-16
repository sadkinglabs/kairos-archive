import { describe, expect, it } from "vitest";
import { OFFICIAL_BASE, officialCardUrl, officialPrintingUrl, officialSlugFromName, officialStem } from "./officialCardUrl";

const url = (stem: string) => `${OFFICIAL_BASE}/cards/${stem}`;

describe("the publisher's card page", () => {
  it("reads their spelling out of their slug", () => {
    expect(officialCardUrl(["001-vile_imp-b-s"])).toBe(url("vile_imp"));
    expect(officialCardUrl(["001-mariners_curse-b-s", "001-mariners_curse-b-f"])).toBe(url("mariners_curse"));
  });
  it("opens the card, not one of its art variants", () => {
    // Foot Soldier is one card here and six records upstream.
    expect(officialCardUrl([
      "999-foot_soldier_english-d-s", "999-foot_soldier_saracen-d-s", "006-foot_soldier-bt-s",
    ])).toBe(url("foot_soldier"));
    expect(officialCardUrl(["006-frog_blue-bt-s", "006-frog-bt-s", "006-frog_red-bt-s"])).toBe(url("frog"));
  });
  it("picks the same stem whatever order the printings arrive in", () => {
    const slugs = ["999-foot_soldier_saracen-d-s", "006-foot_soldier-bt-s", "999-foot_soldier_1-d-s"];
    expect(officialCardUrl(slugs)).toBe(officialCardUrl([...slugs].reverse()));
  });
  it("has nothing to link to without a usable slug", () => {
    expect(officialCardUrl([])).toBeNull();
    expect(officialCardUrl(["vile_imp"])).toBeNull();
    expect(officialCardUrl(["001--b-s"])).toBeNull();
    expect(officialStem("001-vile_imp-b-s")).toBe("vile_imp");
  });
});

describe("a printing's own record", () => {
  it("is the variant, because that is what you are looking at", () => {
    expect(officialPrintingUrl({ slug: "999-foot_soldier_saracen-d-s" })).toBe(url("foot_soldier_saracen"));
    expect(officialPrintingUrl(null)).toBeNull();
    expect(officialPrintingUrl({ slug: "nope" })).toBeNull();
  });
});

describe("the name rule, which exists to check the slugs", () => {
  it.each([
    ["Vile Imp", "vile_imp"],
    ["Älvalinne Dryads", "alvalinne_dryads"],        // diacritics folded
    ["Mariner's Curse", "mariners_curse"],           // apostrophe dropped, not replaced
    ["Wills-o'-the-Wisp", "wills_o_the_wisp"],       // hyphens become underscores
    ["Orb of Ba'al Berith", "orb_of_baal_berith"],
    ["Castle's Ablaze!", "castles_ablaze"],          // trailing punctuation trimmed
    ["Maelström", "maelstrom"],
    ["Foot Soldier", "foot_soldier"],
  ])("normalises %s to %s", (name, stem) => {
    expect(officialSlugFromName(name)).toBe(stem);
  });
});
