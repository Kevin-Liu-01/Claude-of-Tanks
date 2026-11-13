#!/usr/bin/env node
// tutorialGuide.selftest.mjs — the tutorial's guidance over the battle (273). Copyright © 2026 Kevin B. Liu.
//
// Holds:
//  1. the geometry (tutorialGuideMath.ts): the ring closes at its radius; the path's chevrons stand on the way, step
//     evenly, never inside the ring, and go once the player is close; an actor's own frame turns with its yaw; a box
//     behind the camera is none; the edge pointer stands on the inset rectangle toward a point in front, above the HUD's
//     band at the bottom, on the side to turn to for a point behind the camera, and down for one straight behind;
//  2. the step data: a reach step has a marker; an actor's bracket, a hit, spot or destroy step names the actor it waits
//     for; every guide label and the distance line are in en-US and zh-CN;
//  3. the 272.1 rules for the guide: neither of its layers takes the pointer (it can never swallow a press or leave a
//     live control under an inert dim), it hides with the card (a pause, a covering surface) and goes with its run (the
//     screen check's close ends it with the card), and it draws in screen space only (no Three.js, nothing in the scene).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATH_COUNT, PATH_FIRST_M, PATH_HIDE_WITHIN_M, PATH_STEP_M, actorCorners, actorPoint, edgeInsets, edgePointer, groundDistance,
  insideInsets, onScreen, pathChevrons, ringPoints, screenBox,
} from './tutorialGuideMath.ts';
import { TUTORIAL_STEPS } from './tutorialSteps.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1. The geometry.
{
  const ring = ringPoints({ x: 10, z: -4 }, 6, 24);
  assert.equal(ring.length, 25, 'the ring samples its segments and repeats its first point');
  assert.ok(near(ring[0].x, ring[24].x) && near(ring[0].z, ring[24].z), 'the ring closes');
  for (const p of ring) assert.ok(near(groundDistance(p, { x: 10, z: -4 }), 6, 1e-9), 'every ring point at its radius');
}
{
  const from = { x: 0, z: 0 }, to = { x: 0, z: 100 };
  const way = pathChevrons(from, to, 6);
  assert.equal(way.length, PATH_COUNT, 'a far marker gets every chevron');
  way.forEach((c, i) => {
    assert.ok(near(c.at.x, 0) && near(c.at.z, PATH_FIRST_M + i * PATH_STEP_M), `chevron ${i} on the way, evenly`);
    assert.ok(near(c.dir.x, 0) && near(c.dir.z, 1), 'it points at the marker');
  });
  const close = pathChevrons(from, { x: 0, z: 6 + PATH_HIDE_WITHIN_M }, 6);
  assert.equal(close.length, 0, 'none once the player is within reach of the ring');
  const mid = pathChevrons(from, { x: 30, z: 0 }, 6);
  for (const c of mid) assert.ok(groundDistance(c.at, { x: 30, z: 0 }) > 6, 'no chevron inside the ring');
}
{
  const pose = { x: 5, y: 2, z: 7, yaw: 0 };
  const ahead = actorPoint(pose, 3, 1, 0);
  assert.ok(near(ahead.x, 5) && near(ahead.y, 3) && near(ahead.z, 10), 'yaw 0: along is +z');
  const right = actorPoint(pose, 0, 0, 2);
  assert.ok(near(right.x, 7) && near(right.z, 7), 'yaw 0: across is +x (the hull\'s left, as the battle camera shows it)');
  const turned = actorPoint({ ...pose, yaw: Math.PI / 2 }, 3, 0, 0);
  assert.ok(near(turned.x, 8, 1e-9) && near(turned.z, 7, 1e-9), 'a yaw of 90° turns along toward +x');
  assert.equal(actorCorners(pose, 4, 2, 3).length, 8, 'a box has eight corners');
  assert.equal(screenBox([{ x: 1, y: 1, behind: false }, { x: 5, y: 9, behind: true }]), null, 'a box partly behind the camera is none');
  assert.deepEqual(screenBox([{ x: 1, y: 8, behind: false }, { x: 5, y: 2, behind: false }]), { left: 1, top: 2, right: 5, bottom: 8 });
}
{
  const view = { width: 1000, height: 600 };
  const insets = edgeInsets(view, 50);
  assert.deepEqual(insets, { top: 50, right: 50, left: 50, bottom: 120 }, 'the bottom keeps a fifth of the height for the HUD');
  const rect = { left: 50, right: 950, top: 50, bottom: 480 };
  const onRect = (p) => [p.x - rect.left, p.x - rect.right, p.y - rect.top, p.y - rect.bottom].some((d) => Math.abs(d) < 1e-6)
    && p.x >= rect.left - 1e-6 && p.x <= rect.right + 1e-6 && p.y >= rect.top - 1e-6 && p.y <= rect.bottom + 1e-6;
  const right = edgePointer({ x: 3000, y: 300, behind: false }, view, insets);
  assert.ok(near(right.x, 950) && near(right.y, 300) && near(right.angle, 0), 'a point far right: the right edge, pointing right');
  const corner = edgePointer({ x: -400, y: -900, behind: false }, view, insets);
  assert.ok(onRect(corner) && corner.x < 500 && corner.y < 300, 'a point up and left: on the rectangle, up and left');
  const low = edgePointer({ x: 520, y: 5000, behind: false }, view, insets);
  assert.ok(near(low.y, 480) && low.y < 600 - 120 + 1e-6, 'a point far below: the pointer stays above the HUD band');
  const behindRight = edgePointer({ x: 200, y: 300, behind: true }, view, insets);
  assert.ok(near(behindRight.x, 950) && near(behindRight.angle, 0), 'behind the camera, mirrored left: turn right (the right edge)');
  const behindLeft = edgePointer({ x: 800, y: 300, behind: true }, view, insets);
  assert.ok(near(behindLeft.x, 50) && near(behindLeft.angle, Math.PI), 'behind, mirrored right: turn left (the left edge)');
  const straightBehind = edgePointer({ x: 510, y: 300, behind: true }, view, insets);
  assert.ok(near(straightBehind.y, 480) && near(straightBehind.angle, Math.PI / 2), 'straight behind: the inset bottom, pointing down');
  assert.ok(insideInsets({ x: 500, y: 300, behind: false }, view, insets) && !insideInsets({ x: 500, y: 520, behind: false }, view, insets),
    'a subject in the HUD band counts as off screen');
  assert.ok(onScreen({ x: 500, y: 300, behind: false }, view, 50) && !onScreen({ x: 20, y: 300, behind: false }, view, 50));
  assert.ok(!onScreen({ x: 500, y: 300, behind: true }, view), 'behind the camera is never on screen');
}

