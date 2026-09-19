/** Tokenizer and parser for the Kairos query language. Produces an AST
 * of typed terms resolved against the key table, plus the options that
 * are not filters (unique:, sort:, order:) and a list of errors a user
 * can act on. Pure: no DOM, no data. */

import { HAS_FLAGS, IS_FLAGS, KEY_BY_ALIAS, KEYS, SORT_FIELDS, UNITS, resolveValue, vocabulary, type KeyDef, type Op, type SortField, type Unit } from "./keys";

export type Node =
  | { kind: "and"; items: Node[] }
  | { kind: "or"; items: Node[] }
  | { kind: "not"; item: Node }
  | { kind: "bare"; text: string; exact: boolean }
  | { kind: "term"; key: KeyDef; op: Op; value: string }
  | { kind: "flag"; family: "is" | "has"; name: string; scope: "card" | "printing" };

export interface Options {
  unique: Unit;
  sort: SortField | null;
  order: "asc" | "desc" | null;
}

export interface Parsed {
  ast: Node | null;
  options: Options;
  errors: string[];
  /** bare words and exact phrases, for the "appears in rules text" group */
  bare: { text: string; exact: boolean }[];
}

interface Token {
  kind: "lparen" | "rparen" | "or" | "and" | "not" | "term";
  negate?: boolean;
  key?: string;
  op?: Op;
  value?: string;
  exact?: boolean;
  quoted?: boolean;
}

// Longest first: "==" has to be tried before "=", or r==drag tokenizes
// as r= with the value "=drag".
const OPS: Op[] = ["!=", "==", "<=", ">=", ":", "=", "<", ">"];

