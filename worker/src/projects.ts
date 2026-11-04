/** Owner-scoped project storage on D1. Stores inputs only; no calculations (CLAUDE.md stack: worker). */

export interface ProjectRow { id: string; name: string; inputs: unknown; created_at: string; updated_at: string }
export interface ProjectSummary { id: string; name: string; updated_at: string }

const MAX_NAME = 120;
export const MAX_INPUTS_BYTES = 256 * 1024;

export class BadRequest extends Error {}

export function validateBody(body: unknown): { name: string; inputs: string } {
  if (typeof body !== "object" || body === null) throw new BadRequest("body must be an object");
  const { name, inputs } = body as { name?: unknown; inputs?: unknown };
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_NAME) throw new BadRequest("invalid name");
  if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) throw new BadRequest("inputs must be an object");
  const json = JSON.stringify(inputs);
  if (json.length > MAX_INPUTS_BYTES) throw new BadRequest("inputs too large");
  return { name: name.trim(), inputs: json };
}

const parse = (r: { id: string; name: string; inputs: string; created_at: string; updated_at: string }): ProjectRow =>
  ({ ...r, inputs: JSON.parse(r.inputs) as unknown });

export async function listProjects(db: D1Database, owner: string): Promise<ProjectSummary[]> {
  const { results } = await db.prepare("SELECT id, name, updated_at FROM projects WHERE owner = ? ORDER BY updated_at DESC")
    .bind(owner).all<ProjectSummary>();
  return results;
}

export async function getProject(db: D1Database, owner: string, id: string): Promise<ProjectRow | null> {
  const r = await db.prepare("SELECT id, name, inputs, created_at, updated_at FROM projects WHERE id = ? AND owner = ?")
    .bind(id, owner).first<{ id: string; name: string; inputs: string; created_at: string; updated_at: string }>();
  return r ? parse(r) : null;
}

export async function createProject(db: D1Database, owner: string, name: string, inputs: string): Promise<ProjectRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO projects (id, owner, name, inputs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, owner, name, inputs, now, now).run();
  return { id, name, inputs: JSON.parse(inputs) as unknown, created_at: now, updated_at: now };
}

export async function updateProject(db: D1Database, owner: string, id: string, name: string, inputs: string): Promise<ProjectRow | null> {
  const now = new Date().toISOString();
  const res = await db.prepare("UPDATE projects SET name = ?, inputs = ?, updated_at = ? WHERE id = ? AND owner = ?")
    .bind(name, inputs, now, id, owner).run();
  return res.meta.changes ? getProject(db, owner, id) : null;
}

export async function deleteProject(db: D1Database, owner: string, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM projects WHERE id = ? AND owner = ?").bind(id, owner).run();
  return res.meta.changes > 0;
}
