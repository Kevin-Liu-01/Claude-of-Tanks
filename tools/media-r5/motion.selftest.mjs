// Motion for the site fifty and the films (owner 2026-10-05: the lens on a fully 3D track, close and far; tanks fast in
// every direction): routes driven by arc length, stabilised guns, the travel frame, the spline rail, the move library
// and the route clearance check.
import assert from 'node:assert/strict';
import { buildShot, frame, routePath } from './setups.mjs';
import { MOTION, cable, charge, crossing, arc, leadReveal, orbitRise, overtake, swoop, weave } from './moves.mjs';
import { routeProblems } from './route-check.mjs';
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';

const wrap = (d) => ((d % 360) + 540) % 360 - 180;

// routes: arc-length speed with a ramp, the hull along the travel, carrying on past the last waypoint
{
  const route = routePath({ pts: [[0, 0], [0, 40], [30, 80], [60, 90]], speed: 16, v0: 4, accel: 6 }, frame([0, 0], 0));
  const at = (t) => route(t).p, speed = (t) => Math.hypot(at(t + 50)[0] - at(t - 50)[0], at(t + 50)[1] - at(t - 50)[1]) / 0.1;
  assert.ok(Math.abs(speed(100) - 4.6) < 0.3, `starts near v0 (${speed(100).toFixed(2)} m/s)`);
  for (const t of [2500, 4000, 6000, 9000]) assert.ok(Math.abs(speed(t) - 16) < 0.15, `cruises at 16 m/s at ${t} ms (${speed(t).toFixed(2)})`);
  let worst = 0;
  for (let t = 200; t < 9000; t += 37) {
    const a = at(t - 5), b = at(t + 5), travel = Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
    worst = Math.max(worst, Math.abs(wrap(travel - route(t).h)));
  }
  assert.ok(worst < 0.6, `the hull follows its travel (worst ${worst.toFixed(2)}°)`);
  const standing = routePath({ pts: [[0, 0], [0, 50]], speed: 10, startMs: 1000 }, frame([5, 5], 90));
  assert.deepEqual(standing(500).p, standing(0).p, 'a delayed start stands until startMs');
  assert.ok(Math.abs(standing(2000).p[0] - 15) < 0.05, 'then drives along the set heading (+x at 90°)');
}

// buildShot: routed actors, a stabilised gun, the spline rail and the travel frame
const set = { id: 'motion-test', map: 'verdant', anchor: [0, 0], heading: 0, lineup: ['t90m_x', 't90a_x'], formation: 'pair', count: 2,
  enemies: { along: 140, count: 1, formation: 'line', lineup: ['leo2a6_x'] } };
const swerve = { hero: charge({ speed: 15, wiggle: 9 }), ally1: crossing({ from: [20, -10], to: [-25, 90], speed: 14 }) };
{
  const scene = buildShot(set, { ...MOTION, durMs: 6600, routes: swerve, aim: { hero: 'foe0' }, cam: swoop(6600) });
  const hero = scene.actors.find((a) => a.name === 'hero'), tracks = new Map(scene.storyboard.actorTracks.map((t) => [t.actor, t.keys]));
  assert.deepEqual(hero.pos, [0, 0], 'a routed hero starts at its route');
  assert.ok(scene.storyboard.shots.every((s) => s.transition === 'spline'), 'the lens flies the spline rail');
  assert.ok(scene.storyboard.shots.length <= 32 && [...tracks.values()].every((k) => k.length <= 64), 'within the Studio caps');
  const foe = scene.actors.find((a) => a.name === 'foe0').pos, o = {};
  for (const t of [800, 2600, 4400, 6200]) {
    sampleActorTrack(tracks.get('hero'), t, o);
    const bearing = Math.atan2(foe[0] - o.x, foe[1] - o.z) * 180 / Math.PI;
    assert.ok(Math.abs(wrap(o.facingDeg + o.turretDeg - bearing)) < 1.5, `the hero's gun holds the foe at ${t} ms`);
  }
  // the travel frame rides the swerves without swinging with them: a lens keyed 12 m off the hull's right swings less
  // across the take in the travel frame than in the hull's own
  const side = (frameMode) => buildShot(set, { ...MOTION, durMs: 6600, routes: swerve, cam: [{ tMs: 0, frame: frameMode, side: 12, along: 0, lift: 2 }, { tMs: 'end', frame: frameMode, side: 12, along: 0, lift: 2 }] });
  // roughness: the lens path's summed second differences (its jerks), lower when it flows; both frames follow the hull's
  // own swerve, the travel frame drops the swing of the 12 m arm with every turn of the hull
  const rough = (scene) => scene.storyboard.shots.slice(1, -1).reduce((sum, s, i) => {
    const a = scene.storyboard.shots[i].pos, c = scene.storyboard.shots[i + 2].pos;
    return sum + Math.hypot(a[0] - 2 * s.pos[0] + c[0], a[2] - 2 * s.pos[2] + c[2]);
  }, 0);
  const [travel, hull] = [rough(side('travel')), rough(side('hero'))];
  assert.ok(travel < hull * 0.85, `the travel frame smooths the lens through the swerves (${travel.toFixed(1)} vs ${hull.toFixed(1)})`);
}

