// A hull on a wreck (bots lane, 2026-10-02). Sirocco Wadi frontline seed 96596: an M1A2 hopping beside a wreck that
// lay in a dip was lifted 1.9 m onto its roof as a "stack", then held airborne there for 300 s — every contact pass
// marked a hull resting on another hull as in flight, so it never drove, never stopped spinning or righted, and
// climbed as its turning shell sank into the roof. Real movement, the authority's finalized armor shells and its tick
// order (every hull's movement step with the hull-to-hull push, then the vertical contact pass) drive each case.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';
import { prefersVerticalTankContact, resolveTankBodyContacts, tanksVerticallyClear } from './tankBodyContacts.ts';
import { tankContactRect } from './tankContactShape.ts';
import { pushHullFromHull } from '../world/collision.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

await ensureAuthorityFleet(['m1a2', 't90m']);
const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

function hull(id, specId, x, y, z, yaw, wreck = false) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, y, z), yaw);
  return {
    id, specId, spec, state,
    combat: { hp: wreck ? 0 : spec.hp, maxHp: spec.hp, destroyed: wreck, reload: { t: 0, totalS: 5, kind: 'ready' },
      shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
  };
}

function airborne(entity, verticalSpeed) {
  entity.state.grounded = false;
  entity.state._ride.grounded = false;
  entity.state._ride.v = entity.state.verticalSpeed = verticalSpeed;
}

/** The authority's hull-to-hull push (collideWithEntities): pairs the vertical pass owns are not shoved sideways. */
function hullPush(entities, self) {
  return (pos, _radius, out) => {
    out.x = 0; out.z = 0;
    const rect = tankContactRect(self.spec), fx = Math.sin(self.state.yaw), fz = Math.cos(self.state.yaw);
    const cx = pos.x + fz * rect.centerX + fx * rect.centerZ, cz = pos.z - fx * rect.centerX + fz * rect.centerZ;
    for (const other of entities) {
      if (other === self || prefersVerticalTankContact(self, other) || tanksVerticallyClear(self, other)) continue;
      const o = tankContactRect(other.spec), ofx = Math.sin(other.state.yaw), ofz = Math.cos(other.state.yaw);
      const ocx = other.state.pos.x + ofz * o.centerX + ofx * o.centerZ;
      const ocz = other.state.pos.z - ofx * o.centerX + ofz * o.centerZ;
      pushHullFromHull(cx, cz, fx, fz, fz, -fx, rect.halfLength, rect.halfWidth,
        ocx, ocz, ofx, ofz, ofz, -ofx, o.halfLength, o.halfWidth, out);
    }
    return out.x !== 0 || out.z !== 0;
  };
}

/** Step the hulls for `seconds`; returns the subject's airborne time, longest airborne run and highest root. */
function run(field, entities, subject, seconds, onTick = null) {
  const pushes = entities.map((entity) => hullPush(entities, entity));
  let airS = 0, runS = 0, longestS = 0, topY = -Infinity;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    if (onTick) onTick(i * SIM_DT);
    entities.forEach((entity, k) => updateTank(entity, field, SIM_DT, pushes[k]));
    resolveTankBodyContacts(entities, SIM_DT);
    if (subject.state.grounded === false) { airS += SIM_DT; runS += SIM_DT; longestS = Math.max(longestS, runS); }
    else runS = 0;
    topY = Math.max(topY, subject.state.pos.y);
  }
  return { airS, longestS, topY };
}

console.log('[1] a hull hopping beside a wreck in a crater is not lifted onto its roof');
// (Sirocco Wadi: the wreck lay in a 0.7 m dip under the published-dimension boxes the headless battles used; with the
// finalized shells the same side contact needs a deeper hole, as a crater or a trench gives)
{
  // the wreck lies in a 1.7 m crater; the M1A2's hull rect overlaps its side by 5 cm and its ride has just detached
  // (physics lane round 8: the crater is as wide as the wreck's tracks, 1.77 m out, and no wider, so the M1A2 stands on
  // its tracks beside it; this case is the contact pass's. With the crater 2.6 m out the M1A2's whole left track hung
  // over it, and on either support line the hull rolled 30-33 degrees in about the lip, its centre of mass a metre
  // inboard of it and its right track 0.9-1.5 m in the air: the solve has no belly contact for a hull over an edge, a
  // class the lane names. On its real tracks it pivots on the left track's inner edge and its root rose 0.57 m, past
  // this check's 0.3 m.)
  const crater = { ...flat, getHeightAt: (x, z) => (Math.abs(x) < 1.85 && Math.abs(z) < 5 ? -1.7 : 0) };
  const wreck = hull('wreck', 't90m', 0, -1.7, 0, 0, true);
  const m1 = hull('m1a2', 'm1a2', 3.6, 0, 0, 0);
  run(crater, [wreck], wreck, 1); // the wreck settles on the crater floor
  airborne(m1, -0.25);
  const y0 = m1.state.pos.y;
  resolveTankBodyContacts([wreck, m1], SIM_DT);
  ok(m1.state.pos.y - y0 < 0.1, `the contact pass leaves it beside the wreck (${(m1.state.pos.y - y0).toFixed(2)} m up)`);
  const { longestS, topY } = run(crater, [wreck, m1], m1, 3);
  ok(longestS < 0.3 && topY < y0 + 0.3, `it lands where it was (airborne ${longestS.toFixed(2)} s, top ${topY.toFixed(2)} m)`);
}

