# Experimental documents, grammar and schema 6

Status (2026-11-19): Experimental document/grammar contract. Linux automated checks pass; full native notebook workflows, the Part 5 production editor gate and Windows acceptance remain open. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Records and identities

Documents and grammar sections share a bounded repository, `notebook_records(id, revision, kind, data_json)`. Every record has a canonical UUID, expected revision and typed `NotebookDraft` JSON. Its discriminated shape is `{"kind":"document","content":{...}}` or `{"kind":"grammar","content":{...}}`. The SQL kind must equal the JSON kind. A record cannot change kind. Names, spellings, glyphs and PUA values never establish identity. Rust assigns new record and child UUIDs; imported identities are validated and preserved.

A document contains `title`, `notes` and ordered `paragraphs`. Each paragraph has an `id`, nullable `scriptId`, ordered `units`, and ordered `links`. Units are the same stable symbol references or literal graphemes defined in [writing-v1.md](writing-v1.md). Without a script, all units must be literal Unicode. With a script, every symbol resolves inside that script. Paragraph IDs survive reordering and text conversion. Glyph replacement, character renaming and lexical renaming do not rewrite documents.

Lexical links are optional half-open unit ranges: `start` is inclusive, `end` exclusive. They reference a lexical entry by `entryId`, without copying its spelling or requiring every word to be analyzed. Links must be sorted, nonempty, nonoverlapping and inside their paragraph. They do not cross paragraphs.

```json
{
  "id": "00000000-0000-4000-8000-000000000002",
  "scriptId": null,
  "units": [
    { "kind": "text", "text": "ã" },
    { "kind": "text", "text": " " }
  ],
  "links": [
    { "start": 0, "end": 1, "entryId": "00000000-0000-4000-8000-000000000003" }
  ]
}
```

This illustrates the format; it is not seeded project data. The referenced entry must exist.

## Editing and history

Rust applies explicit range replacements. Links entirely before an edit stay unchanged; links entirely after it shift by the unit-length difference. An insertion at a link's start shifts the link; an insertion at its end leaves it unchanged. The inserted text is outside the link in both cases. Insertion inside a link, or replacement intersecting it, removes that annotation. A no-op insertion changes nothing. The UI explains this behavior, shows intersected selection links, and reports removed links after the edit. Undo restores the entire record, including annotations. Linking a selection explicitly replaces overlapping annotations.

The document editor has per-paragraph logical selection, arrows/Shift, Home/End, deletion, a character palette and staged native text input. Input is committed as a complete mapping result or retained with an error. Uncommitted input and composition participate in the common save/discard/close guard. Paragraph switching, history restoration and conversion require pending input to be inserted or cleared. Paragraph removal has an explicit confirmation. Paragraph addition/reordering and all grammar edits remain unsaved until Save/Ctrl+S succeeds.

Record undo/redo retains up to 30 full drafts per direction, each stack additionally bounded by 16 MiB of estimated serialized UTF-16 size. It includes paragraph IDs, spans, grammar features and examples. It does not include staged textarea input or persist across switching records, discarding, reopening or process termination. Saving retains this in-memory history. Native text fields keep their native typing history; structured-view Ctrl+Z/Y uses record history. Undo of a saved edit creates an unsaved draft, not an automatic database rollback. Persistent recovery is through existing project snapshots and **Recover copy**, never overwrite-in-place.

`LINGFORGE-PARAGRAPH/1` plus newline and JSON encodes `projectId`, nullable `scriptId`, and `units` for structured clipboard operations. The receiver checks project/script equality, a 2 MiB string bound, unit shape and Rust validation before insertion. Lexical annotations are deliberately omitted, as disclosed in the editor. Paste ordinary external text into Input. HTML clipboard data is ignored. This is separate from Part 5's script-sample clipboard format.

Known editor limits remain: logical LTR order, no drag selection or cross-paragraph selection, no visual-line cursor navigation, no rich formatting or complex shaping, separate grapheme units across separate insertions, SVG-only custom characters, session-local history. Paragraphs can be added, removed and reordered; automatic split/merge and layout pagination are not implemented. These limitations require native feasibility review before a production editor is chosen.

## Transliteration and orthography conversion

Document transliteration resolves each custom symbol through its saved character's current transliteration. Literal graphemes remain unchanged. Paragraphs join with two LF characters. Any missing mapping suppresses the entire output and reports paragraph/unit issues; incomplete output cannot appear as a successful export.

Orthography conversion is explicit and paragraph-scoped. The source and target are saved writing systems in the project. Default candidates have exactly the source character's nonempty transliteration, case-sensitive and without normalization. Zero candidates is missing; more than one is ambiguous. Equal visible names never choose a candidate. Users can override each source character with 1–16 ordered target character IDs. This supports expansions and multiple source characters sharing a target, but does not infer sequence contractions or execute sound changes.

Literal units survive conversion unchanged. A complete unit-boundary map adjusts each lexical range when an output expands. The paragraph identity and entry identities remain. Any unresolved mapping or output beyond the paragraph bound yields issues and no converted paragraph. Preview shows the target glyphs; a separate Apply changes the draft. Edits or changed mapping choices invalidate the displayed preview. Application is undoable and still requires a save.

