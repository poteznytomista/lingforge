# LingForge architecture

Status (2026-11-19): Parts 1–10 source is prepared; Linux automated checks, builds and limited native checks have passed since execution was authorized on 2026-11-17. Full native and Windows acceptance remain open. Parts 5–9 remain experimental; source authorization did not waive their native feasibility gates. See [validation](docs/VALIDATION.md) for the evidence and remaining checks.

## Dependency direction

```text
React presentation → checked frontend bridge → Tauri commands
                                               ↓
                                  serialized workspace service
                                               ↓
                           core types + lingforge-storage (SQLite)
```

The frontend owns navigation, presentation state, focus, and appearance preferences. It does not own linguistic rules or direct database access. The host owns operating-system integration. `lingforge-core` has no Tauri, filesystem, UI, or database dependency; it defines application identity, structured errors, metadata validation, project summaries, typed preferences, lexical, phonological and experimental writing-system/document/grammar domain records, field validation, ordered pronunciation segments, and Unicode search normalization.

## Current desktop boundary

`application_info` remains read-only runtime metadata. Project commands now create/open/close/save projects, list workspace state, export/import archives, duplicate, back up, recover copies, manage recents, and persist preferences. Responses are checked as unknown wire data before use. Browser preview is explicitly labeled and cannot simulate successful storage calls.

The desktop workspace owns one active project behind a mutex. Storage and dialogs execute on a blocking worker, outside the webview/main thread. Paths come from native Rust pickers or tokens in the application catalog; the webview cannot supply arbitrary save paths. Every active-project mutation checks a fresh session token; metadata saves also check the persistent project ID and expected revision. A new session can share a persistent project ID with an imported snapshot without accepting stale commands from the previous session.

Errors include stable input, I/O, conflict, lock, format/version, and internal codes. Unknown exceptions are normalized into user-safe messages. Catalog failures are warnings independent of committed project saves. The frontend retains a draft after a failed save, prevents overlapping operations, and only reports save/export success after the corresponding command succeeds. Native picker cancellation preserves the existing project.

The metadata request has a timeout, cancellation on unmount, and a Retry action. React's strict development lifecycle must not leave duplicate results or timers active. Startup errors are caught by a render boundary; failures in asynchronous commands belong to their own command state.

## Security and capabilities

- A single local window named `main`; native decorations, resize, and platform close controls.
- The native dialog plugin is enabled for Rust-side selection. No general frontend filesystem, shell, HTTP, SQL, or opener API is enabled.
- Tauri build-time command ACLs explicitly grant the typed project commands only to the local main window. Event listen/unlisten and window close/destroy permissions support native unsaved-change protection; native dialog access remains in Rust.
- Production CSP allows local bundled assets and Tauri IPC. It denies external scripts, frames, object embeds, and form submissions. Development CSP permits the localhost Vite server and HMR.
- React performs escaped rendering. No remote content or imported user markup is displayed.
- The bundle identifier `app.lingforge.desktop` is provisional until a public release identity is selected. Do not change it casually after persistent application directories are introduced.

## Presentation and accessibility

`App` owns navigation and close/switch prompts. `useWorkspace` owns the active-project response, in-memory metadata draft, command status, and appearance preferences. A small static navigation catalog supplies real module descriptions and their planned milestone; it contains no linguistic records. Routing remains internal state; there is a single active project session, without deep links or multiple windows. Add a router only when those requirements exist.

Shared primitives provide labels, focus treatment, buttons, cards, badges, and inputs. The native window contains a roughly 66px header, 246px collapsible sidebar, scrolling central workspace, and compact status bar. At narrow initial widths, the sidebar starts collapsed. Each scroll region remains bounded by the grid. Interface text uses rem sizing with three session-level scales.

The design token layer implements the supplied neutral dark palette and restrained crimson emphasis. Important copy uses brighter supporting gray than the reference's dim decorative labels. Fonts: Space Grotesk for UI/headings, IBM Plex Mono for technical labels, Noto Sans for language text/fallback. Font assets are packaged locally. IPA coverage and actual combining-mark behavior must be checked on both platforms; font choice alone is not verification.

Navigation updates document title and focuses the new heading. Labels remain accessible in the collapsed sidebar. Controls use semantic buttons, fieldsets, radio groups, visible focus, and a skip link. System reduced-motion and an explicit reduced-motion preference are supported. No project actions appear as usable controls before their functionality exists.

