# Glyph authoring adapter, Part 7

Status (2026-11-19): Experimental glyph adapter contract. Linux automated checks and bounded numeric native edit/persistence pass; full pointer/drawing/export and Windows acceptance remain open. No additional system programs or libraries are required. See the [current guide](../GUIDE.md#verified-results) for actual evidence and limits.

## Identity, storage and earlier outlines

Glyph authoring reuses the existing `GlyphOutline { viewBox, paths }` inside a writing-system variant. SQLite remains **schema 6** and the project container remains format 1. No migration or extra asset store is needed. Character IDs, variant IDs, mappings, sample units and document units are untouched by geometry editing. A duplicated variant receives a fresh Rust-generated UUID under the same character. Selecting a new default changes presentation, not character identity.

Rust parses existing absolute M/L/Q/C/Z paths into a typed editor adapter. It preserves path order, command order, multiple Move subpaths, open contours, closure commands, and valid drawing commands after Close. The shared parser still enforces the earlier constrained language and bounds. It does not approximate curves or convert them to polygons. Earlier imports remain stored verbatim when opened/decoded; closing or applying an unchanged existing model retains the original outline strings. An edited model is encoded with explicit commands and canonical numeric spacing, preserving its represented coordinates and order. All documents continue resolving the same character and default variant.

The adapter is transient and rejects unknown fields:

```json
{
  "viewBox": [0, 0, 1000, 1000],
  "paths": [
    [
      { "kind": "move", "points": [[100, 800]] },
      {
        "kind": "cubic",
        "points": [
          [100, 200],
          [800, 200],
          [800, 800]
        ]
      },
      { "kind": "close", "points": [] }
    ]
  ]
}
```

Each path starts with Move. Move/Line have one endpoint; Quadratic has a control point and endpoint; Cubic has two controls and an endpoint; Close has no points. Coordinates are finite and within ±100,000. ViewBox width and height are positive. There are at most 32 paths and 2,048 commands per path. An empty path list is allowed only in an unfinished editor draft; Apply/export require the existing nonempty outline contract and 64 KiB total encoded path bound.

## Geometry operations

Four session-checked commands provide decode, edit, encode and native SVG export. Rust validates the model before and after each geometry operation. Operations create paths, append contours/segments, move a point, delete commands/paths, reorder paths, translate a path, change a segment type, split a segment, change the viewBox and insert a component copy. They return a new model; failure leaves the previous draft and numeric fields available.

Line, quadratic and cubic drawing tools append endpoints to the selected path. When there is no selected path, the first endpoint starts a path with Move. New contour appends Move within the selected path, while Start separate path clears the selection so the next point creates a separate filled path. All path elements use nonzero fill. Opposite winding within a single path can form holes; independently filled path elements do not subtract from each other. Automatic boolean geometry, intersections, winding repair and stroke expansion are not implemented.

New curves start with controls on the straight line between their endpoints. Changing segment type also resets controls to that line and is disclosed in the UI. Splitting uses linear interpolation/de Casteljau subdivision at the requested parameter, preserving the curve; the UI offers its halfway split. The segment's start is tracked through Move and Close commands, including imported multi-contour paths. Initial Move deletion is rejected if it would leave a non-Move start; whole-path deletion remains available.

Moving a handle or anchor changes that point only. There is no hidden tangent coupling or automatic smoothing. Whole-path translation moves every anchor/control. Snapping rounds coordinates to a grid about the global (0, 0) origin; zero disables it. Rust is authoritative for the snapped result and rejects nonfinite/out-of-range edits. Pointer movement is a transient visual preview; pointer release requests one validated operation and one history step. Pointer cancellation, lost capture or Escape discards the geometry preview. The last pointer event determines the final requested position.

## Canvas and keyboard workflow

Open Writing systems and choose **Draw glyph variant** or **Edit geometry**. Choose a mode explicitly: Select points, Pan, New contour, Line, Quadratic curve or Cubic curve. Select paths/commands/points through the accessible inspector as an alternative to canvas picking. Endpoints appear on the selected path; control handles appear for the selected command.

- Drag an anchor/control to move it. Arrows nudge the selected point by the snap grid, or one unit when snapping is off; Shift multiplies by ten.
- Pan uses a pointer drag or arrows. Zoom buttons and +/− zoom about the view center; 0/Fit viewBox restores the stored frame. Geometry does not change with pan/zoom.
- Numeric operation selects point position/next endpoint, path translation, viewBox editing or component insertion. Apply numeric edit validates it through Rust. Enter in these fields applies that edit, never submits the writing-system form. Reset fields abandons unapplied numbers.
- Pending numeric edits disable conflicting selection/tools/history/export/Apply actions. Closing prompts before discarding them. Failed operations preserve them for correction.
- Ctrl+Z/Y in the canvas and Undo/Redo geometry restore full typed geometry. Native numeric fields retain their own text-edit behavior.

History is session-local, capped at 30 snapshots and an estimated 8 MiB serialized UTF-16 size per direction. It is reset on closing the glyph editor; no persistent undo is claimed. Guides and view settings do not enter geometry history. Save, snapshots and recovery are separate mechanisms.

## Guides and reusable designs

Baseline, ascender, descender and advance guides are configurable and labeled. Snap grid can be disabled or use the offered unit steps. Ink/graphite canvas backgrounds and standard/high guide contrast use the shared neutral/crimson palette. Dense grid lines are hidden at small zoom levels while snapping remains active. Keyboard focus, reduced-motion behavior and forced-color styles remain present; their actual accessibility requires native verification.

Guide positions, background, contrast, grid, pan and zoom are settings for this editor session. They are not persisted glyph metrics and do not appear in SVG. The stored viewBox does affect glyph framing. Font advance widths, baselines and OpenType metrics belong to Part 8 and are not fabricated here.

Any existing glyph variant in the current writing-system draft can act as a reusable outline component. Insertion copies its ordered paths, scales all points about (0, 0), then applies an offset in destination coordinates. Scale must be positive and at most 1,000. Source viewBox values do not resize or normalize the destination. The result is an independent editable copy, not a live reference: changing/removing the source does not alter the copy. This avoids cycles and accidental changes to dependent designs. A dedicated component library/live-instance system is outside this initial implementation. Duplicate variant provides an alternative design with a new variant ID while keeping the character identity and existing default.

## Apply, save, export and recovery

The glyph dialog owns an independent working model. **Apply glyph to draft** encodes it and updates only the chosen variant's outline (or adds the explicitly created variant). It does not save the project. **Save writing system** then uses the existing expected revision, single-writer lock, graph validation, pre-write snapshot and transaction. If validation or a backup fails, the draft is retained. The common editor guard treats an open glyph editor as pending work; writing-system save requires it to be applied or closed. Explicit discard resets the nested editor as well. Normal close/navigation prompts remain; forced termination can lose unapplied or unsaved drafts.

**Export current SVG** validates the displayed geometry and opens a Rust native save picker. It exports that explicit draft, not an implied saved database record. The file contains only an SVG namespace, viewBox, ordered path data and black fill. Original XML, visible names, scripts, external references, IDs and view guides are never interpolated. Numeric tokens are deterministic Rust representations, negative zero is written as zero, and spacing/order are stable. Nonzero fill is the SVG default and matches the canvas.

Export output is UTF-8 with LF line endings. It must fit the complete 64 KiB SVG import limit, including XML overhead. Some previously valid near-limit stored outlines therefore need simplification before export; nothing is silently truncated. Successful exports can be reimported through the existing constrained importer. No arbitrary-SVG fidelity or retained original source markup is claimed.

Files publish through a synced temporary sibling and no-clobber rename. Existing destinations remain unchanged; picker cancellation reports no success. Full project archives retain glyphs together with script, document and grammar dependencies. Recovery continues to create a new project copy. See [writing-v1.md](writing-v1.md), [project-v1.md](project-v1.md) and [VALIDATION.md](../VALIDATION.md).
