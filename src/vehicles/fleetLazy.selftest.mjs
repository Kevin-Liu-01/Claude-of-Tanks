import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.js';
import { MISC_PROFILES } from './profiles/misc.js';
import { FLEET_GROUP_IDS } from './fleetManifest.js';
import { GROUP_PROFILES as nato } from './fleet/g1Nato.js';
import { GROUP_PROFILES as east } from './fleet/g2East.js';
import { GROUP_PROFILES as us } from './fleet/g3Us.js';
import { GROUP_PROFILES as casemateAsia } from './fleet/g4CasemateAsia.js';

const groups = { nato, east, us, casemateAsia };
const owners = new Map();
for (const [group, profiles] of Object.entries(groups)) {
  assert.deepEqual(Object.keys(profiles).sort(), [...FLEET_GROUP_IDS[group]].sort(),
    `${group} manifest exactly matches its dynamic profile chunk`);
  for (const [id, profile] of Object.entries(profiles)) {
    assert.equal(owners.has(id), false, `${id} has exactly one dynamic owner`);
    owners.set(id, group);
    assert.equal(profile, PROCEDURAL_PROFILES[id], `${group}:${id} preserves eager profile identity`);
  }
}
for (const [id, profile] of Object.entries(MISC_PROFILES)) {
  assert.equal(PROCEDURAL_PROFILES[id], profile, `eager misc identity: ${id}`);
}
assert.equal(owners.size + Object.keys(MISC_PROFILES).length,
  Object.keys(PROCEDURAL_PROFILES).length, 'every eager profile has one lazy/eager owner');

const here = dirname(fileURLToPath(import.meta.url));
const facadeUrl = pathToFileURL(join(here, 'fleetFactory.js')).href;
const specsUrl = pathToFileURL(join(here, 'specs.js')).href;
execFileSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  const fleet = await import(${JSON.stringify(facadeUrl)});
  assert.equal(fleet.isTankBuilderReady('leclerc'), true);
  assert.equal(fleet.isTankBuilderReady('m1a2'), false);
  assert.equal(fleet.isTankBuilderReady('t90m'), false);
  assert.equal(fleet.isTankBuilderReady('leo2a4'), false);
  assert.equal(fleet.isTankBuilderReady('merkava4'), false);
  await fleet.ensureTankBuilder('m1a2');
  assert.equal(fleet.isTankBuilderReady('m1a2'), true);
  assert.equal(fleet.isTankBuilderReady('m60a3'), true);
  assert.equal(fleet.isTankBuilderReady('t90m'), false);
  assert.throws(() => fleet.createTank('t90m', null, { geometryReceipt: true }), /not loaded/);
  const abrams = fleet.createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true });
  abrams.dispose();
  await fleet.ensureFullFleet();
  const { VISIBLE_TANK_IDS } = await import(${JSON.stringify(specsUrl)});
  for (const id of VISIBLE_TANK_IDS) {
    const visual = fleet.createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
    visual.dispose();
  }
  console.log('demand-loaded fleet sweep:', VISIBLE_TANK_IDS.length);
`], { stdio: 'inherit', timeout: 240000 });

console.log(`fleetLazy.selftest: PASS (${owners.size} demand-owned profiles)`);
