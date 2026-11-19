# LingForge project format 1

Status: implemented in source on 2026-11-04. Linux automated storage tests and bounded native creation/save/backup/reopen checks passed on 2026-11-17–18; cross-platform and full durability acceptance remain pending. See [validation](../VALIDATION.md). This is an initial development format, not a certified archival guarantee.

## Active project folder

```text
LingForge-<generated suffix>/
  manifest.json
  project.sqlite3
  .lingforge.lock
  backups/
    auto-<20-digit Unix milliseconds>-<UUID>.lingforge
    manual-<20-digit Unix milliseconds>-<UUID>.lingforge
    migration-<20-digit Unix milliseconds>-<UUID>.lingforge
```

Users select the parent folder through a native picker. LingForge allocates a new, unique ASCII folder name. The language's Unicode name is metadata, so names cannot accidentally become traversal paths, reserved Windows names, or case-colliding directories. A closed project folder may be renamed or moved; reopen it through the native picker to update recent projects. Moving a folder while it is open is unsupported.

`manifest.json` is limited to 16 KiB and contains exactly:

```json
{
  "format": "lingforge-project",
  "formatVersion": 1,
  "projectId": "2b573576-f598-49b2-a1a5-75c7d4887d94"
}
```

The manifest ID must match the database ID. IDs use canonical lowercase hyphenated UUIDs. The manifest does not duplicate names, save times, or schema versions, so ordinary saves do not require a two-file commit. Manifests are immutable after creation; a duplicate/recovery copy receives a new project identity before publication.

## SQLite content

`PRAGMA application_id` is `0x4c464731` (`LFG1`). `PRAGMA user_version` tracks the schema independently of container format.

Schema 1 has a singleton `project` table containing the stable ID, project name, language name, description, and creation/update timestamps. The `assets` table stores stable asset IDs, logical paths, display names, media types, and bytes. Schema 2 adds an integer `revision` to the project metadata. Schema 3 adds lexical entries, owned senses/forms, roots, directed relationships, and search keys; see [lexicon format 1](lexicon-v1.md). Schema 4 adds phonemes, a phonology description profile, entry pronunciation JSON, and indexed phoneme references; see [phonology model](phonology-v1.md). Schema 5 adds experimental writing-system records and character-to-phoneme references; see [the writing-system experiment](writing-v1.md). Schema 6 adds experimental documents, grammar and their reference projections; see [notebook model](notebook-v1.md). Schema 7 adds experimental font profiles with checked character/variant references; see [font profile model](fonts-v1.md). Schema 8 adds bounded linguistic programs, generated batches and their reference projections; see [automation model](automation-v1.md). The manifest and archive container version remain 1.

Metadata saves validate input, snapshot the old state, then update the singleton row in an immediate transaction using the expected revision and project ID. The revision changes only after a successful committed modification. New desktop sessions also receive an ephemeral token: a stale webview request cannot target a reopened project or another imported copy with the same persistent ID.

Foreign keys are enabled; synchronous mode is FULL and active projects use rollback journaling. A process-wide mutex serializes desktop operations, and a retained cross-platform filesystem lock excludes another LingForge instance from the same project directory. Lock files are never removed merely because a session ends; the operating system releases the lock when the process exits. These are cooperative local locks, not a network-filesystem collaboration protocol.

The database is opened without extension loading and with defensive mode, untrusted schema, and disabled triggers. Opening checks the application ID, supported schema version, database integrity, metadata, asset limits, and unexpected schema objects. Future schema versions are rejected without migration. Read-only or inaccessible folders fail with a user-facing error; there is no read-only project browser yet.

## Managed assets

Assets are stored **inside SQLite**, rather than as loose files, so a database snapshot also captures every referenced byte. Each logical path is exactly `assets/<canonical UUID>`; it is an interchange identifier, never a host filesystem path. Display names do not determine storage paths. Files are not executed or rendered by the storage layer.

This deliberately adjusts the earlier directory-plus-loose-assets proposal. A later large-media milestone may introduce a versioned external content store if measured requirements justify the coordination cost. The current storage API supports insertion/readback; a user-facing resource editor belongs to the script milestone.

Current limits: 16 MiB per asset, 128 MiB total asset bytes, 1,024 assets, and 256 MiB database size. These are development-format limits, not claims about final application capacity. The supplied tests must verify these boundaries before accepting important user work.

