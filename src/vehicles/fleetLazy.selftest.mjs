import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.ts';
import { MISC_PROFILES } from './profiles/misc.ts';
import { FLEET_GROUP_IDS } from './fleetManifest.ts';
import {runFleetSweep} from './fleetSweep.test-support.mjs';
const canonicalOnlyIds = new Set([
  'amx40_proto', 'fv4034', 'challenger2', 'challenger2e', 'ua_challenger2',
  'challenger3_proto', 'challenger3', 'mbt70', 'object148_proto',
  'k1e1', 'type10_tk_x', 'm2a2_bradley', 'bmp2', 'hayate_ifv',
]);
const owners = new Map();
for (const [group, ids] of Object.entries(FLEET_GROUP_IDS)) {
  for (const id of ids) {
    const profile = PROCEDURAL_PROFILES[id];
    if (!canonicalOnlyIds.has(id)) {
      assert.ok(profile, `${group}:${id} resolves to a canonical profile`);
    }
    assert.equal(owners.has(id), false, `${id} has exactly one dynamic owner`);
    owners.set(id, group);
  }
}
for (const [id, profile] of Object.entries(MISC_PROFILES)) {
  assert.equal(PROCEDURAL_PROFILES[id], profile, `deferred misc identity: ${id}`);
}
assert.equal(owners.size - canonicalOnlyIds.size, Object.keys(PROCEDURAL_PROFILES).length,
  'every profile has one demand-loaded owner');

