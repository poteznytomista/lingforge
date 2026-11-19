import assert from 'node:assert/strict';

export function nativeUi({
  projectPath,
  execute,
  request,
  session,
  eventually,
}) {
  const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
  const findButton =
    "return [...document.querySelectorAll(arguments[0] + ' button')].find(e => e.textContent.trim() === arguments[1] && !e.disabled)";
  const findControl =
    "const label = [...document.querySelectorAll('label')].find(e => { const copy = e.cloneNode(true); copy.querySelectorAll('input,textarea,select,.field-description').forEach(c => c.remove()); return copy.textContent.trim() === arguments[0]; }); return label && (label.control || label.querySelector('input,textarea,select'))";

  async function element(script, args, description) {
    let result;
    await eventually(async () => {
      result = await execute(script, args);
      return Boolean(result?.[elementKey]);
    }, description);
    return result[elementKey];
  }

  async function ready(id, description) {
    await eventually(
      () =>
        request(
          'GET',
          `/session/${session}/element/${encodeURIComponent(id)}/enabled`,
        ),
      `${description} enabled`,
    );
    // Center the real control inside nested scrolling regions so the fixed
    // status bar cannot cover WebDriver's default bottom-edge scroll position.
    await execute(
      "const node = arguments[0]; (node.tagName === 'OPTION' ? node.parentElement : node).scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});",
      [{ [elementKey]: id }],
    );
  }

  async function click(script, args, description) {
    const id = await element(script, args, description);
    await ready(id, description);
    await request(
      'POST',
      `/session/${session}/element/${encodeURIComponent(id)}/click`,
      {},
    );
  }

  const button = (name, scope = 'main') =>
    click(findButton, [scope, name], `${name} button`);
  const navigate = (name) =>
    click(
      "return document.querySelector('nav[aria-label=Workspace] button[aria-label=" +
        JSON.stringify(name) +
        "]')",
      [],
      `${name} navigation`,
    );

  async function fill(label, value) {
    const id = await element(findControl, [label], `${label} control`);
    await ready(id, label);
    const route = `/session/${session}/element/${encodeURIComponent(id)}`;
    await request('POST', `${route}/clear`, {});
    // WebKit's WebDriver needs the Enter key code for textarea line breaks.
    // Keep the assertion against the original string, including real newlines.
    await request('POST', `${route}/value`, {
      text: value.replace(/\n/g, '\uE007'),
    });
    assert.equal(await read(label), value, `${label} receives exact Unicode`);
  }

  async function read(label) {
    const id = await element(findControl, [label], `${label} control`);
    return request(
      'GET',
      `/session/${session}/element/${encodeURIComponent(id)}/property/value`,
    );
  }

  async function openRecent() {
    await eventually(
      () => execute("return !document.querySelector('.project-panel')"),
      'project closed before reopening',
    );
    await click(
      "return [...document.querySelectorAll('.recent-project-button')].find(e => e.querySelector('small')?.textContent === arguments[0])",
      [projectPath],
      'explicit disposable recent project',
    );
    await eventually(
      () => execute("return Boolean(document.querySelector('.project-panel'))"),
      'opened project',
    );
  }

  async function saveMetadata() {
    await button('Save project');
    await eventually(
      () =>
        execute(
          "return document.querySelector('.project-panel .technical-badge')?.textContent === 'SAVED'",
        ),
      'committed project metadata',
    );
  }

  return {
    element,
    click,
    button,
    navigate,
    fill,
    read,
    openRecent,
    saveMetadata,
  };
}
