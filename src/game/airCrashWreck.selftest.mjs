// A downed aircraft's wreck rests on the drawn ground (air-crash-he-276b; Main 2026-11-24: "Seat the aircraft wreck the
// same way tank wrecks are seated on the drawn ground"). game/airSupportWorld.ts seats a wreck by the ground main.ts hands
// it, the battle's vehicle ground sampler on the dug terrain (world/vehicleGroundSampler.ts: what a hull's running gear
// stands on), its lowest drawn vertex on that ground. Pins, on the real airSupportWorld and the real A-10 airframe:
//   1. over a crash site where the drawn ground (a crater bowl dug 2.25 m into it) and the height field differ, the
//      wreck's lowest airframe point sits within 3 cm of the drawn ground under it, and stands clear of the height field
//      the bowl was dug from (the site really differs);
//   2. it rests on its belly or its back (never stood on a wingtip);
//   3. a crater dug under a wreck after it came down re-seats it into the bowl;
//   4. a control: the same crash seated by the height field (the ground the bowl was dug from) leaves its lowest point
//      over a metre off the drawn ground, so check 1 fails it.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createAirSupportWorld, lowestGap } from './airSupportWorld.ts';
import { AIR_SUPPORT_RULES } from '../sim/matchRuleset.ts';
import { runPose } from '../sim/strikeRuns.ts';

const R = AIR_SUPPORT_RULES;
const FIELD_Y = 2;
// the crash round's crater at the burst (matchRuleset's crash charge: radius 5.62 m, depth 2.25 m), a smooth bowl
const CRATER = { r: 5.62, depth: 2.249 };

/** The record a downed strafing run publishes: struck at its mark, falling from there. */
function downedStrafe(id) {
  const strike = { id, kind: 'strafe', team: 'bravo', mine: false, x: 0, y: FIELD_Y, z: 0, heading: 0.6, calledS: 0,
    landsS: 10, hp: 0, maxHp: 1, downedS: 10 };
  return strike;
}

/** Flies a downed strike to its wreck: the frames a battle would draw, until it rests. Returns the drawn airframe. */
function crash(ground, opts = {}) {
  const root = new Group();
  const world = createAirSupportWorld(root, { groundHeight: ground });
  const strike = downedStrafe(7);
  const air = { nowS: 0, strikes: [strike] };
  let t = strike.downedS - 0.5;
  for (let k = 0; k < 60 * 20; k++, t += 1 / 60) {
    air.nowS = t;
    world.update(air, 'alpha', t);
    if (opts.after && t > strike.downedS + 14 && !opts.done) { opts.done = true; opts.after(); }
  }
  const body = root.getObjectByName('air-support jet 7');
  assert.ok(body, 'the wreck stands where the jet came down');
  return { body, world, air, t, strike };
}

// the crash point: where the fall's arc meets the ground (the wreck's x, z)
function bowl(cx, cz) {
  return (x, z) => {
    const d = Math.hypot(x - cx, z - cz);
    return d >= CRATER.r ? FIELD_Y : FIELD_Y - CRATER.depth * 0.5 * (1 + Math.cos(Math.PI * d / CRATER.r));
  };
}
const flat = () => FIELD_Y;

// ---- 1, 2: the wreck rests on the dug bowl --------------------------------------------------------------------------------
/** The wreck's lowest drawn vertex (the point it ploughed in with, over the crash point). */
function lowestVertex(body) {
  body.updateMatrixWorld(true);
  const v = new Vector3(), out = new Vector3(0, Infinity, 0);
  body.traverseVisible((o) => {
    const position = o.isMesh ? o.geometry.attributes.position : null;
    for (let i = 0; position && i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      if (v.y < out.y) out.copy(v);
    }
  });
  return out;
}

// find the crash point on the field first (where the wreck ploughs in), then dig the bowl there and crash again
const probe = crash(flat);
const at = lowestVertex(probe.body);
const drawn = bowl(at.x, at.z);
const seated = crash(drawn);
const gapDrawn = lowestGap(seated.body, drawn);
const gapField = lowestGap(seated.body, flat);
assert.ok(Math.abs(gapDrawn) <= 0.03, `1: the wreck's lowest point is ${gapDrawn.toFixed(3)} m off the drawn ground (want within 3 cm)`);
assert.ok(gapField < -0.5, `1: the site differs: against the undug height field the lowest point is ${gapField.toFixed(3)} m`);
const up = new Vector3(0, 1, 0).applyQuaternion(seated.body.getWorldQuaternion(new (seated.body.quaternion.constructor)()));
assert.ok(Math.abs(up.y) > 0.6, `2: the wreck lies on its belly or back (its up axis ${up.y.toFixed(2)} of vertical)`);

// ---- 3: a crater dug under a standing wreck re-seats it -----------------------------------------------------------------
let ground = flat;
const later = crash((x, z) => ground(x, z), { after: () => { ground = drawn; } });
const gapLater = lowestGap(later.body, drawn);
assert.ok(Math.abs(gapLater) <= 0.03, `3: after the crater is dug under it the wreck sits ${gapLater.toFixed(3)} m off the bowl`);

// ---- 4: control: seated by the height field the bowl was dug from --------------------------------------------------------
const control = crash(flat);
const gapControl = lowestGap(control.body, drawn);
assert.ok(gapControl > 1, `4: control: seated on the undug field, the lowest point floats ${gapControl.toFixed(3)} m over the bowl`);
assert.ok(!(Math.abs(gapControl) <= 0.03), '4: control: check 1 would fail it');

// the run the receipt flew is the run the authority flies (a sanity tie to strikeRuns)
const pose = runPose(R, seated.strike, seated.strike.downedS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
assert.ok(pose.y > FIELD_Y + 20, 'the jet was struck in flight');

console.log(`airCrashWreck: PASS (drawn-ground gap ${gapDrawn.toFixed(3)} m, undug field ${gapField.toFixed(2)} m, `
  + `re-seated ${gapLater.toFixed(3)} m, control ${gapControl.toFixed(2)} m, up ${up.y.toFixed(2)})`);
