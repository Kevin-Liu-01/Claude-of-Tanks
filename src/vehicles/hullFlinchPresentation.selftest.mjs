/**
 * hullFlinchPresentation.selftest.mjs — the hit and recoil hull rock is presentation only (audit M9, 2026-11-02).
 *
 * TankVisual's hitFlinch/recoilKick rock used to be routed into the sim state (`state._flinch`), which movement.ts
 * integrated and folded into the support solve and the wall push. No authority writes it, so in solo the page sim took
 * impulses at render cadence (the support-solved height moved with frame timing), and in multiplayer the impulses
 * landed in the predictor's presented state, which nothing steps: no tank ever rocked. The visual now owns the spring:
 * the sim never reads or carries it, every state the visual draws rocks, and the visual itself keeps the tracks out of
 * the ground at the rocked pose.
 * Run with: node src/vehicles/hullFlinchPresentation.selftest.mjs
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { SIM_DT, createTankState, updateTank } from '../sim/movement.ts';
import { captureMovementPredictionState } from '../sim/movementPredictionState.ts';

const ID = 'leclerc_s2';
const FIELD = {
  getHeightAt: (x, z) => 0.25 * Math.sin(z / 4) + 0.15 * Math.sin(x / 3),
  getNormalAt: () => null,
  getGroundType: () => 'hard',
};

function sim(spec) {
  const pos = new THREE.Vector3(0, FIELD.getHeightAt(0, 0), 0);
  return {
    spec, state: createTankState(spec, pos, 0.2), combat: null,
    input: { throttle: 0.7, steer: 0.2, brake: false, aimPoint: new THREE.Vector3(60, 2, 80) },
  };
}

const spec = getSpec(ID);
const visual = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality: 'low' });
const root = visual.root;

// ---- the drawn rock never reaches the simulation ----------------------------------------------------------------
{
  const drawn = sim(spec), bare = sim(spec);
  for (let tick = 0; tick < 150; tick++) {
    if (tick % 15 === 0) {
      visual.recoilKick(0, 1);
      visual.hitFlinch(0.7, -0.7, 2.2, drawn.state.yaw);
    }
    updateTank(drawn, FIELD, SIM_DT);
    updateTank(bare, FIELD, SIM_DT);
    // a render frame between ticks, at a frame rate other than the sim's
    visual.syncFromState(drawn.state, 1 / 47);
  }
  for (const key of ['x', 'y', 'z']) {
    assert.equal(drawn.state.pos[key], bare.state.pos[key], `the drawn hull's ${key} is the undrawn hull's`);
  }
  assert.deepEqual(captureMovementPredictionState(drawn.state), captureMovementPredictionState(bare.state),
    'and so is its whole integrator checkpoint');
}

// ---- a state nothing steps (a multiplayer presented state, a mirror) still rocks, and is never written ------------
{
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  for (let i = 0; i < 240; i++) visual.syncFromState(state, 1 / 60); // the first probe's rock settles
  const restX = root.rotation.x, restZ = root.rotation.z, restY = root.position.y;
  const before = JSON.stringify(state);
  visual.hitFlinch(0.6, 0.8, 2.4, state.yaw);
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    visual.syncFromState(state, 1 / 60);
    peak = Math.max(peak, Math.abs(root.rotation.x - restX) + Math.abs(root.rotation.z - restZ));
  }
  assert.ok(peak > 0.01, `the hull visibly rocks on a state the sim never steps (peak ${peak.toFixed(4)} rad)`);
  assert.equal(JSON.stringify(state), before, 'the visual never writes the state it draws');
  for (let i = 0; i < 180; i++) visual.syncFromState(state, 1 / 60);
  assert.ok(Math.abs(root.rotation.x - restX) + Math.abs(root.rotation.z - restZ) < 1e-6 &&
    Math.abs(root.position.y - restY) < 1e-6, 'and the rock settles back to the rest pose');
}

// ---- the rocked hull keeps its tracks where the sim seated them (the terrain-contact guarantee) -------------------
{
  const geom = visual.contactGeom;
  assert.ok(geom && geom.halfLenM > 1 && geom.halfWidM > 1, 'the battle build publishes its contact rectangle');
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0.4);
  state.visualPitch = 0.05;
  state.visualRoll = -0.04;
  const corners = [];
  const cornerY = (out) => {
    root.updateMatrixWorld(true);
    let k = 0;
    for (const x of [-geom.halfWidM, geom.halfWidM]) for (const dz of [-geom.halfLenM, geom.halfLenM]) {
      out[k++] = new THREE.Vector3(x, geom.bottomYM, geom.zCenterM + dz).applyMatrix4(root.matrixWorld).y;
    }
    return out;
  };
  for (let i = 0; i < 300; i++) visual.syncFromState(state, 1 / 60);
  const seated = cornerY([]);
  visual.recoilKick(0, 1);
  visual.hitFlinch(-0.9, 0.4, 3, state.yaw);
  let worst = Infinity, rocked = 0;
  for (let i = 0; i < 40; i++) {
    visual.syncFromState(state, 1 / 60);
    cornerY(corners);
    for (let k = 0; k < 4; k++) worst = Math.min(worst, corners[k] - seated[k]);
    rocked = Math.max(rocked, Math.abs(root.rotation.x + state.visualPitch));
  }
  assert.ok(rocked > 0.01, 'the probe rocked the hull');
  assert.ok(worst > -1e-6, `no track corner drops below its seat while the hull rocks (worst ${worst.toFixed(5)} m)`);
}

// ---- two shots between one pair of frames rock the hull twice (no pending kick is dropped) ------------------------
{
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  const peakAfter = (kicks) => {
    for (let i = 0; i < 300; i++) visual.syncFromState(state, 1 / 60);
    const rest = root.rotation.x;
    for (let k = 0; k < kicks; k++) visual.recoilKick(0, 0.36, k);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      visual.syncFromState(state, 1 / 60);
      peak = Math.max(peak, Math.abs(root.rotation.x - rest));
    }
    return peak;
  };
  const one = peakAfter(1), two = peakAfter(2);
  assert.ok(two > one * 1.3, `a second belt shot inside the frame adds its rock (one ${one.toFixed(4)}, two ${two.toFixed(4)} rad)`);
}

visual.dispose();
console.log('hullFlinchPresentation.selftest: the drawn rock never reaches the sim, rocks unstepped states and keeps the tracks seated');
