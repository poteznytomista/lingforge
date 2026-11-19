import { command, isWorkspace, type WorkspaceSnapshot } from './projects';

export type PhonemeKind = 'consonant' | 'vowel' | 'other';
export type PronunciationSegment =
  | { kind: 'phoneme'; phonemeId: string; annotation: string }
  | { kind: 'text'; text: string };
export interface Articulation {
  place: string;
  manner: string;
  voicing: string;
  height: string;
  backness: string;
  rounding: string;
}
export interface CustomFeature {
  name: string;
  value: string;
}
export interface Allophone {
  id: string | null;
  label: string;
  environment: string;
  notes: string;
}
export interface PhonemeDraft {
  label: string;
  kind: PhonemeKind;
  articulation: Articulation;
  features: CustomFeature[];
  allophones: Allophone[];
  notes: string;
}
export interface Phoneme {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  data: PhonemeDraft;
}
export interface PhonemeSummary {
  id: string;
  label: string;
  kind: PhonemeKind;
  articulation: Articulation;
}
export interface SyllablePattern {
  id: string | null;
  label: string;
  onset: string;
  nucleus: string;
  coda: string;
  notes: string;
}
export interface PhonotacticRule {
  id: string | null;
  label: string;
  description: string;
}
export interface PhonologyDraft {
  notes: string;
  patterns: SyllablePattern[];
  rules: PhonotacticRule[];
}
export interface PhonologyProfile {
  revision: number;
  data: PhonologyDraft;
}
export interface Inventory {
  phonemes: PhonemeSummary[];
  total: number;
  profile: PhonologyProfile;
}
export interface PhonemeReference {
  entryId: string;
  lemma: string;
  formId: string | null;
  formText: string;
  occurrences: number;
}
export interface ScriptReference {
  scriptId: string;
  name: string;
  characterId: string;
  characterName: string;
}
export interface PhonemeDetails {
  phoneme: Phoneme;
  incoming: PhonemeReference[];
  incomingCount: number;
  scriptIncoming: ScriptReference[];
  scriptIncomingCount: number;
}
export interface SavedPhoneme {
  details: PhonemeDetails;
  workspace: WorkspaceSnapshot;
}
export interface SavedPhonology {
  profile: PhonologyProfile;
  workspace: WorkspaceSnapshot;
}

