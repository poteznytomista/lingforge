import { fileURLToPath } from 'node:url';
import { preflight } from './release-tools.mjs';

try {
  const evidence = await preflight(
    fileURLToPath(new URL('../', import.meta.url)),
  );
  console.log(JSON.stringify(evidence, null, 2));
  console.log(
    'Packaging inputs are pinned. This does not establish tests, native support or release approval.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
