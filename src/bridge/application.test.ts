import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getApplicationInfo, normalizeError } from './application';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe('desktop boundary', () => {
  it('labels the browser preview and never invokes a desktop command there', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(await getApplicationInfo()).toMatchObject({
      runtime: 'preview',
      platform: 'browser',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reads native metadata through the typed adapter', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({
      name: 'LingForge',
      version: '0.1.0',
      platform: 'linux',
    });
    expect(await getApplicationInfo()).toEqual({
      name: 'LingForge',
      version: '0.1.0',
      platform: 'linux',
      runtime: 'desktop',
    });
    expect(invoke).toHaveBeenCalledWith('application_info');
  });

  it('rejects malformed responses instead of reporting a working bridge', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({ version: 123 });
    await expect(getApplicationInfo()).rejects.toMatchObject({
      code: 'internal',
    });
  });

  it('preserves structured errors and hides unexpected internal details', () => {
    expect(
      normalizeError({ code: 'unavailable', message: 'Try again.' }),
    ).toEqual({ code: 'unavailable', message: 'Try again.' });
    expect(normalizeError(new Error('/private/internal/path'))).toEqual({
      code: 'internal',
      message:
        'The desktop connection could not be verified. Please try again.',
    });
  });
});
