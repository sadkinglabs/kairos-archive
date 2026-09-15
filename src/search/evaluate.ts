/** Evaluating a parsed query over the search data.
 *
 * Card keys filter cards. Printing keys bind to ONE printing: a card
 * matches when there exists a printing of it for which every node of the
 * query - printing terms read that printing, card terms read the card -
 * comes out true. So `t:minion s:alpha f:foil` is "minions with a
 * printing that is both Alpha and foil", and `or` between printing terms
 * is still judged printing by printing. A card with no printings is
 * evaluated with no printing bound, where every printing term is false. */

import { ELEMENTS, FINISH_CODES, PRODUCT_CODES, type KeyDef, type Op } from "./keys";
import { parse, type Node, type Options, type Parsed } from "./query";
import type { Card, Printing, SearchData } from "./types";

export interface Hit { card: Card; printing: Printing | null }

export interface SearchResult {
  hits: Hit[];
  /** cards whose rules text (not name) contains the bare words */
  rulesTextHits: Card[];
  errors: string[];
  options: Options;
  total: number;
}

// ---------------------------------------------------------------- helpers

const fold = (s: string | null | undefined) => (s ?? "").toLowerCase();
const squash = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");

/** Prefix-resolve `value` against a closed vocabulary. Exact wins;
 * otherwise a unique prefix; ambiguity or no match returns null. */
export function resolveEnum(value: string, values: string[]): string | null {
  const v = squash(value);
  const exact = values.find((x) => squash(x) === v);
  if (exact) return exact;
  const prefixed = values.filter((x) => squash(x).startsWith(v));
  return prefixed.length === 1 ? prefixed[0] : null;
}

function compareNumbers(actual: number | null, op: Op, wanted: number): boolean {
  if (actual === null) return op === "!=";
  switch (op) {
    case ":": case "=": return actual === wanted;
    case "!=": return actual !== wanted;
    case "<": return actual < wanted;
    case "<=": return actual <= wanted;
    case ">": return actual > wanted;
    case ">=": return actual >= wanted;
  }
}

/** Partial ISO dates compare as ranges: date<2024 is before 2024-01-01,
 * date<=2024 is up to 2024-12-31, date:2024 is within 2024. */
function compareDates(actual: string | null, op: Op, wanted: string): boolean {
  if (actual === null) return false;
  const w = wanted.trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(w)) return false;
  const lo = w.length === 4 ? `${w}-01-01` : w.length === 7 ? `${w}-01` : w;
  const hi = w.length === 4 ? `${w}-12-31` : w.length === 7 ? `${w}-31` : w;
  switch (op) {
    case ":": case "=": return actual >= lo && actual <= hi;
    case "!=": return actual < lo || actual > hi;
    case "<": return actual < lo;
    case "<=": return actual <= hi;
    case ">": return actual > hi;
    case ">=": return actual >= lo;
  }
}

/** Card numbers, including the ones the registry does not store: the
 * total threshold is the four element requirements added up. */
function cardNumber(card: Card, field: string): number | null {
  if (field === "thr_total") return card.thr_air + card.thr_earth + card.thr_fire + card.thr_water;
  return (card as unknown as Record<string, number | null>)[field] ?? null;
}

function numberValue(card: Card, key: KeyDef, op: Op, value: string): boolean {
  const actual = cardNumber(card, key.field);
  const v = value.toLowerCase();
  if (key.name === "cost" && v === "x") return actual === null;
  if (key.name === "cost" && (v === "even" || v === "odd")) {
    if (actual === null) return false;
    return (actual % 2 === 0) === (v === "even");
  }
  // a numeric comparison against another numeric key: atk>def
  const other = numericKeyField(v);
  if (other) {
    const rhs = cardNumber(card, other);
    return rhs === null ? false : compareNumbers(actual, op, rhs);
  }
  const n = Number(v);
  if (!Number.isInteger(n)) return false;
  return compareNumbers(actual, op, n);
}