## Persistence boundary

Part 2 introduces `lingforge-storage`, independent of Tauri. Active project folders contain an immutable identity manifest, a versioned SQLite database, a retained lock file, and snapshots. Metadata and managed asset blobs share a database so SQLite's online backup API captures a consistent complete project. This intentionally refines the earlier loose-asset-directory proposal; see [format 1](docs/formats/project-v1.md) and [ADR 0002](docs/decisions/0002-project-storage.md).

Saving is explicit. Transactions use FULL synchronization and rollback journaling. Changed saves first create a backup; migrations snapshot existing data before transactional schema changes. Retention protects the newest snapshot and keeps ten automatic copies, while manual/migration backups remain. ZIP archives are bounded, contain two allowlisted regular files, and are validated in new directories. Export never overwrites a destination. Recovery creates a separate copy rather than replacing the current database.

A separate OS-local SQLite catalog stores preferences and recent paths. Desktop preferences update only after successful persistence; preview preferences remain in memory. Linguistic data never lives in React state or localStorage as its authoritative store. Normal native close/switch and editor-navigation requests prompt for unsaved metadata, lexical, phonology, writing-system, document or grammar drafts and pending alphabet input, but forced process termination can still lose unsaved drafts.

Stable IDs, character/glyph separation, language-defined categories, and versioned interchange remain architectural commitments. Advanced script/text editor frameworks remain undecided until their roadmap gates.

## Lexicon boundary

Part 3 adds schema 3: entries with a lexeme/root kind, independently identified owned senses/forms, a typed root reference, and directed named relationships. Text fields have language-neutral validation. Source spellings are retained; Rust derives NFC lowercase and optional combining-mark-insensitive search keys. List queries use fixed sort choices, bound filters, literal substring matching, and bounded pages. See [lexicon format 1](docs/formats/lexicon-v1.md) for constraints and interchange.

`lexicon_commands` contains eight thin, typed commands for lists, details, saves, deletion, source selection, preview, apply, and export. They share the workspace's blocking worker, mutex, session token, and native picker boundary. Lexical mutations use entry revisions and advance the project revision. Saves/delete/import snapshot before a transaction; no dependent entries are silently removed. Schema migration snapshots remain governed by the project service.

The workspace retains at most one bounded import source and prepared preview. Rust validates mappings, records, duplicate policy, and the complete reference graph. Prepared records are bound to a session/revision and an opaque token. Apply never reparses a changing source file; inserts and links commit together. JSON preserves supported fields and IDs; CSV explicitly omits unsupported structure. Unknown JSON fields fail validation. Exports publish to new filenames only.

The checked TypeScript bridge validates unknown responses before rendering. `useWorkspace` supplies a shared mutation gate and snapshot updates so a lexical save cannot leave the metadata revision stale. `LexiconPage` owns an in-memory draft and exposes its save/discard guard to `App`; navigation and normal close honor that guard. Debounced list reads reject obsolete responses through effect cleanup. Import/export and selection transitions resolve drafts first. Reference search is bounded and does not load an entire dictionary into a select control.

Pagination is implemented without a new virtualization dependency. Substring search remains a scan. The 10,000-entry release benchmark passed on Linux, with query p95 4.92 ms on the recorded host; native interaction and Windows timings remain unmeasured. See [benchmark conditions](docs/GUIDE.md). The only new libraries are Cargo's `csv` and `unicode-normalization`; no additional system programs are required.

## Phonology boundary

Part 4 adds schema 4 and a dedicated phonology service. Phonemes use UUID identity with revisioned authored data; allophone IDs are scoped to their owner. A separate profile holds structured syllable descriptions and phonotactics. All linguistic labels/features are user-authored, with no inferred IPA classifications or rule execution.

Entry and form pronunciations combine ordered phoneme references and literal annotations while retaining independent free-form text. Their JSON is authoritative. A derived reference table is written in the same lexical transaction, constrained by foreign keys, and checked against the complete JSON graph on project open. It supports reverse-reference navigation and prevents deleting a sound still used by a pronunciation. Renaming changes only the phoneme record and project revision; the UI resolves its current label by ID.

