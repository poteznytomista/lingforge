CREATE TABLE notebook_records (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0),
  kind TEXT NOT NULL CHECK(kind IN ('document','grammar')), data_json TEXT NOT NULL
) STRICT;
CREATE TABLE notebook_lexemes (
  owner_id TEXT NOT NULL REFERENCES notebook_records(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE RESTRICT,
  PRIMARY KEY(owner_id,target_id)
) STRICT;
CREATE INDEX notebook_lexemes_target ON notebook_lexemes(target_id);
CREATE TABLE notebook_phonemes (
  owner_id TEXT NOT NULL REFERENCES notebook_records(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES phonemes(id) ON DELETE RESTRICT,
  PRIMARY KEY(owner_id,target_id)
) STRICT;
CREATE INDEX notebook_phonemes_target ON notebook_phonemes(target_id);
CREATE TABLE notebook_scripts (
  owner_id TEXT NOT NULL REFERENCES notebook_records(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES writing_systems(id) ON DELETE RESTRICT,
  PRIMARY KEY(owner_id,target_id)
) STRICT;
CREATE INDEX notebook_scripts_target ON notebook_scripts(target_id);
CREATE TABLE notebook_characters (
  owner_id TEXT NOT NULL REFERENCES notebook_records(id) ON DELETE CASCADE,
  script_id TEXT NOT NULL REFERENCES writing_systems(id) ON DELETE RESTRICT,
  character_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,script_id,character_id)
) STRICT;
CREATE INDEX notebook_characters_target ON notebook_characters(script_id,character_id);
PRAGMA user_version=6;
