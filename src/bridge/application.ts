import { invoke, isTauri } from '@tauri-apps/api/core';
import { version } from '../../package.json';

export interface ApplicationInfo {
  name: 'LingForge';
  version: string;
  platform: string;
  runtime: 'desktop' | 'preview';
}

export type ErrorCode =
  | 'unavailable'
  | 'invalid_input'
  | 'internal'
  | 'io'
  | 'conflict'
  | 'locked'
  | 'unsupported_version'
  | 'invalid_project';

export interface AppError {
  code: ErrorCode;
  message: string;
}

export function normalizeError(error: unknown): AppError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    if (
      (error.code === 'unavailable' ||
        error.code === 'invalid_input' ||
        error.code === 'internal' ||
        error.code === 'io' ||
        error.code === 'conflict' ||
        error.code === 'locked' ||
        error.code === 'unsupported_version' ||
        error.code === 'invalid_project') &&
      typeof error.message === 'string'
    ) {
      return { code: error.code, message: error.message };
    }
  }
  return {
    code: 'internal',
    message: 'The desktop connection could not be verified. Please try again.',
  };
}

function isApplicationInfo(
  value: unknown,
): value is Omit<ApplicationInfo, 'runtime'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    value.name === 'LingForge' &&
    'version' in value &&
    typeof value.version === 'string' &&
    'platform' in value &&
    typeof value.platform === 'string'
  );
}

export async function getApplicationInfo(): Promise<ApplicationInfo> {
  if (!isTauri()) {
    // Component development only. This must never impersonate a working desktop bridge.
    return {
      name: 'LingForge',
      version,
      platform: 'browser',
      runtime: 'preview',
    };
  }
  const result: unknown = await invoke('application_info');
  if (!isApplicationInfo(result)) {
    throw {
      code: 'internal',
      message: 'The desktop returned an unsupported application response.',
    } satisfies AppError;
  }
  return { ...result, runtime: 'desktop' };
}
