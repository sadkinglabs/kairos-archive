/** The random deck generator against the deck-building rules. */
import { describe, expect, it } from "vitest";
import { ATLAS, COPIES, SPELLS, SPLIT, deal, draw, fit, formatDeck, matches, query, within } from "./random-deck.js";

type Card = { name: string; type: string; rarity: string | null; elements: string[] };
const card = (name: string, rarity: string | null, elements: string[] = ["Fire"], type = "Minion"): Card => ({ name, type, rarity, elements });
const cycle = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
const total = (picks: { copies: number }[]) => picks.reduce((n, p) => n + p.copies, 0);

/** A query API that answers each part from its own little pool. */
const api = (ordinaryOnly = false) => (async (url: string) => {
  const q = new URL(url).searchParams.get("q")!;
  const part = q.startsWith("!\"Toolbox\"") ? "Toolbox" : q.startsWith("t:avatar") ? "Avatar" : q.startsWith("cat:spell") ? "Collection" : q.split(" ")[0]!.slice(2).replace(/^./, (c) => c.toUpperCase());
  const rarity = part === "Collection" || ordinaryOnly ? "Ordinary" : part === "Toolbox" ? "Exceptional" : "Elite";
  const data = part === "Toolbox" ? [card("Toolbox", "Exceptional", ["None"], "Artifact")] : Array.from({ length: 40 }, (_, i) => card(`${part === "Collection" ? "Artifact" : part}${i}`, rarity, ["Fire"], part));
  return new Response(JSON.stringify({ data, has_more: false }));
}) as unknown as typeof fetch;

describe("the query", () => {
  it("is one search query per part, in the site's syntax", () => {
    expect(query("Minion", ["Air", "Fire"], [])).toBe("t:minion (e:air,fire or e:none)");
    expect(query("Site", ["Water"], ["001", "006"])).toBe("t:site (e:water or e:none) s:001,006 is:booster");
    expect(query("Magic", [], ["002"])).toBe("t:magic e:none s:002 is:booster");
    expect(query("Collection", ["Fire"], ["006"])).toBe("cat:spell rarity:ordinary (e:fire or e:none) s:006 is:booster");
    expect(query("Toolbox", ["Fire"], ["001"])).toBe('!"Toolbox"');
    expect(query("Avatar", ["Air"], ["001"])).toBe('t:avatar -!"Duplicator" -!"Magician"');
  });
  it("fetches every page, stops when the API says so, and remembers the answer", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (url: string) => {
      asked.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({ data: [card(`c${page}`, "Ordinary")], has_more: page < 3 }));
    }) as unknown as typeof fetch;
    expect((await matches("t:site x", fetchImpl)).map((c: Card) => c.name)).toEqual(["c1", "c2", "c3"]);
    expect(asked[0]).toBe("https://query.kairosarchive.net/cards?q=t%3Asite%20x&page_size=200&page=1");
    await matches("t:site x", fetchImpl);
    expect(asked).toHaveLength(3);
    await expect(matches("t:site y", (async () => new Response("no", { status: 429 })) as unknown as typeof fetch)).rejects.toThrow("429");
  });
  it("keeps only cards whose every element was chosen, None included", () => {
    const pool = [card("mono", "Ordinary", ["Fire"]), card("in", "Ordinary", ["Fire", "Air"]), card("out", "Ordinary", ["Fire", "Water"]), card("none", "Ordinary", ["None"])];
    expect(within(pool, ["Fire", "Air"]).map((c: Card) => c.name)).toEqual(["mono", "in", "none"]);
    expect(within(pool, []).map((c: Card) => c.name)).toEqual(["none"]);
  });
});

