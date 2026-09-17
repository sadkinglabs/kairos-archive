/** The random deck generator against the deck-building rules. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ATLAS, COLLECTION, COPIES, SPELLBOOK, SPLIT, deal, draw, formatDeck, matches, query, within } from "./random-deck.js";

type Card = { name: string; type: string; rarity: string | null; elements: string[] };
const card = (name: string, rarity: string | null, elements: string[] = ["Fire"], type = "Minion"): Card => ({ name, type, rarity, elements });
const total = (picks: { copies: number }[]) => picks.reduce((n, p) => n + p.copies, 0);
const choice = (over: Record<string, unknown> = {}) => ({ elements: ["Fire"], sets: [] as string[], toolbox: 0, split: { ...SPLIT }, ...over });

/** A query API that answers each part from its own little pool: forty
 * Ordinary cards of the type asked for, Toolbox by name, avatars. */
function fakeApi() {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const q = new URL(url).searchParams.get("q")!;
    asked.push(q);
    const part = q.startsWith('!"Toolbox"') ? "Toolbox" : q.startsWith("t:avatar") ? "Avatar" : q.startsWith("cat:spell") ? "Collection" : q.split(" ")[0]!.slice(2);
    const data = part === "Toolbox" ? [card("Toolbox", "Exceptional", ["None"], "Artifact")]
      : part === "Collection" ? Array.from({ length: 40 }, (_, i) => card(`artifact${i}`, "Ordinary", ["Fire"], "Artifact"))   // the same names the Artifact part draws from
      : Array.from({ length: 40 }, (_, i) => card(`${part}${i}`, "Ordinary", ["Fire"], part));
    return new Response(JSON.stringify({ data, has_more: false }));
  });
  return asked;
}
afterEach(() => vi.unstubAllGlobals());

describe("the query", () => {
  it("is one search query per part, in the site's syntax", () => {
    expect(query("Minion", choice({ elements: ["Air", "Fire"] }))).toBe("t:minion (e:air,fire or e:none)");
    expect(query("Site", choice({ elements: ["Water"], sets: ["001", "006"] }))).toBe("t:site (e:water or e:none) s:001,006 is:booster");
    expect(query("Magic", choice({ elements: [], sets: ["002"] }))).toBe("t:magic e:none s:002 is:booster");
    expect(query("Collection", choice({ sets: ["006"] }))).toBe("cat:spell rarity:ordinary (e:fire or e:none) s:006 is:booster");
    expect(query("Artifact", choice({ toolbox: 2 }))).toBe('t:artifact (e:fire or e:none) -!"Toolbox"');
    expect(query("Toolbox", choice())).toBe('!"Toolbox"');
    expect(query("Avatar", choice())).toBe('t:avatar -!"Duplicator" -!"Magician"');
  });
  it("fetches every page, stops when the API says so, and remembers the answer", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({ data: [card(`c${page}`, "Ordinary")], has_more: page < 3 }));
    });
    expect((await matches("t:site x")).map((c: Card) => c.name)).toEqual(["c1", "c2", "c3"]);
    expect(asked[0]).toBe("https://query.kairosarchive.net/cards?q=t%3Asite%20x&page_size=200&page=1");
    await matches("t:site x");
    expect(asked).toHaveLength(3);
    vi.stubGlobal("fetch", async () => new Response("no", { status: 429 }));
    await expect(matches("t:site y")).rejects.toThrow("429");
  });
  it("keeps only cards whose every element was chosen, None included", () => {
    const pool = [card("mono", "Ordinary", ["Fire"]), card("in", "Ordinary", ["Fire", "Air"]), card("out", "Ordinary", ["Fire", "Water"]), card("none", "Ordinary", ["None"])];
    expect(within(pool, ["Fire", "Air"]).map((c: Card) => c.name)).toEqual(["mono", "in", "none"]);
    expect(within(pool, []).map((c: Card) => c.name)).toEqual(["none"]);
  });
});

