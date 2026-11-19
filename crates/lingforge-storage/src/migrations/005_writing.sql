CREATE TABLE writing_systems (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    data_json TEXT NOT NULL
) STRICT;
CREATE TABLE script_phoneme_references (
    script_id TEXT NOT NULL REFERENCES writing_systems(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL,
    phoneme_id TEXT NOT NULL REFERENCES phonemes(id) ON DELETE RESTRICT,
    PRIMARY KEY(script_id, character_id, phoneme_id)
) STRICT;
CREATE INDEX script_phonemes_target ON script_phoneme_references(phoneme_id);
PRAGMA user_version=5;
