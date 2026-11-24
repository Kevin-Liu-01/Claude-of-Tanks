#!/usr/bin/env node
// pointerPlan.selftest.mjs — the battle's one pointer primitive (guidance-pointers-275). Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-22: "for stuff for you to follow, its on ground. for the warnings / indicators thats in the ui". Holds:
//  1. follow (the ground): its trail lies on the way, steps evenly, never inside the destination, and goes once the tank is
//     at its edge; the turn arrow is laid ahead of the tank in the camera's frame, bends the shorter way, and its head
//     points along the destination's bearing (its fit to the screen, turret yaw swept: pointerFollowView.selftest.mjs);
//  2. (276) no mode objective is followed on the ground: the ball, a carried flag and the juggernaut are rim indicators
//     instead, in their side's colour, shown only while the camera does not show them; an enemy drone near the tank is a
//     warning;
//  3. warn (the UI): the rim's geometry (the inset rectangle, the HUD band, behind the camera); a warning the camera
//     shows gets no bubble; the most urgent come first; neighbours on the rim merge (a warning never swallows an
//     indicator); the cap is 4, 3 on a phone; a bubble slides along the rim off the HUD and keeps pointing at its warning;
//     the sight lets only threats through;
//  4. the warnings' sources: a spotted enemy with its gun on the tank or close (never an unspotted, dead or friendly one);
//     an enemy air run the tank stands in, pointing at the aircraft flying it where it is now (its bubble moves round the
//     rim as the aircraft flies), its ring the warning's time left; an enemy missile coming at the tank;
//  5. the plan is deterministic, and the layer draws in screen space only and never takes the pointer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOSE_M, DRONE_REACH_M, GUN_ON_M, STRIKE_RING_S, TRAIL_COUNT, TRAIL_FIRST_M, TRAIL_HIDE_WITHIN_M, TRAIL_STEP_M,
  TURN_MIN_SWEEP_DEG, bearing, bubbleCap, droneWarnings, edgeInsets, edgePointer, insideInsets, missileWarnings,
  objectiveIndicators, planBubbles, strikeWarnings, tankWarnings, trailChevrons, turnArrow,
} from './pointerPlan.ts';
import { NOTICE_PRIORITY } from '../battleNotices.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centroid = (outline) => ({ x: outline.reduce((s, p) => s + p.x, 0) / outline.length, z: outline.reduce((s, p) => s + p.z, 0) / outline.length });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 1. Follow: on the ground.
{
  const from = { x: 0, z: 0 }, to = { x: 0, z: 200 };
  const trail = trailChevrons(from, to, 6);
  assert.equal(trail.length, TRAIL_COUNT, 'a far destination gets the whole trail');
  trail.forEach((chevron, i) => {
    const c = centroid(chevron.outline);
    assert.equal(chevron.index, i);
    assert.equal(chevron.alongM, TRAIL_FIRST_M + i * TRAIL_STEP_M, 'it says how far along the way it lies');
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
  for (const [to, turn] of [[{ x: 100, z: -20 }, 1], [{ x: -100, z: -20 }, -1], [{ x: 30, z: -100 }, 1], [{ x: 0, z: -100 }, 1]]) {
    const arrow = turnArrow(tank, 0, to, 4.5, 10);
    assert.equal(arrow.turn, turn, `a destination at ${to.x},${to.z}: it bends the shorter way`);
    for (const p of [...arrow.band, ...arrow.head]) assert.ok(p.z > 10 - 4.5 * 0.4, 'it lies ahead of the tank in the camera\'s view');
    const tip = arrow.head[1], base = { x: (arrow.head[0].x + arrow.head[2].x) / 2, z: (arrow.head[0].z + arrow.head[2].z) / 2 };
    const want = Math.max(Math.abs(wrap(bearing(tank, to))), (TURN_MIN_SWEEP_DEG * Math.PI) / 180);
    const pointing = wrap(bearing(base, tip));
    assert.ok(Math.abs(Math.abs(pointing) - Math.min(Math.PI, want)) < 0.35, 'its head points along the destination\'s bearing');
    assert.ok(Math.sign(pointing || 1) === turn || Math.abs(pointing) > Math.PI - 0.35, 'and turns the way it bends');
    assert.equal(arrow.head.length, 3, 'an arrowhead');
  }
  const slight = turnArrow(tank, 0, { x: 10, z: 100 }, 4.5, 10);
  const pointing = Math.abs(wrap(bearing({ x: (slight.head[0].x + slight.head[2].x) / 2, z: (slight.head[0].z + slight.head[2].z) / 2 }, slight.head[1])));
  assert.ok(pointing > (TURN_MIN_SWEEP_DEG - 12) * Math.PI / 180, 'a destination just off the view still bends far enough to read as a turn');
  const big = turnArrow(tank, 0, { x: 100, z: 0 }, 6, 10), small = turnArrow(tank, 0, { x: 100, z: 0 }, 2.2, 10);
  const span = (a) => Math.max(...a.band.map((p) => p.x)) - Math.min(...a.band.map((p) => p.x));
  assert.ok(span(small) < span(big) / 2, 'a smaller radius is a smaller arrow (the plan fits it to the view)');
  const turned = turnArrow(tank, Math.PI / 2, { x: 0, z: 100 }, 4.5, 10);
  assert.ok(turned.band.every((p) => p.x > 10 - 4.5 * 0.4), 'the camera\'s heading, not the hull\'s, decides where it lies');
}

// 2. (276) The moving objectives' indicators and the drones.
{
  const player = { x: 0, y: 0, z: 0, id: 'me' };
  const ground = () => 1;
  const markers = [
    { kind: 'goal', x: 0, z: 300, side: 'enemy' }, { kind: 'ball', x: 10, z: -80, side: 'neutral' },
    { kind: 'zone', x: 0, z: 200, side: 'neutral', label: 'C' },
    { kind: 'flag', x: 50, z: 50, side: 'own', status: 'carried' }, { kind: 'flag', x: 0, z: 400, side: 'enemy', status: 'home' },
  ];
  const boss = { id: 'boss', x: -200, y: 3, z: 0, enemy: true, alive: true, spotted: true };
  const list = objectiveIndicators(player, markers, boss, ground);
  assert.deepEqual(list.map((w) => `${w.kind}:${w.side}`), ['ball:neutral', 'flag:own', 'boss:enemy'],
    'the ball, a carried flag in its colour, the juggernaut; never a zone, a goal or a flag at home');
  assert.ok(list.every((w) => w.priority === NOTICE_PRIORITY.ambient), 'an indicator is ambient: the sight stands it down, a warning outranks it');
  assert.ok(near(list[0].y, 1 + 2.2), 'the ball\'s points at its centre');
  assert.equal(objectiveIndicators(player, markers, { ...boss, spotted: false }, ground).length, 2, 'an unspotted juggernaut: none');
  assert.equal(objectiveIndicators(player, markers, { ...boss, alive: false }, ground).length, 2, 'a destroyed one: none');
  assert.equal(objectiveIndicators(player, markers, { ...boss, id: 'me' }, ground).length, 2, 'the viewer\'s own hull: none');
  assert.equal(objectiveIndicators(player, [], null, ground).length, 0, 'the standard battle: none');

  // the receipt: the ball in view -> no indicator; behind or aside -> exactly one, pointing at it
  const view = { width: 1280, height: 720 };
  // a camera at the origin looking +z with a 90 degree horizontal field: x/z on the screen, z < 0 behind
  const project = (p) => ({ x: 640 + (p.x / Math.abs(p.z || 1e-6)) * 640, y: 360 - ((p.y - 1) / Math.abs(p.z || 1e-6)) * 640, behind: p.z < 0 });
  const ballAt = (x, z) => planBubbles({ warns: objectiveIndicators(player, [{ kind: 'ball', x, z, side: 'neutral' }], null, ground), project, view,
    scoped: false, noCover: [] });
  assert.equal(ballAt(10, 80).length, 0, 'the ball on the screen: no indicator');
  const behind = ballAt(0, -60), aside = ballAt(-200, 40);
  assert.equal(behind.length, 1, 'the ball behind: one indicator');
  assert.equal(aside.length, 1, 'the ball aside: one indicator');
  assert.ok(behind[0].kind === 'ball' && behind[0].side === 'neutral', 'the ball\'s glyph in the neutral colour');
  assert.ok(Math.sin(behind[0].angle) > 0.99, 'behind: at the bottom, pointing down');
  assert.ok(aside[0].x < 100 && Math.cos(aside[0].angle) < -0.99, 'aside to the left: on the left rim, pointing left');
  // negative control: the boundary is the screen's, not a distance; a ball just inside the rim gets none, just past it one
  assert.equal(ballAt(-40 * 0.9, 40).length, 0, 'control: inside the rim, none');
  assert.equal(ballAt(-40 * 1.2, 40).length, 1, 'control: past the rim, one');
  // a warning never swallows an indicator where they meet on the rim
  const tank = { id: 'tank:t', kind: 'tank', x: -200, y: 1, z: 40, priority: NOTICE_PRIORITY.threat, rank: 1, distanceM: 200 };
  const both = planBubbles({ warns: [tank, ...objectiveIndicators(player, [{ kind: 'ball', x: -200, z: 40, side: 'neutral' }], null, ground)],
    project, view, scoped: false, noCover: [] });
  assert.deepEqual(both.map((b) => `${b.kind}:${b.count}`).sort(), ['ball:1', 'tank:1'], 'the tank and the ball keep a bubble each');
  assert.equal(planBubbles({ warns: objectiveIndicators(player, [{ kind: 'ball', x: 0, z: -60, side: 'neutral' }], null, ground), project, view,
    scoped: true, noCover: [] }).length, 0, 'the sight up: no indicator');
}
{
  const player = { x: 0, y: 0, z: 0 };
  const drone = (id, x, z, extra = {}) => ({ id, x, y: 60, z, enemy: true, spotted: true, ...extra });
  const warns = droneWarnings(player, [drone('near', 100, 0), drone('far', DRONE_REACH_M + 50, 0), drone('own', 50, 0, { enemy: false }),
    drone('hidden', 50, 0, { spotted: false })]);
  assert.deepEqual(warns.map((w) => w.id), ['drone:near'], 'an enemy drone near the tank, its carrier spotted; not a far, own or hidden one');
  assert.ok(warns[0].kind === 'drone' && near(warns[0].y, 60) && warns[0].priority === NOTICE_PRIORITY.threat, 'a threat, pointing at it in the air');
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
  const warn = (id, x, y, z, rank, distanceM, extra = {}) => ({ id, kind: 'tank', x, y, z, priority: NOTICE_PRIORITY.threat, rank, distanceM, ...extra });
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
  const hint = { ...warn('hint', -500, 360, 1, 0, 100), priority: NOTICE_PRIORITY.teaching };
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
  const strike = { x: 10, z: 0, side: 'enemy', status: 'strafe', countdownS: 5, halfLengthM: 60 };
  const jet = (x, z, extra = {}) => ({ x, y: 160, z, side: 'enemy', status: 'strafe', toX: 10, toZ: 0, ...extra });
  const warns = strikeWarnings(player, [strike, { ...strike, side: 'own' }, { ...strike, countdownS: 0 }, { ...strike, x: 900 },
    { ...strike, status: 'recon' }], [jet(-300, -400)]);
  assert.equal(warns.length, 1, 'an enemy run still to land, the tank in its reach; not an own, landed, far or recon one');
  assert.ok(near(warns[0].x, -300) && near(warns[0].y, 160) && near(warns[0].z, -400), 'a run points at its aircraft where it is now');
  assert.ok(near(warns[0].countdownLeft, 5 / STRIKE_RING_S), 'its ring is the warning\'s time left');
  const others = [jet(500, 500, { status: 'bomb' }), jet(500, 500, { side: 'own' }), jet(500, 500, { toX: 99 })];
  const unmatched = strikeWarnings(player, [strike], others);
  assert.ok(near(unmatched[0].x, 10) && near(unmatched[0].z, 0), 'another call\'s aircraft is not this run\'s: no aircraft, the mark');
  const shells = strikeWarnings(player, [{ ...strike, status: 'artillery', radiusM: 40 }]);
  assert.ok(near(shells[0].x, 10) && near(shells[0].z, 0), 'shells point at their mark');
  // the receipt: as the aircraft flies, its rim bubble moves with it (a jet swinging from behind-left to the right)
  const view = { width: 1280, height: 720 };
  const project = (p) => ({ x: 640 + p.x, y: 360 - (p.y - player.y), behind: p.z < 0 });
  const bubbleAt = (x, z) => planBubbles({ warns: strikeWarnings(player, [strike], [jet(x, z)]), project, view, scoped: false, noCover: [] });
  const before = bubbleAt(-900, 200), after = bubbleAt(900, 200);
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.ok(before[0].x < 100 && after[0].x > view.width - 100, 'a moving aircraft moves its rim bubble: left rim, then right rim');
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
  assert.match(layer, /paint\.setAttribute\('mask', `url\(#\$\{HULL_MASK_ID\}\)`\)/, 'the ground paint runs under the player\'s hull, never over it');
  assert.match(layer, /planFollow\(\{ \.\.\.frame, view: \{ width: w, height: h \} \}\)/, 'the layer draws the plan\'s pieces, fitted to the screen');
  const css = read('src/ui/pointers/pointers.css');
  assert.match(css, /\.cot-ptr\{[^}]*pointer-events:none/, 'neither layer takes the pointer');
  assert.match(css, /prefers-reduced-motion/, 'reduced motion stills the pulse and the trail\'s flow');
}

console.log('pointerPlan.selftest: follow on the ground, warn and indicate in the UI; ranked and merged bubbles, the sight\'s rung, the sources');
