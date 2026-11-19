import { command, isWorkspace, type WorkspaceSnapshot } from './projects';
import { isSegments, type PronunciationSegment } from './phonology';

export type EntryKind = 'lexeme' | 'root';
export interface Sense {
  id: string | null;
  definition: string;
  notes: string;
}
export interface LexicalForm {
  id: string | null;
  text: string;
  label: string;
  pronunciation: string;
  pronunciationSegments: PronunciationSegment[];
}
export interface Relation {
  targetId: string;
  relationType: string;
}
export interface LexemeDraft {
  lemma: string;
  pronunciation: string;
  partOfSpeech: string;
  kind: EntryKind;
  pronunciationSegments: PronunciationSegment[];
  rootId: string | null;
  etymology: string;
  notes: string;
  senses: Sense[];
  forms: LexicalForm[];
  relations: Relation[];
}
export interface Lexeme {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  data: LexemeDraft;
}
export interface LexemeListItem {
  id: string;
  lemma: string;
  pronunciation: string;
  partOfSpeech: string;
  kind: EntryKind;
  definition: string;
}
export interface LexemeDetails {
  entry: Lexeme;
  incoming: { id: string; lemma: string; relationType: string }[];
  incomingCount: number;
}
export interface LexiconQuery {
  text: string;
  partOfSpeech: string;
  kind: EntryKind | null;
  ignoreMarks: boolean;
  sort: 'lemma' | 'updated';
  descending: boolean;
  offset: number;
  limit: number;
}
export interface LexiconPage {
  items: LexemeListItem[];
  total: number;
  offset: number;
  limit: number;
  categories: string[];
}
export interface SavedLexeme {
  details: LexemeDetails;
  workspace: WorkspaceSnapshot;
}
export type TransferFormat = 'json' | 'csv';
export type DuplicatePolicy = 'reject' | 'keep_both';
export interface CsvMapping {
  lemma: number;
  definition: number;
  pronunciation: number | null;
  partOfSpeech: number | null;
  notes: number | null;
}
export interface SourceInfo {
  token: string;
  name: string;
  format: TransferFormat;
  headers: string[];
  sampleRows: string[][];
  count: number;
}
export interface ImportPreview {
  token: string;
  count: number;
  duplicateCount: number;
  warnings: string[];
  sample: LexemeListItem[];
}

export const defaultQuery: LexiconQuery = {
  text: '',
  partOfSpeech: '',
  kind: null,
  ignoreMarks: false,
  sort: 'lemma',
  descending: false,
  offset: 0,
  limit: 50,
};
export const blankEntry = (): LexemeDraft => ({
  lemma: '',
  pronunciation: '',
  pronunciationSegments: [],
  partOfSpeech: '',
  kind: 'lexeme',
  rootId: null,
  etymology: '',
  notes: '',
  senses: [{ id: null, definition: '', notes: '' }],
  forms: [],
  relations: [],
});

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const string = (value: unknown): value is string => typeof value === 'string';
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(string);
const identifier = (value: unknown): value is string =>
  string(value) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const kind = (value: unknown): value is EntryKind =>
  value === 'lexeme' || value === 'root';
const relation = (value: unknown): value is Relation =>
  record(value) && identifier(value.targetId) && string(value.relationType);
