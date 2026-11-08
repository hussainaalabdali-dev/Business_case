/** Minimal D1 stand-in on node:sqlite, enough for the queries in src/projects.ts. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(import.meta.dirname, "..", "migrations", "0001_projects.sql"), "utf8"));
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => { args = a; return stmt; },
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
      run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { meta: { changes: Number(r.changes) } }; },
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}
