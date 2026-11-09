// src/ui/hullBarMarkers.selftest.mjs — the hull bars' marker receipt (owner 2026-11-04: "make tank indicators be able
// to overlap with each other, rn they push each other up and prevent overlap, which actually makes it so that tank names
// and stuff get pushed away from where thae tanks actualy are, which is a regression that should be fixed").
// damagePanelMarkers' law applied to the plates over tanks: every hull bar sits exactly on its own tank's projected seat,
// co-located tanks' bars coincide, bars of tanks close in view overlap instead of being pushed apart, and where they
// overlap the enemy's draws over the ally's and the nearer over the farther, and where one's ink crosses the other's words
// the one under draws its words faint so the top name reads (glyph plates at full ink struck through each other, the 269
// stills; boxes that meet only at their edges stay at full ink, the 269 critic). The kept 10-26 r20 rule is held too: a bar
// whose seat leaves the window slides back whole onto it, its pointer still over its tank. Headless: the REAL battle HUD
// (initHud) runs over the recording DOM (hudDomHarness) through a camera, and the negative control loads hud.ts with the
// old bar-versus-bar push (35782a9496, gauntlet r15) restored, which the same law must reject.
import { created, WIDTH, HEIGHT } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createAimController } from '../game/aimController.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

// ---- the negative control's module: hud.ts as it was, each bar tested against the bars placed before it ----
const HUD_URL = new URL('./hud.ts', import.meta.url).href;
const OLD_PUSH = [
  ['    hpBarRingOut = lastDrawnR + HP_BAR_RING_GAP;\n    let stacked = 0;\n',
    '    hpBarRingOut = lastDrawnR + HP_BAR_RING_GAP;\n    let stacked = 0;\n    oldPushPlaced.length = 0;\n'],
  ['      seen.add(bar);\n      positionHpBar(bar);\n    }',
    '      oldPushPlaced.push([x0 + bar.seatDx, y0 + bar.seatDy, x1 + bar.seatDx, y1 + bar.seatDy]);\n      seen.add(bar);\n      positionHpBar(bar);\n    }'],
  ['  function hpBarClear(x0: number, y0: number, x1: number, y1: number): boolean {\n',
    '  const oldPushPlaced: number[][] = [];\n  function hpBarClear(x0: number, y0: number, x1: number, y1: number): boolean {\n'
    + '    for (const [a0, b0, a1, b1] of oldPushPlaced) if (x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0) return false;\n'],
];
const source = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
let mutant = source;
for (const [from, to] of OLD_PUSH) {
  assert.equal(mutant.split(from).length, 2, `the negative control finds its one place in hud.ts: ${from.trim().slice(0, 60)}`);
  mutant = mutant.replace(from, to);
}
assert.doesNotMatch(source, /hpBarPlaced|oldPushPlaced/, 'hud.ts keeps no list of placed bars to push a bar off its tank');

registerHooks({
  load(url, context, nextLoad) {
    if (url !== `${HUD_URL}?old-push`) return nextLoad(url, context);
    return { ...nextLoad(url, context), source: mutant, shortCircuit: true };
  },
});
const { initHud: initOldPushHud } = await import('./hud.ts?old-push');

await ensureAuthorityFleet(['m1a1_abrams_hc']);
const SPEC = getSpec('m1a1_abrams_hc');
const TOP = SPEC.dims?.heightM ?? 2.5;
const DT = 1 / 60;
// (a camera at the player's roof looking down the field; the aim point wide right of every staged tank, so no bar meets
// the sight's ring and no tank is under the gun)
const camera = new THREE.PerspectiveCamera(55, WIDTH / HEIGHT, 0.5, 5000);
camera.position.set(0, 6, 0);
camera.lookAt(0, 2, 400);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

/** Where the HUD projects a tank's seat (its top), as hud.ts project() does: screen px and view depth. */
function seat(pos) {
  const view = new THREE.Vector3(pos[0], pos[1] + TOP, pos[2]).applyMatrix4(camera.matrixWorldInverse);
  const ndc = view.clone().applyMatrix4(camera.projectionMatrix);
  return { x: (ndc.x * 0.5 + 0.5) * WIDTH, y: (-ndc.y * 0.5 + 0.5) * HEIGHT, dist: -view.z };
}