describe("the draw", () => {
  // Big enough that one copy of everything still passes sixty, since the draw is random.
  const pool = ["Ordinary", "Exceptional", "Elite", "Unique"].flatMap((r) => Array.from({ length: 30 }, (_, i) => card(`${r}${i}`, r))).concat(card("norarity", null));
  it("fills the part exactly, never above a rarity's copies, never the same card twice", () => {
    for (let run = 0; run < 50; run++) {
      const picks = draw(pool, 60);
      expect(total(picks)).toBe(60);
      for (const p of picks) {
        expect(p.copies).toBeGreaterThanOrEqual(1);
        expect(p.copies).toBeLessThanOrEqual(COPIES[p.card.rarity as keyof typeof COPIES] ?? 1);
      }
      expect(new Set(picks.map((p) => p.card.name)).size).toBe(picks.length);
    }
  });
  it("comes up short from a small pool rather than bending a rule", () => {
    expect(total(draw([card("a", "Unique"), card("b", "Elite")], ATLAS))).toBeLessThanOrEqual(3);
  });
});

describe("the deal", () => {
  it("is avatar, spellbook by type in alphabetical order, atlas: ninety-one cards", async () => {
    fakeApi();
    const deck = await deal(choice({ sets: ["001", "006"] }));
    expect(deck.map((z) => [z.part, z.size, total(z.picks)])).toEqual([["Avatar", 1, 1], ["Artifact", 8, 8], ["Aura", 6, 6], ["Magic", 16, 16], ["Minion", 30, 30], ["Site", 30, 30]]);
    expect(deck[1]!.q).toBe("t:artifact (e:fire or e:none) s:001,006 is:booster");
    expect(formatDeck(deck)).toContain("91 cards in all");
    expect(Object.values(SPLIT).reduce((a, b) => a + b, 0)).toBe(SPELLBOOK);
  });
  it("with Toolbox: Toolbox inside the sixty, the Collection after the atlas, 101 cards, no card in two parts", async () => {
    const asked = fakeApi();
    const deck = await deal(choice({ toolbox: 3, split: { Artifact: 8, Aura: 6, Magic: 16, Minion: 27 } }));
    expect(deck.map((z) => [z.part, z.size, total(z.picks)])).toEqual([["Avatar", 1, 1], ["Artifact", 8, 8], ["Aura", 6, 6], ["Magic", 16, 16], ["Minion", 27, 27], ["Toolbox", 3, 3], ["Site", 30, 30], ["Collection", 10, 10]]);
    expect(asked).toContain('t:artifact (e:fire or e:none) -!"Toolbox"');
    const names: string[] = deck.flatMap((z) => z.picks.map((p: { card: Card }) => p.card.name));
    expect(new Set(names).size).toBe(names.length);
    expect(formatDeck(deck)).toContain(`${1 + SPELLBOOK + ATLAS + COLLECTION} cards in all`);
  });
  it("prints each part with its query and count, cards by name, and the total", () => {
    const deck = [
      { part: "Avatar", q: 't:avatar -!"Duplicator" -!"Magician"', pool: 32, size: 1, picks: [{ card: card("Sorcerer", null, ["None"], "Avatar"), copies: 1 }] },
      { part: "Minion", q: "t:minion (e:fire or e:none)", pool: 200, size: 3, picks: [{ card: card("Bear", "Elite"), copies: 2 }, { card: card("Ant", "Ordinary"), copies: 1 }] },
    ];
    expect(formatDeck(deck)).toBe([
      'Avatar 1/1   # t:avatar -!"Duplicator" -!"Magician"  (32 cards)', "  1 Sorcerer", "",
      "Minion 3/3   # t:minion (e:fire or e:none)  (200 cards)", "  1 Ant", "  2 Bear", "",
      "4 cards in all",
    ].join("\n"));
  });
});