## Portable `.lingforge` archive

The archive is a ZIP with exactly two regular, unencrypted entries:

1. `manifest.json`
2. `project.sqlite3`

It excludes local preferences, recent-project paths, filesystem locks, and backup history. The database is produced through SQLite's online backup API, not by copying an active file. ZIP output is written to a temporary sibling file, flushed, and published without overwriting an existing destination. Unix directory syncing strengthens publication durability; equivalent directory flushing is not available through this implementation on Windows and needs platform fault testing.

Import reads only the two exact allowlisted names. Other names, directories, links, encrypted entries, duplicated entries, or unexpected counts are rejected. This also rejects `../`, absolute paths, Windows drive paths, backslashes, and case variants. Both compressed file size and per-entry expanded byte counts are bounded; the database and manifest are independently validated before activation.

Extraction goes into a newly allocated temporary project directory, never over an existing project. The previous active project remains open until the replacement has validated. Native picker cancellation changes nothing. A completed import preserves the persistent project ID; duplication and recovery assign a new project ID while preserving internal asset IDs. All imported sessions receive distinct ephemeral session tokens.

## Saving, backups, migration, and recovery

Saving is explicit: **Save project** or **Ctrl+S**. In-memory edits are not autosaved. Normal project switching and window-close requests offer save, discard, or cancel. A forced process kill can lose unsaved drafts; committed database changes are protected by SQLite transactions and journaling.

Before a changed save or managed-asset insertion, create an automatic snapshot. If that snapshot fails, the mutation is not started. Retain the newest 10 automatic backups; manual and migration snapshots are never removed by that policy. Retention cleanup failure may leave extra backups and does not turn a completed save into an apparent failure.

Before applying an existing project's migration, create a migration snapshot. The required migration sequence runs in one transaction; failure rolls it back. Schema 1 → 2, 2 → 3, 3 → 4, 4 → 5, 5 → 6, 6 → 7, and 7 → 8 migrations are implemented in source. New projects are initialized through the same schema sequence without claiming pre-existing user data needs a migration backup.

**Recover copy** imports a selected backup into a newly selected parent folder and opens the recovered copy. It never replaces the original database. If an original project cannot open, use **Import archive** on a file from its `backups` directory. Interrupted exports leave unpublished temporary files; interrupted project creation may leave an unlisted incomplete folder. Do not automatically delete unknown leftovers or unrelated user files.

## Application catalog

`workspace.sqlite3` in Tauri's OS-specific application data directory stores recent projects and appearance preferences. It is separate from every project and excluded from archives. Recent entries are selected by opaque tokens; arbitrary webview-provided paths are not accepted by project commands. Missing folders are labeled unavailable and can be forgotten without deleting project data.

Catalog updates use SQLite transactions. A catalog failure after a project save is reported as a separate warning so the UI does not falsely claim the committed project save failed. Desktop preferences display saved values only after a successful write; browser preview preferences remain session-only.

## Schema 6 addition

Schema 6 adds experimental document and grammar records plus transactional lexical/phoneme/script/character reference projections. All previous asset, archive and recovery semantics remain. See [notebook-v1.md](notebook-v1.md) for bounds, identity, editing, project-scoped record interchange and validation. Full SQLite snapshot archives include the complete notebook and its dependencies.

## Schema 7 addition

Schema 7 adds one experimental font profile per writing system, without rewriting previous records. Metrics, export mappings, rules and source-character samples are transactionally saved with the project revision and checked against source identities. Writing-system edits cannot remove referenced variants/characters, and profiles must be explicitly removed before their scripts. Full archives/recovery include the profiles; standalone TTF export is a presentation derivative and does not replace a project archive. See [fonts-v1.md](fonts-v1.md).

## Schema 8 addition

Schema 8 adds `automation_programs`, `automation_batches`, `automation_overrides` and `automation_cells`. Program JSON and override references, or batch JSON and generated-cell references, commit atomically with the project revision after a snapshot. Generated batches remain separate from authored lexical forms, preserve frozen program/source provenance and can be explicitly reverted. Open checks graphs, exact projections and reproduced results. Existing project/archive identities and recover-as-copy semantics remain. See [automation-v1.md](automation-v1.md).