function numericKeyField(alias: string): string | null {
  const map: Record<string, string> = { atk: "attack", attack: "attack", def: "defense", defense: "defense",
    defence: "defense", pow: "power", power: "power", m: "cost", mana: "cost", cost: "cost", l: "life", life: "life",
    thr: "thr_total", threshold: "thr_total", air: "thr_air", earth: "thr_earth", fire: "thr_fire", water: "thr_water" };
  return map[alias] ?? null;
}

function listMatch(values: string[], value: string, vocabulary?: string[]): boolean {
  const resolved = vocabulary ? resolveEnum(value, vocabulary) : null;
  const v = squash(resolved ?? value);
  return values.some((x) => squash(x) === v || squash(x).startsWith(v));
}

function resolveElement(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const aliases: Record<string, string> = { none: "None", colorless: "None", colourless: "None", c: "None",
    w: "Water", a: "Air", e: "Earth", f: "Fire" };
  return aliases[raw] ?? resolveEnum(value, ELEMENTS);
}

function elementMatch(card: Card, op: Op, value: string): boolean {
  // The parser expands a value list for every operator but "=", which needs
  // the whole list at once: e=water+fire is those two elements and no third.
  const wanted = value.split("+").map(resolveElement);
  if (wanted.some((w) => w === null)) return false;
  // Resolve aliases before deduplicating: w+Water is one affinity, not two.
  const names = [...new Set(wanted as string[])];
  if (op === "=") return card.elements.length === names.length && names.every((n) => card.elements.includes(n));
  const has = names.every((n) => card.elements.includes(n));
  return op === "!=" ? !has : has;
}

function setMatch(printing: Printing, value: string, setNames: Map<string, string>): boolean {
  const v = value.trim().toLowerCase();
  if (/^\d+$/.test(v)) return printing.set_code === v.padStart(3, "0");
  const name = fold(printing.set_name);
  if (name === v || name.startsWith(v)) return true;
  // a prefix that is unique among set names
  const candidates = [...setNames.values()].filter((n) => n.toLowerCase().startsWith(v));
  return candidates.length === 1 && candidates[0].toLowerCase() === name;
}

function productMatch(printing: Printing, value: string): boolean {
  const code = PRODUCT_CODES[value.toLowerCase()];
  const wanted = code ?? resolveEnum(value, Object.values(PRODUCT_CODES));
  return wanted !== null && printing.product === wanted;
}

function finishMatch(printing: Printing, value: string): boolean {
  const code = FINISH_CODES[value.toLowerCase()];
  const wanted = code ?? resolveEnum(value, Object.values(FINISH_CODES));
  return wanted !== null && printing.finish === wanted;
}

// ---------------------------------------------------------------- evaluation

interface Context {
  slugOwners: Map<string, string>;
  setNames: Map<string, string>;
  printingCounts: Map<string, number>;
}

function evalTerm(node: Extract<Node, { kind: "term" }>, card: Card, printing: Printing | null, ctx: Context): boolean {
  const { key, op, value } = node;
  const negate = op === "!=";
  const truth = (b: boolean) => (negate ? !b : b);
  if (key.scope === "printing") {
    if (!printing) return false;
    switch (key.kind) {
      case "set": return truth(setMatch(printing, value, ctx.setNames));
      case "product": return truth(productMatch(printing, value));
      case "finish": return truth(finishMatch(printing, value));
      case "date": return compareDates(printing.released_at, op, value);
      case "text": {
        const v = fold(value);
        const fields = key.name === "artist" ? [printing.artist, printing.artist_slug] : [(printing as unknown as Record<string, string | null>)[key.field]];
        return truth(fields.some((f) => fold(f).includes(v)));
      }
      default: return false;
    }
  }
  switch (key.kind) {
    case "text": return truth(fold((card as unknown as Record<string, string>)[key.field]).includes(fold(value)));
    case "number": return numberValue(card, key, op, value);
    case "enum": {
      const wanted = resolveEnum(value, key.values ?? []);
      return truth(wanted !== null && (card as unknown as Record<string, string | null>)[key.field] === wanted);
    }
    case "list": return truth(listMatch((card as unknown as Record<string, string[]>)[key.field] ?? [], value, key.values));
    case "element": return elementMatch(card, op, value);
    case "id": {
      const v = value.toUpperCase();
      if (v.startsWith("P")) return truth(card.printing_ids.includes(v));
      return truth(card.codex_id === v);
    }
    case "slug": {
      const owner = ctx.slugOwners.get(value.toLowerCase());
      return truth(owner !== undefined && card.printing_ids.includes(owner));
    }
    default: return false;
  }
}

