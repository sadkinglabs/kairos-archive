/** A random deck from the Kairos Archive query API, drawn in the browser.
 *
 * Everything this knows about cards comes from query.kairosarchive.net,
 * and every picture from the image CDN on api.kairosarchive.net. No key,
 * no build step, no library. The page at /fun/random-deck shows this
 * file step by step; the tests in randomDeck.test.ts hold it to the
 * deck-building rules. */

// ── 0. The rules
export const QUERY = "https://query.kairosarchive.net";
export const ELEMENTS = ["Air", "Earth", "Fire", "Water"];
/** How many copies of one card a deck may hold, by rarity. */
export const COPIES = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };
export const SPELLBOOK = 60;
export const ATLAS = 30;
/** Avatars a random deck should not hand you. */
export const BANNED_AVATARS = ["Duplicator", "Magician"];

// ── 1. Ask for the pool
/** One query per zone, in the site's search syntax. `cat:spell` is every
 * spell (minions, magics, auras, artifacts); `t:site` every site;
 * `e:air,fire` is "has Air or Fire"; `e:none` a card with no element;
 * `-!"Duplicator"` drops that exact name. */
export function poolQuery(zone, elements) {
  const e = elements.length ? `(e:${elements.map((x) => x.toLowerCase()).join(",")} or e:none)` : "e:none";
  if (zone === "spellbook") return `cat:spell ${e}`;
  if (zone === "atlas") return `t:site ${e}`;
  return `t:avatar ${BANNED_AVATARS.map((name) => `-!"${name}"`).join(" ")}`;
}

