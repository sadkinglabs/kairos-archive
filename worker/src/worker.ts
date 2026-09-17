/** The query API: the site's search grammar, answered as JSON on the
 * API domain. GET /cards?q=… runs the same parser and evaluator the
 * search page runs in the browser, over the same compact records, and
 * returns a page of card records. /cards/named, /cards/random and
 * /cards/autocomplete answer the three questions a bot or a script asks
 * most. Everything else under the route is a JSON 404.
 *
 * A query that never reads a printing is answered from the card list
 * alone; the printings load only when a term, flag, sort or unit needs
 * them. Answers are cacheable for five minutes and allow any origin. */
import { directLookup, mentionsPrinting, paginate, parse, search, suggest } from "../../src/search";
import type { Card, Printing, SearchData } from "../../src/search";
import { SORT_FIELDS, UNITS, type SortField, type Unit } from "../../src/search/keys";
import { Data } from "./data";
import { cardRecord, type CardRecord } from "./records";
import { error, json, preflight } from "./respond";

export interface Env { SITE_BASE_URL?: string; API_BASE_URL?: string }

export const PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;
export const MAX_QUERY = 500;
export const DEFAULT_SITE = "https://kairosarchive.net";
export const DEFAULT_API = "https://api.kairosarchive.net";

let held: Data | null = null;
function dataFor(env: Env): Data {
  const base = env.SITE_BASE_URL ?? DEFAULT_SITE;
  if (!held || held.siteBase !== base) held = new Data(base);
  return held;
}

export interface Deps { data: Data; random?: () => number }

export async function handle(request: Request, env: Env, deps: Deps = { data: dataFor(env) }): Promise<Response> {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method_not_allowed", "Only GET is served.");
  const url = new URL(request.url);
  const apiBase = env.API_BASE_URL ?? DEFAULT_API;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  try {
    const idPath = /^\/cards\/([CP]\d{6})$/i.exec(path);
    if (idPath) {
      // The static object for an id lives under the alias; send the reader there.
      const id = idPath[1]!.toUpperCase();
      return Response.redirect(`${apiBase}/v3/${id.startsWith("C") ? "cards" : "printings"}/${id}.json`, 302);
    }
    switch (path) {
      case "/cards": return await list(url, apiBase, deps);
      case "/cards/named": return await named(url, deps);
      case "/cards/random": return await random(url, deps);
      case "/cards/autocomplete": return await autocomplete(url, deps);
      default: return error(404, "not_found", `Nothing is served at ${path}. The query API is /cards?q=…, /cards/named, /cards/random and /cards/autocomplete; the objects are under /v3/.`);
    }
  } catch (err) {
    console.error(err);
    return error(503, "data_unavailable", "The card data could not be loaded. Try again in a moment.");
  }
}

/** The grammar's option words, from URL parameters when a caller prefers
 * them; anything unrecognised is a 400 rather than a silent default. */
function optionWords(url: URL): { words: string[]; problem: string | null } {
  const words: string[] = [];
  const unique = url.searchParams.get("unique");
  if (unique !== null) {
    if (!(UNITS as readonly string[]).includes(unique)) return { words, problem: `unique must be one of ${UNITS.join(", ")}` };
    words.push(`unique:${unique as Unit}`);
  }
  const sort = url.searchParams.get("sort") ?? url.searchParams.get("order_by");
  if (sort !== null) {
    if (!(SORT_FIELDS as readonly string[]).includes(sort)) return { words, problem: `sort must be one of ${SORT_FIELDS.join(", ")}` };
    words.push(`sort:${sort as SortField}`);
  }
  const order = url.searchParams.get("order") ?? url.searchParams.get("dir");
  if (order !== null) {
    if (order !== "asc" && order !== "desc") return { words, problem: "order must be asc or desc" };
    words.push(`order:${order}`);
  }
  return { words, problem: null };
}

function pageSize(url: URL): number | null {
  const raw = url.searchParams.get("page_size");
  if (raw === null) return PAGE_SIZE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE_SIZE ? n : null;
}

/** Whether answering needs the printing list: a printing term or flag,
 * a unit other than cards, a sort on a printing fact, or a slug jump. */
export function needsPrintings(q: string): boolean {
  const parsed = parse(q);
  if (parsed.options.unique !== "cards") return true;
  if (parsed.options.sort === "set" || parsed.options.sort === "date") return true;
  if (directLookup(q)?.kind === "slug" || directLookup(q)?.kind === "printing") return true;
  return parsed.ast ? mentionsPrinting(parsed.ast) : false;
}

async function load(q: string, deps: Deps): Promise<{ data: SearchData; tag: string }> {
  const cards = await deps.data.getCards();
  if (!needsPrintings(q)) return { data: { cards: cards.cards, printings: [] }, tag: cards.tag };
  const printings = await deps.data.getPrintings();
  return { data: { cards: cards.cards, printings: printings.printings }, tag: cards.tag };
}

