# Release evidence checklist

This is an unchecked evidence template, not the live results table. See [current verification](../GUIDE.md#verified-results). Copy it into each candidate evidence directory and record actual outcomes on the final Linux/Windows artifacts; passing automated checks alone does not complete release acceptance.

## Identify the candidate

| Field                                                         | Evidence |
| ------------------------------------------------------------- | -------- |
| Version, source commit and working-tree state                 | Pending  |
| Candidate directory / CI run URL                              | Pending  |
| Artifact filename, bytes and SHA-256                          | Pending  |
| Final installed/bundled executable SHA-256                    | Pending  |
| Lock/config hashes and exact Node/npm/Rust/Cargo              | Pending  |
| Packaging tool versions and external download hashes          | Pending  |
| OS edition/version/build, architecture, locale                | Pending  |
| Desktop/display server, graphics, scaling, memory and storage | Pending  |
| WebKitGTK/WebView2 version and optional WebDriver versions    | Pending  |
| Tester, date, commands, log/screenshot paths                  | Pending  |
| Signing/identity and transitive notice audit                  | Pending  |

Use disposable projects/accounts. A Windows Server CI build does not establish Windows 11 desktop behavior. Browser Chromium/WebKit checks do not establish native WebView2/WebKitGTK behavior. Test installation on a machine without the development toolchain.

## Build and package

- [ ] Repaired prerequisites, reviewed genuine lockfiles, exact toolchain pins and initial formatting recorded.
- [ ] `npm ci`, release preflight, `npm run check`, `npm run test:release` and `npm run check:rust` succeed on each build host; logs retained.
- [ ] Browser checks run against production assets, with Chromium/WebKit results recorded separately.
- [ ] One intended artifact per platform collected from a fresh bundle directory; no incomplete marker state or stale artifact selected.
- [ ] Source/version, asset/license contents, artifact/binary hashes and external tool/runtime download versions inspected.
- [ ] Same source rebuilt on a clean runner; differences explained. No reproducibility claim until external input variability is controlled.
- [ ] Final signatures and publisher identity verified after packaging/signing; final hashes recalculated and matched to the tested bytes.

## Windows NSIS / WebView2

- [ ] Install as a standard user on the selected Windows 11 build; verify installed version, shortcuts, current-user scope and normal launch without a terminal.
- [ ] In a clean test image without WebView2, disconnect networking before installer launch. Verify the embedded installer provisions WebView2 and LingForge starts. Do not remove a shared runtime from a personal machine to create this test.
- [ ] Repeat with an existing runtime, changed runtime version, non-ASCII user path, restricted permissions and cancelled setup. Record elevation prompts and behavior.
- [ ] Confirm the installed application, not the development binary, runs the native smoke check and opens/saves a disposable connected project.
- [ ] Upgrade from an actual previous build with the same identity. If no prior build exists, create a labeled internal fixture and leave public-upgrade support unclaimed. Verify metadata, IDs, references, catalog and saved data.
- [ ] Test running-app upgrade/cancellation; no silent loss of drafts. Keep full archives outside the installation directory.
- [ ] Uninstall, decline any optional user-data cleanup, and verify external project folders/archives remain byte-identical. Record catalog behavior; do not assume NSIS preserves it without inspection.
- [ ] Reinstall and reopen the preserved project; ensure shared WebView2 and other applications remain usable.

## Linux AppImage

- [ ] Test the Ubuntu-baseline artifact on each advertised distribution/desktop, including the development Arch machine; capture exact runtime versions and missing shared-library errors.
- [ ] Launch through the file manager after granting executable permission through its UI; no terminal needed for ordinary use. Record any FUSE compatibility prerequisite and its offline availability.
- [ ] Repeat with network disabled, non-ASCII paths, spaces, X11/Wayland as claimed, standard permissions and scaling changes. Extraction fallback alone does not satisfy normal-launch acceptance.
- [ ] Verify native IPC with production CSP and the artifact's bundled binary. A `target/release/lingforge` smoke run alone is insufficient.
- [ ] Open/save, close, replace the AppImage with the next build, and reopen a disposable connected project with IDs/references intact.
- [ ] Remove only the application file through the file manager; confirm project folders, archives and catalog remain. Reinstall/reopen without data loss.

## Data durability and compatibility

Follow the complete [storage/feature validation record](../VALIDATION.md); the following are release gates, not replacements for those procedures.

- [ ] Save/restart/reopen every authored record type, outlines, samples, font profiles, rule programs and generated batches; compare stable IDs and references through renames/glyph changes.
- [ ] Migrate real or clearly labeled historical schema 1–7 fixtures to schema 8. Verify a pre-migration snapshot, complete transaction rollback on failure, future-schema refusal, and no modification of rejected input.
- [ ] Verify automatic/manual/migration backup content and retention. A pre-save snapshot must contain the previous committed state.
- [ ] Exercise Recover copy and import from `backups` when the original cannot open. Original folder remains unchanged; recovered project identity changes and internal identities/references remain valid.
- [ ] Transfer full archives Linux → Windows → Linux; compare all content including generated provenance, managed assets and font-profile references. Test narrower exports with disclosed losses.
- [ ] Exercise stale session/revision/preview, two writers, external folder moves while closed, missing recents, read-only folders, disk full, failed backup, interruption during transaction/export/migration and malformed archives. Failed operations must retain drafts and avoid false success.
- [ ] No-clobber exports leave existing destinations unchanged. Archive bounds/allowlists and native picker cancellation behave as specified.
- [ ] Downgrade uses a retained older-version archive in a separate folder; newer schema is never silently rewritten for an older app.

## Native text, access and interface

- [ ] Complete [Part 5 feasibility](../experiments/part-5-native-checks.md), Parts 6–7 integration and [Part 8 font checks](../experiments/part-8-font-checks.md) on both native webviews. Any unpassed capability remains experimental or is excluded from the release scope.
- [ ] Keyboard-only workflows: skip link, all pages, forms, modal focus/escape/return, Ctrl+S, Ctrl+B, Ctrl+comma, save/discard/cancel and native window close.
- [ ] Preferences help is reachable, expandable by keyboard and readable offline; development/experimental labels match release scope.
- [ ] 640×480, 1280×720 and 1920×1080 windows; maximum interface text size; 100%, 150% and 200% OS scaling; long names and Unicode; no clipped primary actions or inaccessible controls.
- [ ] Visible focus, contrast, forced colors/high contrast, reduced motion, screen-reader labels/order/live feedback and native dialog access. Automated accessibility checks supplement manual inspection.
- [ ] IPA and combining sequences, IME composition, grapheme selection/deletion, clipboard and undo/redo have native evidence; no unsupported bidi/complex-script claim inferred from one RTL font sample.
- [ ] Network disconnected during normal project creation/edit/save/export/recovery and all help/font display. Inspect application requests separately from OS-managed runtime updates.
- [ ] No console/bridge errors, fake records, misleading save/export success or unlabeled planned controls.

## Performance and capacity

Use synthetic fixtures within documented bounds. Record fixture seed/source, entry/record/glyph/batch counts, database/asset sizes, hardware, cold/warm runs and peak memory. Do not substitute a limit in source for a measured capacity guarantee.

| Scenario                                      | Metric                                                                      | Linux   | Windows |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------- | ------- |
| Empty and connected project startup           | Cold/warm time to usable UI; peak memory                                    | Not run | Not run |
| 10,000-entry lexicon                          | Existing benchmark query p50/p95/max, import/reopen and interaction latency | Not run | Not run |
| Documents and glyphs near allowed bounds      | Edit/undo/save latency; frame/interaction stalls                            | Not run | Not run |
| Font compilation/shaping near limits          | Time, memory, UI responsiveness/cancellation behavior                       | Not run | Not run |
| 64-result automation preview and batch replay | Time, memory, trace availability; reopen cost with retained batches         | Not run | Not run |
| Large database/managed assets within limits   | Snapshot/save/recovery duration, disk growth/retention                      | Not run | Not run |

- [ ] Establish acceptable measured budgets on the chosen reference machines; fix hangs/unbounded growth, disclose long blocking operations, and retest affected flows. No performance numbers are promised yet.

## Distribution decision

- [ ] Exact OS/architecture support list is derived from recorded tests, with unsupported platforms clearly excluded.
- [ ] Feature matrix, known limitations, migration behavior, offline install/runtime distinctions and manual update instructions match actual artifacts.
- [ ] Owner has chosen the application identity, redistribution license and signing arrangement. Dependency/font/runtime notices cover the resolved shipped graph and are included in artifacts.
- [ ] Retained archives, previous builds and recovery instructions cover the upgrade path. No forced update or data upload is introduced.
- [ ] All unresolved issues have an explicit owner/scope decision; an unresolved native/data-integrity gate prevents a public release claim.
- [ ] Owner explicitly authorizes publication of the concrete verified artifacts through an identified channel. This document is not publication authorization.

Final disposition: **Pending; no public release candidate approved.**
