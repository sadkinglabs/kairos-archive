/** The random deck generator against the deck-building rules. */
import { describe, expect, it } from "vitest";
import { ATLAS, COPIES, SPELLBOOK, deal, draw, formatDeck, matches, query, within } from "./random-deck.js";

type Card = { name: string; type: string; rarity: string | null; elements: string[] };
const card = (name: string, rarity: string | null, elements: string[] = ["Fire"], type = "Minion"): Card => ({ name, type, rarity, elements });
const cycle = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
const total = (picks: { copies: number }[]) => picks.reduce((n, p) => n + p.copies, 0);

describe("the query", () => {
  it("is one search query per type, in the site's syntax", () => {
    expect(query("Minion", ["Air", "Fire"])).toBe("t:minion (e:air,fire or e:none)");
    expect(query("Site", ["Water"])).toBe("t:site (e:water or e:none)");
    expect(query("Magic", [])).toBe("t:magic e:none");
    expect(query("Avatar", ["Air"])).toBe('t:avatar -!"Duplicator" -!"Magician"');
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
  it("fills the zone exactly, never above a rarity's copies, never the same card twice", () => {
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
    const picks = draw([card("a", "Unique"), card("b", "Elite")], ATLAS, () => 0.99);
    expect(total(picks)).toBe(3);
  });
  it("deals every zone from its own query, to the split asked for", async () => {
    const fetchImpl = (async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      const type = q.startsWith("t:avatar") ? "Avatar" : q.split(" ")[0]!.slice(2).replace(/^./, (c) => c.toUpperCase());
      return new Response(JSON.stringify({ data: Array.from({ length: 40 }, (_, i) => card(`${type}${i}`, "Ordinary", ["Fire"], type)), has_more: false }));
    }) as unknown as typeof fetch;
    const zones = await deal(["Fire"], { Minion: 40, Magic: 20, Artifact: 0, Aura: 0 }, fetchImpl, () => 0.5);
    expect(zones.map((z) => [z.type, z.size, total(z.picks)])).toEqual([["Avatar", 1, 1], ["Minion", 40, 40], ["Magic", 20, 20], ["Artifact", 0, 0], ["Aura", 0, 0], ["Site", 30, 30]]);
    expect(zones[1]!.q).toBe("t:minion (e:fire or e:none)");
    expect(Object.values(SPELLBOOK).reduce((a, b) => a + b, 0)).toBe(60);
  });
});

describe("the list", () => {
  it("writes each zone with its query and count, cards by name", () => {
    const zones = [
      { type: "Avatar", q: 't:avatar -!"Duplicator" -!"Magician"', pool: 32, size: 1, picks: [{ card: card("Sorcerer", null, ["None"], "Avatar"), copies: 1 }] },
      { type: "Minion", q: "t:minion (e:fire or e:none)", pool: 200, size: 3, picks: [{ card: card("Bear", "Elite"), copies: 2 }, { card: card("Ant", "Ordinary"), copies: 1 }] },
    ];
    expect(formatDeck(zones)).toBe([
      'Avatar 1/1   # t:avatar -!"Duplicator" -!"Magician"  (32 cards)', "  1 Sorcerer", "",
      "Minion 3/3   # t:minion (e:fire or e:none)  (200 cards)", "  1 Ant", "  2 Bear",
    ].join("\n"));
  });
});
