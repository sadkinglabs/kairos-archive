/** Where the site's data comes from: one verified registry release.
 *
 * At build time: read https://api.kairosarchive.net/versions.json, take
 * latest.v3 (or KAIROS_REGISTRY_TAG), fetch that immutable root's
 * registry.json and check its SHA-256 against the digest versions.json
 * lists for it. A mismatch fails the build. KAIROS_REGISTRY_FILE points
 * the build at a local export instead (development, tests, a sandbox
 * without network); the source is then reported as "local". */

import { registryBytes } from "./registryCache";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Card, Printing, SearchData } from "../search/types";

/** Overridable for a build against a local stand-in of the API (tests of
 * the release-dependent pages); production builds never set it. */
export const API_BASE = process.env.KAIROS_API_BASE ?? "https://api.kairosarchive.net";
export const MAJOR = "v3";
export const USER_AGENT = "kairos-archive-build (+https://kairosarchive.net)";

export interface Face {
  type: string | null; category: string | null; rarity: string | null; slot: string | null;
  subtypes: string[]; elements: string[]; keywords: string[]; umbrellas: string[];
  cost: number | null; attack: number | null; defense: number | null; power: number | null; life: number | null;
  thr_air: number; thr_earth: number; thr_fire: number; thr_water: number; rules_text: string;
}
/** A fact the official API does not say, with where it came from (schema 12). */
export interface Note { text: string; source: string; recorded: string }
/** Who stands behind a record (schema 12): the official API, or the
 * registry, which recorded it by hand because the API does not serve it. */
export type Origin = "api" | "manual";
/** Where a hand-recorded record came from; null for a record the registry
 * only ever observed upstream. Kept after upstream confirms it. */
export interface Manual {
  source: string; recorded: string; confirmed_at: string | null;
  withdrawn: { on: string; reason: string } | null;
}
/** The schema 12 fields. Optional so the site builds from a release made
 * before them (v3.3.x), where every record is official and has no notes. */
interface Provenance { origin?: Origin; manual?: Manual | null; notes?: Note[] }
export interface RegistryCard extends Face, Provenance {
  codex_id: string; name: string; back: Face | null; errata: boolean; set_codes: string[]; printing_ids: string[];
  default_printing_id: string | null; api_url: string; kairos_url: string;
  image_urls: Record<string, string> | null; image_status: "missing" | "lowres" | "ok";
}
export interface PrintingFace { artist: string | null; artist_slug: string | null; flavour_text: string | null; typeline: string | null; image_urls: Record<string, string> | null }
export interface RegistryPrinting extends PrintingFace, Provenance {
  printing_id: string; codex_id: string; card_name: string; set_name: string; set_code: string | null; released_at: string | null;
  /** The set release this printing belongs to (schema 12): its own set, or
   * for a promo (999) or a curio (CUR), the one recorded by hand. */
  released_with?: string | null;
  product: string | null; finish: string | null; slug: string; back: PrintingFace | null; image_hash: string | null;
  printed_as_current: boolean | null; retired_at: string | null; api_url: string; kairos_url: string;
  image_status: "missing" | "lowres" | "ok";
}
/** What a set is, as the registry records it (schema 12): a set release,
 * the publisher's bucket for promos (999), or a set of the registry's own
 * (CUR). A set code is a label; nothing is ever read from its characters. */
export type SetKind = "release" | "promo" | "registry";
export interface RegistrySet { set_code: string | null; set_name: string; released_at: string | null; cards: number; printings: number; kind?: SetKind; origin?: Origin; api_url: string | null; kairos_url: string | null }
export interface HistoryRow extends Face {
  codex_id: string; valid_from: string; valid_to: string | null; back: Face | null;
  /** Where the face came from: "api" when the registry observed it in the
   * official API, "card" when a maintainer transcribed it from the printed
   * card (schema 11; absent in older releases, which held only "api" rows),
   * "manual" for the face of a card the registry recorded by hand because
   * the API does not serve it (schema 12). */
  source?: "api" | "card" | "manual";
}
export interface Registry {
  header: { schema_version: number; source: string; sets: number; cards: number; printings: number; slug_history: number; name_history: number; card_history: number };
  sets: RegistrySet[]; cards: RegistryCard[]; printings: RegistryPrinting[];
  slug_history: { slug: string; printing_id: string; valid_from: string; valid_to: string | null }[];
  name_history: { name: string; codex_id: string; valid_from: string; valid_to: string | null }[];
  card_history: HistoryRow[];
}
export interface Release { tag: string; schema_version: number; released_at: string; sha256: string }
export interface Source {
  tag: string; root: string | null; sha256: string; releasedAt: string | null;
  /** Every release versions.json lists, newest first; empty for a local build. */
  releases: Release[];
  /** registry.json as stored, and roughly as the edge sends it: our own
   * gzip of the same bytes at the default level. The edge uses Brotli and
   * its own level, so this is an estimate, and a conservative one. */
  bytes: number; compressed: number;
}

