# Phonology model and schema 4

Status: part 4 authored on 2026-11-04 and statically reviewed on 2026-11-05. Linux automated tests and native creation/link/rename/deletion checks passed on 2026-11-17–18; full native input and Windows acceptance remain pending. Linux and Windows remain the targets. No new application system programs or libraries were added.

## Sounds and descriptions

A phoneme has a canonical UUID, independent revision, timestamps, display label, kind (`consonant`, `vowel`, or `other`), articulatory descriptions, custom features, allophone descriptions, and notes. Labels accept Unicode and combining sequences; they are never entity identifiers. Labels need not be unique and are not automatically classified or validated as official IPA. The UI shows a shortened ID in pronunciation selectors to help distinguish identical labels.

Articulatory fields are optional free text: `place`, `manner`, `voicing`, `height`, `backness`, and `rounding`. Changing kind preserves all authored fields. Consonant and vowel inventory views show their relevant columns; the other-sounds view accommodates additional categories. Tables contain authored records only, with no preloaded language or invented inventory. Search uses NFC Unicode lowercase over labels, articulatory fields, and notes. The UI pages the filtered inventory in groups of 50; the API returns at most 1,000 summaries. Search/ordering are not locale-specific phonological collation.

Custom features are name/value pairs. Allophone descriptions have stable IDs scoped to their phoneme, a label, a free-text environment, and notes. The project also has one revisioned phonology profile with general notes, ordered syllable patterns, and phonotactic descriptions. Each syllable pattern has an ID, label, onset/nucleus/coda descriptions, and notes. Each phonotactic description has an ID, label, and description.

These records document the user's analysis. Environment strings, syllable slots, and constraints are not interpreted, do not generate forms, and do not enforce sound changes. Textual mentions of a sound in notes are not tracked references. Automation remains in later roadmap parts.

## Linked pronunciations

Lexical entries **and individual forms** have an optional ordered `pronunciationSegments` array. The original free-form `pronunciation` field remains independent and is never overwritten by linking or renaming sounds. Missing segment arrays in older files decode as empty.

Each segment is exactly one of:

```json
{
  "kind": "phoneme",
  "phonemeId": "00000000-0000-4000-8000-000000000001",
  "annotation": "ː"
}
```

```json
{ "kind": "text", "text": "ˈ" }
```

The preview concatenates each linked phoneme's current label followed by its annotation, or a literal segment's text. It inserts no spaces or delimiters automatically. Literal spaces can represent boundaries; an empty literal is rejected. Literal annotations and original strings are preserved, including combining marks. Segments can be added, removed, and reordered explicitly; they are not inferred from the free-form pronunciation.

Changing a phoneme label preserves the phoneme ID and every segment reference, without changing the referencing lexical revisions or free text. The editor obtains current labels from the inventory. Lexicon text search includes literal segment text and annotations, but not resolved phoneme labels; renaming a phoneme therefore does not rewrite lexical search keys.

Reverse references group by entry/form pronunciation and report occurrence counts. The inspector shows up to 50 such references plus a total count; links open the corresponding lexical editor. Deletion is blocked while any pronunciation references the phoneme. Users must explicitly remove or replace its segments, or delete the referencing entry/form, before deleting the sound. Schema 5 also projects writing-system character associations: these independently block deletion and appear in the inspector (up to 50 plus a total). Remove those links in Writing systems before deleting a referenced sound. Schema 6 grammar references also block deletion; a rejected deletion identifies a blocking section. Remove its phonological reference in Grammar first. Deleting an unreferenced phoneme removes only its own allophone descriptions and features.

## Storage and migration

Project container/manifest format remains 1. SQLite schema **4** adds:

- `phonemes`: stable IDs, revisions, timestamps, and strictly typed JSON data.
- `phonology_profile`: a singleton revision and strictly typed description JSON.
- `lexemes.pronunciation_json`: ordered entry segments, defaulting to `[]`. Form segments are stored in their owned form JSON records.
- `phoneme_references`: a derived, indexed projection of linked segments, keyed by entry ID, form ID (empty for the main entry), and sequence position. It has foreign keys to the entry and phoneme, cascades only when the owning entry is deleted, and restricts phoneme deletion.

