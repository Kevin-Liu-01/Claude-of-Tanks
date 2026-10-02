// The Workers' runtime declarations are generated, never committed (SIZE-P13 / INFRA-P18, 2026-10-01): 31,146 of the
// 32,634 TypeScript lines under cloudflare/ were the two worker-configuration.d.ts files, rewritten by every wrangler
// bump. Each Worker's typecheck and test scripts now run `wrangler types` first and the file is gitignored, so a clean
// checkout (npm ci, no generated file) typechecks and tests as before.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
for (const worker of ['rooms', 'telemetry']) {
  const manifest = JSON.parse(read(`cloudflare/${worker}/package.json`));
  assert.match(manifest.scripts.types, /^wrangler types\b/, `${worker}: npm run types generates the declarations`);
  for (const script of ['typecheck', 'test']) {
    assert.match(manifest.scripts[script], /^npm run -s types\b[^&]*&& /, `${worker}: ${script} regenerates the declarations first`);
  }
  assert.match(read(`cloudflare/${worker}/.gitignore`), /^worker-configuration\.d\.ts$/m, `${worker}: the generated file is ignored`);
  const tracked = execFileSync('git', ['ls-files', `cloudflare/${worker}/worker-configuration.d.ts`], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', `${worker}: worker-configuration.d.ts is not tracked`);
  const tsconfig = JSON.parse(read(`cloudflare/${worker}/tsconfig.json`));
  assert.ok(tsconfig.include.includes('worker-configuration.d.ts'), `${worker}: the typecheck reads the generated declarations`);
}
assert.equal(execFileSync('git', ['ls-files', 'cloudflare/*/worker-configuration.d.ts'], { cwd: root, encoding: 'utf8' }).trim(), '',
  'no Worker commits generated runtime declarations');
console.log('worker-generated-types.selftest: both Workers generate worker-configuration.d.ts in typecheck and test; none is tracked');