function tank(id, team, pos, extra = {}) {
  return { id, team, displayName: id, spec: SPEC, combat: createCombatState(SPEC), specialAction: createSpecialActionState(SPEC),
    state: { pos: new THREE.Vector3(...pos), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
    ...extra };
}

/** One HUD (the real one or the control's), its player and the bars it makes, read by the tank each one names. */
function createScene(init) {
  const from = created.length;
  const bus = createBus();
  const runtime = init(bus);
  runtime.setMode('battle');
  const player = tank('player', 'alpha', [0, 0, 0], {
    isPlayer: true,
    // (the gun laid wide right and low: the sight's ring stands clear of every staged tank's bar)
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0.5, -0.12, 1).normalize(); } },
  });
  let tanks = [player];
  const controller = createAimController({
    getGame: () => ({ player, tanks }),
    getRig: () => ({ aimPoint: new THREE.Vector3(120, 0, 200), aimDist: 200, mode: 'CHASE', zoom: 1 }),
    worldRaycast: () => null, targetVisible: () => true,
    getShellCards: () => SPEC.gun.shells.map((shell) => ({ name: shell.name, type: shell.type, dmg: shell.dmg, penLabel: '', count: 0 })),
    computeDispersion: () => 0.4, now: () => 0,
  });
  const aim = { singleReticle: false, point: new THREE.Vector3(), distM: 0, dispersionRadM: 0, gunLimitSpec: false,
    reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
    gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
  let timeS = 40;
  return {
    stage(list) { tanks = [player, ...list]; },
    frame() {
      controller.update(aim);
      timeS += DT;
      runtime.update({ timeS, mode: 'battle', player, tanks, spotting: { isSpotted: () => true }, aim, camera,
        auxiliaryKeyLabels: { missile: 'E' } });
    },
    /** The shown bars by their tank's id: the seat they were written at, their width, stacking and pointer offset. */
    bars() {
      const out = new Map();
      for (const el of created.slice(from)) {
        if (!el.classes.has('cot-hpb') || el.style.display !== 'flex') continue;
        const move = /translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\) scale\(([\d.]+)\)/.exec(el.style.transform);
        assert.ok(move, `a shown bar carries its seat's transform (${el.style.transform})`);
        const id = el.querySelector('.nm span').textContent;
        out.set(id, { x: Number(move[1]), y: Number(move[2]), k: Number(move[3]), width: parseFloat(el.style.width),
          z: Number(el.style.zIndex), ally: el.classes.has('ally'), under: el.classes.has('under'),
          pointerDx: parseFloat(el.style.getPropertyValue('--hpb-anch-dx')) || 0 });
      }
      return out;
    },
  };
}

// toFixed(1) on both axes: a seat is exact to the twentieth of a pixel
const SEAT_PX = 0.051;
/** The marker law over one staged frame: every staged tank's bar shown, on its own seat, unslid; co-located bars equal;
 *  the stack the enemies' over the allies', the nearer over the farther. */
