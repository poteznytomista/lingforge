CREATE TABLE phonemes (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE phonology_profile (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    data_json TEXT NOT NULL
) STRICT;
INSERT INTO phonology_profile VALUES (1, 0, '{"notes":"","patterns":[],"rules":[]}');
ALTER TABLE lexemes ADD COLUMN pronunciation_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE phoneme_references (
    entry_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
    form_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position >= 0 AND position < 256),
    phoneme_id TEXT NOT NULL REFERENCES phonemes(id) ON DELETE RESTRICT,
    PRIMARY KEY(entry_id, form_id, position)
) STRICT;
CREATE INDEX phoneme_references_target ON phoneme_references(phoneme_id, entry_id);
PRAGMA user_version=4;
