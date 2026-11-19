# LingForge guide

Updated **2026-11-19**. This is the current handbook for using, developing and validating LingForge 0.1.0. It replaces the former dated progress narratives and separate user/release notes. Compact final native reports and candidate provenance are retained. Superseded logs and generated output were later removed at the user’s request. Technical specifications are linked at the end.

## Contents

- [Current app and launch](#current-app-and-launch)
- [What validation means](#what-validation-means)
- [Features and workflows](#available-in-the-source)
- [Development setup](#development-prerequisites)
- [Saving, moving and recovering projects](#start-and-save)
- [Programs by part](#programs-by-part)
- [Verified results](#verified-results)
- [Remaining acceptance](#remaining-acceptance)
- [Build storage](#build-storage)
- [Packaging and distribution](#packaging-and-distribution)
- [Technical reference](#technical-reference)

## Current app and launch

The Linux AppImage is runnable and includes the implemented application features. It is an **experimental development candidate**, not a fully accepted public release. No Windows installer has been validated. Linux and Windows remain the required targets; macOS is outside scope.

Current artifact, relative to the repository:

```text
website/downloads/LingForge_0.1.0_amd64.AppImage
```

Absolute location:

```text
/home/adam/Desktop/vibecoding projects/conlang/website/downloads/LingForge_0.1.0_amd64.AppImage
```

Size: **110,717,432 bytes (105.59 MiB)**. SHA-256:

```text
793260508f582463b3b9e4e331e38f50fd065b786736076471ab933dec9c6408
```

On this machine, from the repository directory:

```bash
chmod +x website/downloads/LingForge_0.1.0_amd64.AppImage
env -u GIO_MODULE_DIR -u GTK_PATH -u GTK_EXE_PREFIX -u GDK_PIXBUF_MODULE_FILE WEBKIT_DISABLE_DMABUF_RENDERER=1 ./website/downloads/LingForge_0.1.0_amd64.AppImage
```

The graphics variable is needed on the tested NVIDIA machine to avoid a blank WebKit window. The removed variables are incompatible library lookup paths inherited from the VS Code Snap terminal; changes apply only to the launched process. Native automated checks additionally used `GDK_BACKEND=x11` under KDE Wayland. Other Linux distributions and display configurations have not been certified; normal file-manager launch without workarounds remains a release acceptance item.

**The AppImage is the only LingForge application file needed to run this Linux build.** You do not need the source tree, Rust, Node/npm, `node_modules`, `dist`, or compiler caches. You still need a compatible Linux x86_64 desktop and its system runtime/graphics support; the tested host has FUSE 2 compatibility. This is not proof that the AppImage runs on a fresh arbitrary Linux installation. It does not run on Windows.

Language-project folders and backups are separate user data: keep them when moving/removing the AppImage. Preferences and recent-project paths live in the OS-local application catalog, not inside the AppImage. The application works offline and has no required account or automatic updater.

The artifact contains existing implemented modules, not every planned feature. Resources is planned; PDF export, production bidi/complex-script document editing and other limitations below are not completed functions. Keep independent archives and use disposable work for unverified workflows.

## What validation means

**IME** means _Input Method Editor_: software that composes characters before inserting them, such as Japanese kana/kanji or Chinese input. Composition is different from ordinary direct typing: intermediate text, candidate selection, Enter, cancellation and saving/navigation must not prematurely commit or lose it. The app stages this input in a native textarea, but real OS input methods have not been accepted on Linux or Windows. Passing Unicode typing tests does not prove IME behavior.

**Broader native workflow acceptance** means checking complete tasks in the actual desktop application and final package. Examples include document/grammar editing and reopening, generating and reversing forms, file pickers, importing/exporting archives, restoring backups, drawing gestures, font exports, accessibility, and installation/upgrades on both target systems. Unit and browser tests exercise parts of those systems; they do not replace those complete desktop checks.

## Available in the source

- A Tauri 2 desktop host with React and TypeScript.
- A near-black editorial workspace with restrained crimson accents, bundled fonts, outline icons, and native window decorations.
- Overview, module navigation, breadcrumbs, collapsible sidebar, status bar, keyboard shortcuts, and text-size/motion preferences.
- A persistent lexicon editor with senses, forms, roots, named relationships, Unicode-aware search, filters, pagination, reference-aware deletion, and previewed CSV/JSON transfer.
- A phonology workspace with stable-ID phonemes, consonant/vowel inventories, articulatory/custom features, allophone and syllable descriptions, linked entry/form pronunciations, and reverse references.
- An explicitly experimental writing-system workspace with stable characters, glyph variants, constrained SVG import, phoneme associations, input mappings, and persisted sample text.
- Experimental multi-paragraph documents with optional lexical spans, explicit orthography conversion, record undo/redo, transliteration and checked exports.
- Structured grammar sections, language-defined features, examples, lexical/phonological references and descriptive morphology/irregular records.
- An experimental vector glyph editor with path/control-point tools, pan/zoom, guides, snapping, undo/redo, reusable outline copies, alternate variants and deterministic SVG export.
- An experimental font/shaping lab with persistent metrics, explicit Unicode/PUA export mappings, contextual forms, ligatures, mark anchors, single-run cluster inspection and TrueType export.
- Experimental versioned rule programs, paradigm cells, irregular overrides, ordered sound changes, phonotactic checks, derivation previews and reversible generation batches.
- A clearly labeled planned resource browser.
- Checked Rust command boundaries, native project pickers, explicit metadata saves, and unsaved-change protection.
- Versioned SQLite projects, single-writer locks, recent projects, persistent preferences, consistent backups, recovery copies, duplication, and portable archive import/export.
- Managed asset storage in SQLite with stable logical paths; the resource browser remains planned.
- Frontend, browser, Rust, release-tool and native smoke-test sources; guarded candidate packaging and manual Linux/Windows CI.
- In-app offline save/recovery help, release notes, installation/upgrade instructions and a native release evidence checklist.

Writing systems, documents, grammar, glyph authoring, fonts/shaping and linguistic automation are **experimental**. The user authorized Part 6 source work while Part 5’s mandatory native feasibility gate remains open. There are no sample languages presented as user data. Automated storage and recovery tests now pass on Linux; important user work should still wait for native and cross-platform acceptance.

## Development prerequisites

The maintained [program list by part](#programs-by-part) includes Linux and Windows setup. **Parts 2–9 require no additional system programs beyond part 1.** Parts 6–7 and 9–10 add no npm or Cargo libraries. Part 10 lists Linux packaging utilities separately; Windows needs no additional manually installed program beyond the earlier prerequisites. Part 8 adds four Cargo libraries for font construction, feature compilation, reference shaping and geometry; no additional npm packages. Part 5 adds Cargo libraries for bounded XML parsing and Unicode grapheme segmentation. Cargo supplies bundled SQLite and the new CSV/Unicode libraries; no separate database server or spreadsheet application is needed.

The tested Linux toolchain is **Node 24.22.3, npm 12.2.2, Rust/Cargo 1.100.0**, with rustfmt and Clippy. Exact versions are recorded in `.nvmrc`, `package.json` and `rust-toolchain.toml`; both genuine dependency lockfiles are included. Windows still needs validation with these pins.

### Arch Linux

After repairing the local mirrors and bringing the system to a consistent updated state, install:

```bash
sudo pacman -S --needed rustup nodejs-lts-krypton npm webkit2gtk-4.1 base-devel curl wget file openssl librsvg xdotool patchelf fuse2
rustup toolchain install 1.100.0 --profile minimal --component rustfmt --component clippy
```

Avoid refreshing package databases without the corresponding system upgrade on Arch. The user repaired prerequisites before the 2026-11-17 validation run.

### Windows

Install Node.js 24 LTS, Rust through rustup using the MSVC toolchain, Microsoft C++ Build Tools with the **Desktop development with C++** workload and Windows SDK, and the WebView2 runtime. See [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) for current platform instructions. Neither WSL nor a Linux cross-build replaces native Windows verification.

### Locked setup and verification

From the project root:

```bash
npm ci
npm run release:preflight
npm run check
npm run check:rust
npm run desktop
```

Formatting has run. Use `npm run format` and `cargo fmt --all` after edits, then their check modes through the commands above. Review lockfile changes when deliberately changing dependencies; normal builds use locked inputs. Pins do not alone establish reproducible artifacts.

On the tested NVIDIA/Linux machine, WebKitGTK opens a blank window without its documented graphics workaround. Use `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run desktop` for this host; this disables the faster DMA-BUF path and has not been established as necessary on other machines. See [the observed native result](#verified-results).

The VS Code Snap terminal also inherited incompatible GIO/GTK library lookup paths during testing. For that environment, the successful isolated native launch used:

```bash
env -u GIO_MODULE_DIR -u GTK_PATH -u GTK_EXE_PREFIX -u GDK_PIXBUF_MODULE_FILE WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run desktop
```

This changes the launched process only. Native folder selection successfully created a project; typed `/tmp` navigation in that picker remains unresolved. See [continued validation](#verified-results).

`npm run desktop` launches the actual native application. The Vite server binds to `127.0.0.1:1420` with a strict port; stop a conflicting process rather than silently serving the wrong app.

For generated-file cleanup and smaller development builds, see [build storage guidance](#build-storage).

## Commands

| Command                                | Purpose                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run desktop`                      | Native Tauri development window                                                      |
| `npm run desktop:build`                | Native release build and platform bundle                                             |
| `npm run desktop:build -- --no-bundle` | Release binary without an installer                                                  |
| `npm run dev`                          | Frontend-only browser preview; no native functionality                               |
| `npm run build`                        | Type checking and frontend production assets                                         |
| `npm run check`                        | Formatting, linting, frontend build, and component/bridge tests                      |
| `npm run check:rust`                   | Rust formatting, Clippy, and workspace tests                                         |
| `npm run test:ui`                      | Playwright checks against built assets                                               |
| `npm run test:native`                  | Optional WebDriver smoke check with a separate report per run                        |
| `npm run test:release`                 | Node built-in regression checks for packaging guards and artifact preservation       |
| `npm run release:preflight`            | Require reviewed locks, exact toolchains and consistent platform configuration       |
| `npm run release:package`              | Build a locked platform candidate and collect hashes/notices/docs without publishing |

For browser checks, first run `npm run build` and `npx playwright install chromium webkit`. Some Linux environments also need Playwright's documented browser system dependencies. Browser WebKit coverage is useful but is not proof of WebKitGTK/Tauri behavior.

For the optional native check, install `tauri-driver` and the relevant platform driver as described in [Tauri's WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/), build with `npm run desktop:build -- --no-bundle`, and run `npm run test:native`. Linux requires a graphical session and `WebKitWebDriver`; Windows requires a matching `msedgedriver` on PATH. Optional overrides: `LINGFORGE_BINARY` and `LINGFORGE_DRIVER_PORT`. Use a disposable desktop account or isolated Linux XDG data/config/cache directories; the script uses the launched app's catalog. Each run writes separate success/failure evidence under `test-results/native-*`. The Linux smoke, project and bounded editor checks have passed; Windows and installer acceptance remain pending.

To include project integration checks, first create a disposable project in that same test profile, then set `LINGFORGE_TEST_PROJECT` to its full generated project-folder path (the folder containing `manifest.json`). It must appear in that profile's recent projects. This option edits metadata, creates backups and temporary lexical/phonological records, checks Unicode save/reopen, verifies linked-phoneme identity and deletion protection, then restores the initial metadata and removes the test records on success. A failed run may leave test edits for diagnosis; use disposable data. The suite does not automate the native file picker or complete the experimental editor/input gates.

The optional editor suite uses an explicitly generated synthetic fixture. Run `cargo run -p lingforge-storage --example native_fixture --locked -- <new-profile-folder>`; existing destinations are refused. Set `LINGFORGE_EDITOR_FIXTURE` to its absolute `fixture.json` path and use that profile's `data`, `config` and `cache` directories as Linux `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `XDG_CACHE_HOME`. Set `LINGFORGE_TEST_PROJECT` to the generated `projectPath` as well to include project checks. Run `npm run test:native` with the native driver on PATH and the documented host graphics/environment settings. Create a fresh fixture for each full editor run: it intentionally saves sample text, glyph geometry and a font profile. This does not test native project creation. See [editor validation](#native-coverage-and-evidence).

## Interface behavior

- `Ctrl+B`: collapse or expand the sidebar.
- `Ctrl+,`: open preferences.
- `Tab` / `Shift+Tab`: move through controls; the first tab reveals a skip link.
- Navigation focuses the new page heading. Native input controls keep editing shortcuts.
- `Ctrl+S`: save the active lexical, phonology, writing-system, document, grammar, font-profile, or rule-program draft, or project metadata from the overview. Leaving an unsaved editor prompts to save, discard, or keep editing.
- Desktop preferences persist separately from projects; browser-preview preferences affect this session only. Follow-system motion respects the operating system's reduced-motion setting.
- Browser preview is labeled explicitly in the status bar; a failed native bridge is shown as an error with Retry.

## Structure

```text
src/app/                    shell state, navigation, keyboard interactions
src/components/             shared interface components
src/features/               overview, projects, lexicon, phonology, writing/glyphs, documents/grammar, fonts, automation, preferences
src/bridge/                 checked desktop command and error boundaries
src/styles/                 design tokens and shared styling
src-tauri/                  Rust desktop host, capabilities, native configuration
crates/lingforge-core/      independent domain foundation
crates/lingforge-storage/   SQLite projects, catalog, snapshots, archives, tests
crates/lingforge-font/      experimental TrueType generation and reference shaping
tests/ui/                   browser interaction and accessibility checks
scripts/                    asset authoring, candidate packaging and native smoke checks
docs/                       architecture decisions and validation records
public/licenses/            bundled font redistribution notices
```

## Project workflow (implemented; native acceptance remains partial)

Use **New language** and choose a parent folder, or **Open project** and select an existing LingForge project folder. Edit its name, language name, and description, then use **Save project** or **Ctrl+S**. Saves are explicit; in-memory drafts are not autosaved.

**Export archive** creates a portable `.lingforge` snapshot of saved data. **Import archive** creates a new project folder. **Duplicate** creates a separate project identity. Export destinations are never silently overwritten. **Recover copy** opens a backup as a new project, leaving the original intact. If the original cannot open, import an archive directly from its `backups` directory.

Before each changed save, LingForge takes a snapshot. The newest 10 automatic snapshots are kept; manual and migration snapshots are retained. Missing recent-project folders can be located again with Open project or forgotten without deleting data. SQLite is bundled by Cargo; you do not need to install a separate SQLite server or CLI for part 2.

See [project format and limits](formats/project-v1.md) and [the storage decision](decisions/0002-project-storage.md). Native close protection has bounded Linux evidence; full recovery/portability workflows and Windows still require acceptance.

## Lexicon workflow (implemented; native acceptance remains partial)

Open a project, choose **Lexicon**, then **New entry**. Define a headword and at least one sense; pronunciation and category are free text. Add owned forms, a root link, etymology, and named relationships as needed. Save explicitly. The list supports search, exact category/kind filters, ordering, and pages of 50 entries. Search preserves original text and distinguishes combining marks unless the corresponding option is enabled.

Referenced entries cannot be deleted until incoming links are removed. Renaming preserves IDs and links. Every changed save, deletion, and import creates a backup before its transaction. Save/discard prompts protect navigation and normal native close; forced termination can still lose unsaved drafts.

**Import** uses a native file picker, CSV column mapping when applicable, duplicate handling, and an explicit validated preview before apply. **Export** writes all saved entries to a new filename. JSON preserves complete lexical records; CSV carries five text fields and omits structured relationships/forms and other fields, as explained in the dialog. Files are limited to 16 MiB and projects to 20,000 entries. Use a full project archive for larger transfers or project assets. See [lexicon format and limits](formats/lexicon-v1.md).

## Phonology workflow (implemented; native acceptance remains partial)

Open **Phonology** in a project and add phonemes with your own labels and features. Switch between consonant, vowel, and other-sound tables. Use **Syllables & phonotactics** for structured descriptive notes; these descriptions do not execute linguistic rules.

In the lexicon editor, add ordered phoneme or literal segments to an entry or form. Linked labels update when a phoneme is renamed, while free-form pronunciation text remains unchanged. A phoneme inspector shows its lexical references and opens their editors. Referenced phonemes cannot be deleted until those links are removed or replaced.

Lexicon JSON now exports version 2 with the referenced phoneme definitions; legacy version 1 remains readable. Full project archives preserve unused sounds and project-level phonology descriptions as well. See [the phonology model and limits](formats/phonology-v1.md). Linux automated migration/storage checks and bounded native IPA/link editing passed; broader and Windows acceptance remain open.

## Alphabet experiment (Part 5, awaiting native feasibility checks)

Open **Writing systems**, create a writing system, and add named characters. Import filled SVG outlines as glyph variants, choose a default variant, and optionally link phonemes. Input mappings connect exact key sequences to ordered character IDs. A restricted SVG subset is accepted; see [writing format and limits](formats/writing-v1.md).

The sample editor provides an on-screen character palette and a native input field. Preview the mapping, then insert at the logical caret. Prefixes such as `t`/`th` and conflicting mappings are explicit. Literal input preserves Unicode graphemes within that insertion. Arrows/Shift, Backspace/Delete and undo/redo operate on text units; this is not the general document editor. Pending input must be inserted or cleared before saving.

**Save writing system** persists definitions, outlines, mappings and sample text together, with backups. Replacing a glyph changes presentation while preserving symbol identities. Structured copy/paste stays within the same saved project/script; the transliteration field provides plain text for other apps and reports missing mappings. Full project archives carry the experiment's data.

Bounded Linux logical selection, clipboard and sample persistence passed. Real IME, complete SVG/font and framework comparisons, and Windows remain unverified. Known limits and the production gate are in [ADR 0003](decisions/0003-alphabet-editor-experiment.md) and [the native comparison protocol](experiments/part-5-native-checks.md). Do not treat this experiment as a finalized production editor.

## Documents and grammar (Part 6, experimental)

Open **Documents**, create a named document and add paragraphs. Each paragraph contains literal Unicode or stable characters from one saved writing system. Insert staged input or use the palette, select logical units, and optionally link a range to a dictionary entry. Edits remove intersected annotations with feedback; record undo restores text and annotations together. Add, reorder and explicitly remove paragraphs. Save/Ctrl+S uses the same snapshots, revisions and close protection as the earlier editors.

**Convert paragraph orthography** previews exact transliteration matches into another saved script. Missing or ambiguous matches require explicit replacements. Apply changes the draft; literal text and lexical identities remain. Refresh the complete document transliteration after edits.

Open **Grammar** to manage descriptive sections, free language-defined features, examples/glosses/translations, lexical/phonological references and inflection/derivation descriptions. Irregular-form records require a linked entry and an authored form. No forms are generated automatically.

Exports offer project-scoped structured JSON, or document plain text/transliteration with explicit loss disclosure. **Review structured file** loads an unsaved candidate in the same project; Save is required to apply it. A complete project archive carries dependencies for standalone transfer. Exports never overwrite an existing filename. Undo is bounded and session-local; persistent recovery is **Recover copy** from saved snapshots. Unsaved drafts do not survive forced termination.

See [document/grammar format and limitations](formats/notebook-v1.md). Full native Linux and Windows acceptance, including the preceding editor feasibility checks, remains open. Part 7 adds experimental glyph authoring as described below.

## Glyph authoring (Part 7, experimental)

In **Writing systems**, choose **Draw glyph variant** or **Edit geometry**. Add contours and line/quadratic/cubic segments, select paths and anchors/control handles, and edit points by dragging, keyboard nudges or numeric fields. Pan/zoom, snapping and baseline/metric guides help position the outline. The inspector can split curves, translate/reorder paths, change segment types and delete geometry. Undo/redo lasts while this glyph editor is open.

Reuse another variant as an independent outline copy with scale/offset, or duplicate a variant to develop an alternate design. Character and existing variant IDs survive geometry edits, so saved texts keep their links. Earlier imported outlines open directly without an automatic rewrite or database migration.

**Apply glyph to draft** updates the writing-system draft; **Save writing system** persists it with the existing backup/transaction safeguards. Pending numeric edits must be applied or reset. **Export current SVG** writes the displayed geometry through a native picker to a new filename, without implying a project save. Canvas guides and appearance are session settings, not exported font metrics.

See [glyph editing format and limitations](formats/glyph-editor-v1.md) and [validation](#verified-results). Automated geometry/component tests pass on Linux; native pointer input, export and both-platform drawing behavior remain unverified. Part 8 adds the separate font experiment below; earlier native gates remain open.

## Fonts and shaping (Part 8, experimental)

Open **Fonts & shaping** and choose a saved writing system. Review the proposed PUA assignments, set shared source/font metrics, add alternate variants, and define contextual forms, ligatures or mark-to-base anchors. Font profiles and their samples save explicitly, with revisions, snapshots and protected source references. Changing mappings or outlines preserves character IDs.

**Build current preview** generates an unhinted TrueType draft and shows reference-shaper glyphs, offsets and source ranges beside a native FontFace sample. Edit the logical character sample, select a shaped cluster’s source range, and undo/redo sample changes. LTR/RTL choices apply to a single experimental run; full bidirectional paragraphs, script-specific shaping and production visual caret behavior remain unimplemented/unverified. The Documents editor retains its earlier SVG text model.

**Export current TTF** requires entered copyright/license, an embedding choice and confirmation of outline distribution permission. It writes a new file through a native picker; it neither saves the profile nor installs the font. The bounded prototype accepts one SVG path per variant (multiple contours allowed), approximates cubic curves for TrueType, and leaves source outlines untouched. PDF export and richer script capabilities remain separately documented research pending reliable native validation.

See [font profile format and limits](formats/fonts-v1.md), [library decision](decisions/0004-font-shaping-experiment.md), and [capability matrix/native checks](experiments/part-8-font-checks.md). **No new system programs are required.** Cargo will fetch the four new libraries when installation is reauthorized. No generated font, native rendering or export has been validated. Part 9 source work is described below.

## Linguistic automation (Part 9, experimental)

Open **Rules & analysis**, create a program, and choose saved lemma or free-form pronunciation input. Define reusable affix, infix, template/reduplication, sound-change or rule-call operations. Add named inflection/derivation cells with language-defined feature bundles and ordered rule steps. Optional grapheme classes support adjacent sound-change contexts and whole-word phonotactic patterns. Entry-specific overrides require an output and explanation. Save explicitly; missing references, duplicate bundles and cycles are rejected.

Choose saved source entries and cells, then **Preview generation**. Inspect before/after steps, irregular reasons, phonotactic results and conflicts. Select eligible rows and **Apply selected results** to save a separate generated batch. Authored lexical forms are unchanged. A changed project requires a new preview. Existing authored forms or generated cells are reported rather than overwritten.

Saved batches retain their original program revision and source inputs. **Revert batch** removes its generated rows after confirmation and backup. References block program/entry deletion until released; full project archives and recover-as-copy preserve the records. Rules currently use exact Unicode graphemes; linked phoneme sequences and custom-script documents are not rewritten. Generated forms are inspected here and are not automatically promoted into authored lexicon forms.

See [automation format and limits](formats/automation-v1.md) and [the validation record](#verified-results). **No new programs or libraries are needed.** Automated Linux checks pass; native automation workflow acceptance remains open. Release preparation is described below.

## Distribution and offline operation (Part 10)

Part 10 is the final planned roadmap part. Its source preparation includes explicit Linux AppImage/Windows NSIS targets, current-user Windows installation with embedded offline WebView2 provisioning, locked build guards, separate candidate/smoke evidence, local recovery help, and release documentation. No package or public release exists yet. macOS remains outside scope.

See [release preparation](#packaging-and-distribution), [installation and recovery](#start-and-save), [known limitations](#remaining-acceptance), and [the acceptance checklist](release/CHECKLIST.md). Arch Linux is the only host with current native evidence; other target systems need testing. Linux packaging uses Ubuntu 22.04 as a provisional baseline; an Arch build does not establish portability to older distributions.

Normal application assets/fonts are bundled locally. Windows offline setup is configured but requires clean-machine validation; the build still downloads dependencies/packaging resources. Linux AppImage prerequisites must be verified per distribution. [DEPENDENCIES.md](DEPENDENCIES.md) lists `patchelf` for Linux packaging and optional FUSE compatibility for AppImage launch; Part 10 adds no npm/Cargo libraries.

Candidate scripts refuse missing locks, floating toolchains and stale bundle output, collect SHA-256 evidence into new directories, and never publish. CI is manual-only and has no lock-generation fallback. No automatic updater or remote service is configured. Manual upgrades require saved work, a complete archive and a closed app.

Font notices travel in the frontend assets and candidate evidence. A resolved transitive dependency/license audit, owner-selected application license/identity, signing, native Linux/Windows checks and reproducibility evidence remain outstanding. Automated and bounded Linux native checks pass; no complete cross-platform milestone is accepted. Continue the remaining acceptance and necessary fixes within the existing ten parts.

See [ARCHITECTURE.md](../ARCHITECTURE.md), [ROADMAP.md](../ROADMAP.md), and [docs/VALIDATION.md](VALIDATION.md) for boundaries and outstanding work.

## Start and save

Choose **New language** and select a parent folder. LingForge creates a new project folder; keep it outside the application's installation directory. Choose **Open project** to reopen that whole folder, not its individual SQLite file. Missing recent entries can be located again or forgotten without deleting data.

Edits are explicit. Use the current editor's Save action or **Ctrl+S**, then wait for confirmation before closing. Switching away from a dirty editor offers save, discard or cancel. A forced shutdown can lose unsaved drafts. Undo/redo is session-local and is not a substitute for saving or backups.

Language identities survive changes to spelling, labels and glyphs. Deleting a referenced record may be blocked until its dependencies are removed explicitly. Generated forms live in **Rules & analysis** with their saved provenance; they are separate from authored lexical forms.

## Move or back up a language

Save every current draft, return to the overview, and use **Export archive** with a new filename. A `.lingforge` archive contains a consistent snapshot of saved project data and managed assets. It excludes application preferences, recent-project paths and backup history. The app refuses to silently overwrite an existing export destination.

On the other computer, use **Import archive** and choose a parent folder. Import creates a new folder; the source archive is left alone. **Duplicate** creates an independent project identity. Keep independent backup archives outside the working folder, especially before upgrades.

Do not copy `project.sqlite3` while a project is open. Use Export archive so SQLite provides a consistent snapshot. A closed whole project folder may be moved and reopened. Simultaneous editing through a synchronized/network folder is unsupported; transfer archives between closed editing sessions instead.

## Recover

The overview's **Backups & recovery** section lists saved snapshots. Choose **Recover copy** and select a parent folder. Recovery opens a new project identity and leaves the original intact. Inspect the recovered content before continuing work.

If the original cannot open, choose **Import archive** and select a `.lingforge` file from the original folder's `backups` directory. Preserve the original folder and backup files for diagnosis. Do not edit its manifest/database or delete lock files as a repair strategy.

Automatic snapshots are taken before changed saves, so they contain the previous committed state. The newest 10 automatic snapshots are retained; manual and migration snapshots are retained separately. A failed required backup prevents the pending mutation from starting. Snapshot recovery does not recover unsaved drafts or undo history.

## Upgrade, remove or roll back

Before upgrading, save, export a complete archive with the old version and close LingForge. Keep that archive and a copy of the old application. Updates are manual: install the next Windows build or replace the Linux AppImage using its documented distribution channel and identity checks.

Opening an older project can migrate its schema after a migration snapshot. An older application cannot necessarily open the resulting project or a newly exported archive. To roll back, import the archive made by the older application into a separate folder with that application; never overwrite the migrated working project.

Keep project folders outside installation folders. Windows uninstall and Linux AppImage removal must be verified to preserve those folders before release. Decline any offered user-data cleanup when keeping local settings. Removing a recent-project listing does not delete a language. Do not remove a shared WebView2 runtime to uninstall LingForge.

## Export boundaries and support reports

Full archives are the standalone interchange format. Lexicon JSON/CSV, individual notebook JSON, text, SVG and TTF exports cover narrower scopes. Text can omit structure and custom-character identity; notebook files refer to the same project; a font contains presentation data and explicit export code points. Generated font rights must be reviewed by the author. See the linked [release limitations](#remaining-acceptance) before choosing a reduced export.

For a problem report, record the version from Preferences, exact OS/architecture, steps, expected/actual behavior, any visible error, and whether saved work reopened. Include a minimal synthetic example where possible. Review screenshots/logs for private language content and local paths before sharing. No telemetry or automatic project upload is configured, and no support mailbox/service is invented here.

## Programs by part

These are **development/build dependencies**, not programs an AppImage user must install. npm/Cargo fetch the declared libraries from the reviewed lockfiles. No new programs or application libraries were needed for the November 19 editor tests.

| Part                                      | Additional system programs                                                                                                                                                       | Libraries supplied by the project                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Desktop foundation                    | Node.js 24 LTS (24.15+), npm, Rust/Cargo through rustup, rustfmt, Clippy; platform prerequisites below                                                                           | React, TypeScript, Vite, Tauri, icons, local fonts, development/check tools                                                          |
| 2 — Projects and recovery                 | **None beyond part 1. No SQLite server or CLI is required.**                                                                                                                     | Cargo supplies bundled SQLite/rusqlite, ZIP, UUID, tempfile, filesystem locking, and native dialogs                                  |
| 3 — Lexicon                               | **None beyond part 1. No spreadsheet program or database administration tool is required.**                                                                                      | Cargo additionally supplies `csv = 1.4.0` and `unicode-normalization = 0.1.26`; no new npm packages                                  |
| 4 — Phonology                             | **None beyond part 1.**                                                                                                                                                          | No new libraries; reuses the existing Rust/SQLite/React stack                                                                        |
| 5 — Alphabet experiment                   | **None beyond part 1.** No font editor, SVG utility or database program is required to use the constrained importer.                                                             | Cargo adds `roxmltree = 0.21.2` and `unicode-segmentation = 1.13.3`; no new npm packages                                             |
| 6 — Documents and grammar                 | **None beyond part 1.**                                                                                                                                                          | No new npm or Cargo libraries; reuses the existing stack                                                                             |
| 7 — Vector glyph authoring                | **None beyond part 1.** No external vector or font editor is required.                                                                                                           | No new npm or Cargo libraries; uses the existing SVG parser, React and Rust stack                                                    |
| 8 — Fonts and shaping                     | **None beyond part 1.** No Python, FontForge, fontTools or native HarfBuzz installation is required for this implementation.                                                     | Cargo adds `write-fonts = 0.52.0`, `fea-rs = 1.0.0`, `rustybuzz = 0.20.1`, and `kurbo = 0.13.0`; no new npm packages                 |
| 9 — Morphology, sound change and analysis | **None beyond part 1.** No scripting runtime, linguistic toolkit or database program is required.                                                                                | No new npm or Cargo libraries; reuses Rust, Unicode grapheme segmentation, SQLite and React                                          |
| 10 — Release preparation                  | **Linux packaging:** `patchelf`; AppImage launch may need FUSE 2 compatibility (`fuse2` on Arch). **Windows:** no extra manually installed program beyond part 1. Details below. | No new npm or Cargo libraries; scripts use Node built-ins. Tauri obtains packaging tools/runtime payloads when builds are authorized |

Optional native automation uses tauri-driver 2.1.0 and WebKitWebDriver 2.54.2 on this Linux host, previously installed in `.local-tools/native-drivers/bin` (removed with validation tooling during the requested source cleanup; reinstall before future native automation). Windows needs a matching `msedgedriver` and native Windows testing. Playwright browser engines are separate test downloads. Python/fontTools, font sanitizers, fontconfig and an independent document application may be useful for future independent font checks; they are not required by the app.

## Verified results

Results below refer to actual executions through November 19, 2026. Passing a bounded check does not certify its entire module.

| Check                                                                | Actual result                                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisites and dependency resolution                              | Linux prerequisites available; real locks generated/reviewed; clean npm lock install passed                                                                          |
| Exact toolchains and release preflight                               | Node 24.22.3, npm 12.2.2, Rust 1.100.0 pinned; preflight passed                                                                                                      |
| Formatting, ESLint, TypeScript, Vite build                           | Passed on the final frontend source                                                                                                                                  |
| Frontend component/bridge tests                                      | 47 passed across 9 files                                                                                                                                             |
| Rust workspace tests and Clippy                                      | 87 passed, warnings denied; benchmark separately run; lean build configuration revalidated                                                                           |
| Release-tool regressions                                             | 7 passed                                                                                                                                                             |
| 10,000-entry release benchmark                                       | Passed; import with backup 232 ms, query p95 4.92 ms on this host                                                                                                    |
| Browser Chromium                                                     | 5 passed                                                                                                                                                             |
| Browser WebKit                                                       | 5 passed with isolated Ubuntu compatibility libraries and clean host GIO/GTK paths; stock Arch launch is not supported by Playwright                                 |
| Linux debug/release compilation                                      | Passed; debug cache reduced from about 9.5 to 4.0 GiB after fresh validation                                                                                         |
| Linux AppImage packaging/collection                                  | Passed; 105.59 MiB experimental candidate collected and independently hash-checked                                                                                   |
| AppImage/native Linux launch and metadata IPC                        | 34 native checks passed against both debug and packaged AppImage on XWayland with the documented NVIDIA graphics workaround                                          |
| Native preferences and Unicode input                                 | Preferences persisted; exact Unicode/multiline metadata and lexical input passed via native WebDriver                                                                |
| Native project creation/folder picker                                | User-created `test1` verified on disk; native save/backup/reopen, cancel/discard and linked-phoneme checks passed. Typed `/tmp` picker navigation remains unresolved |
| Native Windows, cross-platform transfer, installer upgrade/uninstall | Not run; Windows environment and separate acceptance needed                                                                                                          |
| Full editor/font/input/accessibility feasibility                     | Pending; Parts 5–9 remain experimental                                                                                                                               |
| Remote CI/public release                                             | Manual CI not dispatched; no release published                                                                                                                       |

The tested host is Arch Linux x86_64, kernel 7.3.4-arch1-2, KDE Wayland with XWayland native tests, GTK 3.24.52, WebKitGTK 2.54.2 and NVIDIA open driver 620.70.06. Exact Linux toolchain: Node 24.22.3, npm 12.2.2, Rust/Cargo 1.100.0. Windows has no equivalent evidence yet.

Playwright WebKit used isolated Ubuntu ABI libraries in `.local-tools/playwright-compat`, because its downloaded Ubuntu build does not launch on stock Arch. This did not replace system libraries or become an app dependency. Chromium and browser WebKit results remain separate from native WebKitGTK results.

The 10,000-entry synthetic release benchmark measured preview 32 ms, import with backup 232 ms, query p50/p95/max 4,469/4,920/5,101 µs, and reopen 174 ms. This is a warm Linux domain/storage fixture, not an end-to-end UI, sustained-load or Windows performance guarantee.

### Native coverage and evidence

Both the lean debug binary and retained AppImage passed **34 native checks**. Coverage: metadata IPC, three window sizes, eight navigation/focus routes, Unicode/multiline project save and backup, cancel/discard/reopen, lexical create/search/reload/delete, phoneme creation and linked pronunciation, protected deletion, identity-preserving rename, and deletion after unlinking. The nine editor checks add prefix waiting, longest/one-to-many mappings, ambiguous-input retention, logical Delete/undo/redo, structured clipboard, sample reload, numeric glyph editing, generated FontFace loading and profile/sample reload.

The fixture is explicitly synthetic test provisioning, not seeded user data or a native project-creation test. Native folder creation also succeeded through user interaction; typing `/tmp` in the picker remained unresolved. A clean Snap environment was used successfully, but that does not establish the cause of the picker issue.

Clipboard diagnostics found WebKit dropped Ctrl+C when two chords were combined into one driver value command. Separate commands passed. Numeric glyph editing correctly snapped (20,90) to (25,100) at the default grid. Both were corrected test expectations/driver interactions, not application fixes. The generated-font screenshot shows two small simple glyphs: the 100-unit outlines used the default 1,000-unit source em. This establishes basic loading/rendering, not final visual quality or full shaping equivalence.

| Evidence                         | Retained location, relative to repository                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| Final debug 34-check report      | `docs/evidence/linux-debug-native-34.json`                                 |
| Final AppImage 34-check report   | `docs/evidence/linux-appimage-native-34.json`                              |
| Original candidate provenance    | `docs/evidence/linux-candidate-0.1.0.json`                                 |
| Website browser verification     | `docs/evidence/website-chromium.json`, `docs/evidence/website-webkit.json` |
| Requested generated-file cleanup | `docs/evidence/source-cleanup.json`                                        |

The numerical frontend/Rust/release/browser/benchmark results above remain historical executed results. Their bulky/raw logs, screenshots, test profiles, duplicate candidate documents and tool caches were removed after extracting compact evidence. The candidate record retains the original build paths/hashes; the same AppImage bytes now live in `website/downloads/`. Generated debug/release binaries were removed with `target/`. Rebuild before further app testing; do not interpret absent old outputs as new passing results.

Application fixes from initial execution included dependency/type compatibility, ZIP/rusqlite API compatibility, font-library version alignment, FontFace failure handling and save-callback dependencies. Reviewed real lockfiles and exact pins are retained. Later editor work changed only the test fixture/harness and documentation. Earlier failed attempts were not counted as passes; their transient diagnostics were removed during the requested cleanup.

### Remaining acceptance

1. Complete native document/grammar and automation flows, including saved references, generation provenance, explicit selected apply and batch reversal.
2. Exercise native archive/import/export/recover-as-copy and failed/cancelled operations; validate cross-platform transfer and preservation of existing destinations/data.
3. Finish both editor comparison protocols: [alphabet](experiments/part-5-native-checks.md) and [font/shaping](experiments/part-8-font-checks.md), including real OS IME, framework comparison, pointer drawing, richer shaping and accessibility.
4. Run the required suites and workflows on Windows/WebView2, then clean-machine Windows install/upgrade/uninstall/offline runtime checks. Test the AppImage on each intended Linux distribution and desktop.
5. Complete the [release evidence checklist](release/CHECKLIST.md), including support scope, licenses/notices, publisher identity/signing, final-artifact verification and upgrade/rollback behavior. No public release has been published or certified.

Parts 1–10 have source implementations. Parts 5–9 remain experimental; planned functions remain labeled. There is no new numbered roadmap part. The next work is verification/fixes and release preparation within the existing scope.

## Build storage

Debug output contains compiled dependencies, test executables, symbols and incremental caches. The original roughly 9.5 GiB debug cache fell to about 4.0 GiB after lean debug profiles and unused library outputs were removed and checks rerun. Another 888.54 MiB of redundant downloads/install/build staging was removed on November 18. Three completed editor profiles (993,599 bytes) were removed on November 19 after exclusive locks and SQLite integrity/reference checks. Reports/screenshots and current binaries were preserved. Current disk usage may grow with later builds.

### Cleanup and tradeoffs

Stop builds and close any application using a debug binary before cleaning. From the project root:

```bash
cargo clean --profile dev --dry-run
cargo clean --profile dev
```

This removes development/test build artifacts while preserving the release directory. The next development build/test run takes longer because dependencies must be recompiled; downloaded Cargo sources and npm packages are separate caches. Keep language projects outside `target`, since Cargo treats that directory as disposable output.

`cargo clean` without a profile removes all Cargo output, including binaries and bundles under `target/release`. Preserve a wanted installer first. Collected artifacts under `release-candidates/`, source, lockfiles and validation logs are outside Cargo's cleanup directory.

| Location              | Purpose                                                                | How it is recreated                                                             |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `target/debug/`       | Development binaries, tests, symbols and compiler cache                | Development build or Rust tests                                                 |
| `target/release/`     | Optimized binaries, compiler cache and bundle staging                  | Release build/packaging                                                         |
| `dist/`               | Bundled frontend assets                                                | `npm run build`                                                                 |
| `node_modules/`       | Installed JavaScript dependencies/tools                                | `npm ci`                                                                        |
| `.local-tools/`       | Optional local validation tools/downloads and disposable install check | Repeat the relevant tool setup; keep needed verification evidence separately    |
| `test-results/`       | Test reports, screenshots and disposable native profiles               | New tests produce new evidence; historical evidence cannot be recreated exactly |
| `release-candidates/` | Collected installers, hashes and their documentation                   | New packaging attempts create new directories; preserve wanted candidates       |

For full variable/type debugging on a particular build, set `CARGO_PROFILE_DEV_DEBUG=2` (and `CARGO_PROFILE_TEST_DEBUG=2` for tests). To trade some rebuild speed for less compiler state, set `CARGO_INCREMENTAL=0`. These changes trigger recompilation and can temporarily leave several artifact variants until the next cleanup. Avoid adding several target directories unless separate builds are needed; that duplicates caches.

The shipped app does not need Node, npm, Rust, `node_modules`, or `target/debug`. Native runtime dependencies and the tested Linux graphics workaround are separate from build-cache storage.

## Packaging and distribution

Linux packages use AppImage; Windows is configured for current-user NSIS with offline WebView2 provisioning, which remains unverified. The current Arch-built AppImage does not establish older Ubuntu compatibility. Manual CI has not been dispatched. Run `npm run release:preflight`, the checks above, and `npm run release:package` for a fresh candidate; packaging does not run or certify the tests itself.

## Candidate evidence and failure handling

`npm run release:preflight` checks required input files, direct npm lock consistency, application version agreement, exact active Node/npm/Rust versions, native x64 GNU Linux/MSVC Windows hosts, and explicit platform bundle settings. Cargo's own locked build remains authoritative for its dependency graph. These guards do not constitute a security or license audit.

`npm run release:package` accepts no configuration/target overrides and refuses a pre-existing `target/release/bundle`. It never deletes earlier output. Preserve previous evidence and use a fresh checkout/build directory when that guard stops a run. Do not set `CARGO_TARGET_DIR`, `CARGO_BUILD_TARGET` or `TAURI_CONFIG` for this entry point; avoid local Cargo configuration that changes target/output paths.

The script starts a unique directory under `release-candidates/`, invokes `npm run desktop:build -- --ci -- --locked`, requires one platform installer, and copies it without overwriting another artifact. Collection includes:

- `candidate.json`: application/platform/architecture, actual tool versions, host version, SHA-256 hashes of locks/configuration, artifact bytes/hash, build-binary hash, and CI commit/run identifiers when supplied by the runner.
- The installer, reviewed lockfiles, bundled notices, project documentation, referenced test-only fixtures and a `build-workflow.yml` copy. Fixtures are documentation/verification inputs and are never seeded into user projects.
- `STARTED.txt` at the beginning, `COLLECTED.txt` only after successful collection, and `failure.json` when a handled failure occurs. An interrupted directory without the completion marker is incomplete even if it contains some files.

Input hashes are compared before and after building. Local collection does not attest that all source files were unchanged or that a Git tree was clean; record the commit/working-tree state in the checklist. `unverified-candidate` is deliberate: passing a build does not imply tests, installer behavior, signatures, licensing or support approval. Hashes establish file identity, not publisher trust. Signing or otherwise changing an installer invalidates its old hash and requires fresh evidence for the final bytes.

Lockfiles and pins reduce dependency drift; they do **not** yet establish reproducible or byte-identical artifacts. Hosted runner images, system packages, packaging utilities, embedded WebView2 downloads and signing timestamps can vary. Record their versions/download hashes and rebuild the same source on a second clean runner, comparing differences. Pin/archive external inputs before claiming reproducibility.

## Distribution policy

The retained Linux artifact is a private experimental candidate. Public release is not authorized by writing Part 10 source. Keep version `0.1.0` and `app.lingforge.desktop` provisional until the owner confirms the public application identity and license; changing identity after release can separate the catalog and installer upgrade paths.

Updates are **manual and optional**: save, export a complete archive, close the app, verify the next release, then replace/install. There is no update endpoint, background download, mandatory account or updater key. Never silently downgrade a project database. Retain the archive made by the older version for a rollback into a separate folder. A newer archive is not a downgrade mechanism.

Public Windows distribution requires an owner-approved publisher/signing arrangement, an Authenticode signature on the final executable/installer, and verification on a clean machine. Configure certificate/timestamp options only with the real approved identity; keep private material outside source. See [Tauri's Windows signing guide](https://v2.tauri.app/distribute/sign/windows/). For Linux, select and document the publisher's artifact/checksum-signing method and trusted verification channel before publishing. No fake identity or signing secret is configured. Signing tools and key custody remain a release-owner decision.

No project-wide license has been selected on the owner's behalf. Audit the resolved npm/Cargo graph, native bundled libraries, packaging runtimes and all fonts; preserve required notices in the distributed artifact. The current `public/licenses` directory covers UI fonts and direct font-tool notices, **not** a completed transitive audit. Record package/version/source, license expression, included notice path, modifications and disposition for every shipped component. Development-only tools should be identified separately. Generated-font rights come from the user's outlines/metadata and are not granted by LingForge's dependency notices.

Do not advertise support or publish until the checklist has evidence and remaining experimental/planned scope is disclosed in release notes. Automated results are recorded separately; signatures and clean-machine acceptance are still pending.

## Technical reference

These documents are maintained engineering contracts, not alternative user guides or progress diaries. Keep them when changing formats or implementation.

- [Architecture](../ARCHITECTURE.md): boundaries, security, identity and storage design.
- [Roadmap status](../ROADMAP.md): the ten authorized parts and current disposition.
- [Project/storage](formats/project-v1.md), [lexicon](formats/lexicon-v1.md), [phonology](formats/phonology-v1.md).
- [Writing](formats/writing-v1.md), [notebook/grammar](formats/notebook-v1.md), [glyph editing](formats/glyph-editor-v1.md), [fonts](formats/fonts-v1.md), [automation](formats/automation-v1.md).
- Decisions: [desktop](decisions/0001-desktop-foundation.md), [storage](decisions/0002-project-storage.md), [alphabet](decisions/0003-alphabet-editor-experiment.md), [fonts](decisions/0004-font-shaping-experiment.md), [automation](decisions/0005-bounded-linguistic-automation.md).
- Native acceptance protocols: [alphabet](experiments/part-5-native-checks.md), [fonts](experiments/part-8-font-checks.md), [release checklist](release/CHECKLIST.md).
- [Bundled notices](../public/licenses/README.md) must accompany redistributed fonts/components.

The small README, dependency, validation and release entry files point here to preserve tooling and contributor entry paths. Superseded dated narratives and duplicate user/release notes have been removed. The compact candidate provenance retains its original build record; duplicate candidate documentation was removed during the requested cleanup. Application source, maintained test sources/fixtures, user data, the retained AppImage bytes and required notices remain intact.

## Download website and source cleanup

The user separately authorized a GitHub Pages website and removal of unnecessary generated files. The site lives in `website/`; [its publishing guide](../website/README.md) explains local preview, GitHub Release asset upload and the manual Pages workflow. It adds no application dependency and does not change LingForge’s feature scope or acceptance status. Python 3 is used for optional preview/site packaging; browsers need only the static files.

The only retained application binary is `website/downloads/LingForge_0.1.0_amd64.AppImage`. It is ignored by Git and excluded from the Pages artifact; public downloads use a matching GitHub Release. Nothing has been published by this local task. The website labels experimental and planned capabilities accurately.

Requested cleanup removes `target/`, `node_modules/`, `dist/`, `.local-tools/`, `test-results/`, duplicate `release-candidates/` and generated Tauri schemas, plus temporary website build output. They are compiled output, installed dependencies, diagnostics or caches. Maintained tests in `src`, `crates`, `scripts` and `tests/` remain part of the actual source and regression protection. Environment-managed `.git`, `.agents`, `.codex` and `.aws` remain untouched. The running mounted AppImage was preserved and not closed.

Development now requires `npm ci` and normal locked Cargo builds to recreate dependencies/output. Optional browser/native verification tools also need reinstalling. Source size and reclaimed bytes are recorded in `docs/evidence/source-cleanup.json`; runtime data and important language projects are not cleanup targets.
