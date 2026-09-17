import { afterEach, describe, expect, it, vi } from "vitest";
import { changedFields, fetchWithRetry, historySource, orderedSets, rowInForce, setFace,
         SET_FACES, showsCurrentValues, type RegistryPrinting, type RegistrySet } from "./registry";

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
    expect(v.short).toBe("shows earlier values");
    expect(v.long).toContain("earlier values");
  });
  it("distinguishes a printing with no card text from one with no release date", () => {
    expect(showsCurrentValues({ printed_as_current: null, released_at: "2025-03-01" })).toMatchObject({ verdict: "no-text" });
    expect(showsCurrentValues({ printed_as_current: null, released_at: null })).toMatchObject({ verdict: "undated" });
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = () => new Response("{}", { status: 200 });

  it("retries a dropped connection and returns the eventual success", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchWithRetry("https://example.test/x", {}, 4, 0);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx but gives up with the last error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithRetry("https://example.test/x", {}, 3, 0)).rejects.toThrow("HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx, which is an answer rather than a failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithRetry("https://example.test/x", {}, 4, 0)).rejects.toThrow("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


const aSet = (over: Partial<RegistrySet> & { set_name: string }): RegistrySet => ({
  set_code: null, released_at: null, cards: 0, printings: 0, api_url: null, kairos_url: null, ...over,
});
const aPrinting = (over: Partial<RegistryPrinting> & { printing_id: string }): RegistryPrinting => ({
  codex_id: "C000001", card_name: "A Card", set_name: "Alpha", set_code: "001", released_at: null,
  product: "Booster", finish: "Standard", slug: "001-a_card-b-s", back: null, image_hash: "aaaa",
  printed_as_current: true, retired_at: null, api_url: "", kairos_url: "", image_status: "ok",
  artist: null, artist_slug: null, flavour_text: null, typeline: null,
  image_urls: { small: "s", normal: "n", large: "l", original: "o" }, ...over,
});

describe("orderedSets", () => {
  it("runs from Alpha to the promo bucket, whatever the release dates say", () => {
    // The promo set holds the earliest promo, so its released_at (2022-03-15)
    // is before Alpha's (2023-06-22): by date it came first, which is wrong.
    const sets = [
      aSet({ set_name: "Promo", set_code: "999", released_at: "2022-03-15" }),
      aSet({ set_name: "Gothic", set_code: "006", released_at: "2025-12-05" }),
      aSet({ set_name: "Alpha", set_code: "001", released_at: "2023-06-22" }),
      aSet({ set_name: "Dragonlord", set_code: "005", released_at: "2025-07-31" }),
    ];
    expect(orderedSets(sets).map((s) => s.set_name)).toEqual(["Alpha", "Dragonlord", "Gothic", "Promo"]);
    // A set with no code sorts after every coded one, promos included.
    expect(orderedSets([...sets, aSet({ set_name: "Nameless" })]).at(-1)!.set_name).toBe("Nameless");
    // The input is left alone.
    expect(sets[0].set_name).toBe("Promo");
  });
});

describe("setFace", () => {
  const gothic = aSet({ set_name: "Gothic", set_code: "006" });
  it("takes the chosen printing when it is served", () => {
    const printings = [
      aPrinting({ printing_id: "P002700", set_code: "006", card_name: "Somebody Else" }),
      aPrinting({ printing_id: SET_FACES["006"], set_code: "006", card_name: "Necromancer" }),
    ];
    expect(setFace(gothic, printings)?.card_name).toBe("Necromancer");
  });
  it("falls back to the first served printing of the set", () => {
    // A new set, before anyone chooses a face for it.
    const fresh = aSet({ set_name: "Newest", set_code: "007" });
    const printings = [aPrinting({ printing_id: "P003000", set_code: "007", card_name: "First In" })];
    expect(setFace(fresh, printings)?.card_name).toBe("First In");
    // And when the chosen printing has no image yet, rather than nothing.
    const unserved = [
      aPrinting({ printing_id: SET_FACES["006"], set_code: "006", card_name: "Necromancer",
                  image_status: "missing", image_urls: null }),
      aPrinting({ printing_id: "P002700", set_code: "006", card_name: "Somebody Else" }),
    ];
    expect(setFace(gothic, unserved)?.card_name).toBe("Somebody Else");
  });
  it("is null when the set has no served printing at all", () => {
    expect(setFace(gothic, [aPrinting({ printing_id: "P1", set_code: "006", image_status: "missing", image_urls: null })])).toBeNull();
  });
});
