import { command, isWorkspace, type WorkspaceSnapshot } from './projects';
import { isScript, type WritingSystem } from './writing';
export type Embedding =
  'restricted' | 'preview_print' | 'editable' | 'installable';
export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  sourceEm: number;
  sourceBaseline: number;
}
export interface FontGlyph {
  characterId: string;
  variantId: string;
  codepoint: number | null;
  advance: number;
  mark: boolean;
  anchor: [number, number] | null;
}
export interface ContextRule {
  before: string[];
  input: string;
  after: string[];
  output: string;
}
export interface LigatureRule {
  input: string[];
  output: string;
}
export interface FontDraft {
  family: string;
  copyright: string;
  license: string;
  embedding: Embedding;
  metrics: FontMetrics;
  glyphs: FontGlyph[];
  contexts: ContextRule[];
  ligatures: LigatureRule[];
  sample: string[];
  direction: 'ltr' | 'rtl';
}
export interface FontProfile {
  scriptId: string;
  revision: number;
  data: FontDraft;
}
export interface FontWorkspace {
  script: WritingSystem;
  profile: FontProfile | null;
  initial: FontDraft;
}
export interface ShapedGlyph {
  glyphId: number;
  variantId: string | null;
  start: number;
  end: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}
export interface FontPreview {
  bytes: number[];
  text: string;
  glyphs: ShapedGlyph[];
  warnings: string[];
}
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string =>
  str(v) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const ids = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(id);
export function isFontDraft(v: unknown): v is FontDraft {
  if (
    !obj(v) ||
    !str(v.family) ||
    v.family.length > 126 ||
    !str(v.copyright) ||
    v.copyright.length > 4096 ||
    !str(v.license) ||
    v.license.length > 16384 ||
    !['restricted', 'preview_print', 'editable', 'installable'].includes(
      String(v.embedding),
    ) ||
    !obj(v.metrics)
  )
    return false;
  const m = v.metrics;
  return (
    num(m.unitsPerEm, 16, 16384) &&
    num(m.sourceEm, 16, 16384) &&
    num(m.ascender, 1, 32767) &&
    num(m.descender, -32768, 0) &&
    num(m.lineGap, 0, 32767) &&
    num(m.sourceBaseline, -32768, 32767) &&
    Array.isArray(v.glyphs) &&
    v.glyphs.length <= 512 &&
    v.glyphs.every(
      (g: unknown) =>
        obj(g) &&
        id(g.characterId) &&
        id(g.variantId) &&
        (g.codepoint === null || num(g.codepoint, 0, 0x10ffff)) &&
        num(g.advance, 0, 32767) &&
        typeof g.mark === 'boolean' &&
        (g.anchor === null ||
          (Array.isArray(g.anchor) &&
            g.anchor.length === 2 &&
            g.anchor.every((n: unknown) => num(n, -32768, 32767)))),
    ) &&
    Array.isArray(v.contexts) &&
    v.contexts.length <= 128 &&
    v.contexts.every(
      (r: unknown) =>
        obj(r) &&
        ids(r.before, 4) &&
        id(r.input) &&
        ids(r.after, 4) &&
        id(r.output),
    ) &&
    Array.isArray(v.ligatures) &&
    v.ligatures.length <= 128 &&
    v.ligatures.every(
      (r: unknown) =>
        obj(r) && ids(r.input, 8) && r.input.length >= 2 && id(r.output),
    ) &&
    ids(v.sample, 256) &&
    (v.direction === 'ltr' || v.direction === 'rtl')
  );
}
function isProfile(v: unknown): v is FontProfile {
  return (
    obj(v) &&
    id(v.scriptId) &&
    num(v.revision) &&
    isFontDraft(v.data) &&
    v.data.glyphs.length > 0
  );
}
export function isFontPreview(v: unknown): v is FontPreview {
  return (
    obj(v) &&
    Array.isArray(v.bytes) &&
    v.bytes.length > 0 &&
    v.bytes.length <= 4 * 1024 * 1024 &&
    v.bytes.every((b: unknown) => num(b, 0, 255)) &&
    str(v.text) &&
    v.text.length <= 512 &&
    Array.isArray(v.warnings) &&
    v.warnings.length <= 16 &&
    v.warnings.every((s: unknown) => str(s) && s.length <= 4096) &&
    Array.isArray(v.glyphs) &&
    v.glyphs.length <= 2048 &&
    v.glyphs.every(
      (g: unknown) =>
        obj(g) &&
        num(g.glyphId, 0, 512) &&
        (g.variantId === null || id(g.variantId)) &&
        num(g.start, 0, 255) &&
        num(g.end, 1, 256) &&
        g.start < g.end &&
        ['xAdvance', 'yAdvance', 'xOffset', 'yOffset'].every((k) =>
          num(g[k], -2147483648, 2147483647),
        ),
    )
  );
}
export const loadFont = (sessionId: string, scriptId: string) =>
  command(
    'font_workspace',
    { sessionId, scriptId },
    (v): v is FontWorkspace =>
      obj(v) &&
      isScript(v.script) &&
      (v.profile === null ||
        (isProfile(v.profile) && v.profile.scriptId === v.script.id)) &&
      isFontDraft(v.initial),
  );
export const saveFont = (
  sessionId: string,
  script: WritingSystem,
  profile: FontProfile | null,
  data: FontDraft,
) =>
  command(
    'save_font_profile',
    {
      sessionId,
      scriptId: script.id,
      scriptRevision: script.revision,
      revision: profile?.revision ?? null,
      data,
    },
    (v): v is { profile: FontProfile; workspace: WorkspaceSnapshot } =>
      obj(v) && isProfile(v.profile) && isWorkspace(v.workspace),
  );
export const deleteFont = (sessionId: string, profile: FontProfile) =>
  command(
    'delete_font_profile',
    { sessionId, scriptId: profile.scriptId, revision: profile.revision },
    isWorkspace,
  );
export const previewFont = (
  sessionId: string,
  script: WritingSystem,
  data: FontDraft,
) =>
  command(
    'preview_font',
    { sessionId, scriptId: script.id, scriptRevision: script.revision, data },
    isFontPreview,
  );
export const exportFont = (
  sessionId: string,
  script: WritingSystem,
  data: FontDraft,
  rightsConfirmed: boolean,
) =>
  command(
    'export_font',
    {
      sessionId,
      scriptId: script.id,
      scriptRevision: script.revision,
      data,
      rightsConfirmed,
    },
    (v): v is string | null => v === null || str(v),
  );
