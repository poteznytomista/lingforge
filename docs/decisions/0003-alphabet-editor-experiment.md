# ADR 0003 — Alphabet editor experiment

Historical design decision: authorization and execution statements below describe the decision date. Current requirements/results are maintained in the [guide](../GUIDE.md); execution has been authorized since 2026-11-17. The technical decisions remain applicable unless explicitly superseded.

Date: 2026-11-05. Status: **provisional, experimental; no production editor decision approved by runtime evidence**.

Part 5 is authorized for source work. Application execution remains deferred by the user. The roadmap requires Linux/WebKitGTK and Windows/WebView2 feasibility checks before building the production document editor. This ADR selects a bounded experiment and a canonical identity model; it does not waive those gates or establish a tested editor architecture.

## Candidate comparison

| Concern            | Structured framework candidate: ProseMirror                                              | Current narrow experiment                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Stored content     | Schema nodes; character IDs in custom inline symbol nodes; Unicode text nodes            | A small sequence of stable character references and literal grapheme units                       |
| Selection          | Framework translates browser selection into model positions                              | Explicit logical unit caret/range; arrows, Shift, Home/End, mouse boundary selection             |
| Input and IME      | Integration with contenteditable and custom node views must be exercised in each webview | A visible native textarea stages input; conversion is disabled during composition                |
| Undo               | Framework transactions/history; symbol boundaries need fixtures                          | Last 50 text edits in memory; definitions and text save together; history is not persisted       |
| Clipboard          | Custom schema serialization and paste validation needed                                  | Versioned structured text with project/script IDs; explicit plain transliteration for other apps |
| Glyph presentation | Custom inline node view for SVG or font adapter                                          | React creates only SVG/path nodes from validated geometry; text stores no glyph code point       |
| Expansion          | Candidate for paragraphs, formatting and richer document operations                      | Deliberately limited alphabet scratchpad; not a general document editor                          |
| Dependencies       | Additional editor packages and integration surface                                       | Existing React/Tauri plus two Rust libraries for XML and grapheme boundaries                     |

ProseMirror supports custom schemas and attributes, and its view coordinates browser selection with model selection. Those features make it a credible candidate, but are not proof of correct native behavior for LingForge's symbols. Sources: [schema guide](https://github.com/ProseMirror/website/blob/master/markdown/guide/schema.md), [view guide](https://github.com/ProseMirror/website/blob/master/markdown/guide/view.md).

The custom experiment isolates linguistic identity and mapping behavior while keeping IME entry in a native text control. It does not emulate a full browser text editor. In particular, it has no drag selection, visual-line navigation, cross-insertion grapheme merging, paragraph layout, contextual shaping, RTL editing, or document history across sessions. Literal units are graphemes within each insertion; separately inserted combining marks remain separate units. These are known limits, not passed feasibility results.

## Identity and rendering

Script, character, mapping and glyph-variant IDs are distinct. A character has an optional default glyph variant; all its sample-text occurrences resolve that current variant. Replacing an outline therefore changes appearance without rewriting text. A glyph variant is not itself a linguistic character. Per-occurrence glyph overrides are not part of this experiment.

SVG and font rendering are adapters over the same character IDs. The alphabet/document editor uses constrained monochrome SVG outlines. A font adapter maps character IDs to glyphs, with optional project-specific PUA assignments for external interoperability. Neither a PUA scalar nor an OpenType glyph index may become canonical identity. Part 8 subsequently adds an experimental font adapter in a separate lab; font-backed document editing and the integrated comparison remain deferred and unmeasured. Ordinary Unicode text uses the existing bundled fonts. See the [SVG path specification](https://www.w3.org/TR/SVG2/paths.html).

Original SVG markup is discarded after strict parsing. Stored outlines are domain geometry, not opaque managed assets. Existing immutable SQLite asset blobs retain their format and semantics. A dedicated resource browser and general vector/font tooling remain outside this limited experiment.

## Input contract

- Exact, case-sensitive mappings; no implicit Unicode normalization or transliteration guessing.
- Longest input match wins. `t` remains pending while `th` could still match; explicit Insert/Enter commits an exact shorter match.
- Whitespace delimits mappings and is retained as literal units. Unknown input remains in the staging field with an explanation. Insert applies the entire resolved input or nothing.
- Equal inputs with different outputs produce an ambiguity error. The user can revise the mappings or insert an explicit character from the palette. Multiple aliases and ordered one-to-many outputs are supported.
- Backspace in the staging textarea uses native editing; Backspace/Delete in the structured view removes logical units/ranges. Undo/redo applies to inserted text, independently of the textarea's native editing history.
- Composition start/end and the native composing flag guard conversion; Ctrl+S and navigation cannot discard uncommitted input silently. [UI Events composition specification](https://www.w3.org/TR/uievents/#events-compositionevents).
- Plain transliteration reports missing mappings and suppresses incomplete output. It is not a lossless round trip; structured copy preserves character IDs.

## Decision gate

Run [the comparison protocol](../experiments/part-5-native-checks.md) after execution is reauthorized. A production decision needs actual results for the custom candidate and a minimal framework candidate on both native webviews, plus SVG/font presentation comparison. No framework package was installed and no framework runtime prototype was executed in this turn.

Do not treat the persisted experiment as the final document model. Before Part 6 is treated as a production editor, decide the editor adapter, any normalization of adjacent Unicode units, clipboard interoperability, selection accessibility, and a migration for experimental data if the chosen representation changes. Assess Electron only if measured webview limitations justify a stack change.

## Part 6 source authorization

On 2026-11-05 the user explicitly requested Part 6. Its document/grammar source extends the same experimental representation while execution remains deferred. This authorization supersedes the earlier source sequencing restriction, not the production gate. The new pages label their status, preserve stable identities and expose the current editing limitations. The framework/font comparison and both-platform native checks are still mandatory before finalizing the editor or trusting important content. See [notebook-v1.md](../formats/notebook-v1.md).

Part 7 was explicitly authorized for source work on 2026-11-06. Its vector authoring adapter preserves the existing outline and character identity contract; it adds no custom-font shaping or evidence that the text editor is production-ready. Both text and drawing workflows remain experimental pending native checks. See [glyph-editor-v1.md](../formats/glyph-editor-v1.md).

## Part 8 source authorization

The user explicitly authorized Part 8 on 2026-11-06. The separate experimental font/shaping lab supplies source and fixtures for future font comparisons; it does not establish editor feasibility, reauthorize execution or replace this provisional document model. PDF and full complex-script/bidi editing remain gated. See [ADR 0004](0004-font-shaping-experiment.md).
