/** Shared by the stats tests: a team key pair, its published certs, and
 * a way to mint Access tokens signed with it. */
const b64url = (b: ArrayBuffer | string) => (typeof b === "string" ? btoa(b) : btoa(String.fromCharCode(...new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export { b64url };

export const TEAM = "kairos.cloudflareaccess.com";
export const AUD = "aud-0123";
export const NOW = 1_800_000_000_000;

const rsa = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
export const pair = (await crypto.subtle.generateKey(rsa, true, ["sign", "verify"])) as CryptoKeyPair;
export const other = (await crypto.subtle.generateKey(rsa, true, ["sign", "verify"])) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };

export async function token(payload: Record<string, unknown>, key = pair.privateKey, kid = "k1"): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "RS256", kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export const fakeCerts = async (url: string) => (url === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : new Response("nf", { status: 404 }));
export const good = { aud: [AUD], exp: NOW / 1000 + 600, iss: `https://${TEAM}`, email: "owner@example.com" };
