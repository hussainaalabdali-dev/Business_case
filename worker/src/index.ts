/**
 * Worker: serves the static site (assets) and /api/* for saving and loading projects.
 * No calculations here (CLAUDE.md rule 7). No request bodies are logged (rule 5).
 */

import { AuthError, fetchJwks, verifyAccessJwt } from "./auth";
import type { JwksFetcher } from "./auth";
import { BadRequest, createProject, deleteProject, getProject, listProjects, updateProject, validateBody } from "./projects";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Local development only: honoured just for requests to localhost (wrangler dev). */
  DEV_AUTH_EMAIL?: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const err = (status: number, code: string): Response => json({ error: code }, status);

async function identify(req: Request, env: Env, getKeys: JwksFetcher): Promise<string | Response> {
  const host = new URL(req.url).hostname;
  if (env.DEV_AUTH_EMAIL && (host === "localhost" || host === "127.0.0.1")) return env.DEV_AUTH_EMAIL.toLowerCase();
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return err(503, "access_not_configured");
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) return err(403, "forbidden");
  try {
    return await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }, getKeys);
  } catch (e) {
    if (e instanceof AuthError) return err(403, "forbidden");
    throw e;
  }
}

async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequest("invalid json");
  }
}

export async function handleApi(req: Request, env: Env, getKeys: JwksFetcher = fetchJwks): Promise<Response> {
  const who = await identify(req, env, getKeys);
  if (who instanceof Response) return who;
  const owner = who;
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const m = /^\/api\/projects(?:\/([0-9a-f-]{36}))?(\/copy)?$/.exec(path);

  try {
    if (path === "/api/me" && req.method === "GET") return json({ email: owner });
    if (!m) return err(404, "not_found");
    const [, id, copy] = m;

    if (!id) {
      if (req.method === "GET") return json(await listProjects(env.DB, owner));
      if (req.method === "POST") {
        const { name, inputs } = validateBody(await readBody(req));
        return json(await createProject(env.DB, owner, name, inputs), 201);
      }
      return err(405, "method_not_allowed");
    }
    if (copy) {
      if (req.method !== "POST") return err(405, "method_not_allowed");
      const src = await getProject(env.DB, owner, id);
      if (!src) return err(404, "not_found");
      return json(await createProject(env.DB, owner, `${src.name} (نسخة)`, JSON.stringify(src.inputs)), 201);
    }
    if (req.method === "GET") {
      const p = await getProject(env.DB, owner, id);
      return p ? json(p) : err(404, "not_found");
    }
    if (req.method === "PUT") {
      const { name, inputs } = validateBody(await readBody(req));
      const p = await updateProject(env.DB, owner, id, name, inputs);
      return p ? json(p) : err(404, "not_found");
    }
    if (req.method === "DELETE") return (await deleteProject(env.DB, owner, id)) ? new Response(null, { status: 204 }) : err(404, "not_found");
    return err(405, "method_not_allowed");
  } catch (e) {
    if (e instanceof BadRequest) return err(400, e.message);
    throw e;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) return handleApi(req, env);
    return env.ASSETS ? env.ASSETS.fetch(req) : err(404, "not_found");
  },
} satisfies ExportedHandler<Env>;
