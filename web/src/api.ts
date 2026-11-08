/** Save/load only. The Worker never calculates (rule 7). */
import type { EngineInputs } from "../../engine-ts/src";

export interface Summary { id: string; name: string; updated_at: string }
export interface Project extends Summary { inputs: EngineInputs }
export class ApiError extends Error { constructor(public status: number) { super(`api ${status}`); } }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) throw new ApiError(res.status);
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  me: () => call<{ email: string }>("GET", "/api/me"),
  list: () => call<Summary[]>("GET", "/api/projects"),
  get: (id: string) => call<Project>("GET", `/api/projects/${id}`),
  create: (name: string, inputs: EngineInputs) => call<Project>("POST", "/api/projects", { name, inputs }),
  update: (id: string, name: string, inputs: EngineInputs) => call<Project>("PUT", `/api/projects/${id}`, { name, inputs }),
  copy: (id: string) => call<Project>("POST", `/api/projects/${id}/copy`),
  remove: (id: string) => call<null>("DELETE", `/api/projects/${id}`),
};
