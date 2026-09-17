/** The form on /fun/random-deck. Implementation detail, not part of the
 * tutorial: it reads the boxes, keeps the spellbook count up to date,
 * calls makeDeck and prints the result as a list. */
import { QUERY, makeDeck } from "./random-deck.js";

export const SPELLBOOK = 60;

/** The query API allows sixty requests a minute from one address and a
 * deal is about eight, so this page remembers every good answer it
 * gets and hands it back for the same address next time. The tutorial
 * code asks with plain fetch and never knows; only this page wraps it. */
export function rememberQueryAnswers(realFetch) {
  const answers = new Map();
  return async function (url, options) {
    const address = String(url);
    if (!address.startsWith(QUERY)) return realFetch(url, options);
    if (!answers.has(address)) {
      const response = await realFetch(url, options);
      if (!response.ok) return response;
      answers.set(address, { status: response.status, text: await response.text() });
    }
    const saved = answers.get(address);
    return new Response(saved.text, { status: saved.status, headers: { "content-type": "application/json" } });
  };
}
export const TYPES = ["Artifact", "Aura", "Magic", "Minion"];

/** The deck as text: each part with its count, its query and how many
 * cards the query matched, then its cards by name, then the total. */
export function formatDeck(deck) {
  let lines = [];
  let total = 0;
  for (const section of deck) {
    let have = 0;
    for (const pick of section.cards) have += pick.copies;
    total += have;
    lines.push(`${section.part} ${have}/${section.size}   # ${section.query}  (${section.matched} cards)`);
    const byName = section.cards.slice().sort((a, b) => a.card.name.localeCompare(b.card.name));
    for (const pick of byName) lines.push(`  ${pick.copies} ${pick.card.name}`);
    lines.push("");
  }
  lines.push(`${total} cards in all`);
  return lines.join("\n");
}

if (typeof document !== "undefined" && document.getElementById("deck-form")) {
  window.fetch = rememberQueryAnswers(window.fetch.bind(window));
  const form = document.getElementById("deck-form");
  const out = document.getElementById("deck");
  const totalLine = document.getElementById("deck-total");
  const button = form.querySelector("button");

  function readChoice() {
    const data = new FormData(form);
    const choice = { elements: data.getAll("element"), sets: data.getAll("set"), toolbox: Number(data.get("toolbox")), split: {} };
    for (const type of TYPES) choice.split[type] = Number(data.get(type)) || 0;
    return choice;
  }

  // The spellbook count as it is typed: red past sixty, and no deal until it is fixed.
  function count() {
    const choice = readChoice();
    let spells = choice.toolbox;
    for (const type of TYPES) spells += choice.split[type];
    totalLine.textContent = `${spells} / ${SPELLBOOK} spells`;
    totalLine.classList.toggle("over", spells > SPELLBOOK);
    button.disabled = spells > SPELLBOOK;
  }
  form.addEventListener("input", count);
  count();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    out.textContent = "Asking the query API…";
    try {
      out.textContent = formatDeck(await makeDeck(readChoice()));
    } catch (err) {
      out.textContent = err.message;
    }
  });
}
