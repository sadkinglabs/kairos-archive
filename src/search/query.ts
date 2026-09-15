/** Tokenizer and parser for the Kairos query language. Produces an AST
 * of typed terms resolved against the key table, plus the options that
 * are not filters (unique:, sort:, order:) and a list of errors a user
 * can act on. Pure: no DOM, no data. */

import { HAS_FLAGS, IS_FLAGS, KEY_BY_ALIAS, SORT_FIELDS, UNITS, type KeyDef, type Op, type SortField, type Unit } from "./keys";

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

const OPS: Op[] = ["!=", "<=", ">=", ":", "=", "<", ">"];

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
    const m = /^([A-Za-z][A-Za-z.-]*)(!=|<=|>=|:|=|<|>)/.exec(rest);
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
    const lower = word.toLowerCase();
    if (!negate && lower === "or") { tokens.push({ kind: "or" }); continue; }
    if (!negate && lower === "and") { tokens.push({ kind: "and" }); continue; }
    if (!negate && lower === "not") { tokens.push({ kind: "not" }); continue; }
    tokens.push({ kind: "term", negate, value: word, exact: false, quoted: false });
  }
  return { tokens, errors };
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
  if (!numeric && op !== ":" && op !== "=" && op !== "!=") {
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
    if (exactSet) return { kind: "term", key: def, op, value };
    const items: Node[] = parts.map((part) => ({ kind: "term", key: def, op, value: part }));
    // De Morgan: each term already carries the negation, so the join has to
    // flip with it. e!=water,fire is "neither", not "not both".
    const both = separator === "+";
    return { kind: (op === "!=" ? !both : both) ? "and" : "or", items };
  }
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
