import { describe, expect, it } from "vitest";
import { describeChoice, describeElements, describeList } from "./describe";

describe("describeElements", () => {
  it("reads as words, not as a query", () => {
    expect(describeElements(["Water", "Fire"], "all")).toBe("Water and Fire");
    expect(describeElements(["Water", "Fire"], "any")).toBe("Water or Fire");
    expect(describeElements(["Water", "Fire"], "only")).toBe("only Water and Fire");
    expect(describeElements(["Water"], "multi")).toBe("two or more, including Water");
    expect(describeElements(["Water", "Fire"], "mono")).toBe("one element, Water or Fire");
    expect(describeElements(["Air", "Earth", "Water"], "all")).toBe("Air, Earth and Water");
  });
  it("covers the picks that need no element ticked", () => {
    expect(describeElements([], "all")).toBe("");
    expect(describeElements([], "any")).toBe("");
    expect(describeElements([], "only")).toBe("");
    expect(describeElements([], "multi")).toBe("two or more elements");
    expect(describeElements([], "mono")).toBe("one element only");
  });
  it("says no element whatever it is ticked with, matching the query built", () => {
    for (const match of ["all", "any", "only", "multi", "mono"] as const) {
      expect(describeElements(["None"], match)).toBe("no element");
      expect(describeElements(["None", "Water"], match)).toBe("no element");
    }
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
