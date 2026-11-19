// Optional native-webview smoke check, separate from browser preview testing.
// Requires a built binary, a disposable desktop account, tauri-driver and the
// platform WebDriver. Optional project checks require an explicitly selected
// disposable recent project. Neither mode validates installers or full recovery.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { hashFile } from './release-tools.mjs';
import { checkNativeProject } from './native-project-checks.mjs';
import { checkNativeEditors } from './native-editor-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const binary = path.resolve(
  process.env.LINGFORGE_BINARY ??
    path.join(
      root,
      'target',
      'release',
      process.platform === 'win32' ? 'lingforge.exe' : 'lingforge',
    ),
);
const portText = process.env.LINGFORGE_DRIVER_PORT ?? '4444';
const port = Number(portText);
const endpoint = `http://127.0.0.1:${port}`;
class CheckLog extends Array {
  push(...items) {
    for (const item of items) console.log(`PASS ${item}`);
    return super.push(...items);
  }
}
const checks = new CheckLog();
const report = {
  startedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  binary: path.basename(binary),
  passed: false,
  checks,
};
let session;
let driver;
let driverError;
let stopping = false;

await mkdir(path.join(root, 'test-results'), { recursive: true });
const output = await mkdtemp(path.join(root, 'test-results', 'native-'));

async function request(method, route, body, timeout = 30000) {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error)
    throw new Error(`WebDriver ${route}: ${JSON.stringify(payload.value)}`);
  return payload.value;
}

async function eventually(check, description) {
  const deadline = Date.now() + 45000;
  let lastError;
  do {
    if (driverError) throw driverError;
    try {
      if (await check()) {
        if (driverError) throw driverError;
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function execute(script, args = []) {
  return request(
    'POST',
    `/session/${session}/execute/sync`,
    { script, args },
    5000,
  );
}

async function requireFreePort() {
  // Refuse an already running driver, rather than attaching to another test.
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}

try {
  assert.ok(
    process.platform === 'linux' || process.platform === 'win32',
    'Native smoke supports Linux and Windows only',
  );
  assert.ok(
    /^\d+$/.test(portText) &&
      Number.isSafeInteger(port) &&
      port >= 1024 &&
      port <= 65535,
    'LINGFORGE_DRIVER_PORT must be an integer from 1024 to 65535',
  );
  report.binarySha256 = await hashFile(binary);
  await requireFreePort();
  driver = spawn('tauri-driver', ['--port', String(port)], {
    stdio: 'inherit',
    shell: false,
  });
  driver.once('error', (error) => {
    driverError = error;
  });
  driver.once('exit', (code, signal) => {
    if (!stopping)
      driverError = new Error(`tauri-driver exited (${signal ?? code})`);
  });
  await eventually(
    async () =>
      (await request('GET', '/status', undefined, 2000))?.ready === true,
    'WebDriver readiness',
  );
  const created = await request('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: binary } } },
  });
  session = created?.sessionId;
  assert.ok(
    typeof session === 'string' && /^[a-zA-Z0-9-]+$/.test(session),
    'WebDriver must return a session ID',
  );
  report.capabilities = created.capabilities;
  await eventually(
    async () =>
      execute(
        "return /(?:Linux|Windows) desktop/.test(document.querySelector('.status-bar [role=status]')?.textContent ?? '')",
      ),
    'native IPC metadata',
  );
  assert.equal(
    await execute("return document.querySelector('h1')?.textContent"),
    'Give your world a voice.',
  );
  assert.equal(
    await execute(
      "return document.querySelector('.status-bar [role=status]').textContent.includes('Browser preview')",
    ),
    false,
  );
  checks.push('native launch and IPC metadata');

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 480 },
  ]) {
    await request('POST', `/session/${session}/window/rect`, size);
    await eventually(
      async () =>
        execute('return document.documentElement.scrollWidth <= innerWidth'),
      'layout after resizing',
    );
    checks.push(
      `no horizontal overflow at requested ${size.width}×${size.height}`,
    );
  }
  await request('POST', `/session/${session}/window/rect`, {
    width: 1280,
    height: 900,
  });
  for (const label of [
    'Phonology',
    'Lexicon',
    'Grammar',
    'Writing systems',
    'Documents',
    'Fonts & shaping',
    'Rules & analysis',
    'Resources',
  ]) {
    const element = await request('POST', `/session/${session}/element`, {
      using: 'css selector',
      value: `nav[aria-label="Workspace"] button[aria-label="${label}"]`,
    });
    const id = element?.['element-6066-11e4-a52e-4f735466cecf'];
    assert.ok(id, `Navigation element for ${label}`);
    await request(
      'POST',
      `/session/${session}/element/${encodeURIComponent(id)}/click`,
      {},
    );
    await eventually(
      async () =>
        execute(
          "return document.querySelector('h1')?.textContent === arguments[0] && document.querySelector('h1') === document.activeElement",
          [label],
        ),
      `${label} navigation and focus`,
    );
    checks.push(`${label} navigation and focus`);
  }
  if (process.env.LINGFORGE_TEST_PROJECT) {
    await checkNativeProject({
      projectPath: path.resolve(process.env.LINGFORGE_TEST_PROJECT),
      execute,
      request,
      session,
      eventually,
      checks,
    });
  }
  if (process.env.LINGFORGE_EDITOR_FIXTURE) {
    const fixture = JSON.parse(
      await readFile(process.env.LINGFORGE_EDITOR_FIXTURE, 'utf8'),
    );
    await checkNativeEditors({
      fixture,
      execute,
      request,
      session,
      eventually,
      checks,
      output,
    });
  }
  if (driverError) throw driverError;
  report.passed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
  if (session && !driverError) {
    try {
      const screenshot = await request(
        'GET',
        `/session/${session}/screenshot`,
        undefined,
        5000,
      );
      if (
        typeof screenshot === 'string' &&
        screenshot.length <= 20 * 1024 * 1024
      ) {
        await writeFile(
          path.join(output, 'failure.png'),
          Buffer.from(screenshot, 'base64'),
          { flag: 'wx' },
        );
      }
    } catch {
      /* The primary failure remains in the report. */
    }
  }
} finally {
  stopping = true;
  if (session) {
    try {
      await request('DELETE', `/session/${session}`, undefined, 5000);
    } catch (error) {
      report.cleanupError = error.message;
      report.passed = false;
      process.exitCode = 1;
    }
  }
  if (driver && driver.exitCode === null && driver.signalCode === null) {
    driver.kill();
    for (
      let attempt = 0;
      attempt < 20 && driver.exitCode === null && driver.signalCode === null;
      attempt += 1
    )
      await delay(100);
    if (driver.exitCode === null && driver.signalCode === null) {
      driver.kill('SIGKILL');
      report.cleanupError =
        'Driver required forced termination; inspect for a leftover application process.';
      report.passed = false;
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'native-smoke.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(
    `Native smoke ${report.passed ? 'passed' : 'failed'}; evidence: ${output}`,
  );
}