// ── 2. Fetch every page
/** The API answers up to 200 cards a page and says whether there are more. */
export async function fetchAll(q, fetchImpl = fetch) {
  const cards = [];
  for (let page = 1; ; page += 1) {
    const url = `${QUERY}/cards?q=${encodeURIComponent(q)}&page_size=200&page=${page}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`The query API answered ${res.status} for "${q}".`);
    const body = await res.json();
    cards.push(...body.data);
    if (!body.has_more) return cards;
  }
}

// ── 3. Keep the elements honest
/** `e:air,fire` also admits an Air+Water card, because it has Air. Keep a
 * card only when every element it has was chosen; "None" is always fine. */
export function withinElements(cards, elements) {
  return cards.filter((card) => card.elements.every((x) => x === "None" || elements.includes(x)));
}

// ── 4. Draw
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Walk the shuffled pool taking a random number of copies of each card,
 * never more than its rarity allows, until the zone is full. A small
 * pool gives a short zone rather than a bent rule. */
export function draw(pool, size, random = Math.random) {
  const picks = [];
  let total = 0;
  for (const card of shuffle(pool, random)) {
    if (total >= size) break;
    const allowed = COPIES[card.rarity] ?? 1;
    const copies = Math.min(allowed, size - total, 1 + Math.floor(random() * allowed));
    picks.push({ card, copies });
    total += copies;
  }
  return picks;
}

// ── 5. A deck
/** The three pools for a choice of elements: three requests, once. */
export async function loadPools(elements, fetchImpl = fetch) {
  const [spells, sites, avatars] = await Promise.all(
    ["spellbook", "atlas", "avatar"].map((zone) => fetchAll(poolQuery(zone, elements), fetchImpl)),
  );
  return { spells: withinElements(spells, elements), sites: withinElements(sites, elements), avatars };
}

/** A deck from pools already loaded: no request at all, so shuffling
 * again is free. */
export function deal(pools, elements, random = Math.random) {
  return {
    elements,
    avatar: shuffle(pools.avatars, random)[0] ?? null,
    spellbook: draw(pools.spells, SPELLBOOK, random),
    atlas: draw(pools.sites, ATLAS, random),
  };
}

// ── 6. Write it down
export const count = (picks) => picks.reduce((n, p) => n + p.copies, 0);

/** The deck as text: avatar, then each zone grouped by card type. */
export function formatDeck(deck) {
  const lines = [`Avatar: ${deck.avatar ? deck.avatar.name : "none"}`, ""];
  for (const [title, picks, size] of [["Spellbook", deck.spellbook, SPELLBOOK], ["Atlas", deck.atlas, ATLAS]]) {
    lines.push(`${title} (${count(picks)}/${size})`);
    const byType = new Map();
    for (const p of picks) byType.set(p.card.type, [...(byType.get(p.card.type) ?? []), p]);
    for (const [type, group] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${type}`);
      for (const p of group.sort((a, b) => a.card.name.localeCompare(b.card.name))) lines.push(`    ${p.copies} ${p.card.name}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ── 7. Show it
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A tile per card: its default printing's small image from the CDN,
 * linked to its page. Images are © Erik's Curiosa; the archive serves
 * them with credit, and so should anything built on it. */
function tile(card, copies) {
  const img = card.image_urls
    ? `<img class="card-img" src="${esc(card.image_urls.small)}" alt="${esc(card.name)}" loading="lazy" width="146" height="204">`
    : `<div class="placeholder">${esc(card.name)}</div>`;
  return `<a class="tile" href="${esc(card.kairos_url)}">${img}<div class="name">${copies > 1 ? `${copies} × ` : ""}${esc(card.name)}</div><div class="sub">${esc(card.type)} · ${esc(card.rarity ?? "")}</div></a>`;
}

export function render(out, deck) {
  const zone = (title, picks, size) => `<h3>${title} <span class="muted">${count(picks)}/${size}</span></h3><div class="grid">${picks.map((p) => tile(p.card, p.copies)).join("")}</div>`;
  out.innerHTML = `
    <div class="deck-text"><div class="section-heading"><span class="source-note">The list</span><button class="copy" type="button">Copy</button></div><pre class="rules">${esc(formatDeck(deck))}</pre></div>
    <h3>Avatar</h3><div class="grid">${deck.avatar ? tile(deck.avatar, 1) : "<p class=\"muted\">No avatar found.</p>"}</div>
    ${zone("Spellbook", deck.spellbook, SPELLBOOK)}
    ${zone("Atlas", deck.atlas, ATLAS)}`;
  out.querySelector("button.copy")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    navigator.clipboard.writeText(formatDeck(deck)).then(() => { button.textContent = "Copied"; setTimeout(() => { button.textContent = "Copy"; }, 1500); });
  });
}

/** The form on /fun/random-deck: chosen elements in the URL so a choice
 * can be shared, pools fetched once per choice, a new deal on every click. */
function main() {
  const form = document.getElementById("deck-form");
  if (!(form instanceof HTMLFormElement)) return;
  const status = document.getElementById("deck-status");
  const out = document.getElementById("deck");
  const boxes = [...form.querySelectorAll('input[name="element"]')];
  let pools = null;
  let loadedFor = "";
  const chosen = () => boxes.filter((b) => b.checked).map((b) => b.value);
  async function run() {
    const elements = chosen();
    const key = elements.join("+");
    history.replaceState(null, "", elements.length ? `?e=${elements.map((x) => x.toLowerCase()).join(",")}` : location.pathname);
    try {
      if (key !== loadedFor) {
        status.textContent = "Asking the query API…";
        pools = await loadPools(elements);
        loadedFor = key;
      }
      status.textContent = `${pools.spells.length} spells, ${pools.sites.length} sites and ${pools.avatars.length} avatars to draw from.`;
      render(out, deal(pools, elements));
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); void run(); });
  const fromUrl = (new URLSearchParams(location.search).get("e") ?? "").split(",").filter(Boolean);
  if (fromUrl.length) {
    for (const box of boxes) box.checked = fromUrl.includes(box.value.toLowerCase());
    void run();
  }
}

if (typeof document !== "undefined") main();
