/** Each release's changes.json: what it changed against the release
 * before it, published at the release root from v3.3.2 on. Fetched at
 * build for the changelog page only; a root without the file (an older
 * release, or a local build) yields null and the page says so. */
import { fetchWithRetry, USER_AGENT, type Release } from "./registry";

export interface Changes {
  from: string | null;
  to: string;
  schema_version: { from: number | null; to: number };
  summary: Record<"cards_added" | "cards_changed" | "cards_removed" | "printings_added" | "printings_changed" | "printings_removed" | "sets_added" | "images_added" | "images_replaced" | "history_rows_added" | "identifiers_removed", number>;
  cards: { added: string[]; changed: { codex_id: string; name: string; fields: string[] }[]; removed: string[] };
  printings: { added: string[]; changed: { printing_id: string; codex_id: string; fields: string[] }[]; removed: string[] };
  sets: { added: string[] };
  images: { added: string[]; replaced: string[] };
  history: { added: { codex_id: string; valid_from: string; source: string | null }[] };
}

/** "2 cards changed · 4 printings added · 0 identifiers removed": the
 * counts that are not zero, and the identifier count always. */
export function summaryParts(c: Changes): string[] {
  const s = c.summary;
  const parts: string[] = [];
  const say = (n: number, one: string, many: string) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  say(s.cards_added, "card added", "cards added");
  say(s.cards_changed, "card changed", "cards changed");
  say(s.printings_added, "printing added", "printings added");
  say(s.printings_changed, "printing changed", "printings changed");
  say(s.sets_added, "set added", "sets added");
  say(s.images_added, "image added", "images added");
  say(s.images_replaced, "image replaced", "images replaced");
  say(s.history_rows_added, "history row added", "history rows added");
  parts.push(`${s.identifiers_removed} identifiers removed`);
  return parts;
}

/** Whether anything at all changed, so a release of unchanged data reads
 * as such rather than as an empty list. */
export function isEmpty(c: Changes): boolean {
  return Object.values(c.summary).every((n) => n === 0);
}

export async function loadChanges(baseUrl: string, releases: Release[]): Promise<Map<string, Changes | null>> {
  const out = new Map<string, Changes | null>();
  await Promise.all(releases.map(async (r) => {
    try {
      const response = await fetchWithRetry(`${baseUrl}/${r.tag}/changes.json`, { "User-Agent": USER_AGENT, Accept: "application/json" });
      out.set(r.tag, (await response.json()) as Changes);
    } catch {
      out.set(r.tag, null);
    }
  }));
  return out;
}
