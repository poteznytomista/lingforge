// Real native UI checks on the synthetic alphabet made by native_fixture.rs.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativeUi } from './native-ui.mjs';

export async function checkNativeEditors(context) {
  const { fixture, execute, request, session, eventually, checks, output } =
    context;
  assert.equal(fixture.fixtureSource, 'native_fixture');
  const { element, click, button, navigate, fill, read, openRecent } = nativeUi(
    {
      ...context,
      projectPath: fixture.projectPath,
    },
  );
  const css = (selector) =>
    click('return document.querySelector(arguments[0])', [selector], selector);
  const units = () =>
    execute(
      "return [...document.querySelectorAll('.symbol-canvas .text-unit')].map(e => e.getAttribute('aria-label'))",
    );
  const count = async (expected) =>
    eventually(
      async () => (await units()).length === expected,
      `${expected} structured units`,
    );
  async function keys(text) {
    const id = await element(
      "return document.querySelector('.symbol-canvas')",
      [],
      'structured editor',
    );
    await request(
      'POST',
      `/session/${session}/element/${encodeURIComponent(id)}/value`,
      { text },
    );
  }
  async function saveScript() {
    await button('Save writing system');
    await eventually(
      () =>
        execute(
          "return document.querySelector('[aria-label=\"Writing-system editor\"] .technical-badge')?.textContent === 'SAVED'",
        ),
      'saved writing system',
    );
  }
  async function openScript() {
    await navigate('Writing systems');
    await click(
      "return [...document.querySelectorAll('.script-list button')].find(e => e.firstChild?.textContent === arguments[0])",
      [fixture.scriptName],
      'fixture alphabet in writing-system list',
    );
    await element(
      "return document.querySelector('.symbol-canvas')",
      [],
      'alphabet editor',
    );
  }
  await navigate('Overview');
  await openRecent();
  await openScript();
  assert.deepEqual(await units(), []);
  await fill('Input', 't');
  await eventually(
    () =>
      execute(
        "return document.querySelector('.input-feedback')?.textContent.includes('Pending: t')",
      ),
    'overlapping mapping prefix pending',
  );
  await count(0);
  await button('Insert input');
  await count(1);
  assert.equal((await units())[0], 'Position 1: Test T');
  checks.push(
    'native mapped prefix waits; explicit insertion commits shorter mapping',
  );

  await fill('Input', 'th');
  await button('Insert input');
  await count(2);
  assert.equal((await units())[1], 'Position 2: Test TH');
  await fill('Input', 'tt');
  await button('Insert input');
  await count(4);
  checks.push(
    'native longest mapping and one-to-many mapping insert complete units',
  );

  await fill('Input', 'q');
  await button('Insert input');
  await eventually(
    () =>
      execute(
        "return document.querySelector('.input-feedback')?.textContent.toLowerCase().includes('multiple outputs')",
      ),
    'ambiguous mapping reported',
  );
  await count(4);
  assert.equal(await read('Input'), 'q');
  await button('Clear pending input');
  checks.push('native ambiguous input is retained without partial insertion');

  await keys('\uE009a\uE000');
  assert.equal(
    await execute(
      "return document.querySelectorAll('.text-unit[data-selected=true]').length",
    ),
    4,
  );
  await keys('\uE017');
  await count(0);
  await button('Undo text edit');
  await count(4);
  await button('Redo text edit');
  await count(0);
  await button('Undo text edit');
  await count(4);
  checks.push(
    'native structured selection, Delete and undo/redo preserve atomic units',
  );

  await keys('\uE009a\uE000');
  // WebKit drops the second chord when both are sent in one value command.
  await keys('\uE009c\uE000');
  await keys('\uE017');
  await count(0);
  await keys('\uE009v\uE000');
  await count(4);
  assert.deepEqual(await units(), [
    'Position 1: Test T',
    'Position 2: Test TH',
    'Position 3: Test T',
    'Position 4: Test T',
  ]);
  checks.push(
    'native structured clipboard copy/paste preserves saved-script character identities',
  );
  await saveScript();
  await navigate('Overview');
  await openScript();
  await count(4);
  checks.push('native alphabet sample persists across editor reload');

  const outlineSelector = '[aria-label="Character 1"] .glyph-variant svg path';
  const originalPath = await execute(
    'return document.querySelector(arguments[0]).getAttribute("d")',
    [outlineSelector],
  );
  await button('Edit geometry', '[aria-label="Character 1"]');
  await click(
    "return [...document.querySelectorAll('dialog select option')].find(e => e.textContent.startsWith('Path 1 ·'))",
    [],
    'first glyph path',
  );
  await fill('Point X', '20');
  await button('Apply numeric edit', 'dialog[open]');
  await button('Apply glyph to draft', 'dialog[open]');
  await eventually(
    async () =>
      (await execute(
        'return document.querySelector(arguments[0])?.getAttribute("d")',
        [outlineSelector],
      )) !== originalPath,
    'edited outline applied',
  );
  await count(4);
  await saveScript();
  await navigate('Overview');
  await openScript();
  const editedPath = await execute(
    'return document.querySelector(arguments[0]).getAttribute("d")',
    [outlineSelector],
  );
  assert.match(editedPath, /^M 25 100/); // Default 25-unit grid snaps both coordinates.
  assert.deepEqual(await units(), [
    'Position 1: Test T',
    'Position 2: Test TH',
    'Position 3: Test T',
    'Position 4: Test T',
  ]);
  checks.push(
    'native numeric glyph edit persists without changing existing symbol text',
  );

  await navigate('Fonts & shaping');
  await button(fixture.scriptName, '[aria-label="Font writing systems"]');
  await css('.font-palette [aria-label="Insert Test T"]');
  await css('.font-palette [aria-label="Insert Test TH"]');
  await button('Save font profile');
  await eventually(
    () =>
      execute(
        "return document.querySelector('.font-editor .technical-badge')?.textContent === 'SAVED PROFILE'",
      ),
    'saved font profile',
  );
  await button('Build current preview');
  await eventually(
    () =>
      execute(
        "const e=document.querySelector('.font-platform-run'); return e && document.fonts.check('16px ' + e.style.fontFamily,e.value)",
      ),
    'native generated FontFace load',
  );
  assert.equal(
    await execute("return document.querySelector('.font-platform-run').value"),
    '\uE000\uE001',
  );
  assert.equal(
    await execute(
      "return document.querySelectorAll('.font-preview tbody tr').length",
    ),
    2,
  );
  const screenshot = await request('GET', `/session/${session}/screenshot`);
  await writeFile(
    path.join(output, 'native-generated-font.png'),
    Buffer.from(screenshot, 'base64'),
    { flag: 'wx' },
  );
  checks.push(
    'native generated TTF loads through FontFace and displays two mapped characters',
  );
  await navigate('Overview');
  await navigate('Fonts & shaping');
  await button(fixture.scriptName, '[aria-label="Font writing systems"]');
  assert.equal(
    await execute(
      "return document.querySelectorAll('.font-source-run button').length",
    ),
    2,
  );
  await button('Build current preview');
  await eventually(
    () =>
      execute(
        "const e=document.querySelector('.font-platform-run'); return e && document.fonts.check('16px ' + e.style.fontFamily,e.value)",
      ),
    'reloaded profile font build',
  );
  checks.push(
    'native font profile and stable-character shaping sample survive reload',
  );
  await navigate('Overview');
  await button('Close project');
}