export function tokenize(input: string): { tokens: Token[]; errors: string[] } {
  const tokens: Token[] = [];
  const errors: string[] = [];
  let i = 0;
  const n = input.length;
  const readQuoted = (): string => {
    // called with input[i] === '"'
    let out = "";
    i += 1;
    while (i < n && input[i] !== '"') { out += input[i]; i += 1; }
    if (i >= n) errors.push("unclosed quote");
    else i += 1;
    return out;
  };
  const readWord = (): string => {
    let out = "";
    while (i < n && !/[\s()]/.test(input[i])) { out += input[i]; i += 1; }
    return out;
  };
  while (i < n) {
    const c = input[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === "(") { tokens.push({ kind: "lparen" }); i += 1; continue; }
    if (c === ")") { tokens.push({ kind: "rparen" }); i += 1; continue; }
    let negate = false;
    if (c === "-" && i + 1 < n && !/[\s()]/.test(input[i + 1])) { negate = true; i += 1; }
    let exact = false;
    if (input[i] === "!" && input[i + 1] === '"') { exact = true; i += 1; }
    if (input[i] === '"') {
      tokens.push({ kind: "term", negate, value: readQuoted(), exact, quoted: true });
      continue;
    }
    // key<op>value ?
    const rest = input.slice(i);
    const m = /^([A-Za-z][A-Za-z.-]*)(!=|==|<=|>=|:|=|<|>)/.exec(rest);
    if (m && OPS.includes(m[2] as Op)) {
      i += m[0].length;
      let value: string;
      let quoted = false;
      if (input[i] === '"') { value = readQuoted(); quoted = true; }
      else value = readWord();
      tokens.push({ kind: "term", negate, key: m[1].toLowerCase(), op: m[2] as Op, value, quoted });
      continue;
    }
    const word = readWord();
    if (word === "") { i += 1; continue; }
    // A key followed by something that is not an operator - t≠site from a
    // phone keyboard, t<>site, m=>3 - parses as a bare word, which is a
    // search for a card of that name and finds nothing. No card name
    // contains ≠, =, < or > (8 contain !, so ! alone is not a signal),
    // so when the part before the symbol names a key, this is a mistyped
    // term and not a title.
    const mistyped = /^([A-Za-z][A-Za-z.-]*)([^A-Za-z0-9\s._'-]+)(.*)$/.exec(word);
    if (mistyped) {
      const def = KEY_BY_ALIAS.get(mistyped[1].toLowerCase());
      if (def && !OPS.includes(mistyped[2] as Op)) {
        const [, key, symbol, value] = mistyped;
        const target = value || "value";
        errors.push(`${key}: "${symbol}" is not an operator - use ${key}:${target} to include, -${key}:${target} or ${key}!=${target} to exclude`);
        continue;
      }
    }
    const lower = word.toLowerCase();
    if (!negate && lower === "or") { tokens.push({ kind: "or" }); continue; }
    if (!negate && lower === "and") { tokens.push({ kind: "and" }); continue; }
    if (!negate && lower === "not") { tokens.push({ kind: "not" }); continue; }
    tokens.push({ kind: "term", negate, value: word, exact: false, quoted: false });
  }
  return { tokens, errors };
}

/** A number, one of the words a numeric key accepts, or another numeric
 * key to compare against (atk>def, m>=thr). */
function numericValue(def: KeyDef, raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (def.name === "cost" && (v === "x" || v === "even" || v === "odd")) return true;
  const other = KEY_BY_ALIAS.get(v);
  if (other && other.scope === "card" && other.kind === "number") return true;
  return Number.isInteger(Number(v)) && v !== "";
}

/** Reject a value the evaluator could never match, here where it is still
 * text and the reader can be told what to type instead. An empty page is
 * an answer ("no card is Water and Fire"); a misspelt element is not. Only
 * closed vocabularies are checked - a set name, subtype, keyword or artist
 * comes from the data, not from the key table. */
function valueIsUsable(def: KeyDef, key: string, raw: string, errors: string[]): boolean {
  const words = vocabulary(def);
  if (words) {
    const resolved = resolveValue(raw, words.values, words.aliases);
    if ("value" in resolved) return true;
    if ("ambiguous" in resolved) {
      errors.push(`${key}: "${raw}" could be ${resolved.ambiguous.join(" or ")} - spell more of it`);
      return false;
    }
    const shown = words.values.length > 6 ? `${words.values.slice(0, 5).join(", ")} and ${words.values.length - 5} more` : words.values.join(", ");
    errors.push(`${key}: "${raw}" is not ${words.noun} - ${shown}`);
    return false;
  }
  if (def.kind === "number" && !numericValue(def, raw)) {
    const extras = def.name === "cost" ? `, ${key}:x, ${key}:even, ${key}:odd` : "";
    errors.push(`${key}: "${raw}" is not a number - try ${key}:3, ${key}>=3${extras}, or another numeric key like ${key}>thr`);
    return false;
  }
  if (def.kind === "date" && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw.trim())) {
    errors.push(`${key}: "${raw}" is not a date - use 2024, 2024-05 or 2024-05-01`);
    return false;
  }
  if (def.kind === "id" && !/^[cp]\d{6}$/i.test(raw.trim())) {
    errors.push(`${key}: "${raw}" is not a registry id - C000230 for a card, P000937 for a printing`);
    return false;
  }
  return true;
}

function resolveTerm(token: Token, options: Options, errors: string[]): Node | null {
  if (token.key === undefined) {
    if (token.value === "") return null;
    const text = token.value ?? "";
    // "e:water + fire" splits into three tokens, and a lone separator would
    // otherwise become a name search for "+" that quietly matches nothing.
    if (!token.exact && /^[,+]+$/.test(text)) {
      errors.push(`stray ${text} - a value list takes no spaces (e:water${text[0]}fire), and separate terms are already combined with and`);
      return null;
    }
    return { kind: "bare", text, exact: token.exact ?? false };
  }
  const key = token.key;
  const value = token.value ?? "";
  if (key === "unique") {
    if ((UNITS as readonly string[]).includes(value)) options.unique = value as Unit;
    else errors.push(`unique: must be one of ${UNITS.join(", ")}`);
    return null;
  }
  if (key === "sort") {
    if ((SORT_FIELDS as readonly string[]).includes(value)) options.sort = value as SortField;
    else errors.push(`sort: must be one of ${SORT_FIELDS.join(", ")}`);
    return null;
  }
  if (key === "order") {
    if (value === "asc" || value === "desc") options.order = value;
    else errors.push("order: must be asc or desc");
    return null;
  }
  if (key === "is" || key === "has") {
    const table = key === "is" ? IS_FLAGS : HAS_FLAGS;
    const wanted = value.toLowerCase();
    const flag = table.find((f) => f.name === wanted || (f.aliases ?? []).includes(wanted));
    if (!flag) { errors.push(`unknown flag ${key}:${value}`); return null; }
    return { kind: "flag", family: key, name: flag.name, scope: flag.scope };
  }
  const def = KEY_BY_ALIAS.get(key);
  if (!def) { errors.push(`unknown key "${key}:"`); return null; }
  if (value === "") { errors.push(`${key}: needs a value`); return null; }
  const op = token.op ?? ":";
  const numeric = def.kind === "number" || def.kind === "date";
  // == is the complete word or phrase, which only means anything where a
  // value is free text. A number, a date or a value from a closed list is
  // already matched whole by ":", so == there would be a second spelling
  // of the same thing, or worse, a third reading of equality. Say so.
  if (op === "==" && def.kind !== "text") {
    const texts = KEYS.filter((k) => k.kind === "text").map((k) => `${k.aliases[0]}:`).join(", ");
    errors.push(`${key}== - == asks for a complete word, so it is only for text (${texts}); ${key}:${value} already matches a whole value`);
    return null;
  }
  if (!numeric && op !== ":" && op !== "=" && op !== "==" && op !== "!=") {
    errors.push(`${key}${op} - only numbers and dates take <, <=, > or >=`);
    return null;
  }
  // A value can list alternatives or conjuncts: e:water,fire is either,
  // e:water+fire is both. Only for keys whose values are names rather than
  // free text, since a comma is legitimate inside a name or a rules phrase.
  const listable = !numeric && def.kind !== "text";
  // e=water+fire is a set: "these elements and no others", which only the
  // evaluator can judge, so it stays one term instead of expanding.
  const exactSet = def.kind === "element" && op === "=" && value.includes("+") && !value.includes(",");
  const separator = listable && /[,+]/.test(value) ? (value.includes("+") ? "+" : ",") : null;
  if (separator) {
    if (value.includes(",") && value.includes("+")) {
      errors.push(`${key}: mixing , and + is ambiguous - use parentheses, e.g. (${key}:a+b or ${key}:c)`);
      return null;
    }
    const parts = value.split(separator).map((part) => part.trim());
    if (parts.some((part) => part === "")) { errors.push(`${key}: ${separator} needs a value on both sides`); return null; }
    if (parts.some((part) => !valueIsUsable(def, key, part, errors))) return null;
    if (exactSet) return { kind: "term", key: def, op, value };
    const items: Node[] = parts.map((part) => ({ kind: "term", key: def, op, value: part }));
    // De Morgan: each term already carries the negation, so the join has to
    // flip with it. e!=water,fire is "neither", not "not both".
    const both = separator === "+";
    return { kind: (op === "!=" ? !both : both) ? "and" : "or", items };
  }
  if (!valueIsUsable(def, key, value, errors)) return null;
  return { kind: "term", key: def, op, value };
}

export function parse(input: string): Parsed {
  const { tokens, errors } = tokenize(input);
  const options: Options = { unique: "cards", sort: null, order: null };
  const bare: { text: string; exact: boolean }[] = [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function wrap(node: Node | null, negate: boolean | undefined): Node | null {
    if (node === null) return null;
    return negate ? { kind: "not", item: node } : node;
  }

  function parseUnary(): Node | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === "not") { next(); const inner = parseUnary(); return inner ? { kind: "not", item: inner } : null; }
    if (t.kind === "lparen") {
      next();
      const inner = parseOr();
      if (peek()?.kind === "rparen") next(); else errors.push("missing closing parenthesis");
      return inner;
    }
    if (t.kind === "rparen") { next(); errors.push("unexpected closing parenthesis"); return null; }
    if (t.kind === "term") {
      next();
      const node = resolveTerm(t, options, errors);
      if (node?.kind === "bare") bare.push({ text: node.text, exact: node.exact });
      return wrap(node, t.negate);
    }
    // stray or/and
    next();
    return null;
  }

  function parseAnd(): Node | null {
    const items: Node[] = [];
    while (pos < tokens.length) {
      const t = peek();
      if (t.kind === "or" || t.kind === "rparen") break;
      if (t.kind === "and") { next(); continue; }
      const node = parseUnary();
      if (node) items.push(node);
    }
    if (items.length === 0) return null;
    return items.length === 1 ? items[0] : { kind: "and", items };
  }

  function parseOr(): Node | null {
    const items: Node[] = [];
    let first = parseAnd();
    if (first) items.push(first);
    while (peek()?.kind === "or") {
      next();
      first = parseAnd();
      if (first) items.push(first);
    }
    if (items.length === 0) return null;
    return items.length === 1 ? items[0] : { kind: "or", items };
  }

  const ast = parseOr();
  if (pos < tokens.length) {
    // leftover tokens (an unmatched ')' at top level)
    while (pos < tokens.length) { if (next().kind === "rparen") errors.push("unexpected closing parenthesis"); }
  }
  return { ast, options, errors, bare };
}

/** The whole query is exactly a registry id or an official slug: the UI
 * jumps straight to the page instead of searching. */
export function directLookup(input: string): { kind: "card" | "printing" | "slug"; value: string } | null {
  const q = input.trim();
  if (/^[cC]\d{6}$/.test(q)) return { kind: "card", value: q.toUpperCase() };
  if (/^[pP]\d{6}$/.test(q)) return { kind: "printing", value: q.toUpperCase() };
  if (/^\d{3}-[a-z0-9_]+-[a-z]+-[a-z]+(-r)?$/.test(q)) return { kind: "slug", value: q };
  return null;
}