const here = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(here, '../../tools/gen-legacy-fleet-specs.mjs'), '--check'], {
  stdio: 'inherit',
  timeout: 30_000,
});
const facadeUrl = pathToFileURL(join(here, 'fleetFactory.ts')).href;
const specsUrl = pathToFileURL(join(here, 'specs.ts')).href;
const markingRegistryUrl = pathToFileURL(join(here, 'vehicleMarkingSeatRegistry.ts')).href;
const anatomyRegistryUrl = pathToFileURL(join(here, 'combatAnatomyCalibrationRegistry.ts')).href;
const facadeSource = await readFile(join(here, 'fleetFactory.ts'), 'utf8');
assert.doesNotMatch(facadeSource, /from ['"]\.\/modern[12]\.js['"]/,
  'browser fleet facade must not statically import combined legacy builders');
await runFleetSweep(`
  import assert from 'node:assert/strict';
  const fleet = await import(${JSON.stringify(facadeUrl)});
  const specs = await import(${JSON.stringify(specsUrl)});
  const markingRegistry = await import(${JSON.stringify(markingRegistryUrl)});
  const anatomyRegistry = await import(${JSON.stringify(anatomyRegistryUrl)});
  assert.equal(fleet.isTankBuilderReady('leclerc_s2'), false);
  assert.equal(fleet.isTankBuilderReady('amx40_proto'), false);
  assert.equal(fleet.isTankBuilderReady('challenger2'), false);
  assert.equal(fleet.isTankBuilderReady('type10_tk_x'), false);
  assert.equal(fleet.isTankBuilderReady('m1a1_abrams_hc'), false);
  assert.equal(fleet.isTankBuilderReady('t90am'), false);
  assert.equal(fleet.isTankBuilderReady('leo2a2'), false);
  assert.equal(fleet.isTankBuilderReady('merkava4b'), false);
  assert.equal(markingRegistry.vehicleMarkingSeats('m1a1_abrams_hc'), null);
  assert.equal(anatomyRegistry.combatAnatomyCalibration('m1a1_abrams_hc'), null);
  await fleet.ensureTankBuilder('m1a1_abrams_hc');
  assert.equal(fleet.isTankBuilderReady('m1a1_abrams_hc'), true);
  assert.equal(fleet.isTankBuilderReady('m1a1_abrams_fep'), true);
  assert.ok(markingRegistry.vehicleMarkingSeats('m1a1_abrams_hc'));
  assert.ok(markingRegistry.vehicleMarkingSeats('m1a1_abrams_fep'));
  assert.equal(markingRegistry.vehicleMarkingSeats('m60a3'), null);
  assert.ok(anatomyRegistry.combatAnatomyCalibration('m1a1_abrams_hc'));
  assert.ok(anatomyRegistry.combatAnatomyCalibration('m1a1_abrams_fep'));
  assert.equal(anatomyRegistry.combatAnatomyCalibration('m60a3'), null);
  assert.ok(specs.getSpec('m1a1_abrams_hc').armor.collisionShells.hull.length > 0);
  assert.equal(fleet.isTankBuilderReady('m60a3'), false);
  assert.equal(fleet.isTankBuilderReady('t90am'), false);
  assert.throws(() => fleet.createTank('t90am', null, { geometryReceipt: true }), /not loaded/);
  const abrams = fleet.createTank('m1a1_abrams_hc', null, { proceduralOnly: true, geometryReceipt: true });
  abrams.dispose();
  await fleet.ensureTankBuilders(['leclerc_s2', 'amx40_proto']);
  assert.equal(fleet.isTankBuilderReady('leclerc_s2'), true);
  assert.equal(fleet.isTankBuilderReady('amx40_proto'), true);
  assert.equal(fleet.isTankBuilderReady('challenger2'), false);
  await fleet.ensureTankBuilder('challenger2');
  assert.equal(fleet.isTankBuilderReady('challenger2'), true);
  for (const id of ['leclerc_s2', 'challenger2', 'challenger3_proto', 'challenger3', 'amx40_proto']) {
    const visual = fleet.createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
    visual.dispose();
  }
  await fleet.ensureTankBuilder('type10_tk_x');
  assert.equal(fleet.isTankBuilderReady('type10_tk_x'), true);
  const type10_tk_x = fleet.createTank('type10_tk_x', null, { proceduralOnly: true, geometryReceipt: true });
  type10_tk_x.dispose();
  await fleet.ensureTankBuilders(['object148_proto', 'mbt70']);
  assert.equal(fleet.isTankBuilderReady('object148_proto'), true);
  assert.equal(fleet.isTankBuilderReady('mbt70'), true);
  const object148_proto = fleet.createTank('object148_proto', null, { proceduralOnly: true, geometryReceipt: true });
  assert.ok(object148_proto.root.getObjectByName('rig_turret')?.userData?.object148Design,
    'lazy T-14 route constructs the authored Armata builder, not the box placeholder');
  object148_proto.dispose();
  const mbt70 = fleet.createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true });
  assert.ok(mbt70.root.getObjectByName('rig_turret')?.userData?.mbt70TurretReceipt,
    'lazy MBT-70 route constructs the authored turret, not the box placeholder');
  assert.equal(mbt70.root.getObjectByName('rig_gun')?.userData?.mbt70MantletReceipt?.profile,
    'cast-tapered-block', 'lazy MBT-70 route retains the authored XM150 mantlet (the cast block, 2026-10-22)');
  mbt70.dispose();
  await fleet.ensureTankBuilder('ztz99_longwei');
  assert.equal(fleet.isTankBuilderReady('ztz99_longwei'), true);
  const ztz99_longwei = fleet.createTank('ztz99_longwei', null, { proceduralOnly: true, geometryReceipt: true });
  ztz99_longwei.dispose();
  await fleet.ensureTankBuilders(['m60a3', 't90am']);
  assert.equal(fleet.isTankBuilderReady('m60a3'), true);
  assert.equal(fleet.isTankBuilderReady('t90am'), true);
  await fleet.ensureFullFleet();
  const { VISIBLE_TANK_IDS } = specs;
  process.send({kind:'fleet-start',ids:VISIBLE_TANK_IDS});
  for (const id of VISIBLE_TANK_IDS) {
    const visual = fleet.createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
    visual.dispose();
    process.send({kind:'fleet-complete',id});
  }
  console.log('demand-loaded fleet sweep:', VISIBLE_TANK_IDS.length);
`);

console.log(`fleetLazy.selftest: PASS (${owners.size} demand-owned profiles)`);