async function list(url: URL, apiBase: string, deps: Deps): Promise<Response> {
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (!raw) return error(400, "missing_query", "Give a query in q, in the search syntax: https://kairosarchive.net/syntax");
  if (raw.length > MAX_QUERY) return error(400, "query_too_long", `q may be at most ${MAX_QUERY} characters.`);
  const options = optionWords(url);
  if (options.problem) return error(400, "bad_parameter", options.problem);
  const size = pageSize(url);
  if (size === null) return error(400, "bad_parameter", `page_size must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  const q = [raw, ...options.words].join(" ");

  const parsed = parse(q);
  if (parsed.errors.length > 0) return error(400, "bad_query", "The query could not be read.", parsed.errors);

  const { data, tag } = await load(q, deps);
  const jump = directLookup(raw);
  let hits: { card: Card; printing: Printing | null }[];
  let rulesText: Card[] = [];
  if (jump) {
    hits = jumpHits(jump, data);
  } else {
    const result = search(q, data);
    hits = result.hits;
    rulesText = result.rulesTextHits;
  }
  const page = Number(url.searchParams.get("page") ?? "1");
  const { items, info } = paginate(hits, page, size);
  const next = new URL(url);
  next.searchParams.set("page", String(info.page + 1));
  return json({
    object: "list",
    release: tag,
    q: raw,
    unique: parsed.options.unique,
    sort: parsed.options.sort,
    order: parsed.options.order,
    total: info.total,
    page: info.page,
    page_size: size,
    total_pages: info.totalPages,
    has_more: info.page < info.totalPages,
    next_page: info.page < info.totalPages ? `${apiBase}/cards${next.search}` : null,
    rules_text_total: rulesText.length,
    rules_text_hits: rulesText.slice(0, 20).map((c) => ({ codex_id: c.codex_id, name: c.name, kairos_url: cardRecord(c, null).kairos_url })),
    data: items.map((h) => cardRecord(h.card, h.printing)),
  });
}

function jumpHits(jump: NonNullable<ReturnType<typeof directLookup>>, data: SearchData): { card: Card; printing: Printing | null }[] {
  const byId = new Map(data.cards.map((c) => [c.codex_id, c]));
  if (jump.kind === "card") {
    const card = byId.get(jump.value);
    return card ? [{ card, printing: null }] : [];
  }
  const printing = jump.kind === "printing"
    ? data.printings.find((p) => p.printing_id === jump.value)
    : data.printings.find((p) => p.slug === jump.value.replace(/-r$/, ""));
  const card = printing ? byId.get(printing.codex_id) : undefined;
  return card && printing ? [{ card, printing }] : [];
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

async function named(url: URL, deps: Deps): Promise<Response> {
  const exact = url.searchParams.get("exact");
  const fuzzy = url.searchParams.get("fuzzy");
  if (!exact && !fuzzy) return error(400, "missing_parameter", "Give exact=<name> or fuzzy=<partial name>.");
  const { cards, tag } = await deps.data.getCards();
  let card: Card | undefined;
  if (exact) card = cards.find((c) => fold(c.name) === fold(exact));
  else card = suggest(cards.map((c) => ({ name: c.name, codex_id: c.codex_id, path: "" })), fuzzy!, 1).map((n) => cards.find((c) => c.codex_id === n.codex_id)!)[0];
  if (!card) return error(404, "not_found", exact ? `No card is named “${exact}”.` : `No card name matches “${fuzzy}”.`);
  return json({ ...cardRecord(card, null), release: tag });
}

async function random(url: URL, deps: Deps): Promise<Response> {
  const raw = (url.searchParams.get("q") ?? "").trim();
  const pick = deps.random ?? Math.random;
  if (!raw) {
    const { cards, tag } = await deps.data.getCards();
    const card = cards[Math.floor(pick() * cards.length)];
    if (!card) return error(404, "not_found", "The card list is empty.");
    return json({ ...cardRecord(card, null), release: tag }, 200, 0);
  }
  if (raw.length > MAX_QUERY) return error(400, "query_too_long", `q may be at most ${MAX_QUERY} characters.`);
  const parsed = parse(raw);
  if (parsed.errors.length > 0) return error(400, "bad_query", "The query could not be read.", parsed.errors);
  const { data, tag } = await load(raw, deps);
  const { hits } = search(raw, data);
  const hit = hits[Math.floor(pick() * hits.length)];
  if (!hit) return error(404, "not_found", `No card matches “${raw}”.`);
  return json({ ...cardRecord(hit.card, hit.printing), release: tag }, 200, 0);
}

async function autocomplete(url: URL, deps: Deps): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim();
  const { cards, tag } = await deps.data.getCards();
  const names = q ? suggest(cards.map((c) => ({ name: c.name, codex_id: c.codex_id, path: "" })), q, 20) : [];
  return json({ object: "catalog", release: tag, q, total: names.length, data: names.map((n) => ({ name: n.name, codex_id: n.codex_id })) });
}

export type { CardRecord };
