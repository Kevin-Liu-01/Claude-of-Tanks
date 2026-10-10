// Drawn track contact on bridge decks — the vehicle-contact lane, 2026-10-09 (owner: "tracks shouldnt glitch through the
// bridge or textures, like how they do on the bridge in aegis crossing").
//
// Each case drives a hull through the real network authority (sim/authoritativeMatch.ts over the dedicated collision
// shards) from the approach, across a bridge deck at full throttle and off the far side, then parks one on the deck. The
// battle visual (vehicles/tankFactory.ts) is synced every tick with the sampler the solo battle and the multiplayer client
// hand their vehicles (world/vehicleGroundSampler.ts). The oracle is the drawn deck: each terrain bridge deck's plane
// (heightField.bridgeDecks deckY, where the bridge kit seats its slab), or the terrain's contact surface off the span.
//
// Asserted while the hull is over the span: no running-gear vertex (road wheels, track band, pads) lies more than
// PENETRATION_M under the drawn deck; parked, the lowest point of each track side rests within REST_M of it; the hull
// stays upright and rides at its contact plane over the deck. Before the fix the drawn tracks sat 21-32 cm inside Aegis
// Crossing's deck (the wheels read the gorge bed 30 m down and fell to their droop) while the hull rode on top.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { resetTankVerticalState, SIM_DT } from '../sim/movement.ts';
import { createTank } from '../vehicles/tankFactory.ts';
import { WHEEL_STANDABLE_STEP_M } from '../vehicles/tankFactoryCore.ts';
import { HULL_STEP_UP_M } from './collision.ts';
import { createVehicleGroundSampler } from './vehicleGroundSampler.ts';

installCanvasFixture();
assert.equal(WHEEL_STANDABLE_STEP_M, HULL_STEP_UP_M, 'the wheels stand on a top by the hull step-up the movement solve admits');

const PENETRATION_M = 0.03;
const REST_M = 0.03;
const UPRIGHT_RAD = 4 * Math.PI / 180;

// t90m: a resized hull (profiles/vehicleSize.ts samples in its authoring frame); m1a2: a plain hull; ariete_c1_x: the
// Ariete family's own scaled frame (profiles/arieteXFamilyScale.ts).
const CASES = [
  { mapId: 'cliffbridge', deck: 'longest', hulls: ['t90m', 'm1a2', 'ariete_c1_x'] },
  { mapId: 'autumn', deck: 'longest', hulls: ['t90m'] },
  { mapId: 'blackglass', deck: 'longest', hulls: ['m1a2'] },
];

const scratch = { p: new THREE.Vector3(), m: new THREE.Matrix4(), w: new THREE.Matrix4() };
const GEAR = /^gear(?:RoadWheel|TrackPads|TrackBand|Track)/;

function deckFrame(deck, x, z) {
  const dx = x - deck.x, dz = z - deck.z;
  return { along: dx * deck.ux + dz * deck.uz, across: dx * deck.uz - dz * deck.ux };
}

/** The drawn surface: the deck plane over the span (between the parapets), else the terrain's contact surface. */
function drawnSurface(hf, deck, x, z) {
  const ground = hf.getContactHeightAt(x, z);
  const { along, across } = deckFrame(deck, x, z);
  return Math.abs(along) <= deck.halfLength && Math.abs(across) <= deck.halfWidth ? Math.max(ground, deck.deckY) : ground;
}

/** The running gear's lowest gap to the drawn surface, overall and per track side (hull-local x sign). */
function gearGaps(visual, hf, deck, yaw) {
  const { p, m, w } = scratch;
  visual.root.updateMatrixWorld(true);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const out = { min: Infinity, side: { [-1]: Infinity, [1]: Infinity }, vertices: 0 };
  const origin = visual.root.position;
  visual.root.traverseVisible((mesh) => {
    if (!mesh.isMesh || !GEAR.test(mesh.name)) return;
    const position = mesh.geometry.getAttribute('position');
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, m); w.multiplyMatrices(mesh.matrixWorld, m); } else w.copy(mesh.matrixWorld);
      for (let v = 0; v < position.count; v++) {
        p.fromBufferAttribute(position, v).applyMatrix4(w);
        const gap = p.y - drawnSurface(hf, deck, p.x, p.z);
        if (gap < out.min) out.min = gap;
        const side = (p.x - origin.x) * rx + (p.z - origin.z) * rz >= 0 ? 1 : -1;
        if (gap < out.side[side]) out.side[side] = gap;
        out.vertices++;
      }
    }
  });
  return out;
}

