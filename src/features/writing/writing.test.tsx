import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import * as api from '../../bridge/writing';
import * as glyph from '../../bridge/glyph';
import * as phonology from '../../bridge/phonology';

vi.mock('../../bridge/projects', async (original) => ({
  ...(await original<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/writing', async (original) => ({
  ...(await original<typeof import('../../bridge/writing')>()),
  listScripts: vi.fn(),
  loadScript: vi.fn(),
  saveScript: vi.fn(),
  deleteScript: vi.fn(),
  previewInput: vi.fn(),
  transliterate: vi.fn(),
  importOutline: vi.fn(),
  newIdentity: vi.fn(),
}));
vi.mock('../../bridge/glyph', async (original) => ({
  ...(await original<typeof import('../../bridge/glyph')>()),
  decodeGlyph: vi.fn(),
  editGlyph: vi.fn(),
  encodeGlyph: vi.fn(),
  exportGlyph: vi.fn(),
}));
vi.mock('../../bridge/phonology', async (original) => ({
  ...(await original<typeof import('../../bridge/phonology')>()),
  loadInventory: vi.fn(),
}));

const scriptId = '00000000-0000-4000-8000-000000000001';
const characterId = '00000000-0000-4000-8000-000000000002';
const glyphId = '00000000-0000-4000-8000-000000000003';
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: 'project-one',
      metadata: { name: 'Alphabet fixture', languageName: '', description: '' },
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
const script = (): api.WritingSystem => ({
  id: scriptId,
  revision: 0,
  data: {
    ...api.blankScript(),
    name: 'Test alphabet',
    characters: [
      {
        id: characterId,
        name: 'First',
        transliteration: 't',
        phonemeIds: [],
        defaultGlyphId: glyphId,
        glyphs: [
          {
            id: glyphId,
            name: 'Original',
            outline: {
              viewBox: [0, 0, 100, 100],
              paths: ['M 0 0 L 100 100 L 0 100 Z'],
            },
          },
        ],
      },
    ],
  },
});
const geometry = (): glyph.EditableOutline => ({
  viewBox: [0, 0, 100, 100],
  paths: [
    [
      { kind: 'move', points: [[0, 0]] },
      { kind: 'line', points: [[100, 100]] },
      { kind: 'line', points: [[0, 100]] },
      { kind: 'close', points: [] },
    ],
  ],
});
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(glyph.decodeGlyph).mockResolvedValue(geometry());
  vi.mocked(glyph.exportGlyph).mockResolvedValue(null);
  vi.mocked(api.newIdentity).mockResolvedValue(
    '00000000-0000-4000-8000-000000000020',
  );
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(phonology.loadInventory).mockResolvedValue({
    phonemes: [],
    total: 0,
    profile: { revision: 0, data: { notes: '', patterns: [], rules: [] } },
  });
  vi.mocked(api.listScripts).mockResolvedValue([
    { id: scriptId, name: 'Test alphabet', characterCount: 1 },
  ]);
  vi.mocked(api.loadScript).mockResolvedValue(script());
  vi.mocked(api.previewInput).mockImplementation(
    async (_session, _draft, input, commit) => ({
      units: input && commit ? [{ kind: 'symbol', characterId }] : [],
      pending: input && !commit ? input : '',
      issues: [],
    }),
  );
  vi.mocked(api.transliterate).mockResolvedValue({ text: '', issues: [] });
  vi.mocked(api.saveScript).mockImplementation(
    async (_session, saved, data) => ({
      script: { id: saved!.id, revision: saved!.revision + 1, data },
      workspace: workspace(),
    }),
  );
});
async function open(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: 'Writing systems' },
    ),
  );
  await user.click(
    await within(
      screen.getByRole('region', { name: 'Writing systems in this project' }),
    ).findByRole('button', { name: /Test alphabet/ }),
  );
  return screen.findByLabelText('Writing-system name');
}
it('persists character identities after text selection, undo, redo and glyph replacement', async () => {
  vi.mocked(api.importOutline).mockResolvedValue({
    viewBox: [0, 0, 10, 10],
    paths: ['M 0 0 L 10 0 L 5 10 Z'],
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(screen.getByRole('button', { name: 'Insert First' }));
  await user.keyboard('{Shift>}{ArrowLeft}{/Shift}{Backspace}');
  expect(screen.getByText(/Caret 0 of 0/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo text edit' }));
  // Undo restores the backward selection that existed before deletion.
  expect(screen.getByText(/Caret 0 of 1 · 1 selected/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Redo text edit' }));
  expect(screen.getByText(/Caret 0 of 0/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo text edit' }));
  await user.click(screen.getByRole('button', { name: 'Replace outline' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save writing system' }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Save writing system' }));
  expect(
    await screen.findByText('Writing system and sample text saved.'),
  ).toBeVisible();
  const data = vi.mocked(api.saveScript).mock.calls[0]![2];
  expect(data.sample).toEqual([{ kind: 'symbol', characterId }]);
  expect(data.characters[0]!.glyphs[0]!.id).toBe(glyphId);
  expect(data.characters[0]!.glyphs[0]!.outline.paths).toEqual([
    'M 0 0 L 10 0 L 5 10 Z',
  ]);
});
it('retains pending input during composition and navigation until explicit insertion or discard', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  const input = screen.getByLabelText('Input', { exact: true });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 't' } });
  expect(screen.getByRole('button', { name: 'Insert input' })).toBeDisabled();
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(api.previewInput).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    't',
    true,
    false,
  );
  fireEvent.compositionEnd(input, { data: 't' });
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Save your changes?' }),
    ).getByRole('button', { name: 'Keep editing' }),
  );
  expect(input).toHaveValue('t');
  await user.click(screen.getByRole('button', { name: 'Insert input' }));
  await waitFor(() => expect(input).toHaveValue(''));
  expect(screen.getByText(/Caret 1 of 1/)).toBeVisible();
});
it('keeps failed drafts and cancelled glyph imports unchanged', async () => {
  vi.mocked(api.importOutline).mockResolvedValue(null);
  vi.mocked(api.saveScript).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const name = await open(user);
  await user.click(screen.getByRole('button', { name: 'Replace outline' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Replace outline' }),
    ).toBeEnabled(),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save writing system' }),
    ).toBeDisabled(),
  );
  await user.clear(name);
  await user.type(name, 'Changed alphabet');
  await user.click(screen.getByRole('button', { name: 'Save writing system' }));
  expect(await screen.findByText('Backup unavailable.')).toBeVisible();
  expect(name).toHaveValue('Changed alphabet');
  expect(
    screen.queryByText('Writing system and sample text saved.'),
  ).not.toBeInTheDocument();
});
it('checks structured clipboard provenance and rejects malformed outlines and wire records', () => {
  const units: api.TextUnit[] = [
    { kind: 'symbol', characterId },
    { kind: 'text', text: 'ã' },
  ];
  const clipboard = api.encodeClipboard('project', scriptId, units);
  expect(api.decodeClipboard(clipboard, 'project', scriptId)).toEqual(units);
  expect(() => api.decodeClipboard(clipboard, 'another', scriptId)).toThrow();
  expect(() =>
    api.decodeClipboard('ordinary text', 'project', scriptId),
  ).toThrow();
  expect(api.isScript(script())).toBe(true);
  expect(api.isScript({ ...script(), id: 'visible-name' })).toBe(false);
  expect(api.isOutline({ viewBox: [0, 0, 0, 100], paths: ['M 0 0'] })).toBe(
    false,
  );
  expect(
    api.isOutline({ viewBox: [0, 0, 100, 100], paths: ['<script/>'] }),
  ).toBe(false);
});

it('applies authored geometry with undo/redo while retaining variant and text identities', async () => {
  const saved = script();
  saved.data.sample = [{ kind: 'symbol', characterId }];
  vi.mocked(api.loadScript).mockResolvedValue(saved);
  const changed = geometry();
  changed.paths[0]![0]!.points[0] = [25, 0];
  vi.mocked(glyph.editGlyph).mockResolvedValue(changed);
  vi.mocked(glyph.encodeGlyph).mockResolvedValue({
    viewBox: [0, 0, 100, 100],
    paths: ['M 25 0 L 100 100 L 0 100 Z'],
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(screen.getByRole('button', { name: 'Edit geometry' }));
  const dialog = await screen.findByRole('dialog', { name: /Edit glyph/ });
  const x = within(dialog).getByLabelText('Point X');
  await user.clear(x);
  await user.type(x, '25');
  expect(
    within(dialog).getByRole('button', { name: 'Apply glyph to draft' }),
  ).toBeDisabled();
  await user.click(
    within(dialog).getByRole('button', { name: 'Apply numeric edit' }),
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Undo geometry' }),
    ).toBeEnabled(),
  );
  expect(glyph.editGlyph).toHaveBeenCalledWith('session-one', geometry(), {
    kind: 'move_point',
    path: 0,
    command: 0,
    point: 0,
    position: [25, 0],
    grid: 25,
  });
  await user.click(
    within(dialog).getByRole('button', { name: 'Undo geometry' }),
  );
  expect(within(dialog).getByLabelText('Point X')).toHaveValue(0);
  await user.click(
    within(dialog).getByRole('button', { name: 'Redo geometry' }),
  );
  expect(within(dialog).getByLabelText('Point X')).toHaveValue(25);
  await user.click(
    within(dialog).getByRole('button', { name: 'Apply glyph to draft' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: /Edit glyph/ }),
    ).not.toBeInTheDocument(),
  );
  expect(api.saveScript).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save writing system' }));
  await waitFor(() => expect(api.saveScript).toHaveBeenCalled());
  const data = vi.mocked(api.saveScript).mock.calls[0]![2];
  expect(data.characters[0]!.id).toBe(characterId);
  expect(data.characters[0]!.glyphs[0]!.id).toBe(glyphId);
  expect(data.sample).toEqual(saved.data.sample);
  expect(data.characters[0]!.glyphs[0]!.outline.paths[0]).toContain('M 25 0');
});

it('retains failed numeric edits and confirms discard of pending glyph fields', async () => {
  vi.mocked(glyph.editGlyph).mockRejectedValue({
    code: 'invalid_input',
    message: 'Coordinate out of bounds.',
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(screen.getByRole('button', { name: 'Edit geometry' }));
  const dialog = await screen.findByRole('dialog', { name: /Edit glyph/ });
  const x = within(dialog).getByLabelText('Point X');
  await user.clear(x);
  await user.type(x, '100001');
  await user.click(
    within(dialog).getByRole('button', { name: 'Apply numeric edit' }),
  );
  expect(
    await within(dialog).findByText('Coordinate out of bounds.'),
  ).toBeVisible();
  expect(x).toHaveValue(100001);
  await user.click(
    within(dialog).getByRole('button', { name: 'Close glyph editor' }),
  );
  const confirmation = screen.getByRole('dialog', {
    name: 'Discard glyph edits?',
  });
  await user.click(
    within(confirmation).getByRole('button', { name: 'Keep editing glyph' }),
  );
  expect(x).toHaveValue(100001);
  await user.click(
    within(dialog).getByRole('button', { name: 'Close glyph editor' }),
  );
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Discard glyph edits?' }),
    ).getByRole('button', { name: 'Discard glyph edits' }),
  );
  expect(glyph.encodeGlyph).not.toHaveBeenCalled();
  expect(api.saveScript).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Save writing system' }),
  ).toBeDisabled();
});

