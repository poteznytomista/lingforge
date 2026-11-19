import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App';
import * as projects from '../../bridge/projects';
import * as writing from '../../bridge/writing';
import * as fonts from '../../bridge/fonts';
import scriptSource from '../../../tests/fixtures/fonts/simple-script.json';
import profileSource from '../../../tests/fixtures/fonts/simple-profile.json';

vi.mock('../../bridge/projects', async (original) => ({
  ...(await original<typeof import('../../bridge/projects')>()),
  loadWorkspace: vi.fn(),
}));
vi.mock('../../bridge/writing', async (original) => ({
  ...(await original<typeof import('../../bridge/writing')>()),
  listScripts: vi.fn(),
}));
vi.mock('../../bridge/fonts', async (original) => ({
  ...(await original<typeof import('../../bridge/fonts')>()),
  loadFont: vi.fn(),
  saveFont: vi.fn(),
  previewFont: vi.fn(),
  exportFont: vi.fn(),
  deleteFont: vi.fn(),
}));
const script = scriptSource as unknown as writing.WritingSystem;
const data = profileSource as unknown as fonts.FontDraft;
const workspace = (): projects.WorkspaceSnapshot => ({
  active: {
    sessionId: 'session-one',
    summary: {
      id: 'project-one',
      metadata: { name: 'Font project', languageName: '', description: '' },
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
const preview = (): fonts.FontPreview => ({
  bytes: [0, 1, 0, 0],
  text: '\ue000\ue001',
  glyphs: [
    {
      glyphId: 4,
      variantId: data.glyphs[3]!.variantId,
      start: 0,
      end: 2,
      xAdvance: 1000,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
    },
  ],
  warnings: ['Synthetic test result; no native font rendering verified.'],
});
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(projects.loadWorkspace).mockResolvedValue(workspace());
  vi.mocked(writing.listScripts).mockResolvedValue([
    { id: script.id, name: script.data.name, characterCount: 5 },
  ]);
  vi.mocked(fonts.loadFont).mockResolvedValue({
    script,
    profile: null,
    initial: data,
  });
  vi.mocked(fonts.saveFont).mockImplementation(
    async (_s, script, saved, data) => ({
      profile: {
        scriptId: script.id,
        revision: (saved?.revision ?? -1) + 1,
        data,
      },
      workspace: workspace(),
    }),
  );
  vi.mocked(fonts.previewFont).mockResolvedValue(preview());
  vi.mocked(fonts.exportFont).mockResolvedValue(null);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: vi.fn(), delete: vi.fn() },
  });
  vi.stubGlobal(
    'FontFace',
    class {
      load() {
        return Promise.reject(new Error('Synthetic renderer failure'));
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
});
async function open(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Project name');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole(
      'button',
      { name: 'Fonts & shaping' },
    ),
  );
  await user.click(
    await screen.findByRole('button', { name: script.data.name }),
  );
  return screen.findByLabelText('Font family');
}
it('keeps stable sample identities through cluster selection, deletion, undo and save', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  await user.click(
    screen.getByRole('button', { name: 'Build current preview' }),
  );
  await user.click(await screen.findByRole('button', { name: '0–2' }));
  expect(screen.getByLabelText('Selection start')).toHaveValue(0);
  expect(screen.getByLabelText('Selection end')).toHaveValue(2);
  expect(
    await screen.findByText(/This webview rejected the generated font/),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Delete selected characters' }),
  );
  expect(
    screen.queryByRole('region', { name: 'Generated font preview' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Undo sample' }));
  await user.click(screen.getByRole('button', { name: 'Save font profile' }));
  expect(
    await screen.findByText('Font profile and shaping sample saved.'),
  ).toBeVisible();
  expect(vi.mocked(fonts.saveFont).mock.calls[0]![3].sample).toEqual(
    data.sample,
  );
  expect(vi.mocked(fonts.saveFont).mock.calls[0]![3].glyphs).toEqual(
    data.glyphs,
  );
});
it('retains a failed profile save and protects navigation until explicit discard', async () => {
  vi.mocked(fonts.saveFont).mockRejectedValue({
    code: 'io',
    message: 'Backup unavailable.',
  });
  const user = userEvent.setup();
  render(<App />);
  const family = await open(user);
  await user.clear(family);
  await user.type(family, 'Unsaved font');
  await user.click(screen.getByRole('button', { name: 'Preferences' }));
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Save your changes?' }),
    ).getByRole('button', { name: 'Save & continue' }),
  );
  expect(
    await within(screen.getByRole('dialog')).findByText('Backup unavailable.'),
  ).toBeVisible();
  expect(family).toHaveValue('Unsaved font');
  expect(
    screen.queryByText('Font profile and shaping sample saved.'),
  ).not.toBeInTheDocument();
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Discard changes',
    }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Preferences' }),
  ).toBeVisible();
});
it('requires export rights and treats picker cancellation as no export or project save', async () => {
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  const button = screen.getByRole('button', { name: 'Export current TTF' });
  expect(button).toBeDisabled();
  await user.click(screen.getByLabelText(/I have permission to distribute/));
  await user.click(button);
  await waitFor(() =>
    expect(fonts.exportFont).toHaveBeenCalledWith(
      'session-one',
      script,
      data,
      true,
    ),
  );
  await waitFor(() => expect(button).toBeEnabled());
  expect(
    screen.queryByText(/Current draft font exported/),
  ).not.toBeInTheDocument();
  expect(fonts.saveFont).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Source units per em'), {
    target: { value: '2000' },
  });
  expect(button).toBeDisabled();
});
it('rejects malformed font responses before constructing a native font face', () => {
  expect(fonts.isFontDraft(data)).toBe(true);
  expect(fonts.isFontPreview(preview())).toBe(true);
  expect(
    fonts.isFontDraft({
      ...data,
      metrics: { ...data.metrics, unitsPerEm: Infinity },
    }),
  ).toBe(false);
  expect(fonts.isFontDraft({ ...data, sample: ['visible label'] })).toBe(false);
  expect(fonts.isFontPreview({ ...preview(), bytes: [256] })).toBe(false);
  expect(
    fonts.isFontPreview({
      ...preview(),
      glyphs: [{ ...preview().glyphs[0], start: 2, end: 1 }],
    }),
  ).toBe(false);
});
it('retains invalid mappings across glyph pages and blocks saving until corrected', async () => {
  const many = structuredClone(data);
  const source = structuredClone(script);
  while (many.glyphs.length < 17) {
    const character = source.data.characters.find((c) => c.glyphs.length < 8)!;
    const id = `00000000-0000-4000-8000-${(0x200 + many.glyphs.length).toString(16).padStart(12, '0')}`;
    character.glyphs.push({
      ...character.glyphs[0]!,
      id,
      name: `Alternate ${many.glyphs.length}`,
    });
    many.glyphs.push({
      ...many.glyphs[0]!,
      characterId: character.id,
      variantId: id,
      codepoint: null,
    });
  }
  vi.mocked(fonts.loadFont).mockResolvedValue({
    script: source,
    profile: null,
    initial: many,
  });
  const user = userEvent.setup();
  render(<App />);
  await open(user);
  fireEvent.change(screen.getByLabelText('Unicode scalar 1'), {
    target: { value: 'U+invalid' },
  });
  await user.click(screen.getByRole('button', { name: 'Next glyphs' }));
  expect(screen.queryByLabelText('Unicode scalar 1')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save font profile' }));
  expect(
    await screen.findByText(/Check other glyph pages for invalid values/),
  ).toBeVisible();
  expect(fonts.saveFont).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Previous glyphs' }));
  expect(screen.getByLabelText('Unicode scalar 1')).toHaveValue('U+invalid');
  fireEvent.change(screen.getByLabelText('Unicode scalar 1'), {
    target: { value: 'U+E100' },
  });
  await user.click(screen.getByRole('button', { name: 'Save font profile' }));
  await waitFor(() => expect(fonts.saveFont).toHaveBeenCalledTimes(1));
  const saved = vi.mocked(fonts.saveFont).mock.calls[0]![3];
  expect(saved.glyphs[0]!.codepoint).toBe(0xe100);
  expect(saved.sample).toEqual(data.sample);
});
it('disposes generated font faces and ignores a load that finishes after its preview is removed', async () => {
  const pending: Array<() => void> = [];
  vi.stubGlobal(
    'FontFace',
    class {
      load() {
        return new Promise<this>((resolve) => {
          pending.push(() => resolve(this));
        });
      }
    },
  );
  const user = userEvent.setup();
  const view = render(<App />);
  const family = await open(user);
  await user.click(
    screen.getByRole('button', { name: 'Build current preview' }),
  );
  await screen.findByText('Loading generated font into this webview…');
  fireEvent.change(family, { target: { value: 'Changed during font load' } });
  await act(async () => {
    pending.shift()!();
  });
  expect(document.fonts.add).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('region', { name: 'Generated font preview' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Build current preview' }),
  );
  await screen.findByText('Loading generated font into this webview…');
  await act(async () => {
    pending.shift()!();
  });
  expect(await screen.findByLabelText(/Native font sample/)).toHaveValue(
    preview().text,
  );
  expect(document.fonts.add).toHaveBeenCalledTimes(1);
  const face = vi.mocked(document.fonts.add).mock.calls[0]![0];
  view.unmount();
  expect(document.fonts.delete).toHaveBeenCalledWith(face);
});
