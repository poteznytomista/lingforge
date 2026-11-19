import { command, isWorkspace, type WorkspaceSnapshot } from './projects';
import { isUnits, type TextUnit, type Transliteration } from './writing';

export type RecordKind = 'document' | 'grammar';
export interface LexicalSpan {
  start: number;
  end: number;
  entryId: string;
}
export interface Paragraph {
  id: string;
  scriptId: string | null;
  units: TextUnit[];
  links: LexicalSpan[];
}
export interface DocumentDraft {
  title: string;
  notes: string;
  paragraphs: Paragraph[];
}
export interface GrammarFeature {
  id: string;
  name: string;
  values: string;
  description: string;
}
export interface GrammarExample {
  id: string;
  text: string;
  gloss: string;
  translation: string;
}
export interface MorphologyNote {
  id: string;
  kind: 'inflection' | 'derivation' | 'irregular';
  label: string;
  description: string;
  entryId: string | null;
  form: string;
}
export interface GrammarDraft {
  title: string;
  notes: string;
  features: GrammarFeature[];
  examples: GrammarExample[];
  lexemeIds: string[];
  phonemeIds: string[];
  morphology: MorphologyNote[];
}
export type NotebookDraft =
  | { kind: 'document'; content: DocumentDraft }
  | { kind: 'grammar'; content: GrammarDraft };
export interface NotebookRecord {
  id: string;
  revision: number;
  data: NotebookDraft;
}
export interface RecordSummary {
  id: string;
  title: string;
  kind: RecordKind;
}
export interface CharacterMapping {
  sourceId: string;
  targetIds: string[];
}
export interface Conversion {
  paragraph: Paragraph | null;
  issues: string[];
}
export interface ImportCandidate {
  record: NotebookRecord;
  existing: NotebookRecord | null;
}
interface SavedRecord {
  record: NotebookRecord;
  workspace: WorkspaceSnapshot;
}
export const blankParagraph = (id: string): Paragraph => ({
  id,
  scriptId: null,
  units: [],
  links: [],
});
export const blankGrammar = (): GrammarDraft => ({
  title: '',
  notes: '',
  features: [],
  examples: [],
  lexemeIds: [],
  phonemeIds: [],
  morphology: [],
});
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string =>
  string(v) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const natural = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 256 &&
  v.every(id) &&
  new Set(v).size === v.length;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(string);
const kind = (v: unknown): v is RecordKind =>
  v === 'document' || v === 'grammar';
export function isParagraph(v: unknown): v is Paragraph {
  if (
    !object(v) ||
    !id(v.id) ||
    !(v.scriptId === null || id(v.scriptId)) ||
    !isUnits(v.units) ||
    !Array.isArray(v.links) ||
    v.links.length > 256
  )
    return false;
  let previous = 0;
  for (const link of v.links as unknown[]) {
    if (
      !object(link) ||
      !id(link.entryId) ||
      !natural(link.start) ||
      !natural(link.end) ||
      link.start < previous ||
      link.start >= link.end ||
      link.end > v.units.length
    )
      return false;
    previous = link.end;
  }
  return v.scriptId !== null || v.units.every((u) => u.kind === 'text');
}
export function isNotebookDraft(v: unknown): v is NotebookDraft {
  if (
    !object(v) ||
    !object(v.content) ||
    !string(v.content.title) ||
    !string(v.content.notes)
  )
    return false;
  const c = v.content;
  if (v.kind === 'document')
    return (
      Array.isArray(c.paragraphs) &&
      c.paragraphs.length > 0 &&
      c.paragraphs.length <= 128 &&
      c.paragraphs.every(isParagraph) &&
      new Set(c.paragraphs.map((p) => p.id)).size === c.paragraphs.length &&
      c.paragraphs.reduce((n, p) => n + p.units.length, 0) <= 65536
    );
  return (
    v.kind === 'grammar' &&
    ids(c.lexemeIds) &&
    ids(c.phonemeIds) &&
    Array.isArray(c.features) &&
    c.features.length <= 64 &&
    c.features.every(
      (f: unknown) =>
        object(f) &&
        id(f.id) &&
        string(f.name) &&
        string(f.values) &&
        string(f.description),
    ) &&
    Array.isArray(c.examples) &&
    c.examples.length <= 128 &&
    c.examples.every(
      (e: unknown) =>
        object(e) &&
        id(e.id) &&
        string(e.text) &&
        string(e.gloss) &&
        string(e.translation),
    ) &&
    Array.isArray(c.morphology) &&
    c.morphology.length <= 128 &&
    c.morphology.every(
      (m: unknown) =>
        object(m) &&
        id(m.id) &&
        ['inflection', 'derivation', 'irregular'].includes(String(m.kind)) &&
        string(m.label) &&
        string(m.description) &&
        string(m.form) &&
        (m.entryId === null || id(m.entryId)),
    )
  );
}
export function isNotebookRecord(v: unknown): v is NotebookRecord {
  return (
    object(v) && id(v.id) && natural(v.revision) && isNotebookDraft(v.data)
  );
}
const isList = (v: unknown): v is RecordSummary[] =>
  Array.isArray(v) &&
  v.length <= 512 &&
  v.every(
    (r: unknown) => object(r) && id(r.id) && string(r.title) && kind(r.kind),
  );
