# ADR 0002: Project persistence and portable snapshots

Historical design decision: authorization and execution statements below describe the decision date. Current requirements/results are maintained in the [guide](../GUIDE.md); execution has been authorized since 2026-11-17. The technical decisions remain applicable unless explicitly superseded.

Date: 2026-11-04. Status: implemented in source; validation deferred at the user's request.

## Decision

Use a separate `lingforge-storage` Rust crate with bundled SQLite through rusqlite. Keep metadata and managed asset bytes in one transactional database, with an immutable identity manifest in the project folder. Export a versioned `.lingforge` ZIP containing the manifest and a consistent database snapshot. Store application preferences and recent paths in a separate SQLite catalog.

Use explicit saves, backups before changed writes, revision checks, ephemeral desktop-session tokens, and a retained filesystem lock per project. Recover backups into new projects. Use native pickers from Rust; grant the main webview only typed application commands and the close-event permissions it needs.

## Why

Bundled SQLite keeps database behavior consistent across Windows and Linux without a separately installed SQLite runtime. Keeping initial assets in the database avoids a coordinated commit across SQLite and mutable external glyph files. Relative logical asset identifiers preserve portability. A ZIP snapshot provides a single transfer file while the active database remains directly editable through transactions.

Rust worker threads handle dialogs and storage. Serialized operations keep session transitions coherent. The frontend owns unsaved drafts; the backend owns validation and committed state. A failed switch leaves the old project active, and a failed save retains the draft in the UI. The catalog is deliberately independent so a recent-list error cannot masquerade as a failed project save.

## Tradeoffs and boundaries

- Initial asset/database size limits are explicit and conservative. Large external media is a future schema decision.
- A project folder is the working format; `.lingforge` archives are imported/exported snapshots, not databases edited inside ZIP files.
- Read-only project browsing, cloud sync, project merging, and automatic draft recovery are not included.
- Normal close/switch protection does not protect unsaved drafts from power loss or forced process termination.
- Local filesystem locks require platform verification and do not establish support for remote/network filesystems.
- Rust, SQLite, ZIP, and native-dialog dependency resolution and all tests remain unexecuted. Direct dependency metadata and relevant API documentation were inspected; no runtime compatibility is claimed.

References: [SQLite online backup through rusqlite](https://docs.rs/rusqlite/latest/rusqlite/backup/index.html), [rusqlite connection APIs](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html), [Tauri native dialogs](https://v2.tauri.app/plugin/dialog/), [Tauri application-command ACLs](https://docs.rs/tauri-build/latest/tauri_build/struct.AppManifest.html), [ZIP entry APIs](https://docs.rs/zip/latest/zip/read/struct.ZipFile.html), [tempfile publication](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html).
