import { command } from './projects';
import { isOutline, type GlyphOutline } from './writing';

export type Point = [number, number];
export type CommandKind = 'move' | 'line' | 'quadratic' | 'cubic' | 'close';
export interface PathCommand {
  kind: CommandKind;
  points: Point[];
}
export interface EditableOutline {
  viewBox: [number, number, number, number];
  paths: PathCommand[][];
}
export type GlyphOperation =
  | { kind: 'new_path'; position: Point; grid: number }
  | {
      kind: 'append';
      path: number;
      segment: CommandKind;
      position: Point;
      grid: number;
    }
  | {
      kind: 'move_point';
      path: number;
      command: number;
      point: number;
      position: Point;
      grid: number;
    }
  | { kind: 'delete_command'; path: number; command: number }
  | { kind: 'delete_path'; path: number }
  | { kind: 'reorder_path'; path: number; to: number }
  | { kind: 'translate_path'; path: number; offset: Point }
  | {
      kind: 'change_segment';
      path: number;
      command: number;
      segment: CommandKind;
    }
  | { kind: 'split_segment'; path: number; command: number; t: number }
  | { kind: 'view_box'; viewBox: [number, number, number, number] }
  | { kind: 'component'; outline: GlyphOutline; offset: Point; scale: number };
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const coordinate = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100_000;
const arities: Record<CommandKind, number> = {
  move: 1,
  line: 1,
  quadratic: 2,
  cubic: 3,
  close: 0,
};
const isKind = (v: unknown): v is CommandKind =>
  typeof v === 'string' && Object.hasOwn(arities, v);
export function isEditableOutline(v: unknown): v is EditableOutline {
  return (
    object(v) &&
    Array.isArray(v.viewBox) &&
    v.viewBox.length === 4 &&
    v.viewBox.every(coordinate) &&
    typeof v.viewBox[2] === 'number' &&
    v.viewBox[2] > 0 &&
    typeof v.viewBox[3] === 'number' &&
    v.viewBox[3] > 0 &&
    Array.isArray(v.paths) &&
    v.paths.length <= 32 &&
    v.paths.every(
      (path: unknown) =>
        Array.isArray(path) &&
        path.length > 0 &&
        path.length <= 2048 &&
        path.every(
          (c: unknown, i) =>
            object(c) &&
            isKind(c.kind) &&
            (i > 0 || c.kind === 'move') &&
            Array.isArray(c.points) &&
            c.points.length === arities[c.kind] &&
            c.points.every(
              (p: unknown) =>
                Array.isArray(p) && p.length === 2 && p.every(coordinate),
            ),
        ),
    )
  );
}
export const decodeGlyph = (sessionId: string, outline: GlyphOutline | null) =>
  command('decode_glyph', { sessionId, outline }, isEditableOutline);
export const editGlyph = (
  sessionId: string,
  model: EditableOutline,
  operation: GlyphOperation,
) => command('edit_glyph', { sessionId, model, operation }, isEditableOutline);
export const encodeGlyph = (sessionId: string, model: EditableOutline) =>
  command('encode_glyph', { sessionId, model }, isOutline);
export const exportGlyph = (sessionId: string, model: EditableOutline) =>
  command(
    'export_glyph_outline',
    { sessionId, model },
    (v): v is string | null => v === null || typeof v === 'string',
  );
