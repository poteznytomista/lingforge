import type {
  CommandKind,
  EditableOutline,
  PathCommand,
  Point,
} from '../../bridge/glyph';
export interface GlyphSelection {
  path: number;
  command: number;
  point: number;
}
export type GlyphTool = 'select' | 'pan' | Exclude<CommandKind, 'close'>;
const letters: Record<CommandKind, string> = {
  move: 'M',
  line: 'L',
  quadratic: 'Q',
  cubic: 'C',
  close: 'Z',
};
// Presentation only. Rust validates and serializes every applied/exported outline.
export const pathData = (path: PathCommand[]) =>
  path.map((c) => [letters[c.kind], ...c.points.flat()].join(' ')).join(' ');
export function selectedPoint(
  model: EditableOutline,
  selection: GlyphSelection | null,
): Point | undefined {
  return selection
    ? model.paths[selection.path]?.[selection.command]?.points[selection.point]
    : undefined;
}
export function previewPoint(
  model: EditableOutline,
  selection: GlyphSelection,
  point: Point,
): EditableOutline {
  return {
    ...model,
    paths: model.paths.map((path, p) =>
      p !== selection.path
        ? path
        : path.map((c, i) =>
            i !== selection.command
              ? c
              : {
                  ...c,
                  points: c.points.map((old, j) =>
                    j === selection.point ? point : old,
                  ),
                },
          ),
    ),
  };
}
export function starts(path: PathCommand[]): Point[] {
  let current: Point = [0, 0];
  let start = current;
  return path.map((c) => {
    const before = current;
    if (c.kind === 'close') current = start;
    else {
      current = c.points.at(-1) ?? current;
      if (c.kind === 'move') start = current;
    }
    return before;
  });
}