export const blankPhoneme = (): PhonemeDraft => ({
  label: '',
  kind: 'consonant',
  articulation: {
    place: '',
    manner: '',
    voicing: '',
    height: '',
    backness: '',
    rounding: '',
  },
  features: [],
  allophones: [],
  notes: '',
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string =>
  string(value) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const kind = (value: unknown): value is PhonemeKind =>
  value === 'consonant' || value === 'vowel' || value === 'other';
const articulation = (value: unknown): value is Articulation =>
  record(value) &&
  string(value.place) &&
  string(value.manner) &&
  string(value.voicing) &&
  string(value.height) &&
  string(value.backness) &&
  string(value.rounding);
export function isSegments(value: unknown): value is PronunciationSegment[] {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every(
      (segment: unknown) =>
        record(segment) &&
        (segment.kind === 'phoneme'
          ? id(segment.phonemeId) && string(segment.annotation)
          : segment.kind === 'text' &&
            string(segment.text) &&
            segment.text.length > 0),
    )
  );
}
function phonemeDraft(value: unknown): value is PhonemeDraft {
  return (
    record(value) &&
    string(value.label) &&
    kind(value.kind) &&
    articulation(value.articulation) &&
    string(value.notes) &&
    Array.isArray(value.features) &&
    value.features.length <= 32 &&
    value.features.every(
      (item: unknown) =>
        record(item) && string(item.name) && string(item.value),
    ) &&
    Array.isArray(value.allophones) &&
    value.allophones.length <= 64 &&
    value.allophones.every(
      (item: unknown) =>
        record(item) &&
        id(item.id) &&
        string(item.label) &&
        string(item.environment) &&
        string(item.notes),
    )
  );
}
function profile(value: unknown): value is PhonologyProfile {
  if (!record(value) || !integer(value.revision) || !record(value.data))
    return false;
  const data = value.data;
  return (
    string(data.notes) &&
    Array.isArray(data.patterns) &&
    data.patterns.length <= 128 &&
    data.patterns.every(
      (item: unknown) =>
        record(item) &&
        id(item.id) &&
        string(item.label) &&
        string(item.onset) &&
        string(item.nucleus) &&
        string(item.coda) &&
        string(item.notes),
    ) &&
    Array.isArray(data.rules) &&
    data.rules.length <= 128 &&
    data.rules.every(
      (item: unknown) =>
        record(item) &&
        id(item.id) &&
        string(item.label) &&
        string(item.description),
    )
  );
}
export function isInventory(value: unknown): value is Inventory {
  return (
    record(value) &&
    integer(value.total) &&
    value.total <= 1000 &&
    profile(value.profile) &&
    Array.isArray(value.phonemes) &&
    value.phonemes.length <= value.total &&
    value.phonemes.every(
      (item: unknown) =>
        record(item) &&
        id(item.id) &&
        string(item.label) &&
        kind(item.kind) &&
        articulation(item.articulation),
    )
  );
}
export function isPhonemeDetails(value: unknown): value is PhonemeDetails {
  return (
    record(value) &&
    record(value.phoneme) &&
    id(value.phoneme.id) &&
    integer(value.phoneme.revision) &&
    integer(value.phoneme.createdAt) &&
    integer(value.phoneme.updatedAt) &&
    phonemeDraft(value.phoneme.data) &&
    integer(value.scriptIncomingCount) &&
    Array.isArray(value.scriptIncoming) &&
    value.scriptIncoming.length <= 50 &&
    value.scriptIncoming.length <= value.scriptIncomingCount &&
    value.scriptIncoming.every(
      (item: unknown) =>
        record(item) &&
        id(item.scriptId) &&
        string(item.name) &&
        id(item.characterId) &&
        string(item.characterName),
    ) &&
    integer(value.incomingCount) &&
    Array.isArray(value.incoming) &&
    value.incoming.length <= 50 &&
    value.incoming.length <= value.incomingCount &&
    value.incoming.every(
      (item: unknown) =>
        record(item) &&
        id(item.entryId) &&
        string(item.lemma) &&
        (item.formId === null || id(item.formId)) &&
        string(item.formText) &&
        integer(item.occurrences) &&
        item.occurrences > 0,
    )
  );
}
export const loadInventory = (sessionId: string, search = '') =>
  command('phonology_inventory', { sessionId, search }, isInventory);
export const loadPhoneme = (sessionId: string, id: string) =>
  command('phoneme_details', { sessionId, id }, isPhonemeDetails);
export const savePhoneme = (
  sessionId: string,
  phoneme: Phoneme | null,
  data: PhonemeDraft,
) =>
  command(
    'save_phoneme',
    {
      sessionId,
      id: phoneme?.id ?? null,
      revision: phoneme?.revision ?? null,
      data,
    },
    (value): value is SavedPhoneme =>
      record(value) &&
      isPhonemeDetails(value.details) &&
      isWorkspace(value.workspace),
  );
export const deletePhoneme = (sessionId: string, phoneme: Phoneme) =>
  command(
    'delete_phoneme',
    { sessionId, id: phoneme.id, revision: phoneme.revision },
    isWorkspace,
  );
export const saveProfile = (
  sessionId: string,
  revision: number,
  data: PhonologyDraft,
) =>
  command(
    'save_phonology_profile',
    { sessionId, revision, data },
    (value): value is SavedPhonology =>
      record(value) && profile(value.profile) && isWorkspace(value.workspace),
  );
