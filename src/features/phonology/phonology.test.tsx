import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import * as projects from '../../bridge/projects';
import * as api from '../../bridge/phonology';
import * as lexicon from '../../bridge/lexicon';

vi.mock('../../bridge/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/phonology', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/phonology')>()),
  loadInventory: vi.fn(),
  loadPhoneme: vi.fn(),
  savePhoneme: vi.fn(),
  deletePhoneme: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock('../../bridge/lexicon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge/lexicon')>()),
  loadLexeme: vi.fn(),
  listLexicon: vi.fn(),
}));

const phonemeId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';
const childId = '00000000-0000-4000-8000-000000000003';
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: 'project-one',
      metadata: {
        name: 'Phonology fixture',
        languageName: '',
        description: '',
      },
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
const inventory = (label = 'ã'): api.Inventory => ({
  total: 1,
  phonemes: [
    {
      id: phonemeId,
      label,
      kind: 'consonant',
      articulation: api.blankPhoneme().articulation,
    },
  ],
  profile: { revision: 0, data: { notes: '', patterns: [], rules: [] } },
});
const details = (): api.PhonemeDetails => ({
  phoneme: {
    id: phonemeId,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    data: { ...api.blankPhoneme(), label: 'ã' },
  },
  scriptIncoming: [],
  scriptIncomingCount: 0,
  incomingCount: 1,
  incoming: [
    {
      entryId,
      lemma: 'linked word',
      formId: null,
      formText: '',
      occurrences: 1,
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(api.loadInventory).mockResolvedValue(inventory());
  vi.mocked(api.loadPhoneme).mockResolvedValue(details());
  vi.mocked(lexicon.listLexicon).mockResolvedValue({
    total: 0,
    items: [],
    limit: 50,
    offset: 0,
    categories: [],
  });
  vi.mocked(lexicon.loadLexeme).mockResolvedValue({
    entry: {
      id: entryId,
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      data: {
        ...lexicon.blankEntry(),
        lemma: 'linked word',
        pronunciation: 'independent text',
        pronunciationSegments: [
          { kind: 'text', text: 'ˈ' },
          { kind: 'phoneme', phonemeId, annotation: 'ː' },
        ],
        senses: [{ id: childId, definition: 'meaning', notes: '' }],
      },
    },
    incoming: [],
    incomingCount: 0,
  });
});
async function openPhonology(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: 'Phonology' },
    ),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Inspect phoneme ã' }),
  );
  return screen.findByLabelText('IPA / phoneme label');
}

it('preserves identity on rename and opens a linked word with its current phoneme label', async () => {
  const next = details();
  next.phoneme.data.label = 'ɲ';
  next.phoneme.revision = 1;
  const nextWorkspace = workspace();
  nextWorkspace.active!.summary.revision = 2;
  vi.mocked(api.savePhoneme).mockImplementation(async () => {
    vi.mocked(api.loadInventory).mockResolvedValue(inventory('ɲ'));
    return { details: next, workspace: nextWorkspace };
  });
  const user = userEvent.setup();
  render(<App />);
  const input = await openPhonology(user);
  await user.clear(input);
  await user.type(input, 'ɲ');
  await user.keyboard('{Control>}s{/Control}');
  expect(await screen.findByText('Phoneme saved.')).toBeVisible();
  expect(api.savePhoneme).toHaveBeenCalledWith(
    'session-one',
    details().phoneme,
    expect.objectContaining({ label: 'ɲ' }),
  );
  expect(screen.getByText(`ID ${phonemeId}`)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete phoneme' })).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: /linked word.*Entry pronunciation/ }),
  );
  expect(await screen.findByLabelText('Lemma / headword')).toHaveValue(
    'linked word',
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText('Entry pronunciation preview'),
    ).toHaveTextContent('ˈɲː'),
  );
  expect(screen.getByLabelText('Pronunciation', { exact: true })).toHaveValue(
    'independent text',
  );
  expect(lexicon.loadLexeme).toHaveBeenCalledWith('session-one', entryId);
});

it('retains a failed phoneme draft and guards navigation', async () => {
  vi.mocked(api.savePhoneme).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const input = await openPhonology(user);
  await user.clear(input);
  await user.type(input, 'Changed');
  await user.click(screen.getByRole('button', { name: 'Save phoneme' }));
  expect(await screen.findByText('Backup unavailable.')).toBeVisible();
  expect(input).toHaveValue('Changed');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  const dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Keep editing' }),
  );
  expect(input).toHaveValue('Changed');
  expect(screen.queryByText('Phoneme saved.')).not.toBeInTheDocument();
});

it('saves descriptive syllable slots without claiming rule execution', async () => {
  vi.mocked(api.saveProfile).mockImplementation(
    async (_sessionId, _revision, data) => ({
      workspace: workspace(),
      profile: {
        revision: 1,
        data: {
          ...data,
          patterns: data.patterns.map((pattern) => ({
            ...pattern,
            id: childId,
          })),
        },
      },
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await openPhonology(user);
  await user.click(
    screen.getByRole('button', { name: 'Syllables & phonotactics' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Add syllable pattern' }),
  );
  await user.type(screen.getByLabelText('Pattern 1 label'), 'Open pattern');
  await user.type(screen.getByLabelText('Pattern 1 onset'), 'optional cluster');
  await user.type(screen.getByLabelText('Pattern 1 nucleus'), 'my nucleus');
  await user.click(screen.getByRole('button', { name: 'Save descriptions' }));
  expect(
    await screen.findByText('Phonology descriptions saved.'),
  ).toBeVisible();
  expect(api.saveProfile).toHaveBeenCalledWith(
    'session-one',
    0,
    expect.objectContaining({
      patterns: [
        expect.objectContaining({
          label: 'Open pattern',
          onset: 'optional cluster',
          nucleus: 'my nucleus',
        }),
      ],
    }),
  );
  expect(
    screen.getByText(/automatic generation and rule execution remain planned/),
  ).toBeVisible();
});

it('rejects malformed phonology and segment responses', () => {
  expect(api.isInventory(inventory())).toBe(true);
  expect(api.isInventory({ ...inventory(), total: 1001 })).toBe(false);
  expect(api.isPhonemeDetails(details())).toBe(true);
  expect(
    api.isPhonemeDetails({
      ...details(),
      phoneme: { ...details().phoneme, id: 'ã' },
    }),
  ).toBe(false);
  expect(
    api.isSegments([
      { kind: 'phoneme', phonemeId, annotation: 'ː' },
      { kind: 'text', text: ' ' },
    ]),
  ).toBe(true);
  expect(
    api.isSegments([
      { kind: 'phoneme', phonemeId: 'visible-label', annotation: '' },
    ]),
  ).toBe(false);
  expect(api.isSegments([{ kind: 'text', text: '' }])).toBe(false);
});
