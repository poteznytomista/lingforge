# Lexicon storage and interchange, versions 1–2

Status (2026-11-19): Implemented lexical contract. Linux automated checks and bounded native create/search/reload/delete and phoneme-link workflows pass; complete native transfer and Windows acceptance remain open. JSON v2 includes phonemes; v1 remains readable. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Domain identities

A **lexical entry** has a stable UUID, a lemma, optional free-form pronunciation and category, one or more senses, notes, and optional etymology. A **root** is a separate entry with `kind: "root"`; a lexical entry may reference one root. Roots cannot have root parents in this model. Other connections, including connections between roots, use named relationships.

Senses and forms receive separate UUIDs when saved. Their identifiers are scoped to their owning entry; they survive editing and reordering within that entry. A form is an owned text/label/pronunciation record, not another lemma. There is no prescribed grammatical taxonomy, morphology engine, or interpretation of relationship types. A relationship is directed and identifies a target by UUID and a free-text type. Cycles between distinct entries are allowed; self-links and duplicate target/type pairs are rejected.

Renaming or changing the visible spelling never changes identity. Incoming root and named relationships block deletion. Changing a root to a lexical entry is blocked while other entries use it as a root. Deleting an unreferenced entry removes its owned senses, forms, and outgoing links after confirmation and backup; it never deletes another entry.

## SQLite schemas 3–4

Migration `003_lexicon.sql` adds `lexemes` and `lexical_relations` to [project format 1](project-v1.md). Lexemes hold entry revision, timestamps, original content, owned senses/forms as strict typed JSON arrays, and derived search keys. Relationships have a compound source/target/type key. Foreign keys restrict incoming deletion and cascade only owned outgoing links. Root references are deferred so a batch can import entries before their roots; the whole graph is validated before the transaction.

Every lexical save checks the expected entry revision and active desktop session. A changed save, deletion, or import creates a snapshot first and then commits one immediate SQLite transaction. Project revision and update time advance with the transaction so metadata saves and prepared imports detect intervening changes. A no-op lexical save does not add a backup or revision. The current maximum is 20,000 entries per project and 256 MiB for the whole database.

Entry limits: 256 Unicode scalar values for lemma/form text, 512 for pronunciation, 120 for category/form label/relationship type, 10,000 for etymology, and 20,000 for entry notes. Provide 1–64 senses (4,000 scalar values each for definition and notes), at most 128 forms, and at most 128 relationships. Serialized entry data is additionally capped at 260 KiB in schema 4 (formerly 256 KiB); the extra 4 KiB accommodates new empty pronunciation-segment fields in legacy records at the old limit. Single-line fields reject control characters; multiline fields permit newline, carriage return, and tab. Browser `maxLength` counts UTF-16 code units and may be more restrictive for supplementary characters; Rust remains authoritative.

Opening a schema 3 project validates entry identities, field bounds, the relationship graph, child JSON, and derived keys. Changing the normalization algorithm or Unicode tables in a future dependency update requires an explicit index migration; do not silently reject old valid projects after upgrading that dependency.

## Search and list behavior

Original strings are preserved byte-for-byte. Search derives locale-independent Unicode lowercase followed by NFC; this is not full Unicode case folding or language-specific collation. Canonically equivalent composed/decomposed strings match. With the explicit **Ignore combining marks** option, NFD marks are stripped and the result is recomposed; distinct letters such as `θ` and `t` remain distinct. This option also removes phonetic combining marks.

Search is literal substring matching across lemma, pronunciation, category, etymology, notes, senses, forms, and literal pronunciation annotations. Linked phoneme display labels are resolved separately and are not part of lexical search keys. SQL wildcard characters `%`, `_`, and backslash are escaped. Category filtering matches the exact authored label. Kind filtering separates roots and lexical entries. Sorting supports normalized headword or update time, both directions, with ID as a stable tie-breaker. Responses contain 50 entries by default, at most 100. Reference pickers return up to 20 matches; incoming-reference detail returns the first 50 links and a total count.

Search currently scans bounded text columns; ordering and reference lookups use indexes. No performance claim is made. The ignored `benchmark_10000_entries` fixture must be measured before deciding whether full-text indexing or virtualization is warranted.

## Legacy JSON version 1

Current exports use **version 2** and additionally include entry/form `pronunciationSegments` and referenced `phonemes`. Version 2 details, limits, collision handling, and the complete phoneme shape are documented in [phonology-v1.md](phonology-v1.md). Version 1 imports cannot contain nonempty phoneme definitions or segment arrays. Unused inventory sounds and project-level phonology descriptions require a full project archive.

UTF-8 JSON uses this complete shape (illustrative data only):

