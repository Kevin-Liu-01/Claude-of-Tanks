#!/usr/bin/env node

import { createTank } from '../src/vehicles/tankFactory.ts';
import { DEVELOPMENT_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { measureTurretBarrelCircularity } from '../src/vehicles/turretBarrelCircularity.ts';

const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const ids = idsArg
  ? idsArg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean)
  : [...DEVELOPMENT_TANK_IDS];
const failures = [];
let measuredCount = 0;
let skippedCount = 0;

for (const id of ids) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
    camoSeed: 4242,
    staticPreview: true,
  });
  try {
    const turretless = getSpec(id)?.armor?.turretless === true;
    const result = measureTurretBarrelCircularity(visual, {
      requireMeasurement: !turretless,
    });
    const worst = result.worst;
    const worstAxis = result.worstAxis;
    if (!result.pass) failures.push({ id, result });
    if (result.skipped) skippedCount += 1;
    else if (worst) measuredCount += 1;
    console.log(`[barrel-circularity] ${result.skipped ? 'SKIP' : result.pass ? 'PASS' : 'FAIL'} ${id}`
      + (worst ? ` ratio=${worst.aspectRatio.toFixed(3)} z=${worst.zM.toFixed(3)}m` : '')
      + (worstAxis ? ` lateral=${(worstAxis.lateralAxisOffsetM * 1000).toFixed(1)}mm` : '')
      + (result.error ? ` ${result.error}` : result.reason ? ` ${result.reason}` : ''));
  } finally {
    visual.dispose();
  }
}

console.log(`[barrel-circularity] audited ${ids.length} first-party vehicles: `
  + `${measuredCount} measured turret barrels, ${skippedCount} fixed-mount skips`);
if (failures.length) {
  console.error(`[barrel-circularity] FAIL (${failures.length})`);
  for (const { id, result } of failures) {
    console.error(`  - ${id}: ${result.error || JSON.stringify({ worst: result.worst, worstAxis: result.worstAxis })}`);
  }
  process.exit(2);
}
console.log('[barrel-circularity] PASS — sampled barrel sections are circular and centered on their declared firing axes');
