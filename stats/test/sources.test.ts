/** The pure helpers behind the zone report. */
import { describe, expect, it } from "vitest";
import { agentFamily, allowedDays, kindOf, slices } from "../src/sources";
import { bytes } from "../src/page";

describe("zone helpers", () => {
  it("reads the plan's limit from the refusal", () => {
    expect(allowedDays('zone "z" cannot request a time range wider than 1d, but your query time range spans 1w')).toBe(1);
    expect(allowedDays("wider than 2w")).toBe(14);
    expect(allowedDays("wider than 6h")).toBe(0.25);
    expect(allowedDays("something else")).toBeUndefined();
  });
  it("slices a window walking back from now, never past the window, at most 30", () => {
    const now = Date.parse("2026-09-17T12:00:00Z");
    const s = slices(3, 1, now);
    expect(s).toEqual([
      { since: "2026-09-16T12:00:00.000Z", until: "2026-09-17T12:00:00.000Z" },
      { since: "2026-09-15T12:00:00.000Z", until: "2026-09-16T12:00:00.000Z" },
      { since: "2026-09-14T12:00:00.000Z", until: "2026-09-15T12:00:00.000Z" },
    ]);
    expect(slices(7, 7, now)).toEqual([{ since: "2026-09-10T12:00:00.000Z", until: "2026-09-17T12:00:00.000Z" }]);
    expect(slices(5, 2, now).at(-1)).toEqual({ since: "2026-09-12T12:00:00.000Z", until: "2026-09-13T12:00:00.000Z" });
    expect(slices(90, 1, now)).toHaveLength(30);
  });
  it("names what a path on the API host asks for", () => {
    expect(kindOf("/v3.4.1/registry.json")).toBe("whole dataset");
    expect(kindOf("/v3.4.1/registry.json.gz")).toBe("whole dataset");
    expect(kindOf("/v3.4.1/registry.json.sha256")).toBe("release metadata");
    expect(kindOf("/versions.json")).toBe("release metadata");
    expect(kindOf("/v3.4.1/index.json")).toBe("release metadata");
    expect(kindOf("/v3.4.1/index/cards.json")).toBe("indexes");
    expect(kindOf("/v3.4.1/cards/C000230.json")).toBe("single objects");
    expect(kindOf("/v3.4.1/sets.json")).toBe("single objects");
    expect(kindOf("/v3/cards/C000230.json")).toBe("alias (/vN → release)");
    expect(kindOf("/images/P000937.ab12cd34ef56.normal.webp")).toBe("images");
    expect(kindOf("/robots.txt")).toBe("other");
  });
  it("names client software as a family, Discord's fetcher included", () => {
    expect(agentFamily("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).toBe("discordbot");
    expect(agentFamily("Mozilla/5.0 (X11) Chrome/140.0 Safari/537.36")).toBe("chrome");
    expect(agentFamily("sorcery-registry-mcp (+https://kairosarchive.net)")).toBe("sorcery-registry-mcp");
    expect(agentFamily("")).toBe("(none)");
  });
  it("prints bytes for people", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(5900)).toBe("5.8 KB");
    expect(bytes(3.5 * 1024 * 1024 * 1024)).toBe("3.5 GB");
  });
});
