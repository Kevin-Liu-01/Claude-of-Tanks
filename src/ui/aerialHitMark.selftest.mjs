// aerialHitMark.selftest.mjs — (lane ac130-fx-228 r3, the critic's "tan wash while the 30 mm fires", on the base build
// too) through the gunship's lens the full-screen sight canvas held nothing but the hit-confirm mark, and in the films the
// compositor showed it for a frame or two as one magnified patch of the mark's centre spark: a flat cream veil (the
// spark's cream over its dark under-stroke, to within 1 % at day and night) over the lens and the gunship's console. The
// gunship's mark now draws into its own small canvas on the sight. This receipt pins the routing (the gunship never draws
// the mark on the full-screen canvas; the ground sight keeps it), that the mark draws only through the context it is
// given, that the box holds the mark at every age, and that the mark canvas follows every rule that hides the sight;
// and (the engineering critic's M1: the text checks let 8 behavioural mutants live) drives the real battle HUD (initHud)
// over the recording DOM: a gunship pilot's hit shows the mark on its own canvas, sized, cleared and drawn each frame,
// placed on the aim point, hidden when it expires or the HUD hides, never on the full-screen sight; a tank's hit draws
// on the sight as before; a resize keeps the mark canvas at the sight's pixel ratio.
import { created, windowStub, WIDTH, HEIGHT } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createAimController } from '../game/aimController.ts';
import { createBus } from '../game/stateCore.ts';
import { hitConfirmVisualState, HIT_CONFIRM_LIFETIME_S, initHud } from './hud.ts';
const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const fnBody = (name) => {
  const start = hud.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `hud.ts keeps ${name}`);
  const next = hud.indexOf('\n  function ', start + 10);
  const comment = hud.lastIndexOf('\n  //', next);
  return hud.slice(start, comment > start ? comment : next);
};

// the routing: in the gunship the mark goes to its own canvas, the full-screen sight only on the ground
const render = fnBody('renderCanvas');
assert.match(render, /if \(aerial\) paintAerialHitMark\(lastTimeS\);\s*else \{ hideAerialHitMark\(\); drawHitMark\(ctx, aimView\.cx, aimView\.cy, lastTimeS\); \}/,
  'renderCanvas draws the gunship\'s mark on its own canvas and the ground mark on the sight');
