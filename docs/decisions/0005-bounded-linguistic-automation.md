# ADR 0005 — Bounded linguistic automation with separate generated batches

Historical design decision: authorization and execution statements below describe the decision date. Current requirements/results are maintained in the [guide](../GUIDE.md); execution has been authorized since 2026-11-17. The technical decisions remain applicable unless explicitly superseded.

Date: 2026-11-12. Status: experimental source; no execution evidence.

Part 9 is authorized while the earlier execution restriction and native gates remain open. This implementation reuses Rust, serde, Unicode grapheme segmentation and SQLite. It introduces no dependency or system-program requirement.

Rules operate on explicitly chosen saved lemma or free-form pronunciation text. Exact Unicode grapheme matching is a bounded first representation; it does not reinterpret linked phoneme sequences, infer articulatory categories, normalize spelling, or treat glyph codes as linguistic identities. Program-owned features/classes and all rule/cell references have stable IDs. The earlier Grammar module remains descriptive.

Affixes, infixes, ordered rewriting, templates/slices and stem repetition provide distinct authoring strategies. Template fixtures include nonconcatenative root patterns and reduplication. There is no universal typology claim or automatic stem/root analysis. Referencing another rule provides reuse with complete cycle/depth checks. Phonotactic alternatives use bounded position-set matching rather than a backtracking expression engine. No arbitrary code, regex, plugin interpreter or external file access is needed.

Generated forms are stored in separate immutable batches with complete program/source snapshots and traces. This avoids mixing derived state into authored lexical forms or silently deciding how to overwrite irregular work. Applying selected eligible preview rows is a single snapshot-backed transaction. Reverting a batch removes only its derived rows/projections. Full archives/recovery preserve provenance.

Explicit conflicts include authored form labels/output, an existing generated cell, evaluation errors and failed phonotactics. The host owns a frozen, session/revision-bound preview; the webview sends only the token and selected row indices on Apply. A changed project requires a fresh preview. There is no implicit regenerate or replace-existing path.

The costs are deliberate: generated forms are inspected in Rules & analysis, rather than becoming editable lexicon forms automatically; batch reversal is whole-batch; historical provenance is immutable and can refer to old labels; program-owned features are not automatically synchronized with descriptive Grammar definitions. Separate future work can introduce reviewed promotion, phoneme-ID operations or richer analysis when warranted.

Persistence validates the current reference graph and exact projections on open. Batch replay checks saved derivations against their frozen source/program, not current spelling. Only active overrides and generated source entries impose live lexical dependencies; unrelated overrides retained in a historical program snapshot are archival context. Their IDs may name entries subsequently removed after active references are released.

See [automation format and limits](../formats/automation-v1.md) and [validation record](../VALIDATION.md). Native Linux/Windows behavior, migration, fault recovery, performance and every authored fixture remain unverified.
