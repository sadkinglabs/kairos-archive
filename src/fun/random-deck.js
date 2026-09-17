/** A random Sorcery deck from the Kairos Archive query API.
 * Plain JavaScript, no library, no key. It runs in the browser on
 * /fun/random-deck; everything above the last section runs in Node too. */

// ── 0. The rules
export const QUERY = "https://query.kairosarchive.net";
export const COPIES = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };
export const ATLAS = 30;
/** Sixty spells, split by type; the form lets you change the split. */
export const SPELLBOOK = { Minion: 30, Magic: 16, Artifact: 8, Aura: 6 };
export const BANNED_AVATARS = ["Duplicator", "Magician"];

// ── 1. One search query per card type
/** The same syntax as the search box: t:minion is a type, e:fire,water
 * means "has Fire or Water", e:none a card with no element, -!"Name"
 * drops that exact card. Paste any of these into the site's search. */
export function query(type, elements) {
  if (type === "Avatar") return `t:avatar ${BANNED_AVATARS.map((n) => `-!"${n}"`).join(" ")}`;
  const e = elements.length ? `(e:${elements.join(",").toLowerCase()} or e:none)` : "e:none";
  return `t:${type.toLowerCase()} ${e}`;
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

// ── 5. A deck: one query per type, drawn to its size
export async function deal(elements, spellbook = SPELLBOOK, fetchImpl = fetch, random = Math.random) {
  const sizes = { Avatar: 1, ...spellbook, Site: ATLAS };
  const zones = [];
  for (const [type, size] of Object.entries(sizes)) {
    const q = query(type, elements);
    const pool = within(await matches(q, fetchImpl), elements);
    zones.push({ type, q, pool: pool.length, size, picks: draw(pool, size, random) });
  }
  return zones;
}

// ── 6. The list, with the query each part came from
export function formatDeck(zones) {
  const lines = [];
  for (const z of zones) {
    const have = z.picks.reduce((n, p) => n + p.copies, 0);
    lines.push(`${z.type} ${have}/${z.size}   # ${z.q}  (${z.pool} cards)`);
    for (const p of z.picks.sort((a, b) => a.card.name.localeCompare(b.card.name))) lines.push(`  ${p.copies} ${p.card.name}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ── 7. The form on the page
if (typeof document !== "undefined" && document.getElementById("deck-form")) {
  const form = document.getElementById("deck-form");
  const out = document.getElementById("deck");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const elements = data.getAll("element");
    const spellbook = Object.fromEntries(Object.keys(SPELLBOOK).map((t) => [t, Number(data.get(t)) || 0]));
    out.textContent = "Asking the query API…";
    try {
      out.textContent = formatDeck(await deal(elements, spellbook));
    } catch (err) {
      out.textContent = err.message;
    }
  });
}
