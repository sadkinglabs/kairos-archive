/** Cloudflare Access puts a signed JWT on every request it lets through
 * to a protected hostname. The Worker verifies it itself rather than
 * trusting that Access is in front: the token's signature against the
 * team's published keys, its audience against this application's, its
 * expiry and its issuer. Without a valid token the dashboard is refused,
 * so a hostname with no Access policy fails closed. */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
interface Header { alg?: string; kid?: string }
interface Payload { aud?: string | string[]; exp?: number; iss?: string; email?: string }

/** The team's keys, kept for an hour per isolate. */
let cached: { domain: string; keys: Jwk[]; at: number } | null = null;
const KEYS_TTL = 60 * 60 * 1000;

export async function teamKeys(domain: string, fetchImpl: Fetch, now: number): Promise<Jwk[]> {
  if (cached && cached.domain === domain && now - cached.at < KEYS_TTL) return cached.keys;
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  cached = { domain, keys: body.keys ?? [], at: now };
  return cached.keys;
}

/** For tests: forget the cached keys. */
export function forgetKeys(): void { cached = null; }

function b64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decode<T>(part: string): T | null {
  try { return JSON.parse(new TextDecoder().decode(b64url(part))) as T; } catch { return null; }
}

export interface Verdict { ok: boolean; email?: string; reason?: string }

/** The token from the header Access sets, or its cookie. */
export function tokenOf(request: Request): string | null {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header;
  const cookie = request.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

export async function verifyAccess(request: Request, domain: string | undefined, aud: string | undefined, fetchImpl: Fetch, now = Date.now()): Promise<Verdict> {
  if (!domain || !aud) return { ok: false, reason: "Access is not configured (ACCESS_TEAM_DOMAIN, ACCESS_AUD)." };
  const token = tokenOf(request);
  if (!token) return { ok: false, reason: "No Access token." };
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return { ok: false, reason: "Malformed token." };
  const header = decode<Header>(h);
  const payload = decode<Payload>(p);
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return { ok: false, reason: "Unexpected token header." };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ""];
  if (!auds.includes(aud)) return { ok: false, reason: "Token is for another application." };
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return { ok: false, reason: "Token has expired." };
  if (payload.iss !== `https://${domain}`) return { ok: false, reason: "Token is from another issuer." };
  let keys: Jwk[];
  try { keys = await teamKeys(domain, fetchImpl, now); } catch (err) { return { ok: false, reason: String(err) }; }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "Token signed with an unknown key." };
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    return valid ? { ok: true, email: payload.email } : { ok: false, reason: "Bad signature." };
  } catch {
    return { ok: false, reason: "Bad signature." };
  }
}
