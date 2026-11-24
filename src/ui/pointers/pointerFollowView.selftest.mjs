#!/usr/bin/env node
// pointerFollowView.selftest.mjs — the follow pointer against the camera (guidance-pointers-276). Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-23: "remove the arrows on ground for obvious stuff. like capturing bases. also they get clipped off if
// you aim to ur side or smthg". The mechanism was: the turn arrow was a fixed 7 m ring round the tank swept in world
// degrees and the trail ran from the tank toward the destination whatever the view, so with the turret aimed aside both
// were laid where the chase camera's narrow side field (about 15 degrees each way on a portrait phone) could not hold them,
// and the screen's edge cut them. Holds:
//  1. the sweep: the battle's own camera (engine/chaseFraming.ts solveChaseFraming over each supported layout's recorded
//     HUD: its distance, pivot and lens shift) round a nominal, a tall and a long hull, the turret at every 5 degrees, for
//     a waypoint ahead, one behind and aside, a thing to look at and the battle's own case (a marker 90 m aside): no piece
//     is cut by the screen's edge or the camera's plane or lies under the HUD; while the destination is off the screen the
//     turn arrow shows (behind the hull where a portrait phone's tall hull fills its width), turns the shorter way (either
//     way from TURN_EITHER_DEG round), and its band and its padded head stand clear
//     of the HUD and the hull, often beside the hull; while it is on the screen and far, the trail shows. The negative controls: the same checks find
//     what the old geometry and the battle's stills showed (the trail toward a destination aside cut, the old 7 m ring cut
//     on a phone, the old rule's arrow ahead of a tall hull a sliver on a desktop beside the plan's, a head in a gap
//     between buttons passing a test of its corners alone);
//  2. the sources: only the tutorial posts a follow pointer (pointerBoard.ts setGuideFollow is called from
//     src/ui/tutorial/ alone; the HUD's follow is the board's, and the kinds are the tutorial's two); the negative control:
//     the scan flags a call from anywhere else.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { CHASE_PITCH_RAD, chaseTankFromDims, NOMINAL_CHASE_TANK, solveChaseFraming } from '../../engine/chaseFraming.ts';
import {
  bearing, onScreen, planFollow, trailChevrons, TURN_EITHER_DEG, TURN_HEAD_PAD_PX, TURN_PLACES, TURN_RADII_M, turnArrow,
} from './pointerPlan.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 1. The sweep: the battle's own camera. Each supported layout's recorded HUD (tools/fixtures/hud-chase-bands.json, the
// bands chaseFraming.selftest.mjs frames over) frames the chase as the rig does (solveChaseFraming: its distance, its
// pivot, its lens shift), and its boxes are what the arrow keeps off (the controls, the map, the instruments, the head band).
const RECORDED = JSON.parse(read('tools/fixtures/hud-chase-bands.json'));
// The live phone as the battle showed it on 2026-11-24 (measured in a 390x844 touch battle through the pointer layer's own
// noCover): its right column runs 228 to 520 px, where the recorded fixture holds one button at 468 (the fixture's source
// page lags the live HUD: hud-bands-live-276). A U-turn there fits only behind the hull, centred and small.
RECORDED.sizes['390x844-live'] = { idle: { width: 390, height: 844, touch: true, ceiling: 66, floor: [
  [324, 44, 390, 92], [14, 702, 132, 820], [164, 685, 218, 739], [224, 685, 278, 739], [288, 740, 370, 822], [88, 0, 302, 36],
  [14, 600, 92, 678], [324, 228, 376, 280], [324, 288, 376, 340], [324, 348, 376, 400], [324, 408, 376, 460], [324, 468, 376, 520],
  [8, 480, 120, 592], [12, 108, 104, 200], [137, 796, 254, 836],
].map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 })) } };
const LAYOUTS = ['1920x1080', '1280x720', '390x844', '844x390', '390x844-live'];
// a main battle tank, a tall one and a long one (chaseFraming.selftest.mjs's)
const TANKS = {
  nominal: NOMINAL_CHASE_TANK,
  tall: chaseTankFromDims({ heightM: 3.2, widthM: 3.5, hullLengthM: 7.0 }),
  long: chaseTankFromDims({ heightM: 2.6, widthM: 3.8, hullLengthM: 9.2 }, -0.6),
};
const tank = { x: 0, z: 0 };
const flat = () => 0;
/** The chase camera framed for `bands` and `hull` with the turret at `yaw` (the hull faces +z): the framing's distance
 *  back from its pivot over the roof at CHASE_PITCH_RAD, its lens raised by the framing's shift (as cameraRig.ts applyLens
 *  writes it). Returns the projector. */