```json
{
  "format": "lingforge-lexicon",
  "version": 1,
  "entries": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "revision": 0,
      "createdAt": 0,
      "updatedAt": 0,
      "data": {
        "lemma": "example",
        "pronunciation": "",
        "partOfSpeech": "",
        "kind": "lexeme",
        "rootId": null,
        "etymology": "",
        "notes": "",
        "senses": [
          {
            "id": "00000000-0000-4000-8000-000000000002",
            "definition": "An illustrative meaning",
            "notes": ""
          }
        ],
        "forms": [],
        "relations": []
      }
    }
  ]
}
```

A form is `{"id":"<UUID>","text":"<text>","label":"<label>","pronunciation":"<text>"}`. A relationship is `{"targetId":"<UUID>","relationType":"<label>"}`. All non-optional fields are required; additional fields are rejected, including inside child records. Saved sense/form IDs must be present. `rootId` may be omitted or null. Revisions are nonnegative JavaScript-safe integers; timestamps are nonnegative Unix milliseconds within JavaScript Date's range. Imported content is displayed as text, never executed markup.

JSON preserves the supported lexical fields, IDs, revisions, and timestamps when imported into an empty project. Relationship ordering is canonicalized by type/target; JSON whitespace and key order are not part of the format contract. Project metadata/assets are not part of a lexicon document; transfer those with a `.lingforge` archive.

## CSV interchange

CSV uses UTF-8, a header row, commas, double-quoted fields, and doubled quotes within quoted fields. Quoted multiline definitions and notes are supported. All rows must have the header's column count. Up to 64 columns are accepted, with headers limited to 256 scalar values. Map separate columns for lemma and definition; pronunciation, part of speech, and entry notes are optional. A source column cannot map to multiple fields. Unmapped columns are counted and explicitly reported before apply.

Export columns are `lemma,pronunciation,part_of_speech,definition,notes`. Export joins all definitions with newlines; combined definitions exceeding the 4,000-character single-sense limit require JSON instead. **CSV is a reduced text format**: it omits IDs, root/lexeme distinction, root references, forms, etymology, individual sense boundaries/notes, relationships, pronunciation segments, and phoneme definitions. Reimport creates new lexical entries with one sense. JSON is required for complete lexical transfer. CSV retains literal text; spreadsheet programs may interpret initial formula characters. No spreadsheet execution or formula evaluation occurs in LingForge.

## Preview, duplicates, and publication

Files are limited to 16 MiB and imports to 20,000 records; the resulting project must also fit its limits. Empty imports are rejected. Native Rust pickers supply paths. Parsing freezes the selected content in memory; editing or replacing the original file after preview does not change the approved import. CSV source samples show five rows with cells shortened to 160 characters; validated previews show at most ten entries. All entries are validated, not only displayed samples.

Duplicate keys are canonical lowercase lemma/category plus kind; accent marks remain significant. ID collisions also count. Default **Reject duplicates** stops the entire preview. **Keep both** inserts independent entries, remapping colliding entry IDs and references within the imported batch. Existing entries are never replaced. Duplicate IDs within the same source are always rejected because internal references would be ambiguous. References may target a valid existing entry or an entry in the batch; roots must target roots.

The prepared import has an opaque token tied to the session and project revision. Apply accepts that preview, creates a backup, and commits all rows and links atomically. A changed/reopened project requires a fresh preview. A successful import consumes the pending preparation. One pending source/preview is retained per workspace and cleared on replacement, project activation, close, or app exit.

Exports contain all saved entries regardless of active list filters. UI transitions require save/discard of the current draft first. Output is written to a temporary sibling, flushed, and published without replacing an existing destination. Export above 16 MiB is rejected; use the full project archive instead. UTF-8 CSV/JSON are portable across Linux and Windows, but actual platform round trips are still unverified.

## Schema 6 references

Documents can link unit ranges to entries, and grammar sections/morphology records can reference entries. These additional references restrict deletion without changing lexical revisions or spellings. A rejected deletion names a blocking document or section. Lexicon-only JSON/CSV exports retain their existing scope; full project archives preserve the notebook and its links. See [notebook-v1.md](notebook-v1.md).

## Schema 8 automation references

Active irregular overrides and generated batch source rows reference stable lexical entry IDs and block entry deletion until removed/reverted. Renaming or editing an entry does not rewrite historical batch inputs. Generated forms are kept separately from authored `forms`; applying/reverting automation never modifies this entry JSON or its pronunciation projections. Conflicts with authored form labels/output are reported before Apply. Lexicon JSON/CSV remain scoped to authored lexical data; complete automation and provenance require a full project archive. See [automation-v1.md](automation-v1.md).
