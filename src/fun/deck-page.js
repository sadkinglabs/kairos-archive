/** The form on /fun/random-deck. Implementation detail, not part of the
 * tutorial: it reads the boxes, keeps the spellbook count up to date,
 * calls makeDeck and prints the result as a list. */
import { QUERY, makeDeck } from "./random-deck.js";
import { rememberQueryAnswers } from "./remember.js";

export const SPELLBOOK = 60;
export const TYPES = ["Artifact", "Aura", "Magic", "Minion"];

/** The spellbook count for a choice: the four types plus Toolbox. */
export function spellCount(choice) {
  let spells = choice.toolbox;
  for (const type of TYPES) spells += choice.split[type];
  return spells;
}

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
  window.fetch = rememberQueryAnswers(window.fetch.bind(window), QUERY);
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

  // The spellbook count as it is typed: red past sixty, amber under it,
  // and the button only works at exactly sixty.
  function count() {
    const spells = spellCount(readChoice());
    totalLine.textContent = `${spells} / ${SPELLBOOK} spells`;
    totalLine.classList.toggle("over", spells > SPELLBOOK);
    totalLine.classList.toggle("short", spells < SPELLBOOK);
    button.disabled = spells !== SPELLBOOK;
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
