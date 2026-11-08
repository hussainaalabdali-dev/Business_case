/**
 * Cloudflare Access JWT verification (RS256). The email comes from the verified token,
 * never from the Cf-Access-Authenticated-User-Email header (that header can be forged on any path Access does not cover).
 */

export interface AccessConfig { teamDomain: string; aud: string }
export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
export type JwksFetcher = (teamDomain: string) => Promise<Jwk[]>;

export class AuthError extends Error {}

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const b64urlJson = <T>(s: string): T => {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;
  } catch {
    throw new AuthError("malformed token");
  }
};

let cache: { domain: string; keys: Jwk[]; at: number } | null = null;

export const fetchJwks: JwksFetcher = async teamDomain => {
  if (cache && cache.domain === teamDomain && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new AuthError("cannot load Access keys");
  const body = (await res.json()) as { keys: Jwk[] };
  cache = { domain: teamDomain, keys: body.keys, at: Date.now() };
  return body.keys;
};

export function normaliseTeamDomain(d: string): string {
  return d.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export async function verifyAccessJwt(token: string, cfg: AccessConfig, getKeys: JwksFetcher = fetchJwks,
  now: number = Date.now() / 1000): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("malformed token");
  const [h, p, s] = parts as [string, string, string];
  const header = b64urlJson<{ alg: string; kid: string }>(h);
  if (header.alg !== "RS256") throw new AuthError("unexpected alg");
  const teamDomain = normaliseTeamDomain(cfg.teamDomain);
  const jwk = (await getKeys(teamDomain)).find(k => k.kid === header.kid);
  if (!jwk) throw new AuthError("unknown key");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  let sig: Uint8Array;
  try {
    sig = b64urlToBytes(s);
  } catch {
    throw new AuthError("malformed token");
  }
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new AuthError("bad signature");
  const claims = b64urlJson<{ aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string }>(p);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(cfg.aud)) throw new AuthError("wrong audience");
  if (claims.iss !== `https://${teamDomain}`) throw new AuthError("wrong issuer");
  if (typeof claims.exp !== "number" || claims.exp < now) throw new AuthError("expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new AuthError("not yet valid");
  if (!claims.email) throw new AuthError("no email");
  return claims.email.toLowerCase();
}
