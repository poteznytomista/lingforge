import { spawn } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyArtifact,
  findBundle,
  hashFile,
  preflight,
} from './release-tools.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let candidate;
const startedAt = new Date().toISOString();

try {
  // A single conventional output location keeps stale/cross-target artifacts out.
  for (const name of [
    'CARGO_TARGET_DIR',
    'CARGO_BUILD_TARGET',
    'TAURI_CONFIG',
  ]) {
    if (process.env[name])
      throw new Error(`Unset ${name} for this packaging entry point.`);
  }
  if (process.argv.length !== 2)
    throw new Error(
      'release:package accepts no extra build/configuration overrides.',
    );
  const evidence = await preflight(root);
  const bundleRoot = path.join(root, 'target', 'release', 'bundle');
  let existing;
  try {
    existing = await lstat(bundleRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing)
    throw new Error(
      'target/release/bundle already exists. Preserve earlier evidence and use a fresh checkout/build directory; nothing was removed.',
    );

  const output = path.join(root, 'release-candidates');
  await mkdir(output, { recursive: true });
  candidate = await mkdtemp(
    path.join(
      output,
      `lingforge-${evidence.version}-${evidence.platform}-${evidence.arch}-`,
    ),
  );
  // Interruption leaves a started directory without a completion marker.
  await writeFile(
    path.join(candidate, 'STARTED.txt'),
    'Collection is incomplete unless COLLECTED.txt and candidate.json are present. Do not distribute an incomplete directory.\n',
    { flag: 'wx' },
  );
  const args = [
    process.env.npm_execpath,
    'run',
    'desktop:build',
    '--',
    '--ci',
    '--',
    '--locked',
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`Desktop build failed (${signal ?? code}).`)),
    );
  });
  const after = await preflight(root);
  if (JSON.stringify(evidence) !== JSON.stringify(after))
    throw new Error('Pinned packaging inputs changed during the build.');
  const source = await findBundle(
    path.join(bundleRoot, evidence.platform === 'linux' ? 'appimage' : 'nsis'),
    evidence.platform,
  );
  const artifact = await copyArtifact(
    source,
    path.join(candidate, path.basename(source)),
  );
  const binaryName =
    evidence.platform === 'linux' ? 'lingforge' : 'lingforge.exe';
  const binarySha256 = await hashFile(
    path.join(root, 'target', 'release', binaryName),
  );
  await cp(
    path.join(root, 'public', 'licenses'),
    path.join(candidate, 'licenses'),
    { recursive: true, force: false, errorOnExist: true },
  );
  await cp(path.join(root, 'docs'), path.join(candidate, 'docs'), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  await cp(
    path.join(root, 'tests', 'fixtures'),
    path.join(candidate, 'tests', 'fixtures'),
    { recursive: true, force: false, errorOnExist: true },
  );
  await cp(
    path.join(root, '.github', 'workflows', 'verify.yml'),
    path.join(candidate, 'build-workflow.yml'),
    { force: false, errorOnExist: true },
  );
  for (const name of ['README.md', 'ROADMAP.md', 'ARCHITECTURE.md']) {
    await cp(path.join(root, name), path.join(candidate, name), {
      force: false,
      errorOnExist: true,
    });
  }
  for (const name of ['package-lock.json', 'Cargo.lock']) {
    await writeFile(
      path.join(candidate, name),
      await readFile(path.join(root, name)),
      { flag: 'wx' },
    );
  }
  await writeFile(
    path.join(candidate, 'candidate.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: 'unverified-candidate',
        startedAt,
        collectedAt: new Date().toISOString(),
        ...evidence,
        host: { release: os.release(), version: os.version() },
        artifact,
        buildBinary: { file: binaryName, sha256: binarySha256 },
        workflowCommit: process.env.GITHUB_SHA ?? null,
        workflowRun: process.env.GITHUB_RUN_ID ?? null,
        buildCommand: 'npm run desktop:build -- --ci -- --locked',
        validation:
          'Not attested by this manifest. Attach the separate release checklist and actual logs.',
        signing:
          'Not inspected. Public distribution requires a signing decision and verification.',
        notices:
          'Bundled notices copied; resolved transitive license audit still required.',
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  await writeFile(
    path.join(candidate, 'COLLECTED.txt'),
    'Collection completed. This is still an unverified candidate; see candidate.json.\n',
    { flag: 'wx' },
  );
  console.log(
    `Candidate collected at ${candidate}. No release was published or approved.`,
  );
} catch (error) {
  if (candidate) {
    await writeFile(
      path.join(candidate, 'failure.json'),
      `${JSON.stringify({ startedAt, failedAt: new Date().toISOString(), message: error.message }, null, 2)}\n`,
      { flag: 'wx' },
    ).catch(() => {});
  }
  console.error(error.message);
  process.exitCode = 1;
}
