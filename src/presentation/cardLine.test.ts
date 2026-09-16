import { describe, expect, it } from "vitest";
import { costLine, statLine, thresholdLine, typeLine } from "./cardLine";

const thr = { thr_air: 0, thr_earth: 0, thr_fire: 0, thr_water: 0 };

describe("typeLine", () => {
  it("joins the type and subtypes with middle dots", () => {
    expect(typeLine({ type: "Minion", subtypes: ["Mortal", "Beast"] })).toBe("Minion · Mortal · Beast");
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

describe("statLine", () => {
  it("reads power for a minion, life for an avatar, both when both are set", () => {
    expect(statLine({ power: 4, life: null })).toBe("Power 4");
    expect(statLine({ power: null, life: 20 })).toBe("Life 20");
    expect(statLine({ power: 1, life: 20 })).toBe("Power 1 · Life 20");
    expect(statLine({ power: 0, life: null })).toBe("Power 0");
    expect(statLine({ power: null, life: null })).toBe("");
  });
});
