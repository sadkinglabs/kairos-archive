/** The Kairos query language, as a table. The parser is built from this
 * table and so is the /syntax page: one source, so the documentation can
 * never describe a key the parser does not have. Every key names its
 * scope - a card key filters cards; a printing key must be satisfied,
 * together with every other printing key in the query, by ONE printing
 * of the card (see evaluate.ts). */

export type Scope = "card" | "printing";
export type KeyKind = "text" | "number" | "enum" | "element" | "list" | "set" | "product" | "finish" | "date" | "id" | "slug";
/** Two ways to match, whatever the kind of key.
 *
 * ":" ignores the boundaries of the value: on text it is the substring,
 * so r:drag finds Dragon; on a number or a name from a fixed list there
 * are no boundaries to ignore, so it is equality.
 *
 * "=" respects them. A number is one value, so m=3 is that value. The
 * elements are a set, so e=water+fire is that set and no third. Text is
 * a sequence of words, so r=drag is the complete word and r="draw a
 * spell" the complete phrase. "!=" is its negation. */
export type Op = ":" | "=" | "<" | "<=" | ">" | ">=" | "!=";

export interface KeyDef {
  /** canonical name, e.g. "rules" */
  name: string;
  /** Every spelling the parser accepts. The first is the key itself -
   * always the short one, since that is what /syntax heads the row with
   * and what the advanced form writes; the rest are the descriptive
   * spellings. Enforced by a test. */
  aliases: string[];
  scope: Scope;
  kind: KeyKind;
  /** which record field it reads (a Card or Printing property) */
  field: string;
  /** closed vocabulary for enum/list kinds, used for prefix matching */
  values?: string[];
  doc: string;
  examples: string[];
}

export const TYPES = ["Avatar", "Minion", "Magic", "Aura", "Artifact", "Site"];
export const CATEGORIES = ["Spell", "Site", "Avatar", "Token"];
export const RARITIES = ["Ordinary", "Exceptional", "Elite", "Unique"];
export const ELEMENTS = ["Air", "Earth", "Fire", "Water", "None"];
export const FINISHES = ["Standard", "Foil", "Rainbow"];
export const PRODUCTS = ["Booster", "BoxTopper", "PreconstructedDeck", "Dust", "DraftKit", "WelcomeKit",
  "Kickstarter", "TeamCovenant", "AlphaInvestments", "StarCityGames", "OrganizedPlay"];
/** slug codes as the official API spells them in printing slugs */
export const PRODUCT_CODES: Record<string, string> = {
  b: "Booster", bt: "BoxTopper", pd: "PreconstructedDeck", d: "Dust", dk: "DraftKit", wk: "WelcomeKit",
  k: "Kickstarter", tc: "TeamCovenant", ai: "AlphaInvestments", scg: "StarCityGames", op: "OrganizedPlay",
};
export const FINISH_CODES: Record<string, string> = { s: "Standard", f: "Foil", rf: "Rainbow" };
/** How a query may spell an element besides its name: e:w, e:none. */
export const ELEMENT_ALIASES: Record<string, string> = { none: "None", colorless: "None", colourless: "None", c: "None",
  w: "Water", a: "Air", e: "Earth", f: "Fire" };

/** Values are compared with spaces, underscores and hyphens removed, so
 * pro:"box topper", pro:box_topper and pro:boxtopper are one value. */
