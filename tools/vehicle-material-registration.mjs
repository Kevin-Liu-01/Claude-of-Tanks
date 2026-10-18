#!/usr/bin/env node
// tools/vehicle-material-registration.mjs — every opaque lit material a tank draws holds its own vehicle registration
// (2026-10-17, the wheel-band lane, round 2; the owner: "in garage, on all tanks, i can see this weird shadow on wheels,
// no matter what garage i switch through"), and every other opaque one writes the unlit vehicle tag (round 3,
// 2026-10-18: the KF51's light-immune mud flaps).
//
// Builds each tank (decorations on, each --quality) through a cascade-registering engine context and runs the
// registration audit (src/vehicles/vehicleMaterialRegistrationAudit.test-support.mjs): a drawn material that is
// unregistered (a hand re-hooked raw clone), replaced (its cascade hook assigned away), untagged (no vehicle tag
// write) or unlit (an opaque unlit part without the unlit tag) is a pixel the aerial pass takes for ground — the band under the belly line — and one that lights with every
// cascade's sun at once; every material a build registered must be released on dispose. Node, no GPU.
//
// Usage: node --max-old-space-size=4096 tools/vehicle-material-registration.mjs [--ids=a,b|all] [--quality=low,high]
//          [--json=<file>]
// Exit 1 on any fault or leak. tank-release-check runs it on the released ids.
import { writeFileSync } from 'node:fs';
import { installCanvasFixture } from '../src/vehicles/canvasFixture.test-support.mjs';
import {
  auditVehicleMaterialRegistration, createCascadeRecorder, leakedRegistrations,
} from '../src/vehicles/vehicleMaterialRegistrationAudit.test-support.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('../src/vehicles/fleetFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const idFlag = flag('ids') ?? flag('tanks');
const ids = !idFlag || idFlag === 'all' ? [...ALL_TANK_IDS] : idFlag.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = ids.filter((id) => !ALL_TANK_IDS.includes(id));
if (unknown.length) { console.error(`vehicle-material-registration: unknown ids ${unknown.join(', ')}`); process.exit(2); }
const qualities = (flag('quality') ?? 'low,high').split(',').map((s) => s.trim()).filter(Boolean);
const recorder = createCascadeRecorder();
const rows = [];
let failed = 0;
const started = performance.now();
for (const id of ids) {
  for (const quality of qualities) {
    const before = new Set(recorder.registered);
    const row = { id, quality, checked: 0, faults: [], leaked: [] };
    try {
      await ensureTankBuilder(id);
      const visual = createTank(id, recorder.engineCtx, { quality, decor: true });
      // a few builders rewrite their merged meshes after createTank returns (fleetPass.test-support.mjs)
      await Promise.resolve();
      const { checked, faults } = auditVehicleMaterialRegistration(visual.root, recorder);
      row.checked = checked;
      row.faults = faults.map((f) => ({ ...f, meshes: [...new Set(f.meshes)].slice(0, 6) }));
      visual.dispose();
      row.leaked = leakedRegistrations(recorder, before);
    } catch (error) {
      row.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
    }
    const bad = row.error || row.faults.length || row.leaked.length;
    if (bad) {
      failed++;
      console.log(`FAIL ${id} (${quality}): ${row.error ?? ''}`);
      for (const f of row.faults) console.log(`  ${f.fault} ${f.material} on ${f.meshes.join(', ')}`);
      if (row.leaked.length) console.log(`  leaked ${row.leaked.join(', ')}`);
    }
    rows.push(row);
  }
}
const json = flag('json');
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
const checked = rows.reduce((n, r) => n + r.checked, 0);
console.log(`vehicle-material-registration: ${ids.length} tank(s) x ${qualities.join('/')}, ${checked} drawn materials, `
  + `${failed} failing build(s) (${((performance.now() - started) / 1000).toFixed(0)} s) ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
