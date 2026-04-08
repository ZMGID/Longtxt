export const baseMigrations = `
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_mode TEXT NOT NULL DEFAULT 'mock',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'detail',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS block_tags (
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY (block_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_block_tags_block_id ON block_tags (block_id);
CREATE INDEX IF NOT EXISTS idx_block_tags_tag_id ON block_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blocks (created_at);

CREATE TABLE IF NOT EXISTS pending_block_vectors (
  block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE,
  content_updated_at TEXT NOT NULL,
  queued_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_block_vectors_queued_at ON pending_block_vectors (queued_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  file_url TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS block_attachments (
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  PRIMARY KEY (block_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_attachments_file_url ON attachments (file_url);
CREATE INDEX IF NOT EXISTS idx_block_attachments_block_id ON block_attachments (block_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_block_attachments_attachment_id ON block_attachments (attachment_id);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  block_ids TEXT NOT NULL,
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots (created_at);

CREATE TABLE IF NOT EXISTS ai_insight_history (
  id TEXT PRIMARY KEY,
  method_id TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  block_ids TEXT NOT NULL,
  mode TEXT NOT NULL,
  empty INTEGER NOT NULL DEFAULT 0 CHECK (empty IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_history_method_created_at ON ai_insight_history (method_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insight_history_created_at ON ai_insight_history (created_at DESC);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  date TEXT NOT NULL,
  start_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planned',
  source TEXT NOT NULL DEFAULT 'manual',
  linked_block_id TEXT REFERENCES blocks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_date ON calendar_entries (date, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_linked_block_id ON calendar_entries (linked_block_id);

CREATE TABLE IF NOT EXISTS calendar_suggestions (
  id TEXT PRIMARY KEY,
  source_block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  date TEXT NOT NULL,
  start_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0,
  evidence_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_suggestions_date ON calendar_suggestions (date, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_suggestions_source_block_id ON calendar_suggestions (source_block_id);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notebook_blocks (
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (notebook_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at ON notebooks (updated_at);
CREATE INDEX IF NOT EXISTS idx_notebook_blocks_notebook_id ON notebook_blocks (notebook_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notebook_blocks_block_id ON notebook_blocks (block_id);

CREATE TABLE IF NOT EXISTS notebook_items (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('block', 'heading', 'divider', 'note', 'todo')),
  block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
  content TEXT,
  checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notebook_reference_reviews (
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  excluded INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (notebook_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_items_notebook_id ON notebook_items (notebook_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notebook_items_block_id ON notebook_items (block_id);
CREATE INDEX IF NOT EXISTS idx_notebook_reference_reviews_notebook_id ON notebook_reference_reviews (notebook_id);

CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
  content,
  content='blocks',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO blocks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE OF content ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO blocks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TABLE IF NOT EXISTS failed_block_vectors (
  block_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  error_message TEXT,
  failed_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);
`
