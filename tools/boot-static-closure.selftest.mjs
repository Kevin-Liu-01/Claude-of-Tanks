// boot-static-closure.selftest.mjs — the garage boot's static import closure stays free of battle-only graphs.
//
// docs/SYSTEMS.md boot contract: "garage boot must not statically import the solo battle authority graph".
// The 2026-09-15 roster helper import put game/state.ts (bots, damage, movement, Jev) back into every boot
// (+235 kB raw) and nothing noticed, because the textual check looked for `state.js`. This receipt walks the
// real closure of src/main.ts and names the import chain of any forbidden module.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importChain, runtimeImportSpecifiers, staticImportClosure } from './static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- the walker on a fixture -------------------------------------------------------------------
assert.deepEqual(runtimeImportSpecifiers(`
  import type { A } from './typeOnly.ts';
  import { type B } from './inlineType.ts';
  import { c } from './value.ts';
  import './sideEffect.ts';
  import three from 'three';
  export { d } from './reexport.ts';
  export * from './star.ts';
  export type { E } from './typeExport.ts';
  const lazy = () => import('./lazy.ts');
  const text = "import './inString.ts'";
`, 'fixture.ts'), ['./inlineType.ts', './value.ts', './sideEffect.ts', './reexport.ts', './star.ts'],
'type-only declarations, packages, import() and strings are not runtime edges; inline type imports are');

const fixture = mkdtempSync(join(tmpdir(), 'cot-static-closure-'));
try {
  const write = (file, text) => {
    mkdirSync(dirname(join(fixture, file)), { recursive: true });
    writeFileSync(join(fixture, file), text);
  };
  write('src/main.ts', "import { a } from './a.ts';\nimport type { T } from './heavy.ts';\nvoid import('./lazy.ts');\nexport { a };\n");
  write('src/a.ts', "export * from './b.ts';\nimport data from './data.json' with { type: 'json' };\nexport const a = data;\n");
  write('src/b.ts', "import './a.ts';\nexport const b = 1;\n");
  write('src/data.json', '{}');
  write('src/heavy.ts', "import './never.ts';\nexport type T = number;\n");
  write('src/lazy.ts', "import './never.ts';\n");
  write('src/never.ts', 'export {};\n');
  const closure = staticImportClosure('src/main.ts', { root: fixture });
  assert.deepEqual([...closure.keys()].sort(), ['src/a.ts', 'src/b.ts', 'src/data.json', 'src/main.ts'],
    'cycles terminate; JSON is a leaf; type-only and lazy modules stay out');
  assert.equal(importChain(closure, 'src/b.ts'), 'src/main.ts -> src/a.ts -> src/b.ts');
  write('src/broken.ts', "import './gone.ts';\n");
  assert.throws(() => staticImportClosure('src/broken.ts', { root: fixture }), /unresolved imports[\s\S]*gone\.ts/,
    'an unresolved relative import fails loudly instead of shrinking the closure');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

// --- the real garage boot ----------------------------------------------------------------------
const FORBIDDEN = Object.freeze({
  'src/game/state.ts': 'the solo battle authority loads behind game/soloBattleAccess.ts',
  'src/game/ai.ts': 'bot brains are battle-only',
  'src/sim/damage.ts': 'combat resolution is battle-only',
  'src/vehicles/auxiliaryInventory.generated.ts':
    '217 kB of mount geometry; the garage reads src/ui/garageAuxiliarySummary.generated.ts and combat anatomy src/vehicles/auxiliaryRoofGuns.generated.ts',
});
const boot = staticImportClosure('src/main.ts', { root: ROOT });
assert.ok(boot.size > 200, `the walker reached only ${boot.size} modules from src/main.ts`);
for (const [file, reason] of Object.entries(FORBIDDEN)) {
  assert.ok(!boot.has(file), `${file} is in the garage boot (${reason}): ${importChain(boot, file)}`);
}
for (const required of ['src/game/soloRosterPlan.ts', 'src/game/soloBattleAccess.ts']) {
  assert.ok(boot.has(required), `${required} must stay the boot-side entry to the battle path`);
}

console.log(`boot-static-closure.selftest: ${boot.size} modules reachable from src/main.ts; `
  + `${Object.keys(FORBIDDEN).length} battle-only modules excluded`);
