import { beforeAll, describe, expect, it } from "vitest";
import type { Jwk } from "../src/auth";
import { handleApi } from "../src/index";
import type { Env } from "../src/index";
import { fakeD1 } from "./fake-d1";

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-123";
let keys: Jwk[] = [];
let priv: CryptoKey;
const getKeys = async () => keys;

const b64url = (b: Uint8Array | string): string =>
  Buffer.from(typeof b === "string" ? new TextEncoder().encode(b) : b).toString("base64url");

async function token(claims: Record<string, unknown>, kid = "k1", key: CryptoKey = priv): Promise<string> {
  const h = b64url(JSON.stringify({ alg: "RS256", kid }));
  const p = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}
const good = (email: string) => token({ aud: [AUD], iss: `https://${TEAM}`, email, exp: Date.now() / 1000 + 600 });

const genKey = () => (crypto.subtle.generateKey as (...a: unknown[]) => Promise<CryptoKeyPair>)(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);

beforeAll(async () => {
  const kp = await genKey();
  priv = kp.privateKey;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
  keys = [{ kid: "k1", kty: "RSA", n: jwk.n!, e: jwk.e! }];
});

function setup(extra: Partial<Env> = {}) {
  const env: Env = { DB: fakeD1(), ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...extra };
  const call = async (method: string, path: string, jwt?: string, body?: unknown, host = "business-case.example.workers.dev") => {
    const headers: Record<string, string> = {};
    if (jwt) headers["cf-access-jwt-assertion"] = jwt;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await handleApi(new Request(`https://${host}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env, getKeys);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { env, call };
}

describe("Access authentication", () => {
  it("rejects requests without a JWT (403)", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/projects")).status).toBe(403);
  });
  it("ignores a forged email header", async () => {
    const { env } = setup();
    const res = await handleApi(new Request("https://x.workers.dev/api/me",
      { headers: { "cf-access-authenticated-user-email": "owner@example.com" } }), env, getKeys);
    expect(res.status).toBe(403);
  });
  it("rejects wrong audience, issuer, expiry, signature and unknown key", async () => {
    const { call } = setup();
    const exp = Date.now() / 1000 + 600;
    const other = await genKey();
    const bad = [
      await token({ aud: ["other"], iss: `https://${TEAM}`, email: "a@x.com", exp }),
      await token({ aud: [AUD], iss: "https://evil.cloudflareaccess.com", email: "a@x.com", exp }),
      await token({ aud: [AUD], iss: `https://${TEAM}`, email: "a@x.com", exp: Date.now() / 1000 - 10 }),
      await token({ aud: [AUD], iss: `https://${TEAM}`, email: "a@x.com", exp }, "k1", other.privateKey),
      await token({ aud: [AUD], iss: `https://${TEAM}`, email: "a@x.com", exp }, "k2"),
      "not.a.jwt",
    ];
    for (const t of bad) expect((await call("GET", "/api/me", t)).status).toBe(403);
  });
  it("fails closed when Access is not configured (503)", async () => {
    const { call } = setup({ ACCESS_AUD: "" });
    expect((await call("GET", "/api/me", await good("a@x.com"))).status).toBe(503);
  });
  it("accepts a valid token and lower-cases the email", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/me", await good("Owner@Example.com"))).body).toEqual({ email: "owner@example.com" });
  });
  it("DEV_AUTH_EMAIL works only on localhost", async () => {
    const { call } = setup({ DEV_AUTH_EMAIL: "dev@x.com" });
    expect((await call("GET", "/api/me", undefined, undefined, "localhost")).body).toEqual({ email: "dev@x.com" });
    expect((await call("GET", "/api/me")).status).toBe(403);
  });
});

describe("projects", () => {
  it("create, list, get, update, copy, delete", async () => {
    const { call } = setup();
    const a = await good("a@x.com");
    const created = await call("POST", "/api/projects", a, { name: "أبحر", inputs: { LandValue: 60e6 } });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await call("GET", "/api/projects", a)).body).toHaveLength(1);
    expect((await call("GET", `/api/projects/${id}`, a)).body.inputs).toEqual({ LandValue: 60e6 });
    const upd = await call("PUT", `/api/projects/${id}`, a, { name: "أبحر 2", inputs: { LandValue: 52e6 } });
    expect(upd.body.name).toBe("أبحر 2");
    const cp = await call("POST", `/api/projects/${id}/copy`, a);
    expect(cp.status).toBe(201);
    expect(cp.body.name).toBe("أبحر 2 (نسخة)");
    expect((await call("DELETE", `/api/projects/${id}`, a)).status).toBe(204);
    expect((await call("GET", "/api/projects", a)).body).toHaveLength(1);
  });

  it("a user cannot see, change, copy or delete another user's project", async () => {
    const { call } = setup();
    const a = await good("a@x.com"), b = await good("b@x.com");
    const id = (await call("POST", "/api/projects", a, { name: "سري", inputs: { x: 1 } })).body.id as string;
    expect((await call("GET", "/api/projects", b)).body).toEqual([]);
    expect((await call("GET", `/api/projects/${id}`, b)).status).toBe(404);
    expect((await call("PUT", `/api/projects/${id}`, b, { name: "x", inputs: {} })).status).toBe(404);
    expect((await call("POST", `/api/projects/${id}/copy`, b)).status).toBe(404);
    expect((await call("DELETE", `/api/projects/${id}`, b)).status).toBe(404);
    expect((await call("GET", `/api/projects/${id}`, a)).body.name).toBe("سري");
  });

  it("validates bodies", async () => {
    const { call } = setup();
    const a = await good("a@x.com");
    expect((await call("POST", "/api/projects", a, { name: "", inputs: {} })).status).toBe(400);
    expect((await call("POST", "/api/projects", a, { name: "x", inputs: [1] })).status).toBe(400);
    expect((await call("POST", "/api/projects", a, { name: "x", inputs: { big: "a".repeat(300_000) } })).status).toBe(400);
  });
});