// 2. The step data.
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
for (const catalog of [en, zh]) assert.match(catalog['tutorial.guide.distance'] ?? '', /\{m\}/, 'the distance line names {m}');
for (const step of TUTORIAL_STEPS) {
  const advance = step.advance;
  if (advance.on === 'reach') assert.ok(step.guide?.marker, `${step.id}: a reach step has a marker`);
  if (['spot', 'destroy'].includes(advance.on)) assert.ok(advance.actor, `${step.id}: names its actor`);
  for (const label of [step.guide?.marker?.label, step.guide?.actor?.label].filter(Boolean)) {
    assert.ok(en[label] && zh[label], `${step.id}: guide label ${label} in en-US and zh-CN`);
  }
  if (step.guide?.aimAt) assert.ok(step.guide.actor?.id === step.guide.aimAt.id, `${step.id}: the aim ghost's actor is the bracketed one`);
}

// 3. The 272.1 rules for the guide.
const css = read('src/ui/tutorial/tutorial.css');
assert.match(css, /\.cot-tut-guide\{[^}]*pointer-events:none/, 'the guide layers never take the pointer');
assert.doesNotMatch(css.slice(css.indexOf('/* the guide')), /pointer-events:\s*auto/, 'no guide piece takes it back');
const guide = read('src/ui/tutorial/tutorialGuide.ts');
assert.doesNotMatch(guide, /from 'three'|THREE\./, 'the guide draws in screen space: no Three.js, nothing added to the scene');
assert.match(guide, /root\.setAttribute\('aria-hidden', 'true'\)/, 'its layers are hidden from assistive tech (the card speaks)');
const runner = read('src/ui/tutorial/tutorialRunner.ts');
assert.match(runner, /overlay\.destroy\(\);\s*guide\?\.destroy\(\);/, 'the guide goes with its run, wherever the run ends (done, skip, screen gone)');
const hides = runner.match(/overlay\.setHidden\(hiddenByPause \|\| covered\);\s*guide\?\.setHidden\(hiddenByPause \|\| covered\);/g) ?? [];
assert.equal(hides.length, 2, 'the guide hides with the card on a pause and under a covering surface');

console.log('tutorialGuide.selftest: PASS (geometry, step data, inert and lifetime rules)');
