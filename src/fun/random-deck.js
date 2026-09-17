// Build a random Sorcery deck with the Kairos Archive query API.
// Plain JavaScript: no key, no library. The page /fun/random-deck
// walks through this file section by section.

// ── 1. Describe the deck
export const QUERY = "https://query.kairosarchive.net";

// How many copies of one card a deck may hold, by rarity.
export const COPIES = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };

export const ATLAS = 30;       // sites in the atlas
export const COLLECTION = 10;  // Ordinary spells for Toolbox to cast from

// The spellbook is 60 spells, split by type. A choice looks like this:
//   { elements: ["Fire", "Water"], sets: ["001", "006"], toolbox: 3,
//     split: { Artifact: 8, Aura: 6, Magic: 16, Minion: 27 } }

// ── 2. Turn those choices into a Kairos query
// The syntax is the same one the search box on kairosarchive.net takes:
//   t:minion         every minion (t:site, t:avatar, ...)
//   e:fire,water     has Fire or Water; e:none has no element at all
//   s:001,006        printed in Alpha or Gothic; is:booster skips promos
//   !"Toolbox"       exactly that card; -!"Toolbox" leaves it out
export function makeQuery(part, choice) {
  if (part === "Avatar") {
    return 't:avatar -!"Duplicator" -!"Magician"';
  }
  if (part === "Toolbox") {
    return '!"Toolbox"';
  }

  let query = "t:" + part.toLowerCase();
  if (part === "Collection") {
    query = "cat:spell rarity:ordinary";
  }

  if (choice.elements.length > 0) {
    query += " (e:" + choice.elements.join(",").toLowerCase() + " or e:none)";
  } else {
    query += " e:none";
  }

  if (choice.sets.length > 0) {
    query += " s:" + choice.sets.join(",") + " is:booster";
  }

  if (part === "Artifact" && choice.toolbox > 0) {
    query += ' -!"Toolbox"';  // Toolbox is its own part of the deck
  }

  return query;
}

// ── 3. Fetch matching cards
// One request per page. body.data holds the card records;
// body.has_more says whether another page exists.
export async function getCards(query) {
  let cards = [];

  for (let page = 1; ; page++) {
    const url =
      QUERY + "/cards?q=" + encodeURIComponent(query) +
      "&page_size=200&page=" + page;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("API returned " + response.status);
    }

    const body = await response.json();

    cards.push(...body.data);

    if (!body.has_more) {
      break;
    }
  }

  return cards;
}

// ── 4. Use the card records
// e:fire,water also matches a card with Fire and Air, because it has
// Fire. Keep only cards whose every element was chosen. "None" is fine.
export function onlyChosenElements(cards, elements) {
  return cards.filter((card) =>
    card.elements.every((element) => element === "None" || elements.includes(element))
  );
}

// Shuffle, then take a random number of copies of each card, never
// more than its rarity allows, until the part is full.
export function drawCards(cards, size) {
  const shuffled = cards.slice().sort(() => Math.random() - 0.5);
  let picked = [];
  let total = 0;

  for (const card of shuffled) {
    if (total >= size) {
      break;
    }

    let limit = COPIES[card.rarity] || 1;
    if (limit > size - total) {
      limit = size - total;
    }

    const copies = 1 + Math.floor(Math.random() * limit);
    picked.push({ card: card, copies: copies });
    total += copies;
  }

  return picked;
}

// ── 5. Assemble the deck
export async function makeDeck(choice) {
  const parts = {
    Avatar: 1,
    Artifact: choice.split.Artifact,
    Aura: choice.split.Aura,
    Magic: choice.split.Magic,
    Minion: choice.split.Minion,
    Toolbox: choice.toolbox,
    Site: ATLAS,
    Collection: choice.toolbox > 0 ? COLLECTION : 0,
  };

  let deck = [];
  let usedNames = [];

  for (const part in parts) {
    const size = parts[part];
    if (size === 0) {
      continue;
    }

    const query = makeQuery(part, choice);
    let cards = await getCards(query);
    cards = onlyChosenElements(cards, choice.elements);
    cards = cards.filter((card) => !usedNames.includes(card.name));  // copies count across the deck

    let picked;
    if (part === "Toolbox") {
      picked = [{ card: cards[0], copies: choice.toolbox }];
    } else {
      picked = drawCards(cards, size);
    }

    for (const pick of picked) {
      usedNames.push(pick.card.name);
    }

    deck.push({ part: part, query: query, matched: cards.length, size: size, cards: picked });
  }

  return deck;
}
