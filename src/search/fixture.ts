import type { Card, Printing, SearchData } from "./types";

const card = (over: Partial<Card> & { codex_id: string; name: string }): Card => ({
  type: "Minion", category: "Spell", rarity: "Ordinary", slot: "Ordinary", subtypes: ["Mortal"], elements: ["Air"],
  keywords: [], umbrellas: [], cost: 3, attack: 2, defense: 2, power: 2, life: null,
  thr_air: 1, thr_earth: 0, thr_fire: 0, thr_water: 0, rules_text: "", has_back: false, errata: false,
  set_codes: [], printing_ids: [], default_printing_id: null, image_status: "missing", image_hash: null,
  ...over,
});

const printing = (over: Partial<Printing> & { printing_id: string; codex_id: string; slug: string }): Printing => ({
  set_code: "001", set_name: "Alpha", released_at: "2023-06-22", product: "Booster", finish: "Standard",
  artist: "Ossi Hiekkala", artist_slug: "ossi_hiekkala", typeline: "An Ordinary Mortal", flavour_text: null,
  printed_as_current: true, retired_at: null, image_status: "missing", image_hash: null,
  ...over,
});

export const CARDS: Card[] = [
  card({ codex_id: "C000001", name: "Apprentice Wizard", keywords: ["Spellcaster", "Genesis"], cost: 3, attack: 1, defense: 1, power: 1,
    rules_text: "Spellcaster\nGenesis → Draw a spell.", set_codes: ["001", "002"], printing_ids: ["P000001", "P000002", "P000003"],
    default_printing_id: "P000001" }),
  card({ codex_id: "C000002", name: "Polar Bears", subtypes: ["Beast"], elements: ["Water"], cost: 3, attack: 3, defense: 3, power: 3,
    thr_air: 0, thr_water: 1, rules_text: "Submerge", keywords: ["Submerge"], errata: true, rarity: "Exceptional", slot: "Exceptional",
    set_codes: ["001", "999"], printing_ids: ["P000004", "P000005"], default_printing_id: "P000005", image_status: "ok", image_hash: "aaaa" }),
  card({ codex_id: "C000003", name: "Witch", elements: ["Water", "Air"], umbrellas: ["Evil"], cost: 2, attack: 1, defense: 2, power: 1,
    thr_water: 1, rules_text: "Curse a minion.", rarity: "Elite", slot: "Elite", set_codes: ["004"], printing_ids: ["P000006"],
    default_printing_id: "P000006" }),
  card({ codex_id: "C000004", name: "Broken Site", type: "Site", category: "Site", rarity: null, slot: null, subtypes: [], elements: ["None"],
    cost: null, attack: null, defense: null, power: null, thr_air: 0, rules_text: "All sites are broken.", set_codes: ["006"],
    printing_ids: ["P000007"], default_printing_id: "P000007" }),
  card({ codex_id: "C000005", name: "Druid", type: "Avatar", category: "Avatar", rarity: null, slot: null, life: 20, cost: null,
    attack: 4, defense: 2, power: 3, has_back: true, rules_text: "Genesis → Draw a spell. Bears are friends.", set_codes: ["004"],
    printing_ids: ["P000008"], default_printing_id: "P000008", image_status: "lowres", image_hash: "bbbb" }),
];

export const PRINTINGS: Printing[] = [
  printing({ printing_id: "P000001", codex_id: "C000001", slug: "001-apprentice_wizard-b-s" }),
  printing({ printing_id: "P000002", codex_id: "C000001", slug: "001-apprentice_wizard-b-f", finish: "Foil" }),
  printing({ printing_id: "P000003", codex_id: "C000001", slug: "002-apprentice_wizard-b-s", set_code: "002", set_name: "Beta", released_at: "2023-10-06" }),
  printing({ printing_id: "P000004", codex_id: "C000002", slug: "001-polar_bears-b-s", printed_as_current: false }),
  printing({ printing_id: "P000005", codex_id: "C000002", slug: "999-polar_bears-op-rf", set_code: "999", set_name: "Promo",
    product: "OrganizedPlay", finish: "Rainbow", released_at: "2026-09-01", image_status: "ok", image_hash: "aaaa" }),
  printing({ printing_id: "P000006", codex_id: "C000003", slug: "004-witch-b-s", set_code: "004", set_name: "Arthurian Legends",
    released_at: "2024-05-01", artist: "Jeff A. Menges", artist_slug: "jeff_a_menges" }),
  printing({ printing_id: "P000007", codex_id: "C000004", slug: "006-broken_site-b-s", set_code: "006", set_name: "Gothic",
    released_at: "2025-08-01", retired_at: "2026-01-01" }),
  printing({ printing_id: "P000008", codex_id: "C000005", slug: "004-druid-bt-s", set_code: "004", set_name: "Arthurian Legends",
    product: "BoxTopper", released_at: "2024-05-01", image_status: "lowres", image_hash: "bbbb" }),
];

export const SLUG_HISTORY = [
  { slug: "004-witch_old-b-s", printing_id: "P000006" },
];

export const DATA: SearchData = { cards: CARDS, printings: PRINTINGS };
