/** The random deck generator against the deck-building rules. */
import { describe, expect, it } from "vitest";
import { ATLAS, COPIES, SPELLBOOK, count, deal, draw, fetchAll, formatDeck, poolQuery, withinElements } from "./random-deck.js";

type Card = { name: string; type: string; rarity: string | null; elements: string[]; image_urls: Record<string, string> | null; kairos_url: string };
const card = (name: string, rarity: string | null, elements: string[] = ["Fire"], type = "Minion"): Card =>
  ({ name, type, rarity, elements, image_urls: { small: `https://api.test/images/${name}.small.webp` }, kairos_url: `https://site.test/cards/${name}` });

/** A deterministic random: cycles through the given values. */
const cycle = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };

describe("the pool", () => {
  it("asks one query per zone in the search syntax", () => {
    expect(poolQuery("spellbook", ["Air", "Fire"])).toBe("cat:spell (e:air,fire or e:none)");
    expect(poolQuery("atlas", ["Water"])).toBe("t:site (e:water or e:none)");
    expect(poolQuery("spellbook", [])).toBe("cat:spell e:none");
    expect(poolQuery("avatar", ["Air"])).toBe('t:avatar -!"Duplicator" -!"Magician"');
  });
  it("fetches every page and stops when the API says there are no more", async () => {
    const asked: string[] = [];
    const fetchImpl = async (url: string) => {
      asked.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({ data: [card(`c${page}`, "Ordinary")], has_more: page < 3 }));
    };
    const cards = await fetchAll("t:site", fetchImpl as unknown as typeof fetch);
    expect(cards.map((c: Card) => c.name)).toEqual(["c1", "c2", "c3"]);
    expect(asked[0]).toBe("https://query.kairosarchive.net/cards?q=t%3Asite&page_size=200&page=1");
    await expect(fetchAll("t:site", (async () => new Response("no", { status: 429 })) as unknown as typeof fetch)).rejects.toThrow("429");
  });
  it("keeps only cards whose every element was chosen, None included", () => {
    const pool = [card("mono", "Ordinary", ["Fire"]), card("dual-in", "Ordinary", ["Fire", "Air"]), card("dual-out", "Ordinary", ["Fire", "Water"]), card("none", "Ordinary", ["None"])];
    expect(withinElements(pool, ["Fire", "Air"]).map((c: Card) => c.name)).toEqual(["mono", "dual-in", "none"]);
    expect(withinElements(pool, []).map((c: Card) => c.name)).toEqual(["none"]);
  });
});

describe("the draw", () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => card(`o${i}`, "Ordinary")),
    ...Array.from({ length: 10 }, (_, i) => card(`x${i}`, "Exceptional")),
    ...Array.from({ length: 10 }, (_, i) => card(`e${i}`, "Elite")),
    ...Array.from({ length: 10 }, (_, i) => card(`u${i}`, "Unique")),
    card("norarity", null),
  ];
  it("fills the zone exactly, never above a rarity's copies, never the same card twice", () => {
    for (let seed = 0; seed < 20; seed++) {
      const random = cycle([0.99, 0.3, 0.7, 0.05, 0.5].map((v) => (v + seed / 40) % 1));
      const picks = draw(pool, SPELLBOOK, random);
      expect(count(picks)).toBe(SPELLBOOK);
      for (const p of picks) {
        expect(p.copies).toBeGreaterThanOrEqual(1);
        expect(p.copies).toBeLessThanOrEqual(COPIES[p.card.rarity as keyof typeof COPIES] ?? 1);
      }
      expect(new Set(picks.map((p) => p.card.name)).size).toBe(picks.length);
    }
  });
  it("comes up short from a small pool rather than bending a rule", () => {
    const picks = draw([card("a", "Unique"), card("b", "Elite")], ATLAS, () => 0.99);
    expect(count(picks)).toBe(3);
    expect(picks.map((p) => [p.card.name, p.copies]).sort()).toEqual([["a", 1], ["b", 2]]);
  });
  it("deals a whole deck from loaded pools, avatar included", () => {
    const pools = { spells: pool, sites: pool.map((c) => ({ ...c, type: "Site" })), avatars: [card("Sorcerer", null, ["None"], "Avatar"), card("Witch", null, ["None"], "Avatar")] };
    const deck = deal(pools, ["Fire"], () => 0.5);
    expect(deck.avatar?.type).toBe("Avatar");
    expect(count(deck.spellbook)).toBe(SPELLBOOK);
    expect(count(deck.atlas)).toBe(ATLAS);
  });
});

describe("the list", () => {
  it("writes the avatar, then each zone by type, with counts", () => {
    const deck = {
      elements: ["Fire"],
      avatar: card("Sorcerer", null, ["None"], "Avatar"),
      spellbook: [{ card: card("Zap", "Ordinary", ["Fire"], "Magic"), copies: 4 }, { card: card("Bear", "Elite"), copies: 2 }, { card: card("Ant", "Ordinary"), copies: 1 }],
      atlas: [{ card: card("Cave", "Ordinary", ["Fire"], "Site"), copies: 3 }],
    };
    expect(formatDeck(deck)).toBe([
      "Avatar: Sorcerer", "",
      "Spellbook (7/60)", "  Magic", "    4 Zap", "  Minion", "    1 Ant", "    2 Bear", "",
      "Atlas (3/30)", "  Site", "    3 Cave",
    ].join("\n"));
  });
});
