// 278 (fleet-debt-278, Main's ruling): a visual ERA cluster named for one of its owner's gameplay plates binds that plate,
// and one named in the plates' form for a plate its owner does not have fails the build (tankFactoryCore
// PLATE_NAMED_ERA_CLUSTER). The BMPT T-90 station (bmptT90Station.ts) names its glacis bricks turret_era_L/R and its flank
// tiles side_era_L/R; the turret cheek rule (z < 0.65, |x| > 0.40 reads a flank) used to send the bricks to side_era, so
// the turret_era plates fitted nothing and the 274 plate fits dropped them out of gameplay.
// Per quality: each turret_era plate binds its own two bricks on its own side (L at x < 0), each side_era plate its six
// flank tiles; control: with turret_era_L renamed out of the spec, the build refuses its turret_era_L cluster.
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { betweenBuilds } from '../../../tools/build-loop-yield.mjs';

const ID = 'bmpt_t90';
const receiptOf = (root) => root.userData.eraVisualBindingReceipt ?? root.getObjectByName('rig_turret')?.userData.eraVisualBindingReceipt;
for (const quality of ['high', 'low']) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    const plates = Object.fromEntries((receiptOf(tank.root)?.plates ?? []).map((plate) => [plate.name, plate]));
    for (const [zone, parts, minAbsX, maxAbsX] of [['turret_era', 2, 0.5, 0.7], ['side_era', 6, 1.2, 1.27]]) {
      for (const side of ['L', 'R']) {
        const name = `${zone}_${side}`, plate = plates[name];
        assert.ok(plate?.registered, `${ID}/${quality}: ${name} is live gameplay ERA`);
        assert.deepEqual([...(plate.visualSectors ?? [])], [name], `${ID}/${quality}: ${name} binds its own cluster only`);
        assert.equal(plate.automaticPartCount, parts, `${ID}/${quality}: ${name} binds its ${parts} drawn pieces`);
        const xs = plate.fittedSurfaces.flat().map((v) => v[0] * (side === 'L' ? -1 : 1));
        assert.ok(Math.min(...xs) >= minAbsX && Math.max(...xs) <= maxAbsX,
          `${ID}/${quality}: ${name} fits its own side's pieces (|x| ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)})`);
      }
    }
  } finally {
    tank.dispose();
  }
}

{
  // control: a plate-named cluster whose plate the owner lacks is an error, not a fallback to the family rules
  // (a fitted plate is one row per fitted face, all under the plate's name: rename every one)
  const plates = getSpec(ID).armor.turretPlates.filter((p) => p.name === 'turret_era_L');
  assert.ok(plates.length, `${ID}: the spec carries turret_era_L`);
  for (const plate of plates) plate.name = 'turret_era_control';
  try {
    assert.throws(() => createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality: 'low', camoSeed: 4242 }).dispose(),
      /visual ERA cluster turret_era_L names no turret ERA plate/, 'control: the orphaned plate-named cluster fails the build');
  } finally {
    for (const plate of plates) plate.name = 'turret_era_L';
  }
}
console.log(`bmptT90EraBinding: ${ID} turret_era_L/R bind their 2 glacis bricks and side_era_L/R their 6 flank tiles at both qualities; orphaned-cluster control fails closed`);
