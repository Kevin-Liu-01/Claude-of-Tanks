// No decor stows under a field suit's roof or deck net (266, the net-hoop class: the Ukrainian CV9040C's ua3 blind
// critics, both, "a hollow hoop, daylight through it"; Release 240's C2 Ariete prototype cradle before it). The decor
// seated the fleet's loads (cans, crates, bags, whips) on roofs a field net (ghillieSuit.ts fieldClearanceM) covers, and
// ghillieDrape.ts drew the net up over each into an arch, open underneath. decorations.ts reads the roof cloth off the
// built suit (its nets' leading triangles, GHILLIE_TOP_VERTICES) and turns away any piece but the smoke banks that would
// stand up through it ('suit-roof'), in place of the per-id rules it replaces.
//
// Every playable id wearing a field suit is built with its decor: no seated load may stand under its roof cloth (a cloth
// vertex inside the load's footprint, between its foot and its top). Positive control: the rule turns loads away on most
// of those hulls, the reported two among them; and the Ariete prototype keeps no per-id roof rule.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import './tankFactory.ts';
import { createTankSteps } from './tankFactoryCore.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { getSpec } from './specs.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { GHILLIE_SUIT_CONFIGS } from './ghillieSuit.ts';
import { FLEET_GHILLIE_SUITS } from './ghillieFleetSuits.ts';
import { NATIONAL_UKRAINE_GHILLIE } from './profiles/nationalUkraineProtection.ts';
import { NATIONAL_POLAND_GHILLIE_CONFIGS } from './nationalPolandProtectionConfig.ts';
import { GHILLIE_TOP_VERTICES } from './ghillieDrape.ts';
import { decorManifestFor, planTankDecorationsSteps } from './decorations.ts';

const warn = console.warn;
console.warn = () => {};
installCanvasFixture();

const configs = { ...GHILLIE_SUIT_CONFIGS, ...FLEET_GHILLIE_SUITS, ...NATIONAL_UKRAINE_GHILLIE, ...NATIONAL_POLAND_GHILLIE_CONFIGS };
const suited = [...new Set(Object.entries(configs).filter(([, c]) => c.fieldClearanceM !== undefined && !c.disabled)
  .map(([key, c]) => c.id ?? key))].filter((id) => FLEET_GROUP_BY_ID[id]).sort();
assert.ok(suited.length >= 30 && suited.includes('cv9040c') && suited.includes('c2_ariete_proto'),
  `the fleet's field-suited ids (${suited.length})`);
await ensureInteriorFills(suited);

const v = new Vector3();
/** Build `id` with its decor through the factory's planner hook: its roof cloth (frame-local) and the plan. */
function survey(id) {
  let roofs = null, plan = null;
  const decorPlanner = (args) => {
    roofs = { hull: [], turret: [] };
    for (const [frame, group] of [['hull', args.hullG], ['turret', args.turretG]]) {
      group.updateWorldMatrix(true, true);
      const inv = group.matrixWorld.clone().invert();
      group.traverse((o) => {
        if (!o.isMesh || o.userData?.fieldSuit !== true || !/_net$/.test(o.name || '')) return;
        const pos = o.geometry?.attributes?.position, top = Number(o.userData[GHILLIE_TOP_VERTICES]) || 0;
        if (!pos) return;
        const m = inv.clone().multiply(o.matrixWorld);
        for (let i = 0; i < Math.min(top, pos.count); i++) roofs[frame].push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
      });
    }
    const steps = planTankDecorationsSteps(args);
    let step = steps.next();
    while (!step.done) step = steps.next();
    plan = step.value;
    return plan;
  };
  const steps = createTankSteps(id, null, { proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242, decorPlanner });
  let step = steps.next();
  while (!step.done) step = steps.next();
  step.value.dispose?.();
  assert.ok(plan && roofs, `${id}: the decor planned`);
  return { roofs, plan };
}

const under = [], turnedAway = [], drapesOnly = [];
for (const id of suited) {
  const { roofs, plan } = survey(id);
  // (a suit of drapes alone, the Strv 121's, lays no roof cloth)
  if (!roofs.hull.length && !roofs.turret.length) { drapesOnly.push(id); continue; }
  for (const frame of ['hull', 'turret']) {
    for (const bb of plan.seatedLoads[frame]) {
      const met = roofs[frame].filter((p) => p.x >= bb.min.x && p.x <= bb.max.x && p.z >= bb.min.z && p.z <= bb.max.z
        && p.y >= bb.min.y - 0.08 && p.y < bb.max.y).length;
      if (met) under.push(`${id} ${frame}: a load at (${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)}, ${bb.min.z.toFixed(2)}..${bb.max.z.toFixed(2)}) over ${met} cloth vertices`);
    }
  }
  if (plan.summary.skipped.some(([, reason]) => reason === 'suit-roof')) turnedAway.push(id);
}
console.warn = warn;
assert.deepEqual(under, [], 'no seated load stands under a field suit\'s roof or deck cloth');
assert.ok(drapesOnly.length <= 2, `field suits without roof cloth: ${drapesOnly.join(', ')}`);
assert.ok(turnedAway.length >= suited.length / 2 && turnedAway.includes('cv9040c') && turnedAway.includes('c2_ariete_proto'),
  `the roof rule turns loads away on most suited hulls, the CV9040C and the Ariete prototype among them (${turnedAway.length}/${suited.length})`);
// the class rule replaced the Ariete prototype's per-id strip: its fleet cargo still offers the turret roof
assert.ok(decorManifestFor(getSpec('c2_ariete_proto'), () => 0.5)
  .some((row) => row.kit === 'cargo' && row.slot[1]?.routes?.some(([slot]) => slot === 'turretRoof')),
'the Ariete prototype keeps no per-id roof strip (the placement rule holds its roof)');
console.log(`suitRoofDecor.selftest: ${suited.length - drapesOnly.length} field-suited hulls with roof cloth (${drapesOnly.length} drapes only), no load under it; the rule turned loads away on ${turnedAway.length}`);
