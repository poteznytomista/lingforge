import { command, isWorkspace, type WorkspaceSnapshot } from './projects';

export interface FeatureValue {
  id: string;
  label: string;
}
export interface Feature {
  id: string;
  name: string;
  values: FeatureValue[];
}
export interface GraphemeClass {
  id: string;
  name: string;
  members: string[];
}
export type Piece =
  | { kind: 'literal'; text: string }
  | { kind: 'stem' }
  | { kind: 'slice'; start: number; end: number };
export type Operation =
  | { kind: 'affix'; prefix: string; suffix: string }
  | { kind: 'infix'; at: number; text: string }
  | { kind: 'template'; pieces: Piece[] }
  | {
      kind: 'rewrite';
      from: string;
      to: string;
      before: string | null;
      after: string | null;
      wordStart: boolean;
      wordEnd: boolean;
    }
  | { kind: 'call'; ruleId: string };
export interface Rule {
  id: string;
  name: string;
  operation: Operation;
}
export interface Assignment {
  featureId: string;
  valueId: string;
}
export interface Cell {
  id: string;
  name: string;
  kind: 'inflection' | 'derivation';
  features: Assignment[];
  rules: string[];
}
export interface Irregular {
  entryId: string;
  cellId: string;
  output: string;
  reason: string;
}
export interface ClassSlot {
  classId: string;
  min: number;
  max: number;
}
export interface Phonotactic {
  id: string;
  name: string;
  slots: ClassSlot[];
}
export interface ProgramDraft {
  version: 1;
  name: string;
  notes: string;
  input: 'lemma' | 'pronunciation';
  features: Feature[];
  classes: GraphemeClass[];
  rules: Rule[];
  cells: Cell[];
  overrides: Irregular[];
  phonotactics: Phonotactic[];
}
export interface Program {
  id: string;
  revision: number;
  data: ProgramDraft;
}
export interface Evaluation {
  output: string;
  steps: { ruleId: string; name: string; before: string; after: string }[];
  irregularReason: string | null;
  phonotactics: boolean | null;
  matchingPatterns: string[];
}
export interface ResultRow {
  source: { entryId: string; revision: number; lemma: string; input: string };
  cellId: string;
  evaluation: Evaluation | null;
  error: string | null;
  conflicts: string[];
}
export interface Batch {
  id: string;
  createdAt: number;
  data: { program: Program; rows: ResultRow[] };
}
export interface AutomationIndex {
  programs: { id: string; revision: number; name: string }[];
  batches: {
    id: string;
    programId: string;
    name: string;
    createdAt: number;
    count: number;
  }[];
}
export interface Preview {
  token: string;
  projectRevision: number;
  rows: ResultRow[];
}
export const blankProgram = (): ProgramDraft => ({
  version: 1,
  name: '',
  notes: '',
  input: 'lemma',
  features: [],
  classes: [],
  rules: [],
  cells: [],
  overrides: [],
  phonotactics: [],
});
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 8192): v is string =>
  typeof v === 'string' && v.length <= max;
