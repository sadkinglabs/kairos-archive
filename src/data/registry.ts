/** Where the site's data comes from: one verified registry release.
 *
 * At build time: read https://api.kairosarchive.net/versions.json, take
 * latest.v3 (or KAIROS_REGISTRY_TAG), fetch that immutable root's
 * registry.json and check its SHA-256 against the digest versions.json
 * lists for it. A mismatch fails the build. KAIROS_REGISTRY_FILE points
 * the build at a local export instead (development, tests, a sandbox
 * without network); the source is then reported as "local". */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Card, Printing, SearchData } from "../search/types";

export const API_BASE = "https://api.kairosarchive.net";
export const MAJOR = "v3";
export const USER_AGENT = "kairos-archive-build (+https://kairosarchive.net)";

export interface Face {
  type: string | null; category: string | null; rarity: string | null; slot: string | null;
  subtypes: string[]; elements: string[]; keywords: string[]; umbrellas: string[];
  cost: number | null; attack: number | null; defense: number | null; power: number | null; life: number | null;
  thr_air: number; thr_earth: number; thr_fire: number; thr_water: number; rules_text: string;
}
export interface RegistryCard extends Face {
  codex_id: string; name: string; back: Face | null; errata: boolean; set_codes: string[]; printing_ids: string[];
  default_printing_id: string | null; api_url: string; kairos_url: string;
  image_urls: Record<string, string> | null; image_status: "missing" | "lowres" | "ok";
}
export interface PrintingFace { artist: string | null; artist_slug: string | null; flavour_text: string | null; typeline: string | null; image_urls: Record<string, string> | null }
export interface RegistryPrinting extends PrintingFace {
  printing_id: string; codex_id: string; card_name: string; set_name: string; set_code: string | null; released_at: string | null;
  product: string | null; finish: string | null; slug: string; back: PrintingFace | null; image_hash: string | null;
  printed_as_current: boolean | null; retired_at: string | null; api_url: string; kairos_url: string;
  image_status: "missing" | "lowres" | "ok";
}
export interface RegistrySet { set_code: string | null; set_name: string; released_at: string | null; cards: number; printings: number; api_url: string | null; kairos_url: string | null }
export interface HistoryRow extends Face {
  codex_id: string; valid_from: string; valid_to: string | null; back: Face | null;
  /** Where the face came from: "api" when the registry observed it in the
   * official API, "card" when a maintainer transcribed it from the printed
   * card (schema 11; absent in older releases, which held only "api" rows). */
  source?: "api" | "card";
}
export interface Registry {
  header: { schema_version: number; source: string; sets: number; cards: number; printings: number; slug_history: number; name_history: number; card_history: number };
  sets: RegistrySet[]; cards: RegistryCard[]; printings: RegistryPrinting[];
  slug_history: { slug: string; printing_id: string; valid_from: string; valid_to: string | null }[];
  name_history: { name: string; codex_id: string; valid_from: string; valid_to: string | null }[];
  card_history: HistoryRow[];
}
export interface Source { tag: string; root: string | null; sha256: string; releasedAt: string | null }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function load(): Promise<{ registry: Registry; source: Source }> {
  const file = process.env.KAIROS_REGISTRY_FILE;
  if (file) {
    const bytes = await readFile(file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { registry: JSON.parse(bytes.toString("utf-8")) as Registry, source: { tag: "local", root: null, sha256, releasedAt: null } };
  }
  const versions = await fetchJson<{ base_url: string; latest: Record<string, string>; releases: { tag: string; sha256: string; released_at: string }[] }>(`${API_BASE}/versions.json`);
  const tag = process.env.KAIROS_REGISTRY_TAG ?? versions.latest[MAJOR];
  if (!tag) throw new Error(`versions.json lists no ${MAJOR} release`);
  const release = versions.releases.find((r) => r.tag === tag);
  if (!release) throw new Error(`versions.json does not list ${tag}`);
  const root = `${versions.base_url.replace(/\/$/, "")}/${tag}`;
  const response = await fetch(`${root}/registry.json`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${root}/registry.json: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== release.sha256) throw new Error(`${root}/registry.json digest ${sha256} does not match versions.json (${release.sha256})`);
  return { registry: JSON.parse(bytes.toString("utf-8")) as Registry, source: { tag, root, sha256, releasedAt: release.released_at } };
}

let cached: Promise<{ registry: Registry; source: Source }> | null = null;
export function loadRegistry(): Promise<{ registry: Registry; source: Source }> {
  cached ??= load();
  return cached;
}

// ---------------------------------------------------------------- derived views

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
}
export const cardPath = (card: { codex_id: string; name: string }) => `/cards/${card.codex_id}/${slugify(card.name)}`;
export const printingPath = (printing: { printing_id: string }) => `/printings/${printing.printing_id}`;
export const setPath = (set: { set_code: string | null }) => `/sets/${set.set_code ?? "none"}`;

export function toSearchData(registry: Registry): SearchData {
  const cards: Card[] = registry.cards.map((c) => ({
    codex_id: c.codex_id, name: c.name, type: c.type, category: c.category, rarity: c.rarity, slot: c.slot,
    subtypes: c.subtypes, elements: c.elements, keywords: c.keywords, umbrellas: c.umbrellas,
    cost: c.cost, attack: c.attack, defense: c.defense, power: c.power, life: c.life,
    thr_air: c.thr_air, thr_earth: c.thr_earth, thr_fire: c.thr_fire, thr_water: c.thr_water,
    rules_text: c.rules_text, has_back: c.back !== null, errata: c.errata, set_codes: c.set_codes,
    printing_ids: c.printing_ids, default_printing_id: c.default_printing_id, image_status: c.image_status,
    image_hash: null,
  }));
  const printings: Printing[] = registry.printings.map((p) => ({
    printing_id: p.printing_id, codex_id: p.codex_id, slug: p.slug, set_code: p.set_code, set_name: p.set_name,
    released_at: p.released_at, product: p.product, finish: p.finish, artist: p.artist, artist_slug: p.artist_slug,
    typeline: p.typeline, flavour_text: p.flavour_text, printed_as_current: p.printed_as_current, retired_at: p.retired_at,
    image_status: p.image_status, image_hash: p.image_hash,
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
export function historySource(row: { source?: "api" | "card" }): { fromCard: boolean; dated: string; label: string } {
  const fromCard = row.source === "card";
  return fromCard
    ? { fromCard, dated: "in force from", label: "read from the printed card" }
    : { fromCard, dated: "recorded on", label: "observed in the official API" };
}

/** What "Shows current values" says for one printing. null has two causes and
 * they read differently: a printing that shows no rules text at all cannot be
 * compared (a textless promo), and a printing with no release date cannot be
 * placed in the card's history. */
export function showsCurrentValues(printing: { printed_as_current: boolean | null; released_at: string | null }):
    { verdict: "yes" | "no" | "no-text" | "undated"; short: string; long: string } {
  if (printing.printed_as_current === true)
    return { verdict: "yes", short: "current", long: "yes" };
  if (printing.printed_as_current === false)
    return { verdict: "no", short: "older values", long: "no \u2014 printed with older values; see the card's history" };
  if (printing.released_at !== null)
    return { verdict: "no-text", short: "no card text", long: "not applicable \u2014 this printing shows no rules text" };
  return { verdict: "undated", short: "unknown", long: "unknown \u2014 this printing has no release date to place it in the card's history" };
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}
