CREATE TABLE automation_programs (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision>=0),
  data_json TEXT NOT NULL CHECK(length(data_json)<=1048576)
) STRICT;
CREATE TABLE automation_batches (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES automation_programs(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  data_json TEXT NOT NULL CHECK(length(data_json)<=2097152)
) STRICT;
CREATE TABLE automation_overrides (
  program_id TEXT NOT NULL REFERENCES automation_programs(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE RESTRICT,
  PRIMARY KEY(program_id,entry_id)
) STRICT;
CREATE TABLE automation_cells (
  program_id TEXT NOT NULL REFERENCES automation_programs(id) ON DELETE RESTRICT,
  entry_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE RESTRICT,
  cell_id TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES automation_batches(id) ON DELETE CASCADE,
  PRIMARY KEY(program_id,entry_id,cell_id)
) STRICT;
CREATE INDEX automation_cells_batch ON automation_cells(batch_id);
PRAGMA user_version=8;