const id = (v: unknown): v is string =>
  str(v, 36) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const arr = <T>(
  v: unknown,
  max: number,
  check: (v: unknown) => v is T,
): v is T[] => Array.isArray(v) && v.length <= max && v.every(check);
const optionalId = (v: unknown): v is string | null => v === null || id(v);
function piece(v: unknown): v is Piece {
  return (
    obj(v) &&
    (v.kind === 'stem' ||
      (v.kind === 'literal' && str(v.text, 1024)) ||
      (v.kind === 'slice' &&
        num(v.start, 256) &&
        num(v.end, 256) &&
        v.start < v.end))
  );
}
function operation(v: unknown): v is Operation {
  return (
    obj(v) &&
    ((v.kind === 'affix' && str(v.prefix, 1024) && str(v.suffix, 1024)) ||
      (v.kind === 'infix' && num(v.at, 256) && str(v.text, 1024)) ||
      (v.kind === 'template' && arr(v.pieces, 16, piece)) ||
      (v.kind === 'call' && id(v.ruleId)) ||
      (v.kind === 'rewrite' &&
        str(v.from, 1024) &&
        str(v.to, 1024) &&
        optionalId(v.before) &&
        optionalId(v.after) &&
        typeof v.wordStart === 'boolean' &&
        typeof v.wordEnd === 'boolean'))
  );
}
export function isProgramDraft(v: unknown): v is ProgramDraft {
  return (
    obj(v) &&
    v.version === 1 &&
    str(v.name, 240) &&
    str(v.notes, 8000) &&
    (v.input === 'lemma' || v.input === 'pronunciation') &&
    arr(
      v.features,
      16,
      (f): f is Feature =>
        obj(f) &&
        id(f.id) &&
        str(f.name, 240) &&
        arr(
          f.values,
          16,
          (x): x is FeatureValue => obj(x) && id(x.id) && str(x.label, 240),
        ),
    ) &&
    arr(
      v.classes,
      32,
      (c): c is GraphemeClass =>
        obj(c) &&
        id(c.id) &&
        str(c.name, 240) &&
        arr(c.members, 64, (x): x is string => str(x, 1024)),
    ) &&
    arr(
      v.rules,
      64,
      (r): r is Rule =>
        obj(r) && id(r.id) && str(r.name, 240) && operation(r.operation),
    ) &&
    arr(
      v.cells,
      32,
      (c): c is Cell =>
        obj(c) &&
        id(c.id) &&
        str(c.name, 240) &&
        (c.kind === 'inflection' || c.kind === 'derivation') &&
        arr(c.rules, 16, id) &&
        arr(
          c.features,
          16,
          (a): a is Assignment => obj(a) && id(a.featureId) && id(a.valueId),
        ),
    ) &&
    arr(
      v.overrides,
      128,
      (o): o is Irregular =>
        obj(o) &&
        id(o.entryId) &&
        id(o.cellId) &&
        str(o.output, 1024) &&
        str(o.reason, 2000),
    ) &&
    arr(
      v.phonotactics,
      16,
      (p): p is Phonotactic =>
        obj(p) &&
        id(p.id) &&
        str(p.name, 240) &&
        arr(
          p.slots,
          16,
          (s): s is ClassSlot =>
            obj(s) &&
            id(s.classId) &&
            num(s.min, 8) &&
            num(s.max, 8) &&
            s.min <= s.max,
        ),
    )
  );
}
export function isProgram(v: unknown): v is Program {
  return (
    obj(v) &&
    id(v.id) &&
    num(v.revision) &&
    isProgramDraft(v.data) &&
    v.data.cells.length > 0
  );
}
function evaluation(v: unknown): v is Evaluation {
  return (
    obj(v) &&
    str(v.output, 1024) &&
    (v.irregularReason === null || str(v.irregularReason, 2000)) &&
    (v.phonotactics === null || typeof v.phonotactics === 'boolean') &&
    arr(v.matchingPatterns, 16, id) &&
    arr(
      v.steps,
      64,
      (s): s is Evaluation['steps'][number] =>
        obj(s) &&
        id(s.ruleId) &&
        str(s.name, 240) &&
        str(s.before, 1024) &&
        str(s.after, 1024),
    )
  );
}
function row(v: unknown): v is ResultRow {
  return (
    obj(v) &&
    obj(v.source) &&
    id(v.source.entryId) &&
    num(v.source.revision) &&
    str(v.source.lemma, 512) &&
    str(v.source.input, 1024) &&
    id(v.cellId) &&
    ((v.evaluation === null && str(v.error, 4096)) ||
      (evaluation(v.evaluation) && v.error === null)) &&
    arr(v.conflicts, 8, (c): c is string => str(c, 4096))
  );
}
export function isPreview(v: unknown): v is Preview {
  return (
    obj(v) &&
    id(v.token) &&
    num(v.projectRevision) &&
    arr(v.rows, 64, row) &&
    v.rows.length > 0
  );
}
export function isBatch(v: unknown): v is Batch {
  return (
    obj(v) &&
    id(v.id) &&
    num(v.createdAt, 8_640_000_000_000_000) &&
    obj(v.data) &&
    isProgram(v.data.program) &&
    arr(v.data.rows, 64, row) &&
    v.data.rows.length > 0 &&
    v.data.rows.every(
      (r) =>
        r.error === null &&
        r.conflicts.length === 0 &&
        r.evaluation !== null &&
        r.evaluation.phonotactics !== false,
    )
  );
}
function index(v: unknown): v is AutomationIndex {
  return (
    obj(v) &&
    arr(
      v.programs,
      32,
      (p): p is AutomationIndex['programs'][number] =>
        obj(p) && id(p.id) && num(p.revision) && str(p.name, 240),
    ) &&
    arr(
      v.batches,
      32,
      (b): b is AutomationIndex['batches'][number] =>
        obj(b) &&
        id(b.id) &&
        id(b.programId) &&
        str(b.name, 240) &&
        num(b.createdAt, 8_640_000_000_000_000) &&
        num(b.count, 64) &&
        b.count > 0,
    )
  );
}
export const loadIndex = (sessionId: string) =>
  command('automation_index', { sessionId }, index);
export const loadProgram = (sessionId: string, id: string) =>
  command('automation_program', { sessionId, id }, isProgram);
export const loadBatch = (sessionId: string, id: string) =>
  command('automation_batch', { sessionId, id }, isBatch);
export const newIdentity = (sessionId: string) =>
  command('new_automation_identity', { sessionId }, id);
export const saveProgram = (
  sessionId: string,
  program: Program | null,
  data: ProgramDraft,
) =>
  command(
    'save_automation_program',
    {
      sessionId,
      id: program?.id ?? null,
      revision: program?.revision ?? null,
      data,
    },
    (v): v is { program: Program; workspace: WorkspaceSnapshot } =>
      obj(v) && isProgram(v.program) && isWorkspace(v.workspace),
  );
export const deleteProgram = (sessionId: string, program: Program) =>
  command(
    'delete_automation_program',
    { sessionId, id: program.id, revision: program.revision },
    isWorkspace,
  );
export const previewGeneration = (
  sessionId: string,
  program: Program,
  entries: string[],
  cells: string[],
) =>
  command(
    'preview_automation',
    { sessionId, id: program.id, revision: program.revision, entries, cells },
    isPreview,
  );
export const applyGeneration = (
  sessionId: string,
  token: string,
  selected: number[],
) => command('apply_automation', { sessionId, token, selected }, isWorkspace);
export const revertBatch = (sessionId: string, id: string) =>
  command('revert_automation_batch', { sessionId, id }, isWorkspace);
