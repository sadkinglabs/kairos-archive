/** One-line readings of a card's facts for the text and full result
 * views, where a tile's picture is not there to carry them. Pure, so the
 * browser and the tests share one wording. */

interface Facts {
  type: string | null;
  subtypes: string[];
  cost: number | null;
  attack: number | null;
  defense: number | null;
  power: number | null;
  life: number | null;
  thr_air: number; thr_earth: number; thr_fire: number; thr_water: number;
}

/** "Minion · Mortal · Beast", the card page's own reading of the typeline.
 * With `max`, a longer list of subtypes ends "and N more": one card carries
 * seventeen, which is a fact for its page and a wall in a table. */
export function typeLine(card: Pick<Facts, "type" | "subtypes">, max = Infinity): string {
  const shown = card.subtypes.slice(0, max);
  const rest = card.subtypes.length - shown.length;
  const line = [card.type, ...shown].filter(Boolean).join(" · ");
  return rest > 0 ? `${line} and ${rest} more` : line;
}

/** How a card's fighting numbers read. Power is the derived value (attack
 * when attack equals defense, else the floor of their mean), and for the
 * usual card - 509 of 535 with an attack - it is the whole story, so it
 * reads alone. When attack and defense differ, both are shown, since one
 * number would hide the shape of the card. Null for a card with neither. */
export function powerReading(card: Pick<Facts, "attack" | "defense" | "power">): { label: string; value: string } | null {
  if (card.attack === null || card.defense === null) return card.power !== null ? { label: "Power", value: String(card.power) } : null;
  if (card.attack === card.defense) return { label: "Power", value: String(card.power ?? card.attack) };
  return { label: "Attack / Defense", value: `${card.attack} / ${card.defense}` };
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

/** "Power 4", "Attack 3 · Defense 5", "Life 20", or a fighting reading and
 * life together for an avatar; empty for a card with none of them. */
export function statLine(card: Pick<Facts, "attack" | "defense" | "power" | "life">): string {
  const p = powerReading(card);
  const fight = p === null ? "" : p.label === "Power" ? `Power ${p.value}` : `Attack ${card.attack} · Defense ${card.defense}`;
  return [fight, card.life !== null ? `Life ${card.life}` : ""].filter(Boolean).join(" · ");
}
