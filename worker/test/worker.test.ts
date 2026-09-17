import { describe, expect, it } from "vitest";
import { Data, RECHECK_MS } from "../src/data";
import { handle, needsPrintings, type Env } from "../src/worker";
import { SITE, TAG, fakeFetch } from "./fake";
import { CARDS } from "../../src/search/fixture";

const env: Env = { SITE_BASE_URL: SITE, API_BASE_URL: "https://api.test" };

function app(now = () => 1000) {
  const f = fakeFetch();
  return { f, deps: { data: new Data(SITE, f, now), random: () => 0.5 } };
}

// The bodies are checked field by field, so a loose shape keeps the tests readable.
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function get(path: string, deps = app().deps): Promise<{ status: number; body: Loose; headers: Headers }> {
  const res = await handle(new Request(`https://api.test${path}`), env, deps);
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? ((await res.json()) as Loose) : {}, headers: res.headers };
}

describe("needsPrintings", () => {
  it("is false for card-only queries and true for anything that reads a printing", () => {
    expect(needsPrintings("t:minion e:fire")).toBe(false);
    expect(needsPrintings("is:reprint")).toBe(false);
    expect(needsPrintings("s:alpha")).toBe(true);
    expect(needsPrintings("is:foil")).toBe(true);
    expect(needsPrintings("t:minion unique:prints")).toBe(true);
    expect(needsPrintings("t:minion sort:date")).toBe(true);
    expect(needsPrintings("P000001")).toBe(true);
    expect(needsPrintings("001-apprentice_wizard-b-s")).toBe(true);
  });
});

