/** Every answer is JSON with an `object` field, the way Scryfall's API
 * reads: a list, a card, or an error. Errors carry a status, a stable
 * code and a sentence; a path the Worker does not serve is a JSON 404,
 * never an empty body. Every answer allows any origin. */

export interface ErrorBody { object: "error"; status: number; code: string; details: string; warnings?: string[] }

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
};

export function json(body: unknown, status = 200, cacheSeconds = 300): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, "cache-control": status === 200 ? `public, max-age=${cacheSeconds}` : "no-store" },
  });
}

export function error(status: number, code: string, details: string, warnings?: string[]): Response {
  const body: ErrorBody = { object: "error", status, code, details };
  if (warnings?.length) body.warnings = warnings;
  return json(body, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...HEADERS, "access-control-max-age": "86400" } });
}
