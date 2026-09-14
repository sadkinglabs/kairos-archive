/** The site's own compact search records, built at build time from one
 * verified registry release (src/data/registry.ts). Field names follow
 * the registry's export so nothing needs translating in the head. */

export type ImageStatus = "missing" | "lowres" | "ok";

export interface Card {
  codex_id: string;
  name: string;
  type: string | null;
  category: string | null;
  rarity: string | null;
  slot: string | null;
  subtypes: string[];
  elements: string[];
  keywords: string[];
  umbrellas: string[];
  cost: number | null;
  attack: number | null;
  defense: number | null;
  power: number | null;
  life: number | null;
  thr_air: number;
  thr_earth: number;
  thr_fire: number;
  thr_water: number;
  rules_text: string;
  has_back: boolean;
  errata: boolean;
  set_codes: string[];
  printing_ids: string[];
  default_printing_id: string | null;
  image_status: ImageStatus;
  image_hash: string | null;
}

export interface Printing {
  printing_id: string;
  codex_id: string;
  slug: string;
  set_code: string | null;
  set_name: string;
  released_at: string | null;
  product: string | null;
  finish: string | null;
  artist: string | null;
  artist_slug: string | null;
  typeline: string | null;
  flavour_text: string | null;
  printed_as_current: boolean | null;
  retired_at: string | null;
  image_status: ImageStatus;
  image_hash: string | null;
}

export interface SearchData {
  cards: Card[];
  printings: Printing[];
}
