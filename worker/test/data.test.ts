/** Cards and printings must come from one release. The site can be
 * rebuilt between the two reads, and either read can fail; the snapshot
 * never mixes tags and keeps serving the last coherent pair. */
import { describe, expect, it } from "vitest";
import { Data, MismatchedRelease, RECHECK_MS, newer } from "../src/data";
import { CARDS, PRINTINGS } from "../../src/search/fixture";

const SITE = "https://site.test";

/** A site whose release can be changed between requests, and whose files
 * can be made to fail one at a time. */
function site() {
  const state = { tag: "v3.3.3", failCards: false, failPrintings: false, calls: [] as string[] };
  const fetchImpl = async (url: string) => {
    state.calls.push(url.replace(`${SITE}/data/query/`, ""));
    if (url.endsWith("cards.json")) return state.failCards ? new Response("x", { status: 503 }) : new Response(JSON.stringify({ tag: state.tag, cards: CARDS }));
    if (url.endsWith("printings.json")) return state.failPrintings ? new Response("x", { status: 503 }) : new Response(JSON.stringify({ tag: state.tag, printings: PRINTINGS }));
    return new Response("nf", { status: 404 });
  };
  let now = 1000;
  const data = new Data(SITE, fetchImpl, () => now);
  return { state, data, tick: (ms: number) => { now += ms; } };
}

describe("getSnapshot", () => {
  it("serves both lists with one tag when the site is stable", async () => {
    const { data } = site();
    const snap = await data.getSnapshot();
    expect(snap.tag).toBe("v3.3.3");
    expect(snap.cards.length).toBe(CARDS.length);
    expect(snap.printings.length).toBe(PRINTINGS.length);
  });
  it("re-reads the stale side when a rebuild lands between the two reads", async () => {
    const { state, data, tick } = site();
    await data.getCards();                       // v3.3.3 cards cached
    state.tag = "v3.3.4";                        // the site is redeployed
    tick(RECHECK_MS - 1);                        // cards still fresh by the clock
    const snap = await data.getSnapshot();       // printings read now: v3.3.4
    expect(snap.tag).toBe("v3.3.4");             // cards were refreshed to match
    expect(state.calls).toEqual(["cards.json", "printings.json", "cards.json"]);
  });
  it("keeps the last coherent pair when a refresh fails after a rebuild", async () => {
    const { state, data, tick } = site();
    const first = await data.getSnapshot();      // v3.3.3 / v3.3.3
    expect(first.tag).toBe("v3.3.3");
    tick(RECHECK_MS + 1);
    state.tag = "v3.3.4";
    state.failPrintings = true;                  // cards refresh to v3.3.4, printings cannot
    const snap = await data.getSnapshot();
    expect(snap.tag).toBe("v3.3.3");             // the old pair, not a v3.3.4/v3.3.3 mix
    expect(snap.printings.length).toBe(PRINTINGS.length);
  });
  it("reports mismatch when there is no coherent pair to fall back on", async () => {
    const { state, data, tick } = site();
    await data.getCards();                       // only cards so far, v3.3.3
    tick(RECHECK_MS + 1);
    state.tag = "v3.3.4";
    state.failCards = true;                      // cards keep the stale v3.3.3, printings read v3.3.4
    await expect(data.getSnapshot()).rejects.toBeInstanceOf(MismatchedRelease);
  });
  it("fails when nothing could be read at all", async () => {
    const { state, data } = site();
    state.failCards = true;
    await expect(data.getSnapshot()).rejects.toThrow("HTTP 503");
  });
  it("orders release tags and treats an unparseable tag as older", () => {
    expect(newer("v3.3.4", "v3.3.3")).toBe(true);
    expect(newer("v3.10.0", "v3.9.9")).toBe(true);
    expect(newer("v3.3.3", "v3.3.3")).toBe(false);
    expect(newer("v3.3.3", "local")).toBe(true);
  });
});

describe("the list route", () => {
  it("answers 503 data_unavailable when the two lists cannot be reconciled", async () => {
    const { handle } = await import("../src/worker");
    const { state, data, tick } = site();
    const env = { SITE_BASE_URL: SITE, API_BASE_URL: "https://api.test", QUERY_BASE_URL: "https://query.test" };
    const get = (q: string) => handle(new Request(`https://query.test/cards?q=${encodeURIComponent(q)}`, { headers: { "user-agent": "t/1" } }), env, { data });
    expect((await get("t:minion")).status).toBe(200);          // cards only, fine
    tick(RECHECK_MS + 1);
    state.tag = "v3.3.4";
    state.failCards = true;
    const res = await get("s:alpha");                           // needs printings
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("data_unavailable");
  });
});
