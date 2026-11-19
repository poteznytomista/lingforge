import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import * as api from '../../bridge/projects';

vi.mock('../../bridge/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../bridge/projects')>();
  return {
    ...actual,
    loadWorkspace: vi.fn(),
    saveProject: vi.fn(),
    closeProject: vi.fn(),
    openProject: vi.fn(),
    persistPreferences: vi.fn(),
  };
});

const fixture = (): api.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: 'project-one',
      metadata: { name: 'Aster', languageName: 'Astera', description: '' },
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    location: '/projects/Aster',
    backups: [],
  },
  recent: [],
  preferences: { textSize: 'standard', motion: 'system' },
  warnings: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.loadWorkspace).mockResolvedValue(fixture());
});

it('retains unsaved metadata when save fails and submits the native session/revision', async () => {
  vi.mocked(api.saveProject).mockRejectedValue({
    code: 'io',
    message: 'The disk is full.',
  });
  const user = userEvent.setup();
  render(<App />);
  const name = await screen.findByLabelText('Project name');
  await user.clear(name);
  await user.type(name, 'Changed');
  await user.click(screen.getByRole('button', { name: 'Save project' }));
  expect(await screen.findByText('The disk is full.')).toBeVisible();
  expect(name).toHaveValue('Changed');
  expect(screen.getByRole('button', { name: 'Save project' })).toBeEnabled();
  expect(api.saveProject).toHaveBeenCalledWith('session-one', 0, {
    name: 'Changed',
    languageName: 'Astera',
    description: '',
  });
  expect(screen.getByRole('button', { name: 'Export archive' })).toBeDisabled();
});

it('requires an explicit discard before closing a dirty project', async () => {
  vi.mocked(api.closeProject).mockResolvedValue({ ...fixture(), active: null });
  const user = userEvent.setup();
  render(<App />);
  await user.type(await screen.findByLabelText('Project name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Close project' }));
  let dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Keep editing' }),
  );
  expect(api.closeProject).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Project name')).toHaveValue('Aster draft');
  await user.click(screen.getByRole('button', { name: 'Close project' }));
  dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Discard changes' }),
  );
  expect(
    await screen.findByText('A blank page. An entire world ahead.'),
  ).toBeVisible();
  expect(api.closeProject).toHaveBeenCalledWith('session-one');
});

it('keeps the current project when a native picker is cancelled', async () => {
  vi.mocked(api.openProject).mockResolvedValue(null);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText('Project name');
  await user.click(screen.getByRole('button', { name: 'Open project' }));
  expect(await screen.findByLabelText('Project name')).toHaveValue('Aster');
  expect(screen.queryByText('Project saved.')).not.toBeInTheDocument();
});

it('does not present a failed preference write as saved', async () => {
  vi.mocked(api.persistPreferences).mockRejectedValue({
    code: 'io',
    message: 'Preferences are read-only.',
  });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText('Project name');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  await user.click(screen.getByRole('radio', { name: 'Large' }));
  expect(await screen.findByText('Preferences are read-only.')).toBeVisible();
  expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
  expect(screen.queryByText('Preferences saved.')).not.toBeInTheDocument();
});

it('rejects malformed workspace responses', () => {
  const broken = fixture();
  expect(api.isWorkspace(broken)).toBe(true);
  expect(
    api.isWorkspace({
      ...broken,
      active: { ...broken.active, sessionId: undefined },
    }),
  ).toBe(false);
  expect(
    api.isWorkspace({
      ...broken,
      preferences: { textSize: 'tiny', motion: 'system' },
    }),
  ).toBe(false);
});
