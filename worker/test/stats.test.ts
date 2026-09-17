/** Every request leaves one data point that says what was asked and how
 * it went, without the address, the query text or the full User-Agent. */
import { describe, expect, it } from "vitest";
import { Data } from "../src/data";
import { handle, type Env } from "../src/worker";
import { BLOBS, agentFamily, queryKeys } from "../src/stats";
import { SITE, fakeFetch } from "./fake";

type Point = { indexes?: (string | ArrayBuffer | null)[]; blobs?: (string | ArrayBuffer | null)[]; doubles?: number[] };
function dataset() {
  const points: Point[] = [];
  return { points, writeDataPoint: (p?: Point) => { if (p) points.push(p); } };
}
const named = (p: Point) => Object.fromEntries(BLOBS.map((k, i) => [k, p.blobs![i]]));

async function get(path: string, headers: Record<string, string> = { "user-agent": "test/1.0" }, cf?: { country: string }) {
  const stats = dataset();
  const env: Env = { SITE_BASE_URL: SITE, API_BASE_URL: "https://api.test", QUERY_BASE_URL: "https://query.test", STATS: stats };
  const req = new Request(`https://query.test${path}`, { headers });
  if (cf) Object.defineProperty(req, "cf", { value: cf });
  const res = await handle(req, env, { data: new Data(SITE, fakeFetch()), random: () => 0.5 });
  return { res, point: stats.points[0]!, count: stats.points.length };
}

describe("one point per request", () => {
  it("records a list query's route, keys, agent, country, source and total", async () => {
    const { res, point, count } = await get("/cards?q=t:minion e:water -is:errata sort:cost", { "user-agent": "Mozilla/5.0 (Android 17; Mobile; rv:155.0) Gecko/155.0 Firefox/155.0", "cf-connecting-ip": "203.0.113.9" }, { country: "ES" });
    expect(res.status).toBe(200);
    expect(count).toBe(1);
    expect(named(point)).toEqual({ route: "/cards", source: "public", agent: "firefox", country: "ES", keys: "e is:errata sort:cost t", q: "t:minion e:water -is:errata sort:cost" });
    expect(point.indexes).toEqual(["/cards"]);
    expect(point.doubles![0]).toBe(200);
    expect(point.doubles![2]).toBeGreaterThan(0);
  });
  it("marks a bound request as binding, a 403 without agent, and a 404 as an empty total", async () => {
    const bound = await get("/cards/named?exact=Polar Bears", { "user-agent": "kairos-bot/0.1 (+https://kairosarchive.net)" });
    expect(named(bound.point)).toMatchObject({ route: "/cards/named", source: "binding", agent: "kairos-bot", country: "" });
    expect(bound.point.doubles![2]).toBe(1);
    const noAgent = await get("/cards?q=t:site", {});
    expect(noAgent.res.status).toBe(403);
    expect(named(noAgent.point)).toMatchObject({ route: "/cards", agent: "" });
    expect(noAgent.point.doubles![0]).toBe(403);
    const long = await get(`/cards?q=${"t:site ".repeat(60)}`);
    expect(named(long.point).q).toHaveLength(200);
    const missing = await get("/cards/random?q=t:site cost>99");
    expect(missing.res.status).toBe(404);
    expect(named(missing.point)).toMatchObject({ route: "/cards/random", keys: "cost t" });
    expect(missing.point.doubles![2]).toBe(0);
    const other = await get("/nope");
    expect(named(other.point).route).toBe("other");
    const byId = await get("/cards/C000230");
    expect(named(byId.point).route).toBe("/cards/id");
  });
});

describe("the pieces", () => {
  it("names a browser or the first token of anything else", () => {
    expect(agentFamily("Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe("chrome");
    expect(agentFamily("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18 Safari/605.1.15")).toBe("safari");
    expect(agentFamily("curl/8.6.0")).toBe("curl");
    expect(agentFamily("python-requests/2.32")).toBe("python-requests");
    expect(agentFamily("kairos-archive-ci (+https://kairosarchive.net)")).toBe("kairos-archive-ci");
    expect(agentFamily(null)).toBe("");
  });
  it("keeps the keys and drops the words", () => {
    expect(queryKeys("polar bears")).toBe("");
    expect(queryKeys('a:"Drew Tucker" unique:prints cost>=3 -e:water')).toBe("a cost e unique:prints");
    expect(queryKeys("(t:site or t:minion) is:errata")).toBe("is:errata t");
  });
});
