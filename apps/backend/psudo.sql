-- 1.  Who owns what
CREATE TABLE profiles (
  -- connected to better-auth
);

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT    NOT NULL REFERENCES profiles(id),
  name         TEXT    NOT NULL,
  github       JSONB,
  settings     JSONB,
  sandbox_id   TEXT, 
  sandbox_metadata JSONB,
  -- metadata for the project
  metadata JSONB,
  -- metadata for the project
  created_at   TIMESTAMP DEFAULT now()
);

-- 2.  One row per Claude session
CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id),
  title             TEXT,
  status            TEXT DEFAULT 'active',
  metadata JSONB, 
  -- linear log identical to the .jsonl transcript
  messages          JSONB NOT NULL,
  -- convenience fields for dashboards
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);

-- 3.  Fast list of commits (optional but recommended)
CREATE TABLE commits (
  sha            TEXT PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  project_id     UUID NOT NULL REFERENCES projects(id),
  message        TEXT,
  metadata       JSONB,        -- {files,additions,deletions}
  created_at     TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_commits_proj ON commits(project_id, created_at DESC);

-- -- 4.  Deployments / preview URLs
-- CREATE TABLE deployments (
--   id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   project_id   UUID NOT NULL REFERENCES projects(id),
--   commit_sha   TEXT NOT NULL REFERENCES commits(sha),
--   url          TEXT NOT NULL,
--   status       TEXT DEFAULT 'pending',
--   created_at   TIMESTAMP DEFAULT now()
-- );