export function squash(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

export type Resolution = { value: string } | { ambiguous: string[] } | { unknown: true };

/** Resolve a value against a closed vocabulary: a known shorthand first
 * (pro:bt, e:none), then an exact name, then a unique prefix. It reports
 * which of the two failures happened, so the parser can say whether a
 * value is unknown or merely too short to tell apart. */
export function resolveValue(value: string, values: string[], aliases: Record<string, string> = {}): Resolution {
  const raw = value.trim().toLowerCase();
  if (raw === "") return { unknown: true };
  if (aliases[raw]) return { value: aliases[raw] };
  const v = squash(value);
  const exact = values.find((x) => squash(x) === v);
  if (exact) return { value: exact };
  const prefixed = values.filter((x) => squash(x).startsWith(v));
  if (prefixed.length === 1) return { value: prefixed[0] };
  if (prefixed.length > 1) return { ambiguous: prefixed };
  return { unknown: true };
}

/** The closed vocabulary a key accepts, with the shorthands for it, or
 * null when the values come from the data rather than from this table
 * (a set name, a subtype, an artist). */
export function vocabulary(key: KeyDef): { values: string[]; aliases: Record<string, string>; noun: string } | null {
  switch (key.kind) {
    case "element": return { values: ELEMENTS, aliases: ELEMENT_ALIASES, noun: "an element" };
    case "finish": return { values: FINISHES, aliases: FINISH_CODES, noun: "a finish" };
    case "product": return { values: PRODUCTS, aliases: PRODUCT_CODES, noun: "a product" };
    case "enum": case "list": return key.values ? { values: key.values, aliases: {}, noun: `a ${key.name}` } : null;
    default: return null;
  }
}

export const KEYS: KeyDef[] = [
  // ---- card keys
  { name: "name", aliases: ["n", "name"], scope: "card", kind: "text", field: "name",
    doc: "Card name. n:bear is the substring, so it finds Bearded; n=bear is the complete word. Bare words search the name too; use n: when combining with other terms.",
    examples: ["n:bear", "n=bear", "name:\"polar bears\" e:water"] },
  { name: "rules", aliases: ["r", "rules"], scope: "card", kind: "text", field: "rules_text",
    doc: "Rules text. r:drag is the substring, so it finds Dragon; r=drag is the complete word and r=\"draw a spell\" the complete phrase. r: is rules in Sorcery (there is no oracle text).",
    examples: ["r:drag", "r=drag", "r=\"draw a spell\"", "r:genesis t:minion"] },
  { name: "rarity", aliases: ["rar", "rarity"], scope: "card", kind: "enum", field: "rarity", values: RARITIES,
    doc: "Ordinary, Exceptional, Elite or Unique; any unambiguous prefix works. Three letters, not one: r: is rules.",
    examples: ["rar:unique", "rar:ex"] },
  { name: "type", aliases: ["t", "type"], scope: "card", kind: "enum", field: "type", values: TYPES,
    doc: "Avatar, Minion, Magic, Aura, Artifact or Site; prefixes work. Type only, never a subtype.",
    examples: ["t:minion", "t:art"] },
  { name: "category", aliases: ["cat", "category"], scope: "card", kind: "enum", field: "category", values: CATEGORIES,
    doc: "Spell, Site, Avatar or Token.",
    examples: ["cat:token", "cat:spell e:fire"] },
  { name: "subtype", aliases: ["sub", "subtype"], scope: "card", kind: "list", field: "subtypes",
    doc: "A subtype (Mortal, Beast, Relic, ...); repeat the key for AND; prefixes work.",
    examples: ["sub:beast", "sub:beast sub:spirit"] },
  { name: "umbrella", aliases: ["u", "umbrella"], scope: "card", kind: "list", field: "umbrellas", values: ["Evil", "Knight", "Royalty"],
    doc: "The cross-subtype groups rules text refers to: Evil, Knight, Royalty.",
    examples: ["u:knight", "u:evil t:minion"] },
  { name: "element", aliases: ["e", "element"], scope: "card", kind: "element", field: "elements", values: ELEMENTS,
    doc: "e:water matches any card that has Water (multi-element cards match each of theirs); e:water e:air needs both; e=water means Water and nothing else; e:none is colourless. First letters work: e:w, e=wa. List values to combine them: e:water+fire has both, e:water,fire has either, e=water+fire is exactly those two and nothing else. For how many elements rather than which, use is:multi-element or is:mono-element.",
    examples: ["e:water", "e:water+fire", "e=water+fire", "e:water,fire", "is:multi-element e:fire"] },
  { name: "threshold", aliases: ["thr", "threshold", "thr.total"], scope: "card", kind: "number", field: "thr_total",
    doc: "Total threshold: the four element requirements added up, which is what a deck has to reach to play the card. Derived, so it needs no lookup: thr:0 is every card with no requirement at all.",
    examples: ["thr:1", "thr>=3", "thr<=2 e:fire"] },
  { name: "air", aliases: ["air", "thr.air", "threshold.air"], scope: "card", kind: "number", field: "thr_air",
    doc: "Air threshold, with the numeric operators.", examples: ["air>=2", "air:1"] },
  { name: "earth", aliases: ["earth", "thr.earth", "threshold.earth"], scope: "card", kind: "number", field: "thr_earth",
    doc: "Earth threshold.", examples: ["earth>=1"] },
  { name: "fire", aliases: ["fire", "thr.fire", "threshold.fire"], scope: "card", kind: "number", field: "thr_fire",
    doc: "Fire threshold.", examples: ["fire>2"] },
  { name: "water", aliases: ["water", "thr.water", "threshold.water"], scope: "card", kind: "number", field: "thr_water",
    doc: "Water threshold.", examples: ["water>=2"] },
  { name: "keyword", aliases: ["k", "keyword"], scope: "card", kind: "list", field: "keywords",
    doc: "A keyword (Airborne, Genesis, Spellcaster, Submerge, ...); repeat for AND; prefixes work.",
    examples: ["k:airborne", "k:spellcaster k:genesis"] },
  { name: "cost", aliases: ["m", "mana", "cost"], scope: "card", kind: "number", field: "cost",
    doc: "Mana cost with the numeric operators; m:x for the cards with no fixed cost; m:even, m:odd.",
    examples: ["m<=2", "m:x", "m:odd"] },
  { name: "power", aliases: ["pow", "power"], scope: "card", kind: "number", field: "power",
    doc: "Power is derived: equal to attack when attack equals defense, otherwise floor((attack + defense) / 2). pow: searches that value, as the registry publishes it.",
    examples: ["pow>=4", "pow:3 cost<=3"] },
  { name: "attack", aliases: ["atk", "attack"], scope: "card", kind: "number", field: "attack",
    doc: "The raw attack value - a different key from power on purpose.", examples: ["atk>def", "atk>=5"] },
  { name: "defense", aliases: ["def", "defense", "defence"], scope: "card", kind: "number", field: "defense",
    doc: "The raw defense value.", examples: ["def>=4"] },
  { name: "life", aliases: ["l", "life"], scope: "card", kind: "number", field: "life",
    doc: "Life; only Avatars have one.", examples: ["l>=20", "l>20 t:avatar"] },
  { name: "id", aliases: ["id", "codex", "printing"], scope: "card", kind: "id", field: "codex_id",
    doc: "A registry id, C000230 (card) or P000937 (printing). A query that is exactly an id jumps straight to that page.",
    examples: ["id:C000230", "id:P000937"] },
  { name: "slug", aliases: ["slug"], scope: "card", kind: "slug", field: "slug",
    doc: "Any official-API slug ever issued, resolved through the registry's slug history. A query that is exactly a slug jumps too.",
    examples: ["slug:004-witch-b-s"] },
  // ---- printing keys
  { name: "set", aliases: ["s", "set"], scope: "printing", kind: "set", field: "set_code",
    doc: "A set by code or name: s:006, s:6, s:gothic, set:\"arthurian legends\"; name prefixes work.",
    examples: ["s:alpha", "s:006 f:foil"] },
  { name: "product", aliases: ["pro", "product"], scope: "printing", kind: "product", field: "product", values: PRODUCTS,
    doc: "The product line, leniently: pro:boxtopper, pro:\"box topper\", pro:box_topper, or the slug code pro:bt; prefixes work. (p: is deliberately unassigned - too close to power.)",
    examples: ["pro:bt", "pro:dust"] },
  { name: "finish", aliases: ["f", "finish"], scope: "printing", kind: "finish", field: "finish", values: FINISHES,
    doc: "Standard, Foil or Rainbow, or the slug code (f:rf).", examples: ["f:foil", "f:rf"] },
  { name: "artist", aliases: ["a", "artist"], scope: "printing", kind: "text", field: "artist",
    doc: "Artist name or artist slug: a: is the substring, a= the complete word.", examples: ["a:menges", "a=menges"] },
  { name: "typeline", aliases: ["tl", "typeline"], scope: "printing", kind: "text", field: "typeline",
    doc: "The flavour typeline printed under the name: tl: is the substring, tl= the complete word or phrase.", examples: ["tl:\"new to power\""] },
  { name: "flavor", aliases: ["ft", "flavor", "flavour"], scope: "printing", kind: "text", field: "flavour_text",
    doc: "Flavour text: ft: is the substring, ft= the complete word or phrase. Empty upstream today; the key exists.", examples: ["ft:realm"] },
  { name: "date", aliases: ["date", "year", "released"], scope: "printing", kind: "date", field: "released_at",
    doc: "Release date of a printing: year:2023, year>=2024, date>=2025-08-01, date<2024. Accepts YYYY, YYYY-MM or YYYY-MM-DD.",
    examples: ["year:2023", "date>=2025-08-01"] },
];

export interface FlagDef {
  name: string;
  /** Shorthands accepted in a query; the canonical name is what /syntax shows. */
  aliases?: string[];
  scope: Scope;
  doc: string;
}

/** is: flags */
export const IS_FLAGS: FlagDef[] = [
  { name: "errata", scope: "card", doc: "the card's text or stats changed since it was printed (registry errata flag)" },
  { name: "multi-element", aliases: ["multi", "multielement"], scope: "card",
    doc: "two or more elements: Invigorate is Earth and Water, King Arthur is all four" },
  { name: "mono-element", aliases: ["mono", "monoelement"], scope: "card",
    doc: "exactly one element; e:none finds the cards with no element at all" },
  { name: "dfc", scope: "card", doc: "double-faced: the card has a back face" },
  { name: "token", scope: "card", doc: "category Token" },
  { name: "avatar", scope: "card", doc: "category Avatar" },
  { name: "site", scope: "card", doc: "category Site" },
  { name: "spell", scope: "card", doc: "category Spell" },
  { name: "reprint", scope: "card", doc: "more than one printing" },
  { name: "unique-printing", scope: "card", doc: "exactly one printing" },
  { name: "promo", scope: "printing", doc: "any product other than Booster" },
  { name: "booster", scope: "printing", doc: "product Booster" },
  { name: "foil", scope: "printing", doc: "finish Foil" },
  { name: "rainbow", scope: "printing", doc: "finish Rainbow" },
  { name: "nonfoil", scope: "printing", doc: "finish Standard" },
  { name: "current", scope: "printing", doc: "printed_as_current: the printed values match the card's current face" },
  { name: "outdated", scope: "printing", doc: "printed_as_current false: the printing shows older values" },
  { name: "retired", scope: "printing", doc: "removed upstream; the registry keeps the record" },
];

/** has: flags */
export const HAS_FLAGS: FlagDef[] = [
  { name: "back", scope: "card", doc: "the card has a back face (same as is:dfc)" },
  { name: "image", scope: "printing", doc: "image_status ok or lowres: an image is served" },
];

export const SORT_FIELDS = ["name", "cost", "threshold", "power", "atk", "def", "life", "set", "date", "rarity", "type"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const UNITS = ["cards", "prints", "art"] as const;
export type Unit = (typeof UNITS)[number];

export const KEY_BY_ALIAS: Map<string, KeyDef> = new Map();
for (const key of KEYS) for (const alias of key.aliases) KEY_BY_ALIAS.set(alias, key);