// the move library: well-formed key lists that keep the hero in front, close and far
for (const [name, keys] of Object.entries({ swoop: swoop(6600), leadReveal: leadReveal(6600), orbitRise: orbitRise(6600), cable: cable(6600), weave: weave(6600), overtake: overtake(6600) })) {
  assert.ok(keys.length >= 2 && keys[0].tMs === 0 && keys[keys.length - 1].tMs === 'end', `${name}: opens at 0 and closes at the end`);
  const times = keys.slice(0, -1).map((k) => k.tMs);
  assert.ok(times.every((t, i) => !i || t > times[i - 1]), `${name}: key times ascend`);
  const scene = buildShot(set, { ...MOTION, durMs: 6600, routes: { hero: arc({ speed: 14 }) }, cam: keys });
  const d = scene.storyboard.shots.map((s) => Math.hypot(s.pos[0] - s.lookAt[0], s.pos[2] - s.lookAt[2]));
  if (name !== 'weave') assert.ok(Math.max(...d) / Math.max(1, Math.min(...d)) > 1.6, `${name}: the lens swings close and far (${Math.min(...d).toFixed(0)}–${Math.max(...d).toFixed(0)} m)`);
}

// route clearance: walls, woods, water, edges and near collisions are caught; open ground passes
{
  // (lat + is the set heading's right, -x for a +z heading: a route at lat 30 runs down x = -30)
  const features = { size: 1024, buildings: [{ x: -3, z: 60, w: 10, d: 10, rot: 0, kind: 'barn' }], treeClusters: [{ x: -30, z: 40, r: 12 }], waterOrSoft: [] };
  const clean = buildShot(set, { durMs: 6600, routes: { hero: { pts: [[30, 0], [30, 100]], speed: 12 }, ally1: { pts: [[-40, 0], [-40, 100]], speed: 12 } }, cam: [{ tMs: 0, side: 10, lift: 3 }] });
  const open = { ...features, buildings: [], treeClusters: [] };
  assert.deepEqual(routeProblems(clean, open), [], 'open ground passes');
  const through = buildShot(set, { durMs: 6600, routes: { hero: { pts: [[0, 0], [0, 100]], speed: 12 }, ally1: { pts: [[-40, 0], [-40, 100]], speed: 12 } }, cam: [{ tMs: 0, side: 10, lift: 3 }] });
  assert.ok(routeProblems(through, features).some((p) => p.actor === 'hero' && /barn/.test(p.what)), 'a route through a building is caught');
  const wood = buildShot(set, { durMs: 6600, routes: { hero: { pts: [[-40, 0], [-40, 100]], speed: 12 }, ally1: { pts: [[30, 0], [30, 100]], speed: 12 } }, cam: [{ tMs: 0, side: 10, lift: 3 }] });
  assert.ok(routeProblems(wood, features).some((p) => p.actor === 'ally1' && /wood/.test(p.what)), 'a route through a wood is caught');
  const ram = buildShot(set, { durMs: 6600, routes: { hero: { pts: [[30, 0], [30, 100]], speed: 12 }, ally1: { pts: [[60, 30], [0, 30]], speed: 12 } }, cam: [{ tMs: 0, side: 10, lift: 3 }] });
  assert.ok(routeProblems(ram, open).some((p) => /hero\+ally1|ally1\+hero/.test(p.actor) && /apart/.test(p.what)), 'crossing hulls that meet are caught');
}

console.log('motion.selftest: routes (arc-length speed, ramps, starts, hull on travel), stabilised guns, the travel frame, the spline rail, six moves and route clearance passed');
