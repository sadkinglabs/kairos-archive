import { describe, expect, it } from "vitest";
import { pickRandom } from "./pick";

describe("pickRandom", () => {
  const items = ["a", "b", "c", "d"];
  it("maps the whole [0, 1) range evenly onto the items", () => {
    expect(pickRandom(items, () => 0)).toBe("a");
    expect(pickRandom(items, () => 0.24)).toBe("a");
    expect(pickRandom(items, () => 0.25)).toBe("b");
    expect(pickRandom(items, () => 0.5)).toBe("c");
    expect(pickRandom(items, () => 0.99999)).toBe("d");
  });
  it("cannot fall off either end", () => {
    // Math.random() never returns 1, but a stub or a future source might.
    expect(pickRandom(items, () => 1)).toBe("d");
    expect(pickRandom(items, () => 1.5)).toBe("d");
    expect(pickRandom(items, () => -0.5)).toBe("a");
  });
  it("reaches every item", () => {
    const seen = new Set(items.map((_, i) => pickRandom(items, () => i / items.length)));
    expect(seen).toEqual(new Set(items));
  });
  it("has nothing to pick from an empty list", () => {
    expect(pickRandom([], () => 0)).toBeNull();
  });
  it("picks without a source of its own", () => {
    expect(items).toContain(pickRandom(items));
  });
});