console.log('[2] a hull dropped on a wreck rests on its roof as on ground');
{
  const wreck = hull('wreck', 't90m', 0, 0, 0, 0, true);
  const m1 = hull('m1a2', 'm1a2', 0.4, 3.0, 0.6, 0.3);
  airborne(m1, -1);
  const { airS, topY } = run(flat, [wreck, m1], m1, 10);
  const roof = m1.state.pos.y;
  ok(airS < 0.5, `it lands and stays grounded (airborne ${airS.toFixed(2)} s of 10 s)`);
  ok(roof > 2 && topY < 3.05, `on the roof, not climbing it (root ${roof.toFixed(2)} m, top ${topY.toFixed(2)} m)`);
  ok(Math.abs(m1.state.visualPitch) < 0.1 && Math.abs(m1.state.visualRoll) < 0.1, 'and settled level');
}

console.log('[3] from the roof it drives off and comes down on the ground');
{
  const wreck = hull('wreck', 't90m', 0, 0, 0, 0, true);
  const m1 = hull('m1a2', 'm1a2', 0.4, 3.0, 0.6, 0.3);
  airborne(m1, -1);
  run(flat, [wreck, m1], m1, 10, (t) => { m1.input.throttle = t > 2 ? 0.8 : 0; });
  const away = Math.hypot(m1.state.pos.x - wreck.state.pos.x, m1.state.pos.z - wreck.state.pos.z);
  ok(away > 15 && m1.state.grounded !== false && m1.state.pos.y < 0.5,
    `${away.toFixed(0)} m off, grounded at ${m1.state.pos.y.toFixed(2)} m`);
}

console.log('[4] a hull spinning and pitching on the roof stops and rights itself');
{
  // the battle's state after the lift: a yaw spin and a pitching shell on the wreck's roof
  const wreck = hull('wreck', 't90m', 0, 0, 0, 0, true);
  const m1 = hull('m1a2', 'm1a2', 0.4, 3.0, 0.6, 0.3);
  airborne(m1, -1);
  m1.state.yawRate = -0.58;
  m1.state._spring.pitchV = 0.5;
  const { airS, topY } = run(flat, [wreck, m1], m1, 10);
  ok(airS < 1.5 && Math.abs(m1.state.yawRate) < 0.05, `grounded (airborne ${airS.toFixed(2)} s), spin ${m1.state.yawRate.toFixed(2)} rad/s`);
  ok(!m1.state.overturned && topY < 3.2, `upright, top ${topY.toFixed(2)} m (not flipped and 7 m up)`);
}

console.log('[5] controls: a hard roof landing is still an impact, and a hull jumping off a roof is let go');
{
  const lower = hull('lower', 't90m', 0, 0, 0, 0);
  const upper = hull('upper', 'm1a2', 0.6, 2.45, 0.4, 0);
  airborne(upper, -6);
  resolveTankBodyContacts([lower, upper], SIM_DT);
  ok(upper.state.grounded === false && upper.state._body.dynamicSupport === true
    && Math.abs(upper.state._spring.pitchV) + Math.abs(upper.state._spring.rollV) > 0.05,
  'a 6 m/s landing bounces as an impact, with its angular kick');
  const wreck = hull('wreck', 't90m', 0, 0, 0, 0, true);
  const m1 = hull('m1a2', 'm1a2', 0.4, 3.0, 0.6, 0.3);
  airborne(m1, -1);
  run(flat, [wreck, m1], m1, 2);
  const roof = m1.state.pos.y;
  m1.state.grounded = false; m1.state._ride.grounded = false;
  m1.state._ride.v = m1.state.verticalSpeed = 4;
  const { topY } = run(flat, [wreck, m1], m1, 0.4);
  ok(topY > roof + 0.4, `a 4 m/s jump leaves the roof (${(topY - roof).toFixed(2)} m up)`);
}

if (failures) {
  console.error(`tankBodyRest.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('tankBodyRest.selftest: side contacts stay beside, roof rest is ground, drive-off, spin stops, controls passed');
