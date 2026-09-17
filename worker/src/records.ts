/** What a hit looks like on the wire: the card's compact record, the
 * addresses every registry record carries, and the printing the hit
 * was judged on (or the card's default printing when the query never
 * read one), with its image addresses. Pure. */
import type { Card, Printing } from "../../src/search/types";
import { cardPath } from "../../src/data/paths";

export const API_BASE = "https://api.kairosarchive.net";
export const SITE_BASE = "https://kairosarchive.net";
export const IMAGE_BASE = `${API_BASE}/images`;

export function imageUrls(printingId: string, hash: string | null, back = false): Record<string, string> | null {
  if (!hash) return null;
  const face = back ? ".back" : "";
  return {
    small: `${IMAGE_BASE}/${printingId}.${hash}${face}.small.webp`,
    normal: `${IMAGE_BASE}/${printingId}.${hash}${face}.normal.webp`,
    large: `${IMAGE_BASE}/${printingId}.${hash}${face}.large.webp`,
    original: `${IMAGE_BASE}/${printingId}.${hash}${face}.original.png`,
  };
}

export interface PrintingRecord extends Printing {
  api_url: string; kairos_url: string; image_urls: Record<string, string> | null;
}

export interface CardRecord extends Omit<Card, "image_hash"> {
  object: "card";
  api_url: string; kairos_url: string;
  image_urls: Record<string, string> | null;
  /** The printing this hit was judged on; the default printing when the query read none. */
  printing: PrintingRecord | { printing_id: string; api_url: string; kairos_url: string } | null;
}

export function printingRecord(p: Printing): PrintingRecord {
  return {
    ...p,
    api_url: `${API_BASE}/v3/printings/${p.printing_id}.json`,
    kairos_url: `${SITE_BASE}/printings/${p.printing_id}`,
    image_urls: imageUrls(p.printing_id, p.image_hash),
  };
}

export function cardRecord(card: Card, printing: Printing | null): CardRecord {
  const { image_hash, ...rest } = card;
  const defaultId = card.default_printing_id;
  const shown = printing ? printingRecord(printing)
    : defaultId ? { printing_id: defaultId, api_url: `${API_BASE}/v3/printings/${defaultId}.json`, kairos_url: `${SITE_BASE}/printings/${defaultId}` }
    : null;
  return {
    object: "card",
    ...rest,
    api_url: `${API_BASE}/v3/cards/${card.codex_id}.json`,
    kairos_url: `${SITE_BASE}${cardPath(card)}`,
    image_urls: printing ? imageUrls(printing.printing_id, printing.image_hash) : defaultId ? imageUrls(defaultId, image_hash) : null,
    printing: shown,
  };
}
