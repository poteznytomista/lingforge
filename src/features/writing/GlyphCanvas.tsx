import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { EditableOutline, Point } from '../../bridge/glyph';
import { OutlineButton } from '../../components/primitives';
import {
  pathData,
  previewPoint,
  starts,
  type GlyphSelection,
  type GlyphTool,
} from './glyphGeometry';

type Frame = EditableOutline['viewBox'];
interface Drag {
  id: number;
  inverse: DOMMatrix;
  start: Point;
  frame: Frame;
  selection: GlyphSelection | null;
}
export function GlyphCanvas({
  model,
  selection,
  tool,
  grid,
  guides,
  background,
  contrast,
  disabled,
  onSelect,
  onPlace,
  onMove,
  onGesture,
  onUndo,
  onRedo,
}: {
  model: EditableOutline;
  selection: GlyphSelection | null;
  tool: GlyphTool;
  grid: number;
  guides: {
    baseline: number;
    ascender: number;
    descender: number;
    advance: number;
  };
  background: string;
  contrast: string;
  disabled: boolean;
  onSelect: (s: GlyphSelection) => void;
  onPlace: (p: Point) => void;
  onMove: (s: GlyphSelection, p: Point) => void;
  onGesture: (active: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{
    selection: GlyphSelection;
    point: Point;
  } | null>(null);
  const [frame, setFrame] = useState<Frame>(model.viewBox);
  const pattern = `glyph-grid-${useId().replace(/:/g, '')}`;
  const shown = preview
    ? previewPoint(model, preview.selection, preview.point)
    : model;
  const radius = Math.max(frame[2], frame[3]) / 110;
  const visibleGrid = grid > 0 && grid >= Math.max(frame[2], frame[3]) / 120;
  const pointAt = (event: PointerEvent, inverse: DOMMatrix): Point | null => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      inverse,
    );
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return [
      Math.max(-100000, Math.min(100000, point.x)),
      Math.max(-100000, Math.min(100000, point.y)),
    ];
  };
  const cancel = () => {
    drag.current = null;
    setPreview(null);
    onGesture(false);
  };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled || drag.current || event.button !== 0 || !event.isPrimary)
      return;
    const matrix = ref.current?.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    const point = pointAt(event, inverse);
    if (!point) return;
    event.preventDefault();
    ref.current?.focus();
    const element = event.target instanceof SVGElement ? event.target : null;
    if (tool !== 'select' && tool !== 'pan') {
      onPlace(point);
      return;
    }
    let picked: GlyphSelection | null = null;
    if (tool === 'select' && element?.dataset.path !== undefined) {
      picked = {
        path: Number(element.dataset.path),
        command: Number(element.dataset.command ?? 0),
        point: Number(element.dataset.point ?? 0),
      };
      onSelect(picked);
      if (element.dataset.point === undefined) return;
    }
    if (tool === 'select' && !picked) return;
    drag.current = {
      id: event.pointerId,
      inverse,
      start: point,
      frame,
      selection: picked,
    };
    ref.current?.setPointerCapture(event.pointerId);
    onGesture(true);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const position = pointAt(event, current.inverse);
    if (!position) {
      cancel();
      return;
    }
    if (current.selection)
      setPreview({
        selection: current.selection,
        point:
          grid > 0
            ? (position.map((n) =>
                Math.max(
                  -100000,
                  Math.min(
                    100000,
                    Math.sign(n / grid) * Math.round(Math.abs(n / grid)) * grid,
                  ),
                ),
              ) as Point)
            : position,
      });
    else
      setFrame([
        current.frame[0] + current.start[0] - position[0],
        current.frame[1] + current.start[1] - position[1],
        current.frame[2],
        current.frame[3],
      ]);
  };
  const up = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    // Use the final event, not a possibly batched pointermove render.
    const position = pointAt(event, current.inverse);
    cancel();
    if (ref.current?.hasPointerCapture(event.pointerId))
      ref.current.releasePointerCapture(event.pointerId);
    if (
      position &&
      current.selection &&
      (position[0] !== current.start[0] || position[1] !== current.start[1])
    )
      onMove(current.selection, position);
  };
  const zoom = (factor: number) =>
    setFrame((old) => {
      const width = old[2] / factor;
      const height = old[3] / factor;
      if (width < model.viewBox[2] / 32 || width > model.viewBox[2] * 10)
        return old;
      return [
        old[0] + (old[2] - width) / 2,
        old[1] + (old[3] - height) / 2,
        width,
        height,
      ];
    });
  const keys = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (disabled || drag.current) return;
    if (event.ctrlKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === 'y') onRedo();
      else onUndo();
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(1.25);
    }
    if (event.key === '-') {
      event.preventDefault();
      zoom(0.8);
    }
    if (event.key === '0') {
      event.preventDefault();
      setFrame(model.viewBox);
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const amount = (grid || 1) * (event.shiftKey ? 10 : 1);
      const dx =
        event.key === 'ArrowLeft'
          ? -amount
          : event.key === 'ArrowRight'
            ? amount
            : 0;
      const dy =
        event.key === 'ArrowUp'
          ? -amount
          : event.key === 'ArrowDown'
            ? amount
            : 0;
      if (tool === 'pan') setFrame(([x, y, w, h]) => [x + dx, y + dy, w, h]);
      else if (selection) {
        const p =
          model.paths[selection.path]?.[selection.command]?.points[
            selection.point
          ];
        if (p) onMove(selection, [p[0] + dx, p[1] + dy]);
      }
    }
  };
  const selectedPath = selection ? shown.paths[selection.path] : undefined;
  const before = selectedPath ? starts(selectedPath) : [];
  return (
    <div className="glyph-canvas-area">
      <div className="project-action-row">
        <OutlineButton disabled={disabled} onClick={() => zoom(1.25)}>
          Zoom in
        </OutlineButton>
        <OutlineButton disabled={disabled} onClick={() => zoom(0.8)}>
          Zoom out
        </OutlineButton>
        <OutlineButton
          disabled={disabled}
          onClick={() => setFrame(model.viewBox)}
        >
          Fit viewBox
        </OutlineButton>
      </div>
      <svg
        ref={ref}
        className="glyph-canvas"
        data-background={background}
        data-contrast={contrast}
        role="group"
        aria-label="Glyph canvas"
        tabIndex={0}
        viewBox={frame.join(' ')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={keys}
      >
        <defs>
          <pattern
            id={pattern}
            width={grid || 50}
            height={grid || 50}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${grid || 50} 0 L 0 0 L 0 ${grid || 50}`}
              className="glyph-grid-line"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        {visibleGrid && (
          <rect
            x={frame[0]}
            y={frame[1]}
            width={frame[2]}
            height={frame[3]}
            fill={`url(#${pattern})`}
            pointerEvents="none"
          />
        )}
        <rect
          x={model.viewBox[0]}
          y={model.viewBox[1]}
          width={model.viewBox[2]}
          height={model.viewBox[3]}
          className="glyph-frame"
          fill="none"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <g className="glyph-guides" pointerEvents="none">
          {(['baseline', 'ascender', 'descender'] as const).map((key) => (
            <g key={key}>
              <line
                x1={frame[0]}
                x2={frame[0] + frame[2]}
                y1={guides[key]}
                y2={guides[key]}
                vectorEffect="non-scaling-stroke"
              />
              <text
                className="glyph-guide-label"
                x={frame[0] + radius}
                y={guides[key] - radius}
                fontSize={radius * 1.4}
              >
                {key}
              </text>
            </g>
          ))}
          <line
            x1={guides.advance}
            x2={guides.advance}
            y1={frame[1]}
            y2={frame[1] + frame[3]}
            vectorEffect="non-scaling-stroke"
          />
          <text
            className="glyph-guide-label"
            x={guides.advance + radius}
            y={frame[1] + radius * 2}
            fontSize={radius * 1.4}
          >
            advance
          </text>
        </g>
        {shown.paths.map((path, index) => (
          <path
            key={index}
            data-path={index}
            d={pathData(path)}
            className="glyph-drawing-path"
            data-selected={selection?.path === index}
            fillRule="nonzero"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {selectedPath?.map((c, ci) => (
          <g key={ci}>
            {selection?.command === ci && c.points.length > 1 && (
              <polyline
                className="glyph-handle-lines"
                points={[before[ci] ?? [0, 0], ...c.points]
                  .map((p) => p.join(','))
                  .join(' ')}
                fill="none"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {c.points.map(
              (p, pi) =>
                (pi === c.points.length - 1 || selection?.command === ci) && (
                  <circle
                    key={pi}
                    data-path={selection?.path}
                    data-command={ci}
                    data-point={pi}
                    cx={p[0]}
                    cy={p[1]}
                    r={radius}
                    className="glyph-handle"
                    data-control={pi !== c.points.length - 1}
                    data-selected={
                      selection?.command === ci && selection.point === pi
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                ),
            )}
          </g>
        ))}
      </svg>
      <p className="field-description">
        Select anchors or handles and drag to move. Pan uses drag or arrows.
        Arrows nudge a selected point; Shift moves ten steps. +/− zoom, 0 fits,
        Ctrl+Z/Y undo/redo. Escape cancels a drag.{' '}
        {grid > 0 && !visibleGrid
          ? 'Grid lines hidden at this zoom; snapping remains active.'
          : ''}
      </p>
    </div>
  );
}