/** One fetch, retried: the build runs on every release, and a release is also
 * the moment the CDN is busiest (it verifies every image it serves), so a
 * dropped connection or a 5xx here must not fail a deploy. Four attempts,
 * 1s/2s/4s apart; a 4xx is a real answer and is not retried. */
export async function fetchWithRetry(url: string, headers: Record<string, string>, attempts = 4, pauseMs = 1000): Promise<Response> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response;
      if (response.status < 500) throw new Error(`${url}: HTTP ${response.status}`);
      last = new Error(`${url}: HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof Error && /HTTP 4\d\d/.test(error.message)) throw error;
      last = error;
    }
    if (attempt < attempts) {
      console.warn(`[registry] ${url}: attempt ${attempt} failed (${last instanceof Error ? last.message : last}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, pauseMs * 2 ** (attempt - 1)));
    }
  }
  throw last instanceof Error ? last : new Error(`${url}: failed after ${attempts} attempts`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithRetry(url, { "User-Agent": USER_AGENT, Accept: "application/json" });
  return (await response.json()) as T;
}

export type JsonSchema = Record<string, unknown>;
export interface Loaded { registry: Registry; source: Source; /** the release's schema.json, for the type reference pages */ schema: JsonSchema }

async function load(): Promise<Loaded> {
  const file = process.env.KAIROS_REGISTRY_FILE;
  if (file) {
    const bytes = await readFile(file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // A checkout of the registry keeps the schema beside the export.
    const schemaFile = process.env.KAIROS_REGISTRY_SCHEMA_FILE ?? resolve(dirname(file), "..", "schema", "registry.schema.json");
    const schema = JSON.parse((await readFile(schemaFile)).toString("utf-8")) as JsonSchema;
    return { registry: JSON.parse(bytes.toString("utf-8")) as Registry, source: { tag: "local", root: null, sha256, releasedAt: null, releases: [], ...sizes(bytes) }, schema };
  }
  const versions = await fetchJson<{ base_url: string; latest: Record<string, string>; releases: Release[] }>(`${API_BASE}/versions.json`);
  const tag = process.env.KAIROS_REGISTRY_TAG ?? versions.latest[MAJOR];
  if (!tag) throw new Error(`versions.json lists no ${MAJOR} release`);
  const release = versions.releases.find((r) => r.tag === tag);
  if (!release) throw new Error(`versions.json does not list ${tag}`);
  const root = `${versions.base_url.replace(/\/$/, "")}/${tag}`;
  const bytes = await registryBytes(process.env.KAIROS_REGISTRY_CACHE_DIR ?? resolve("node_modules/.cache/kairos-registry"), release.sha256, async () => {
    const response = await fetchWithRetry(`${root}/registry.json`, { "User-Agent": USER_AGENT });
    return Buffer.from(await response.arrayBuffer());
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== release.sha256) throw new Error(`${root}/registry.json digest ${sha256} does not match versions.json (${release.sha256})`);
  const schema = await fetchJson<JsonSchema>(`${root}/schema.json`);
  return { registry: JSON.parse(bytes.toString("utf-8")) as Registry, source: { tag, root, sha256, releasedAt: release.released_at, releases: versions.releases, ...sizes(bytes) }, schema };
}

function sizes(bytes: Buffer): { bytes: number; compressed: number } {
  return { bytes: bytes.length, compressed: gzipSync(bytes).length };
}

let cached: Promise<Loaded> | null = null;
/** Sets in set-code order: Alpha, Beta, Arthurian Legends, Dragonlord,
 * Gothic, then the promo bucket. Not by release date - the promo set's
 * released_at is 2022-03-15, before Alpha's 2023-06-22, because it holds
 * the earliest promo; sorting by date put the bucket first. The codes the
 * publisher issues are the release order and reserve 999 for promos, so
 * they are the key. A set with no code sorts after them all. */
export function orderedSets(sets: RegistrySet[]): RegistrySet[] {
  return [...sets].sort((a, b) => (a.set_code ?? "zzz").localeCompare(b.set_code ?? "zzz"));
}

/** The card that stands for each set on /sets, by printing id - the only
 * key that cannot drift; the card's name is the comment beside it. A set
 * with no entry here (a new one, the day it appears) falls back to the
 * first printing of that set with an image. */
export const SET_FACES: Record<string, string> = {
  "001": "P001632", // Sorcerer
  "002": "P001624", // Pathfinder
  "004": "P002035", // Templar
  "005": "P002125", // Dragonlord
  "006": "P002738", // Necromancer
  "999": "P000005", // Apprentice Wizard
};

/** The printing whose art represents a set: the chosen one when it is
 * named and served, else the first printing of the set with an image. */
export function setFace(set: RegistrySet, printings: RegistryPrinting[]): RegistryPrinting | null {
  const chosen = set.set_code ? SET_FACES[set.set_code] : undefined;
  const served = (p: RegistryPrinting) => p.image_status !== "missing" && p.image_urls !== null;
  if (chosen) {
    const face = printings.find((p) => p.printing_id === chosen);
    if (face && served(face)) return face;
  }
  return printings.find((p) => p.set_code === set.set_code && served(p)) ?? null;
}

export function loadRegistry(): Promise<Loaded> {
  cached ??= load();
  return cached;
}

// ---------------------------------------------------------------- derived views

export { slugify, cardPath, printingPath } from "./paths";
export const setPath = (set: { set_code: string | null }) => `/sets/${set.set_code ?? "none"}`;

/** Releases before v3.4.0 do not say what each set is. In every one of
 * them, each set was a release except 999, the publisher's promo bucket:
 * a fact about those releases, written down here, not a rule read from
 * the codes. A release that carries `kind` is always believed instead. */
const KINDS_BEFORE_SCHEMA_12: Record<string, SetKind> = { "999": "promo" };

/** What each set is, by code. */
export function setKinds(sets: readonly RegistrySet[]): Map<string, SetKind> {
  const kinds = new Map<string, SetKind>();
  for (const s of sets) if (s.set_code !== null) kinds.set(s.set_code, s.kind ?? KINDS_BEFORE_SCHEMA_12[s.set_code] ?? "release");
  return kinds;
}

/** Whether a set is itself a release, as recorded. */
export const isReleaseSet = (code: string | null | undefined, kinds: ReadonlyMap<string, SetKind>): boolean =>
  !!code && kinds.get(code) === "release";

/** A record the registry recorded by hand rather than read from the API. */
export const isManual = (record: { origin?: Origin }): boolean => record.origin === "manual";

/** The release a printing belongs to: the recorded one, or for a release
 * built before the field existed, the printing's own set when that set is
 * a release. */
export const releasedWith = (p: { set_code: string | null; released_with?: string | null }, kinds: ReadonlyMap<string, SetKind>): string | null =>
  p.released_with !== undefined ? p.released_with : isReleaseSet(p.set_code, kinds) ? p.set_code : null;


export function toSearchData(registry: Registry): SearchData {
  const kinds = setKinds(registry.sets);
  const hashById = new Map(registry.printings.map((p) => [p.printing_id, p.image_hash]));
  const cards: Card[] = registry.cards.map((c) => ({
    codex_id: c.codex_id, name: c.name, type: c.type, category: c.category, rarity: c.rarity, slot: c.slot,
    subtypes: c.subtypes, elements: c.elements, keywords: c.keywords, umbrellas: c.umbrellas,
    cost: c.cost, attack: c.attack, defense: c.defense, power: c.power, life: c.life,
    thr_air: c.thr_air, thr_earth: c.thr_earth, thr_fire: c.thr_fire, thr_water: c.thr_water,
    rules_text: c.rules_text, has_back: c.back !== null, errata: c.errata, set_codes: c.set_codes,
    printing_ids: c.printing_ids, default_printing_id: c.default_printing_id, image_status: c.image_status,
    // The default printing's art, so a card can be pictured without its printings loaded.
    image_hash: c.default_printing_id ? hashById.get(c.default_printing_id) ?? null : null,
  }));
  const printings: Printing[] = registry.printings.map((p) => ({
    printing_id: p.printing_id, codex_id: p.codex_id, slug: p.slug, set_code: p.set_code, set_name: p.set_name,
    released_at: p.released_at, product: p.product, finish: p.finish, artist: p.artist, artist_slug: p.artist_slug,
    typeline: p.typeline, flavour_text: p.flavour_text, printed_as_current: p.printed_as_current, retired_at: p.retired_at,
    image_status: p.image_status, image_hash: p.image_hash,
    released_with: releasedWith(p, kinds), origin: p.origin ?? "api",
  }));
  return { cards, printings };
}

export interface Views {
  cardById: Map<string, RegistryCard>;
  printingById: Map<string, RegistryPrinting>;
  printingsByCard: Map<string, RegistryPrinting[]>;
  historyByCard: Map<string, HistoryRow[]>;
  namesByCard: Map<string, { name: string; valid_from: string; valid_to: string | null }[]>;
  slugsByPrinting: Map<string, { slug: string; valid_from: string; valid_to: string | null }[]>;
}

export function views(registry: Registry): Views {
  const cardById = new Map(registry.cards.map((c) => [c.codex_id, c]));
  const printingById = new Map(registry.printings.map((p) => [p.printing_id, p]));
  const printingsByCard = new Map<string, RegistryPrinting[]>();
  for (const p of registry.printings) printingsByCard.set(p.codex_id, [...(printingsByCard.get(p.codex_id) ?? []), p]);
  const historyByCard = new Map<string, HistoryRow[]>();
  for (const r of registry.card_history) historyByCard.set(r.codex_id, [...(historyByCard.get(r.codex_id) ?? []), r]);
  const namesByCard = new Map<string, { name: string; valid_from: string; valid_to: string | null }[]>();
  for (const r of registry.name_history) namesByCard.set(r.codex_id, [...(namesByCard.get(r.codex_id) ?? []), r]);
  const slugsByPrinting = new Map<string, { slug: string; valid_from: string; valid_to: string | null }[]>();
  for (const r of registry.slug_history) slugsByPrinting.set(r.printing_id, [...(slugsByPrinting.get(r.printing_id) ?? []), r]);
  return { cardById, printingById, printingsByCard, historyByCard, namesByCard, slugsByPrinting };
}

export const FACE_FIELDS: (keyof Face)[] = ["type", "category", "rarity", "slot", "subtypes", "elements", "keywords", "umbrellas",
  "cost", "attack", "defense", "power", "life", "thr_air", "thr_earth", "thr_fire", "thr_water", "rules_text"];

/** Which fields differ between two history rows (or faces). */
export function changedFields(before: Face | null, after: Face | null): string[] {
  if (!before || !after) return before === after ? [] : ["face"];
  return FACE_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}

/** The row in force on a given date: the last row whose valid_from is at
 * or before it. A date earlier than every row's valid_from gets the
 * earliest row instead of nothing — the first row stands for everything
 * before the registry began recording (same convention as the card
 * page's history timeline). Rows need not be pre-sorted. */
export function rowInForce<T extends { valid_from: string }>(rows: T[], date: string): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  let chosen = sorted[0];
  for (const row of sorted) if (row.valid_from <= date) chosen = row;
  return chosen;
}

/** How to read a history row's dates. An observed row is dated by the sync
 * that detected the change - "recorded on". A row transcribed from a printed
 * card was never observed: it runs from the day the first printing showing it
 * reached the public until the current face took over, so "as printed" is the
 * honest label and its dates are release dates, not detection dates. */
export function historySource(row: { source?: "api" | "card" | "manual" }): { fromCard: boolean; dated: string; label: string; heading: string } {
  // A manual card's face was read from the card too, and dated the same
  // way; it differs in that the official API has never served the card.
  if (row.source === "manual") return { fromCard: true, dated: "in force from", heading: "Recorded by hand", label: "recorded by hand; the official API does not serve this card" };
  const fromCard = row.source === "card";
  return fromCard
    ? { fromCard, dated: "in force from", heading: "Read from the printed card", label: "read from the printed card" }
    : { fromCard, dated: "recorded on", heading: "Recorded on", label: "observed in the official API" };
}

/** What "Shows current values" says for one printing. null has two causes and
 * they read differently: a printing that shows no rules text at all cannot be
 * compared (a textless promo), and a printing with no release date cannot be
 * placed in the card's history. */
export function showsCurrentValues(printing: { printed_as_current: boolean | null; released_at: string | null }):
    { verdict: "yes" | "no" | "no-text" | "undated"; short: string; long: string } {
  if (printing.printed_as_current === true)
    return { verdict: "yes", short: "shows current values", long: "This printing shows the card's current values." };
  if (printing.printed_as_current === false)
    return { verdict: "no", short: "shows earlier values", long: "This printing shows earlier values; the card has since changed." };
  if (printing.released_at !== null)
    return { verdict: "no-text", short: "no card text", long: "This printing shows no rules text, so it carries no face." };
  return { verdict: "undated", short: "unplaced", long: "This printing has no release date, so it cannot be placed in the card's history." };
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}