function evalFlag(node: Extract<Node, { kind: "flag" }>, card: Card, printing: Printing | null, ctx: Context): boolean {
  if (node.scope === "printing") {
    if (!printing) return false;
    switch (node.name) {
      case "promo": return printing.product !== "Booster";
      case "booster": return printing.product === "Booster";
      case "foil": return printing.finish === "Foil";
      case "rainbow": return printing.finish === "Rainbow";
      case "nonfoil": return printing.finish === "Standard";
      case "current": return printing.printed_as_current === true;
      case "outdated": return printing.printed_as_current === false;
      case "retired": return printing.retired_at !== null;
      case "image": return printing.image_status !== "missing";
      default: return false;
    }
  }
  switch (node.name) {
    case "errata": return card.errata;
    // "None" is how the registry spells a card with no element, so it is not
    // one of them: Invigorate has two, Polar Bears one, Erosion none.
    case "multi-element": return card.elements.filter((x) => x !== "None").length >= 2;
    case "mono-element": return card.elements.filter((x) => x !== "None").length === 1;
    case "dfc": case "back": return card.has_back;
    case "token": return card.category === "Token";
    case "avatar": return card.category === "Avatar";
    case "site": return card.category === "Site";
    case "spell": return card.category === "Spell";
    case "reprint": return (ctx.printingCounts.get(card.codex_id) ?? 0) > 1;
    case "unique-printing": return (ctx.printingCounts.get(card.codex_id) ?? 0) === 1;
    default: return false;
  }
}

function bareMatch(node: Extract<Node, { kind: "bare" }>, card: Card): boolean {
  const name = fold(card.name);
  if (node.exact) return name === fold(node.text);
  return name.includes(fold(node.text));
}

/** An always-true node, for option-only queries. */
const MATCH_ALL: Node = { kind: "and", items: [] };

export function evalNode(node: Node, card: Card, printing: Printing | null, ctx: Context): boolean {
  switch (node.kind) {
    case "and": return node.items.every((n) => evalNode(n, card, printing, ctx));
    case "or": return node.items.some((n) => evalNode(n, card, printing, ctx));
    case "not": return !evalNode(node.item, card, printing, ctx);
    case "bare": return bareMatch(node, card);
    case "term": return evalTerm(node, card, printing, ctx);
    case "flag": return evalFlag(node, card, printing, ctx);
  }
}

function mentionsPrinting(node: Node): boolean {
  switch (node.kind) {
    case "and": case "or": return node.items.some(mentionsPrinting);
    case "not": return mentionsPrinting(node.item);
    case "term": return node.key.scope === "printing";
    case "flag": return node.scope === "printing";
    default: return false;
  }
}

// ---------------------------------------------------------------- results

const RARITY_RANK: Record<string, number> = { Ordinary: 0, Exceptional: 1, Elite: 2, Unique: 3 };
const TYPE_RANK: Record<string, number> = { Avatar: 0, Site: 1, Minion: 2, Magic: 3, Aura: 4, Artifact: 5 };

function sortKey(hit: Hit, field: string): string | number {
  const c = hit.card, p = hit.printing;
  const num = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
  switch (field) {
    case "cost": return num(c.cost);
    case "threshold": return c.thr_air + c.thr_earth + c.thr_fire + c.thr_water;
    case "power": return num(c.power);
    case "atk": return num(c.attack);
    case "def": return num(c.defense);
    case "life": return num(c.life);
    case "rarity": return RARITY_RANK[c.rarity ?? ""] ?? 9;
    case "type": return TYPE_RANK[c.type ?? ""] ?? 9;
    case "set": return p?.set_code ?? "zzz";
    case "date": return p?.released_at ?? "9999";
    default: return c.name.toLowerCase();
  }
}