Five thin phonology commands share the existing session, mutex, blocking worker, revision, backup, and error boundaries. The common editor guard now covers lexical, phoneme, and profile drafts. Cross-module reference navigation loads the selected lexical record and rejects stale read results if the user chooses another entry. Inventories send bounded summaries, render 50-row pages, and retain authored classifications.

Lexicon JSON v2 includes referenced phoneme definitions, and imported ID collisions remap both those definitions and entry/form segments under the existing Keep both policy. Definitions, lexical data, and reference projections commit atomically. Legacy v1 is still readable. Full project archives preserve the complete inventory/profile; CSV explicitly omits linked structure. See [phonology model](docs/formats/phonology-v1.md). No new dependencies were introduced.

## Experimental writing-system boundary

Part 5 adds schema 5: aggregate writing-system records with independently identified characters, glyph variants, input mappings and one sample text. The source remains explicitly experimental. The production editor choice requires native comparison evidence; see [ADR 0003](docs/decisions/0003-alphabet-editor-experiment.md).

Rust owns mapping resolution, grapheme splitting, transliteration, SVG import validation and graph checks. React owns the logical unit selection and bounded undo history. The native textarea stages IME input; insertion occurs only after composition and explicit commit. Text stores character IDs or literal units, never visible labels, SVG markup, glyph indices or PUA identity. Glyph variants contain constrained typed geometry inside the aggregate; existing managed asset blobs are unchanged.

Eight thin commands expose list/detail/save/delete, provisional child identities, input preview, transliteration and a native outline picker. Save/delete retain the session, revision, single-writer, snapshot and transaction boundaries. A foreign-key projection tracks character-to-phoneme links and is replaced atomically and validated on open. Phoneme inspection now reports those dependencies as well as lexical pronunciations. Full project snapshots include writing-system data; lexical transfer formats retain their narrower scope.

The UI labels the workspace experimental, includes pending input in the common dirty guard, and never implies a cancelled SVG import or failed save succeeded. Same-project/script structured clipboard data preserves IDs; plain transliteration is explicitly lossy. A dedicated resource browser and production complex-script editing remain planned. Part 6 adds experimental documents; Part 8 adds a separate experimental font/shaping lab. No execution evidence establishes production viability.

## Experimental document and grammar boundary

Part 6 adds schema 6 and the typed `notebook` domain/storage service. Document and grammar records share a repository with stable UUIDs, separate expected revisions and a discriminated JSON shape. Document paragraphs hold units from Part 5 plus optional lexical ranges. Grammar sections hold authored features, examples, section references and descriptive morphology, including irregular forms; none execute rules or mutate lexical forms.

Rust applies range replacements, validates unit/identity graphs, resolves transliteration and previews explicit orthography conversion. Conversion requires a unique exact transliteration match or an explicit ordered target override and remaps lexical boundaries through expansions. Missing/ambiguous mappings produce no applicable paragraph. React owns selection, staged input and bounded full-record undo; it does not infer linguistic mappings. See [notebook format 1](docs/formats/notebook-v1.md).

Source JSON and lexical/phoneme/script/character projections commit together. Opening validates the complete graph and exact projection sets. Deletion checks extend to saved documents and grammar; script saves reject removed characters still used by documents. Migration 5 → 6 creates empty tables after a project snapshot. Existing lock, session, revision, no-clobber export and recover-as-copy rules remain mandatory.

Nine new thin commands expose lists, records, saves/deletes, paragraph edits/conversion, document transliteration and native import/export pickers. Import parses a bounded project-scoped structured file into an unsaved candidate and records the existing target revision. Save revalidates it; cancellation and failure retain the editor. Structured record files preserve content and identities without bundling dependencies. Full project snapshots provide standalone interchange; reduced text formats disclose losses and reject incomplete/custom-symbol output as appropriate.

`NotebookPage` uses the shared editor guard. Pending input blocks save and paragraph switching/history until inserted or cleared. Undo snapshots include annotations and are bounded by step count and serialized-size estimates; they are not persisted. Normal saves retain history. Forced termination may lose unsaved drafts; persistent recovery is a separate project snapshot operation. Both new pages remain explicitly experimental until Part 5's native gate and Part 6 integration checks pass. No additional libraries or system programs were introduced.

## Experimental vector glyph boundary

Part 7 adds `glyph_edit` in core and four thin host commands for decoding, validated editing, encoding and native SVG export. The persisted outline model and SQLite schema 6 are unchanged. A shared parser converts earlier explicit M/L/Q/C/Z data into bounded typed commands without rewriting stored records. Canonical serialization occurs when edited geometry is applied or exported; no visible label or rendering code becomes identity.

