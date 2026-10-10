import assert from 'node:assert/strict';
import { Vector3, Box3, Ray } from 'three';
import { initializeAerial, stepAerial, avoidDroneObstacles, droneTankAlong, DRONE_AVOIDANCE } from './aerialCombat.ts';
import { stepShell } from './ballistics.ts';
import { matchRulesetFor, AERIAL_RULES } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';

// A deterministic stand-in for the match world: flat ground plus axis-aligned buildings, answered with the same
// structural query both authorities pass (solo SoloWorld.raycast, authority worldCollision.raycast).
function boxWorld(boxes, groundY = 0) {
  const ray = new Ray(), hit = new Vector3(), normal = new Vector3();
  return {
    raycast(origin, direction, maxDist) {
      ray.origin.set(origin.x, origin.y, origin.z); ray.direction.set(direction.x, direction.y, direction.z);
      let best = null;
      if (direction.y < -1e-9) {
        const t = (groundY - origin.y) / direction.y;
        if (t >= 0 && t <= maxDist) best = { dist: t, normal: new Vector3(0, 1, 0), kind: 'terrain' };
      }
      for (const box of boxes) {
        if (box.containsPoint(ray.origin)) return { dist: 0, normal: new Vector3(0, 1, 0), kind: 'structure' };
        if (!ray.intersectBox(box, hit)) continue;
        const t = hit.distanceTo(ray.origin);
        if (t > maxDist || (best && best.dist <= t)) continue;
        const c = box.getCenter(new Vector3()), s = box.getSize(new Vector3()), d = hit.clone().sub(c);
        const ax = Math.abs(d.x / s.x), ay = Math.abs(d.y / s.y), az = Math.abs(d.z / s.z);
        normal.set(ax >= ay && ax >= az ? Math.sign(d.x) : 0, ay > ax && ay >= az ? Math.sign(d.y) : 0, az > ax && az > ay ? Math.sign(d.z) : 0);
        best = { dist: t, normal: normal.clone(), kind: 'structure' };
      }
      return best;
    },
  };
}
function carrier(id, x, z, yaw = 0) {
  return { id, team: 'alpha', isPlayer: true, state: { pos: new Vector3(x, 0, z), yaw, turretYaw: 0, speed: 0 }, combat: { destroyed: false },
    input: { auxiliaryBits: PLAYER_ACTION_BITS.DRONE, throttle: 1, steer: 0, fire: false, brake: false, aimPoint: new Vector3() } };
}
/** Fly one sortie; return the airframe track and whether any fixed-step segment crossed a building. */
function fly(world, entity, aim, seconds, { boxes = [], throttleAfter = 1 } = {}) {
  initializeAerial(entity, matchRulesetFor('drone'));
  let shell = null; const track = [], dt = 1 / 60;
  let crossed = false;
  for (let tick = 0; tick < seconds * 60; tick++) {
    const t = tick * dt;
    entity.input.aimPoint.copy(aim); entity.input.throttle = t > AERIAL_RULES.drone.launchS ? throttleAfter : 0;
    stepAerial(entity, t, dt, () => 1, s => { shell = s; }, world);
    if (!shell || shell.dead) break;
    stepShell(shell, dt);
    // The sweep both authorities run: no step may carry the airframe through a collider.
    const segment = new Ray(shell.prevPos.clone(), shell.pos.clone().sub(shell.prevPos).normalize()), length = shell.pos.distanceTo(shell.prevPos), point = new Vector3();
    for (const box of boxes) if (box.containsPoint(shell.pos) || (length > 1e-9 && segment.intersectBox(box, point) && point.distanceTo(shell.prevPos) <= length)) crossed = true;
    track.push(shell.pos.clone());
  }
  return { track, crossed, shell };
}

// 1. Ordered straight through a 14 m block: the drone climbs over or turns around it, never through, and gets past.
{
  const building = new Box3(new Vector3(-12, 0, 40), new Vector3(12, 14, 60));
  const world = boxWorld([building]);
  const { track, crossed } = fly(world, carrier('pilot', 0, 0), new Vector3(0, 13, 140), 14, { boxes: [building] });
  assert.equal(crossed, false, 'no fixed step carries the drone through the building');
  const clearance = DRONE_AVOIDANCE.clearanceM * .5;
  const inflated = building.clone().expandByScalar(clearance);
  assert.ok(track.every(p => !inflated.containsPoint(p)), 'the airframe keeps clear air around the walls (rotor tips plus wobble)');
  const past = track.find(p => p.z > 66);
  assert.ok(past, 'the drone routes past the building toward its aim');
  const over = track.some(p => p.z > 40 && p.z < 60 && p.y > building.max.y), around = track.some(p => p.z > 40 && p.z < 60 && Math.abs(p.x) > building.max.x);
  assert.ok(over || around, 'it went over the roof or around a side');
  console.log(`droneAvoidance: building crossed ${over ? 'over the roof' : 'around the side'}; peak ${Math.max(...track.map(p => p.y)).toFixed(1)} m`);
}

