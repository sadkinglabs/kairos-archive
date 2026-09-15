import { describe, expect, it } from "vitest";
import { directLookup, parse, tokenize } from "./query";
import { KEYS, IS_FLAGS, HAS_FLAGS } from "./keys";

describe("tokenize", () => {
  it("splits words, quoted phrases, keys with operators, negation and parentheses", () => {
    const { tokens, errors } = tokenize('polar -bears !"Polar Bears" r:"draw a spell" cost>=2 (e:w or e:a) not t:site');
    expect(errors).toEqual([]);
    expect(tokens.map((t) => t.kind)).toEqual(["term", "term", "term", "term", "term", "lparen", "term", "or", "term", "rparen", "not", "term"]);
    expect(tokens[1]).toMatchObject({ negate: true, value: "bears" });
    expect(tokens[2]).toMatchObject({ exact: true, value: "Polar Bears" });
    expect(tokens[3]).toMatchObject({ key: "r", op: ":", value: "draw a spell" });
    expect(tokens[4]).toMatchObject({ key: "cost", op: ">=", value: "2" });
  });
  it("reports an unclosed quote", () => {
    expect(tokenize('r:"draw a').errors).toContain("unclosed quote");
  });
  it("keeps dotted aliases and != together", () => {
    const { tokens } = tokenize("thr.air:1 f!=foil");
    expect(tokens[0]).toMatchObject({ key: "thr.air", op: ":" });
    expect(tokens[1]).toMatchObject({ key: "f", op: "!=", value: "foil" });
  });
});

describe("the key table", () => {
  it("leads with the short key and keeps the descriptive spellings as aliases", () => {
    // The first alias is the key: /syntax heads its row with it and the
    // advanced form writes it, so it is always the shortest spelling.
    for (const key of KEYS) {
      const [first, ...rest] = key.aliases;
      for (const alias of rest) expect(first.length, `${key.name}: ${first} vs ${alias}`).toBeLessThanOrEqual(alias.length);
    }
  });
  it("spells each key exactly once, and never as a reserved word", () => {
    const seen = new Map<string, string>();
    for (const key of KEYS) for (const alias of key.aliases) {
      expect(seen.get(alias), `${alias} is claimed by both ${seen.get(alias)} and ${key.name}`).toBeUndefined();
      seen.set(alias, key.name);
    }
    for (const reserved of ["is", "has", "unique", "sort", "order"]) expect(seen.has(reserved), reserved).toBe(false);
  });
  it("keeps the short keys the owner settled on", () => {
    const keyOf = (name: string) => KEYS.find((k) => k.name === name)!.aliases[0];
    expect(keyOf("rarity")).toBe("rar");
    expect(keyOf("cost")).toBe("m");
    expect(keyOf("life")).toBe("l");
    expect(parse("rar:unique m<=2 l>=20").errors).toEqual([]);
    // The descriptive spellings keep working.
    expect(parse("rarity:unique cost<=2 life>=20").ast).toEqual(parse("rar:unique m<=2 l>=20").ast);
  });
});

