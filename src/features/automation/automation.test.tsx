import { beforeEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import * as projects from '../../bridge/projects';
import * as lexicon from '../../bridge/lexicon';
import * as api from '../../bridge/automation';
import fixture from '../../../tests/fixtures/automation/program-v1.json';

vi.mock('../../bridge/projects', async (original) => ({
  ...(await original<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/lexicon', async (original) => ({
  ...(await original<typeof import('../../bridge/lexicon')>()),
  loadLexeme: vi.fn(),
  listLexicon: vi.fn(),
  saveLexeme: vi.fn(),
}));
vi.mock('../../bridge/automation', async (original) => ({
  ...(await original<typeof import('../../bridge/automation')>()),
  loadIndex: vi.fn(),
  loadProgram: vi.fn(),
  loadBatch: vi.fn(),
  saveProgram: vi.fn(),
  deleteProgram: vi.fn(),
  previewGeneration: vi.fn(),
  applyGeneration: vi.fn(),
  revertBatch: vi.fn(),
  newIdentity: vi.fn(),
}));
const id = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const data = fixture as unknown as api.ProgramDraft;
const program: api.Program = {
  id: id(100),
  revision: 0,
  data: {
    ...data,
    cells: [
      ...data.cells,
      { ...data.cells[0]!, id: id(6), name: 'Blocked cell', features: [] },
    ],
  },
};
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: id(200),
      metadata: {
        name: 'Automation fixture',
        languageName: '',
        description: '',
      },
      revision: 3,
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
const entry: lexicon.Lexeme = {
  id: id(101),
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
  data: {
    ...lexicon.blankEntry(),
    lemma: 'kat',
    senses: [{ id: id(102), definition: 'Test only', notes: '' }],
  },
};
const row = (cellId = data.cells[0]!.id): api.ResultRow => ({
  source: { entryId: entry.id, revision: 0, lemma: 'kat', input: 'kat' },
  cellId,
  evaluation: {
    output: 'kati',
    steps: [
      {
        ruleId: data.rules[0]!.id,
        name: 'Plural suffix',
        before: 'kat',
        after: 'kati',
      },
    ],
    irregularReason: null,
    phonotactics: null,
    matchingPatterns: [],
  },
  error: null,
  conflicts: [],
});
const preview = (): api.Preview => ({
  token: id(103),
  projectRevision: 3,
  rows: [
    row(),
    {
      ...row(id(6)),
      conflicts: [
        'An authored form already has this cell label or output. Authored forms are protected.',
      ],
    },
  ],
});
const batch: api.Batch = {
  id: id(104),
  createdAt: 1,
  data: { program, rows: [row()] },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(api.loadIndex).mockResolvedValue({
    programs: [{ id: program.id, revision: 0, name: data.name }],
    batches: [
      {
        id: batch.id,
        programId: program.id,
        name: data.name,
        createdAt: 1,
        count: 1,
      },
    ],
  });
  vi.mocked(api.loadProgram).mockResolvedValue(program);
  vi.mocked(api.loadBatch).mockResolvedValue(batch);
  vi.mocked(api.saveProgram).mockImplementation(async (_s, _p, next) => ({
    program: { ...program, revision: 1, data: next },
    workspace: workspace(),
  }));
  vi.mocked(api.previewGeneration).mockResolvedValue(preview());
  vi.mocked(api.applyGeneration).mockResolvedValue(workspace());
  vi.mocked(api.revertBatch).mockResolvedValue(workspace());
  vi.mocked(lexicon.loadLexeme).mockResolvedValue({
    entry,
    incoming: [],
    incomingCount: 0,
  });
  vi.mocked(lexicon.listLexicon).mockResolvedValue({
    items: [
      {
        id: entry.id,
        lemma: 'kat',
        pronunciation: '',
        partOfSpeech: '',
        kind: 'lexeme',
        definition: 'Test only',
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
    categories: [],
  });
});
async function open(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: 'Rules & analysis' },
    ),
  );
  await user.click(await screen.findByRole('button', { name: data.name }));
  return screen.findByLabelText('Program name');
}
async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Choose source entry' }));
  await user.click(
    await screen.findByRole('button', { name: /^kat.*Test only/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Add source entry' }));
  await screen.findByRole('button', { name: 'Remove kat' });
  await user.click(screen.getByRole('button', { name: 'Preview generation' }));
  await screen.findByLabelText('Select result 1');
}
it('requires preview and explicit eligible row selection without writing authored forms', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  expect(
    screen.queryByRole('button', { name: /Apply selected results/ }),
  ).not.toBeInTheDocument();
  await generate(user);
  expect(screen.getByLabelText('Select result 2')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Apply selected results (0)' }),
  ).toBeDisabled();
  await user.click(screen.getByLabelText('Select result 1'));
  await user.click(
    screen.getByRole('button', { name: 'Apply selected results (1)' }),
  );
  await waitFor(() =>
    expect(api.applyGeneration).toHaveBeenCalledWith(
      'session-one',
      id(103),
      [0],
    ),
  );
  expect(
    await screen.findByText(
      'Selected generated forms saved in a new batch. Authored forms are unchanged.',
    ),
  ).toBeVisible();
  expect(lexicon.saveLexeme).not.toHaveBeenCalled();
});
it('retains a failed apply and invalidates the preview when the program draft changes', async () => {
  vi.mocked(api.applyGeneration).mockRejectedValue({
    code: 'conflict',
    message: 'The project changed. Preview again.',
  });
  const user = userEvent.setup();
  render(<App />);
  const name = await open(user);
  await generate(user);
  await user.click(screen.getByLabelText('Select result 1'));
  await user.click(
    screen.getByRole('button', { name: 'Apply selected results (1)' }),
  );
  expect(
    await screen.findByText('The project changed. Preview again.'),
  ).toBeVisible();
  expect(screen.getByLabelText('Select result 1')).toBeChecked();
  fireEvent.change(name, { target: { value: 'Unsaved program' } });
  expect(screen.queryByLabelText('Select result 1')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Preview generation' }),
  ).toBeDisabled();
});
it('keeps drafts after failed navigation saves and discards only on request', async () => {
  vi.mocked(api.saveProgram).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const name = await open(user);
  fireEvent.change(name, { target: { value: 'Pending rules' } });
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  const dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Save & continue' }),
  );
  expect(await within(dialog).findByText('Backup unavailable.')).toBeVisible();
  expect(name).toHaveValue('Pending rules');
  await user.click(
    within(dialog).getByRole('button', { name: 'Discard changes' }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Preferences' }),
  ).toBeVisible();
});
it('shows frozen batch provenance and confirms reversal', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  const batches = screen.getByRole('region', { name: 'Generated batches' });
  await user.click(within(batches).getByRole('button', { name: /1 results/ }));
  const provenance = await screen.findByRole('region', {
    name: 'Saved batch provenance',
  });
  expect(within(provenance).getByText('kati')).toBeVisible();
  await user.click(within(provenance).getByText('Derivation and source'));
  expect(within(provenance).getByText('Plural suffix')).toBeVisible();
  await user.click(
    within(batches).getByRole('button', { name: 'Revert batch' }),
  );
  expect(api.revertBatch).not.toHaveBeenCalled();
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Revert this generated batch?' }),
    ).getByRole('button', { name: 'Revert generated batch' }),
  );
  await waitFor(() =>
    expect(api.revertBatch).toHaveBeenCalledWith('session-one', batch.id),
  );
  expect(
    screen.queryByRole('region', { name: 'Saved batch provenance' }),
  ).not.toBeInTheDocument();
  expect(lexicon.saveLexeme).not.toHaveBeenCalled();
});
it('rejects malformed program and result responses', () => {
  expect(api.isProgram(program)).toBe(true);
  expect(api.isPreview(preview())).toBe(true);
  expect(api.isBatch(batch)).toBe(true);
  expect(
    api.isProgramDraft({
      ...data,
      rules: [
        { ...data.rules[0], operation: { kind: 'infix', at: NaN, text: 'x' } },
      ],
    }),
  ).toBe(false);
  expect(
    api.isProgramDraft({
      ...data,
      rules: [
        { ...data.rules[0], operation: { kind: 'script', code: 'untrusted' } },
      ],
    }),
  ).toBe(false);
  expect(api.isPreview({ ...preview(), token: 'visible label' })).toBe(false);
  expect(
    api.isBatch({
      ...batch,
      data: { ...batch.data, rows: [{ ...row(), conflicts: ['blocked'] }] },
    }),
  ).toBe(false);
});
