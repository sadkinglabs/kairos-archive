/** The Access token check: a token signed by the team's key, for this
 * application, unexpired, from the team's issuer, and nothing else. */
import { beforeEach, describe, expect, it } from "vitest";
import { forgetKeys, tokenOf, verifyAccess } from "../src/access";
import { AUD, NOW, TEAM, b64url, fakeCerts, good, other, pair, token } from "./helpers";

const req = (t: string | null, viaCookie = false) => new Request("https://stats.test/", { headers: t ? (viaCookie ? { cookie: `x=1; CF_Authorization=${t}` } : { "cf-access-jwt-assertion": t }) : {} });

describe("verifyAccess", () => {
  beforeEach(forgetKeys);
  it("accepts a good token from the header or the cookie and names the person", async () => {
    const t = await token(good);
    expect(await verifyAccess(req(t), TEAM, AUD, fakeCerts, NOW)).toEqual({ ok: true, email: "owner@example.com" });
    expect(await verifyAccess(req(t, true), TEAM, AUD, fakeCerts, NOW)).toEqual({ ok: true, email: "owner@example.com" });
    expect(tokenOf(req(t, true))).toBe(t);
  });
  it("refuses a missing token, another audience, an expired token, another issuer", async () => {
    expect((await verifyAccess(req(null), TEAM, AUD, fakeCerts, NOW)).reason).toBe("No Access token.");
    expect((await verifyAccess(req(await token({ ...good, aud: "other" })), TEAM, AUD, fakeCerts, NOW)).reason).toContain("another application");
    expect((await verifyAccess(req(await token({ ...good, exp: NOW / 1000 - 1 })), TEAM, AUD, fakeCerts, NOW)).reason).toContain("expired");
    expect((await verifyAccess(req(await token({ ...good, iss: "https://evil.example" })), TEAM, AUD, fakeCerts, NOW)).reason).toContain("another issuer");
  });
  it("refuses a bad signature, an unknown key, a tampered payload, and fails closed without configuration", async () => {
    expect((await verifyAccess(req(await token(good, other.privateKey)), TEAM, AUD, fakeCerts, NOW)).reason).toBe("Bad signature.");
    expect((await verifyAccess(req(await token(good, pair.privateKey, "k9")), TEAM, AUD, fakeCerts, NOW)).reason).toContain("unknown key");
    const [h, , s] = (await token(good)).split(".");
    const tampered = `${h}.${b64url(JSON.stringify({ ...good, email: "mallory@example.com" }))}.${s}`;
    expect((await verifyAccess(req(tampered), TEAM, AUD, fakeCerts, NOW)).reason).toBe("Bad signature.");
    expect((await verifyAccess(req(await token(good)), undefined, AUD, fakeCerts, NOW)).reason).toContain("not configured");
    expect((await verifyAccess(req("not.a.token"), TEAM, AUD, fakeCerts, NOW)).reason).toBe("Unexpected token header.");
  });
  it("caches the team's keys for an hour", async () => {
    let calls = 0;
    const counting = async (url: string) => { calls++; return fakeCerts(url); };
    const t = await token({ ...good, exp: NOW / 1000 + 3 * 3600 });
    expect((await verifyAccess(req(t), TEAM, AUD, counting, NOW)).ok).toBe(true);
    expect((await verifyAccess(req(t), TEAM, AUD, counting, NOW + 1000)).ok).toBe(true);
    expect(calls).toBe(1);
    expect((await verifyAccess(req(t), TEAM, AUD, counting, NOW + 2 * 3600 * 1000)).ok).toBe(true);
    expect(calls).toBe(2);
  });
});