// 2. A wall too tall to top and too wide to skirt inside the look-ahead: the drone holds a standoff hover.
{
  const wall = new Box3(new Vector3(-400, 0, 30), new Vector3(400, 400, 34));
  const world = boxWorld([wall]);
  const { track, crossed } = fly(world, carrier('pilot', 0, 0), new Vector3(0, 12, 200), 12, { boxes: [wall] });
  assert.equal(crossed, false, 'boxed in: never clips into the wall');
  const last = track.at(-1);
  assert.ok(last.z < wall.min.z - DRONE_AVOIDANCE.clearanceM && last.z > wall.min.z - DRONE_AVOIDANCE.maxLookM - 10, `holds a standoff short of the wall (z ${last.z.toFixed(2)})`);
  const settle = track.slice(-60), drift = settle[0].distanceTo(settle.at(-1));
  assert.ok(drift < 1, `standoff hover is stable (drift ${drift.toFixed(2)} m over 1 s)`);
  console.log(`droneAvoidance: boxed in, standing off ${(wall.min.z - last.z).toFixed(1)} m from the wall`);
}

// 3. Terrain: a shallow dive at the ground pulls up instead of burying the airframe.
{
  const world = boxWorld([]);
  const { track } = fly(world, carrier('pilot', 0, 0), new Vector3(0, -40, 120), 8);
  assert.ok(track.every(p => p.y > DRONE_AVOIDANCE.clearanceM * .4), 'the airframe never meets the ground it was ordered into');
}

// 4. An attack run is not an obstacle: a tank in front of the ground stays the target and the drone is not turned.
{
  const world = boxWorld([]), position = new Vector3(0, 10, 0), commanded = new Vector3(0, -20, 30);
  const before = commanded.clone();
  const target = { id: 'enemy', state: { pos: new Vector3(0, 0, 15) }, combat: { destroyed: false }, spec: { dims: { hullLengthM: 7, heightM: 2.4 }, armor: { boundingRadiusM: 4.6 } } };
  const withTanks = { ...world, tankAlong: (o, d, m, owner) => droneTankAlong([target, { ...target, id: 'pilot', state: { pos: new Vector3(0, 0, 4) } }], o, d, m, owner) };
  assert.equal(avoidDroneObstacles(withTanks, 'pilot', position, commanded), false, 'diving at a tank is an attack, not a collision to avoid');
  assert.deepEqual(commanded.toArray(), before.toArray());
  assert.equal(avoidDroneObstacles(world, 'pilot', position, commanded), true, 'the same dive with no tank pulls up');
  assert.ok(commanded.y > before.y, 'pull-up raises the path');
  target.combat.destroyed = true;
  assert.equal(droneTankAlong([target], position, before.clone().normalize(), 80, 'pilot'), null, 'a wreck is no longer a target');
}

// 5. Launch under a deck: the climb stops short of the overhang, never through it.
{
  const deck = new Box3(new Vector3(-6, 7, -6), new Vector3(6, 8, 6));
  const world = boxWorld([deck]);
  const entity = carrier('pilot', 0, 0);
  const { track, crossed } = fly(world, entity, new Vector3(0, 6, 0), AERIAL_RULES.drone.launchS, { boxes: [deck], throttleAfter: 0 });
  assert.equal(crossed, false, 'launch never rises through the deck');
  const top = Math.max(...track.map(p => p.y));
  assert.ok(top <= deck.min.y - DRONE_AVOIDANCE.clearanceM + 1e-6 && top > 4, `climb ends under the deck (${top.toFixed(2)} m)`);
}

// 6. Determinism: identical inputs fly identical tracks, bit for bit.
{
  const building = new Box3(new Vector3(-8, 0, 30), new Vector3(30, 22, 45));
  const a = fly(boxWorld([building]), carrier('a', 0, 0), new Vector3(10, 15, 120), 10).track;
  const b = fly(boxWorld([building]), carrier('a', 0, 0), new Vector3(10, 15, 120), 10).track;
  assert.equal(a.length, b.length);
  assert.ok(a.every((p, i) => p.x === b[i].x && p.y === b[i].y && p.z === b[i].z), 'fixed-step avoidance is deterministic');
}

// 7. No world (fixtures, legacy callers): flight is unchanged from the open-air controller.
{
  const free = fly(null, carrier('pilot', 0, 0), new Vector3(0, 13, 140), 6).track;
  const open = fly(boxWorld([]), carrier('pilot', 0, 0), new Vector3(0, 13, 140), 6).track;
  assert.equal(free.length, open.length);
  assert.ok(free.every((p, i) => p.distanceTo(open[i]) < 1e-9), 'open air: the world probe never perturbs flight');
}
console.log('droneAvoidance: building routed, boxed-in standoff, ground pull-up, attack-run exemption, launch under a deck, determinism and open-air parity passed');
