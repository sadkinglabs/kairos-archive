/** A random Sorcery deck from the Kairos Archive query API.
 * Plain JavaScript, no library, no key. It runs in the browser on
 * /fun/random-deck; everything above the last section runs in Node too. */

// ── 0. The rules
export const QUERY = "https://query.kairosarchive.net";
export const COPIES = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };
export const SPELLBOOK = 60;
export const ATLAS = 30;
export const COLLECTION = 10;
/** How the spellbook splits by type; with Toolbox it should still add up to sixty. */
export const SPLIT = { Artifact: 8, Aura: 6, Magic: 16, Minion: 30 };

// ── 1. One search query per part of the deck
/** The same syntax as the search box: t:minion is a type, e:fire,water
 * "has Fire or Water", e:none a card with no element, s:001,006 printed
 * in either set, is:booster not a promo, -!"Name" drops that exact
 * card and !"Toolbox" is exactly that card. */
export function query(part, choice) {
  if (part === "Avatar") return 't:avatar -!"Duplicator" -!"Magician"';
  if (part === "Toolbox") return '!"Toolbox"';
  const type = part === "Collection" ? "cat:spell rarity:ordinary" : `t:${part.toLowerCase()}`;
  const elements = choice.elements.length ? `(e:${choice.elements.join(",").toLowerCase()} or e:none)` : "e:none";
  const sets = choice.sets.length ? ` s:${choice.sets.join(",")} is:booster` : "";
  const noToolbox = part === "Artifact" && choice.toolbox ? ' -!"Toolbox"' : "";
  return `${type} ${elements}${sets}${noToolbox}`;
}

// ── 2. Every card the query matches
const cache = new Map();
export async function matches(q) {
  if (cache.has(q)) return cache.get(q);
  const cards = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${QUERY}/cards?q=${encodeURIComponent(q)}&page_size=200&page=${page}`);
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
export function within(cards, elements) {
  return cards.filter((card) => card.elements.every((e) => e === "None" || elements.includes(e)));
}

// ── 4. Draw to the copy rules
export function draw(pool, size) {
  const picks = [];
  let total = 0;
  for (const card of [...pool].sort(() => Math.random() - 0.5)) {
    if (total >= size) break;
    const most = Math.min(COPIES[card.rarity] || 1, size - total);
    const copies = 1 + Math.floor(Math.random() * most);
    picks.push({ card, copies });
    total += copies;
  }
  return picks;
}

// ── 5. A deck: one query per part, in the order the list shows
export async function deal(choice) {
  const parts = { Avatar: 1, ...choice.split, Toolbox: choice.toolbox, Site: ATLAS, Collection: choice.toolbox ? COLLECTION : 0 };
  const deck = [];
  const named = new Set();
  for (const part in parts) {
    if (!parts[part]) continue;
    const q = query(part, choice);
    let pool = within(await matches(q), choice.elements);
    if (part === "Collection") pool = pool.filter((card) => !named.has(card.name));   // copies count across the whole deck
    const picks = part === "Toolbox" ? pool.slice(0, 1).map((card) => ({ card, copies: parts[part] })) : draw(pool, parts[part]);
    for (const pick of picks) named.add(pick.card.name);
    deck.push({ part, q, pool: pool.length, size: parts[part], picks });
  }
  return deck;
}

// ── 6. The list, with the query each part came from
export function formatDeck(deck) {
  const lines = [];
  let total = 0;
  for (const z of deck) {
    const have = z.picks.reduce((n, p) => n + p.copies, 0);
    total += have;
    lines.push(`${z.part} ${have}/${z.size}   # ${z.q}  (${z.pool} cards)`);
    for (const p of z.picks.sort((a, b) => a.card.name.localeCompare(b.card.name))) lines.push(`  ${p.copies} ${p.card.name}`);
    lines.push("");
  }
  lines.push(`${total} cards in all`);
  return lines.join("\n");
}

// ── 7. The form on the page
if (typeof document !== "undefined" && document.getElementById("deck-form")) {
  const form = document.getElementById("deck-form");
  const out = document.getElementById("deck");
  const total = document.getElementById("deck-total");
  const read = () => {
    const data = new FormData(form);
    const choice = { elements: data.getAll("element"), sets: data.getAll("set"), toolbox: Number(data.get("toolbox")), split: {} };
    for (const type in SPLIT) choice.split[type] = Number(data.get(type)) || 0;
    return choice;
  };
  // The spellbook count, as it is typed: red past sixty, and no deal until it is fixed.
  const count = () => {
    const choice = read();
    const spells = Object.values(choice.split).reduce((a, b) => a + b, 0) + choice.toolbox;
    total.textContent = `${spells} / ${SPELLBOOK} spells`;
    total.classList.toggle("over", spells > SPELLBOOK);
    form.querySelector("button").disabled = spells > SPELLBOOK;
  };
  form.addEventListener("input", count);
  count();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    out.textContent = "Asking the query API…";
    try {
      out.textContent = formatDeck(await deal(read()));
    } catch (err) {
      out.textContent = err.message;
    }
  });
}
