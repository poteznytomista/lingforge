# Writing-system experiment and schema 5

Status (2026-11-19): Experimental writing-system contract. Linux automated checks and bounded native mapping/selection/clipboard/persistence checks pass; real IME, framework comparison and Windows acceptance remain open. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Domain data

A writing system is an independently revisioned UUID record containing a name, notes, characters, input mappings and one sample text. The SQLite column stores `ScriptDraft` JSON; the record's ID and revision are separate columns. All objects reject unknown fields.

Characters have their own UUIDs, names, optional plain transliteration, zero or more phoneme IDs, and zero or more glyph variants. Each variant has a UUID, name and typed outline. A nullable default glyph ID selects a variant belonging to that character. Missing glyphs render an explicit name fallback. Renaming, changing transliteration, switching variants or replacing a variant's outline never rewrites character references in text.

Input mappings have UUIDs, a non-whitespace key sequence, and an ordered list of character IDs. An input can produce multiple characters; several inputs can target the same character. Equal inputs with different outputs are permitted in definitions but block ambiguous insertion. Definitions are case-sensitive and preserve Unicode bytes. Deleting a character is blocked while sample text or an input mapping references it. Remove or replace those references explicitly first. Schema 6 also blocks removing characters used by saved documents and deleting scripts assigned to document paragraphs; see [notebook-v1.md](notebook-v1.md).

Children have distinct IDs within the writing-system owner. Rust assigns both saved script IDs and provisional child IDs through the checked session boundary. Rust checks child syntax and uniqueness again before committing; UUID generation does not depend on browser secure-context support. No child is identified by its visible name, SVG path, font glyph index, or PUA code point.

## Sample text

The ordered `sample` array uses exactly these unit variants:

```json
[
  { "kind": "symbol", "characterId": "00000000-0000-4000-8000-000000000001" },
  { "kind": "text", "text": "ã" },
  { "kind": "text", "text": " " }
]
```

The example illustrates the format and is not seeded data. Symbol IDs must resolve within their writing system. Each literal unit is one Unicode extended grapheme according to the pinned Rust segmentation library. Literal units preserve original text; adjacent units from separate insertions are not merged. A combining mark inserted separately therefore remains a separate editable unit. This behavior must be reconsidered at the production editor gate.

The view provides a logical unit caret and range, explicit insertion, removal, bounded text undo/redo and a character palette. Home/End refer to the whole sample, not visual lines. Mouse clicks choose the boundary before a unit; Shift extends the range. IME input stays in the staging textarea until composition ends and the user inserts it. Pending input participates in the unsaved-change guard; save requires insertion or clearing first. Shift+Enter inserts a newline in the input field.

The native textarea and structured view have separate editing histories. The last 50 structured text edits are retained while the editor is open; selection and history are not persisted. Ordinary save preserves this in-memory history; switching records, discarding or closing resets it. Undo cannot restore references to a character that has since been removed from the draft.

## Clipboard and transliteration

Copy/cut in the structured view writes a `text/plain` payload beginning with `LINGFORGE-TEXT/1` and a newline, followed by JSON containing `projectId`, `scriptId` and `units`. Paste checks both identities, a 2 MiB payload bound, unit shape and authoritative Rust validation. Save a new writing system before structured copy/paste. HTML clipboard data is never inserted. Copying to another project or script requires a future explicit mapping workflow.

Paste ordinary text into the input textarea and choose mapped or literal insertion. The readonly transliteration field provides external plain text; users can select/copy it with native controls. Missing transliterations produce issues and empty output, avoiding apparently complete partial conversion. Transliteration can be ambiguous on reimport and does not preserve IDs. Cross-platform clipboard integration remains unverified.

## Constrained SVG outlines

An outline consists of `viewBox: [x, y, width, height]` and `paths: string[]`. Import reads a regular UTF-8 file with a native Rust picker and limits it to 64 KiB. XML parsing rejects DTDs and limits the node count. A root in the SVG namespace must have a viewBox. Optional root width/height are ignored; viewport geometry comes exclusively from the viewBox.

Only direct SVG `path` children are accepted, with a required `d` attribute and optional black/currentColor fill. Paths require explicit **absolute M, L, Q, C and Z** commands and whitespace/comma-separated numbers. Implicit repetitions, compact sign-separated values, relative commands, arcs, transforms and shapes must be converted before import. Numbers must be finite and within ±100,000. Width and height must be positive. There are at most 32 paths, 2,048 commands per path, and 64 KiB of path text per outline. Rendering uses monochrome `currentColor` and nonzero filling.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 90 L 50 10 L 90 90 Z"/>
</svg>
```

Scripts, event attributes, styles, links, images, embedded documents, strokes, gradients and unknown elements/attributes are rejected. Comments may be ignored; processing instructions are rejected. React renders fresh SVG/path elements from validated geometry; it never injects imported markup. Original SVG source is discarded, and there is no claim of arbitrary SVG fidelity. Geometry lives in SQLite domain JSON; the existing managed binary-asset format is unchanged.

## Persistence and references

Schema 5 adds `writing_systems(id, revision, data_json)` and the derived `script_phoneme_references(script_id, character_id, phoneme_id)` projection. The projection has foreign keys to writing systems and phonemes. Removing the owning writing system cascades its projection rows only; referenced phonemes are retained. A referenced phoneme cannot be deleted, including when it has no lexical pronunciation references.

Rust validates the full writing-system graph and replaces the projection in the same immediate transaction. Changed writes advance the project revision and take an automatic snapshot first. No-op saves retain revisions and add no backup. Expected revisions and ephemeral session tokens remain mandatory. Project open validates every record and compares the exact derived/reference sets. Inconsistent imported databases are rejected rather than repaired silently.

Migration 4 → 5 creates empty tables after a migration snapshot. Older supported migrations remain in the same transaction; previous text, phonology and identities remain unchanged. Manifest/archive container version stays 1. Full project archives and recover-as-copy include writing systems, geometry and sample text. Lexicon JSON v2/CSV do not carry these records. There is no standalone script import/export in Part 5. Part 6 adds a separate experimental document browser.

## Bounds

- 32 writing systems per project; 2 MiB serialized draft per writing system.
- 256 characters; 8 glyph variants and 32 distinct phoneme links per character.
- 512 mappings; input at most 32 Unicode scalars, output 1–16 existing character IDs.
- Names at most 120 scalars; script notes 10,000; character transliteration 128.
- Sample text at most 4,096 units; each literal grapheme at most 128 scalars.
- Input insertion at most 16 KiB and 4,096 scalars; resulting units are independently bounded.
- Project database and archive limits remain those in [project-v1.md](project-v1.md).

Full cross-platform acceptance remains open. See the [current results](../GUIDE.md#verified-results) for executed checks and their limits.

## Part 7 editing adapter

Part 7 adds in-app vector authoring and canonical SVG export without changing this stored outline model or schema 6. Existing geometry is decoded into typed commands, preserving coordinates, contours and closure order; simply opening it does not rewrite stored path strings. Edited Apply updates only the selected variant outline, retaining all linguistic identities. See [glyph-editor-v1.md](glyph-editor-v1.md) for editing, history, reuse, guides and export semantics.

## Part 8 font references

Schema 7 font profiles reference character and variant UUIDs. A writing-system save cannot remove those referenced identities until the profile is explicitly updated/deleted. Outline edits and renames keep them intact, and source changes invalidate stale font builds through the script revision. Font mappings never replace sample/document IDs; see [fonts-v1.md](fonts-v1.md).