const report = [];
for (const { mapId, hulls } of CASES) {
  await ensureAuthorityFleet([...hulls, 't90m']);
  const world = createDedicatedWorldCollision(mapId);
  const hf = world.heightField;
  const decks = hf.bridgeDecks ?? [];
  assert.ok(decks.length > 0, `${mapId} has a terrain bridge deck`);
  const deck = decks.reduce((a, b) => (b.halfLength > a.halfLength ? b : a));
  assert.ok(hf.getContactHeightAt(deck.x, deck.z) < deck.deckY - 0.5, `${mapId}: the ground under the deck lies well below it`);
  const sampler = createVehicleGroundSampler((x, z) => hf.getContactHeightAt(x, z), () => world);
  for (const specId of hulls) {
    // drive: from 18 m short of the deck's near end to 18 m past its far end, along the deck axis at full throttle
    const startAlong = -deck.halfLength - 18;
    const players = [
      { id: 'subject', specId, team: 'alpha' },
      { id: 'anchor', specId: 't90m', team: 'bravo' },
    ];
    const match = createAuthoritativeMatch({ players, mapId, seed: 4242, countdownS: 0, worldCollision: world });
    match.onMatchReady();
    const subject = match.entityById.get('subject');
    const anchor = match.entityById.get('anchor');
    for (const entity of match.entities) entity.combat.hp = entity.combat.maxHp = 1e7;
    const yaw = Math.atan2(deck.ux, deck.uz);
    const place = (entity, along, across) => {
      const s = entity.state;
      s.pos.x = deck.x + deck.ux * along - deck.uz * across;
      s.pos.z = deck.z + deck.uz * along + deck.ux * across;
      s.yaw = yaw;
      resetTankVerticalState(s, drawnSurface(hf, deck, s.pos.x, s.pos.z), 0, true);
      s._sup.x = NaN;
    };
    place(subject, startAlong, 0);
    place(anchor, -deck.halfLength - 400, 60); // out of the way, off the crossing
    const visual = createTank(specId, null, { proceduralOnly: true });
    visual.setGroundSampler(sampler);
    const inputs = new Map();
    const drive = { throttle: 1, steer: 0, brake: false, fire: false, aimLocked: true, actionBits: 0, shellSlot: 0 };
    const hold = { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, actionBits: 0, shellSlot: 0 };
    const row = { mapId, specId, spanSamples: 0, worstGapM: Infinity, worstPitch: 0, worstRoll: 0, rideM: [Infinity, -Infinity], crossed: false };
    const travel = 2 * deck.halfLength + 36;
    for (let tick = 0; tick < 60 * 40; tick++) {
      inputs.set('subject', drive);
      match.step({ dt: SIM_DT, inputs });
      visual.syncFromState(subject.state, SIM_DT, 20);
      const s = subject.state;
      const { along, across } = deckFrame(deck, s.pos.x, s.pos.z);
      if (along - startAlong >= travel) { row.crossed = true; break; }
      // over the span with the whole hull (a hull length clear of both abutments), every 6th tick
      if (tick % 6 || Math.abs(along) > deck.halfLength - 6 || Math.abs(across) > deck.halfWidth - 3) continue;
      const gaps = gearGaps(visual, hf, deck, s.yaw);
      row.spanSamples++;
      row.worstGapM = Math.min(row.worstGapM, gaps.min);
      row.worstPitch = Math.max(row.worstPitch, Math.abs(s.visualPitch));
      row.worstRoll = Math.max(row.worstRoll, Math.abs(s.visualRoll));
      const ride = s.pos.y - deck.deckY;
      row.rideM = [Math.min(row.rideM[0], ride), Math.max(row.rideM[1], ride)];
    }
    // park on the deck's middle: settle, then the lowest point of each track side rests on the deck
    place(subject, 0, 0);
    subject.state.speed = 0;
    for (let tick = 0; tick < 90; tick++) {
      inputs.set('subject', hold);
      match.step({ dt: SIM_DT, inputs });
      visual.syncFromState(subject.state, SIM_DT, 20);
    }
    const rest = gearGaps(visual, hf, deck, subject.state.yaw);
    row.restSideGapM = [rest.side[-1], rest.side[1]];
    row.restRideM = subject.state.pos.y - deck.deckY;
    visual.dispose?.();
    const label = `${mapId} ${specId}`;
    assert.ok(row.crossed, `${label}: the hull drove across the deck (${JSON.stringify(row)})`);
    assert.ok(row.spanSamples >= 6, `${label}: sampled the span (${row.spanSamples})`);
    assert.ok(row.worstGapM >= -PENETRATION_M, `${label}: running gear ${(-row.worstGapM * 100).toFixed(1)} cm inside the deck at speed`);
    assert.ok(row.worstPitch < UPRIGHT_RAD && row.worstRoll < UPRIGHT_RAD, `${label}: upright over the deck (${row.worstPitch}, ${row.worstRoll})`);
    assert.ok(row.rideM[0] > -0.15 && row.rideM[1] < 0.6, `${label}: the hull rides on the deck (${row.rideM})`);
    for (const gap of row.restSideGapM) {
      assert.ok(Math.abs(gap) <= REST_M, `${label}: parked, each track side rests on the deck (${row.restSideGapM.map((g) => (g * 100).toFixed(1))} cm)`);
    }
    report.push({ ...row, worstGapCm: +(row.worstGapM * 100).toFixed(1), restSideGapCm: row.restSideGapM.map((g) => +(g * 100).toFixed(1)) });
  }
  world.release?.();
}
for (const row of report) {
  console.log(`  ${row.mapId} ${row.specId}: span samples ${row.spanSamples}, worst gear gap ${row.worstGapCm} cm, parked sides ${row.restSideGapCm.join('/')} cm`);
}
console.log('vehicle ground contact: drawn tracks rest on the Aegis Crossing viaduct, Amberford and Suzhou Creek bridge decks PASS');
