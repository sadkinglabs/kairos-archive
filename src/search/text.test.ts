import { describe, expect, it } from "vitest";
import { findRanges, textMatches } from "./text";

const contains = (text: string | null | undefined, value: string) => textMatches(text, value, false);
const word = (text: string | null | undefined, value: string) => textMatches(text, value, true);

describe("substring matching, unchanged", () => {
  it("finds the value anywhere in the text", () => {
    expect(contains("Dragon Rider", "drag")).toBe(true);
    expect(contains("Dragon Rider", "gon rid")).toBe(true);
    expect(contains("Dragon Rider", "wyrm")).toBe(false);
  });
  it("ignores case on both sides", () => {
    expect(contains("DRAGON", "drag")).toBe(true);
    expect(word("DRAGON", "dragon")).toBe(true);
  });
  it("treats an absent field as empty rather than throwing", () => {
    expect(contains(null, "drag")).toBe(false);
    expect(word(undefined, "drag")).toBe(false);
  });
  it("matches nothing for an empty value", () => {
    expect(contains("Dragon", "")).toBe(false);
    expect(word("Dragon", "   ")).toBe(false);
  });
});

describe("complete words", () => {
  it("is the difference between drag and Dragon", () => {
    expect(word("Dragon Rider", "drag")).toBe(false);
    expect(word("Drag the body", "drag")).toBe(true);
  });
  it("finds the word later in the text, past a longer word containing it", () => {
    expect(word("Dragons drag their prey", "drag")).toBe(true);
  });
  it("counts punctuation and line breaks as boundaries", () => {
    expect(word("Take a step, then move.", "step")).toBe(true);
    expect(word("(step)", "step")).toBe(true);
    expect(word("step\nforward", "forward")).toBe(true);
    expect(word("end.", "end")).toBe(true);
  });
  it("treats a hyphen as a boundary, so force-move holds both words", () => {
    expect(word("force-move the minion", "force")).toBe(true);
    expect(word("force-move the minion", "move")).toBe(true);
    expect(word("force-move the minion", "force-move")).toBe(true);
  });
  it("does not match across a word it only partly covers", () => {
    expect(word("stepped forward", "step")).toBe(false);
    expect(word("footstep", "step")).toBe(false);
  });
  it("counts digits as part of a word", () => {
    expect(word("deals 10 damage", "10")).toBe(true);
    expect(word("deals 100 damage", "10")).toBe(false);
  });
  it("does not demand a boundary where the value itself begins with punctuation", () => {
    expect(word("gets +1 attack", "+1")).toBe(true);
  });
  it("reads letters beyond ASCII as letters, which \\\\b would not", () => {
    expect(word("Ârd the Bold", "ârd")).toBe(true);
    expect(word("Ârdent", "ârd")).toBe(false);
    expect(word("naïve", "naïve")).toBe(true);
  });
});

describe("phrases", () => {
  it("needs the whole phrase, with boundaries at its ends", () => {
    expect(word("Draw a spell now", "draw a spell")).toBe(true);
    expect(word("Redraw a spellbook", "draw a spell")).toBe(false);
  });
  it("tolerates repeated spaces and line breaks in the text", () => {
    expect(word("draw  a\nspell", "draw a spell")).toBe(true);
    expect(contains("draw  a\nspell", "draw a spell")).toBe(true);
  });
  it("tolerates them in the value too", () => {
    expect(word("draw a spell", "draw   a spell")).toBe(true);
  });
});

describe("the value is text, never a pattern", () => {
  it("searches for metacharacters literally", () => {
    expect(contains("cost .* to play", ".*")).toBe(true);
    expect(contains("cost two to play", ".*")).toBe(false);
    expect(word("a (b) c", "(b)")).toBe(true);
    expect(contains("a+b", "a+b")).toBe(true);
    expect(contains("aab", "a+b")).toBe(false);
  });
  it("cannot be made to backtrack or throw", () => {
    expect(contains("aaaaaaaaaaaaaaaaaaaa", "(a+)+$")).toBe(false);
    expect(() => contains("x", "[")).not.toThrow();
    expect(() => word("x", "\\\\")).not.toThrow();
  });
});

describe("findRanges", () => {
  it("returns every non-overlapping occurrence", () => {
    expect(findRanges("drag drag", "drag", true)).toEqual([{ start: 0, end: 4 }, { start: 5, end: 9 }]);
  });
  it("skips the occurrences inside longer words", () => {
    expect(findRanges("dragon drag", "drag", true)).toEqual([{ start: 7, end: 11 }]);
    expect(findRanges("dragon drag", "drag", false)).toEqual([{ start: 0, end: 4 }, { start: 7, end: 11 }]);
  });
  it("returns nothing for an empty needle or haystack", () => {
    expect(findRanges("", "drag", true)).toEqual([]);
    expect(findRanges("drag", "", true)).toEqual([]);
  });
});