export function sortHits(hits: Hit[], options: Options): Hit[] {
  const field = options.sort ?? "name";
  const order = options.order ?? (field === "date" ? "desc" : "asc");
  const dir = order === "asc" ? 1 : -1;
  return [...hits].sort((a, b) => {
    const ka = sortKey(a, field), kb = sortKey(b, field);
    if (ka < kb) return -dir;
    if (ka > kb) return dir;
    // Ties break by name, ascending whatever the order; within one card
    // the sort is stable, so its printings keep default-first order.
    return a.card.name.localeCompare(b.card.name);
  });
}

/** Printings of a card in the order the site shows them: the default
 * printing first, then by printing id. */
function orderedPrintings(card: Card, byCard: Map<string, Printing[]>): Printing[] {
  const list = [...(byCard.get(card.codex_id) ?? [])].sort((a, b) => a.printing_id.localeCompare(b.printing_id));
  const i = list.findIndex((p) => p.printing_id === card.default_printing_id);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
}

export function buildContext(data: SearchData, slugHistory?: { slug: string; printing_id: string }[]): Context & { byCard: Map<string, Printing[]> } {
  const byCard = new Map<string, Printing[]>();
  const setNames = new Map<string, string>();
  const slugOwners = new Map<string, string>();
  for (const p of data.printings) {
    byCard.set(p.codex_id, [...(byCard.get(p.codex_id) ?? []), p]);
    if (p.set_code) setNames.set(p.set_code, p.set_name);
    slugOwners.set(p.slug.toLowerCase(), p.printing_id);
  }
  for (const row of slugHistory ?? []) slugOwners.set(row.slug.toLowerCase(), row.printing_id);
  const printingCounts = new Map<string, number>();
  for (const [id, list] of byCard) printingCounts.set(id, list.length);
  return { slugOwners, setNames, printingCounts, byCard };
}

export function search(input: string, data: SearchData, slugHistory?: { slug: string; printing_id: string }[]): SearchResult {
  const parsed: Parsed = parse(input);
  const ctx = buildContext(data, slugHistory);
  const { options } = parsed;
  // A query made only of options (sort:date) browses everything; an
  // empty query matches nothing.
  const ast: Node | null = parsed.ast ?? (input.trim() && parsed.errors.length === 0 ? MATCH_ALL : null);
  const hits: Hit[] = [];
  if (ast) {
    const printingScoped = mentionsPrinting(ast);
    for (const card of data.cards) {
      const printings = orderedPrintings(card, ctx.byCard);
      if (options.unique === "cards") {
        const chosen = printings.find((p) => evalNode(ast, card, p, ctx));
        if (chosen) hits.push({ card, printing: chosen });
        else if (printings.length === 0 && !printingScoped && evalNode(ast, card, null, ctx)) hits.push({ card, printing: null });
      } else {
        const seenArt = new Set<string>();
        for (const p of printings) {
          if (!evalNode(ast, card, p, ctx)) continue;
          if (options.unique === "art") {
            const art = p.image_hash ?? p.printing_id;
            if (seenArt.has(art)) continue;
            seenArt.add(art);
          }
          hits.push({ card, printing: p });
        }
      }
    }
  }
  // Bare words that match rules text rather than the name: a second,
  // labelled group so a bare query never silently mixes the two.
  const rulesTextHits: Card[] = [];
  if (parsed.bare.length > 0 && parsed.ast) {
    const hitIds = new Set(hits.map((h) => h.card.codex_id));
    const words = parsed.bare.map((b) => fold(b.text));
    for (const card of data.cards) {
      if (hitIds.has(card.codex_id)) continue;
      const text = fold(card.rules_text);
      if (words.every((w) => text.includes(w))) rulesTextHits.push(card);
    }
    rulesTextHits.sort((a, b) => a.name.localeCompare(b.name));
  }
  const sorted = sortHits(hits, options);
  return { hits: sorted, rulesTextHits, errors: parsed.errors, options, total: sorted.length };
}