describe("GET /cards", () => {
  it("answers a card-only query from the card list alone, as a list envelope", async () => {
    const { f, deps } = app();
    const { status, body, headers } = await get("/cards?q=t:minion", deps);
    expect(status).toBe(200);
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("cache-control")).toContain("max-age=300");
    expect(body.object).toBe("list");
    expect(body.release).toBe(TAG);
    expect(body.q).toBe("t:minion");
    expect(body.unique).toBe("cards");
    expect(body.total).toBeGreaterThan(0);
    expect(body.page).toBe(1);
    expect(body.has_more).toBe(false);
    expect(body.next_page).toBeNull();
    expect(f.calls).toEqual([`${SITE}/data/query/cards.json`]);
    const first = body.data[0];
    expect(first.object).toBe("card");
    expect(first.api_url).toMatch(/^https:\/\/api\.kairosarchive\.net\/v3\/cards\/C\d{6}\.json$/);
    expect(first.kairos_url).toMatch(/^https:\/\/kairosarchive\.net\/cards\/C\d{6}\//);
    expect("image_hash" in first).toBe(false);
  });
  it("loads the printings for a printing query and binds the matching printing", async () => {
    const { f, deps } = app();
    const { body } = await get("/cards?q=s:alpha%20is:foil", deps);
    expect(f.calls).toContain(`${SITE}/data/query/printings.json`);
    for (const rec of body.data) {
      expect(rec.printing.finish).toBe("Foil");
      expect(rec.printing.set_name).toBe("Alpha");
      expect(rec.printing.api_url).toMatch(/printings\/P\d{6}\.json$/);
    }
  });
  it("takes unique, sort and order as parameters and paginates", async () => {
    const { body } = await get("/cards?q=t:minion&unique=prints&sort=cost&order=desc&page_size=1");
    expect(body.unique).toBe("prints");
    expect(body.sort).toBe("cost");
    expect(body.order).toBe("desc");
    expect(body.page_size).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.has_more).toBe(true);
    expect(body.next_page).toBe("https://api.test/cards?q=t%3Aminion&unique=prints&sort=cost&order=desc&page_size=1&page=2");
    const page2 = await get("/cards?q=t:minion&unique=prints&sort=cost&order=desc&page_size=1&page=2");
    expect(page2.body.page).toBe(2);
    expect(page2.body.data[0].printing.printing_id).not.toBe(body.data[0].printing.printing_id);
  });
  it("jumps straight to an id or a slug", async () => {
    const byId = await get("/cards?q=C000001");
    expect(byId.body.total).toBe(1);
    expect(byId.body.data[0].codex_id).toBe("C000001");
    const bySlug = await get("/cards?q=001-apprentice_wizard-b-s");
    expect(bySlug.body.total).toBe(1);
    expect(bySlug.body.data[0].printing.printing_id).toBe("P000001");
    const missing = await get("/cards?q=C999999");
    expect(missing.body.total).toBe(0);
    expect(missing.status).toBe(200);
  });
  it("reports rules-text hits for bare words separately", async () => {
    const { body } = await get("/cards?q=spell");
    expect(body.rules_text_total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.rules_text_hits)).toBe(true);
  });
  it("refuses a missing, unreadable or over-long query, and a bad parameter", async () => {
    expect((await get("/cards")).body).toMatchObject({ object: "error", status: 400, code: "missing_query" });
    const bad = await get("/cards?q=cost%3E%3E3");
    expect(bad.body).toMatchObject({ object: "error", status: 400, code: "bad_query" });
    expect(bad.body.warnings.length).toBeGreaterThan(0);
    expect((await get(`/cards?q=${"a".repeat(501)}`)).body.code).toBe("query_too_long");
    expect((await get("/cards?q=x&unique=nope")).body.code).toBe("bad_parameter");
    expect((await get("/cards?q=x&page_size=0")).body.code).toBe("bad_parameter");
    expect((await get("/cards?q=x")).headers.get("cache-control")).toContain("max-age");
    expect((await get("/cards")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("the other routes", () => {
  it("named: exact and fuzzy, 404 when nothing matches", async () => {
    const exact = await get("/cards/named?exact=apprentice%20wizard");
    expect(exact.status).toBe(200);
    expect(exact.body.object).toBe("card");
    expect(exact.body.name).toBe("Apprentice Wizard");
    const fuzzy = await get("/cards/named?fuzzy=appren");
    expect(fuzzy.body.codex_id).toBe("C000001");
    expect((await get("/cards/named?exact=nope")).status).toBe(404);
    expect((await get("/cards/named")).body.code).toBe("missing_parameter");
  });
  it("random: with and without a filter, never cached", async () => {
    const any = await get("/cards/random");
    expect(any.body.object).toBe("card");
    expect(any.headers.get("cache-control")).toBe("public, max-age=0");
    const filtered = await get("/cards/random?q=t:minion");
    expect(filtered.body.type).toBe("Minion");
    expect((await get("/cards/random?q=t:site%20cost%3E99")).status).toBe(404);
  });
  it("autocomplete: ranked names, empty for an empty query", async () => {
    const { body } = await get("/cards/autocomplete?q=ap");
    expect(body.object).toBe("catalog");
    expect(body.data[0]).toEqual({ name: "Apprentice Wizard", codex_id: "C000001" });
    expect((await get("/cards/autocomplete")).body.data).toEqual([]);
  });
  it("an id under /cards redirects to the static object", async () => {
    const res = await handle(new Request("https://api.test/cards/c000230"), env, app().deps);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://api.test/v3/cards/C000230.json");
    const p = await handle(new Request("https://api.test/cards/P000937"), env, app().deps);
    expect(p.headers.get("location")).toBe("https://api.test/v3/printings/P000937.json");
  });
  it("anything else is a JSON 404, a POST a 405, and OPTIONS a preflight", async () => {
    const nf = await get("/cards/nope");
    expect(nf.status).toBe(404);
    expect(nf.body).toMatchObject({ object: "error", code: "not_found" });
    const post = await handle(new Request("https://api.test/cards?q=x", { method: "POST" }), env, app().deps);
    expect(post.status).toBe(405);
    const pre = await handle(new Request("https://api.test/cards", { method: "OPTIONS" }), env, app().deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("Data", () => {
  it("fetches each payload once per recheck window and keeps serving on a failed re-read", async () => {
    let now = 1000;
    let down = false;
    const good = fakeFetch();
    const f = ((url: string) => (down ? Promise.resolve(new Response("x", { status: 503 })) : good(url))) as typeof good;
    const d = new Data(SITE, f, () => now);
    const a = await d.getCards();
    const b = await d.getCards();
    expect(b).toBe(a);
    expect(good.calls).toHaveLength(1);
    now += RECHECK_MS + 1;
    down = true;
    const c = await d.getCards();
    expect(c.cards.length).toBe(CARDS.length);
  });
  it("throws on a first load that fails, and retries next time", async () => {
    const f = fakeFetch({ "data/query/cards.json": new Response("x", { status: 503 }) });
    const d = new Data(SITE, f);
    await expect(d.getCards()).rejects.toThrow("HTTP 503");
    const res = await handle(new Request("https://api.test/cards?q=t:minion"), env, { data: d });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("data_unavailable");
  });
});