export const isConversion = (v: unknown): v is Conversion =>
  object(v) &&
  strings(v.issues) &&
  (v.paragraph === null
    ? v.issues.length > 0
    : isParagraph(v.paragraph) && v.issues.length === 0);
export const listRecords = (sessionId: string, kind: RecordKind) =>
  command(
    'notebook_records',
    { sessionId, kind },
    (v): v is RecordSummary[] =>
      isList(v) &&
      v.every((r) => r.kind === kind) &&
      new Set(v.map((r) => r.id)).size === v.length,
  );
export const loadRecord = (sessionId: string, id: string) =>
  command(
    'notebook_record',
    { sessionId, id },
    (v): v is NotebookRecord => isNotebookRecord(v) && v.id === id,
  );
export const saveRecord = (
  sessionId: string,
  id: string,
  revision: number | null,
  data: NotebookDraft,
) =>
  command(
    'save_notebook_record',
    { sessionId, id, revision, data },
    (v): v is SavedRecord =>
      object(v) &&
      isNotebookRecord(v.record) &&
      v.record.id === id &&
      v.record.data.kind === data.kind &&
      isWorkspace(v.workspace),
  );
export const deleteRecord = (sessionId: string, record: NotebookRecord) =>
  command(
    'delete_notebook_record',
    { sessionId, id: record.id, revision: record.revision },
    isWorkspace,
  );
export const editParagraph = (
  sessionId: string,
  paragraph: Paragraph,
  start: number,
  end: number,
  units: TextUnit[],
) =>
  command(
    'edit_document_paragraph',
    { sessionId, paragraph, start, end, units },
    isParagraph,
  );
export const convertParagraph = (
  sessionId: string,
  paragraph: Paragraph,
  targetId: string,
  mappings: CharacterMapping[],
) =>
  command(
    'convert_document_paragraph',
    { sessionId, paragraph, targetId, mappings },
    isConversion,
  );
export const documentText = (
  sessionId: string,
  data: NotebookDraft,
  plain = false,
) =>
  command(
    'document_text',
    { sessionId, data, plain },
    (v): v is Transliteration =>
      object(v) && string(v.text) && strings(v.issues),
  );
export const chooseImport = (sessionId: string) =>
  command(
    'choose_notebook_import',
    { sessionId },
    (v): v is ImportCandidate | null =>
      v === null ||
      (object(v) &&
        isNotebookRecord(v.record) &&
        (v.existing === null ||
          (isNotebookRecord(v.existing) &&
            v.existing.id === v.record.id &&
            v.existing.data.kind === v.record.data.kind))),
  );
export const exportRecord = (
  sessionId: string,
  record: NotebookRecord,
  format: 'structured' | 'plain' | 'transliteration',
) =>
  command(
    'export_notebook_record',
    { sessionId, id: record.id, revision: record.revision, format },
    (v): v is string | null => v === null || string(v),
  );