it('does not report cancelled SVG export as successful or save an open glyph editor', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(screen.getByRole('button', { name: 'Edit geometry' }));
  const dialog = await screen.findByRole('dialog', { name: /Edit glyph/ });
  await user.click(
    within(dialog).getByRole('button', { name: 'Export current SVG' }),
  );
  await waitFor(() => expect(glyph.exportGlyph).toHaveBeenCalled());
  expect(
    within(dialog).queryByText(/Current geometry exported/),
  ).not.toBeInTheDocument();
  // A submit or native-close Save cannot bypass the nested draft boundary.
  fireEvent.submit(
    screen
      .getByRole('button', { name: 'Save writing system' })
      .closest('form')!,
  );
  expect(
    await within(dialog).findByText(
      'Apply or close the glyph editor before saving the writing system.',
    ),
  ).toBeVisible();
  expect(api.saveScript).not.toHaveBeenCalled();
});

it('commits one point move at pointer release and cancels an interrupted drag', async () => {
  const changed = geometry();
  changed.paths[0]![0]!.points[0] = [25, 25];
  vi.mocked(glyph.editGlyph).mockResolvedValue(changed);
  vi.stubGlobal(
    'DOMPoint',
    class {
      constructor(
        public x: number,
        public y: number,
      ) {}
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    },
  );
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(screen.getByRole('button', { name: 'Edit geometry' }));
  const canvas = await screen.findByRole('group', { name: 'Glyph canvas' });
  Object.defineProperties(canvas, {
    getScreenCTM: { value: () => ({ inverse: () => ({}) }) },
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => false },
  });
  const event = (name: string, x: number, y: number) => {
    const e = new MouseEvent(name, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(e, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
    });
    return e;
  };
  const anchor = canvas.querySelector(
    'circle[data-command="0"][data-point="0"]',
  )!;
  fireEvent(anchor, event('pointerdown', 0, 0));
  fireEvent(canvas, event('pointermove', 25, 25));
  expect(glyph.editGlyph).not.toHaveBeenCalled();
  fireEvent(canvas, event('pointercancel', 25, 25));
  expect(glyph.editGlyph).not.toHaveBeenCalled();
  fireEvent(anchor, event('pointerdown', 0, 0));
  fireEvent(canvas, event('pointermove', 10, 10));
  fireEvent(canvas, event('pointerup', 25, 25));
  await waitFor(() => expect(glyph.editGlyph).toHaveBeenCalledTimes(1));
  expect(vi.mocked(glyph.editGlyph).mock.calls[0]![2]).toEqual({
    kind: 'move_point',
    path: 0,
    command: 0,
    point: 0,
    position: [25, 25],
    grid: 25,
  });
});

it('validates typed geometry at the bridge boundary', () => {
  expect(glyph.isEditableOutline(geometry())).toBe(true);
  expect(
    glyph.isEditableOutline({ viewBox: [0, 0, 100, 100], paths: [] }),
  ).toBe(true);
  expect(
    glyph.isEditableOutline({ ...geometry(), viewBox: [0, 0, -1, 100] }),
  ).toBe(false);
  expect(
    glyph.isEditableOutline({
      ...geometry(),
      paths: [[{ kind: 'line', points: [[0, 0]] }]],
    }),
  ).toBe(false);
  expect(
    glyph.isEditableOutline({
      ...geometry(),
      paths: [[{ kind: 'move', points: [[Infinity, 0]] }]],
    }),
  ).toBe(false);
  expect(
    glyph.isEditableOutline({
      ...geometry(),
      paths: [[{ kind: 'move', points: [] }]],
    }),
  ).toBe(false);
});