function proveFrame(scene, staged, label) {
  const bars = scene.bars();
  const rise = [];
  for (const t of staged) {
    const bar = bars.get(t.id);
    assert.ok(bar, `${label}: ${t.id}'s bar shows (nothing holds a bar back for another)`);
    const s = seat(t.state.pos.toArray());
    assert.ok(Math.abs(bar.x + bar.width / 2 - s.x) <= SEAT_PX,
      `${label}: ${t.id}'s bar sits on its own tank (${(bar.x + bar.width / 2).toFixed(2)} vs ${s.x.toFixed(2)} px)`);
    assert.equal(bar.pointerDx, 0, `${label}: ${t.id}'s bar is not slid along its row`);
    rise.push({ id: t.id, rise: s.y - bar.y, dist: s.dist, k: bar.k });
  }
  // (past PLATE_LIFT_RANGE_M every bar stands the same lift over its tank's top at one scale: one rise for every bar is
  // its own seat on the y axis too, and a bar pushed up or down for another breaks it)
  const far = rise.filter((r) => r.dist > 330);
  for (const r of far) {
    assert.equal(r.k, 1, `${label}: ${r.id}'s far bar is drawn at one scale`);
    assert.ok(Math.abs(r.rise - far[0].rise) <= 2 * SEAT_PX,
      `${label}: ${r.id}'s bar stands ${r.rise.toFixed(2)} px over its tank's seat, as every far bar does (${far[0].rise.toFixed(2)} px)`);
  }
  // co-located tanks' bars coincide
  for (let i = 0; i < staged.length; i++) for (let j = i + 1; j < staged.length; j++) {
    if (!staged[i].state.pos.equals(staged[j].state.pos)) continue;
    const a = bars.get(staged[i].id), b = bars.get(staged[j].id);
    assert.ok(a.x === b.x && a.y === b.y && a.k === b.k,
      `${label}: co-located ${staged[i].id} and ${staged[j].id} coincide (${a.x},${a.y} vs ${b.x},${b.y})`);
  }
  // the stack: the enemies' first, then the nearest, on top
  const ranked = staged.map((t) => ({ id: t.id, ally: t.team === 'alpha', dist: seat(t.state.pos.toArray()).dist }))
    .sort((a, b) => (a.ally === b.ally ? a.dist - b.dist : a.ally ? 1 : -1));
  for (let i = 1; i < ranked.length; i++) {
    const above = bars.get(ranked[i - 1].id), below = bars.get(ranked[i].id);
    if (ranked[i - 1].dist === ranked[i].dist && ranked[i - 1].ally === ranked[i].ally) continue;
    assert.ok(above.z > below.z, `${label}: ${ranked[i - 1].id} draws over ${ranked[i].id} (z ${above.z} over ${below.z})`);
  }
  // the top of the stack always draws at full ink: the nearest name reads
  const top = staged.map((t) => ({ id: t.id, bar: bars.get(t.id) })).sort((a, b) => b.bar.z - a.bar.z)[0];
  assert.equal(top.bar.under, false, `${label}: ${top.id}, on top of the stack, draws at full ink`);
  return bars;
}

/** Drives one HUD through every staging, each judged on its own: the failures by staging (empty where the law holds). */
function proveLaw(init, label) {
  const scene = createScene(init);
  const failures = new Map();
  let frames = 0;
  const judge = (staging, run) => {
    try { run(); } catch (error) { if (!(error instanceof assert.AssertionError)) throw error; failures.set(staging, error.message); }
  };
  const settle = (list) => { scene.stage(list); for (let i = 0; i < 4; i++) { scene.frame(); frames++; } };

  // 1. co-located: two enemies and an ally on one spot, at range
  judge('co-located', () => {
    const spot = [-12, 0, 380];
    const coLocated = [tank('enemy-a', 'bravo', spot), tank('enemy-b', 'bravo', spot), tank('ally-a', 'alpha', spot)];
    settle(coLocated);
    const bars = proveFrame(scene, coLocated, `${label}/co-located`);
    assert.deepEqual(['enemy-b', 'ally-a'].map((id) => bars.get(id).under), [true, true],
      `${label}/co-located: the bars under the top one draw their words faint`);
  });

  // 2. a crowd close together at range: six hulls 3 m apart across and 6 m deep, both sides mixed
  judge('crowd', () => {
    const crowd = Array.from({ length: 6 }, (_, i) => tank(`crowd-${i}`, i % 2 ? 'alpha' : 'bravo', [-30 + 3 * i, 0, 360 + 6 * (i % 3)]));
    settle(crowd);
    const bars = proveFrame(scene, crowd, `${label}/crowd`);
    assert.ok(crowd.filter((t) => bars.get(t.id).under).length >= 3, `${label}/crowd: the bars under the top ones draw faint`);
  });

  // 3. two hulls far apart in view: neither bar crosses the other, so both draw at full ink
  judge('apart', () => {
    const apart = [tank('enemy-far', 'bravo', [-60, 0, 380]), tank('ally-far', 'alpha', [20, 0, 380])];
    settle(apart);
    const bars = proveFrame(scene, apart, `${label}/apart`);
    assert.ok(apart.every((t) => !bars.get(t.id).under), `${label}/apart: bars that cross nothing draw at full ink`);
  });

  // 4. edges: an ally's bar 100 px beside an enemy's, their boxes crossing 28 px at the ends where neither holds words:
  //    both at full ink; 40 px beside it the enemy's ink crosses the ally's words, so the ally's draw faint
  judge('edges', () => {
    const enemy = tank('enemy-edge', 'bravo', [-40, 0, 380]);
    const at = (px) => { let lo = -40, hi = 60; // the world x whose seat stands px to the right of the enemy's
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (seat([-40, 0, 380]).x - seat([mid, 0, 380]).x < -px) lo = mid; else hi = mid; }
      return (lo + hi) / 2; };
    for (const [px, faint] of [[100, false], [40, true]]) {
      const ally = tank('ally-edge-x', 'alpha', [at(-px), 0, 380]);
      settle([enemy, ally]);
      const bars = proveFrame(scene, [enemy, ally], `${label}/edges ${px} px`);
      const gap = Math.abs(bars.get('ally-edge-x').x - bars.get('enemy-edge').x);
      assert.ok(Math.abs(gap - px) < 1, `${label}/edges: the bars stand ${px} px apart (${gap.toFixed(1)})`);
      assert.equal(bars.get('ally-edge-x').under, faint, `${label}/edges ${px} px: the ally's words ${faint ? 'draw faint' : 'stay at full ink'}`);
    }
  });

  // 5. an enemy driving across an ally at one range: every pose, both bars on their own tanks, the enemy's on top
  judge('crossing', () => {
    const ally = tank('ally-x', 'alpha', [-6, 0, 400]);
    const enemy = tank('enemy-x', 'bravo', [-26, 0, 400]);
    scene.stage([ally, enemy]);
    for (let pose = 0; pose < 60; pose++) {
      enemy.state.pos.x = -26 + (40 * pose) / 59;
      scene.frame(); frames++;
      proveFrame(scene, [ally, enemy], `${label}/crossing ${pose}`);
    }
  });
  return { scene, frames, failures };
}
const faint = (bars) => [...bars.values()].filter((bar) => bar.under).length;

