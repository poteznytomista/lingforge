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
import * as api from '../../bridge/notebook';
import * as writing from '../../bridge/writing';
import * as phonology from '../../bridge/phonology';

vi.mock('../../bridge/projects', async (original) => ({
  ...(await original<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/notebook', async (original) => ({
  ...(await original<typeof import('../../bridge/notebook')>()),
  listRecords: vi.fn(),
  loadRecord: vi.fn(),
  saveRecord: vi.fn(),
  editParagraph: vi.fn(),
  convertParagraph: vi.fn(),
  documentText: vi.fn(),
  chooseImport: vi.fn(),
  exportRecord: vi.fn(),
}));
vi.mock('../../bridge/writing', async (original) => ({
  ...(await original<typeof import('../../bridge/writing')>()),
  listScripts: vi.fn(),
  loadScript: vi.fn(),
  newIdentity: vi.fn(),
  previewInput: vi.fn(),
}));
vi.mock('../../bridge/phonology', async (original) => ({
  ...(await original<typeof import('../../bridge/phonology')>()),
  loadInventory: vi.fn(),
}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: id(100),
      metadata: { name: 'Notebook fixture', languageName: '', description: '' },
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
const paragraph = (): api.Paragraph => ({
  id: id(2),
  scriptId: null,
  units: [
    { kind: 'text', text: 'a' },
    { kind: 'text', text: 'b' },
  ],
  links: [{ start: 0, end: 2, entryId: id(3) }],
});
const documentRecord = (): api.NotebookRecord => ({
  id: id(1),
  revision: 0,
  data: {
    kind: 'document',
    content: { title: 'A text', notes: '', paragraphs: [paragraph()] },
  },
});
const grammarRecord = (): api.NotebookRecord => ({
  id: id(4),
  revision: 0,
  data: {
    kind: 'grammar',
    content: { ...api.blankGrammar(), title: 'Grammar notes' },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(api.listRecords).mockImplementation(async (_session, kind) => [
    {
      id: kind === 'document' ? id(1) : id(4),
      title: kind === 'document' ? 'A text' : 'Grammar notes',
      kind,
    },
  ]);
  vi.mocked(api.loadRecord).mockImplementation(async (_session, recordId) =>
    recordId === id(1) ? documentRecord() : grammarRecord(),
  );
  vi.mocked(api.saveRecord).mockImplementation(
    async (_session, recordId, revision, data) => ({
      record: { id: recordId, revision: (revision ?? -1) + 1, data },
      workspace: workspace(),
    }),
  );
  vi.mocked(writing.listScripts).mockResolvedValue([]);
  vi.mocked(writing.newIdentity).mockResolvedValue(id(20));
  vi.mocked(writing.previewInput).mockResolvedValue({
    units: [{ kind: 'text', text: 'x' }],
    pending: '',
    issues: [],
  });
  vi.mocked(api.documentText).mockResolvedValue({ text: 'ab', issues: [] });
  vi.mocked(api.chooseImport).mockResolvedValue(null);
  vi.mocked(phonology.loadInventory).mockResolvedValue({
    phonemes: [],
    total: 0,
    profile: { revision: 0, data: { notes: '', patterns: [], rules: [] } },
  });
});
async function open(
  user: ReturnType<typeof userEvent.setup>,
  kind: 'Documents' | 'Grammar' = 'Documents',
) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: kind },
    ),
  );
  await user.click(
    await screen.findByRole('button', {
      name: kind === 'Documents' ? /A text/ : /Grammar notes/,
    }),
  );
  return screen.findByLabelText('Title');
}
it('undo restores document text and lexical annotations together after a range edit', async () => {
  vi.mocked(api.editParagraph).mockResolvedValue({
    ...paragraph(),
    units: [],
    links: [],
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  const canvas = await screen.findByRole('group', { name: 'Paragraph text' });
  canvas.focus();
  await user.keyboard('{Control>}a{/Control}{Backspace}');
  await waitFor(() => expect(screen.getByText(/Caret 0 of 0/)).toBeVisible());
  expect(api.editParagraph).toHaveBeenCalledWith(
    'session-one',
    paragraph(),
    0,
    2,
    [],
  );
  expect(
    screen.queryByRole('button', { name: /Inspect linked range/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Undo record edit' }));
  expect(
    await screen.findByRole('button', { name: 'Inspect linked range [0, 2)' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Redo record edit' }));
  await screen.findByRole('group', { name: 'Paragraph text' });
  await user.click(screen.getByRole('button', { name: 'Save document' }));
  await waitFor(() => expect(api.saveRecord).toHaveBeenCalled());
  const saved = vi.mocked(api.saveRecord).mock.calls[0]![3];
  expect(saved.kind).toBe('document');
  if (saved.kind === 'document')
    expect(saved.content.paragraphs[0]).toEqual({
      ...paragraph(),
      units: [],
      links: [],
    });
});
it('composition and failed insertion retain pending input and block navigation saves', async () => {
  vi.mocked(api.editParagraph).mockRejectedValue({
    code: 'invalid_input',
    message: 'Insertion unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  const input = await screen.findByLabelText('Input', { exact: true });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'x' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(screen.getByRole('button', { name: 'Insert input' })).toBeDisabled();
  expect(writing.previewInput).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: 'x' });
  await user.click(screen.getByRole('button', { name: 'Insert input' }));
  expect(await screen.findByText('Insertion unavailable.')).toBeVisible();
  expect(input).toHaveValue('x');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  const dialog = screen.getByRole('dialog', { name: 'Save your changes?' });
  await user.click(
    within(dialog).getByRole('button', { name: 'Save & continue' }),
  );
  expect(api.saveRecord).not.toHaveBeenCalled();
  expect(dialog).toBeVisible();
  await user.click(
    within(dialog).getByRole('button', { name: 'Keep editing' }),
  );
  expect(input).toHaveValue('x');
});
it('keeps failed document saves and cancelled structured imports reviewable', async () => {
  vi.mocked(api.saveRecord).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const title = await open(user);
  await user.click(
    screen.getByRole('button', { name: 'Review structured file' }),
  );
  await waitFor(() => expect(api.chooseImport).toHaveBeenCalled());
  expect(title).toHaveValue('A text');
  await user.type(title, ' revised');
  await user.click(screen.getByRole('button', { name: 'Save document' }));
  expect(await screen.findByText('Backup unavailable.')).toBeVisible();
  expect(title).toHaveValue('A text revised');
  expect(
    screen.getByRole('button', { name: 'Export saved document' }),
  ).toBeDisabled();
});
it('keeps descriptive grammar feature identities through a save', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user, 'Grammar');
  await user.click(screen.getByRole('button', { name: 'Add feature' }));
  await user.type(
    await screen.findByLabelText('Feature name'),
    'Evidentiality',
  );
  await user.type(
    screen.getByLabelText('Values', { exact: true }),
    'direct; reported',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save grammar section' }),
  );
  await waitFor(() => expect(api.saveRecord).toHaveBeenCalled());
  const draft = vi.mocked(api.saveRecord).mock.calls[0]![3];
  expect(draft.kind).toBe('grammar');
  if (draft.kind === 'grammar')
    expect(draft.content.features[0]).toEqual({
      id: id(20),
      name: 'Evidentiality',
      values: 'direct; reported',
      description: '',
    });
});
it('requires a complete conversion preview before applying it to the draft', async () => {
  const script = (n: number): writing.WritingSystem => ({
    id: id(n),
    revision: 0,
    data: {
      ...writing.blankScript(),
      name: `Script ${n}`,
      characters: [
        {
          ...writing.newCharacter(id(n + 1)),
          name: 'Symbol',
          transliteration: 'a',
        },
      ],
    },
  });
  const source = script(10);
  const target = script(30);
  const p: api.Paragraph = {
    ...paragraph(),
    scriptId: source.id,
    units: [{ kind: 'symbol', characterId: id(11) }],
    links: [{ start: 0, end: 1, entryId: id(3) }],
  };
  vi.mocked(api.loadRecord).mockResolvedValue({
    ...documentRecord(),
    data: {
      kind: 'document',
      content: { title: 'A text', notes: '', paragraphs: [p] },
    },
  });
  vi.mocked(writing.listScripts).mockResolvedValue(
    [source, target].map((s) => ({
      id: s.id,
      name: s.data.name,
      characterCount: 1,
    })),
  );
  vi.mocked(writing.loadScript).mockImplementation(async (_session, value) =>
    value === source.id ? source : target,
  );
  vi.mocked(api.convertParagraph)
    .mockResolvedValueOnce({
      paragraph: null,
      issues: ['Missing target mapping.'],
    })
    .mockResolvedValueOnce({
      paragraph: {
        ...p,
        scriptId: target.id,
        units: [{ kind: 'symbol', characterId: id(31) }],
      },
      issues: [],
    });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.selectOptions(
    await screen.findByLabelText('Target writing system'),
    target.id,
  );
  await user.click(screen.getByRole('button', { name: 'Preview conversion' }));
  expect(await screen.findByText('Missing target mapping.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Apply conversion to draft' }),
  ).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText('Replacement for Symbol'),
    id(31),
  );
  await user.click(screen.getByRole('button', { name: 'Preview conversion' }));
  await user.click(
    await screen.findByRole('button', { name: 'Apply conversion to draft' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save document' }));
  await waitFor(() => expect(api.saveRecord).toHaveBeenCalled());
  const draft = vi.mocked(api.saveRecord).mock.calls[0]![3];
  if (draft.kind === 'document') {
    expect(draft.content.paragraphs[0]!.scriptId).toBe(target.id);
    expect(draft.content.paragraphs[0]!.links).toEqual(p.links);
  }
});
it('rejects malformed notebook responses and contradictory conversion results', () => {
  expect(api.isNotebookRecord(documentRecord())).toBe(true);
  expect(api.isNotebookRecord({ ...documentRecord(), revision: -1 })).toBe(
    false,
  );
  expect(
    api.isParagraph({
      ...paragraph(),
      links: [{ start: 1, end: 3, entryId: id(3) }],
    }),
  ).toBe(false);
  expect(
    api.isParagraph({
      ...paragraph(),
      units: [{ kind: 'symbol', characterId: id(11) }],
    }),
  ).toBe(false);
  expect(
    api.isConversion({ paragraph: paragraph(), issues: ['Missing mapping'] }),
  ).toBe(false);
  expect(api.isConversion({ paragraph: null, issues: [] })).toBe(false);
});
