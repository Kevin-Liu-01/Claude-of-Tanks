// A hull pressed into a static solid with no way releases at once (268, Main item 10 (A)). Horde, Desert seed 12: a T-64BV
// on its route's first waypoint (-200, -75) drove into the 1.5 m gap between two boulders on a slope (9 -> 11 m) and stood
// there 4 s at 0.95 throttle, both boulders' footprints inside its hull, until the low-speed watchdog (STUCK_TIME_S)
// reversed it. The controller now releases once it has pressed a static solid it touches (CONTACT_PROBES within
// STATIC_CONTACT_M) for WEDGE_CONTACT_S: the reverse swings the bow away from the contact. Never for a hull or a crushable.
//
// The scene is the seed's own: Desert's ground and the three boulder records round (-186, -77) from the dedicated world, the
// T-64BV at the recorded wedge pose. Contact is a wall: a step that would put the hull's rectangle into a boulder's
// footprint is undone and its way stopped (the measured response: no way while pressed). Pass: no pressed stand in contact
// longer than 0.5 s, and the case is built (the hull does press a boulder).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import { hullYieldingRecord, collisionFootprintContainsPoint } from '../world/collision.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

await ensureAuthorityFleet();
const world = createDedicatedWorldCollision('desert', { retain: true, variant: terrainVariantFor('endless_horde') });
const field = world.heightField;
const BOULDERS = world.queryObstacles(-196, -88, -176, -66, []).filter((o) => !hullYieldingRecord(o) && !o.crushed);
assert.ok(BOULDERS.length >= 2, `the seed's boulders are on the map (${BOULDERS.length})`);
const spec = getSpec('t64bv');
const hl = spec.dims.hullLengthM / 2, hw = spec.dims.widthM / 2;
/** Hull rectangle sample points inside any boulder footprint. */
function contacts(x, z, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let n = 0;
  for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) {
    const px = x + fx * a * hl + fz * b * hw, pz = z + fz * a * hl - fx * b * hw;
    for (const o of BOULDERS) if (collisionFootprintContainsPoint(o, px, pz, 0)) n++;
  }
  return n;
}
const state = createTankState(spec, new Vector3(-186.31, field.getHeightAt(-186.31, -77.29), -77.29), -1.50);
const bot = { id: 'bot-bravo-3', specId: spec.id, spec, team: 'bravo', state,
  combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' },
    shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
  input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 }, aiCtl: null };
const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(12), deps: {
  heightField: field, raycast: () => null, getEnemies: () => [], getAllies: () => [],
  getObstacles: () => BOULDERS, spotting: { isSpotted: () => false } } });
ctl.setWaypoints([[-200, -75], [-260, -70]], { loop: false });
const start = contacts(state.pos.x, state.pos.z, state.yaw);
let pressedT = 0, longestPressedS = 0, pressedTicks = 0;
for (let i = 0; i < 8 / SIM_DT; i++) {
  ctl.update(SIM_DT, 10 + i * SIM_DT);
  const px = state.pos.x, pz = state.pos.z, pyaw = state.yaw, before = contacts(px, pz, pyaw);
  updateTank(bot, field, SIM_DT, null);
  // the wall: a step deeper into a boulder is undone, and the hull has no way
  if (contacts(state.pos.x, state.pos.z, state.yaw) > before) {
    state.pos.x = px; state.pos.z = pz; state.yaw = pyaw; state.speed = 0;
  }
  const pressed = bot.input.throttle > 0.5 && Math.abs(state.speed) < 0.3 && contacts(state.pos.x, state.pos.z, state.yaw) > 0;
  if (pressed) { pressedTicks++; pressedT += SIM_DT; longestPressedS = Math.max(longestPressedS, pressedT); } else pressedT = 0;
}
const info = ctl.debugInfo();
console.log(`seed-12 boulders: ${BOULDERS.length}; contact at the start ${start} hull points; pressed ticks ${pressedTicks}, longest pressed stand `
  + `${longestPressedS.toFixed(2)} s; contact releases ${info.contactReleases}; the hull ends at (${state.pos.x.toFixed(1)}, ${state.pos.z.toFixed(1)}), `
  + `${contacts(state.pos.x, state.pos.z, state.yaw)} points in contact`);
assert.ok(start > 0, 'the case is built: the hull starts with boulders inside its footprint (the recorded wedge)');
assert.ok(pressedTicks > 0, 'the case is built: the controller presses into a boulder at least once');
assert.ok(longestPressedS <= 0.5, `no pressed stand in contact longer than 0.5 s (${longestPressedS.toFixed(2)} s)`);
assert.ok(info.contactReleases > 0, 'the contact release fired');
world.release?.();
console.log('ai.rockWedge.selftest: a hull pressed into a static solid with no way releases within 0.5 s (Desert seed 12\'s boulder gap)');