function chase(yaw, bands, hull) {
  const view = { width: bands.width, height: bands.height };
  const f = solveChaseFraming(view.width, view.height, bands, null, hull);
  const camera = new PerspectiveCamera(f.fovDeg, view.width / view.height, 0.1, 5000);
  const dir = new Vector3(Math.sin(yaw) * Math.cos(CHASE_PITCH_RAD), Math.sin(CHASE_PITCH_RAD), Math.cos(yaw) * Math.cos(CHASE_PITCH_RAD));
  camera.position.set(0, hull.heightM + f.pivotAboveM, 0).addScaledVector(dir, -f.distanceM);
  camera.lookAt(camera.position.clone().add(dir));
  if (f.shift) camera.view = { enabled: true, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: f.shift, width: 1, height: 1 };
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const v = new Vector3();
  return (p) => {
    v.set(p.x, p.y, p.z).project(camera);
    return { x: ((v.x + 1) / 2) * view.width, y: ((1 - v.y) / 2) * view.height, behind: v.z > 1 };
  };
}
/** The hull's box on the screen, as battlePointers.ts hullBox projects it (and the paint's cut-out masks). */
function hullBox(project, hull) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const along of [-hull.rearM, hull.frontM]) for (const across of [-hull.widthM / 2, hull.widthM / 2]) for (const up of [0, hull.heightM]) {
    const at = project({ x: across, y: up, z: along });
    x0 = Math.min(x0, at.x); y0 = Math.min(y0, at.y); x1 = Math.max(x1, at.x); y1 = Math.max(y1, at.y);
  }
  return { x0, y0, x1, y1 };
}
/** The recorded HUD's boxes: its controls, map and instruments, and the head band. */
const hudBoxes = (bands) => [...bands.floor, { x0: 0, y0: 0, x1: bands.width, y1: bands.ceiling }];
/** The pieces cut by the screen's edge or the camera's plane: each a list of screen points. */
const cut = (pieces, view) => pieces.filter((points) => points.some((p) => !onScreen(p, view)));
const inBox = (p, b, pad = 0) => p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;
const boxAround = (points) => ({ x0: Math.min(...points.map((p) => p.x)), y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)), y1: Math.max(...points.map((p) => p.y)) });
const meets = (a, b, pad) => a.x0 - pad <= b.x1 && a.x1 + pad >= b.x0 && a.y0 - pad <= b.y1 && a.y1 + pad >= b.y0;

