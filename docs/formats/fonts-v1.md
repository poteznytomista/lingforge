# Experimental font profiles and schema 7

Status (2026-11-19): Experimental font/shaping contract. Linux automated checks and bounded native FontFace build/load/profile reload pass; advanced native shaping/export and Windows acceptance remain open. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Stored contract and identity

Schema 7 adds `font_profiles(script_id, revision, data_json)`: at most one profile per saved writing system, with a restrictive foreign key to that script. JSON is authoritative and rejects unknown fields. It holds family/copyright/license, an embedding enum, shared metrics, a list of glyph export records, ordered contextual rules, ligatures, a character-ID sample and an explicit single-run direction. There is no executable feature source, imported font binary, external path or automatic font installation in a project.

Every glyph record references **both character UUID and variant UUID**. `codepoint` is an optional export scalar; null means an unencoded alternate. Rule operands reference variant UUIDs, while sample items reference character UUIDs. Transient OpenType glyph numbers and PUA assignments never replace those identities. Renaming, changing outlines, changing mappings and reordering glyph records do not rewrite the sample or documents. Font rules affect presentation, not lexical or document content.

One glyph record looks like:

```json
{
  "characterId": "00000000-0000-4000-8000-000000000010",
  "variantId": "00000000-0000-4000-8000-000000000100",
  "codepoint": 57344,
  "advance": 1000,
  "mark": false,
  "anchor": [500, 800]
}
```

Use **Fonts & shaping** and choose a saved writing system. With no existing profile, this explicit action proposes default/first variants and BMP PUA values starting at U+E000 by character position. The proposal is unsaved. Existing profiles are never regenerated automatically, including when characters are added or their defaults change. Add saved variants explicitly; remove old mappings/rules deliberately. Removing a font row does not remove its source variant, and dependent sample/rule references are reported rather than silently deleted.

Mapping fields accept decimal values, `U+E000` or `0xE000`; a blank field means unencoded. Invalid text is retained across glyph pages and blocks save, preview and export until corrected. This input syntax does not change the stored integer-or-null contract.

## Metrics and geometry conversion

Shared metrics are `unitsPerEm`, positive ascender, nonpositive descender, nonnegative lineGap, `sourceEm` and `sourceBaseline`. Both em sizes are 16–16384. The ascender–descender span plus gap must fit 32767 units. All rows have an advance in font units; left side bearings come from the outline bounds.

For every variant, `xFont = xSource × unitsPerEm/sourceEm` and `yFont = (sourceBaseline − ySource) × unitsPerEm/sourceEm`. SVG viewBoxes remain framing metadata and do not rescale glyphs independently. Part 7 guides stay session-only; they are not silently promoted into font metrics. Anchors are already in font coordinates, with y pointing up.

The prototype accepts **one SVG path element per variant**, which may contain multiple contours. Independent SVG paths paint separately; combining opposite-winding overlapping paths into a single TrueType glyph could cancel filled regions. Those multi-path outlines are rejected pending an explicit boolean-union workflow. Existing source data is left intact. Open contours close for filling, as in the source SVG; drawing after Close begins a new contour at the previous subpath start.

Lines and quadratics pass through the typed adapter. Cubics are subdivided into quadratics: the difference curve's control hull bounds error to 0.5 font unit before integer rounding. Conversion is bounded to depth 16; excessive complexity fails instead of truncating. Converted points must fit ±16000 font units, avoiding coordinate/delta overflow. Integer rounding introduces additional sub-unit error. Source outlines are never rewritten. The generated font is unhinted and monochrome; small-size raster quality and winding/fill agreement require native visual checks.

## OpenType layout experiment

`lingforge-font` builds conventional TrueType tables through Fontations `write-fonts`. `fea-rs` compiles only generated, bounded FEA syntax into GSUB/GPOS/GDEF. Names in that syntax are generated `g1`, `g2`, etc.; authored labels/license text cannot become feature code. Its resolver serves one in-memory source and rejects every other path, so feature compilation cannot read project-supplied files.

- Contextual forms compile to ordered `calt` lookups: an exact input variant, up to four neighbors on either side, and one replacement. At least one neighbor is required. All operands are non-marks. Duplicate contexts and unchanged replacements are rejected. Later rules may observe earlier output; this is bounded lookup processing, not a recursive rule engine.
- Ligatures compile to `liga`, with 2–8 input variants and one output. Longer inputs are emitted first. Each output belongs to one rule; duplicate inputs are rejected. No internal visual ligature caret positions are synthesized.
- A single mark class compiles to GDEF plus `mark` positioning. Marks require zero advance and an origin anchor; at least one non-mark base needs an attachment anchor. No mark stacking, mark-to-ligature component anchors, cursive attachment or automatic collision avoidance is implemented. Ligature outputs cannot carry base anchors in this model.

These are explicit generic rules. They do not infer joining classes, viramas, syllable structure or a natural language's shaping behavior from names or PUA values. See [the capability matrix and native protocol](../experiments/part-8-font-checks.md).

## Preview, source selection and direction

