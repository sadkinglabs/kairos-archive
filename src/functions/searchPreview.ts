/** GET /search - the head a link unfurler reads, and nothing else.
 *
 * A search page is one file for every query: the query is parsed and
 * answered in the browser. That is right for people and useless for the
 * thing Discord sends when somebody pastes a link, which fetches the
 * URL once, reads the <head>, and never runs a line of JavaScript. So
 * every search link in the world unfurled to the same title and the
 * same stock picture, whatever it searched for.
 *
 * This answers those fetches, and only those, with a head built from the
 * real results: how many cards matched, which ones, and the art of the
 * first. Everyone else falls straight through to the static page by way
 * of next(), before any work is done.
 *
 * Two things are deliberate.
 *
 * Only unfurlers are answered differently - never Googlebot or any other
 * indexing crawler. Serving an indexer something a visitor would not see
 * is cloaking, and it is penalised. An unfurler is not indexing; it is
 * drawing a preview card of a page a person has already chosen to share,
 * and what it gets here is a faithful summary of what that page shows.
 *
 * The reply is never cached. It varies by User-Agent, and Cloudflare's
 * cache ignores Vary on everything but Accept-Encoding - so a cacheable
 * preview could be handed to the next person who opened the page, which
 * would be a bare head where the search box should be. no-store costs
 * nothing: unfurler traffic is a handful of requests, and Discord keeps
 * its own copy of what it draws. */

import { embedColour } from "../presentation/embed";

/** Everything that fetches a URL to draw a preview card under it. Kept
 * in step with the group in public/robots.txt: a name allowed there and
 * missing here would get the plain page, which is the bug this fixes. */
export const UNFURLERS = [
  "discordbot", "twitterbot", "facebookexternalhit", "slackbot",
  "whatsapp", "telegrambot", "linkedinbot", "redditbot",
];

export function isUnfurler(userAgent: string | null): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  return UNFURLERS.some((name) => ua.includes(name));
}

/** The query API, which already runs this exact search syntax. The
 * override exists so this route can be driven against a stand-in while
 * it is being checked; in production nothing sets it. */
export const QUERY_BASE = "https://query.kairosarchive.net";

/** It asks for a User-Agent of everyone, including us. */
const AGENT = "kairos-archive-preview (+https://kairosarchive.net)";

/** Results to name in the description. Five names fit the space Discord
 * gives before it cuts; the rest are counted. */
export const NAMED = 5;

/** How long to wait on the query API before giving up and letting the
 * plain page unfurl. An unfurler waits a few seconds at most, so a slow
 * answer is the same as no answer. */
export const TIMEOUT_MS = 2500;

interface Result {
  name: string;
  image_urls?: { small: string; normal: string; large: string; original: string } | null;
  elements?: string[];
}

interface QueryAnswer {
  total: number;
  data: Result[];
}

/** Escaped for an attribute value. The line break becomes an entity
 * rather than staying literal: a description is two lines, and a parser
 * that folds whitespace in attributes would run them together. */
const escape = (s: string): string =>
  s.replace(/[&<>"\n]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\n": "&#10;" })[c]!);

/** What the preview says, in the two strings a scraper reads.
 *
 * The count is the headline, because it is the one thing a reader wants
 * before clicking. The query comes first in the description so the link
 * says what it searched for, then the names it found. */
export function previewText(q: string, answer: QueryAnswer): { title: string; description: string } {
  const { total, data } = answer;
  const title = total === 0 ? "No cards match" : `${total} ${total === 1 ? "card" : "cards"}`;
  const names = data.slice(0, NAMED).map((c) => c.name);
  const rest = total - names.length;
  const found = names.length
    ? `${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`
    : "Nothing in the archive matches this search.";
  return { title, description: `${q}\n\n${found}` };
}

/** The whole document. A body is included because a head alone is not a
 * page: if anything but an unfurler ever reads this, it gets a sentence
 * and the way to the real thing rather than a blank screen. */
export function previewHtml(q: string, answer: QueryAnswer, pageUrl: string): string {
  const { title, description } = previewText(q, answer);
  const first = answer.data[0];
  const image = first?.image_urls?.normal ?? "https://kairosarchive.net/brand/og.png";
  const colour = embedColour(first?.elements ?? []);
  const full = `${title} · Kairos Archive`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(full)}</title>
<link rel="canonical" href="${escape(pageUrl)}" />
<meta name="description" content="${escape(description.replace(/\n+/g, " · "))}" />
<meta property="og:site_name" content="Kairos Archive" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escape(full)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${escape(pageUrl)}" />
<meta property="og:image" content="${escape(image)}" />
<meta name="theme-color" content="${escape(colour)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="robots" content="noindex" />
</head>
<body><p><a href="${escape(pageUrl)}">${escape(title)} on Kairos Archive</a></p></body>
</html>
`;
}

interface Context {
  request: Request;
  next: () => Promise<Response>;
  env?: { QUERY_BASE_URL?: string };
}

/** Ask the query API what this search finds. Any failure at all - a bad
 * query, a slow answer, the API down - returns null, and the caller
 * falls through to the static page. A preview is a nicety; it may never
 * be the reason a link does not work. */
export async function lookUp(q: string, fetchImpl: typeof fetch = fetch, base: string = QUERY_BASE): Promise<QueryAnswer | null> {
  const url = `${base}/cards?q=${encodeURIComponent(q)}&page_size=${NAMED}`;
  const stop = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": AGENT }, signal: stop });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<QueryAnswer>;
    if (typeof body.total !== "number" || !Array.isArray(body.data)) return null;
    return { total: body.total, data: body.data };
  } catch {
    return null;
  }
}

export async function onRequest(context: Context): Promise<Response> {
  const { request, next } = context;
  // The cheapest possible path for a person: one header read, then the
  // static page, untouched.
  if (!isUnfurler(request.headers.get("user-agent"))) return next();
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // No query is the empty search box, which the page's own head already
  // describes better than this could.
  if (!q) return next();

  const answer = await lookUp(q, fetch, context.env?.QUERY_BASE_URL ?? QUERY_BASE);
  if (!answer) return next();

  return new Response(previewHtml(q, answer, url.toString()), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "cdn-cache-control": "no-store",
    },
  });
}