describe("parse", () => {
  it("builds and/or/not with precedence and parentheses", () => {
    const { ast, errors } = parse("t:minion (e:water or e:air) -k:genesis");
    expect(errors).toEqual([]);
    expect(ast?.kind).toBe("and");
    if (ast?.kind !== "and") return;
    expect(ast.items[0]).toMatchObject({ kind: "term", key: { name: "type" }, value: "minion" });
    expect(ast.items[1].kind).toBe("or");
    expect(ast.items[2].kind).toBe("not");
  });
  it("accepts and, never requires it", () => {
    expect(parse("t:minion and e:water").ast).toEqual(parse("t:minion e:water").ast);
  });
  it("pulls unique, sort and order out as options", () => {
    const { ast, options, errors } = parse("s:alpha unique:prints sort:cost order:desc");
    expect(errors).toEqual([]);
    expect(options).toEqual({ unique: "prints", sort: "cost", order: "desc" });
    expect(ast?.kind).toBe("term");
  });
  it("rejects unknown keys, flags, sort fields and misused operators with readable errors", () => {
    expect(parse("o:draw").errors[0]).toMatch(/unknown key "o:"/);
    expect(parse("p:booster").errors[0]).toMatch(/unknown key "p:"/);
    expect(parse("is:whatever").errors[0]).toMatch(/unknown flag/);
    expect(parse("sort:price").errors[0]).toMatch(/sort: must be one of/);
    expect(parse("t>minion").errors[0]).toMatch(/only numbers and dates/);
    expect(parse("t:").errors[0]).toMatch(/needs a value/);
    expect(parse("(t:minion").errors[0]).toMatch(/missing closing/);
  });
  it("resolves every alias in the key table and every flag", () => {
    for (const key of KEYS) for (const alias of key.aliases) {
      const p = parse(`${alias}:1`);
      expect(p.errors, alias).toEqual([]);
      expect(p.ast).toMatchObject({ kind: "term", key: { name: key.name } });
    }
    for (const f of IS_FLAGS) expect(parse(`is:${f.name}`).errors).toEqual([]);
    for (const f of HAS_FLAGS) expect(parse(`has:${f.name}`).errors).toEqual([]);
  });
  it("expands a value list into or (,) and and (+)", () => {
    const comma = parse("e:water,fire");
    expect(comma.errors).toEqual([]);
    expect(comma.ast).toEqual({ kind: "or", items: [
      { kind: "term", key: expect.objectContaining({ name: "element" }), op: ":", value: "water" },
      { kind: "term", key: expect.objectContaining({ name: "element" }), op: ":", value: "fire" },
    ] });
    const plus = parse("e:water+fire");
    expect(plus.errors).toEqual([]);
    expect(plus.ast?.kind).toBe("and");
    // Whitespace inside a quoted list, and more than two values.
    expect(parse('s:"alpha, beta, 006"').ast).toMatchObject({ kind: "or", items: [{ value: "alpha" }, { value: "beta" }, { value: "006" }] });
  });
  it("keeps e= with a + list as one term for the evaluator to judge", () => {
    expect(parse("e=water+fire").ast).toMatchObject({ kind: "term", op: "=", value: "water+fire" });
    // Only elements, and only with =: everything else still expands.
    expect(parse("e:water+fire").ast?.kind).toBe("and");
    expect(parse("t=minion+site").ast?.kind).toBe("and");
  });
  it("flips the join for != so a list negates as a whole", () => {
    // e!=water,fire is "neither water nor fire", which is and-of-not-each.
    expect(parse("e!=water,fire").ast?.kind).toBe("and");
    // e!=water+fire is "not both", which is or-of-not-each.
    expect(parse("e!=water+fire").ast?.kind).toBe("or");
  });
  it("leaves commas alone in text and numeric values", () => {
    expect(parse('r:"draw a spell, then"').ast).toMatchObject({ kind: "term", value: "draw a spell, then" });
    expect(parse("cost:1,2").ast).toMatchObject({ kind: "term", value: "1,2" });
  });
  it("rejects a mixed, a one-sided and a stray separator", () => {
    expect(parse("e:water,+fire").errors[0]).toMatch(/mixing , and \+ is ambiguous/);
    expect(parse("e:water,").errors[0]).toMatch(/, needs a value on both sides/);
    expect(parse("e:water + fire").errors[0]).toMatch(/^stray \+ - a value list takes no spaces/);
    // A one-sided list and a stray separator both contribute no node.
    expect(parse("e:water,").ast).toBeNull();
    expect(parse('!"+"').errors).toEqual([]);
  });
  it("collects bare words for the rules-text group", () => {
    const p = parse('polar !"Bears" t:minion');
    expect(p.bare).toEqual([{ text: "polar", exact: false }, { text: "Bears", exact: true }]);
  });
});

describe("directLookup", () => {
  it("recognises ids and slugs, exactly and only", () => {
    expect(directLookup(" c000230 ")).toEqual({ kind: "card", value: "C000230" });
    expect(directLookup("P000937")).toEqual({ kind: "printing", value: "P000937" });
    expect(directLookup("004-witch-b-s")).toEqual({ kind: "slug", value: "004-witch-b-s" });
    expect(directLookup("004-druid-bt-s-r")).toEqual({ kind: "slug", value: "004-druid-bt-s-r" });
    expect(directLookup("C000230 t:minion")).toBeNull();
    expect(directLookup("bears")).toBeNull();
  });
});
