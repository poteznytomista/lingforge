import { command, isWorkspace, type WorkspaceSnapshot } from './projects';

export interface GlyphOutline {
  viewBox: [number, number, number, number];
  paths: string[];
}
export interface GlyphVariant {
  id: string;
  name: string;
  outline: GlyphOutline;
}
export interface Character {
  id: string;
  name: string;
  transliteration: string;
  phonemeIds: string[];
  glyphs: GlyphVariant[];
  defaultGlyphId: string | null;
}
export interface InputMapping {
  id: string;
  input: string;
  characterIds: string[];
}
export type TextUnit =
  { kind: 'symbol'; characterId: string } | { kind: 'text'; text: string };
export interface ScriptDraft {
  name: string;
  notes: string;
  characters: Character[];
  mappings: InputMapping[];
  sample: TextUnit[];
}
export interface WritingSystem {
  id: string;
  revision: number;
  data: ScriptDraft;
}
export interface ScriptSummary {
  id: string;
  name: string;
  characterCount: number;
}
export interface InputPreview {
  units: TextUnit[];
  pending: string;
  issues: string[];
}
export interface Transliteration {
  text: string;
  issues: string[];
}
interface SavedScript {
  script: WritingSystem;
  workspace: WorkspaceSnapshot;
}
export const blankScript = (): ScriptDraft => ({
  name: '',
  notes: '',
  characters: [],
  mappings: [],
  sample: [],
});
export const newCharacter = (id: string): Character => ({
  id,
  name: '',
  transliteration: '',
  phonemeIds: [],
  glyphs: [],
  defaultGlyphId: null,
});
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string =>
  string(v) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(string);
export function isOutline(v: unknown): v is GlyphOutline {
  return (
    record(v) &&
    Array.isArray(v.viewBox) &&
    v.viewBox.length === 4 &&
    v.viewBox.every(
      (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100_000,
    ) &&
    typeof v.viewBox[2] === 'number' &&
    v.viewBox[2] > 0 &&
    typeof v.viewBox[3] === 'number' &&
    v.viewBox[3] > 0 &&
    strings(v.paths) &&
    v.paths.length > 0 &&
    v.paths.length <= 32 &&
    v.paths.every(
      (p) =>
        p.length > 0 && p.length <= 65536 && /^[MLQCZ0-9eE+.,\s-]+$/.test(p),
    )
  );
}
export function isUnits(v: unknown): v is TextUnit[] {
  return (
    Array.isArray(v) &&
    v.length <= 4096 &&
    v.every(
      (u: unknown) =>
        record(u) &&
        (u.kind === 'symbol'
          ? id(u.characterId)
          : u.kind === 'text' &&
            string(u.text) &&
            u.text.length > 0 &&
            u.text.length <= 256),
    )
  );
}
export function isScript(v: unknown): v is WritingSystem {
  if (!record(v) || !id(v.id) || !integer(v.revision) || !record(v.data))
    return false;
  const d = v.data;
  return (
    string(d.name) &&
    string(d.notes) &&
    isUnits(d.sample) &&
    Array.isArray(d.characters) &&
    d.characters.length <= 256 &&
    d.characters.every(
      (c: unknown) =>
        record(c) &&
        id(c.id) &&
        string(c.name) &&
        string(c.transliteration) &&
        strings(c.phonemeIds) &&
        c.phonemeIds.length <= 32 &&
        c.phonemeIds.every(id) &&
        (c.defaultGlyphId === null || id(c.defaultGlyphId)) &&
        Array.isArray(c.glyphs) &&
        c.glyphs.length <= 8 &&
        c.glyphs.every(
          (g: unknown) =>
            record(g) && id(g.id) && string(g.name) && isOutline(g.outline),
        ),
    ) &&
    Array.isArray(d.mappings) &&
    d.mappings.length <= 512 &&
    d.mappings.every(
      (m: unknown) =>
        record(m) &&
        id(m.id) &&
        string(m.input) &&
        strings(m.characterIds) &&
        m.characterIds.length > 0 &&
        m.characterIds.length <= 16 &&
        m.characterIds.every(id),
    )
  );
}
function isList(v: unknown): v is ScriptSummary[] {
  return (
    Array.isArray(v) &&
    v.length <= 32 &&
    v.every(
      (s: unknown) =>
        record(s) &&
        id(s.id) &&
        string(s.name) &&
        integer(s.characterCount) &&
        s.characterCount <= 256,
    )
  );
}
const isPreview = (v: unknown): v is InputPreview =>
  record(v) && isUnits(v.units) && string(v.pending) && strings(v.issues);
const isTransliteration = (v: unknown): v is Transliteration =>
  record(v) && string(v.text) && strings(v.issues);
export const listScripts = (sessionId: string) =>
  command('writing_systems', { sessionId }, isList);
export const newIdentity = (sessionId: string) =>
  command('new_writing_identity', { sessionId }, id);
export const loadScript = (sessionId: string, id: string) =>
  command('writing_system', { sessionId, id }, isScript);
export const saveScript = (
  sessionId: string,
  script: WritingSystem | null,
  data: ScriptDraft,
) =>
  command(
    'save_writing_system',
    {
      sessionId,
      id: script?.id ?? null,
      revision: script?.revision ?? null,
      data,
    },
    (v): v is SavedScript =>
      record(v) && isScript(v.script) && isWorkspace(v.workspace),
  );
export const deleteScript = (sessionId: string, script: WritingSystem) =>
  command(
    'delete_writing_system',
    { sessionId, id: script.id, revision: script.revision },
    isWorkspace,
  );
export const previewInput = (
  sessionId: string,
  data: ScriptDraft,
  input: string,
  commit: boolean,
  literal: boolean,
) =>
  command(
    'preview_script_input',
    { sessionId, data, input, commit, literal },
    isPreview,
  );
export const transliterate = (
  sessionId: string,
  data: ScriptDraft,
  units: TextUnit[],
) =>
  command(
    'transliterate_script',
    { sessionId, data, units },
    isTransliteration,
  );
export const importOutline = (sessionId: string) =>
  command(
    'import_glyph_outline',
    { sessionId },
    (v): v is GlyphOutline | null => v === null || isOutline(v),
  );

const clipboardPrefix = 'LINGFORGE-TEXT/1\n';
export const encodeClipboard = (
  projectId: string,
  scriptId: string,
  units: TextUnit[],
) => clipboardPrefix + JSON.stringify({ projectId, scriptId, units });
export function decodeClipboard(
  text: string,
  projectId: string,
  scriptId: string,
): TextUnit[] {
  if (!text.startsWith(clipboardPrefix) || text.length > 2 * 1024 * 1024)
    throw new Error(
      'Paste a LingForge structured copy from this project and writing system. Paste ordinary text into the input field.',
    );
  const v: unknown = JSON.parse(text.slice(clipboardPrefix.length));
  if (
    !record(v) ||
    v.projectId !== projectId ||
    v.scriptId !== scriptId ||
    !isUnits(v.units)
  )
    throw new Error(
      'This copy belongs to another project or writing system, or contains unsupported text.',
    );
  return v.units;
}