The existing source JSON is authoritative; the reference projection is replaced in the same transaction as its lexical entry. Project opening validates every linked ID and compares the complete expected reference set with the stored projection. A mismatch is rejected, not silently repaired. It also validates phoneme/profile field limits, IDs, child identities, revisions, and timestamps.

Schema 1 → 2 → 3 → 4 migration steps run in one transaction after a migration snapshot. Schema 3 lexical rows are read without requiring the new column during pre-migration inspection. Existing spellings, free pronunciation text, IDs, and search keys are preserved; the new inventory/profile start empty. No guess is made about which legacy pronunciation characters are phonemes. Old clients reject schema 4 instead of deleting unknown content.

Phoneme/profile writes check their expected revisions and desktop session. All changed saves and deletions snapshot first, then commit an immediate transaction that also advances the project revision. No-op saves do not create another revision or backup. Normal navigation and native close use the same save/discard protection as lexical editing. Recovery remains recover-as-copy, using full project archives.

## Lexicon JSON version 2

The lexical importer accepts versions 1 and 2. The exporter now writes `format: "lingforge-lexicon"`, `version: 2`, `entries`, and `phonemes`. Entry and form records include `pronunciationSegments`. Version 1 cannot contain nonempty segment arrays or phoneme definitions.

`phonemes` contains each referenced phoneme once, with its complete saved shape:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "revision": 0,
  "createdAt": 0,
  "updatedAt": 0,
  "data": {
    "label": "θ",
    "kind": "consonant",
    "articulation": {
      "place": "",
      "manner": "",
      "voicing": "",
      "height": "",
      "backness": "",
      "rounding": ""
    },
    "features": [],
    "allophones": [],
    "notes": ""
  }
}
```

This is a format example, not seeded project data. Custom features are `{"name":"<name>","value":"<value>"}`; allophones are `{"id":"<UUID>","label":"<label>","environment":"<description>","notes":"<notes>"}`. Unknown fields/variants are rejected. An imported document may omit `phonemes` when no definitions are needed; all linked IDs must resolve to supplied or existing definitions.

Lexicon export includes referenced phonemes only. Unused inventory sounds and the project-level syllable/phonotactic profile require a full `.lingforge` archive. Preview explicitly reports included phoneme definitions. Default duplicate handling rejects colliding phoneme IDs. **Keep both** creates separate phonemes, remaps their IDs, and updates all entry/form segments in the imported batch. Equal labels do not establish identity or trigger implicit merging. Duplicate IDs within one input are always rejected.

Phoneme definitions, lexical records, relationships, and reference projections commit together in the existing prepared-import transaction. Any failure rolls back the batch. The preview remains bound to session/project revision, including changes to the inventory or profile. Existing records are never overwritten.

CSV continues to carry only its five documented text fields. It omits segment sequences and phoneme definitions and does not flatten live labels into free-form text. This loss is disclosed in the transfer dialog. JSON files remain bounded to 16 MiB and the project limits apply to the combined import.

## Limits and verification

- At most 1,000 phonemes per project; at most 128 KiB serialized data per phoneme.
- Labels: 64 Unicode scalar values; articulatory fields/custom feature names: 80; custom feature values: 256; phoneme notes: 10,000.
- At most 32 custom features and 64 allophones per phoneme. Allophone label/environment/notes limits: 128/2,000/4,000 scalar values. Allophone IDs are required in saved data.
- At most 256 segments per entry or form pronunciation. An annotation/literal is at most 256 scalar values. Total lexical data is capped at 260 KiB per entry, including all forms and segments. The 4 KiB increase from schema 3 accommodates the new empty segment-array fields in legacy entries already at the old 256 KiB limit.
- Profile: 256 KiB serialized data; notes 20,000 scalar values; at most 128 patterns and 128 constraints. Labels are at most 120, syllable slots 256, pattern notes and constraint descriptions 4,000. Saved child IDs must be canonical and distinct within their owner.

Linux automated migration/persistence checks and native linked-pronunciation identity checks have passed. Exact IPA/combining strings reached native fields through WebDriver, but complete font coverage, input methods, grapheme editing and Linux/Windows transfer still require separate evidence. See [VALIDATION.md](../VALIDATION.md); test sources alone do not establish passed tests.
