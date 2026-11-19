CREATE TABLE lexemes (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    lemma TEXT NOT NULL,
    pronunciation TEXT NOT NULL,
    part_of_speech TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('lexeme', 'root')),
    root_id TEXT REFERENCES lexemes(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    etymology TEXT NOT NULL,
    notes TEXT NOT NULL,
    senses_json TEXT NOT NULL,
    forms_json TEXT NOT NULL,
    search_key TEXT NOT NULL,
    search_fold TEXT NOT NULL,
    lemma_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(kind <> 'root' OR root_id IS NULL),
    CHECK(root_id IS NULL OR root_id <> id)
) STRICT;
CREATE TABLE lexical_relations (
    source_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE RESTRICT,
    relation_type TEXT NOT NULL,
    PRIMARY KEY(source_id, target_id, relation_type),
    CHECK(source_id <> target_id)
) STRICT;
CREATE INDEX lexemes_order ON lexemes(lemma_key, id);
CREATE INDEX lexemes_category ON lexemes(part_of_speech, kind, lemma_key, id);
CREATE INDEX lexemes_root ON lexemes(root_id);
CREATE INDEX lexical_relations_target ON lexical_relations(target_id);
PRAGMA user_version=3;