const destinations = [
  { id: 'ahead', kind: 'waypoint', x: 0, z: 60, radiusM: 8, trail: true },
  { id: 'behind-aside', kind: 'waypoint', x: 40, z: -30, radiusM: 6, trail: true },
  { id: 'look', kind: 'look', x: -50, z: 20, radiusM: 0, trail: false },
  // the battle's own case (tools/tutorial-guide.browser.mjs 'aside'): 90 m to the side
  { id: 'aside', kind: 'waypoint', x: 90, z: 0, radiusM: 6, trail: true },
];
let frames = 0, turns = 0, trails = 0, beside = 0;
for (const layout of LAYOUTS) for (const [hullName, hullSize] of Object.entries(TANKS)) {
  const bands = RECORDED.sizes[layout].idle, view = { width: bands.width, height: bands.height }, noCover = hudBoxes(bands);
  for (const follow of destinations) {
    for (let deg = 0; deg < 360; deg += 5) {
      const viewYaw = (deg * Math.PI) / 180;
      const project = chase(viewYaw, bands, hullSize);
      const hull = hullBox(project, hullSize);
      const plan = planFollow({ follow, player: tank, viewYaw, scoped: false, project, view, groundY: flat, noCover, hull });
      const where = `${layout} ${hullName} hull, ${follow.id} turret ${deg}°`;
      frames++;
      const pieces = [...plan.chevrons.map((c) => c.points), ...(plan.turn ? [plan.turn.band, plan.turn.head] : [])];
      assert.deepEqual(cut(pieces, view), [], `${where}: no piece is cut by the screen's edge or the camera's plane`);
      for (const c of plan.chevrons) assert.ok(!c.points.some((p) => noCover.some((b) => inBox(p, b))), `${where}: no chevron under the HUD`);
      if (!plan.inView) {
        assert.ok(plan.turn, `${where}: the destination is off the screen, so the turn arrow shows`);
        assert.equal(plan.chevrons.length, 0, `${where}: no trail while it is off the screen`);
        const off = wrap(bearing(tank, follow) - viewYaw);
        if (Math.abs(off) < (TURN_EITHER_DEG * Math.PI) / 180) assert.equal(plan.turn.turn, off >= 0 ? 1 : -1, `${where}: it turns the shorter way`);
        assert.ok(!plan.turn.band.some((p) => [...noCover, hull].some((b) => inBox(p, b))), `${where}: its band stands clear of the HUD and the hull`);
        const head = boxAround(plan.turn.head);
        assert.ok(![...noCover, hull].some((b) => meets(head, b, TURN_HEAD_PAD_PX)), `${where}: its head stands clear of the HUD and the hull`);
        turns++;
        // beside the hull: its start stands to the hull's side on the screen
        if (plan.turn.band[0].x < hull.x0 || plan.turn.band[0].x > hull.x1) beside++;
      } else {
        assert.equal(plan.turn, null, `${where}: no turn arrow while the destination is on the screen`);
        if (follow.trail && deg === 0 && follow.id === 'ahead') assert.ok(plan.chevrons.length >= 3, `${where}: the trail shows`);
        if (plan.chevrons.length) trails++;
      }
    }
  }
}
assert.ok(turns > 300 && trails > 20 && beside > turns / 4,
  `the sweep saw both pieces (${turns} turn arrows, ${beside} beside the hull, ${trails} trails)`);
