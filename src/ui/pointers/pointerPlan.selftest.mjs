#!/usr/bin/env node
// pointerPlan.selftest.mjs — the battle's one pointer primitive (guidance-pointers-275). Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-22: "for stuff for you to follow, its on ground. for the warnings / indicators thats in the ui". Holds:
//  1. follow (the ground): one follow pointer shows (the tutorial's, then the ball, then the objective, then the nearest);
//     its trail lies on the way, steps evenly, never inside the destination, and goes once the tank is at its edge; the
//     turn arrow stands only while the destination is out of the camera's view, sweeps the way to turn, and its head
//     ends nearer the destination's bearing than its band starts;
//  2. the objective that matters now, per mode (the ball, the sector fought for, a zone being taken, the nearest one not
//     held, the flags' order), and none in the standard battle;
//  3. warn (the UI): the rim's geometry (the inset rectangle, the HUD band, behind the camera); a warning the camera
//     shows gets no bubble; the most urgent come first; neighbours on the rim merge; the cap is 4, 3 on a phone; a
//     bubble slides along the rim off the HUD and keeps pointing at its warning; the sight lets only threats through;
//  4. the warnings' sources: a spotted enemy with its gun on the tank or close (never an unspotted, dead or friendly one);
//     an enemy air run the tank stands in, pointing at the jet's run-in, its ring the warning's time left; an enemy
//     missile coming at the tank;
//  5. the plan is deterministic, and the layer draws in screen space only and never takes the pointer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOSE_M, GUN_ON_M, OBJECTIVE_ZONE_RADIUS_M, POINTER_PRIORITY, STRIKE_RING_S, TRAIL_COUNT, TRAIL_FIRST_M, TRAIL_HIDE_WITHIN_M,
  TRAIL_STEP_M, TURN_FROM_DEG, TURN_RADII_M, bearing, bubbleCap, edgeInsets, edgePointer, insideInsets, missileWarnings,
  objectiveFollow, pickFollow, planBubbles, strikeWarnings, tankWarnings, trailChevrons, turnArrow,
} from './pointerPlan.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centroid = (outline) => ({ x: outline.reduce((s, p) => s + p.x, 0) / outline.length, z: outline.reduce((s, p) => s + p.z, 0) / outline.length });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 1. Follow: on the ground.
{
  const w = { id: 'w', kind: 'waypoint', x: 0, z: 90, radiusM: 6, trail: true };
  const ball = { id: 'ball', kind: 'ball', x: 0, z: 10, radiusM: 3, trail: true };
  const a = { id: 'zone:A', kind: 'objective', x: 0, z: 200, radiusM: 30, trail: true };
  const b = { id: 'zone:B', kind: 'objective', x: 0, z: 100, radiusM: 30, trail: true };
  const tank = { x: 0, z: 0 };
  assert.equal(pickFollow([a, ball, w], tank)?.id, 'w', "the tutorial's own pointer first");
  assert.equal(pickFollow([a, ball], tank)?.id, 'ball', 'then the ball');
  assert.equal(pickFollow([a, b], tank)?.id, 'zone:B', 'then the nearest');
  assert.equal(pickFollow([{ ...a, x: 0, z: 100 }, b], tank)?.id, 'zone:A', 'a tie falls to the id');
  assert.equal(pickFollow([], tank), null);
}
{
  const from = { x: 0, z: 0 }, to = { x: 0, z: 200 };
  const trail = trailChevrons(from, to, 6);
  assert.equal(trail.length, TRAIL_COUNT, 'a far destination gets the whole trail');
  trail.forEach((chevron, i) => {
    const c = centroid(chevron.outline);
    assert.equal(chevron.index, i);
    assert.ok(near(c.x, 0, 1e-9), `chevron ${i} lies on the way`);
    assert.ok(Math.abs(c.z - (TRAIL_FIRST_M + i * TRAIL_STEP_M)) < 0.5, `chevron ${i} steps evenly`);
    assert.equal(chevron.outline.length, 6, 'a chevron is a six-point outline laid flat');
    const tip = chevron.outline[0];
    assert.ok(tip.z > c.z, 'its tip points at the destination');
    const width = Math.max(...chevron.outline.map((p) => p.x)) - Math.min(...chevron.outline.map((p) => p.x));
    assert.ok(width > 2, 'it is broad on the ground (metres, not pixels): it foreshortens with the terrain');
  });
  const side = trailChevrons(from, { x: 40, z: 0 }, 6);
  for (const chevron of side) for (const p of chevron.outline) assert.ok(dist(p, { x: 40, z: 0 }) > 6 - 1e-9, 'no chevron inside the destination');
  assert.equal(trailChevrons(from, { x: 0, z: 6 + TRAIL_HIDE_WITHIN_M }, 6).length, 0, 'none at the destination\'s edge');
  assert.ok(trailChevrons(from, { x: 0, z: 6 + TRAIL_HIDE_WITHIN_M + TRAIL_FIRST_M + 2 }, 6).length >= 1, 'a near destination keeps its first chevron');
}
{
  const tank = { x: 0, z: 0 };
  assert.equal(turnArrow(tank, 0, { x: 0, z: 100 }), null, 'a destination ahead of the camera: no turn arrow');
  const edgeDeg = TURN_FROM_DEG - 5;
  assert.equal(turnArrow(tank, 0, { x: Math.sin((edgeDeg * Math.PI) / 180) * 100, z: Math.cos((edgeDeg * Math.PI) / 180) * 100 }), null,
    'inside the view\'s cone: none');
  for (const [to, turn] of [[{ x: 100, z: -20 }, 1], [{ x: -100, z: -20 }, -1], [{ x: 30, z: -100 }, 1]]) {
    const arrow = turnArrow(tank, 0, to);
    assert.ok(arrow, `a destination at ${to.x},${to.z} out of view gets a turn arrow`);
    assert.equal(arrow.turn, turn, 'it sweeps the shorter way to the destination');
    for (const p of arrow.band) {
      const r = dist(p, tank);
      assert.ok(r >= TURN_RADII_M.inner - 1e-9 && r <= TURN_RADII_M.outer + 1e-9, 'its band rings the tank');
    }
    const want = bearing(tank, to);
    const startAt = bearing(tank, arrow.band[0]);
    const tipAt = bearing(tank, arrow.head[1]);
    assert.ok(Math.abs(wrap(tipAt - want)) < Math.abs(wrap(startAt - want)), 'its head ends nearer the destination than its band starts');
    assert.equal(arrow.head.length, 3, 'an arrowhead');
  }
  const behind = turnArrow(tank, Math.PI / 2, { x: -100, z: 0 });
  assert.ok(behind, 'the view\'s heading, not the hull\'s, decides');
}

