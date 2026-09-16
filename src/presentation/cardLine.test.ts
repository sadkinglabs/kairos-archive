import { describe, expect, it } from "vitest";
import { costLine, powerReading, statLine, thresholdLine, typeLine } from "./cardLine";

const thr = { thr_air: 0, thr_earth: 0, thr_fire: 0, thr_water: 0 };

describe("typeLine", () => {
  it("joins the type and subtypes with middle dots", () => {
    expect(typeLine({ type: "Minion", subtypes: ["Mortal", "Beast"] })).toBe("Minion · Mortal · Beast");
  });
  it("caps the subtypes at max and counts the rest", () => {
    const many = { type: "Minion", subtypes: ["Angel", "Beast", "Demon", "Dragon", "Dwarf", "Faerie"] };
    expect(typeLine(many, 4)).toBe("Minion · Angel · Beast · Demon · Dragon and 2 more");
    expect(typeLine(many, 6)).toBe("Minion · Angel · Beast · Demon · Dragon · Dwarf · Faerie");
    expect(typeLine({ type: "Minion", subtypes: ["Mortal"] }, 4)).toBe("Minion · Mortal");
  });
  it("copes with no subtypes and no type", () => {
    expect(typeLine({ type: "Site", subtypes: [] })).toBe("Site");
    expect(typeLine({ type: null, subtypes: [] })).toBe("");
  });
});

describe("thresholdLine", () => {
  it("names each non-zero element after its number, in element order", () => {
    expect(thresholdLine({ ...thr, thr_water: 2, thr_air: 1 })).toBe("1 Air, 2 Water");
  });
  it("is empty when nothing is needed", () => {
    expect(thresholdLine(thr)).toBe("");
  });
});

describe("costLine", () => {
  it("puts cost before threshold", () => {
    expect(costLine({ ...thr, cost: 3, thr_fire: 1 })).toBe("Cost 3 · 1 Fire");
  });
  it("shows a free card's threshold alone and a costless card's cost alone", () => {
    expect(costLine({ ...thr, cost: 0, thr_earth: 1 })).toBe("Cost 0 · 1 Earth");
    expect(costLine({ ...thr, cost: 2 })).toBe("Cost 2");
    expect(costLine({ ...thr, cost: null, thr_water: 1 })).toBe("1 Water");
    expect(costLine({ ...thr, cost: null })).toBe("");
  });
});

describe("powerReading", () => {
  it("reads power alone when attack equals defense", () => {
    expect(powerReading({ attack: 4, defense: 4, power: 4 })).toEqual({ label: "Power", value: "4" });
    expect(powerReading({ attack: 0, defense: 0, power: 0 })).toEqual({ label: "Power", value: "0" });
  });
  it("shows both numbers when they differ", () => {
    expect(powerReading({ attack: 3, defense: 5, power: 4 })).toEqual({ label: "Attack / Defense", value: "3 / 5" });
  });
  it("is null for a card with no fighting numbers", () => {
    expect(powerReading({ attack: null, defense: null, power: null })).toBeNull();
  });
});

describe("statLine", () => {
  const none = { attack: null, defense: null, power: null, life: null };
  it("reads power for a minion, life for an avatar, both when both are set", () => {
    expect(statLine({ ...none, attack: 4, defense: 4, power: 4 })).toBe("Power 4");
    expect(statLine({ ...none, life: 20 })).toBe("Life 20");
    expect(statLine({ ...none, attack: 1, defense: 1, power: 1, life: 20 })).toBe("Power 1 · Life 20");
    expect(statLine({ ...none, attack: 0, defense: 0, power: 0 })).toBe("Power 0");
    expect(statLine(none)).toBe("");
  });
  it("names attack and defense when they differ", () => {
    expect(statLine({ ...none, attack: 3, defense: 5, power: 4 })).toBe("Attack 3 · Defense 5");
  });
});