## Descriptive grammar

A grammar section has `title`, `notes`, `features`, `examples`, `lexemeIds`, `phonemeIds`, and `morphology`:

- Feature: `id`, required `name`, free `values`, `description`.
- Example: `id`, required `text`, `gloss`, `translation`. These are literal Unicode descriptions, not executable analyses or custom-symbol documents.
- Section lexical/phonological references: distinct stable IDs. They apply to the section and its examples. Textual mentions do not create tracked links.
- Morphology record: `id`, `kind` (`inflection`, `derivation`, `irregular`), required `label`, `description`, nullable `entryId`, `form`. Irregular records require an existing lexical entry and a nonempty authored form. Other kinds can optionally link an entry or record a form.

Feature names and values are language-defined. Glosses and morphological descriptions are not interpreted. Irregular records document observations without changing dictionary forms. Paradigm generation, rule evaluation, provenance and sound changes remain Part 9. Section titles are sorted using the existing normalized search key; the UI filters titles and allows independent section management. Hierarchical sections and general grammar automation are not claimed.

## Transactions, projection and migration

Schema 6 adds the record table and four derived projections:

| Table                 | Key                               | Target restriction                                                                           |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `notebook_lexemes`    | owner ID, target ID               | Existing lexical entry; restrict deletion                                                    |
| `notebook_phonemes`   | owner ID, target ID               | Existing phoneme; restrict deletion                                                          |
| `notebook_scripts`    | owner ID, target ID               | Existing writing system, including literal-only paragraphs assigned to it; restrict deletion |
| `notebook_characters` | owner ID, script ID, character ID | Existing script by FK; character existence checked against typed source JSON                 |

Source JSON is authoritative. A changed save takes an automatic project snapshot, then writes the record, replaces every projection and advances project revision in one immediate transaction. Expected record revision and current desktop session are mandatory. No-op saves keep revisions and create no backup. Deleting a record removes only its owned content and projection rows, after confirmation and a backup. It does not remove referenced linguistic records.

Entry, phoneme and writing-system deletion now checks incoming notebook references, with a user-safe error naming a blocking document or section. Character removal from a script is rejected while any saved document uses it. These checks are additional to earlier lexical/pronunciation/script restrictions. Opening projects validates every record, all reference targets, all character identities, SQL/JSON kinds, bounds and exact projection sets. Mismatches are rejected, never repaired silently.

Migration 5 → 6 creates empty tables. Earlier supported steps remain in the same migration transaction, after a snapshot of an existing project. Manifest/archive version stays 1. SQLite backup archives include documents, grammar, linked data, outlines and assets; no active database file is copied directly. Older clients reject the new schema. Recover-as-copy changes project identity while retaining internal linguistic and document IDs.

## Interchange contract

Structured exports are compact UTF-8 JSON with `format: "lingforge-notebook"`, `version: 1`, `projectId`, and the entire saved `record` (`id`, `revision`, `data`). They are lossless for that record and its reference IDs. They **do not embed dependency definitions**. The same project's dependencies must still exist when importing. Use a full `.lingforge` archive for standalone portability and transfer between Linux and Windows.

**Review structured file** uses a Rust native picker, bounded regular-file read, strict unknown-field rejection and identity/graph validation. It checks project identity and produces an in-memory candidate plus the current saved record, if present. No write occurs on selection. The UI discloses whether Save will replace that record or create a missing record with its original identity. Saving uses the current expected revision, revalidates references, snapshots and commits transactionally. File bytes are not reread during save. The imported content's historical revision is metadata for review; an existing target advances its current revision and a newly restored target starts at revision 0. Record and child identities and content survive; import is not a revision-history merge. Foreign-project files are rejected; no name-based merging or implicit ID remapping occurs.

Literal plain-text export rejects any custom symbol. Transliteration export rejects missing mappings. Both export paragraph text only and omit title, notes, annotations, stable identities, glyphs and paragraph IDs. Two newlines separate paragraphs, so this reduced format cannot distinguish an authored blank line from a paragraph boundary. The dialog discloses this loss before selecting a destination. Grammar sections use structured export only. All exports use synced temporary files in the destination directory and no-clobber publication. Cancelled pickers report no success. Unsaved drafts must be saved before export is available.

## Bounds

- At most 512 document and grammar records combined; each draft at most 4 MiB serialized JSON. Structured file bound is 4 MiB plus 4 KiB for its envelope.
- Titles: 160 Unicode scalars. Document notes: 20,000; grammar notes: 40,000.
- Documents: 1–128 paragraphs, 4,096 units per paragraph, 65,536 units in total, 256 lexical spans per paragraph.
- Grammar: 64 features, 128 examples, 128 morphology records; at most 256 distinct lexical IDs and 256 distinct phoneme IDs per section.
- Feature name/morphology label: 120 scalars; feature values/form: 2,000; feature/morphology descriptions and example/gloss/translation: 4,000.
- Child IDs are distinct within a document or grammar section. No field can contain unsupported control characters. All earlier project, writing and archive bounds continue to apply.

See the [current results](../GUIDE.md#verified-results) for automated evidence and the outstanding native/portability acceptance.
