import { describe, expect, it } from "vitest";
import { describeChoice, describeElements, describeList } from "./describe";

describe("describeElements", () => {
  it("reads as words, not as a query", () => {
    expect(describeElements(["Water", "Fire"], "all")).toBe("Water and Fire");
    expect(describeElements(["Water", "Fire"], "any")).toBe("Water or Fire");
    expect(describeElements(["Water", "Fire"], "only")).toBe("only Water and Fire");
    expect(describeElements(["Multi", "Water"], "all")).toBe("two or more elements, Water");
    expect(describeElements(["Water", "Fire"], "mono")).toBe("one classification, Water or Fire");
    expect(describeElements(["Air", "Earth", "Water"], "all")).toBe("Air, Earth and Water");
  });
  it("covers the picks that need no element ticked", () => {
    expect(describeElements([], "all")).toBe("");
    expect(describeElements([], "any")).toBe("");
    expect(describeElements([], "only")).toBe("");
    expect(describeElements(["Multi"], "all")).toBe("two or more elements");
    expect(describeElements([], "mono")).toBe("one classification only (including no element)");
  });
  it("words no element like any other value", () => {
    expect(describeElements(["None", "Water"], "mono")).toBe("one classification, no element or Water");
    expect(describeElements(["None"], "all")).toBe("no element");
    expect(describeElements(["None"], "only")).toBe("only no element");
    expect(describeElements(["None", "Water"], "any")).toBe("no element or Water");
    expect(describeElements(["None", "Water"], "all")).toBe("no element and Water");
    expect(describeElements(["None", "Water", "Fire"], "any")).toBe("no element, Water or Fire");
    expect(describeElements(["Multi", "Water", "Fire"], "any")).toBe("two or more elements, Water or Fire");
  });
});

describe("describeList", () => {
  it("joins with and for +, or for a comma", () => {
    expect(describeList([], "+")).toBe("");
    expect(describeList(["Beast"], "+")).toBe("Beast");
    expect(describeList(["Beast", "Spirit"], "+")).toBe("Beast and Spirit");
    expect(describeList(["Airborne", "Lethal"], ",")).toBe("Airborne or Lethal");
    expect(describeList(["Angel", "Demon", "Dragon"], ",")).toBe("Angel, Demon or Dragon");
  });
});

describe("describeChoice", () => {
  it("says a number with the word on its operator", () => {
    expect(describeChoice({ label: "mana cost", operatorWord: "at most", value: "3" })).toBe("mana cost at most 3");
    expect(describeChoice({ label: "attack", operatorWord: "over", value: "4" })).toBe("attack over 4");
    expect(describeChoice({ label: "released", operatorWord: "at least", value: "2024", optionText: "2024" })).toBe("released at least 2024");
  });
  it("fills a phrase in for a typed value, and trusts an option's own wording", () => {
    expect(describeChoice({ say: "named %s", value: "polar bears" })).toBe("named polar bears");
    expect(describeChoice({ say: "rules mention %s", value: "draw a spell" })).toBe("rules mention draw a spell");
    expect(describeChoice({ value: "Unique", optionText: "Unique" })).toBe("Unique");
    expect(describeChoice({ value: "Changed", optionText: "Changed since printing" })).toBe("Changed since printing");
    expect(describeChoice({ say: "sorted by %s", value: "threshold", optionText: "Threshold total" })).toBe("sorted by Threshold total");
    expect(describeChoice({ say: "%s order", value: "desc", optionText: "Descending" })).toBe("Descending order");
  });
  it("says nothing for an untouched control", () => {
    expect(describeChoice({ value: "" })).toBe("");
    expect(describeChoice({ value: "   ", say: "named %s" })).toBe("");
  });
});

describe("complete words", () => {
  it("says so, because the tick changes what the filter means", () => {
    expect(describeChoice({ value: "drag", say: "rules mention %s", wholeWords: true })).toBe("rules mention drag (complete words)");
    expect(describeChoice({ value: "drag", say: "rules mention %s" })).toBe("rules mention drag");
  });
  it("adds nothing to an empty field", () => {
    expect(describeChoice({ value: "  ", say: "rules mention %s", wholeWords: true })).toBe("");
  });
});
