#!/usr/bin/env node
// pointerFollowView.selftest.mjs — the follow pointer against the camera (guidance-pointers-276). Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-23: "remove the arrows on ground for obvious stuff. like capturing bases. also they get clipped off if
// you aim to ur side or smthg". The mechanism was: the turn arrow was a fixed 7 m ring round the tank swept in world
// degrees and the trail ran from the tank toward the destination whatever the view, so with the turret aimed aside both
// were laid where the chase camera's narrow side field (about 15 degrees each way on a portrait phone) could not hold them,
// and the screen's edge cut them. Holds:
//  1. the sweep: the chase camera's own pose (engine/chaseFraming.ts) round a tank, the turret at every 5 degrees, on a
//     desktop window and a phone held both ways, for a waypoint ahead, one behind and aside, and a thing to look at: no
//     piece the plan draws is cut by the screen's edge or the camera's plane; while the destination is off the screen the
//     turn arrow shows, turns the shorter way, and its head stands clear of the HUD and the hull; while it is on the
//     screen and far, the trail shows; the negative control: the same checker finds the cut pieces the old geometry laid
//     (the trail toward a destination aside, the old 7 m ring on a phone);
//  2. the sources: only the tutorial posts a follow pointer (pointerBoard.ts setGuideFollow is called from
//     src/ui/tutorial/ alone; the HUD's follow is the board's, and the kinds are the tutorial's two); the negative control:
//     the scan flags a call from anywhere else.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  CHASE_BASE_DISTANCE_M, CHASE_BASE_PIVOT_M, CHASE_CAMERA_DEFAULTS, CHASE_PITCH_RAD, NOMINAL_CHASE_TANK,
} from '../../engine/chaseFraming.ts';
import { bearing, onScreen, planFollow, trailChevrons, turnArrow } from './pointerPlan.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 1. The sweep.
const VIEWS = { desktop: { width: 1280, height: 720 }, phone: { width: 390, height: 844 }, phoneWide: { width: 844, height: 390 } };
const tank = { x: 0, z: 0 };
const flat = () => 0;
/** The chase camera with the turret at `yaw` (the hull faces +z): CHASE_BASE_DISTANCE_M back, CHASE_PITCH_RAD down, the
 *  default lens, looking at its pivot over the turret roof. */
