import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Preferences } from '../features/settings/SettingsPage';
import type { AppError } from './application';

export interface ProjectMetadata {
  name: string;
  languageName: string;
  description: string;
}
export interface ProjectSummary {
  id: string;
  metadata: ProjectMetadata;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface BackupInfo {
  id: string;
  createdAt: number;
  kind: 'auto' | 'manual' | 'migration';
  bytes: number;
}
export interface OpenProject {
  summary: ProjectSummary;
  sessionId: string;
  location: string;
  backups: BackupInfo[];
}
export interface RecentProject {
  token: string;
  name: string;
  location: string;
  lastOpened: number;
  available: boolean;
}
export interface WorkspaceSnapshot {
  active: OpenProject | null;
  recent: RecentProject[];
  preferences: Preferences;
  warnings: string[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function metadata(value: unknown): value is ProjectMetadata {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.languageName === 'string' &&
    typeof value.description === 'string'
  );
}
function summary(value: unknown): value is ProjectSummary {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    metadata(value.metadata) &&
    integer(value.revision) &&
    integer(value.createdAt) &&
    integer(value.updatedAt)
  );
}
function backup(value: unknown): value is BackupInfo {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    integer(value.createdAt) &&
    integer(value.bytes) &&
    ['auto', 'manual', 'migration'].includes(String(value.kind))
  );
}
function activeProject(value: unknown): value is OpenProject {
  return (
    record(value) &&
    summary(value.summary) &&
    typeof value.sessionId === 'string' &&
    typeof value.location === 'string' &&
    Array.isArray(value.backups) &&
    value.backups.every(backup)
  );
}
function recent(value: unknown): value is RecentProject {
  return (
    record(value) &&
    typeof value.token === 'string' &&
    typeof value.name === 'string' &&
    typeof value.location === 'string' &&
    integer(value.lastOpened) &&
    typeof value.available === 'boolean'
  );
}
export function isWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!record(value) || !record(value.preferences)) return false;
  return (
    (value.active === null || activeProject(value.active)) &&
    Array.isArray(value.recent) &&
    value.recent.every(recent) &&
    ['standard', 'comfortable', 'large'].includes(
      String(value.preferences.textSize),
    ) &&
    ['system', 'reduced'].includes(String(value.preferences.motion)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning: unknown) => typeof warning === 'string')
  );
}

const unavailable: AppError = {
  code: 'unavailable',
  message: 'Project storage is available in the desktop application.',
};

export async function command<T>(
  name: string,
  args: Record<string, unknown>,
  validate: (value: unknown) => value is T,
): Promise<T> {
  if (!isTauri()) throw unavailable;
  const value: unknown = await invoke(name, args);
  if (!validate(value))
    throw {
      code: 'internal',
      message: 'The desktop returned an unsupported project response.',
    } satisfies AppError;
  return value;
}

const nullableWorkspace = (value: unknown): value is WorkspaceSnapshot | null =>
  value === null || isWorkspace(value);
export async function loadWorkspace(): Promise<WorkspaceSnapshot | null> {
  return isTauri() ? command('workspace_state', {}, isWorkspace) : null;
}
export const createProject = (data: ProjectMetadata) =>
  command('create_project', { metadata: data }, nullableWorkspace);
export const openProject = (recentToken: string | null = null) =>
  command('open_project', { recentToken }, nullableWorkspace);
export const saveProject = (
  sessionId: string,
  revision: number,
  data: ProjectMetadata,
) =>
  command('save_project', { sessionId, revision, metadata: data }, isWorkspace);
export const closeProject = (sessionId: string) =>
  command('close_project', { sessionId }, isWorkspace);
export const importProject = () =>
  command('import_project', {}, nullableWorkspace);
export const duplicateProject = (sessionId: string) =>
  command('duplicate_project', { sessionId }, nullableWorkspace);
export const backupProject = (sessionId: string) =>
  command('backup_project', { sessionId }, isWorkspace);
export const restoreProject = (sessionId: string, backupId: string) =>
  command('restore_project', { sessionId, backupId }, nullableWorkspace);
export const forgetProject = (token: string) =>
  command('forget_project', { token }, isWorkspace);
export const exportProject = (sessionId: string) =>
  command(
    'export_project',
    { sessionId },
    (value): value is string | null =>
      value === null || typeof value === 'string',
  );
export async function persistPreferences(
  preferences: Preferences,
): Promise<void> {
  if (!isTauri()) throw unavailable;
  await invoke('save_preferences', { preferences });
}
