// No decor inside a roof station's traverse (275, lane roof-station-keepout-275; the owner on the Oplots: the "light
// tower" must stop blocking the machine gun). The Oplot-T's M240 was blocked by decor, not by the vehicle: the fleet
// cargo's turretRoof route stood an insulated chest 0.5 m from it at bore height, and a fleet pass on integ/274.0 found 50
// stations on 48 tanks with decor inside their authored arc. decorations.ts now reserves every station's swept volume
// (stationSweepKeepOut.ts: barrel and moving stock round the yaw axis over the arc, level to full elevation) and turns
// away any decor piece that enters it.
//
// The keep-out live (the tanks suite; the fleet table and the keep-out's geometry are roofStationKeepOut.selftest's, in
// the default tier): the worst stations of that pass are built with their decor, and none has decor inside its arc
// (tools/roof-station-probe.mjs decorInStationArcs, the barrel lines of tools/roof-station-arcs.mjs swept against the
// decor alone). Negative control: object148_proto planned with its stations hidden from the decor (the decor before the
// keep-out) puts decor in its station's arc, and the same measure sees it.
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import './tankFactory.ts';
import { createTankSteps } from './tankFactoryCore.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { planTankDecorationsSteps } from './decorations.ts';
import { isRoofStation } from './stationSweepKeepOut.ts';
import { decorInStationArcs } from '../../tools/roof-station-probe.mjs';

const warn = console.warn;
console.warn = () => {};
installCanvasFixture();

// the integ/274.0 pass's worst stations
const SAMPLE = ['object148_proto', 'leo2_improved', 'leo2a4_otco', 't72b3m_xuanwu', 'bm_oplot_t'];
await ensureInteriorFills(SAMPLE);
/** Build `id` with its decor; `hide` plans it with the stations hidden from the decor, then shows them again. */
function survey(id, hide = false) {
  let plan = null;
  const decorPlanner = (args) => {
    const hidden = [];
    if (hide) args.root.traverse((o) => { if (isRoofStation(o)) { hidden.push(o); o.userData.remoteControlled = false; } });
    try {
      const steps = planTankDecorationsSteps(args);
      let step = steps.next();
      while (!step.done) step = steps.next();
      plan = step.value;
    } finally {
      for (const o of hidden) o.userData.remoteControlled = true;
    }
    return plan;
  };
  const steps = createTankSteps(id, null, { proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242, decorPlanner });
  let step = steps.next();
  while (!step.done) step = steps.next();
  const tank = step.value;
  try {
    assert.ok(plan, `${id}: the decor planned`);
    tank.root.updateMatrixWorld(true);
    return { hits: decorInStationArcs(tank.root, id), turnedAway: plan.summary.skipped.filter(([, why]) => why === 'station-sweep').length };
  } finally {
    tank.dispose();
  }
}

const control = survey('object148_proto', true);
assert.ok(control.hits.length > 0, 'object148_proto planned without the keep-out puts decor inside its station\'s arc');
assert.equal(control.turnedAway, 0, 'with its stations hidden the keep-out has nothing to turn away');
let turnedAway = 0;
for (const id of SAMPLE) {
  const r = survey(id);
  assert.deepEqual(r.hits, [], `${id}: no decor inside a roof station's traverse`);
  assert.ok(r.turnedAway > 0, `${id}: the keep-out turned decor away`);
  turnedAway += r.turnedAway;
}
console.warn = warn;
console.log(`roofStationKeepOutLive: ${SAMPLE.length} sampled tanks keep their stations clear (${turnedAway} placements `
  + `turned away); negative control: object148_proto without the keep-out had decor in ${control.hits.map((h) => `${h.station} `
  + h.blockedDeg.map(([a, b]) => `${a}..${b}`).join(',')).join('; ')}`);