describe("the draw", () => {
  const pool = ["Ordinary", "Exceptional", "Elite", "Unique"].flatMap((r) => Array.from({ length: 10 }, (_, i) => card(`${r}${i}`, r))).concat(card("norarity", null));
  it("fills the part exactly, never above a rarity's copies, never the same card twice", () => {
    for (let seed = 0; seed < 20; seed++) {
      const random = cycle([0.99, 0.3, 0.7, 0.05, 0.5].map((v) => (v + seed / 40) % 1));
      const picks = draw(pool, 60, random);
      expect(total(picks)).toBe(60);
      for (const p of picks) {
        expect(p.copies).toBeGreaterThanOrEqual(1);
        expect(p.copies).toBeLessThanOrEqual(COPIES[p.card.rarity as keyof typeof COPIES] ?? 1);
      }
      expect(new Set(picks.map((p) => p.card.name)).size).toBe(picks.length);
    }
  });
  it("comes up short from a small pool rather than bending a rule", () => {
    expect(total(draw([card("a", "Unique"), card("b", "Elite")], ATLAS, () => 0.99))).toBe(3);
  });
  it("scales the split to what is left, whole cards, largest remainders first", () => {
    expect(fit(SPLIT, 60)).toEqual({ Minion: 30, Magic: 16, Artifact: 8, Aura: 6 });
    expect(fit(SPLIT, 47)).toEqual({ Minion: 23, Magic: 13, Artifact: 6, Aura: 5 });
    expect(fit({ Minion: 1, Magic: 1, Artifact: 1, Aura: 0 }, 10)).toEqual({ Minion: 4, Magic: 3, Artifact: 3, Aura: 0 });
    expect(fit({ Minion: 0, Magic: 0, Artifact: 0, Aura: 0 }, 10)).toEqual({ Minion: 0, Magic: 0, Artifact: 0, Aura: 0 });
  });
});

describe("the deal", () => {
  it("deals every part from its own query, sixty spells and thirty sites", async () => {
    const zones = await deal({ elements: ["Fire"], sets: ["001", "006"] }, api(), () => 0.5);
    expect(zones.map((z) => [z.part, z.size, total(z.picks)])).toEqual([["Avatar", 1, 1], ["Minion", 30, 30], ["Magic", 16, 16], ["Artifact", 8, 8], ["Aura", 6, 6], ["Site", 30, 30]]);
    expect(zones[1]!.q).toBe("t:minion (e:fire or e:none) s:001,006 is:booster");
  });
  it("with Toolbox adds a Collection of Ordinary spells, both inside the sixty, no card in two parts", async () => {
    const zones = await deal({ elements: ["Fire"], toolbox: 3, collection: 10 }, api(), () => 0.5);
    expect(zones.map((z) => [z.part, z.size, total(z.picks)])).toEqual([["Avatar", 1, 1], ["Toolbox", 3, 3], ["Collection", 10, 10], ["Minion", 23, 23], ["Magic", 13, 13], ["Artifact", 6, 6], ["Aura", 5, 5], ["Site", 30, 30]]);
    expect(zones[1]!.picks[0]!.card.name).toBe("Toolbox");
    expect(zones[2]!.q).toBe("cat:spell rarity:ordinary (e:fire or e:none)");
    const spells = zones.filter((z) => !["Avatar", "Site"].includes(z.part)).flatMap((z) => z.picks);
    expect(total(spells)).toBe(SPELLS);
    expect(new Set(spells.map((p) => p.card.name)).size).toBe(spells.length);   // Collection artifacts never repeat in the Artifact part
  });
  it("prints the list with each part's query, and the totals", () => {
    const zones = [
      { part: "Avatar", q: 't:avatar -!"Duplicator" -!"Magician"', pool: 32, size: 1, picks: [{ card: card("Sorcerer", null, ["None"], "Avatar"), copies: 1 }] },
      { part: "Minion", q: "t:minion (e:fire or e:none)", pool: 200, size: 3, picks: [{ card: card("Bear", "Elite"), copies: 2 }, { card: card("Ant", "Ordinary"), copies: 1 }] },
      { part: "Site", q: "t:site (e:fire or e:none)", pool: 100, size: 30, picks: [{ card: card("Cave", "Ordinary", ["Fire"], "Site"), copies: 4 }] },
    ];
    expect(formatDeck(zones)).toBe([
      'Avatar 1/1   # t:avatar -!"Duplicator" -!"Magician"  (32 cards)', "  1 Sorcerer", "",
      "Minion 3/3   # t:minion (e:fire or e:none)  (200 cards)", "  1 Ant", "  2 Bear", "",
      "Site 4/30   # t:site (e:fire or e:none)  (100 cards)", "  4 Cave", "",
      "Spells 3/60, sites 4/30",
    ].join("\n"));
  });
});
