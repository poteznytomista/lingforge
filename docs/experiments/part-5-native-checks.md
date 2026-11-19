# Part 5 native editor feasibility protocol

Status (2026-11-19): execution was authorized on 2026-11-17 and foundational Linux checks have passed. Bounded custom-adapter native checks are in progress; this complete comparison protocol and both-platform production gate remain unfinished. See [current evidence](../GUIDE.md).

Use disposable projects. Record OS, CPU, display scaling, Rust/Node versions, webview version, build commit or source snapshot, input method and exact observed behavior. No cells below represent a pass.

## Compare two editor adapters

The current custom adapter is the Writing systems experiment. After dependency execution is authorized, implement a separate minimal ProseMirror harness with paragraph/text nodes and an inline character node carrying only `characterId`. Keep it out of production navigation. Use the same character definitions and the same semantic fixtures as the custom adapter, and translate framework positions explicitly to/from the domain model. Select and pin compatible package versions at that point; no framework package has been added yet.

For each adapter, exercise:

1. Create a small alphabet with two overlapping key sequences (`t`, `th`), aliases and a mapping to two characters. Add an equal input with a different output; verify ambiguity is visible and no partial insertion occurs.
2. Type slowly/quickly, explicitly commit a shorter prefix, insert spaces/newlines, backspace pending input, paste text into the input field, and insert unmapped characters in literal mode.
3. Use an actual OS input method (not only synthetic composition events). Compose a multi-keystroke character, move focus, press Enter, cancel composition, and try Ctrl+S/native close during composition. Confirm no premature conversion or duplicate insertion.
4. Exercise caret movement, Shift range selection, select all, Delete/Backspace, insertion in the middle, Home/End, undo/redo and the undo limit. Compare logical and visible selection, keyboard-only access, screen-reader output and focus restoration. Evaluate the lack of drag selection/visual-line navigation in the custom candidate.
5. Mix characters, IPA, decomposed marks, emoji sequences, spaces and newlines. Insert a combining mark separately from its base; explicitly evaluate the custom candidate's separate-unit limitation. Test partial selections near surrogate pairs and atomic symbols in the framework candidate.
6. Copy/cut/paste within the same saved script; reject wrong-project/script and malformed structured payloads. Test system clipboard failures and ordinary-text pastes. Compare with explicit plain transliteration and confirm missing mappings never produce silently truncated output.
7. Replace a glyph and its default variant while text exists; verify symbol IDs and text remain identical. Save/relaunch, reopen, archive/import and recover a copy. Check pending-input guards and failed-save draft retention.
8. Use the 4,096-unit sample limit and maximum representative outline sizes. Record typing latency, layout/scroll behavior, memory and undo cost. Do not invent target timings or infer responsiveness from compilation.

## Compare presentation adapters

Use an SVG outline fixture and a properly licensed, local font fixture representing the same trial symbols. Font preparation remains deferred; do not require a font editor for ordinary use of the current prototype. Keep any PUA mapping in the harness adapter, separate from character identity.

Compare glyph replacement, cursor/selection metrics, missing-glyph indication, scaling, clipping, baseline placement, clipboard output and accessibility. Record whether font shaping changes character/selection behavior. The current experiment uses SVG only and cannot claim the font-backed comparison has occurred.

| Evidence                       | Browser Chromium               | Browser WebKit                 | Native Linux / WebKitGTK | Native Windows / WebView2 |
| ------------------------------ | ------------------------------ | ------------------------------ | ------------------------ | ------------------------- |
| Custom adapter input/selection | Not run                        | Not run                        | Not run                  | Not run                   |
| Real IME and native close      | Not applicable as native proof | Not applicable as native proof | Not run                  | Not run                   |
| Framework candidate            | Not authored/run               | Not authored/run               | Not authored/run         | Not authored/run          |
| Clipboard and loss reporting   | Not run                        | Not run                        | Not run                  | Not run                   |
| SVG/font comparison            | Not run                        | Not run                        | Not run                  | Not run                   |
| Persistence/recovery fixtures  | Not native storage proof       | Not native storage proof       | Not run                  | Not run                   |
| Large sample and accessibility | Not run                        | Not run                        | Not run                  | Not run                   |

## Production decision record

Complete only after evidence exists: chosen adapter; rejected alternatives with measured reasons; limitations; Unicode adjacency and position rules; clipboard contract; SVG/font choice; accessibility results; data migration needs; unresolved failures; supported native environments. Update ADR 0003 and the roadmap. Part 5's runtime gate remains incomplete until this record is supported by both native platforms; part 6 must not silently bypass it.

## Bounded Linux observations — 2026-11-19

The current custom adapter passed native prefix/longest/one-to-many input, ambiguity retention, logical selection/Delete/undo/redo, structured copy/paste and sample reload checks in both debug and AppImage runs. Numeric glyph editing preserved the sample identities, and a two-character generated font loaded in the separate font lab. See [the full evidence and limits](../GUIDE.md). This is partial coverage of the custom candidate only: it does not complete this matrix, framework comparison, real OS IME or Windows validation.
