/** The site's robots.txt and its sitemap have to agree: a sitemap that
 * lists a URL robots.txt refuses contradicts itself, and a crawler
 * reports it. These read the files the build ships. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const robots = readFileSync("public/robots.txt", "utf8");
const disallowed = robots.split("\n").filter((l) => l.startsWith("Disallow:")).map((l) => l.replace("Disallow:", "").trim());

describe("robots.txt", () => {
  it("lets crawlers at the site and names the sitemap", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://kairosarchive.net/sitemap-index.xml");
  });
  it("keeps them off the endless query pages and the Pages Function", () => {
    expect(disallowed).toContain("/search");
    expect(disallowed).toContain("/random");
  });
  it("refuses nothing that the card pages need", () => {
    for (const path of ["/cards", "/sets", "/docs", "/syntax", "/advanced", "/fun"]) {
      expect(disallowed, path).not.toContain(path);
    }
  });
});