// 2. The objective that matters now.
{
  const tank = { x: 0, z: 0 };
  assert.equal(objectiveFollow([], tank), null, 'the standard battle: none');
  const ball = objectiveFollow([{ kind: 'goal', x: 0, z: 300, side: 'enemy' }, { kind: 'ball', x: 10, z: 20, side: 'neutral' }], tank);
  assert.equal(ball?.kind, 'ball', 'Turbo Ball: the ball');
  const zones = [
    { kind: 'zone', x: 0, z: 50, side: 'own', label: 'A' },
    { kind: 'zone', x: 0, z: 400, side: 'enemy', label: 'B' },
    { kind: 'zone', x: 0, z: 200, side: 'neutral', label: 'C' },
  ];
  const open = objectiveFollow(zones, tank);
  assert.equal(open?.id, 'zone:C', 'the nearest zone not held');
  assert.equal(open?.radiusM, OBJECTIVE_ZONE_RADIUS_M, 'the trail stops at the zone\'s edge');
  const taken = objectiveFollow([...zones, { kind: 'zone', x: 0, z: 600, side: 'contested', label: 'D' }], tank);
  assert.equal(taken?.id, 'zone:D', 'a zone being fought for first');
  assert.equal(objectiveFollow([zones[0]], tank), null, 'every zone held: none');
  const sectors = [
    { kind: 'sector', x: 0, z: 0, side: 'own', status: 'taken', label: '1' },
    { kind: 'sector', x: 0, z: 300, side: 'enemy', status: 'active', label: '2' },
    { kind: 'sector', x: 0, z: 600, side: 'enemy', status: 'locked', label: '3' },
  ];
  assert.equal(objectiveFollow(sectors, tank)?.id, 'sector:2', 'Frontline: the sector being fought for');
  const flags = (own, enemy) => [
    { kind: 'flagBase', x: 0, z: -100, side: 'own', status: 'home' },
    { kind: 'flag', x: 5, z: 5, side: 'own', status: own },
    { kind: 'flag', x: 0, z: 400, side: 'enemy', status: enemy },
  ];
  assert.equal(objectiveFollow(flags('dropped', 'home'), tank)?.id, 'flag:own', 'CTF: recover the own flag where it lies');
  assert.equal(objectiveFollow(flags('home', 'dropped'), tank)?.id, 'flag:enemy', 'CTF: take the enemy flag');
  assert.equal(objectiveFollow(flags('home', 'carried'), tank)?.id, 'flag:home', 'CTF: bring it home');
}

