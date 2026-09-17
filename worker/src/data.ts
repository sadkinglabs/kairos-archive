/** Where the Worker's data comes from: the site's own query payloads,
 * built from the verified release every page was built from. Cards and
 * printings are separate files: a query that never reads a printing
 * (most of them) costs one parse of the smaller half, which matters
 * because parsing is the Worker's whole CPU budget on a cold start.
 * Each isolate keeps the parsed lists in module scope and re-reads the
 * files every RECHECK_MS; the edge caches the fetches in between. */
import type { Card, Printing } from "../../src/search/types";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Cards { tag: string; cards: Card[] }
export interface Printings { tag: string; printings: Printing[] }

export const RECHECK_MS = 10 * 60 * 1000;
export const USER_AGENT = "kairos-query/0.1 (+https://kairosarchive.net)";

const CACHED: RequestInit = { cf: { cacheEverything: true, cacheTtl: 300 } } as RequestInit;

class Held<T> {
  private value: Promise<T> | null = null;
  private fetchedAt = 0;
  constructor(private readonly url: string, private readonly fetchImpl: Fetch, private readonly now: () => number) {}
  get(): Promise<T> {
    if (this.value && this.now() - this.fetchedAt < RECHECK_MS) return this.value;
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
  constructor(readonly siteBase: string, fetchImpl: Fetch = (u, i) => fetch(u, i), now: () => number = Date.now) {
    this.cards = new Held(`${siteBase}/data/query/cards.json`, fetchImpl, now);
    this.printings = new Held(`${siteBase}/data/query/printings.json`, fetchImpl, now);
  }
  getCards(): Promise<Cards> { return this.cards.get(); }
  getPrintings(): Promise<Printings> { return this.printings.get(); }
}
