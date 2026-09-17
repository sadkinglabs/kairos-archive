/** A random Sorcery deck from the Kairos Archive query API.
 * Plain JavaScript, no library, no key. It runs in the browser on
 * /fun/random-deck; everything above the last section runs in Node too. */

// ── 0. The rules
export const QUERY = "https://query.kairosarchive.net";
export const COPIES = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };
export const SPELLS = 60;
export const ATLAS = 30;
/** How the spellbook splits by type; the numbers are proportions. */
export const SPLIT = { Minion: 30, Magic: 16, Artifact: 8, Aura: 6 };
export const BANNED_AVATARS = ["Duplicator", "Magician"];
/** Toolbox casts Ordinary spells from your collection: up to three
 * copies, and with any at all a Collection of up to ten Ordinary
 * spells. Both count toward the sixty. */
export const TOOLBOX_MAX = 3;
export const COLLECTION_MAX = 10;

// ── 1. One search query per part of the deck
/** The same syntax as the search box: t:minion is a type, e:fire,water
 * "has Fire or Water", e:none a card with no element, s:001,006 a card
 * printed in either set, is:booster not a promo, -!"Name" drops that
 * exact card and !"Toolbox" is exactly that card. */
export function query(part, elements, sets) {
  if (part === "Avatar") return `t:avatar ${BANNED_AVATARS.map((n) => `-!"${n}"`).join(" ")}`;
  if (part === "Toolbox") return '!"Toolbox"';
  const what = part === "Collection" ? "cat:spell rarity:ordinary" : `t:${part.toLowerCase()}`;
  const e = elements.length ? `(e:${elements.join(",").toLowerCase()} or e:none)` : "e:none";
  const s = sets.length ? ` s:${sets.join(",")} is:booster` : "";
  return `${what} ${e}${s}`;
}

// ── 2. Every card the query matches
const cache = new Map();
export async function matches(q, fetchImpl = fetch) {
  if (cache.has(q)) return cache.get(q);
  const cards = [];
  for (let page = 1; ; page += 1) {
    const res = await fetchImpl(`${QUERY}/cards?q=${encodeURIComponent(q)}&page_size=200&page=${page}`);
    if (!res.ok) throw new Error(`The query API answered ${res.status} for "${q}".`);
    const body = await res.json();
    cards.push(...body.data);
    if (!body.has_more) break;
  }
  cache.set(q, cards);
  return cards;
}

// ── 3. Only the chosen elements
/** e:fire,water also admits a Fire+Air card. Keep a card only when every
 * element it has was chosen; "None" always passes. */
export const within = (cards, elements) => cards.filter((c) => c.elements.every((x) => x === "None" || elements.includes(x)));

// ── 4. Draw to the copy rules
export function draw(pool, size, random = Math.random) {
  const deck = [];
  let total = 0;
  const shuffled = pool.map((c) => [random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  for (const card of shuffled) {
    if (total >= size) break;
    const copies = Math.min(COPIES[card.rarity] ?? 1, size - total, 1 + Math.floor(random() * (COPIES[card.rarity] ?? 1)));
    deck.push({ card, copies });
    total += copies;
  }
  return deck;
}

// ── 5. The sizes: proportions scaled to what is left of the sixty
export function fit(split, total) {
  const sum = Object.values(split).reduce((a, b) => a + b, 0);
  if (!sum) return Object.fromEntries(Object.keys(split).map((type) => [type, 0]));
  const exact = Object.entries(split).map(([type, n]) => [type, (n * total) / sum]);
  const sizes = Object.fromEntries(exact.map(([type, x]) => [type, Math.floor(x)]));
  let left = total - Object.values(sizes).reduce((a, b) => a + b, 0);
  for (const [type] of exact.sort((a, b) => (b[1] % 1) - (a[1] % 1))) if (left-- > 0) sizes[type] += 1;
  return sizes;
}

// ── 6. A deck: one query per part, drawn to its size, no card in two parts
export async function deal({ elements, sets = [], split = SPLIT, toolbox = 0, collection = COLLECTION_MAX }, fetchImpl = fetch, random = Math.random) {
  const extras = toolbox ? { Toolbox: toolbox, Collection: collection } : {};
  const sizes = { Avatar: 1, ...extras, ...fit(split, SPELLS - toolbox - (toolbox ? collection : 0)), Site: ATLAS };
  const zones = [];
  const taken = new Set();
  for (const [part, size] of Object.entries(sizes)) {
    const q = query(part, elements, sets);
    const pool = within(await matches(q, fetchImpl), elements).filter((c) => !taken.has(c.name));
    // Toolbox is asked for by the copy; everything else is drawn.
    const picks = part === "Toolbox" ? pool.slice(0, 1).map((card) => ({ card, copies: size })) : draw(pool, size, random);
    for (const p of picks) taken.add(p.card.name);
    zones.push({ part, q, pool: pool.length, size, picks });
  }
  return zones;
}

// ── 7. The list, with the query each part came from
export function formatDeck(zones) {
  const lines = [];
  let spells = 0;
  for (const z of zones) {
    const have = z.picks.reduce((n, p) => n + p.copies, 0);
    if (z.part !== "Avatar" && z.part !== "Site") spells += have;
    lines.push(`${z.part} ${have}/${z.size}   # ${z.q}  (${z.pool} cards)`);
    for (const p of z.picks.sort((a, b) => a.card.name.localeCompare(b.card.name))) lines.push(`  ${p.copies} ${p.card.name}`);
    lines.push("");
  }
  lines.push(`Spells ${spells}/${SPELLS}, sites ${zones.find((z) => z.part === "Site")?.picks.reduce((n, p) => n + p.copies, 0) ?? 0}/${ATLAS}`);
  return lines.join("\n");
}

// ── 8. The form on the page
if (typeof document !== "undefined" && document.getElementById("deck-form")) {
  const form = document.getElementById("deck-form");
  const out = document.getElementById("deck");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const number = (name, max) => Math.max(0, Math.min(max, Number(data.get(name)) || 0));
    const choice = {
      elements: data.getAll("element"),
      sets: data.getAll("set"),
      split: Object.fromEntries(Object.keys(SPLIT).map((t) => [t, number(t, SPELLS)])),
      toolbox: number("toolbox", TOOLBOX_MAX),
      collection: number("collection", COLLECTION_MAX),
    };
    out.textContent = "Asking the query API…";
    try {
      out.textContent = formatDeck(await deal(choice));
    } catch (err) {
      out.textContent = err.message;
    }
  });
}
