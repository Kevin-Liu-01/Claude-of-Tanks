// The rooms Worker's TypeScript program stays DOM-free (2026-09-28). cloudflare/rooms/tsconfig.json compiles with
// lib ES2022 and no DOM; every module its sources reach — through VALUE and TYPE imports alike, since a type import
// still joins the program — must be Node-runnable: src/mp, src/sim, the shared wire, and the map identity slice
// (src/world/maps/mapIds.ts). Before the cut, roomPolicy.ts imported resolveMapId from maps/catalog.ts, whose
// `import type` chain (contracts → terrain → maps/horizon → engine/sky → engine/deviceDiag) put 445 DOM errors into
// `npm run typecheck:rooms` — red on main for days, unseen because the release chains run only the app typecheck.
// Part 1 walks the import graph (no dependencies); part 2 runs the package's own typecheck when its dependencies are
// installed (cloudflare/rooms/node_modules — `npm ci --prefix cloudflare/rooms`), and says so when they are not.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workerSrc = path.join(root, 'cloudflare/rooms/src');
const entries = readdirSync(workerSrc).filter((f) => f.endsWith('.ts')).map((f) => path.join('cloudflare/rooms/src', f));
assert.ok(entries.length >= 2, 'the rooms Worker has source files');

const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function resolveRelative(from, spec) {
  const base = path.normalize(path.join(path.dirname(from), spec));
  const candidates = [base, base.endsWith('.js') ? `${base.slice(0, -3)}.ts` : null, `${base}.ts`, path.join(base, 'index.ts')].filter(Boolean);
  return candidates.find((c) => existsSync(path.join(root, c))) ?? null;
}
function relativeImports(file) {
  const text = readFileSync(path.join(root, file), 'utf8');
  const out = [];
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (!spec || !spec.startsWith('.')) continue;
    const target = resolveRelative(file, spec);
    if (target) out.push(target);
  }
  return out;
}
const reached = new Map(entries.map((e) => [e, null]));
const queue = [...entries];
while (queue.length) {
  const file = queue.shift();
  for (const dep of relativeImports(file)) if (!reached.has(dep)) { reached.set(dep, file); queue.push(dep); }
}
function chainTo(file) {
  const chain = [];
  for (let f = file; f; f = reached.get(f)) chain.push(f);
  return chain.reverse().join(' → ');
}
// Browser-only territory: anything here in the Worker's program is a leak (the one allowed src/world file is the
// identity slice). A new shared module belongs in src/mp, src/sim or the wire — or it gets its own DOM-free slice.
// src/world is mixed: the sim reads the collision math (collision.ts, THREE-free) by design; the renderer-facing
// world — terrain, vegetation, props, the map configs and their catalog — never belongs in the Worker.
const FORBIDDEN = [/^src\/engine\//, /^src\/ui\//, /^src\/game\//, /^src\/gallery\//, /^src\/presentation\//, /^src\/fx\//,
  /^src\/audio\//, /^src\/dev\//, /^src\/docs\//, /^src\/main\.ts$/, /^src\/vehicles\//,
  /^src\/world\/(terrain|vegetation|props|map|sky|shallowWater|waterRipples|horizon[A-Za-z]*)\.ts$/,
  /^src\/world\/maps\/(?!mapIds\.ts$)/];
const leaks = [...reached.keys()].filter((f) => FORBIDDEN.some((re) => re.test(f)));
assert.deepEqual(leaks.map((f) => `${f} via ${chainTo(f)}`), [], 'the rooms Worker program reaches browser-only modules');
assert.ok(reached.has('src/world/maps/mapIds.ts'), 'the room policy reads map ids from the DOM-free identity slice');
assert.ok(!reached.has('src/world/maps/catalog.ts'), 'the browser catalog (contracts type chain) stays out of the Worker program');
const shared = [...reached.keys()].filter((f) => !f.startsWith('cloudflare/')).sort();
console.log(`roomWorkerProgram.selftest: ${reached.size} files reachable from the rooms Worker (${shared.length} shared), no browser-only module`);

// Part 2: the package's own typecheck (tsconfig + test/tsconfig), the compiler the package pins — the gate that was red.
const tsc = path.join(root, 'cloudflare/rooms/node_modules/.bin/tsc');
if (!existsSync(tsc)) {
  console.log('roomWorkerProgram.selftest: cloudflare/rooms/node_modules absent — `npm run typecheck:rooms` not run here (install with `npm ci --prefix cloudflare/rooms`); the import-graph check above passed');
} else {
  const run = spawnSync('npm', ['--prefix', 'cloudflare/rooms', 'run', '-s', 'typecheck'], { cwd: root, encoding: 'utf8', timeout: 240000 });
  const errors = (run.stdout + run.stderr).split('\n').filter((l) => /error TS\d+/.test(l));
  assert.equal(run.status, 0, `npm run typecheck:rooms must pass (${errors.length} errors):\n${errors.slice(0, 12).join('\n')}`);
  console.log('roomWorkerProgram.selftest: npm run typecheck:rooms passes (both tsconfigs)');
}
