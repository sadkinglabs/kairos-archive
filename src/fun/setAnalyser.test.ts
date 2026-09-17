/** The set analyser tutorial against a small made-up set. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyseSet, cheapestUnique, elementShares, facts, getSetCards, manaCurve, mostExpensive, strongestMinion, typeShares } from "./set-analyser.js";
import { renderComparison, renderReport } from "./analyser-page.js";

const card = (name: string, over: Record<string, unknown> = {}) => ({ name, type: "Minion", rarity: "Ordinary", cost: 2, power: 2, elements: ["Fire"], thr_air: 0, thr_earth: 0, thr_fire: 1, thr_water: 0, kairos_url: `https://site.test/cards/${name}`, ...over });
const set = [
  card("Imp", { cost: 1, power: 1 }),
  card("Ogre", { cost: 4, power: 5, thr_fire: 3 }),
  card("Dragon", { cost: 7, power: 7, rarity: "Unique", thr_fire: 2, thr_air: 2 }),
  card("Bolt", { type: "Magic", cost: 2, power: null }),
  card("Cave", { type: "Site", cost: null, power: null, elements: ["Earth", "Water"], thr_fire: 0 }),
  card("Relic", { type: "Artifact", cost: 3, power: null, elements: ["None"], rarity: "Unique", thr_fire: 0 }),
  card("Sorcerer", { type: "Avatar", cost: null, power: null, elements: ["None"], rarity: null, thr_fire: 0 }),
];
afterEach(() => vi.unstubAllGlobals());

describe("the analysis", () => {
  it("bins costs into a curve, skipping cards with no cost", () => {
    expect(manaCurve(set)).toEqual({ 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, "6+": 1 });
  });
  it("shares elements per card, multi-element cards counting for each", () => {
    expect(elementShares(set)).toEqual({ Air: 0, Earth: 14, Fire: 57, Water: 14, None: 29 });
  });
  it("shares types", () => {
    expect(typeShares(set)).toEqual({ Minion: 43, Magic: 14, Site: 14, Artifact: 14, Avatar: 14 });
  });
  it("finds notable cards by comparing records", () => {
    expect(mostExpensive(set)?.name).toBe("Dragon");
    expect(cheapestUnique(set)?.name).toBe("Relic");
    expect(strongestMinion(set)?.name).toBe("Dragon");
    expect(mostExpensive([card("Cave", { cost: null })])).toBeNull();
  });
  it("derives facts that are not API fields", () => {
    expect(facts(set)).toEqual({ averageCost: 3.4, cheapShare: 80, fivePlusShare: 20, strongMinionShare: 67, multiElement: 1, elementlessShare: 29 });
  });
});

describe("the report", () => {
  it("fetches every page of s:001 and builds the whole report", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({ data: page === 1 ? set.slice(0, 4) : set.slice(4), has_more: page < 2 }));
    });
    const report = await analyseSet("001");
    expect(asked).toEqual([
      "https://query.kairosarchive.net/cards?q=s%3A001&page_size=200&page=1",
      "https://query.kairosarchive.net/cards?q=s%3A001&page_size=200&page=2",
    ]);
    expect(report.cards).toHaveLength(7);
    expect(report.facts).toEqual(["80% of cards cost 4 or less.", "67% of Minions have 3+ power.", "1 cards use more than one element.", "29% of the set has no element."]);
    expect(report.notable["Most expensive card"]?.name).toBe("Dragon");
    const html = renderReport(report, "Alpha");
    expect(html).toContain("<h2>Alpha</h2>");
    expect(html).toContain("7 cards · average mana cost 3.4");
    expect(html).toContain('style="width:100%"');
    expect(html).toContain(">Dragon</a>");
    expect(html).toContain("Elementless");
    const compare = renderComparison(report, "Alpha", report, "Beta");
    expect(compare).toContain("<th>Alpha</th><th>Beta</th>");
    expect(compare).toContain("<td>Average mana cost</td><td>3.4</td><td>3.4</td>");
  });
  it("stops with the API's status when a request fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 503 }));
    await expect(getSetCards("001")).rejects.toThrow("API returned 503");
  });
});