function chase(yaw, view) {
  const camera = new PerspectiveCamera(CHASE_CAMERA_DEFAULTS.cameraFov, view.width / view.height, 0.1, 5000);
  const dir = new Vector3(Math.sin(yaw) * Math.cos(CHASE_PITCH_RAD), Math.sin(CHASE_PITCH_RAD), Math.cos(yaw) * Math.cos(CHASE_PITCH_RAD));
  const pivot = new Vector3(tank.x, NOMINAL_CHASE_TANK.heightM + CHASE_BASE_PIVOT_M, tank.z);
  camera.position.copy(pivot).addScaledVector(dir, -CHASE_BASE_DISTANCE_M);
  camera.lookAt(pivot);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const v = new Vector3();
  return (p) => {
    v.set(p.x, p.y, p.z).project(camera);
    return { x: ((v.x + 1) / 2) * view.width, y: ((1 - v.y) / 2) * view.height, behind: v.z > 1 };
  };
}
/** The hull's box on the screen, as battlePointers.ts hullBox projects it. */
function hullBox(project) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const along of [-3.6, 3.6]) for (const across of [-1.85, 1.85]) for (const up of [0, NOMINAL_CHASE_TANK.heightM]) {
    const at = project({ x: across, y: up, z: along });
    x0 = Math.min(x0, at.x); y0 = Math.min(y0, at.y); x1 = Math.max(x1, at.x); y1 = Math.max(y1, at.y);
  }
  return { x0, y0, x1, y1 };
}
/** The pieces cut by the screen's edge or the camera's plane: each a list of screen points. */
const cut = (pieces, view) => pieces.filter((points) => points.some((p) => !onScreen(p, view)));
const inBox = (p, b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

const destinations = [
  { id: 'ahead', kind: 'waypoint', x: 0, z: 60, radiusM: 8, trail: true },
  { id: 'behind-aside', kind: 'waypoint', x: 40, z: -30, radiusM: 6, trail: true },
  { id: 'look', kind: 'look', x: -50, z: 20, radiusM: 0, trail: false },
];
let frames = 0, turns = 0, trails = 0;
for (const [name, view] of Object.entries(VIEWS)) {
  // the HUD's bottom band (the controls, the rack) and the map's corner, which a head never covers
  const noCover = [{ x0: 0, y0: view.height * 0.84, x1: view.width, y1: view.height }, { x0: view.width - 160, y0: 0, x1: view.width, y1: 160 }];
  for (const follow of destinations) {
    for (let deg = 0; deg < 360; deg += 5) {
      const viewYaw = (deg * Math.PI) / 180;
      const project = chase(viewYaw, view);
      const hull = hullBox(project);
      const plan = planFollow({ follow, player: tank, viewYaw, scoped: false, project, view, groundY: flat, noCover, hull });
      const where = `${name} ${follow.id} turret ${deg}°`;
      frames++;
      const pieces = [...plan.chevrons.map((c) => c.points), ...(plan.turn ? [plan.turn.band, plan.turn.head] : [])];
      assert.deepEqual(cut(pieces, view), [], `${where}: no piece is cut by the screen's edge or the camera's plane`);
      if (!plan.inView) {
        assert.ok(plan.turn, `${where}: the destination is off the screen, so the turn arrow shows`);
        assert.equal(plan.chevrons.length, 0, `${where}: no trail while it is off the screen`);
        const off = wrap(bearing(tank, follow) - viewYaw);
        assert.equal(plan.turn.turn, off >= 0 ? 1 : -1, `${where}: it turns the shorter way`);
        for (const p of plan.turn.head) {
          assert.ok(![...noCover, hull].some((b) => inBox(p, b)), `${where}: its head stands clear of the HUD and the hull`);
        }
        turns++;
      } else {
        assert.equal(plan.turn, null, `${where}: no turn arrow while the destination is on the screen`);
        if (follow.trail && deg === 0 && follow.id === 'ahead') assert.ok(plan.chevrons.length >= 3, `${where}: the trail shows`);
        if (plan.chevrons.length) trails++;
      }
    }
  }
}
assert.ok(turns > 100 && trails > 10, `the sweep saw both pieces (${turns} turn arrows, ${trails} trails)`);
// the sight stands it down
{
  const view = VIEWS.desktop, project = chase(0, view);
  const plan = planFollow({ follow: destinations[0], player: tank, viewYaw: 0, scoped: true, project, view, groundY: flat, noCover: [], hull: null });
  assert.equal(plan.chevrons.length + (plan.turn ? 1 : 0), 0, 'the sight up: no follow pointer');
}
// the negative control: the same checker sees the cut pieces the old geometry laid
{
  const view = VIEWS.desktop, viewYaw = Math.PI / 2, project = chase(viewYaw, view);
  const lifted = (outline) => outline.map((p) => project({ x: p.x, y: 0.12, z: p.z }));
  const raw = trailChevrons(tank, destinations[0], destinations[0].radiusM).map((c) => lifted(c.outline));
  assert.ok(cut(raw, view).length >= 3, 'control: the whole trail toward a destination aside is cut, so the checker can see it');
  const phone = VIEWS.phone, phoneProject = chase(viewYaw, phone);
  const ring = [];
  for (let i = 0; i <= 14; i++) {
    const a = viewYaw - (20 + (130 * i) / 14) * (Math.PI / 180);
    ring.push(phoneProject({ x: Math.sin(a) * 7, y: 0.12, z: Math.cos(a) * 7 }));
  }
  assert.equal(cut([ring], phone).length, 1, 'control: the old 7 m ring round the tank is cut on a phone with the turret aside');
  const big = turnArrow(tank, viewYaw, destinations[0], 24, 10);
  assert.ok(cut([big.band, big.head].map((piece) => piece.map((p) => phoneProject({ x: p.x, y: 0.12, z: p.z }))), phone).length >= 1,
    'control: an arrow too large for the view is cut, so the plan must size it down');
}

// 2. The sources: the tutorial's alone.
function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}
/** The files outside the tutorial that hand the board a follow pointer. */
const strayPosters = (files) => files.filter(([path, text]) => /\bsetGuideFollow\(/.test(text)
  && !path.startsWith('src/ui/tutorial/') && path !== 'src/ui/pointers/pointerBoard.ts').map(([path]) => path);
const sources = walk('src').map((path) => [relative(ROOT, join(ROOT, path)), read(path)]);
assert.deepEqual(strayPosters(sources), [], 'only the tutorial posts a follow pointer');
assert.ok(sources.some(([path, text]) => path === 'src/ui/tutorial/tutorialGuide.ts' && /\bsetGuideFollow\(/.test(text)), 'the tutorial does');
assert.deepEqual(strayPosters([['src/ui/hud.ts', "setGuideFollow({ id: 'zone', kind: 'waypoint' })"]]), ['src/ui/hud.ts'],
  'control: a post from anywhere else is flagged');
{
  const plan = read('src/ui/pointers/pointerPlan.ts');
  assert.match(plan, /type FollowKind = 'waypoint' \| 'look';/, 'the follow kinds are the tutorial\'s two');
  assert.doesNotMatch(plan, /objectiveFollow|pickFollow/, 'no mode objective, no ball, no choice among sources');
  const hud = read('src/ui/pointers/battlePointers.ts');
  assert.match(hud, /const follow = guideFollow\(\);/, 'the HUD\'s follow pointer is the board\'s');
}

console.log(`pointerFollowView.selftest: ${frames} frames on 3 screens, no follow piece cut; the turn arrow off the screen, the trail on it; the tutorial alone posts one`);
