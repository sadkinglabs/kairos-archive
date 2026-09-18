/** A live check that the zone's plan answers the dashboard's own query.
 *
 * Every zone table shares one GraphQL request, so a single field the
 * plan refuses fails all of them: that is how the referer dimension
 * took the whole "Data and images" section down once already. Mocked
 * tests cannot catch it, because the mock answers whatever is asked.
 *
 * So this runs the real `zone()` against the real zone, and fails when
 * any table comes back an error. It is skipped unless CF_API_TOKEN and
 * CF_ZONE_ID are set, which is never in ordinary CI; the deploy
 * workflow runs it with the same credentials the Worker uses, before
 * deploying. One day is asked for, the cheapest window that still
 * exercises every field and filter in the query. */
import { describe, expect, it } from "vitest";
import { zone } from "../src/sources";

const token = process.env.CF_API_TOKEN;
const zoneId = process.env.CF_ZONE_ID;
const hosts = {
  api: process.env.API_HOST ?? "api.kairosarchive.net",
  query: process.env.QUERY_HOST ?? "query.kairosarchive.net",
  bot: process.env.BOT_HOST ?? "bot.kairosarchive.net",
  site: process.env.SITE_HOST ?? "kairosarchive.net",
  stats: process.env.STATS_HOST ?? "stats.kairosarchive.net",
};

describe.skipIf(!token || !zoneId)("the zone answers the dashboard's query", () => {
  it("returns every table without a refused field", async () => {
    const report = await zone(
      { fetchImpl: (url, init) => fetch(url, init as RequestInit), token: token!, account: process.env.CF_ACCOUNT_ID ?? "", zone: zoneId, apiBase: `https://${hosts.api}` },
      1,
      hosts,
    );
    const tables = Object.entries(report).filter(([, v]) => v && typeof v === "object" && "ok" in v) as [string, { ok: boolean; error?: string }][];
    const refused = tables.filter(([, v]) => !v.ok).map(([name, v]) => `${name}: ${v.error}`);
    if (refused.length) console.error(`the zone refused ${refused.length} of ${tables.length} tables:\n${refused.join("\n")}`);
    expect(refused).toEqual([]);
    expect(tables.length).toBeGreaterThan(5);
  }, 60_000);
});
