import { describe, expect, it } from "vitest";
import { pagePath } from "./pagePath";

describe("the served path of a page", () => {
  it("is the route in dev and the file's route in a build", () => {
    expect(pagePath("/sets")).toBe("/sets");
    expect(pagePath("/sets.html")).toBe("/sets");
    expect(pagePath("/docs/cards.html")).toBe("/docs/cards");
    expect(pagePath("/cards/C000230/polar-bears.html")).toBe("/cards/C000230/polar-bears");
  });
  it("is / for the home page however the build names it", () => {
    for (const p of ["/", "/index.html", ""]) expect(pagePath(p)).toBe("/");
  });
});
