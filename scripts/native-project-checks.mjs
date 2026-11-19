// Opt-in checks against an explicitly selected disposable project.
import assert from 'node:assert/strict';
import { nativeUi } from './native-ui.mjs';

export async function checkNativeProject(context) {
  const { checks, execute, request, session, eventually } = context;
  const {
    element,
    click,
    button,
    navigate,
    fill,
    read,
    openRecent,
    saveMetadata,
  } = nativeUi(context);
  await navigate('Overview');
  await openRecent();
  const originalDescription = await read('Description');
  const description = `${originalDescription}\nWebDriver: Łaŋa θa · e\u0301`;
  await fill('Description', description);
  await saveMetadata();
  checks.push('native exact Unicode metadata input and explicit save');

  const backupCount = await execute(
    "return document.querySelectorAll('.backup-list > li').length",
  );
  await button('Create backup');
  await eventually(
    async () =>
      (await execute(
        "return document.querySelectorAll('.backup-list > li').length",
      )) ===
      backupCount + 1,
    'additional manual snapshot',
  );
  checks.push('native manual backup creation');

  await fill('Description', `${description} UNSAVED`);
  await button('Close project');
  await button('Keep editing', 'dialog[open]');
  assert.equal(await read('Description'), `${description} UNSAVED`);
  checks.push('native close-project cancellation preserves draft');
  await button('Close project');
  await button('Discard changes', 'dialog[open]');
  await eventually(
    async () =>
      !(await execute(
        "return Boolean(document.querySelector('.project-panel'))",
      )),
    'project closed after explicit discard',
  );
  await openRecent();
  assert.equal(await read('Description'), description);
  checks.push(
    'native saved metadata survives close/reopen; discarded edit absent',
  );

  const phonemeLabel = `θ-${Date.now()}`;
  const renamedPhoneme = phonemeLabel.replace('θ', 'ð');
  const findPhoneme =
    "return [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === 'Inspect phoneme ' + arguments[0])";
  await navigate('Phonology');
  await button('New phoneme');
  await fill('IPA / phoneme label', phonemeLabel);
  await button('Save phoneme');
  await element(findPhoneme, [phonemeLabel], 'saved phoneme in inventory');
  checks.push('native phoneme creation and inventory persistence');

  await navigate('Lexicon');
  await button('New entry');
  const lemma = `θa\u0301-${Date.now()}`;
  await fill('Lemma / headword', lemma);
  await fill('Definition 1', 'Disposable native integration check');
  const findPhonemeOption =
    "return [...document.querySelectorAll('section[aria-label=\"Entry pronunciation\"] option')].find(e => e.textContent.startsWith(arguments[0] + ' · '))";
  const optionId = await element(
    findPhonemeOption,
    [phonemeLabel],
    'saved phoneme offered for linked pronunciation',
  );
  const phonemeId = await request(
    'GET',
    `/session/${session}/element/${encodeURIComponent(optionId)}/property/value`,
  );
  await click(findPhonemeOption, [phonemeLabel], 'phoneme option');
  await button(
    'Add phoneme segment',
    'section[aria-label="Entry pronunciation"]',
  );
  await button('Save entry');
  const findEntry =
    "return [...document.querySelectorAll('.lexicon-list li button')].find(e => e.querySelector('strong')?.textContent === arguments[0])";
  await element(findEntry, [lemma], 'saved Unicode lexical entry');
  checks.push('native Unicode lexical entry creation and persistence');

  await navigate('Overview');
  await navigate('Lexicon');
  await fill('Search lexicon', lemma);
  await click(findEntry, [lemma], 'search result after editor remount');
  assert.equal(await read('Lemma / headword'), lemma);
  assert.equal(
    await read('Definition 1'),
    'Disposable native integration check',
  );
  checks.push('native Unicode lexicon search and detail reload');

  assert.equal(
    await execute(
      'return document.querySelector(\'[aria-label="Entry pronunciation preview"]\')?.textContent',
    ),
    phonemeLabel,
  );
  checks.push('native linked pronunciation persists across editor remount');
  await navigate('Phonology');
  await click(findPhoneme, [phonemeLabel], 'referenced phoneme');
  await eventually(
    () =>
      execute(
        "return [...document.querySelectorAll('main button')].find(e => e.textContent.trim() === 'Delete phoneme')?.disabled === true",
      ),
    'deletion blocked for referenced phoneme',
  );
  checks.push('native referenced phoneme deletion blocked');
  await fill('IPA / phoneme label', renamedPhoneme);
  await button('Save phoneme');
  await element(findPhoneme, [renamedPhoneme], 'renamed phoneme');
  await navigate('Lexicon');
  await click(findEntry, [lemma], 'entry retaining the renamed phoneme');
  await eventually(
    async () =>
      (await execute(
        'return document.querySelector(\'[aria-label="Entry pronunciation preview"]\')?.textContent',
      )) === renamedPhoneme,
    'current phoneme label resolved in persisted pronunciation',
  );
  const renamedOption = await element(
    findPhonemeOption,
    [renamedPhoneme],
    'renamed phoneme option',
  );
  assert.equal(
    await request(
      'GET',
      `/session/${session}/element/${encodeURIComponent(renamedOption)}/property/value`,
    ),
    phonemeId,
  );
  checks.push(
    'native phoneme rename preserves identity and updates linked preview',
  );

  await button('Delete entry', '[aria-label="Entry editor"]');
  await button('Delete entry', 'dialog[open]');
  await eventually(
    async () => !(await execute(findEntry, [lemma])),
    'explicit deletion of the newly created test entry',
  );
  checks.push('native confirmed deletion of unreferenced test entry');

  await navigate('Phonology');
  await click(findPhoneme, [renamedPhoneme], 'now-unreferenced test phoneme');
  await button('Delete phoneme');
  await button('Delete phoneme', 'dialog[open]');
  await eventually(
    async () => !(await execute(findPhoneme, [renamedPhoneme])),
    'phoneme deletion after its reference was removed',
  );
  checks.push('native phoneme deletion allowed after reference removal');

  await navigate('Overview');
  await fill('Description', originalDescription);
  await saveMetadata();
  await button('Close project');
  await openRecent();
  assert.equal(await read('Description'), originalDescription);
  await button('Close project');
  checks.push('native fixture metadata restored and project closed');
}
