import { describe, expect, it } from "vitest";
import { parse } from "./query";
import { MAX_LENGTH, markText, rulesPhrases, snippet, type Phrase } from "./snippet";

/** The phrases these cases mean: substring unless a case says otherwise. */
const some = (...texts: string[]): Phrase[] => texts.map((text) => ({ text, whole: false }));
const word = (text: string): Phrase => ({ text, whole: true });

describe("rulesPhrases", () => {
  it("collects the values of r: terms", () => {
    expect(rulesPhrases(parse('r:"draw a spell" t:minion').ast)).toEqual(some("draw a spell"));
  });
  it("accepts the rules alias, and carries each operator's own meaning", () => {
    // r:draw marks any "draw"; r=spell marks only the whole word, so the
    // two cannot be collapsed into one list of plain strings.
    expect(rulesPhrases(parse("rules:draw r=spell").ast)).toEqual([{ text: "draw", whole: false }, { text: "spell", whole: true }]);
  });
  it("skips negated terms, whichever way they are written", () => {
    expect(rulesPhrases(parse("-r:draw not r:spell r!=curse r:genesis").ast)).toEqual(some("genesis"));
  });
  it("walks into groups and or", () => {
    expect(rulesPhrases(parse("(r:draw or r:discard) t:magic").ast)).toEqual(some("draw", "discard"));
  });
  it("ignores bare words and other keys", () => {
    expect(rulesPhrases(parse("bear t:minion e:water").ast)).toEqual([]);
  });
  it("dedupes case-insensitively and returns nothing for an empty query", () => {
    expect(rulesPhrases(parse("r:Draw r:draw").ast)).toEqual(some("Draw"));
    expect(rulesPhrases(null)).toEqual([]);
  });
});

describe("snippet", () => {
  const text = "Spellcaster\nGenesis → Draw a spell. When this minion dies, each player draws a card.";
  it("returns the first sentence containing a phrase, with the phrase marked", () => {
    expect(snippet(text, some("draw a spell"))).toBe("Genesis → <mark>Draw a spell</mark>.");
  });
  it("matches case-insensitively and keeps the text's own casing", () => {
    expect(snippet(text, some("GENESIS"))).toBe("<mark>Genesis</mark> → Draw a spell.");
  });
  it("marks every phrase in the chosen sentence", () => {
    expect(snippet(text, some("dies", "card"))).toBe("When this minion <mark>dies</mark>, each player draws a <mark>card</mark>.");
  });
  it("picks the sentence by the first phrase found in reading order, not phrase order", () => {
    expect(snippet(text, some("card", "dies"))).toBe("When this minion <mark>dies</mark>, each player draws a <mark>card</mark>.");
  });
  it("matches inside words, as the r: key does", () => {
    expect(snippet(text, some("spell"))).toBe("<mark>Spell</mark>caster");
  });
  it("returns null when no phrase matches, when the text is empty or when there are no phrases", () => {
    expect(snippet(text, some("submerge"))).toBeNull();
    expect(snippet("", some("draw"))).toBeNull();
    expect(snippet(null, some("draw"))).toBeNull();
    expect(snippet(text, [])).toBeNull();
    expect(snippet(text, some(""))).toBeNull();
  });
  it("escapes HTML in the text before marking", () => {
    expect(snippet('Deal 1 damage to <b>"targets"</b> & friends.', some("targets")))
      .toBe("Deal 1 damage to &lt;b&gt;&quot;<mark>targets</mark>&quot;&lt;/b&gt; &amp; friends.");
  });
  it("treats regex characters in a phrase literally", () => {
    expect(snippet("Costs (1) less. Deal 2+1 damage.", some("(1)"))).toBe("Costs <mark>(1)</mark> less.");
    expect(snippet("Costs (1) less. Deal 2+1 damage.", some("2+1"))).toBe("Deal <mark>2+1</mark> damage.");
  });
  it("prefers the longer phrase when phrases overlap", () => {
    expect(snippet("Draw a spell.", some("spell", "a spell"))).toBe("Draw <mark>a spell</mark>.");
  });
  it("cuts a long sentence to a window around the match", () => {
    const long = `${"Lorem ipsum dolor sit amet ".repeat(12)}draw a spell ${"consectetur adipiscing elit ".repeat(12)}`.trim() + ".";
    const out = snippet(long, some("draw a spell"))!;
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("<mark>draw a spell</mark>");
    expect(out.replace(/<\/?mark>/g, "").length).toBeLessThanOrEqual(MAX_LENGTH + 2);
    expect(out).toMatch(/^…Lorem ipsum/);
    expect(out).toMatch(/adipiscing elit…$/);
  });
  it("leaves a sentence at the limit uncut", () => {
    const exact = "x".repeat(MAX_LENGTH - 5) + " draw";
    expect(snippet(exact, some("draw"))).toBe(`${"x".repeat(MAX_LENGTH - 5)} <mark>draw</mark>`);
  });
});

describe("markText", () => {
  it("marks every match across the whole text and keeps line breaks", () => {
    expect(markText("Draw a spell.\nThen draw another.", some("draw"))).toBe("<mark>Draw</mark> a spell.\nThen <mark>draw</mark> another.");
  });
  it("escapes without marking when there are no phrases, and reads null as empty", () => {
    expect(markText("a < b & c", [])).toBe("a &lt; b &amp; c");
    expect(markText(null, some("x"))).toBe("");
  });
});

describe("marking a whole-word match", () => {
  const text = "Submerge. Dragons drag their prey.";
  it("carries the operator through from the query", () => {
    expect(rulesPhrases(parse("r=drag").ast)).toEqual([word("drag")]);
    expect(rulesPhrases(parse("r==drag").ast)).toEqual([word("drag")]);
    expect(rulesPhrases(parse("r:drag").ast)).toEqual(some("drag"));
  });
  it("keeps the two apart when both are asked for", () => {
    expect(rulesPhrases(parse("r:drag r=drag").ast)).toEqual([{ text: "drag", whole: false }, { text: "drag", whole: true }]);
  });
  it("marks only the word when the query asked for the word", () => {
    expect(markText(text, [word("drag")])).toBe("Submerge. Dragons <mark>drag</mark> their prey.");
  });
  it("marks every occurrence when the query asked for the substring", () => {
    expect(markText(text, some("drag"))).toBe("Submerge. <mark>Drag</mark>ons <mark>drag</mark> their prey.");
  });
  it("marks a phrase across a line break, spanning the real text", () => {
    expect(markText("Spellcaster\nGenesis → Draw.", [word("spellcaster genesis")]))
      .toBe("<mark>Spellcaster\nGenesis</mark> → Draw.");
  });
  it("never marks inside a longer word for a phrase asked as words", () => {
    expect(markText("Redraw a spellbook.", [word("draw a spell")])).toBe("Redraw a spellbook.");
    expect(markText("Redraw a spellbook.", some("draw a spell"))).toBe("Re<mark>draw a spell</mark>book.");
  });
  it("escapes the text it marks", () => {
    expect(markText("<b> drag", [word("drag")])).toBe("&lt;b&gt; <mark>drag</mark>");
  });
  it("does not let one mark overlap another", () => {
    expect(markText("draw a spell", [some("draw a")[0]!, some("a spell")[0]!])).toBe("<mark>draw a spell</mark>");
  });
});
