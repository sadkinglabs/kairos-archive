import { describe, expect, it } from "vitest";
import { RENDITIONS, imagePattern } from "./images";

const BASE = "https://api.kairosarchive.net/images/P001319.efc584687ded";
const urls = {
  small: `${BASE}.small.webp`,
  normal: `${BASE}.normal.webp`,
  large: `${BASE}.large.webp`,
  original: `${BASE}.original.png`,
};

describe("image addresses", () => {
  it("shows the one word that changes between the three WebP renditions", () => {
    expect(imagePattern(urls)).toBe(`${BASE}.{rendition}.webp`);
  });
  it("teaches no pattern when the addresses do not follow one", () => {
    expect(imagePattern(null)).toBeNull();
    expect(imagePattern(undefined)).toBeNull();
    expect(imagePattern({ normal: `${BASE}.normal.png` })).toBeNull();
    // The original is deliberately excluded: it keeps the publisher's
    // format, so it cannot be reached by swapping the rendition word.
    expect(imagePattern({ ...urls, small: "https://elsewhere.example/a.small.webp" })).toBeNull();
  });
  it("leads with the rendition worth copying", () => {
    expect(RENDITIONS[0].key).toBe("normal");
    expect(RENDITIONS.map(r => r.key)).toEqual(["normal", "small", "large", "original"]);
  });
});