Rust owns structural edits, point snapping, translation, segment conversion, de Casteljau splitting, reusable outline insertion, numeric validation and deterministic SVG serialization. React owns selection, canvas transforms, transient pointer previews and bounded model history. Pointer release commits one checked operation; cancellation drops the preview. Numeric changes remain pending until explicitly applied/reset. The nested dialog's state participates in the writing-system save/close guard.

Apply updates the variant outline inside the existing aggregate draft. Save uses its ordinary expected revision, graph checks, pre-write snapshot and atomic reference replacement. Documents continue referencing the same character IDs. Reusable designs are baked copies from existing variants, avoiding a new persistent dependency graph or silent propagation. Alternate variants obtain fresh IDs. View guides and appearance are session-only and do not claim font metrics.

SVG exports contain generated numeric path data only, are bounded for reimport, and use native pickers and synced no-clobber publication. Exporting displayed draft geometry is explicitly independent of saving the project. Tests are authored for legacy decoding, deterministic round trips, curve preservation, bounds, dependency identities, failed operations, pending numeric edits, cancellation and gestures. Linux automated tests now pass; native gestures remain unverified. See [glyph editing contract](docs/formats/glyph-editor-v1.md). Part 7 added no packages or system programs; the subsequently authorized Part 8 boundary is described below.

## Build and version discipline

The host library builds as `rlib` for desktop executable linking; unused mobile/FFI static and shared outputs are excluded. Development/tests use line-table debug information and keep incremental compilation. Full debugger metadata remains an opt-in Cargo profile override. See [build storage guidance](docs/GUIDE.md).

Direct npm and Cargo dependencies are pinned from registry metadata. TypeScript 5.9.3 is intentional: the checked typescript-eslint version supports TypeScript below 6.1, while the registry's latest TypeScript is 7.x. The manifests require Node 24.15+ because the selected jsdom version raises the minimum within the LTS series.

Real npm/Cargo lockfiles were generated and reviewed during authorized validation on 2026-11-17. Node 24.22.3, npm 12.2.2 and Rust 1.100.0 are pinned after successful Linux automated checks and native debug compilation. The manual workflow uses `npm ci`, locked Cargo commands and an explicit npm installation matching the pin. Windows and final artifact acceptance remain separate; see [current evidence](docs/GUIDE.md).

CI configuration prepares Linux and Windows builds and platform-specific bundles. Browser checks run independently of native WebDriver checks; the optional native smoke script has passed on Linux and remains manual. Public distribution/signing remains pending owner decisions and validation. Part 10 selects manual optional updates without an updater service; macOS remains outside scope. Persistence validation must pass before important user-created data is entrusted to this build.

## Experimental font and shaping boundary

Part 8 adds schema 7 and one revisioned font profile per writing system. The core model holds shared metrics, explicit Unicode/PUA export mappings, character/variant UUIDs, bounded context/ligature/mark definitions, rights metadata and a stable-character sample. No PUA or OpenType glyph number becomes linguistic identity. Storage validates profile references on open and before script mutations; script/variant removal is blocked until profile references are explicitly removed. Profiles reuse immediate transactions, expected source/profile revisions, pre-write snapshots and project revision updates. There is no derived projection to drift: the complete bounded profile graph is checked directly.

A separate `lingforge-font` crate owns deterministic bounded font construction through Fontations, generated FEA compilation through fea-rs, and a reference single-run shaper through rustybuzz. Kurbo represents converted geometry. It has no filesystem, Tauri, SQL or UI dependency; its FEA resolver serves one in-memory generated source and refuses external paths. Only checked numeric geometry/generated glyph names enter feature code. User rights/name strings are encoded as font name records. The profile is persisted; generated bytes and shaped output are transient.

Five thin commands load, save/delete, preview and export. Preview/export check the loaded script revision and operate on an explicitly supplied profile draft. Export uses Rust native pickers and synced no-clobber publication; no font install or webview-supplied path is accepted. The new page participates in existing save/discard/native-close protection and shared busy gating. FontFace loads only generated in-memory bytes, is removed on disposal, and reports native rejection without pretending fallback text is the generated font. Edits invalidate old previews.

