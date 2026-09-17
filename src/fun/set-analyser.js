// Build a set analyser with the Kairos Archive query API.
// One query fetches a whole Sorcery set as structured JSON; plain
// JavaScript does the rest. The page /fun/set-analyser walks through
// this file section by section.

// ── 1. Fetch the set
export const QUERY = "https://query.kairosarchive.net";

// "s:001" is the same search syntax as the search box: every card
// printed in set 001. The API answers up to 200 cards a page.
// body.data holds the card records; body.has_more says if there is more.
export async function getSetCards(set) {
  let cards = [];

  for (let page = 1; ; page++) {
    const query = "s:" + set;

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

// ── 2. Build a mana curve
// card.cost is a number, or null for sites, avatars and X-cost cards.
export function manaCurve(cards) {
  const curve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, "6+": 0 };

  for (const card of cards) {
    const cost = card.cost;

    if (typeof cost !== "number") {
      continue;
    }

    if (cost >= 6) {
      curve["6+"]++;
    } else {
      curve[cost]++;
    }
  }

  return curve;
}

// ── 3. Analyse elements
// card.elements is a list: ["Fire"], ["Earth", "Water"], or ["None"]
// for a card with no element. A card counts once for each element it
// has, so a set's shares can add up to more than 100.
export function elementShares(cards) {
  const counts = { Air: 0, Earth: 0, Fire: 0, Water: 0, None: 0 };

  for (const card of cards) {
    for (const element of card.elements) {
      counts[element]++;
    }
  }

  return percentages(counts, cards.length);
}

// Counts to whole-number percentages of a total.
export function percentages(counts, total) {
  const shares = {};
  for (const key in counts) {
    shares[key] = Math.round((counts[key] / total) * 100);
  }
  return shares;
}

// ── 4. Analyse card types
// card.type is Minion, Magic, Aura, Artifact, Site or Avatar.
export function typeShares(cards) {
  const counts = {};

  for (const card of cards) {
    if (!counts[card.type]) {
      counts[card.type] = 0;
    }
    counts[card.type]++;
  }

  return percentages(counts, cards.length);
}

// ── 5. Find notable cards
// Records are ordinary objects, so they can be compared like any other.
export function mostExpensive(cards) {
  let result = null;

  for (const card of cards) {
    if (typeof card.cost !== "number") {
      continue;
    }
    if (!result || card.cost > result.cost) {
      result = card;
    }
  }

  return result;
}

export function cheapestUnique(cards) {
  let result = null;

  for (const card of cards) {
    if (card.rarity !== "Unique" || typeof card.cost !== "number") {
      continue;
    }
    if (!result || card.cost < result.cost) {
      result = card;
    }
  }

  return result;
}

// card.power is worked out by Kairos from attack and defense.
export function strongestMinion(cards) {
  let result = null;

  for (const card of cards) {
    if (card.type !== "Minion" || typeof card.power !== "number") {
      continue;
    }
    if (!result || card.power > result.power) {
      result = card;
    }
  }

  return result;
}

// ── 6. Build the report
// None of these numbers is an API field. They all come from the records.
export function facts(cards) {
  let costed = 0;
  let costSum = 0;
  let cheap = 0;
  let fivePlus = 0;
  let minions = 0;
  let strong = 0;
  let multi = 0;
  let elementless = 0;

  for (const card of cards) {
    if (typeof card.cost === "number") {
      costed++;
      costSum += card.cost;
      if (card.cost <= 4) cheap++;
      if (card.cost >= 5) fivePlus++;
    }
    if (card.type === "Minion" && typeof card.power === "number") {
      minions++;
      if (card.power >= 3) strong++;
    }
    if (card.elements.length > 1) multi++;
    if (card.elements.includes("None")) elementless++;
  }

  return {
    averageCost: Math.round((costSum / costed) * 10) / 10,
    cheapShare: Math.round((cheap / costed) * 100),
    fivePlusShare: Math.round((fivePlus / costed) * 100),
    strongMinionShare: Math.round((strong / minions) * 100),
    multiElement: multi,
    elementlessShare: Math.round((elementless / cards.length) * 100),
  };
}

export async function analyseSet(set) {
  const cards = await getSetCards(set);
  const numbers = facts(cards);

  return {
    set: set,
    cards: cards,
    curve: manaCurve(cards),
    elements: elementShares(cards),
    types: typeShares(cards),
    notable: {
      "Cheapest Unique": cheapestUnique(cards),
      "Most expensive card": mostExpensive(cards),
      "Highest-power Minion": strongestMinion(cards),
    },
    numbers: numbers,
    facts: [
      numbers.cheapShare + "% of cards cost 4 or less.",
      numbers.strongMinionShare + "% of Minions have 3+ power.",
      numbers.multiElement + " cards use more than one element.",
      numbers.elementlessShare + "% of the set has no element.",
    ],
  };
}
