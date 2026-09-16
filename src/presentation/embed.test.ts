import { describe, expect, it } from "vitest";
import { MAX_EMBED, embedColour, embedDescription, embedStatsLine, embedTypeLine } from "./embed";

const knight = { type: "Minion", subtypes: ["Mortal"], rarity: "Exceptional", elements: ["Fire", "Water"], cost: 5, attack: 5, defense: 3, power: 4, life: null, thr_air: 0, thr_earth: 0, thr_fire: 1, thr_water: 1, rules_text: "Costs (2) less to cast if you have more life than each opponent." };
const avatar = { ...knight, type: "Avatar", subtypes: [], rarity: null, elements: ["None"], cost: null, attack: 1, defense: 1, power: 1, life: 20, thr_fire: 0, thr_water: 0, rules_text: "Tap → Play or draw a site." };
const site = { ...knight, type: "Site", subtypes: [], rarity: "Unique", elements: ["Air"], cost: null, attack: null, defense: null, power: null, thr_fire: 0, thr_water: 0, rules_text: "" };

describe("embedTypeLine", () => {
  it("reads rarity, type, subtypes and elements", () => {
    expect(embedTypeLine(knight)).toBe("Exceptional Minion — Mortal · Fire, Water");
  });
  it("leaves out what the face lacks, and never says None", () => {
    expect(embedTypeLine(avatar)).toBe("Avatar");
    expect(embedTypeLine(site)).toBe("Unique Site · Air");
  });
});

describe("embedStatsLine", () => {
  it("names each number, with attack and defense when they differ", () => {
    expect(embedStatsLine(knight)).toBe("Mana 5 · Threshold 1 Fire, 1 Water · Attack 5 / Defense 3 · Power 4");
  });
  it("reads power alone when attack equals defense, and life for an avatar", () => {
    expect(embedStatsLine(avatar)).toBe("Power 1 · Life 20");
  });
  it("is empty for a face with no numbers", () => {
    expect(embedStatsLine(site)).toBe("");
  });
});

describe("embedDescription", () => {
  it("stacks the lines and puts the rules text after a blank line", () => {
    expect(embedDescription(knight, ["Arthurian Legends"])).toBe(
      "Exceptional Minion — Mortal · Fire, Water\nMana 5 · Threshold 1 Fire, 1 Water · Attack 5 / Defense 3 · Power 4\nArthurian Legends\n\nCosts (2) less to cast if you have more life than each opponent.");
  });
  it("skips empty lines: no stats, no places, no rules", () => {
    expect(embedDescription(site, [])).toBe("Unique Site · Air");
  });
  it("cuts a long text on a word with an ellipsis", () => {
    const long = { ...knight, rules_text: "word ".repeat(300).trim() };
    const out = embedDescription(long, ["Alpha"]);
    expect(out.length).toBeLessThanOrEqual(MAX_EMBED);
    expect(out.endsWith("word…")).toBe(true);
  });
});

describe("embedColour", () => {
  it("takes the first element's colour and a neutral for colourless", () => {
    expect(embedColour(["Fire", "Water"])).toBe("#c8412b");
    expect(embedColour(["Water"])).toBe("#2b6cb0");
    expect(embedColour(["None"])).toBe("#7d7871");
    expect(embedColour([])).toBe("#7d7871");
  });
});