// 3. Warn: in the UI.
{
  const view = { width: 1000, height: 600 };
  const insets = edgeInsets(view, 50);
  assert.deepEqual(insets, { top: 50, right: 50, left: 50, bottom: 120 }, 'the bottom keeps a fifth of the height for the HUD');
  const right = edgePointer({ x: 3000, y: 300, behind: false }, view, insets);
  assert.ok(near(right.x, 950) && near(right.y, 300) && near(right.angle, 0), 'a point far right: the right edge, pointing right');
  const low = edgePointer({ x: 520, y: 5000, behind: false }, view, insets);
  assert.ok(near(low.y, 480), 'a point far below: above the HUD band');
  const behindRight = edgePointer({ x: 200, y: 300, behind: true }, view, insets);
  assert.ok(near(behindRight.x, 950) && near(behindRight.angle, 0), 'behind the camera, mirrored left: the right edge');
  const behindLeft = edgePointer({ x: 800, y: 300, behind: true }, view, insets);
  assert.ok(near(behindLeft.x, 50) && near(behindLeft.angle, Math.PI), 'behind, mirrored right: the left edge');
  const straight = edgePointer({ x: 510, y: 300, behind: true }, view, insets);
  assert.ok(near(straight.y, 480) && near(straight.angle, Math.PI / 2), 'straight behind: the inset bottom, pointing down');
  assert.ok(insideInsets({ x: 500, y: 300, behind: false }, view, insets) && !insideInsets({ x: 500, y: 520, behind: false }, view, insets));
}
{
  const view = { width: 1280, height: 720 };
  // a projection that puts each warning where the test says: its x and y are the screen point, z < 0 means behind
  const project = (p) => ({ x: p.x, y: p.y, behind: p.z < 0 });
  const warn = (id, x, y, z, rank, distanceM, extra = {}) => ({ id, kind: 'tank', x, y, z, priority: POINTER_PRIORITY.threat, rank, distanceM, ...extra });
  const shown = planBubbles({ warns: [warn('seen', 640, 360, 1, 1, 100)], project, view, scoped: false, noCover: [] });
  assert.equal(shown.length, 0, 'a warning the camera shows gets no bubble');
  const left = planBubbles({ warns: [warn('flank', -500, 360, 1, 1, 100)], project, view, scoped: false, noCover: [] });
  assert.equal(left.length, 1);
  assert.ok(left[0].x < 100 && near(left[0].angle, Math.PI, 1e-6), 'a flank tank to the left: on the left rim, pointing left');
  // merging and order
  const many = planBubbles({
    warns: [warn('a', -500, 300, 1, 0, 40), warn('b', -500, 310, 1, 1, 400), { ...warn('m', 5000, 100, 1, 3, 600), kind: 'missile' }],
    project, view, scoped: false, noCover: [],
  });
  assert.equal(many.length, 2, 'two warnings on the same stretch of rim merge');
  assert.equal(many[0].id, 'm', 'the most urgent first (a missile over a tank)');
  assert.equal(many[1].id, 'b', 'a merged bubble shows its more urgent warning');
  assert.equal(many[1].count, 2, 'and how many it stands for');
  // the cap
  const ring = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return warn(`r${i}`, 640 + Math.cos(a) * 5000, 360 + Math.sin(a) * 5000, 1, 1, 100 + i);
  });
  assert.equal(planBubbles({ warns: ring, project, view, scoped: false, noCover: [] }).length, 4, 'at most 4 at once');
  assert.equal(bubbleCap({ width: 390, height: 844 }), 3, '3 on a phone');
  assert.equal(planBubbles({ warns: ring, project, view: { width: 390, height: 844 }, scoped: false, noCover: [] }).length, 3);
  // the HUD: a bubble slides along the rim off it, and keeps pointing at its warning
  const hud = { x0: 0, y0: 260, x1: 120, y1: 460 };
  const slid = planBubbles({ warns: [warn('flank', -500, 360, 1, 1, 100)], project, view, scoped: false, noCover: [hud] });
  assert.equal(slid.length, 1);
  const box = { x0: slid[0].x - 30, x1: slid[0].x + 30, y0: slid[0].y - 29, y1: slid[0].y + 45 };
  assert.ok(box.y1 < hud.y0 || box.y0 > hud.y1 || box.x0 > hud.x1, 'a bubble never lies on the HUD where the rim has room');
  assert.ok(Math.cos(slid[0].angle) < -0.9, 'it still points left, at the tank');
  // the sight: only threats
  const hint = { ...warn('hint', -500, 360, 1, 0, 100), priority: POINTER_PRIORITY.teaching };
  assert.equal(planBubbles({ warns: [hint], project, view, scoped: true, noCover: [] }).length, 0, 'scoped: a hint stands down');
  assert.equal(planBubbles({ warns: [hint], project, view, scoped: false, noCover: [] }).length, 1);
  assert.equal(planBubbles({ warns: [warn('t', -500, 360, 1, 1, 100)], project, view, scoped: true, noCover: [] }).length, 1, 'scoped: a threat shows');
  // determinism
  const again = planBubbles({ warns: [...ring].reverse(), project, view, scoped: false, noCover: [hud] });
  assert.deepEqual(again, planBubbles({ warns: ring, project, view, scoped: false, noCover: [hud] }), 'the same warnings plan the same bubbles in any order');
}