Build current preview compiles the current profile draft against the loaded saved script revision. A changed script revision is rejected. The Rust reference run uses `rustybuzz`, the existing HarfBuzz port, with the generic unknown script (OpenType DFLT), an explicit LTR/RTL direction, and monotone-character clusters. Input cluster values are source-character indices. The result reports glyph numbers, variant UUIDs, half-open source ranges, advances and offsets. Cluster ranges are not claimed to be legal grapheme/visual caret positions.

The palette and logical source controls edit the profile's character-ID list. Numeric boundaries, click/Shift-click, arrows/Shift-arrows, deletion and 50-step session-local sample undo/redo operate on source characters. Selecting a shaping-result row selects its complete reported source interval. This permits inspecting a ligature without deleting IDs from the model. Undo history is not persisted, and restoring references removed elsewhere in the draft can require correction before saving.

A second view loads **only the generated font** through an in-memory `FontFace`; no remote font URLs, new asset permissions or installed fonts are involved. This readonly native textarea provides platform rendering/selection observations. It uses an explicit directional override for a single run, including PUA characters whose Unicode direction would otherwise remain LTR. The platform may choose a different shaper/script/normalization path from the reference run. Font load failures are visible; fallback text is not reported as successful generated-font rendering. Rebuilding/replacing/unmounting a preview releases its FontFace; editing any profile field invalidates the old preview.

**RTL single-run inspection is not bidirectional paragraph support.** Logical/visual cursor affinity, mixed numbers/punctuation/scripts, bidi isolates, grapheme boundaries and IME still require a production text model and native fixtures. PUA marks do not gain Unicode combining/bidi properties merely because GDEF calls them marks. Encoded-text copy loses LingForge identities and requires the exact corresponding font elsewhere. The Documents editor continues its earlier logical-LTR/SVG behavior.

## Save, migration, deletion and recovery

Save checks session token, loaded script revision and expected profile revision, validates the entire profile against saved characters/variants, snapshots first, then writes the profile and project revision in one immediate transaction. No-op saves keep revisions and create no backup. All reference edges are inside the bounded profile JSON, which is revalidated on open and before writing-system edits; no secondary projection is needed. Removing a referenced character/variant or deleting a script with a profile is blocked. Explicitly remove the relevant references/profile first. Geometry/label changes keep references valid.

Migration 6 → 7 creates an empty table after a migration snapshot. Existing records are not rewritten. Full archives, duplication and recover-as-copy include profiles and outlines through the SQLite snapshot. Manifest/archive container version remains 1. Font settings alone are not a standalone interchange format; use full archives for lossless transfer and recovery. Shared busy/session guards, native-close prompts and failed-draft retention remain. Forced termination can lose unsaved edits.

## Export and rights

Export current TTF uses the current explicit profile draft and saved outline revision, revalidates/builds before the Rust native picker, and publishes through a synced temporary sibling with no-clobber behavior. Cancellation writes nothing and reports no success. Export is not a profile/project save, does not install a font, and does not overwrite a previous filename.

The font carries family, regular-style naming, a script-ID-based ASCII PostScript name, fixed experimental version metadata, copyright/license strings and OS/2 embedding flags. The default is Restricted; Preview and print, Editable, and Installable are explicit choices. Copyright/license must be nonempty and the user must confirm outline distribution permission for each export draft. These metadata settings do not grant rights to imported artwork. No existing UI font or third-party glyph outline is incorporated in the generated font.

OS/2 weight and width are explicitly Regular (400) and Normal (5). Windows ascent/descent include outline bounds and possible mark-to-base offsets to reduce clipping; authored typographic ascender/descender/line gap remain unchanged. Overflow is rejected. Actual line layout and clipping still require platform verification.

Output is a single unhinted `.ttf`, capped at 4 MiB. Required metrics, cmap, glyf/loca, maxp, name, post and layout tables are emitted; supplementary PUA mappings are supported by the cmap builder. Fixed metadata and ordered inputs support deterministic output, which still needs its authored regression test to run. External apps may cache an installed font under its stable family/PostScript name; update/reinstall behavior needs platform verification. PUA text is project-specific, and the font contains no recoverable LingForge document/character identity graph.

PDF export remains deferred: no embedded-font subsetter, ToUnicode/ActualText mapping, text layout, accessibility or embedding-permission round trip has been validated. No functioning-looking PDF control is exposed. Vertical text, color/variable fonts, hinting, arbitrary font import, kerning, contextual language systems and general complex-script editing remain outside this prototype.

## Bounds

- At most 32 profiles (one per script), 1 MiB JSON per profile, and 512 distinct referenced variants.
- At least one mapped character; unique valid scalar assignments, at most one encoded variant per character. Controls, whitespace, joiners/bidi controls, variation selectors, tags and noncharacters are excluded from this initial mapping UI. Export mapping is not a keyboard mapping.
- Family at most 63 Unicode scalars; copyright 2048; license 8192. Rights text is stored as plain text, not rendered markup.
- At most 128 contextual rules and 128 ligatures; 256 sample characters; 2048 shaped output glyphs.
- At most 1024 contours/16000 points per compiled glyph, 262144 total points, ±16000 transformed outline coordinates; 4 MiB compiled bytes.
- Whole-project, script-outline, archive and database limits remain in force. Complex valid source outlines can exceed the stricter font limits without becoming invalid saved writing-system data.
