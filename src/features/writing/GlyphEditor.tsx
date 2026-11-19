import { useState } from 'react';
import * as api from '../../bridge/glyph';
import type { GlyphOutline } from '../../bridge/writing';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { GlyphCanvas } from './GlyphCanvas';
import { GlyphNumbers } from './GlyphNumbers';
import {
  selectedPoint,
  type GlyphSelection,
  type GlyphTool,
} from './glyphGeometry';

interface ComponentSource {
  id: string;
  label: string;
  outline: GlyphOutline;
}
function history(items: api.EditableOutline[]) {
  const kept: api.EditableOutline[] = [];
  let bytes = 0;
  for (const item of items.slice(-30).reverse()) {
    bytes += JSON.stringify(item).length * 2;
    if (bytes > 8 * 1024 * 1024) break;
    kept.unshift(item);
  }
  return kept;
}
export function GlyphEditor({
  initial,
  original,
  title,
  components,
  workspace,
  onApply,
  onClose,
}: {
  initial: api.EditableOutline;
  original: GlyphOutline | null;
  title: string;
  components: ComponentSource[];
  workspace: WorkspaceController;
  onApply: (outline: GlyphOutline) => void;
  onClose: () => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const [model, setModel] = useState(initial);
  const [past, setPast] = useState<api.EditableOutline[]>([]);
  const [future, setFuture] = useState<api.EditableOutline[]>([]);
  const [selection, setSelection] = useState<GlyphSelection | null>(
    initial.paths.length ? { path: 0, command: 0, point: 0 } : null,
  );
  const [tool, setTool] = useState<GlyphTool>('select');
  const [panel, setPanel] = useState<
    'position' | 'translate' | 'frame' | 'component'
  >('position');
  const [componentId, setComponentId] = useState('');
  const [pending, setPending] = useState(false);
  const [gesture, setGesture] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [grid, setGrid] = useState(25);
  const [background, setBackground] = useState('ink');
  const [contrast, setContrast] = useState('standard');
  const [guides, setGuides] = useState({
    baseline: initial.viewBox[1] + initial.viewBox[3] * 0.8,
    ascender: initial.viewBox[1] + initial.viewBox[3] * 0.2,
    descender: initial.viewBox[1] + initial.viewBox[3],
    advance: initial.viewBox[0] + initial.viewBox[2],
  });
  const [discarding, setDiscarding] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const changed = JSON.stringify(model) !== JSON.stringify(initial);
  const blocked = workspace.busy || gesture;
  const locked = blocked || pending;
  const path = selection ? model.paths[selection.path] : undefined;
  const command = selection ? path?.[selection.command] : undefined;
  const point = selectedPoint(model, selection);
  const component = components.find((c) => c.id === componentId);
  const resetFields = () => {
    setPending(false);
    setEpoch((n) => n + 1);
  };
  const select = (next: GlyphSelection | null) => {
    if (!locked) {
      setSelection(next);
      resetFields();
    }
  };
  const accept = (next: api.EditableOutline) => {
    if (JSON.stringify(next) !== JSON.stringify(model)) {
      setPast((items) => history([...items, model]));
      setFuture([]);
      setModel(next);
      setExported(null);
    }
    resetFields();
    if (
      selection &&
      !next.paths[selection.path]?.[selection.command]?.points[selection.point]
    ) {
      const pathIndex = Math.max(
        0,
        Math.min(selection.path, next.paths.length - 1),
      );
      setSelection(
        next.paths.length ? { path: pathIndex, command: 0, point: 0 } : null,
      );
    }
  };
  const operate = (
    operation: api.GlyphOperation,
    after?: (next: api.EditableOutline) => void,
  ) => {
    if (workspace.busyRef.current) return;
    void workspace.run(
      () => api.editGlyph(sessionId, model, operation),
      (next) => {
        accept(next);
        after?.(next);
      },
    );
  };
  const place = (position: api.Point) => {
    if (tool === 'pan') return;
    if (tool === 'select') {
      if (selection && point)
        operate({ kind: 'move_point', ...selection, position, grid });
      else workspace.setError('Select a point or choose a drawing tool.');
      return;
    }
    if (!selection || !path)
      operate({ kind: 'new_path', position, grid }, (next) =>
        setSelection({ path: next.paths.length - 1, command: 0, point: 0 }),
      );
    else
      operate(
        { kind: 'append', path: selection.path, segment: tool, position, grid },
        (next) => {
          const commandIndex = (next.paths[selection.path]?.length ?? 1) - 1;
          setSelection({
            path: selection.path,
            command: commandIndex,
            point:
              (next.paths[selection.path]?.[commandIndex]?.points.length ?? 1) -
              1,
          });
        },
      );
  };
  const restore = (redo: boolean) => {
    if (locked) return;
    const stack = redo ? future : past;
    const next = stack.at(-1);
    if (!next) return;
    if (redo) {
      setFuture(stack.slice(0, -1));
      setPast((items) => history([...items, model]));
    } else {
      setPast(stack.slice(0, -1));
      setFuture((items) => history([...items, model]));
    }
    setModel(next);
    setSelection(next.paths.length ? { path: 0, command: 0, point: 0 } : null);
    setExported(null);
    resetFields();
  };
  const close = () => {
    if (changed || pending) setDiscarding(true);
    else onClose();
  };
  const labels =
    panel === 'position'
      ? ['Point X', 'Point Y']
      : panel === 'translate'
        ? ['Translate X', 'Translate Y']
        : panel === 'frame'
          ? ['ViewBox X', 'ViewBox Y', 'ViewBox width', 'ViewBox height']
          : ['Component X offset', 'Component Y offset', 'Component scale'];
  const values =
    panel === 'position'
      ? (point ?? [
          model.viewBox[0] + model.viewBox[2] / 2,
          model.viewBox[1] + model.viewBox[3] / 2,
        ])
      : panel === 'frame'
        ? model.viewBox
        : panel === 'component'
          ? [0, 0, 1]
          : [0, 0];
  const numeric = (v: number[]) => {
    if (v[0] === undefined || v[1] === undefined) return;
    if (panel === 'position') place([v[0], v[1]]);
    if (panel === 'translate' && selection)
      operate({
        kind: 'translate_path',
        path: selection.path,
        offset: [v[0], v[1]],
      });
    if (panel === 'frame' && v[2] !== undefined && v[3] !== undefined)
      operate({ kind: 'view_box', viewBox: [v[0], v[1], v[2], v[3]] });
    if (panel === 'component' && component && v[2] !== undefined)
      operate({
        kind: 'component',
        outline: component.outline,
        offset: [v[0], v[1]],
        scale: v[2],
      });
  };
  return (
    <>
      <ConfirmDialog
        title={`Edit glyph · ${title}`}
        busy={blocked}
        onCancel={close}
      >
        <div className="glyph-editor">
          <p className="field-description">
            EXPERIMENTAL · PART 07. Apply places geometry in the writing-system
            draft; Save writing system persists it with a snapshot. Character
            and variant identities stay unchanged. Export writes only the
            displayed geometry, without saving the project.
          </p>
          {workspace.error && (
            <p role="alert" className="inline-error">
              {workspace.error}
            </p>
          )}
          {exported && (
            <p role="status">Current geometry exported to {exported}</p>
          )}
          <div className="glyph-toolbar" aria-label="Glyph tools">
            {(
              ['select', 'pan', 'move', 'line', 'quadratic', 'cubic'] as const
            ).map((name) => (
              <OutlineButton
                key={name}
                disabled={locked}
                aria-pressed={tool === name}
                onClick={() => {
                  setTool(name);
                  setPanel('position');
                  resetFields();
                }}
              >
                {name === 'move'
                  ? 'New contour'
                  : name === 'quadratic'
                    ? 'Quadratic curve'
                    : name === 'cubic'
                      ? 'Cubic curve'
                      : name === 'line'
                        ? 'Line'
                        : name === 'pan'
                          ? 'Pan'
                          : 'Select points'}
              </OutlineButton>
            ))}
            <OutlineButton
              disabled={locked || model.paths.length >= 32}
              onClick={() => {
                setSelection(null);
                setTool('move');
                setPanel('position');
                resetFields();
              }}
            >
              Start separate path
            </OutlineButton>
          </div>
          <p className="field-description">
            New contour starts with Move inside the selected path; Start
            separate path creates another filled path. Drawing tools append
            endpoints; a curve starts straight until its handles move. Paths use
            nonzero fill, so opposite contour winding can make holes within one
            path.
          </p>
          <div className="project-action-row">
            <OutlineButton
              disabled={locked || !past.length}
              onClick={() => restore(false)}
            >
              Undo geometry
            </OutlineButton>
            <OutlineButton
              disabled={locked || !future.length}
              onClick={() => restore(true)}
            >
              Redo geometry
            </OutlineButton>
            <OutlineButton
              disabled={locked || !selection}
              onClick={() => {
                if (selection)
                  operate({
                    kind: 'append',
                    path: selection.path,
                    segment: 'close',
                    position: [0, 0],
                    grid: 0,
                  });
              }}
            >
              Close contour
            </OutlineButton>
          </div>
          <GlyphCanvas
            model={model}
            selection={selection}
            tool={tool}
            grid={grid}
            guides={guides}
            background={background}
            contrast={contrast}
            disabled={locked}
            onSelect={select}
            onPlace={place}
            onMove={(s, position) =>
              operate({ kind: 'move_point', ...s, position, grid })
            }
            onGesture={setGesture}
            onUndo={() => restore(false)}
            onRedo={() => restore(true)}
          />
          <div className="glyph-inspector">
            <label className="editor-field">
              Selected path
              <select
                value={selection?.path ?? ''}
                disabled={locked}
                onChange={(e) =>
                  select(
                    e.target.value === ''
                      ? null
                      : { path: Number(e.target.value), command: 0, point: 0 },
                  )
                }
              >
                <option value="">No path selected</option>
                {model.paths.map((p, i) => (
                  <option key={i} value={i}>
                    Path {i + 1} · {p.length} commands
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Selected command
              <select
                value={selection?.command ?? ''}
                disabled={locked || !path}
                onChange={(e) => {
                  if (selection)
                    select({
                      ...selection,
                      command: Number(e.target.value),
                      point: 0,
                    });
                }}
              >
                {path?.map((c, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {c.kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Selected point
              <select
                value={selection?.point ?? ''}
                disabled={locked || !command?.points.length}
                onChange={(e) => {
                  if (selection)
                    select({ ...selection, point: Number(e.target.value) });
                }}
              >
                {command?.points.map((_, i) => (
                  <option key={i} value={i}>
                    {i === command.points.length - 1
                      ? 'Anchor'
                      : `Control ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="project-action-row">
              <OutlineButton
                disabled={locked || !selection}
                onClick={() => {
                  if (selection)
                    operate({
                      kind: 'delete_command',
                      path: selection.path,
                      command: selection.command,
                    });
                }}
              >
                Delete command
              </OutlineButton>
              <OutlineButton
                disabled={locked || !selection}
                onClick={() => {
                  if (selection)
                    operate({ kind: 'delete_path', path: selection.path });
                }}
              >
                Delete path
              </OutlineButton>
              <OutlineButton
                disabled={locked || !selection || selection.path === 0}
                onClick={() => {
                  if (selection)
                    operate(
                      {
                        kind: 'reorder_path',
                        path: selection.path,
                        to: selection.path - 1,
                      },
                      () =>
                        setSelection({
                          ...selection,
                          path: selection.path - 1,
                        }),
                    );
                }}
              >
                Move path earlier
              </OutlineButton>
              <OutlineButton
                disabled={
                  locked ||
                  !selection ||
                  selection.path >= model.paths.length - 1
                }
                onClick={() => {
                  if (selection)
                    operate(
                      {
                        kind: 'reorder_path',
                        path: selection.path,
                        to: selection.path + 1,
                      },
                      () =>
                        setSelection({
                          ...selection,
                          path: selection.path + 1,
                        }),
                    );
                }}
              >
                Move path later
              </OutlineButton>
            </div>
            <div className="project-action-row">
              {(['line', 'quadratic', 'cubic'] as const).map((kind) => (
                <OutlineButton
                  key={kind}
                  disabled={
                    locked ||
                    !command ||
                    command.kind === 'move' ||
                    command.kind === 'close' ||
                    command.kind === kind
                  }
                  onClick={() => {
                    if (selection)
                      operate({
                        kind: 'change_segment',
                        path: selection.path,
                        command: selection.command,
                        segment: kind,
                      });
                  }}
                >
                  Change to {kind}
                </OutlineButton>
              ))}
              <OutlineButton
                disabled={
                  locked ||
                  !command ||
                  command.kind === 'move' ||
                  command.kind === 'close'
                }
                onClick={() => {
                  if (selection)
                    operate({
                      kind: 'split_segment',
                      path: selection.path,
                      command: selection.command,
                      t: 0.5,
                    });
                }}
              >
                Split segment halfway
              </OutlineButton>
            </div>
            <p className="field-description">
              Splitting preserves the curve. Changing its type resets controls
              to a straight segment; undo restores them. Delete a whole path to
              remove its initial Move. Every gesture is one history step;
              history lasts only while this glyph editor is open (30 steps and 8
              MiB per direction).
            </p>
            <label className="editor-field">
              Numeric operation
              <select
                value={panel}
                disabled={locked}
                onChange={(e) => {
                  setPanel(e.target.value as typeof panel);
                  resetFields();
                }}
              >
                <option value="position">Point position / next endpoint</option>
                <option value="translate">Translate selected path</option>
                <option value="frame">Edit viewBox</option>
                <option value="component">Insert reusable outline copy</option>
              </select>
            </label>
            {panel === 'component' && (
              <>
                <label className="editor-field">
                  Reusable glyph
                  <select
                    value={componentId}
                    disabled={locked}
                    onChange={(e) => {
                      setComponentId(e.target.value);
                      resetFields();
                    }}
                  >
                    <option value="">
                      Choose a glyph from this writing system
                    </option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-description">
                  Copies all source paths in source coordinates, scales about
                  (0, 0), then translates. The copy is independent; later edits
                  to its source do not change this glyph. Save reusable designs
                  as glyph variants.
                </p>
              </>
            )}
            <GlyphNumbers
              key={`${epoch}-${panel}-${selection?.path}-${selection?.command}-${selection?.point}`}
              labels={labels}
              values={values}
              disabled={
                blocked ||
                (panel === 'translate' && !selection) ||
                (panel === 'component' && !component) ||
                (panel === 'position' && tool === 'pan')
              }
              onPending={setPending}
              onApply={numeric}
            />
            {pending && (
              <p role="status" className="field-description">
                Apply or reset numeric fields before another operation, export,
                or Apply glyph.
              </p>
            )}
          </div>
          <details className="glyph-view-settings">
            <summary>Canvas guides and appearance</summary>
            <p className="field-description">
              Guide positions, grid, background, pan and zoom are view settings
              for this editor session. They do not create font metrics or enter
              SVG exports. The saved viewBox controls glyph framing.
            </p>
            <div className="glyph-setting-grid">
              <label className="editor-field">
                Snap grid
                <select
                  value={grid}
                  disabled={locked}
                  onChange={(e) => setGrid(Number(e.target.value))}
                >
                  <option value="0">Off</option>
                  {[1, 5, 10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} units
                    </option>
                  ))}
                </select>
              </label>
              <label className="editor-field">
                Canvas background
                <select
                  value={background}
                  disabled={locked}
                  onChange={(e) => setBackground(e.target.value)}
                >
                  <option value="ink">Ink</option>
                  <option value="graphite">Graphite</option>
                </select>
              </label>
              <label className="editor-field">
                Guide contrast
                <select
                  value={contrast}
                  disabled={locked}
                  onChange={(e) => setContrast(e.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </label>
              {(['baseline', 'ascender', 'descender', 'advance'] as const).map(
                (name) => (
                  <label className="editor-field" key={name}>
                    {name === 'advance'
                      ? 'Advance guide X'
                      : `${name[0]?.toUpperCase()}${name.slice(1)} guide Y`}
                    <input
                      type="number"
                      step="any"
                      min={-100000}
                      max={100000}
                      disabled={locked}
                      value={guides[name]}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault();
                      }}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (Number.isFinite(n) && Math.abs(n) <= 100000)
                          setGuides({ ...guides, [name]: n });
                      }}
                    />
                  </label>
                ),
              )}
            </div>
          </details>
          <div className="dialog-actions">
            <OutlineButton disabled={blocked} onClick={close}>
              Close glyph editor
            </OutlineButton>
            <OutlineButton
              disabled={locked || !model.paths.length}
              onClick={() =>
                void workspace.run(
                  () => api.exportGlyph(sessionId, model),
                  (path) => {
                    if (path) setExported(path);
                  },
                )
              }
            >
              Export current SVG
            </OutlineButton>
            <OutlineButton
              tone="accent"
              disabled={locked || !model.paths.length}
              onClick={() => {
                if (!changed && original) onApply(original);
                else
                  void workspace.run(
                    () => api.encodeGlyph(sessionId, model),
                    onApply,
                  );
              }}
            >
              Apply glyph to draft
            </OutlineButton>
          </div>
        </div>
      </ConfirmDialog>
      {discarding && (
        <ConfirmDialog
          title="Discard glyph edits?"
          busy={blocked}
          onCancel={() => setDiscarding(false)}
        >
          <p>
            Close without applying this geometry and any pending numeric fields?
            The writing-system draft keeps its previous outline.
          </p>
          <div className="dialog-actions">
            <OutlineButton onClick={() => setDiscarding(false)}>
              Keep editing glyph
            </OutlineButton>
            <OutlineButton disabled={blocked} onClick={onClose}>
              Discard glyph edits
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