// 4. The warnings' sources.
{
  const player = { x: 0, y: 0, z: 0 };
  const tank = (id, x, z, gunYaw, extra = {}) => ({ id, x, y: 0, z, gunYaw, enemy: true, alive: true, spotted: true, ...extra });
  // a tank at +x 300 m whose gun yaw points at the player (toward -x: yaw -pi/2)
  const aimed = tank('aimed', 300, 0, -Math.PI / 2);
  const off = tank('off', 300, 0, -Math.PI / 2 + 0.2);
  const close = tank('close', 0, -CLOSE_M + 5, Math.PI);
  const list = tankWarnings(player, [aimed, off, close, tank('hidden', 300, 0, -Math.PI / 2, { spotted: false }),
    tank('dead', 300, 0, -Math.PI / 2, { alive: false }), tank('ally', 300, 0, -Math.PI / 2, { enemy: false })]);
  assert.deepEqual(list.map((w) => w.id).sort(), ['tank:aimed', 'tank:close'], 'a gun on the tank, or close; never unspotted, dead or friendly');
  assert.ok(list.find((w) => w.id === 'tank:aimed').rank > list.find((w) => w.id === 'tank:close').rank, 'a gun on it outranks a hull close by');
  const grazing = tank('graze', 300, GUN_ON_M - 0.5, -Math.PI / 2);
  assert.equal(tankWarnings(player, [grazing]).length, 1, `within ${GUN_ON_M} m of the gun's line counts`);
  const away = tank('away', 300, 0, Math.PI / 2);
  assert.equal(tankWarnings(player, [away]).length, 0, 'a gun laid away from the tank is no warning');
}
{
  const player = { x: 0, y: 2, z: 0 };
  const strike = { x: 10, z: 0, side: 'enemy', status: 'strafe', heading: 0, countdownS: 5, halfLengthM: 60 };
  const warns = strikeWarnings(player, [strike, { ...strike, side: 'own' }, { ...strike, countdownS: 0 }, { ...strike, x: 900 },
    { ...strike, status: 'recon' }]);
  assert.equal(warns.length, 1, 'an enemy run still to land, the tank in its reach; not an own, landed, far or recon one');
  assert.ok(warns[0].z < -100 && warns[0].y > player.y + 50, 'a run along a heading points at the jet\'s run-in, up and back');
  assert.ok(near(warns[0].countdownLeft, 5 / STRIKE_RING_S), 'its ring is the warning\'s time left');
  const shells = strikeWarnings(player, [{ ...strike, status: 'artillery', radiusM: 40 }]);
  assert.ok(near(shells[0].x, 10) && near(shells[0].z, 0), 'shells point at their mark');
}
{
  const player = { x: 0, y: 0, z: 0 };
  const missile = (id, x, z, vx, vz, enemy = true) => ({ id, x, y: 3, z, vx, vz, enemy });
  const warns = missileWarnings(player, [missile('in', 400, 0, -200, 0), missile('past', 400, 0, 200, 0), missile('wide', 400, 0, -200, 100),
    missile('own', 400, 0, -200, 0, false), missile('far', 5000, 0, -200, 0)]);
  assert.deepEqual(warns.map((w) => w.id), ['missile:in'], 'an enemy missile coming at the tank; not one flying away, wide, own or far');
  assert.ok(warns[0].rank > 2, 'a missile is the most urgent warning');
}

// 5. The layer: screen space only, never the pointer.
{
  const layer = read('src/ui/pointers/pointerLayer.ts');
  assert.doesNotMatch(layer, /from 'three'/, 'the layer adds nothing to the 3D scene');
  const css = read('src/ui/pointers/pointers.css');
  assert.match(css, /\.cot-ptr\{[^}]*pointer-events:none/, 'neither layer takes the pointer');
  assert.match(css, /prefers-reduced-motion/, 'reduced motion stills the pulse and the trail\'s flow');
}

console.log('pointerPlan.selftest: follow on the ground, warn in the UI; one follow, ranked and merged bubbles, the sight\'s rung, the sources');
