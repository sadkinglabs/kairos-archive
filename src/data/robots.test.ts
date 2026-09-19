/** The site's robots.txt, read the way a crawler reads it.
 *
 * Two things have to hold. The sitemap and the file must agree, because
 * a sitemap listing a URL robots.txt refuses contradicts itself and a
 * crawler reports it. And every link unfurler must be allowed the whole
 * site: when somebody pastes a Kairos Archive link into a chat, the
 * preview underneath it is the archive's front door, and a refusal here
 * means no preview at all.
 *
 * robots.txt is read in groups. A crawler uses the one group whose
 * User-agent names it, and only falls back to the * group when no group
 * names it - so a named group replaces the default rather than adding
 * to it. These tests follow that rule rather than searching the file
 * for strings, which would pass while the real behaviour was wrong. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const robots = readFileSync("public/robots.txt", "utf8");

interface Group { agents: string[]; disallow: string[] }

/** The file as its groups: consecutive User-agent lines collect the
 * agents a following rule block applies to. */
function groups(text: string): Group[] {
  const out: Group[] = [];
  let current: Group | null = null;
  let naming = false;               // still reading this group's agents
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [field = "", ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const name = field.trim().toLowerCase();
    if (name === "user-agent") {
      if (!current || !naming) { current = { agents: [], disallow: [] }; out.push(current); naming = true; }
      current.agents.push(value.toLowerCase());
    } else if (name === "disallow") {
      if (!current) continue;
      naming = false;
      if (value) current.disallow.push(value);
    } else if (name === "allow") {
      naming = false;
    }
  }
  return out;
}

const all = groups(robots);

/** The group a crawler of this name obeys: its own if one names it,
 * otherwise the * group. */
function groupFor(agent: string): Group {
  const named = all.find((g) => g.agents.includes(agent.toLowerCase()));
  return named ?? all.find((g) => g.agents.includes("*"))!;
}

const allows = (agent: string, path: string): boolean =>
  !groupFor(agent).disallow.some((rule) => path.startsWith(rule));

/** Every service that draws a preview card from a pasted link. */
const UNFURLERS = ["Discordbot", "Twitterbot", "facebookexternalhit", "Slackbot", "Slackbot-LinkExpanding", "WhatsApp", "TelegramBot", "LinkedInBot", "redditbot"];

describe("robots.txt", () => {
  it("names the sitemap and opens the site to crawlers", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Sitemap: https://kairosarchive.net/sitemap-index.xml");
    expect(allows("Googlebot", "/cards/C000230/polar-bears")).toBe(true);
  });

  it("keeps indexing crawlers off the endless query pages and the Pages Function", () => {
    expect(allows("Googlebot", "/search")).toBe(false);
    expect(allows("Googlebot", "/random")).toBe(false);
  });

  it("refuses an indexing crawler nothing that the archive is made of", () => {
    for (const path of ["/cards", "/sets", "/docs", "/syntax", "/advanced", "/fun", "/changes", "/about"]) {
      expect(allows("Googlebot", path), path).toBe(true);
    }
  });

  // The one that matters for Discord: a pasted search link must unfurl.
  it("allows every link unfurler the whole site, /search included", () => {
    for (const agent of UNFURLERS) {
      expect(allows(agent, "/search"), agent).toBe(true);
      expect(allows(agent, "/random"), agent).toBe(true);
      expect(allows(agent, "/cards/C000230/polar-bears"), agent).toBe(true);
    }
  });

  it("gives the unfurlers their own group, so they never fall back to the default", () => {
    for (const agent of UNFURLERS) {
      expect(groupFor(agent).agents, agent).not.toContain("*");
    }
  });
});
