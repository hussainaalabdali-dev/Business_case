-- Projects saved by each signed-in user (owner = Cloudflare Access email). No calculations are stored.
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  name       TEXT NOT NULL,
  inputs     TEXT NOT NULL,          -- JSON of EngineInputs
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_projects_owner ON projects (owner, updated_at DESC);
