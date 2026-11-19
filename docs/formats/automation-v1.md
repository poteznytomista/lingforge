# Linguistic automation v1 — experimental, schema 8

Status (2026-11-19): Experimental automation contract. All ten parts are source-authored and execution is authorized. Linux automated checks pass; full native automation and Windows acceptance remain open. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Programs and identities

A project holds at most 32 revisioned programs. Each program has format version 1, a name/notes, an input choice (lemma or free-form pronunciation), stable-ID features and values, explicit grapheme classes, reusable rules, paradigm cells and entry-specific irregular overrides. Feature definitions belong to this program; earlier descriptive grammar sections do not become executable implicitly.

All program children have distinct canonical UUIDs. Cells reference feature/value and rule IDs. Rule calls reference rule IDs. Phonotactic slots and sound-change contexts reference class IDs. Overrides reference lexical entry and cell IDs. Labels and grapheme strings are authored content, never record identity. Removing a referenced definition requires resolving its references explicitly.

The complete version-1 JSON shape is illustrated by the [test-only program fixture](../../tests/fixtures/automation/program-v1.json). It is never seeded into a user project. Unknown fields and operation variants are rejected by the Rust model.

Input is the exact saved lemma or free-form pronunciation field. Linked phoneme sequences, glyphs and custom-character documents are not converted or rewritten. Rules work on Unicode extended grapheme clusters without normalization, case folding, regex, arbitrary code or filesystem access. Class members are explicitly authored single graphemes; they do not infer articulatory features or follow phoneme renames.

## Bounded rule semantics

- Affix: add literal prefix/suffix to the current word.
- Infix: insert literal text at a zero-based grapheme boundary. An out-of-range boundary is an error.
- Template: concatenate literal text, the entire current word, or half-open grapheme slices of that word. Repetition supports reduplication; slices and literals support authored nonconcatenative templates. Missing root positions fail rather than truncating. This is not automatic morphological analysis.
- Sound change: replace a nonempty literal grapheme sequence with literal text (possibly empty), optionally conditioned on immediate preceding/following class membership and word-start/end boundaries. Each rule scans its input left to right, with nonoverlapping matches. Inserted output is not rematched in the same rule; later rules see earlier output.
- Call: apply a reusable rule. Missing references and cycles are rejected throughout the program, including unused rules.

Cells declare inflection or derivation, a feature bundle, and an ordered rule list. Duplicate feature assignments/bundles are rejected. An explicit entry+cell override replaces the whole regular derivation and records a required reason. Other cells still use their regular rules.

Phonotactic patterns are alternatives; each is an ordered list of class slots with bounded minimum/maximum repetition. Validation matches the whole generated word using a bounded set of reachable positions, without exponential backtracking. No patterns means “not checked,” never “valid.” A failed check blocks application.

Limits: 16 features with 16 values each; 32 classes with 64 members each; 64 rules; 32 cells; 128 overrides; 16 phonotactic patterns with 16 slots each (0–8 repetitions); 16 template pieces; 16 rule references per cell; at most 16 nested calls and 64 executed operations per cell. Words are limited to 256 graphemes and 512 Unicode scalars. Program JSON is capped at 1 MiB. Evaluation reports step-by-step before/after text and rule IDs; no rule silently truncates output.

## Preview, conflicts, application and reversal

Preview uses a saved program revision, explicitly selected saved entries/cells, and the current project revision. A maximum of 64 entry/cell pairs is evaluated. Results include source entry ID/revision/input/lemma, cell/features/kind, output, rule trace, irregular reason and phonotactic result. Evaluation errors, an existing generated cell, or an authored form with the same label/output block that row. The UI exposes all reasons and permits selecting only eligible rows.

The host retains one frozen preview with an opaque token and session binding. Apply accepts that token and explicit row indices, rechecks the project revision, snapshots, and atomically stores only selected eligible results and advances the project revision. It never accepts replacement result text from the webview. Failed apply retains the preview; success consumes it. Switching/closing projects clears it. Every intervening project mutation requires a new preview.

Generated forms live in immutable batches, separate from lexicon authored forms. Each batch includes the complete program snapshot and source snapshots, so later spelling/rule edits do not erase provenance. One program+entry+cell may have one active generated result. Conflicts must be resolved by revising the program/authored data or explicitly reverting the existing batch; there is no overwrite/keep-latest shortcut.

Revert batch is explicit, confirmed, snapshot-backed and transactional. It removes that batch and its owned reference projection only, leaving authored entries/forms intact. Reopen, full project archives, duplication and recover-as-copy preserve batches. Undoing a revert uses project recovery into a new copy, not an in-memory undo promise. Programs with batches and entries referenced by overrides/batches cannot be deleted until those references are removed.

## Storage and inspection

Schema 8 adds program JSON, batch JSON, override-to-entry and generated-cell projections. Source JSON and projections commit in one transaction. Opening validates bounds, versions, identities, every program graph, existing lexical references, exact projection equality and replayed batch results against their frozen program/source inputs. Historical snapshots intentionally need not equal current lexical content. Unexpected schema objects remain rejected.

At most 32 batches, 64 rows per batch and 2 MiB per preview/batch. The whole-project limit remains 256 MiB. No standalone automation transfer file is introduced; full SQLite-snapshot archives provide lossless interchange. No new programs or libraries are required.

## Verification still required

Native Linux and Windows checks must cover authoring, saved graph inspection, multiple typologies, preview conflict handling, stale sessions/revisions, selected-row apply, reopening provenance, backup/transaction failures, migration/recovery and batch reversal. All authored test sources are unrun. Broader linguistic models, phoneme-ID transformations, automatic segmentation and production performance claims remain outside this bounded interpreter.
