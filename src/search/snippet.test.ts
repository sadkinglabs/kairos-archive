import { describe, expect, it } from "vitest";
import { parse } from "./query";
import { MAX_LENGTH, markText, rulesPhrases, snippet } from "./snippet";

describe("rulesPhrases", () => {
  it("collects the values of r: terms", () => {
    expect(rulesPhrases(parse('r:"draw a spell" t:minion').ast)).toEqual(["draw a spell"]);
  });
  it("accepts the rules alias and both including operators", () => {
    expect(rulesPhrases(parse("rules:draw r=spell").ast)).toEqual(["draw", "spell"]);
  });
  it("skips negated terms, whichever way they are written", () => {
    expect(rulesPhrases(parse("-r:draw not r:spell r!=curse r:genesis").ast)).toEqual(["genesis"]);
  });
  it("walks into groups and or", () => {
    expect(rulesPhrases(parse("(r:draw or r:discard) t:magic").ast)).toEqual(["draw", "discard"]);
  });
  it("ignores bare words and other keys", () => {
    expect(rulesPhrases(parse("bear t:minion e:water").ast)).toEqual([]);
  });
  it("dedupes case-insensitively and returns nothing for an empty query", () => {
    expect(rulesPhrases(parse("r:Draw r:draw").ast)).toEqual(["Draw"]);
    expect(rulesPhrases(null)).toEqual([]);
  });
});

describe("snippet", () => {
  const text = "Spellcaster\nGenesis → Draw a spell. When this minion dies, each player draws a card.";
  it("returns the first sentence containing a phrase, with the phrase marked", () => {
    expect(snippet(text, ["draw a spell"])).toBe("Genesis → <mark>Draw a spell</mark>.");
  });
  it("matches case-insensitively and keeps the text's own casing", () => {
    expect(snippet(text, ["GENESIS"])).toBe("<mark>Genesis</mark> → Draw a spell.");
  });
  it("marks every phrase in the chosen sentence", () => {
    expect(snippet(text, ["dies", "card"])).toBe("When this minion <mark>dies</mark>, each player draws a <mark>card</mark>.");
  });
  it("picks the sentence by the first phrase found in reading order, not phrase order", () => {
    expect(snippet(text, ["card", "dies"])).toBe("When this minion <mark>dies</mark>, each player draws a <mark>card</mark>.");
  });
  it("matches inside words, as the r: key does", () => {
    expect(snippet(text, ["spell"])).toBe("<mark>Spell</mark>caster");
  });
  it("returns null when no phrase matches, when the text is empty or when there are no phrases", () => {
    expect(snippet(text, ["submerge"])).toBeNull();
    expect(snippet("", ["draw"])).toBeNull();
    expect(snippet(null, ["draw"])).toBeNull();
    expect(snippet(text, [])).toBeNull();
    expect(snippet(text, [""])).toBeNull();
  });
  it("escapes HTML in the text before marking", () => {
    expect(snippet('Deal 1 damage to <b>"targets"</b> & friends.', ["targets"]))
      .toBe("Deal 1 damage to &lt;b&gt;&quot;<mark>targets</mark>&quot;&lt;/b&gt; &amp; friends.");
  });
  it("treats regex characters in a phrase literally", () => {
    expect(snippet("Costs (1) less. Deal 2+1 damage.", ["(1)"])).toBe("Costs <mark>(1)</mark> less.");
    expect(snippet("Costs (1) less. Deal 2+1 damage.", ["2+1"])).toBe("Deal <mark>2+1</mark> damage.");
  });
  it("prefers the longer phrase when phrases overlap", () => {
    expect(snippet("Draw a spell.", ["spell", "a spell"])).toBe("Draw <mark>a spell</mark>.");
  });
  it("cuts a long sentence to a window around the match", () => {
    const long = `${"Lorem ipsum dolor sit amet ".repeat(12)}draw a spell ${"consectetur adipiscing elit ".repeat(12)}`.trim() + ".";
    const out = snippet(long, ["draw a spell"])!;
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("<mark>draw a spell</mark>");
    expect(out.replace(/<\/?mark>/g, "").length).toBeLessThanOrEqual(MAX_LENGTH + 2);
    expect(out).toMatch(/^…Lorem ipsum/);
    expect(out).toMatch(/adipiscing elit…$/);
  });
  it("leaves a sentence at the limit uncut", () => {
    const exact = "x".repeat(MAX_LENGTH - 5) + " draw";
    expect(snippet(exact, ["draw"])).toBe(`${"x".repeat(MAX_LENGTH - 5)} <mark>draw</mark>`);
  });
});

describe("markText", () => {
  it("marks every match across the whole text and keeps line breaks", () => {
    expect(markText("Draw a spell.\nThen draw another.", ["draw"])).toBe("<mark>Draw</mark> a spell.\nThen <mark>draw</mark> another.");
  });
  it("escapes without marking when there are no phrases, and reads null as empty", () => {
    expect(markText("a < b & c", [])).toBe("a &lt; b &amp; c");
    expect(markText(null, ["x"])).toBe("");
  });
});
