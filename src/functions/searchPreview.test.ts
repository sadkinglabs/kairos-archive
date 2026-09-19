import { describe, expect, it, vi } from "vitest";
import { isUnfurler, lookUp, onRequest, previewHtml, previewText, UNFURLERS } from "./searchPreview";
import { readFileSync } from "node:fs";

const answer = (total: number, names: string[], image = true) => ({
  total,
  data: names.map((name) => ({
    name,
    elements: ["Water"],
    image_urls: image ? { small: `https://api.kairosarchive.net/images/${name}.small.webp`, normal: `https://api.kairosarchive.net/images/${name}.normal.webp`, large: "", original: "" } : null,
  })),
});

const ask = (ua: string | null, url = "https://kairosarchive.net/search?q=r%3Dlure") =>
  onRequest({
    request: new Request(url, { headers: ua ? { "user-agent": ua } : {} }),
    next: async () => new Response("the static page", { headers: { "content-type": "text/html" } }),
  });

describe("who gets the preview", () => {
  it("knows the unfurlers by their real User-Agent strings", () => {
    expect(isUnfurler("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).toBe(true);
    expect(isUnfurler("Twitterbot/1.0")).toBe(true);
    expect(isUnfurler("facebookexternalhit/1.1")).toBe(true);
    expect(isUnfurler("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
    expect(isUnfurler("WhatsApp/2.19.81 A")).toBe(true);
    expect(isUnfurler("TelegramBot (like TwitterBot)")).toBe(true);
  });

  it("does not answer a person, or an indexing crawler", async () => {
    for (const ua of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      null,
    ]) {
      expect(isUnfurler(ua), String(ua)).toBe(false);
      expect(await (await ask(ua)).text(), String(ua)).toBe("the static page");
    }
  });

  // Cloaking is serving an indexer something the visitor does not get.
  // The preview is not that, and this is the line that keeps it so.
  it("never answers Googlebot even though robots.txt lets it at card pages", async () => {
    const response = await ask("Googlebot/2.1");
    expect(await response.text()).toBe("the static page");
  });

  it("covers every unfurler robots.txt names", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    const allowed = robots.split("\n")
      .filter((l) => l.startsWith("User-agent:") && !l.includes("*"))
      .map((l) => l.replace("User-agent:", "").trim().toLowerCase());
    for (const name of allowed) {
      expect(UNFURLERS.some((u) => name.includes(u)), name).toBe(true);
    }
  });
});

describe("what the preview says", () => {
  it("leads with the count and names what it found", () => {
    const { title, description } = previewText("r=lure", answer(37, ["Polar Bears", "Flood", "Undertow"]));
    expect(title).toBe("37 cards");
    expect(description).toContain("r=lure");
    expect(description).toContain("Polar Bears, Flood, Undertow and 34 more");
  });

  it("counts one card in the singular and adds no 'more' when it has them all", () => {
    expect(previewText("n=polar", answer(1, ["Polar Bears"])).title).toBe("1 card");
    expect(previewText("n=polar", answer(1, ["Polar Bears"])).description).not.toContain("more");
  });

  it("says so plainly when nothing matches", () => {
    const { title, description } = previewText("n=zzzz", answer(0, []));
    expect(title).toBe("No cards match");
    expect(description).toContain("Nothing in the archive matches");
  });
});

describe("the document", () => {
  const html = previewHtml("r=lure", answer(37, ["Polar Bears", "Flood"]), "https://kairosarchive.net/search?q=r%3Dlure");

  it("carries the first card's art, at full size", () => {
    expect(html).toContain('<meta property="og:image" content="https://api.kairosarchive.net/images/Polar Bears.normal.webp" />');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("colours the bar by the results' element", () => {
    expect(html).toContain('name="theme-color" content="#2b6cb0"');
  });

  it("points back at the real search page and asks not to be indexed", () => {
    expect(html).toContain('<meta property="og:url" content="https://kairosarchive.net/search?q=r%3Dlure" />');
    expect(html).toContain('name="robots" content="noindex"');
  });

  it("falls back to the brand picture when a result has no art", () => {
    expect(previewHtml("x", answer(1, ["No Art"], false), "https://kairosarchive.net/search?q=x"))
      .toContain('content="https://kairosarchive.net/brand/og.png"');
  });

  it("keeps the description's two lines as an entity, not a literal break", () => {
    expect(html).toContain("&#10;&#10;");
    const attrs = html.split("\n").filter((l) => l.startsWith("<meta"));
    expect(attrs.length, "every meta tag is on one line").toBe(html.match(/<meta /g)!.length);
  });

  it("escapes a query that would otherwise break out of the attribute", () => {
    const nasty = previewHtml('n="><script>alert(1)</script>', answer(0, []), "https://kairosarchive.net/search?q=x");
    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
    expect(nasty).toContain("&quot;");
  });
});

describe("asking the query API", () => {
  it("sends a User-Agent, because the API requires one", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(answer(2, ["A", "B"])), { headers: { "content-type": "application/json" } }));
    await lookUp("r=lure", fetchImpl as unknown as typeof fetch);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![1]?.headers).toMatchObject({ "user-agent": expect.stringContaining("kairos-archive") });
    expect(call![0]).toContain("page_size=5");
  });

  it("gives up quietly on an error, a refusal, or nonsense", async () => {
    const cases: (() => Promise<Response>)[] = [
      async () => { throw new Error("network"); },
      async () => new Response("no", { status: 500 }),
      async () => new Response("{}", { headers: { "content-type": "application/json" } }),
      async () => new Response("not json", { headers: { "content-type": "application/json" } }),
    ];
    for (const impl of cases) {
      expect(await lookUp("r=lure", impl as unknown as typeof fetch)).toBeNull();
    }
  });
});

describe("the whole route", () => {
  it("serves the built preview to Discord", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(answer(37, ["Polar Bears"])), { headers: { "content-type": "application/json" } }));
    const response = await ask("Discordbot/2.0");
    const body = await response.text();
    expect(body).toContain("og:image");
    expect(body).toContain("37 cards");
    vi.unstubAllGlobals();
  });

  // Cloudflare's cache ignores Vary on anything but Accept-Encoding, so
  // a cacheable preview could be served to the next person who opened
  // the page.
  it("marks the preview uncacheable, at the browser and at the edge", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(answer(1, ["Flood"])), { headers: { "content-type": "application/json" } }));
    const response = await ask("Discordbot/2.0");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    vi.unstubAllGlobals();
  });

  it("falls through to the page when the query API cannot answer", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect(await (await ask("Discordbot/2.0")).text()).toBe("the static page");
    vi.unstubAllGlobals();
  });

  it("falls through for an empty search box, which the page describes itself", async () => {
    expect(await (await ask("Discordbot/2.0", "https://kairosarchive.net/search")).text()).toBe("the static page");
    expect(await (await ask("Discordbot/2.0", "https://kairosarchive.net/search?q=%20%20")).text()).toBe("the static page");
  });
});
