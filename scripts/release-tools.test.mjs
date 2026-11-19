// Authored release-tool regression checks. Run only after execution is authorized.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  copyArtifact,
  findBundle,
  inspectInputs,
  readInputs,
} from './release-tools.mjs';

// Synthetic configuration values test the guards; these are not validated pins.
function fixture() {
  const pkg = {
    name: 'lingforge',
    version: '0.1.0',
    packageManager: 'npm@11.0.0',
    dependencies: { example: '1.2.3' },
    devDependencies: {},
  };
  return {
    'package.json': JSON.stringify(pkg),
    'package-lock.json': JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      lockfileVersion: 3,
      packages: {
        '': { dependencies: pkg.dependencies, devDependencies: {} },
        'node_modules/example': { version: '1.2.3' },
      },
    }),
    'Cargo.toml': '[workspace.package]\nversion = "0.1.0"\nedition = "2021"\n',
    'Cargo.lock':
      'version = 4\n[[package]]\nname = "example"\nversion = "1.2.3"\n',
    '.nvmrc': '24.15.0\n',
    'rust-toolchain.toml': '[toolchain]\nchannel = "1.90.0"\n',
    'src-tauri/tauri.conf.json': JSON.stringify({
      version: '../package.json',
      bundle: { targets: [] },
    }),
    'src-tauri/tauri.linux.conf.json': JSON.stringify({
      bundle: { targets: ['appimage'] },
    }),
    'src-tauri/tauri.windows.conf.json': JSON.stringify({
      bundle: {
        targets: ['nsis'],
        windows: {
          nsis: { installMode: 'currentUser' },
          webviewInstallMode: { type: 'offlineInstaller' },
        },
      },
    }),
  };
}
const host = { platform: 'linux', arch: 'x64', nodeVersion: '24.15.0' };

test('accepts consistent synthetic pins on both native target platforms', () => {
  for (const platform of ['linux', 'win32'])
    assert.deepEqual(
      inspectInputs(fixture(), { ...host, platform }).issues,
      [],
    );
});

test('reports absent locks and floating toolchains together', () => {
  const files = fixture();
  delete files['package-lock.json'];
  delete files['Cargo.lock'];
  files['.nvmrc'] = '24';
  files['rust-toolchain.toml'] = '[toolchain]\nchannel = "stable"';
  const { issues } = inspectInputs(files, host);
  for (const fragment of [
    'package-lock.json',
    'Cargo.lock',
    '.nvmrc',
    'Rust 1.90+',
  ])
    assert.ok(
      issues.some((issue) => issue.includes(fragment)),
      fragment,
    );
});

test('rejects version drift, unsupported hosts, and unexpected JSON shapes', () => {
  const files = fixture();
  files['Cargo.toml'] = '[workspace.package]\nversion = "0.2.0"';
  const issues = inspectInputs(files, {
    ...host,
    platform: 'darwin',
    arch: 'arm64',
    nodeVersion: '24.16.0',
  }).issues;
  for (const fragment of [
    'versions must match',
    'native Linux and Windows',
    'x64',
    'Running Node',
  ])
    assert.ok(
      issues.some((issue) => issue.includes(fragment)),
      fragment,
    );
  for (const value of ['null', '[]', '{']) {
    files['package.json'] = value;
    assert.ok(
      inspectInputs(files, host).issues.some((issue) =>
        issue.includes('Cannot parse package.json'),
      ),
    );
  }
});

test('rejects changed direct dependency resolutions and online Windows bootstrapper', () => {
  const files = fixture();
  const lock = JSON.parse(files['package-lock.json']);
  lock.packages['node_modules/example'].version = '1.2.4';
  files['package-lock.json'] = JSON.stringify(lock);
  const windows = JSON.parse(files['src-tauri/tauri.windows.conf.json']);
  windows.bundle.windows.webviewInstallMode.type = 'downloadBootstrapper';
  windows.app = { security: { csp: null } };
  files['src-tauri/tauri.windows.conf.json'] = JSON.stringify(windows);
  const { issues } = inspectInputs(files, host);
  for (const fragment of ['example', 'offline WebView2', 'must not override'])
    assert.ok(
      issues.some((issue) => issue.includes(fragment)),
      fragment,
    );
});

async function temporary(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'lingforge-release-test-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('missing input files are reported without generating replacements', async (t) => {
  const directory = await temporary(t);
  assert.deepEqual(await readInputs(directory), {});
  assert.ok(inspectInputs({}, host).issues.length > 0);
});

test('artifact collection hashes content and refuses overwrites or empty artifacts', async (t) => {
  const directory = await temporary(t);
  const source = path.join(directory, 'source.AppImage');
  const destination = path.join(directory, 'candidate.AppImage');
  await writeFile(source, 'abc');
  const result = await copyArtifact(source, destination);
  assert.equal(result.bytes, 3);
  assert.equal(
    result.sha256,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  await writeFile(source, 'changed');
  await assert.rejects(copyArtifact(source, destination), { code: 'EEXIST' });
  assert.equal(await readFile(destination, 'utf8'), 'abc');
  await writeFile(source, '');
  await assert.rejects(
    copyArtifact(source, path.join(directory, 'empty.AppImage')),
    /nonempty regular/,
  );
});

test('bundle discovery refuses missing, ambiguous, or non-file candidates', async (t) => {
  const directory = await temporary(t);
  await assert.rejects(findBundle(directory, 'linux'), /found 0/);
  await writeFile(path.join(directory, 'one.AppImage'), 'one');
  await writeFile(path.join(directory, 'windows.exe'), 'windows');
  assert.equal(
    await findBundle(directory, 'linux'),
    path.join(directory, 'one.AppImage'),
  );
  assert.equal(
    await findBundle(directory, 'win32'),
    path.join(directory, 'windows.exe'),
  );
  await writeFile(path.join(directory, 'two.AppImage'), 'two');
  await assert.rejects(findBundle(directory, 'linux'), /found 2/);
  const other = await temporary(t);
  await mkdir(path.join(other, 'directory.AppImage'));
  await assert.rejects(findBundle(other, 'linux'), /not a regular file/);
});