Logical source selection and sample undo remain separate from native visual selection. Reference cluster ranges do not define grapheme/caret boundaries. The lab's explicit RTL run does not introduce bidi/complex-script support into Documents. PDF, vertical text, script-specific shaping and production editor promotion remain gated. See [font contract](docs/formats/fonts-v1.md), [ADR 0004](docs/decisions/0004-font-shaping-experiment.md) and [native protocol](docs/experiments/part-8-font-checks.md). Linux automated checks and bounded native FontFace/profile checks passed; full native shaping acceptance remains open.

## Experimental linguistic automation boundary

Part 9 adds the core `automation` model and schema 8. Versioned program aggregates contain stable feature/value/class/rule/cell identities, irregular overrides and bounded phonotactic patterns. Rust owns reference/cycle validation, grapheme operations, ordered sound changes, template evaluation, result traces and phonotactics. No project text becomes executable code. The frontend supplies explicit fields and dependency views; program save uses the shared dirty guard and revision/backup path.

Programs choose saved lemma or free-form pronunciation text. Rules use exact Unicode graphemes and explicit class membership; earlier phoneme-ID and document models remain intact. Features are program-owned, independent of descriptive Grammar records. Inflection and derivation identify the meaning of generated cells; neither silently creates or overwrites authored lexical forms.

Nine thin commands expose identity allocation, program/index/batch reads, program save/delete, generation preview/apply and batch reversal. The host holds one frozen preview tied to the project session/revision. Apply receives only its token and selected row indices, validates eligibility and staleness, then writes a separate immutable batch and its references in one transaction after a snapshot. Source/feature/rule provenance is retained in the batch’s complete program and source snapshots. Project activation/close clears pending previews.

Schema 8 holds program/batch JSON plus exact override-entry and generated-cell projections. Open validates current program graphs, lexical dependencies, exact projections and replayed historical results. Program edits do not retroactively regenerate batches. Program deletion is blocked by its batches; lexical deletion is blocked by active overrides and generated source references. Revert removes only owned batch data/projections and advances the project revision. Full snapshot archives and recover-as-copy remain the standalone interchange/recovery path.

No npm/Cargo/system dependencies were added. Source tests cover multiple morphology strategies, sound-change ordering, grapheme integrity, cycles/bounds, conflicts, explicit selected apply, provenance, revision/session rejection and transaction failure. These automated tests passed on Linux; native automation workflow acceptance remains open. See [automation contract](docs/formats/automation-v1.md) and [ADR 0005](docs/decisions/0005-bounded-linguistic-automation.md).

## Release tooling boundary

Part 10 changes packaging and operator documentation without adding a database migration, app command, npm dependency or Cargo library. The domain/storage schema remains 8 and container format 1. The production CSP/capability boundary is unchanged. Preferences includes offline help and accurate experimental build labeling.

The base bundle target list is empty; platform overlays explicitly select Linux AppImage or Windows NSIS. Windows selects current-user installation and offline WebView2 provisioning. Build-time downloads remain separate from end-user offline operation. Native support and install/uninstall preservation require actual evidence.

Node built-in release tools check lock/config/version agreement and exact active toolchains, restrict candidate builds to native x64 GNU Linux/MSVC Windows, pass Cargo --locked through Tauri, and collect artifacts into new directories without overwriting previous output. Existing bundle output stops collection before a build. Hashes/configuration/tool versions/host and CI identifiers are evidence of file identity, not a test/signature/license attestation. Interrupted or failed runs cannot create a completed candidate marker. Copied documentation includes referenced formats and synthetic fixtures, preserving its relative links.

CI remains manual dispatch only during initial validation; execution is authorized. It requires locked installs, format/lint/build/tests and explicitly separate browser checks before candidate packaging. Native smoke records are per-run, include binary hashes, and fail on driver/session errors; the opt-in suites also exercise bounded project/editor persistence; they do not certify installers. Use disposable desktop accounts because no separate test catalog is injected.

Release preparation distinguishes private unverified candidates from a public release. Manual optional updates require an older-version archive for rollback; no updater endpoint or credentials are introduced. Public signing, complete transitive redistribution notices, publisher identity and license remain decisions backed by actual final-artifact verification. See [release preparation](docs/release/README.md) and [evidence checklist](docs/release/CHECKLIST.md). No reproducibility or native support claim follows from source alone.
