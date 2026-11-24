// The combat rig is measured before anything builds a tank (276 sim-det-trig-c). Copyright © 2026 Kevin B. Liu.
//
// finalizeCombatAnatomy refuses a drawn weapon with no measured rig, and the fleet's loaders (tankFactory.ts and
// authorityFleet.ts) finalize every saved id at import. On integ/276 8fcde83322 the calibrations predated the rig, so
// tank:regen:changed's first aggregate (gen-authored-paint-catalog, which imports tankFactory) failed before the anatomy
// step that writes the rig could run. The chain now runs tools/combat-rig-bootstrap.mjs first. Held:
//  1. the order: in the chain's tool order (steps.mjs RIG_BOOTSTRAP, PRE_AGGREGATES, STEPS) the bootstrap comes first and
//     loads no fleet itself; every later tool whose imports (static and dynamic, followed through the tree) reach a fleet
//     loader runs after it, save gen-combat-anatomy, which switches on measurement mode before its dynamic fleet import;
//     and tools/tank-regen-changed.mjs runs the bootstrap before the aggregates and the CPU fixpoint, writing and checking;
//  2. the check is not blind: the paint catalog and the controls step do reach a fleet loader; a planted order with the
//     paint catalog ahead of the bootstrap is named, and so is a planted tool that imports tankFactory dynamically;
//  3. the bootstrap measures exactly the rows without a rig (idsWithoutRig): one run for some rows, near-equal parts and
//     one merge only when no row has a rig (a merge measures every id no part holds, serially);
//  4. and nothing at runtime falls back: finalize's rig step still throws for a drawn weapon with no rig outside
//     measurement mode, and attaches nothing (no throw) inside it, the generator's own mode.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRE_AGGREGATES, RIG_BOOTSTRAP, STEPS } from './changed-only/steps.mjs';
import { idsWithoutRig, rigParts } from './combat-rig-bootstrap.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FLEET_LOADERS = ['src/vehicles/tankFactory.ts', 'src/vehicles/authorityFleet.ts'];
const MEASURING = 'tools/gen-combat-anatomy.mjs';
const IMPORTS = /(?:^|[^\w.$])(?:import|export)\s+(?!type\s)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The relative imports (static and dynamic string ones) of `source`, as written. */
export function importSpecifiers(source) {
  return [...source.matchAll(IMPORTS)].map((m) => m[1] ?? m[2]).filter((spec) => spec && spec.startsWith('.'));
}

/** The fleet loader `entry` reaches through the tree's relative imports (repository paths), or null. `read` reads a file. */
function reachedLoader(entry, read = (file) => readFileSync(join(ROOT, file), 'utf8')) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (FLEET_LOADERS.includes(file)) return file;
    let source;
    try { source = read(file); } catch { continue; }
    for (const spec of importSpecifiers(source)) {
      const next = relative(ROOT, resolve(ROOT, dirname(file), spec.replace(/\?.*$/, ''))).split('\\').join('/');
      if (!/\.(m?js|ts)$/.test(next) || seen.has(next) || !existsSync(join(ROOT, next))) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return null;
}

/** The tools of `order` that reach a fleet loader before the bootstrap has run: [{ tool, loader }]. */
function earlyLoaders(order, reach = (tool) => reachedLoader(tool)) {
  const at = order.indexOf(RIG_BOOTSTRAP[0]);
  return order.flatMap((tool, i) => {
    if (tool === MEASURING || (at >= 0 && i > at)) return [];
    const loader = reach(tool);
    return loader ? [{ tool, loader }] : [];
  });
}

// 1. the chain's order
const order = [RIG_BOOTSTRAP[0], ...PRE_AGGREGATES.map(([tool]) => tool), ...STEPS.map((step) => step.tool)];
assert.equal(order[0], 'tools/combat-rig-bootstrap.mjs', 'the chain runs the rig bootstrap first');
assert.equal(reachedLoader(order[0]), null, 'and the bootstrap loads no fleet itself (it reads the calibration table only)');
assert.deepEqual(earlyLoaders(order), [], 'a tool that loads the fleet runs ahead of the rig bootstrap');
const anatomy = readFileSync(join(ROOT, MEASURING), 'utf8');
assert.ok(anatomy.indexOf('enableCombatAnatomyMeasurementMode();') >= 0
  && anatomy.indexOf('enableCombatAnatomyMeasurementMode();') < anatomy.indexOf("await import('../src/vehicles/tankFactory.ts')"),
  'gen-combat-anatomy switches on measurement mode before it loads the fleet');