assert.equal((hud.match(/drawHitMark\(ctx\b/g) ?? []).length, 1, 'the full-screen sight receives the mark from the ground branch alone');
const paint = fnBody('paintAerialHitMark');
assert.match(paint, /drawHitMark\(markCtx, HIT_MARK_BOX_PX \/ 2, HIT_MARK_BOX_PX \/ 2, timeS\)/, 'the gunship\'s mark is drawn about the centre of its own canvas');
assert.match(paint, /markCanvas\.style\.transform = `translate\(\$\{x\}px,\$\{y\}px\)`/, 'the mark canvas is placed on the sight');
// the mark draws only through the context it is given: nothing in it can reach the full-screen canvas
const mark = fnBody('drawHitMark');
assert.doesNotMatch(mark, /\bctx\b/, 'drawHitMark never touches the full-screen sight context directly');
assert.doesNotMatch(mark, /\bview\./, 'drawHitMark is placed by its centre argument, never by the sight\'s aim view');

// the box holds the mark at every age (the shards' far tip with the dark pad, the blocked-round diamond, their strokes)
const box = Number(hud.match(/^const HIT_MARK_BOX_PX = (\d+);/m)?.[1]);
assert.ok(box > 0, 'hud.ts keeps HIT_MARK_BOX_PX');
let reach = 0;
for (const reduced of [false, true]) {
  for (let age = 0; age <= HIT_CONFIRM_LIFETIME_S; age += 0.005) {
    const v = hitConfirmVisualState(age, reduced);
    if (v.visible) reach = Math.max(reach, v.radius + v.length + 2.1 + 1.6);
  }
}
const diamond = Math.hypot(30 + 6, 30 + 7) + 1.5;
assert.ok(box / 2 >= Math.max(reach, Math.hypot(reach * Math.SQRT1_2, reach * Math.SQRT1_2)) && box / 2 * Math.SQRT2 >= diamond,
  `the ${box} px box holds the mark (shards reach ${reach.toFixed(1)} px, the diamond ${diamond.toFixed(1)} px at the diagonal)`);

// the mark canvas's own rule: on the sight's layer, anchored at the top left (placed by its transform), its box, hidden
// until a mark shows, never taking input
assert.match(hud, /\.cot-hitmark\{position:absolute;z-index:var\(--hud-layer-sight\);left:0;top:0;width:\$\{HIT_MARK_BOX_PX\}px;height:\$\{HIT_MARK_BOX_PX\}px;\n\s*display:none;pointer-events:none;\}/,
  'the mark canvas sits on the sight\'s layer at the top left, its box, hidden by default, no input');
// the mark canvas follows every rule that hides the sight
const css = readFileSync(new URL('./battleUiVisibility.css', import.meta.url), 'utf8');
const shot = readFileSync(new URL('./shotInfo.ts', import.meta.url), 'utf8');
assert.match(hud, /body\.cot-spectating \.cot-ret,body\.cot-spectating \.cot-hitmark\{display:none !important;\}/, 'hidden while spectating');
assert.match(shot, /body\.cot-si-report \.cot-ret,body\.cot-si-report \.cot-hitmark\{display:none !important;\}/, 'hidden under the battle report');
assert.match(css, /\.cot-hud > :not\(\.cot-ret,\.cot-hitmark,/, 'kept with the sight when the battle UI hides');
assert.equal((hud.match(/ctx\.clearRect\(0, 0, w, h\); hideAerialHitMark\(\);/g) ?? []).length
  + (hud.match(/ctx\.clearRect\(0, 0, w, h\);\n\s+hideAerialHitMark\(\);/g) ?? []).length, 2, 'cleared with the sight when the HUD hides');

// ---- behaviour: the real battle HUD over the recording DOM ----
const bus = createBus();
const runtime = initHud(bus);
const sight = created.find((e) => e.classes.has('cot-ret'));
const markEl = created.find((e) => e.classes.has('cot-hitmark'));
assert.ok(sight && markEl, 'the HUD mounts the sight and the gunship\'s mark canvas');
const sightOps = sight.getContext('2d').ops, markOps = markEl.getContext('2d').ops;
runtime.setMode('battle');
await ensureAuthorityFleet(['m1a1_abrams_hc']);
const DT = 1 / 60;
const AMBER = 'rgba(255,166,48,', CREAM = '255,235,190';
const markInk = (ops) => ops.filter((op) => (op.op === 'fill' || op.op === 'stroke') && String(op.style).includes(op.op === 'fill' ? AMBER : CREAM));
function pilot(aerial) {
  const spec = getSpec('m1a1_abrams_hc');
  return { id: 'player', team: 'alpha', isPlayer: true, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
    state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
    ...(aerial ? { aerial: { kind: 'gunship', active: true, launching: false, x: 0, y: 240, z: -90, yaw: 0, pitch: -1.2, batteryS: 0, cooldownS: 0 } } : {}) };
}
let current = null, camera = null, timeS = 40;
const controller = createAimController({
  getGame: () => ({ player: current, tanks: [current] }),
  getRig: () => ({ aimPoint: new THREE.Vector3(30, 0, 120), aimDist: 200, mode: 'CHASE', zoom: 1 }),
  worldRaycast: () => null, targetVisible: () => true,
  getShellCards: () => current.spec.gun.shells.map((shell) => ({ name: shell.name, type: shell.type, dmg: shell.dmg, penLabel: '', count: 0 })),
  computeDispersion: () => 8, now: () => 0,
});
const aim = { singleReticle: false, point: new THREE.Vector3(), distM: 0, dispersionRadM: 0, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
function frame(tank, mode = 'battle') {
  current = tank;
  controller.update(aim);
  sightOps.length = 0; markOps.length = 0;
  timeS += DT;
  runtime.update({ timeS, mode, player: tank, tanks: [tank], spotting: { isSpotted: () => true }, aim, camera, auxiliaryKeyLabels: { missile: 'E' } });
}
const hit = () => bus.emit('shell:hit', { attackerId: 'player', targetId: 'enemy-1', kind: 'pen', damage: 140, pos: [30, 1, 120],
  shellType: 'APFSDS', caliberMm: 30, shellName: '30 mm AP', effectiveMm: 40, penRollMm: 60, nominalMm: 60 });
const half = box / 2;
const placed = () => markEl.style.transform;

// (A) the gunship pilot's hit: the mark canvas shown, sized, placed on the aim point, cleared then drawn inside its box
const gunship = pilot(true);
// (the critic's H10) the sight settles first: a steady, reusable sight must still paint a fresh hit
for (let i = 0; i < 90; i++) frame(gunship);
assert.notEqual(markEl.style.display, 'block', 'no mark before a hit (the CSS keeps it hidden)');
hit(); frame(gunship);
assert.equal(markEl.style.display, 'block', 'a gunship hit shows the mark canvas');
assert.equal([markEl.width, markEl.height].join('x'), `${box}x${box}`, 'the mark canvas is sized to its box at the sight\'s pixel ratio (1)');
assert.equal(placed(), `translate(${WIDTH / 2 - half}px,${HEIGHT / 2 - half}px)`, 'with no camera the mark sits on the sight\'s centre');
assert.equal(markOps[0]?.op, 'clear', 'each frame clears the mark canvas first');
const shards = markInk(markOps);
assert.ok(shards.length >= 4, `the amber shards are drawn on the mark canvas (${shards.length})`);
for (const op of markOps.filter((o) => o.box)) {
  assert.ok(op.box.x0 >= -1 && op.box.y0 >= -1 && op.box.x1 <= box + 1 && op.box.y1 <= box + 1, `every mark op stays in its ${box} px box`);
}
assert.equal(markInk(sightOps).length, 0, 'the full-screen sight never receives the gunship\'s mark');
frame(gunship);
assert.equal(markOps[0]?.op, 'clear', 'the next frame clears again (no smear)');
assert.ok(markInk(markOps).length >= 4, 'and redraws the live mark');

// (B) the mark expires: the canvas hides and is left clear
for (let t = 0; t <= HIT_CONFIRM_LIFETIME_S + 0.1; t += DT) frame(gunship);
assert.equal(markEl.style.display, 'none', 'an expired mark hides its canvas');
assert.equal(markInk(markOps).length, 0, 'and draws nothing');

// (C) the HUD hides with a live mark: the mark canvas hides with it
hit(); frame(gunship);
assert.equal(markEl.style.display, 'block');
frame(gunship, 'hidden');
assert.equal(markEl.style.display, 'none', 'the hidden HUD hides the live mark');
frame(gunship);
for (let t = 0; t <= HIT_CONFIRM_LIFETIME_S + 0.1; t += DT) frame(gunship);

// (F) through a camera with the aim point off the centre: the mark sits on the projected aim point
camera = new THREE.PerspectiveCamera(55, WIDTH / HEIGHT, 0.5, 5000);
camera.position.set(0, 240, -90); camera.lookAt(0, 0, 60); camera.updateMatrixWorld(true);
frame(gunship);
hit(); frame(gunship);
const ndc = aim.point.clone().project(camera);
const ex = Math.round((ndc.x + 1) / 2 * WIDTH - half), ey = Math.round((1 - ndc.y) / 2 * HEIGHT - half);
assert.ok(Math.abs(ex - (WIDTH / 2 - half)) > 20 || Math.abs(ey - (HEIGHT / 2 - half)) > 20, 'the staged aim point is off the centre');
const [tx, ty] = (/translate\((-?\d+)px,(-?\d+)px\)/.exec(placed()) ?? []).slice(1).map(Number);
assert.ok(Math.abs(tx - ex) <= 2 && Math.abs(ty - ey) <= 2, `the mark sits on the projected aim point (${placed()} vs ${ex},${ey})`);
for (let t = 0; t <= HIT_CONFIRM_LIFETIME_S + 0.1; t += DT) frame(gunship);
camera = null;

// (D) a tank's hit: the mark on the full-screen sight as before, the mark canvas unused
const tank = pilot(false);
// (the critic's H10) the ground sight settles until it is reused (nothing repainted), then a hit must still paint the mark
let settled = false;
for (let i = 0; i < 600 && !settled; i++) { frame(tank); settled = sightOps.length === 0; }
assert.ok(settled, 'the steady ground sight is reused (nothing repainted)');
hit(); frame(tank);
assert.ok(markInk(sightOps).length >= 4, 'a tank\'s hit draws the mark on the full-screen sight');
assert.notEqual(markEl.style.display, 'block', 'the mark canvas stays hidden for a tank');
assert.equal(markInk(markOps).length, 0, 'and receives nothing');
for (let t = 0; t <= HIT_CONFIRM_LIFETIME_S + 0.1; t += DT) frame(tank);

// (E) a resize at a higher pixel ratio: the mark canvas follows the sight's ratio
windowStub.devicePixelRatio = 2; globalThis.devicePixelRatio = 2;
windowStub.dispatchEvent(new Event('resize'));
const ratio = sight.width / WIDTH;
assert.ok(ratio > 1, `the sight takes the higher pixel ratio (${ratio})`);
assert.equal(markEl.width, Math.round(box * ratio), `the mark canvas follows it (${markEl.width} at ${ratio})`);

console.log(`aerialHitMark: the gunship's hit-confirm mark draws in its own ${box} px canvas on the sight (reach ${reach.toFixed(1)} px), never on the full-screen sight; the ground sight unchanged`);
