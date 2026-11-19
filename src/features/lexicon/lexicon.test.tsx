import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import * as projects from '../../bridge/projects';
import * as api from '../../bridge/lexicon';
import * as phonology from '../../bridge/phonology';

vi.mock('../../bridge/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/lexicon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/lexicon')>()),
  listLexicon: vi.fn(),
  loadLexeme: vi.fn(),
  saveLexeme: vi.fn(),
  deleteLexeme: vi.fn(),
  chooseImport: vi.fn(),
  previewImport: vi.fn(),
  commitImport: vi.fn(),
}));
vi.mock('../../bridge/phonology', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/phonology')>()),
  loadInventory: vi.fn(),
}));

const entryId = '00000000-0000-4000-8000-000000000001';
const senseId = '00000000-0000-4000-8000-000000000002';
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: 'project-one',
      metadata: { name: 'Language fixture', languageName: '', description: '' },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    location: '/fixture',
    backups: [],
  },
  recent: [],
  preferences: { textSize: 'standard', motion: 'system' },
  warnings: [],
});
const details = (): api.LexemeDetails => ({
  entry: {
    id: entryId,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    data: {
      ...api.blankEntry(),
      lemma: 'ã',
      senses: [{ id: senseId, definition: 'A meaning', notes: '' }],
    },
  },
  incoming: [],
  incomingCount: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(phonology.loadInventory).mockResolvedValue({
    phonemes: [],
    total: 0,
    profile: { revision: 0, data: { notes: '', patterns: [], rules: [] } },
  });
  vi.mocked(api.listLexicon).mockResolvedValue({
    items: [
      {
        id: entryId,
        lemma: 'ã',
        pronunciation: '',
        partOfSpeech: '',
        kind: 'lexeme',
        definition: 'A meaning',
      },
    ],
    total: 1,
    offset: 0,
    limit: 50,
    categories: [],
  });
  vi.mocked(api.loadLexeme).mockResolvedValue(details());
});

async function openEntry(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: 'Lexicon' },
    ),
  );
  const entries = screen.getByRole('region', { name: 'Lexicon entries' });
  await user.click(
    await within(entries).findByRole('button', { name: /A meaning/ }),
  );
  return screen.findByLabelText('Lemma / headword');
}

it('keeps a failed lexical save and protects it during navigation', async () => {
  vi.mocked(api.saveLexeme).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const input = await openEntry(user);
  await user.clear(input);
  await user.type(input, 'Changed');
  await user.keyboard('{Control>}s{/Control}');
  expect(await screen.findByText('Backup unavailable.')).toBeVisible();
  expect(input).toHaveValue('Changed');
  expect(api.saveLexeme).toHaveBeenCalledWith(
    'session-one',
    details().entry,
    expect.objectContaining({ lemma: 'Changed' }),
  );
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  const dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Keep editing' }),
  );
  expect(input).toHaveValue('Changed');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Save your changes?' }),
    ).getByRole('button', { name: 'Discard changes' }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Preferences' }),
  ).toBeVisible();
});

it('saves the stable entry identity and clears dirty status only after success', async () => {
  const saved = details();
  saved.entry.data.lemma = 'Renamed';
  saved.entry.revision = 1;
  const next = workspace();
  next.active!.summary.revision = 2;
  vi.mocked(api.saveLexeme).mockResolvedValue({
    details: saved,
    workspace: next,
  });
  const user = userEvent.setup();
  render(<App />);
  const input = await openEntry(user);
  await user.clear(input);
  await user.type(input, 'Renamed');
  await user.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Entry saved.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  expect(screen.getByText(`ID ${entryId}`)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('blocks deletion while incoming references exist', async () => {
  const linked = details();
  linked.incomingCount = 1;
  linked.incoming = [{ id: senseId, lemma: 'Dependent', relationType: 'root' }];
  vi.mocked(api.loadLexeme).mockResolvedValue(linked);
  const user = userEvent.setup();
  render(<App />);
  await openEntry(user);
  expect(screen.getByRole('button', { name: 'Delete entry' })).toBeDisabled();
  expect(screen.getByText('Dependent')).toBeVisible();
  expect(api.deleteLexeme).not.toHaveBeenCalled();
});

it('requires a preview and preserves the current project on import cancellation or error', async () => {
  vi.mocked(api.chooseImport)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      token: entryId,
      name: 'input.json',
      format: 'json',
      headers: [],
      sampleRows: [],
      count: 1,
    });
  vi.mocked(api.previewImport).mockResolvedValue({
    token: senseId,
    count: 1,
    duplicateCount: 0,
    warnings: [],
    sample: [],
  });
  vi.mocked(api.commitImport).mockRejectedValue({
    code: 'conflict',
    message: 'Preview again.',
  });
  const user = userEvent.setup();
  render(<App />);
  await openEntry(user);
  await user.click(screen.getByRole('button', { name: 'Import' }));
  const dialog = screen.getByRole('dialog', { name: 'Import lexicon' });
  const apply = within(dialog).getByRole('button', { name: 'Apply import' });
  expect(apply).toBeDisabled();
  await user.click(within(dialog).getByRole('button', { name: 'Choose file' }));
  expect(apply).toBeDisabled();
  await user.click(within(dialog).getByRole('button', { name: 'Choose file' }));
  await user.click(
    await within(dialog).findByRole('button', { name: 'Validate & preview' }),
  );
  await waitFor(() => expect(apply).toBeEnabled());
  await user.click(apply);
  expect(await within(dialog).findByText('Preview again.')).toBeVisible();
  expect(api.commitImport).toHaveBeenCalledWith('session-one', senseId);
  expect(screen.queryByText('1 entries imported.')).not.toBeInTheDocument();
});

it('rejects incomplete lexical wire responses', () => {
  expect(api.isLexemeDetails(details())).toBe(true);
  expect(
    api.isLexemeDetails({
      ...details(),
      entry: {
        ...details().entry,
        data: { ...details().entry.data, senses: [] },
      },
    }),
  ).toBe(false);
  expect(api.isLexemeDetails({ ...details(), incomingCount: -1 })).toBe(false);
  expect(
    api.isLexiconPage({
      items: [],
      total: 0,
      offset: 0,
      limit: 5000,
      categories: [],
    }),
  ).toBe(false);
});
