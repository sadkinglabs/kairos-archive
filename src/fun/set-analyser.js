// Build a set analyser with the Kairos Archive query API.
// One query fetches a whole Sorcery set as structured JSON.
// Plain JavaScript does the rest.
// (The "export" words only let the page import these functions.)

export const QUERY = "https://query.kairosarchive.net";

// ── 1. Fetch the set

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

export function manaCurve(cards) {
  const curve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, "6+": 0 };

  for (const card of cards) {
    if (typeof card.cost !== "number") {
      continue;
    }

    if (card.cost >= 6) {
      curve["6+"]++;
    } else {
      curve[card.cost]++;
    }
  }

  return curve;
}

// ── 3. Turn counts into percentages

export function percentages(counts, total) {
  const shares = {};

  for (const key in counts) {
    shares[key] = Math.round((counts[key] / total) * 100);
  }

  return shares;
}

// ── 4. Analyse elements

export function elementShares(cards) {
  const counts = {
    Air: 0,
    Earth: 0,
    Fire: 0,
    Water: 0,
    None: 0
  };

  for (const card of cards) {
    for (const element of card.elements) {
      counts[element]++;
    }
  }

  return percentages(counts, cards.length);
}

// ── 5. Analyse card types

export function typeShares(cards) {
  const counts = {};

  for (const card of cards) {
    const type = card.type;

    if (!counts[type]) {
      counts[type] = 0;
    }

    counts[type]++;
  }

  return percentages(counts, cards.length);
}

// ── 6. Find notable cards

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
    if (card.rarity !== "Unique") {
      continue;
    }

    if (typeof card.cost !== "number") {
      continue;
    }

    if (!result || card.cost < result.cost) {
      result = card;
    }
  }

  return result;
}

export function strongestMinion(cards) {
  let result = null;

  for (const card of cards) {
    if (card.type !== "Minion") {
      continue;
    }

    if (typeof card.power !== "number") {
      continue;
    }

    if (!result || card.power > result.power) {
      result = card;
    }
  }

  return result;
}

// ── 7. Derive some useful facts

export function facts(cards) {
  let costed = 0;
  let costSum = 0;
  let cheap = 0;
  let minions = 0;
  let strong = 0;
  let multi = 0;
  let elementless = 0;

  for (const card of cards) {
    if (typeof card.cost === "number") {
      costed++;
      costSum += card.cost;

      if (card.cost <= 4) {
        cheap++;
      }
    }

    if (card.type === "Minion" && typeof card.power === "number") {
      minions++;

      if (card.power >= 3) {
        strong++;
      }
    }

    if (card.elements.length > 1) {
      multi++;
    }

    if (card.elements.includes("None")) {
      elementless++;
    }
  }

  return {
    averageCost: Math.round((costSum / costed) * 10) / 10,
    cheapShare: Math.round((cheap / costed) * 100),
    strongMinionShare: Math.round((strong / minions) * 100),
    multiElement: multi,
    elementlessShare: Math.round((elementless / cards.length) * 100)
  };
}

// ── 8. Build the report

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
      "Highest-power Minion": strongestMinion(cards)
    },

    facts: [
      numbers.cheapShare + "% of cards cost 4 or less.",
      numbers.strongMinionShare + "% of Minions have 3+ power.",
      numbers.multiElement + " cards use more than one element.",
      numbers.elementlessShare + "% of the set has no element."
    ]
  };
}
