// The Studio's Plan view geometry (studioPlanView.ts): routes and the camera's track sampled with the timeline's own
// interpolation, a window that holds the whole take, and the camera's distance to the hero and height across it.
import assert from 'node:assert/strict';
import { normalizeStoryboard, sampleActorTrack, sampleCameraRail } from '../game/studioTimeline.ts';
import { planGeometry, planSide } from './studioPlanView.ts';

const storyboard = normalizeStoryboard({
  version: 2, durationMs: 6000,
  shots: [
    { id: 'a', tMs: 0, pos: [30, 20, -40], lookAt: [0, 2, 0], fov: 40, transition: 'spline' },
    { id: 'b', tMs: 3000, pos: [12, 3, 10], lookAt: [0, 2, 40], fov: 42, transition: 'spline' },
    { id: 'c', tMs: 6000, pos: [-20, 12, 70], lookAt: [0, 2, 80], fov: 44, transition: 'spline' },
  ],
  actorTracks: [
    { actor: 'hero', keys: [{ tMs: 0, pos: [0, 0], facingDeg: 0 }, { tMs: 6000, pos: [0, 90], facingDeg: 0, transition: 'linear' }] },
    { actor: 'foe0', keys: [{ tMs: 0, pos: [10, 160], facingDeg: 180 }, { tMs: 6000, pos: [10, 160], facingDeg: 180 }] },
  ],
});
const actors = [{ name: 'hero', x: 0, z: 0, facingDeg: 0 }, { name: 'ally1', x: -12, z: -15, facingDeg: 0 }, { name: 'foe0', x: 10, z: 160, facingDeg: 180 }];
const plan = planGeometry(storyboard, actors, 60);

assert.equal(plan.hero, 'hero');
assert.deepEqual([planSide('hero', 'hero'), planSide('foe2', 'hero'), planSide('ally1', 'hero'), planSide('Foe', 'hero')], ['hero', 'foe', 'ally', 'foe']);
assert.equal(plan.routes.length, 2, 'every keyed track is a route');
assert.equal(plan.routes[0].points.length, 61 * 2, 'a route is sampled across the take');
// the routes and the rail are the timeline's own samples
const track = {}, cam = {};
sampleActorTrack(storyboard.actorTracks[0].keys, 3000, track);
assert.ok(Math.abs(plan.routes[0].points[30 * 2 + 1] - track.z) < 1e-4, 'route samples come from the timeline');
sampleCameraRail(storyboard.shots, 3000, cam);
assert.ok(Math.abs(plan.rail[30 * 2] - cam.x) < 1e-4 && Math.abs(plan.rail[30 * 2 + 1] - cam.z) < 1e-4, 'rail samples come from the timeline');
// the window holds the whole take with a margin
const { cx, cz, half } = plan.bounds;
const inside = (x, z) => Math.abs(x - cx) < half && Math.abs(z - cz) < half;
for (const r of plan.routes) for (let i = 0; i < r.points.length; i += 2) assert.ok(inside(r.points[i], r.points[i + 1]), `${r.name} stays in the window`);
for (let i = 0; i < plan.rail.length; i += 2) assert.ok(inside(plan.rail[i], plan.rail[i + 1]), 'the camera track stays in the window');
for (const a of actors) assert.ok(inside(a.x, a.z), `${a.name} stays in the window`);
// the graph: the camera's distance to the hero (at the hero's tracked place) and its height
assert.equal(plan.series.distance.length, 61);
assert.ok(Math.abs(plan.series.distance[0] - Math.hypot(30, 20 - 1.5, -40)) < 1e-3, 'distance to the hero at the start');
assert.ok(Math.abs(plan.series.distance[60] - Math.hypot(-20, 12 - 1.5, 70 - 90)) < 1e-3, 'distance to the moving hero at the end');
assert.ok(Math.abs(plan.series.height[30] - cam.y) < 1e-4, 'height is the rail height');
assert.ok(plan.series.max >= Math.max(...plan.series.distance), 'the graph scale holds the distances');
// nothing keyed: the cast's window, no rail, no graph
const still = planGeometry(normalizeStoryboard({ durationMs: 4000 }), [{ name: 'hero', x: 100, z: -50, facingDeg: 0 }]);
assert.equal(still.rail, null);
assert.equal(still.series, null);
assert.ok(Math.abs(still.bounds.cx - 100) < 1e-9 && Math.abs(still.bounds.cz + 50) < 1e-9 && still.bounds.half >= 60, 'a still cast centres the window');
const empty = planGeometry(normalizeStoryboard({ durationMs: 4000 }), []);
assert.deepEqual(empty.bounds, { cx: 0, cz: 0, half: 150 }, 'an empty take shows the map centre');
console.log('studioPlanView.selftest: routes and rail from the timeline, a window holding the take, the camera distance and height graph, still and empty takes');