// the sight stands it down
{
  const bands = RECORDED.sizes['1920x1080'].idle, view = { width: bands.width, height: bands.height }, project = chase(0, bands, TANKS.nominal);
  const plan = planFollow({ follow: destinations[0], player: tank, viewYaw: 0, scoped: true, project, view, groundY: flat, noCover: [], hull: null });
  assert.equal(plan.chevrons.length + (plan.turn ? 1 : 0), 0, 'the sight up: no follow pointer');
}
// the negative controls: the same checks find what the battle's stills found
{
  const desk = RECORDED.sizes['1280x720'].idle, deskView = { width: desk.width, height: desk.height };
  const viewYaw = Math.PI / 2, project = chase(viewYaw, desk, TANKS.nominal);
  const lifted = (outline, at = project) => outline.map((p) => at({ x: p.x, y: 0.12, z: p.z }));
  const raw = trailChevrons(tank, destinations[0], destinations[0].radiusM).map((c) => lifted(c.outline));
  assert.ok(cut(raw, deskView).length >= 3, 'control: the whole trail toward a destination aside is cut, so the checker can see it');
  const phone = RECORDED.sizes['390x844'].idle, phoneView = { width: phone.width, height: phone.height };
  const phoneProject = chase(viewYaw, phone, TANKS.nominal);
  const ring = [];
  for (let i = 0; i <= 14; i++) {
    const a = viewYaw - (20 + (130 * i) / 14) * (Math.PI / 180);
    ring.push(phoneProject({ x: Math.sin(a) * 7, y: 0.12, z: Math.cos(a) * 7 }));
  }
  assert.equal(cut([ring], phoneView).length, 1, 'control: the old 7 m ring round the tank is cut on a phone with the turret aside');
  const big = turnArrow(tank, viewYaw, destinations[0], 24, 10);
  assert.ok(cut([big.band, big.head].map((piece) => lifted(piece, phoneProject)), phoneView).length >= 1,
    'control: an arrow too large for the view is cut, so the plan must size it down');
  // a marker aside, on each layout: the plan keeps the largest arrow that fits, never smaller than the first arrow ahead
  // of the hull that fits (the old rule's pick); on a desktop that one is the battle stills' sliver, well under the size
  // of the plan's beside the hull
  const aside = destinations.find((d) => d.id === 'aside');
  for (const layout of LAYOUTS) {
    const bands = RECORDED.sizes[layout].idle, view = { width: bands.width, height: bands.height }, front = chase(0, bands, TANKS.tall);
    const hull = hullBox(front, TANKS.tall), boxes = [...hudBoxes(bands), hull];
    const fits = (arrow) => {
      const band = lifted(arrow.band, front), head = lifted(arrow.head, front);
      return !cut([band, head], view).length && !band.some((p) => boxes.some((b) => inBox(p, b)))
        && !boxes.some((b) => meets(boxAround(head), b, TURN_HEAD_PAD_PX)) ? band : null;
    };
    const span = (points) => { const b = boxAround(points); return Math.hypot(b.x1 - b.x0, b.y1 - b.y0); };
    let ahead = null;
    for (const p of TURN_PLACES.filter((q) => !q.besideM)) for (const r of TURN_RADII_M) ahead ??= fits(turnArrow(tank, 0, aside, r, p.aheadM));
    const plan = planFollow({ follow: aside, player: tank, viewYaw: 0, scoped: false, project: front, view, groundY: flat, noCover: hudBoxes(bands), hull });
    assert.ok(plan.turn, `${layout}: a marker aside gets its arrow`);
    assert.ok(!ahead || span(ahead) <= span(plan.turn.band) + 1e-6, `${layout}: the plan's arrow is the larger`);
    if (bands.touch === false) {
      assert.ok(plan.turn.band[0].x < hull.x0 || plan.turn.band[0].x > hull.x1, `${layout}: on a desktop it lies beside the hull`);
      assert.ok(ahead && span(ahead) < span(plan.turn.band) * 0.7,
        `control, ${layout}: the old rule's arrow ahead is a sliver (${ahead ? span(ahead).toFixed(0) : '-'} px against ${span(plan.turn.band).toFixed(0)} px)`);
    }
  }
  // a head whose corners sit in the gap between two buttons: the corners alone pass, the padded box does not
  const gapHead = [{ x: 100, y: 100 }, { x: 104, y: 96 }, { x: 108, y: 100 }];
  const buttons = [{ x0: 80, y0: 60, x1: 130, y1: 94 }, { x0: 80, y0: 102, x1: 130, y1: 140 }];
  assert.ok(!gapHead.some((p) => buttons.some((b) => inBox(p, b))) && buttons.some((b) => meets(boxAround(gapHead), b, TURN_HEAD_PAD_PX)),
    'control: a head in a gap between buttons passes a corner test and fails the padded one');
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

console.log(`pointerFollowView.selftest: ${frames} frames on 4 recorded layouts and the live phone for 3 hulls, no follow piece cut; the turn arrow off the screen, the trail on it; the tutorial alone posts one`);
