// Release tooling only. No application data is read and no release is published.
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { copyFile, lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const inputPaths = [
  'package.json',
  'package-lock.json',
  'Cargo.toml',
  'Cargo.lock',
  '.nvmrc',
  'rust-toolchain.toml',
  'src-tauri/tauri.conf.json',
  'src-tauri/tauri.linux.conf.json',
  'src-tauri/tauri.windows.conf.json',
];

const exactVersion = (value) =>
  typeof value === 'string' &&
  value.trim() === value &&
  /^\d+\.\d+\.\d+$/.test(value);

// These two fields have deliberately constrained syntax. This is not a TOML parser.
function quotedField(source, section, field) {
  const body = source.split(`[${section}]`)[1]?.split(/^\[/m)[0];
  return body?.match(
    new RegExp(`^${field}\\s*=\\s*"([^"\\r\\n]+)"\\s*(?:#.*)?$`, 'm'),
  )?.[1];
}

export function inspectInputs(files, { platform, arch, nodeVersion }) {
  const issues = [];
  const check = (condition, message) => {
    if (!condition) issues.push(message);
  };
  for (const name of inputPaths)
    check(
      Boolean(files[name]?.trim()),
      `Missing or empty ${name}. Follow docs/release/README.md; do not fabricate locks.`,
    );
  const json = (name) => {
    try {
      const value = JSON.parse(files[name] ?? '');
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected an object.');
      return value;
    } catch {
      issues.push(`Cannot parse ${name} as JSON.`);
      return {};
    }
  };
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const tauri = json('src-tauri/tauri.conf.json');
  const linux = json('src-tauri/tauri.linux.conf.json');
  const windows = json('src-tauri/tauri.windows.conf.json');
  const nodePin = files['.nvmrc']?.trim();
  const rustPin = quotedField(
    files['rust-toolchain.toml'] ?? '',
    'toolchain',
    'channel',
  );
  const cargoVersion = quotedField(
    files['Cargo.toml'] ?? '',
    'workspace.package',
    'version',
  );
  check(
    platform === 'linux' || platform === 'win32',
    'Candidates are limited to native Linux and Windows hosts.',
  );
  check(
    arch === 'x64',
    'Only x64 candidates are currently specified; other architectures need their own validation plan.',
  );
  check(
    exactVersion(pkg.version),
    'package.json version must be a numeric major.minor.patch release version.',
  );
  check(
    cargoVersion === pkg.version,
    'Cargo workspace and npm application versions must match.',
  );
  check(
    tauri.version === '../package.json',
    'Tauri must obtain its version from package.json.',
  );
  check(
    exactVersion(nodePin) &&
      nodePin.startsWith('24.') &&
      Number(nodePin.split('.')[1]) >= 15,
    'Pin .nvmrc to a validated exact Node 24 version, at least 24.15.0.',
  );
  check(
    nodeVersion === nodePin,
    `Running Node ${nodeVersion} must match .nvmrc (${nodePin ?? 'missing'}).`,
  );
  check(
    exactVersion(rustPin) &&
      rustPin.startsWith('1.') &&
      Number(rustPin.split('.')[1]) >= 90,
    'Replace the temporary stable Rust channel with a validated exact Rust 1.90+ version.',
  );
  check(
    typeof pkg.packageManager === 'string' &&
      /^npm@\d+\.\d+\.\d+$/.test(pkg.packageManager),
    'Record the validated exact npm version in package.json packageManager (npm@x.y.z).',
  );
  check(
    lock.lockfileVersion === 3 &&
      lock.name === pkg.name &&
      lock.version === pkg.version,
    'Commit a reviewed npm v3 lockfile for this application version.',
  );
  for (const kind of ['dependencies', 'devDependencies']) {
    const expected = pkg[kind] ?? {};
    const actual = lock.packages?.['']?.[kind] ?? {};
    check(
      Object.keys(expected).length === Object.keys(actual).length &&
        Object.entries(expected).every(
          ([name, version]) => actual[name] === version,
        ),
      `package-lock.json root ${kind} must match package.json.`,
    );
    for (const [name, version] of Object.entries(expected)) {
      check(
        exactVersion(version) &&
          lock.packages?.[`node_modules/${name}`]?.version === version,
        `The direct dependency ${name} must have its exact version recorded in the lockfile.`,
      );
    }
  }
  // Cargo's --locked check remains authoritative for Cargo.lock consistency.
  check(
    /^version = [34]\s*$/m.test(files['Cargo.lock'] ?? '') &&
      (files['Cargo.lock'] ?? '').includes('[[package]]'),
    'Cargo.lock must be a generated and reviewed Cargo lockfile; --locked will check resolution.',
  );
  check(
    Array.isArray(tauri.bundle?.targets) && tauri.bundle.targets.length === 0,
    'Base bundle targets must be empty; explicit platform overlays select artifacts.',
  );
  check(
    JSON.stringify(linux.bundle?.targets) === '["appimage"]',
    'Linux must select only the AppImage bundle.',
  );
  check(
    JSON.stringify(windows.bundle?.targets) === '["nsis"]',
    'Windows must select only the NSIS bundle.',
  );
  check(
    windows.bundle?.windows?.webviewInstallMode?.type === 'offlineInstaller',
    'Windows candidates must include offline WebView2 provisioning.',
  );
  check(
    windows.bundle?.windows?.nsis?.installMode === 'currentUser',
    'Windows candidates must use current-user installation.',
  );
  check(
    !tauri.bundle?.createUpdaterArtifacts && !tauri.plugins?.updater,
    'Automatic updates are outside the current release configuration.',
  );
  for (const [name, config] of [
    ['Linux', linux],
    ['Windows', windows],
  ]) {
    check(
      !config.version &&
        !config.identifier &&
        !config.app &&
        !config.build &&
        !config.plugins,
      `${name} configuration must not override application identity, security, plugins or build inputs.`,
    );
    check(
      !config.bundle?.createUpdaterArtifacts,
      `${name} must not create updater artifacts.`,
    );
  }
  return {
    issues,
    version: pkg.version,
    nodePin,
    rustPin,
    npmPin:
      typeof pkg.packageManager === 'string'
        ? pkg.packageManager.slice(4)
        : undefined,
    platform,
    arch,
  };
}

export async function readInputs(root) {
  const files = {};
  for (const name of inputPaths) {
    try {
      files[name] = await readFile(path.join(root, name), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}

export function commandOutput(command, args, root) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect ${command}: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`,
    );
  return result.stdout.trim();
}

export async function preflight(root) {
  const files = await readInputs(root);
  const result = inspectInputs(files, {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
  });
  if (result.issues.length)
    throw new Error(
      `Release prerequisites are incomplete:\n- ${result.issues.join('\n- ')}`,
    );
  if (!process.env.npm_execpath)
    throw new Error(
      'Invoke release tooling through npm run so its npm executable can be identified.',
    );
  const tools = {
    node: process.versions.node,
    npm: commandOutput(
      process.execPath,
      [process.env.npm_execpath, '--version'],
      root,
    ),
    rustc: commandOutput('rustc', ['--version'], root),
    cargo: commandOutput('cargo', ['--version'], root),
    rustHost: commandOutput('rustc', ['-vV'], root).match(/^host: (.+)$/m)?.[1],
  };
  if (
    tools.npm !== result.npmPin ||
    tools.rustc.split(' ')[1] !== result.rustPin ||
    tools.cargo.split(' ')[1] !== result.rustPin
  ) {
    throw new Error(
      'Active npm/Rust/Cargo versions differ from the reviewed toolchain pins.',
    );
  }
  const expectedHost =
    process.platform === 'linux'
      ? 'x86_64-unknown-linux-gnu'
      : 'x86_64-pc-windows-msvc';
  if (tools.rustHost !== expectedHost)
    throw new Error(
      `Candidate packaging requires the native Rust host ${expectedHost}.`,
    );
  return {
    version: result.version,
    platform: result.platform,
    arch: result.arch,
    tools,
    inputs: Object.fromEntries(
      inputPaths.map((name) => [
        name,
        createHash('sha256').update(files[name]).digest('hex'),
      ]),
    ),
  };
}

export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function findBundle(directory, platform) {
  const expected =
    platform === 'linux'
      ? '.AppImage'
      : platform === 'win32'
        ? '.exe'
        : undefined;
  if (!expected) throw new Error('Unsupported bundle platform.');
  const candidates = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // An installer must be a direct regular file, never a followed link.
    if (entry.name.endsWith(expected)) {
      if (!entry.isFile())
        throw new Error(`Bundle is not a regular file: ${entry.name}`);
      candidates.push(path.join(directory, entry.name));
    }
  }
  if (candidates.length !== 1)
    throw new Error(
      `Expected one ${expected} installer, found ${candidates.length}. Use a fresh build directory.`,
    );
  return candidates[0];
}

export async function copyArtifact(source, destination) {
  const before = await lstat(source);
  if (!before.isFile() || before.size === 0)
    throw new Error('Artifact must be a nonempty regular file.');
  const sourceHash = await hashFile(source);
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  const sha256 = await hashFile(destination);
  const after = await lstat(source);
  if (
    sourceHash !== sha256 ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(
      'Artifact changed during collection; this candidate is incomplete.',
    );
  }
  return { file: path.basename(destination), bytes: before.size, sha256 };
}
