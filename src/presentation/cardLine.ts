/** One-line readings of a card's facts for the text and full result
 * views, where a tile's picture is not there to carry them. Pure, so the
 * browser and the tests share one wording. */

interface Facts {
  type: string | null;
  subtypes: string[];
  cost: number | null;
  power: number | null;
  life: number | null;
  thr_air: number; thr_earth: number; thr_fire: number; thr_water: number;
}

/** "Minion · Mortal · Beast", the card page's own reading of the typeline. */
export function typeLine(card: Pick<Facts, "type" | "subtypes">): string {
  return [card.type, ...card.subtypes].filter(Boolean).join(" · ");
}

/** "1 Air, 2 Water": the element names the number, as on the card page.
 * Empty when the card needs no threshold. */
export function thresholdLine(card: Pick<Facts, "thr_air" | "thr_earth" | "thr_fire" | "thr_water">): string {
  return ([["Air", card.thr_air], ["Earth", card.thr_earth], ["Fire", card.thr_fire], ["Water", card.thr_water]] as const)
    .filter(([, n]) => n > 0).map(([e, n]) => `${n} ${e}`).join(", ");
}

/** "Cost 3 · 1 Air, 2 Water", or whichever half the card has. */
export function costLine(card: Pick<Facts, "cost" | "thr_air" | "thr_earth" | "thr_fire" | "thr_water">): string {
  return [card.cost !== null ? `Cost ${card.cost}` : "", thresholdLine(card)].filter(Boolean).join(" · ");
}

/** "Power 4", "Life 20", or both for an avatar; empty for a card with neither. */
export function statLine(card: Pick<Facts, "power" | "life">): string {
  return [card.power !== null ? `Power ${card.power}` : "", card.life !== null ? `Life ${card.life}` : ""].filter(Boolean).join(" · ");
}