function draft(value: unknown): value is LexemeDraft {
  return (
    record(value) &&
    string(value.lemma) &&
    string(value.pronunciation) &&
    string(value.partOfSpeech) &&
    kind(value.kind) &&
    (value.rootId === null || identifier(value.rootId)) &&
    string(value.etymology) &&
    string(value.notes) &&
    isSegments(value.pronunciationSegments) &&
    Array.isArray(value.senses) &&
    value.senses.length >= 1 &&
    value.senses.length <= 64 &&
    value.senses.every(
      (sense: unknown) =>
        record(sense) &&
        identifier(sense.id) &&
        string(sense.definition) &&
        string(sense.notes),
    ) &&
    Array.isArray(value.forms) &&
    value.forms.length <= 128 &&
    value.forms.every(
      (form: unknown) =>
        record(form) &&
        identifier(form.id) &&
        string(form.text) &&
        string(form.label) &&
        string(form.pronunciation) &&
        isSegments(form.pronunciationSegments),
    ) &&
    Array.isArray(value.relations) &&
    value.relations.length <= 128 &&
    value.relations.every(relation)
  );
}
export function isLexemeDetails(value: unknown): value is LexemeDetails {
  return (
    record(value) &&
    record(value.entry) &&
    identifier(value.entry.id) &&
    integer(value.entry.revision) &&
    integer(value.entry.createdAt) &&
    integer(value.entry.updatedAt) &&
    draft(value.entry.data) &&
    integer(value.incomingCount) &&
    Array.isArray(value.incoming) &&
    value.incoming.length <= 50 &&
    value.incomingCount >= value.incoming.length &&
    value.incoming.every(
      (reference: unknown) =>
        record(reference) &&
        identifier(reference.id) &&
        string(reference.lemma) &&
        string(reference.relationType),
    )
  );
}
function item(value: unknown): value is LexemeListItem {
  return (
    record(value) &&
    identifier(value.id) &&
    string(value.lemma) &&
    string(value.pronunciation) &&
    string(value.partOfSpeech) &&
    kind(value.kind) &&
    string(value.definition)
  );
}
export function isLexiconPage(value: unknown): value is LexiconPage {
  return (
    record(value) &&
    Array.isArray(value.items) &&
    value.items.every(item) &&
    integer(value.total) &&
    integer(value.offset) &&
    integer(value.limit) &&
    value.limit >= 1 &&
    value.limit <= 100 &&
    value.items.length <= value.limit &&
    strings(value.categories)
  );
}
function isSource(value: unknown): value is SourceInfo {
  if (!record(value) || !strings(value.headers)) return false;
  const headers = value.headers;
  return (
    record(value) &&
    identifier(value.token) &&
    string(value.name) &&
    (value.format === 'csv' || value.format === 'json') &&
    headers.length <= 64 &&
    Array.isArray(value.sampleRows) &&
    value.sampleRows.length <= 5 &&
    value.sampleRows.every(
      (row: unknown) => strings(row) && row.length === headers.length,
    ) &&
    integer(value.count) &&
    value.count <= 20_000
  );
}
function isPreview(value: unknown): value is ImportPreview {
  return (
    record(value) &&
    identifier(value.token) &&
    integer(value.count) &&
    value.count > 0 &&
    value.count <= 20_000 &&
    integer(value.duplicateCount) &&
    value.duplicateCount <= value.count &&
    strings(value.warnings) &&
    Array.isArray(value.sample) &&
    value.sample.length <= 10 &&
    value.sample.every(item)
  );
}

export const listLexicon = (sessionId: string, query: LexiconQuery) =>
  command('lexicon_page', { sessionId, query }, isLexiconPage);
export const loadLexeme = (sessionId: string, id: string) =>
  command('lexeme_details', { sessionId, id }, isLexemeDetails);
export const saveLexeme = (
  sessionId: string,
  entry: Lexeme | null,
  data: LexemeDraft,
) =>
  command(
    'save_lexeme',
    {
      sessionId,
      id: entry?.id ?? null,
      revision: entry?.revision ?? null,
      data,
    },
    (value): value is SavedLexeme =>
      record(value) &&
      isLexemeDetails(value.details) &&
      isWorkspace(value.workspace),
  );
export const deleteLexeme = (sessionId: string, entry: Lexeme) =>
  command(
    'delete_lexeme',
    { sessionId, id: entry.id, revision: entry.revision },
    isWorkspace,
  );
export const chooseImport = (sessionId: string, format: TransferFormat) =>
  command(
    'choose_lexicon_import',
    { sessionId, format },
    (value): value is SourceInfo | null => value === null || isSource(value),
  );
export const previewImport = (
  sessionId: string,
  sourceToken: string,
  mapping: CsvMapping | null,
  policy: DuplicatePolicy,
) =>
  command(
    'preview_lexicon_import',
    { sessionId, sourceToken, mapping, policy },
    isPreview,
  );
export const commitImport = (sessionId: string, previewToken: string) =>
  command('commit_lexicon_import', { sessionId, previewToken }, isWorkspace);
export const exportLexicon = (sessionId: string, format: TransferFormat) =>
  command(
    'export_lexicon',
    { sessionId, format },
    (value): value is string | null => value === null || string(value),
  );
