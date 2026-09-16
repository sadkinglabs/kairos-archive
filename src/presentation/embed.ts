/** What a link to a card says when it unfurls in Discord, Slack or a
 * social feed: the scraper reads one description string and one colour,
 * so the facts go in as lines of text and the element as the bar down
 * the side. Pure, so the wording is tested once and used by the card and
 * printing pages alike. */
import { powerReading, thresholdLine } from "./cardLine";

interface EmbedFace {
  type: string | null; subtypes: string[]; rarity: string | null; elements: string[];
  cost: number | null; attack: number | null; defense: number | null; power: number | null; life: number | null;
  thr_air: number; thr_earth: number; thr_fire: number; thr_water: number;
  rules_text: string;
}

/** Discord shows roughly the first 350 characters of a description; a
 * scraper somewhere caps at 1,000. The facts come first, the rules text
 * last, so a cut lands on the text. */
export const MAX_EMBED = 600;

/** "Minion — Ordinary Giant": the type, then rarity and subtypes the way
 * the card prints them ("An Ordinary Giant"). The element is not named;
 * the threshold and the embed's colour carry it. */
export function embedTypeLine(face: Pick<EmbedFace, "type" | "subtypes" | "rarity">): string {
  const printed = [face.rarity, face.subtypes.join(", ")].filter(Boolean).join(" ");
  return [face.type, printed].filter(Boolean).join(" — ");
}

/** "Mana: 5 · Threshold: 1 Fire, 1 Water · Attack: 5 / Defense: 3 · Power: 4", each part only when the face has it. */
export function embedStatsLine(face: Pick<EmbedFace, "cost" | "attack" | "defense" | "power" | "life" | "thr_air" | "thr_earth" | "thr_fire" | "thr_water">): string {
  const parts: string[] = [];
  if (face.cost !== null) parts.push(`Mana: ${face.cost}`);
  const thr = thresholdLine(face);
  if (thr) parts.push(`Threshold: ${thr}`);
  const fight = powerReading(face);
  if (fight && fight.label === "Power") parts.push(`Power: ${fight.value}`);
  else if (fight) { parts.push(`Attack: ${face.attack} / Defense: ${face.defense}`); if (face.power !== null) parts.push(`Power: ${face.power}`); }
  if (face.life !== null) parts.push(`Life: ${face.life}`);
  return parts.join(" · ");
}

/** "C000927 · P002451": the card's codex id and the printing the page is
 * about (the default printing on a card page). The ids are the point of
 * the archive, so every unfurl carries them. */
export function embedIdLine(ids: { codex: string; printing?: string | null }): string {
  return [ids.codex, ids.printing].filter(Boolean).join(" · ");
}

/** The whole description: type line, stats, where it is printed, the ids,
 * a blank line, then the rules text, cut to MAX_EMBED on a word. */
export function embedDescription(face: EmbedFace, where: string[], ids?: { codex: string; printing?: string | null }): string {
  const head = [embedTypeLine(face), embedStatsLine(face), where.filter(Boolean).join(" · "), ids ? embedIdLine(ids) : ""].filter(Boolean).join("\n");
  const rules = face.rules_text.trim();
  const text = rules ? `${head}\n\n${rules}` : head;
  if (text.length <= MAX_EMBED) return text;
  const cut = text.slice(0, MAX_EMBED - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_EMBED - 40))}…`;
}

/** The bar down the side of the embed: the card's first element. */
export const ELEMENT_COLOURS: Record<string, string> = {
  Air: "#d9d3c2", Earth: "#8a5a2b", Fire: "#c8412b", Water: "#2b6cb0",
};
export const NEUTRAL_COLOUR = "#7d7871";
export function embedColour(elements: string[]): string {
  const first = elements.find((e) => e in ELEMENT_COLOURS);
  return first ? ELEMENT_COLOURS[first] : NEUTRAL_COLOUR;
}
