/** Where the Worker's data comes from: the site's own query payloads,
 * built from the verified release every page was built from. Cards and
 * printings are separate files: a query that never reads a printing
 * (most of them) costs one parse of the smaller half, which matters
 * because parsing is the Worker's whole CPU budget on a cold start.
 *
 * The two files are re-read every RECHECK_MS, and the site can be
 * rebuilt between the two reads. An answer must never mix a card list
 * from one release with a printing list from another, so the Worker
 * hands out snapshots: a card-only snapshot is one file, a full
 * snapshot is both files carrying the same tag. When the tags differ,
 * the older side is re-read once; if they still differ, or a read
 * fails, the last coherent snapshot is served, and when there is none
 * the caller gets an error and answers "unavailable". */
import type { Card, Printing } from "../../src/search/types";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Cards { tag: string; cards: Card[] }
export interface Printings { tag: string; printings: Printing[] }
/** Cards and printings from one release. */
export interface Snapshot { tag: string; cards: Card[]; printings: Printing[] }

export const RECHECK_MS = 10 * 60 * 1000;
export const USER_AGENT = "kairos-query/0.1 (+https://kairosarchive.net)";

const CACHED: RequestInit = { cf: { cacheEverything: true, cacheTtl: 300 } } as RequestInit;

export class MismatchedRelease extends Error {
  constructor(readonly cardsTag: string, readonly printingsTag: string) {
    super(`cards are from ${cardsTag} but printings from ${printingsTag}`);
  }
}

class Held<T> {
  private value: Promise<T> | null = null;
  private fetchedAt = 0;
  constructor(private readonly url: string, private readonly fetchImpl: Fetch, private readonly now: () => number) {}
  get(): Promise<T> {
    if (this.value && this.now() - this.fetchedAt < RECHECK_MS) return this.value;
    return this.refresh();
  }
  /** Re-read now, keeping what we have if the read fails. */
  refresh(): Promise<T> {
    const previous = this.value;
    this.fetchedAt = this.now();
    this.value = this.load().catch((err: unknown) => {
      if (previous) return previous;      // keep serving what we have
      this.value = null;                  // nothing to fall back on: retry next time
      throw err;
    });
    return this.value;
  }
  private async load(): Promise<T> {
    const res = await this.fetchImpl(this.url, { ...CACHED, headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    if (!res.ok) throw new Error(`${this.url}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

export class Data {
  private readonly cards: Held<Cards>;
  private readonly printings: Held<Printings>;
  /** The last pair seen with one tag, for when a refresh leaves the two apart. */
  private coherent: Snapshot | null = null;
  constructor(readonly siteBase: string, fetchImpl: Fetch = (u, i) => fetch(u, i), now: () => number = Date.now) {
    this.cards = new Held(`${siteBase}/data/query/cards.json`, fetchImpl, now);
    this.printings = new Held(`${siteBase}/data/query/printings.json`, fetchImpl, now);
  }

  /** The card list alone: one file, one release by construction. */
  getCards(): Promise<Cards> { return this.cards.get(); }

  /** Cards and printings from the same release. */
  async getSnapshot(): Promise<Snapshot> {
    try {
      let cards = await this.cards.get();
      let printings = await this.printings.get();
      if (cards.tag !== printings.tag) {
        // A rebuild landed between the two reads: bring the stale side up.
        if (newer(printings.tag, cards.tag)) cards = await this.cards.refresh();
        else printings = await this.printings.refresh();
      }
      if (cards.tag === printings.tag) {
        this.coherent = { tag: cards.tag, cards: cards.cards, printings: printings.printings };
        return this.coherent;
      }
      if (this.coherent) return this.coherent;
      throw new MismatchedRelease(cards.tag, printings.tag);
    } catch (err) {
      if (this.coherent) return this.coherent;
      throw err;
    }
  }
}

/** Whether tag `a` (vX.Y.Z) is a later release than `b`; unparseable tags
 * are treated as older, so the parseable side is refreshed. */
export function newer(a: string, b: string): boolean {
  const parts = (t: string) => (/^v(\d+)\.(\d+)\.(\d+)$/.exec(t) ?? [0, "-1", "-1", "-1"]).slice(1).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}
