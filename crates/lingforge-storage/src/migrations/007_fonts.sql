CREATE TABLE font_profiles (
  script_id TEXT PRIMARY KEY REFERENCES writing_systems(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  data_json TEXT NOT NULL CHECK(length(data_json) <= 1048576)
) STRICT;
PRAGMA user_version=7;