// ---- the law on the real HUD ----
const { scene, frames, failures } = proveLaw(initHud, 'hud');
assert.deepEqual([...failures.values()], [], 'every hull bar sits on its own tank, unpushed');

// ---- kept (10-26 r20): whole on the window. A near ally at the left edge: its seat would leave the window, so the bar
// slides back onto it whole, its tank's x inside the bar and its pointer moved back over the tank ----
{
  const edge = seat([176, 0, 200]);
  assert.ok(edge.x < 64 && edge.x > 8, `the edge tank stands at the window's left edge (${edge.x.toFixed(1)} px)`);
  const nearAlly = tank('ally-edge', 'alpha', [176, 0, 200]);
  scene.stage([nearAlly]);
  for (let i = 0; i < 4; i++) scene.frame();
  const bar = scene.bars().get('ally-edge');
  assert.ok(bar, 'the edge ally\'s bar shows');
  const left = bar.x + (bar.width * (1 - bar.k)) / 2, right = left + bar.width * bar.k;
  assert.ok(left >= -SEAT_PX && right <= WIDTH + SEAT_PX, `the edge bar stands whole on the window (${left.toFixed(1)} to ${right.toFixed(1)} px)`);
  assert.ok(edge.x > left && edge.x < right, 'the edge bar keeps its tank\'s x inside it');
  assert.ok(bar.pointerDx < 0, `the edge bar's pointer is moved back over its tank (${bar.pointerDx} px)`);
}

// ---- the negative control: the old push fails the same law in every staging ----
const control = proveLaw(initOldPushHud, 'old-push').failures;
for (const staging of ['co-located', 'crowd', 'crossing']) {
  const message = control.get(staging) ?? '';
  assert.match(message, new RegExp(`^old-push/${staging}`), `the old bar-versus-bar push must fail the ${staging} staging`);
  assert.match(message, /bar shows|own tank|coincide|over its tank's seat|not slid/, `the control's ${staging} fails on the law, not on staging`);
  console.log(`hullBarMarkers.selftest: the old push rejected — ${message.split('\n')[0]}`);
}

console.log(`hullBarMarkers.selftest: ${frames} frames of the real HUD — each hull bar on its own tank, co-located bars `
  + 'coincide, a crowd and a crossing overlap unpushed, the enemies\' and the nearer on top, the ones under faint; the edge '
  + `slide kept (${faint(scene.bars())} faint at the end)`);