const regen = readFileSync(join(ROOT, 'tools/tank-regen-changed.mjs'), 'utf8');
assert.match(regen, /if \(!DRY\) await rigBootstrap\(\);\s*if \(!DRY\) await aggregates\(PRE_AGGREGATES, 'pre'\);\s*await cpuFixpoint\(/,
  'tank:regen:changed runs the bootstrap before the aggregates and the CPU steps');
assert.match(regen, /await rigBootstrap\(\);\s*await aggregates\(PRE_AGGREGATES, 'pre'\);\s*for \(const definition of/,
  'and its whole-fleet check runs the bootstrap\'s check first');
assert.match(regen, /\.\.\.\(CHECK \? \['--check'\] : \[\]\)\], \{ niced: true, timeoutS: 3600, label: 'rig-bootstrap' \}/,
  'the bootstrap writes in a regen and checks in a check run');

// 2. the check is not blind
assert.equal(reachedLoader('tools/gen-authored-paint-catalog.mjs'), 'src/vehicles/tankFactory.ts', 'the paint catalog loads the fleet (8fcde83322\'s failure)');
assert.equal(reachedLoader('tools/vehicle-controls-inventory.mjs'), 'src/vehicles/tankFactory.ts', 'and so does the controls step');
const planted = ['tools/gen-authored-paint-catalog.mjs', RIG_BOOTSTRAP[0], ...order.slice(1).filter((tool) => tool !== 'tools/gen-authored-paint-catalog.mjs')];
assert.deepEqual(earlyLoaders(planted).map((entry) => entry.tool), ['tools/gen-authored-paint-catalog.mjs'], 'control: the paint catalog ahead of the bootstrap is named');
const dynamicTool = { 'tools/planted.mjs': "const { createTank } = await import('../src/vehicles/tankFactory.ts');\n" };
assert.equal(reachedLoader('tools/planted.mjs', (file) => dynamicTool[file] ?? readFileSync(join(ROOT, file), 'utf8')), 'src/vehicles/tankFactory.ts',
  'control: a dynamic import of the fleet is followed');
assert.deepEqual(importSpecifiers("import type { A } from './a.ts';\nimport './b.ts';\nexport { c } from \"./c.mjs\";\n"), ['./b.ts', './c.mjs'],
  'a type-only import is no load; a bare and a re-export are');

// 3. exactly the rows without a rig
assert.deepEqual(idsWithoutRig({ a: { rig: { turretPivot: [0, 1, 0] } }, c: {}, b: { rig: null } }), ['b', 'c'], 'the rows without a rig, sorted');
assert.deepEqual(rigParts(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b', 'c'], ['d', 'e']], 'in near-equal parts');
assert.deepEqual(rigParts(['a'], 4), [['a']], 'never an empty part');
// parts and one merge only when no row has a rig: a merge measures every id no part holds, one after another (a two-id
// merge ran ten minutes on 276's fleet); a partial bootstrap is one run of exactly its ids
const tool = readFileSync(join(ROOT, 'tools/combat-rig-bootstrap.mjs'), 'utf8');
{
  const at = (text) => tool.indexOf(text);
  const partial = at('if (missing.length < all) {'), single = at("`--ids=${missing.join(',')}`]);"), whole = at('} else {'), merge = at('--merge-from=');
  assert.ok(partial >= 0 && partial < single && single < whole && whole < merge,
    'a partial bootstrap measures its ids in one run; only a whole-fleet one splits into parts and a merge');
}

// 4. no runtime fallback: a drawn weapon with no rig throws outside measurement mode, and attaches nothing inside it
const { applyCombatGunRig } = await import('../src/vehicles/combatAnatomy.ts');
const { enableCombatAnatomyMeasurementMode, isCombatAnatomyMeasurementMode } = await import('../src/vehicles/combatAnatomyMeasurementMode.ts');
const drawn = () => ({ id: 'planted_gun', armor: { turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.8], gunBarrel: { lengthM: 4, radiusM: 0.06 } }, gun: {} });
assert.equal(isCombatAnatomyMeasurementMode(), false);
assert.throws(() => applyCombatGunRig(drawn(), null), /a drawn weapon with no measured rig/, 'the runtime refuses a drawn weapon with no rig');
enableCombatAnatomyMeasurementMode();
const measured = drawn();
applyCombatGunRig(measured, null);
assert.deepEqual(measured.armor.turretPivot, [0, 1.5, 0], 'the generator\'s mode attaches no rig and keeps the authored frame');

console.log(`combat-rig-bootstrap.selftest: the chain runs the rig bootstrap first (${order.length} tools: `
  + `${order.filter((tool) => tool !== MEASURING && reachedLoader(tool)).length} load the fleet, all after it; gen-combat-anatomy in measurement mode); `
  + 'tank:regen:changed runs it before the aggregates writing and checking; a planted early loader and a dynamic import are named; '
  + 'exactly the rows without a rig are measured; the runtime still refuses a drawn weapon with no rig');
