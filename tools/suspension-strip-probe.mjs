#!/usr/bin/env node
// Suspension strip probe (PR #9 physics lane, 2026-10-03; owner: "maintaining perfect beautiful suspension", then "use
// the gauntlet loop for all visual verification ... especially in comparison to world of tanks and war thunder and
// realistic"). Frame strips of the player hull in a real solo battle — the real map, lighting, tank visual, running
// gear and physics — for the visual gauntlet's critics: rough ground at speed, a hard stop, a landing in every gravity
// world, a rest on a slope.
//
// Deterministic: the countdown is frozen (game.preBattleS = Infinity) so the frame loop never steps the battle, and
// every tick between captures is a __DEBUG.fastForward step of the solo simulation. Each case runs twice on the same
// stage: a dry run finds the anchor (the touchdown, the stop), the capture run must meet it on the same tick.
// Gauntlet wave 2 (the strips scored 4.70 and held the merge; before and after looked identical) set the contract:
// - the dynamic window: a landing is captured 10 steps before its touchdown, at its last airborne step, the touchdown
//   and +1, +2, +4, +8, +16 and +32 steps after it; a hard stop before and through the dive, at the stop and through
//   the rock-back after it;
// - the camera is fixed in the world for a landing or a rest (riding with the hull's height hid its heave) and follows
//   a moving hull at ground level;
// - every frame carries a stamp burned into the image: build, t, step, root height above the ground, pitch and roll as
//   rendered, ride speed, road wheels in contact with the ground and each road wheel's travel (+ up into the hull);
// - every frame checks the rendered hull against the sim state it was synced from (root height, rendered pitch and
//   roll) and records the sim state, the rendered pose and the rendered wheel travel in the case's JSON;
// - rough ground is driven at speed on a stage clear of obstacles, and a case that does not move fails.
// It runs on a built dist (--dist=<dir>, served by vite preview; the in-page code needs nothing from /src) or on the
// live tree (a vite dev server). Run it on two builds for a before/after pair and compare their JSON frame by frame.
//
//   node tools/suspension-strip-probe.mjs --root=<worktree> --dist=<built dist> --out=<dir> --tag=after [--ids=rough,hardstop]
//
// Hold the capture queue (tools/capture-command.mjs) around the run. Writes <case>-<tag>-NN.png per frame,
// <case>-<tag>.json with every frame's record, and the receipt.
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli, sleep, withDistProbeSession, withMapProbeSession,
  writeProbeReceipt,
} from './map-probe-runtime.mjs';

const TOOL = 'suspension-strip-probe';
const ACCEPTS = ['root', 'out', 'tag', 'spec', 'ids', 'cache-dir', 'dist'];
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });

/**
 * The cases. `map`/`mode`/`gravity` pick the battle; `find` the stage (searched on the live height field, clear of
 * obstacles); `kind` how the capture window is anchored: `landing` (touchdown), `stop` (brake and stop), `drive`
 * (steady travel), `rest`.
 */
export const STRIP_CASES = Object.freeze({
  rough: { map: 'badlands', mode: 'standard', find: 'rough', kind: 'drive', speed: 11, throttle: 1, view: 'side',
    frames: [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8] },
  hardstop: { map: 'steppe', mode: 'standard', find: 'flat', kind: 'stop', speed: 'top', throttle: 1, brakeAtS: 1.0, view: 'side' },
  slope: { map: 'alpine', mode: 'standard', find: 'slope', kind: 'rest', speed: 0, throttle: 0, view: 'side', frames: [0.5, 2, 4] },
  'land-earth': { map: 'mars', mode: 'standard', find: 'flat', kind: 'landing', drop: 3, view: 'quarter' },
  'land-gearth': { map: 'mars', mode: 'mars', gravity: 'earth', find: 'flat', kind: 'landing', jump: true, view: 'quarter' },
  'land-mars': { map: 'mars', mode: 'mars', gravity: 'mars', find: 'flat', kind: 'landing', jump: true, view: 'quarter' },
  'land-moon': { map: 'mars', mode: 'mars', gravity: 'moon', find: 'flat', kind: 'landing', jump: true, view: 'quarter' },
  'land-turbo': { map: 'mars', mode: 'turbo_ball', find: 'flat', kind: 'landing', jump: true, view: 'quarter' },
});

/** Step offsets (sim ticks) captured around a landing's touchdown and around a hard stop. */
export const LANDING_STEPS = Object.freeze([-10, -1, 0, 1, 2, 4, 8, 16, 32]);
const STOP_STEPS = Object.freeze([-6, 6, 15, 30, 60]);       // from the brake
const STOPPED_STEPS = Object.freeze([0, 9, 24, 48]);        // from the stop

const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'a', spec: 't90m' },
  summary: 'Frame strips of the player hull (rough ground, hard stop, landings per gravity world, slope rest) for the visual gauntlet.',
  notes: ['Cases: ' + Object.keys(STRIP_CASES).join(', ')],
});

export function parseStripArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'a', spec: 't90m' } });
  if (parsed.help) return parsed;
  const ids = parsed.options.ids ?? Object.keys(STRIP_CASES);
  const unknown = ids.filter((id) => !STRIP_CASES[id]);
  if (unknown.length) throw new Error(`Unknown case ${unknown.join(', ')}`);
  parsed.options.caseIds = ids;
  if (parsed.options.dist) parsed.options.dist = path.resolve(parsed.options.dist);
  return parsed;
}

/** The arrangement the mode reads at battle setup: one hostile far away, no allies, no caches, the chosen gravity. */
function arrangementFor(caseDef) {
  const entry = { allies: 0, enemies: 1 };
  if (caseDef.mode === 'mars') Object.assign(entry, { marsGravity: caseDef.gravity ?? 'mars', marsCaches: 'off' });
  return { [caseDef.mode]: entry };
}

/** The build under test: a dist's BUILD-STAMP.json when it has one, else the tree's revision (+ dirty). */
function buildLabel(options) {
  if (options.dist) {
    const stampFile = path.join(options.dist, 'BUILD-STAMP.json');
    if (existsSync(stampFile)) {
      const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
      return `${String(stamp.revision).slice(0, 9)}${stamp.dirty?.length ? '+dirty' : ''} dist`;
    }
    return `dist ${path.basename(options.dist)}`;
  }
  try {
    const revision = execFileSync('git', ['-C', options.root, 'rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', options.root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    return `${revision}${dirty ? '+dirty' : ''} dev`;
  } catch { return 'unknown'; }
}

// ------------------------------------------------------------------------------------------------- in-page helpers
// Self-contained: stringified into the page, so they run on a built dist as on the dev server. `world` is the live
// world (its height field and obstacles).
function pageFindStage(world, kind) {
  const hf = world.heightField;
  const h = (x, z) => hf.getHeightAt(x, z);
  const wet = (x, z) => (hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0) > 0.02;
  const obstacles = typeof world.getObstacles === 'function' ? world.getObstacles() : [];
  const blocked = (x, z, margin) => obstacles.some((o) => !o.crushed
    && x > o.min[0] - margin && x < o.max[0] + margin && z > o.min[2] - margin && z < o.max[2] + margin);
  let best = null;
  for (let gx = -280; gx <= 280; gx += 20) {
    for (let gz = -280; gz <= 280; gz += 20) {
      for (let k = 0; k < 8; k++) {
        const yaw = (k * Math.PI) / 4;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const len = kind === 'rough' ? 40 : kind === 'flat' ? 70 : 10;
        let ok = true, rough = 0, maxGrade = 0, prev = null, prev2 = null, wetAny = false;
        for (let s = -6; s <= len; s += 1) {
          const x = gx + fx * s, z = gz + fz * s;
          const y = h(x, z);
          if (wet(x, z)) wetAny = true;
          if (blocked(x, z, 6)) { ok = false; break; }
          if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(y - prev));
          if (prev2 !== null) rough += Math.abs(y - 2 * prev + prev2);
          prev2 = prev; prev = y;
        }
        if (!ok || wetAny) continue;
        const side = Math.abs(h(gx + fz * 2, gz - fx * 2) - h(gx - fz * 2, gz + fx * 2)) / 4;
        let score;
        if (kind === 'rough') { if (maxGrade > 0.3 || side > 0.2) continue; score = rough; }
        else if (kind === 'flat') { if (maxGrade > 0.06 || side > 0.05) continue; score = -rough - maxGrade * 10; }
        else {
          const grade = (h(gx + fx * 4, gz + fz * 4) - h(gx - fx * 4, gz - fz * 4)) / 8;
          if (side > 0.06 || rough > 0.6) continue;
          score = -Math.abs(Math.atan(grade) - 0.31) * 10 - rough;
        }
        if (!best || score > best.score) best = { x: gx, z: gz, yaw, score: +score.toFixed(4), maxGrade: +maxGrade.toFixed(3) };
      }
    }
  }
  return best;
}

/** movement.ts resetTankVerticalState, for a page whose modules are bundled (the fields it resets, nothing else). */
function pageResetVertical(state, y, verticalSpeed, grounded) {
  state.pos.y = y;
  state.verticalSpeed = verticalSpeed;
  state.grounded = grounded !== false;
  state.landingImpactMps = 0;
  const ride = state._ride;
  ride.y = y; ride.v = verticalSpeed; ride.supportY = NaN; ride.groundV = 0; ride.grounded = state.grounded;
  ride.airTime = 0; ride.bounces = 0;
  if ('rebound' in ride) ride.rebound = 0;
  state._sup.x = NaN;
  state._body.landingBlendS = 0;
  state._body.dynamicSupport = false;
  state._body.restSupportY = NaN;
  if (grounded !== false && !state.overturned) state._body.tumbling = false;
}

/** movement.ts requestTankJump from the ground (liftTankRide): the jump's speed and the detach clearance. */
function pageJump(state, jumpMps) {
  state.verticalSpeed = Math.max(state.verticalSpeed || 0, 0) + jumpMps;
  const ride = state._ride;
  ride.v = Math.max(ride.v || 0, 0) + jumpMps;
  ride.airTime = 0;
  ride.y += 0.015 + 0.005;
  ride.grounded = false;
  state.grounded = false;
}

/** The player's road wheels as rendered: hull-local stations and travel (`off`, + up into the hull) per side. */
function pageRoadWheels(root) {
  let wheels = null;
  root.traverse((object) => {
    if (!wheels && typeof object.userData?.runningGearRoadWheels === 'function') {
      wheels = { L: object.userData.runningGearRoadWheels(-1), R: object.userData.runningGearRoadWheels(1), owner: object };
    }
  });
  return wheels;
}

const PAGE_HELPERS = [pageFindStage, pageResetVertical, pageJump, pageRoadWheels].map((fn) => fn.toString()).join('\n');

async function installHelpers(page) {
  await page.evaluate(`window.__strip = (() => { ${PAGE_HELPERS}
    return { pageFindStage, pageResetVertical, pageJump, pageRoadWheels }; })(); true`);
}

async function stageCase(page, stage) {
  return page.evaluate(async ({ stage }) => {
    const D = window.__DEBUG; const game = D.game; const world = D.world; const hf = world.heightField;
    const H = window.__strip;
    game.preBattleS = Infinity; // freeze the frame loop's battle stepping: every tick from here is a fastForward
    const canvas = document.querySelector('canvas');
    for (const el of document.body.querySelectorAll('*')) {
      if (el === canvas || el.contains(canvas) || el.tagName === 'SCRIPT' || el.id === 'strip-stamp') continue;
      el.style.visibility = 'hidden';
    }
    let n = 0;
    for (const t of game.tanks) {
      if (t === game.player || !t.state) continue;
      const x = 380 - (n % 4) * 25, z = -380 + Math.floor(n / 4) * 25; n++;
      t.state.pos.set(x, hf.getHeightAt(x, z), z);
      H.pageResetVertical(t.state, hf.getHeightAt(x, z), 0, true);
      t.state.speed = 0;
    }
    const p = game.player; const st = p.state;
    const y = hf.getHeightAt(stage.x, stage.z);
    st.pos.set(stage.x, y, stage.z); st.yaw = stage.yaw; st.speed = 0; st._prevSpeed = 0; st._spool = 0; st.yawRate = 0;
    st._spring.pitch = st._spring.roll = st._spring.pitchV = st._spring.rollV = 0;
    st.visualPitch = st.visualRoll = 0;
    H.pageResetVertical(st, y, 0, true);
    p.input.throttle = 0; p.input.steer = 0; p.input.brake = true;
    // the turret held straight ahead (a gun swinging after the camera's aim reads as motion the suspension did not make)
    st.turretYaw = 0; st.gunPitch = 0; p.input.aimLocked = true;
    D.fastForward(2); // settle on the stage
    // the rest gap of every road wheel's tyre bottom over the ground, the reference its contact is judged against
    const wheels = H.pageRoadWheels(p.visual.root);
    const V = p.visual.root.position.constructor;
    const restGap = { L: [], R: [] };
    if (wheels) {
      wheels.owner.updateWorldMatrix(true, false);
      for (const side of ['L', 'R']) {
        for (const w of wheels[side]) {
          const at = wheels.owner.localToWorld(new V(w.x, w.y + w.off - w.r, w.z));
          restGap[side].push(at.y - hf.getHeightAt(at.x, at.z));
        }
      }
    }
    window.__stripRestGap = restGap;
    // the contact floor the sim seats the hull on, against the running gear's own (a rest scan that finds a surface
    // under the tracks lowers the seat floor up to 12 cm, and the road wheels then droop that much at rest)
    const cg = p.contactGeom;
    const contact = cg ? { bottomYM: cg.bottomYM, gearBottomYM: cg.gearBottomYM ?? null, halfLenM: cg.halfLenM, zCenterM: cg.zCenterM } : null;
    return { y: st.pos.y, jump: p.modeJumpMps ?? null, gravity: p.modeGravityScale ?? 1, wheels: wheels ? wheels.L.length : 0, contact,
      restGapCm: { L: restGap.L.map((g) => Math.round(g * 100)), R: restGap.R.map((g) => Math.round(g * 100)) } };
  }, { stage });
}

/** Set the hull moving at the case's speed (after a stage). */
async function launchCase(page, caseDef) {
  if (!caseDef.speed) return;
  await page.evaluate((speed) => {
    const p = window.__DEBUG.game.player; const st = p.state;
    st.speed = speed === 'top' ? p.spec.topSpeedKmh / 3.6 * (p.modeSpeedMultiplier ?? 1) : speed;
    st._prevSpeed = st.speed; st._spool = 1;
  }, caseDef.speed);
}

/** Advance `ticks` fixed steps with the case's inputs; returns the anchors met on the way. */
async function advance(page, ticks, plan) {
  return page.evaluate(({ ticks, plan }) => {
    const D = window.__DEBUG; const p = D.game.player; const st = p.state; const H = window.__strip;
    let landedAt = -1, stoppedAt = -1;
    for (let i = 0; i < ticks; i++) {
      const tick = plan.tick + i;
      const braking = plan.brakeTick != null && tick >= plan.brakeTick;
      p.input.throttle = braking ? 0 : plan.throttle;
      p.input.brake = braking || plan.throttle === 0;
      p.input.steer = 0;
      p.input.aimLocked = true;
      if (plan.jumpTick === tick) H.pageJump(st, p.modeJumpMps);
      if (plan.dropTick === tick) H.pageResetVertical(st, st.pos.y + plan.drop, 0, false);
      const wasAirborne = !st.grounded;
      D.fastForward(1 / 60);
      if (landedAt < 0 && tick > (plan.jumpTick ?? plan.dropTick ?? -1) && st.landingImpactMps > 0 && wasAirborne) landedAt = tick;
      if (stoppedAt < 0 && braking && Math.abs(st.speed) < 0.05) stoppedAt = tick;
    }
    return { landedAt, stoppedAt };
  }, { ticks, plan });
}

/** Fix the camera for the case: the world pose a landing or a rest is watched from, or a ground-level follow. */
async function placeCamera(page, view, follow, fixed) {
  return page.evaluate(({ view, follow, fixed }) => {
    const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
    const hf = D.world.heightField;
    const at0 = fixed ?? { x: st.pos.x, z: st.pos.z, yaw: st.yaw };
    const fx = Math.sin(at0.yaw), fz = Math.cos(at0.yaw), rx = fz, rz = -fx;
    const x = follow ? st.pos.x : at0.x, z = follow ? st.pos.z : at0.z;
    const ground = hf.getHeightAt(x, z);
    let cam, at;
    if (view === 'quarter') {
      cam = [x + rx * 9.5 + fx * 5, ground + 2.4, z + rz * 9.5 + fz * 5];
      at = [x, ground + 1.4, z];
    } else {
      cam = [x + rx * 13 - fx * 1, ground + 1.7, z + rz * 13 - fz * 1];
      at = [x + fx * 0.5, ground + 1.1, z + fz * 0.5];
    }
    D.rig.setExternalPose(new V(...cam), new V(...at), 40);
    return { x: at0.x, z: at0.z, yaw: at0.yaw };
  }, { view, follow, fixed });
}

/** Read the sim state, the rendered hull and its wheels, burn the stamp, and return the frame's record. */
async function stampAndRead(page, stamp) {
  return page.evaluate(async (stamp) => {
    const D = window.__DEBUG; const p = D.game.player; const st = p.state; const hf = D.world.heightField;
    const H = window.__strip;
    // let the render loop present this tick (and the road wheels' conformance settle onto it)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // the renderer's visibility amplification of the sim's suspension rock (tankFactoryCore SUSP_VIS_P / _R, SWAY_VIS)
    const VIS = { p: 2.2, r: 1.9, sway: 2.4 };
    const flP = st._flinch?.p ?? 0, flR = st._flinch?.r ?? 0;
    const renderedPitch = st.visualPitch + (st._susp?.p ?? 0) * VIS.p - flP;
    const renderedRoll = st.visualRoll + (st._susp?.r ?? 0) * VIS.r + (st._swayEst ?? 0) * VIS.sway + flR;
    const root = p.visual.root;
    const render = { y: root.position.y, pitch: -root.rotation.x, roll: root.rotation.z };
    const ground = hf.getHeightAt(st.pos.x, st.pos.z);
    // the road wheels as rendered: travel (+ up into the hull, - droop) and contact (the tyre's bottom within 3 cm of
    // its rest gap over the ground under it)
    const wheels = H.pageRoadWheels(root);
    const V = root.position.constructor;
    const restGap = window.__stripRestGap ?? { L: [], R: [] };
    const sides = {};
    if (wheels) {
      wheels.owner.updateWorldMatrix(true, false);
      for (const side of ['L', 'R']) {
        const travelCm = [], gapCm = [];
        let contact = 0;
        wheels[side].forEach((w, i) => {
          const at = wheels.owner.localToWorld(new V(w.x, w.y + w.off - w.r, w.z));
          const gap = at.y - hf.getHeightAt(at.x, at.z) - (restGap[side][i] ?? 0);
          if (gap < 0.03) contact++;
          travelCm.push(Math.round(w.off * 100));
          gapCm.push(Math.round(gap * 100));
        });
        sides[side] = { contact, of: wheels[side].length, travelCm, gapCm };
      }
    }
    const record = {
      t: stamp.t, step: stamp.step, x: st.pos.x, y: st.pos.y, z: st.pos.z, ground, aboveGround: st.pos.y - ground,
      speed: st.speed, vy: st._ride.v, grounded: st.grounded, landing: st.landingImpactMps,
      pitch: st.visualPitch, roll: st.visualRoll, suspP: st._susp?.p ?? 0, suspR: st._susp?.r ?? 0,
      dive: st._susp?.d ?? null, rebound: st._ride?.rebound ?? null, rideY: st._ride.y, supportY: st._ride.supportY,
      renderedPitch, renderedRoll, render,
      renderError: { y: render.y - st.pos.y, pitch: render.pitch - renderedPitch, roll: render.roll - renderedRoll },
      wheels: sides,
    };
    let el = document.getElementById('strip-stamp');
    if (!el) {
      el = document.createElement('div');
      el.id = 'strip-stamp';
      Object.assign(el.style, {
        position: 'fixed', left: '8px', top: '8px', zIndex: 99999, padding: '6px 10px', background: 'rgba(0,0,0,0.66)',
        color: '#f4f4f4', font: '600 17px/1.32 ui-monospace, Menlo, monospace', whiteSpace: 'pre', borderRadius: '4px',
        visibility: 'visible', pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }
    const deg = (r) => `${r >= 0 ? '+' : ''}${(r * 180 / Math.PI).toFixed(1)}°`;
    const signed = (v, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
    const travel = (s) => s ? s.travelCm.map((v) => `${v >= 0 ? '+' : ''}${v}`).join(' ') : 'n/a';
    const contact = (s) => s ? `${s.contact}/${s.of}` : 'n/a';
    el.textContent = [
      `${stamp.caseId} ${stamp.tag} · ${stamp.build}`,
      `t ${signed(stamp.t, 3)} s  step ${stamp.step >= 0 ? '+' : ''}${stamp.step}  ${record.grounded ? 'GROUND' : 'AIR'}${record.landing > 0 ? `  TOUCHDOWN ${record.landing.toFixed(1)} m/s` : ''}`,
      `height ${record.aboveGround.toFixed(3)} m  vy ${signed(record.vy)} m/s  speed ${record.speed.toFixed(1)} m/s`,
      `pitch ${deg(renderedPitch)}  roll ${deg(renderedRoll)}  wheels on ground L ${contact(sides.L)} R ${contact(sides.R)}`,
      `wheel travel cm (+ up) L ${travel(sides.L)}`,
      `                       R ${travel(sides.R)}`,
    ].join('\n');
    el.style.visibility = 'visible';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return record;
  }, stamp);
}

function captureTicks(caseDef, anchors) {
  if (caseDef.kind === 'landing') return LANDING_STEPS.map((s) => ({ tick: anchors.landing + s, step: s, t: s / 60 }));
  if (caseDef.kind === 'stop') {
    return [
      ...STOP_STEPS.map((s) => ({ tick: anchors.brake + s, step: s, t: s / 60 })),
      ...STOPPED_STEPS.map((s) => ({ tick: anchors.stop + s, step: anchors.stop + s - anchors.brake, t: (anchors.stop + s - anchors.brake) / 60 })),
    ];
  }
  return caseDef.frames.map((sec) => ({ tick: Math.round(sec * 60), step: Math.round(sec * 60), t: sec }));
}

async function runCase(page, caseId, caseDef, options, build) {
  await installHelpers(page);
  const stage = await page.evaluate(`window.__strip.pageFindStage(window.__DEBUG.world, ${JSON.stringify(caseDef.find)})`);
  if (!stage) throw new Error(`${caseId}: no ${caseDef.find} stage found on ${caseDef.map}`);
  const startTick = 30;
  const plan = {
    tick: 0, throttle: caseDef.throttle ?? 0, drop: caseDef.drop ?? 0,
    jumpTick: caseDef.jump ? startTick : null, dropTick: caseDef.drop ? startTick : null,
    brakeTick: caseDef.brakeAtS != null ? Math.round(caseDef.brakeAtS * 60) : null,
  };
  // dry run: find the anchors (the touchdown, the stop) on the same deterministic stage
  const meta = await stageCase(page, stage);
  await launchCase(page, caseDef);
  const anchors = { landing: -1, brake: plan.brakeTick ?? 0, stop: -1 };
  if (caseDef.kind === 'landing' || caseDef.kind === 'stop') {
    const limit = 60 * 40;
    for (let tick = 0; tick < limit; tick += 30) {
      plan.tick = tick;
      const found = await advance(page, 30, plan);
      // (the step that lands, or stops, is shown after that many steps plus itself)
      if (caseDef.kind === 'landing' && found.landedAt >= 0) { anchors.landing = found.landedAt + 1; break; }
      if (caseDef.kind === 'stop' && found.stoppedAt >= 0) { anchors.stop = found.stoppedAt + 1; break; }
    }
    if (caseDef.kind === 'landing' && anchors.landing < 0) throw new Error(`${caseId}: no touchdown within 40 s`);
    if (caseDef.kind === 'stop' && anchors.stop < 0) throw new Error(`${caseId}: no stop within 40 s`);
    await stageCase(page, stage);
    await launchCase(page, caseDef);
  }
  const fixed = caseDef.kind === 'landing' || caseDef.kind === 'rest'
    ? await placeCamera(page, caseDef.view, false, null) : null;
  const frames = [];
  const met = { landing: -1, stop: -1 };
  let tick = 0;
  const targets = captureTicks(caseDef, anchors);
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    if (target.tick > tick) {
      plan.tick = tick;
      const found = await advance(page, target.tick - tick, plan);
      if (met.landing < 0 && found.landedAt >= 0) met.landing = found.landedAt + 1;
      if (met.stop < 0 && found.stoppedAt >= 0) met.stop = found.stoppedAt + 1;
      tick = target.tick;
    }
    if (!fixed) await placeCamera(page, caseDef.view, true, null);
    else await placeCamera(page, caseDef.view, false, fixed);
    await sleep(250);
    const record = await stampAndRead(page, { caseId, tag: options.tag, build, t: target.t, step: target.step });
    const file = `${caseId}-${options.tag}-${String(index).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(options.out, file) });
    frames.push({ file, tick: target.tick, step: target.step, tRelS: +target.t.toFixed(3), ...roundAll(record) });
  }
  // the capture run must meet the dry run's anchor on the same tick (determinism), and exercise its case
  const anchorMismatch = (caseDef.kind === 'landing' && met.landing !== anchors.landing)
    || (caseDef.kind === 'stop' && met.stop !== anchors.stop);
  if (anchorMismatch) throw new Error(`${caseId}: capture run anchors ${JSON.stringify(met)} differ from the dry run's ${JSON.stringify(anchors)}`);
  if (caseDef.kind === 'drive' && frames.some((f) => Math.abs(f.speed) < 0.5 * caseDef.speed)) {
    throw new Error(`${caseId}: the hull did not hold its run (speeds ${frames.map((f) => f.speed.toFixed(1)).join(', ')})`);
  }
  const worstRender = frames.reduce((w, f) => Math.max(w, Math.abs(f.renderError?.y ?? 0),
    Math.abs(f.renderError?.pitch ?? 0), Math.abs(f.renderError?.roll ?? 0)), 0);
  const record = { caseId, map: caseDef.map, mode: caseDef.mode, gravity: caseDef.gravity ?? null, build, stage, anchors, meta,
    renderCheck: { worst: +worstRender.toFixed(4), ok: worstRender < 0.01 }, frames };
  writeFileSync(path.join(options.out, `${caseId}-${options.tag}.json`), `${JSON.stringify(record, null, 1)}\n`);
  return record;
}

function roundAll(value) {
  if (typeof value === 'number') return +value.toFixed(4);
  if (Array.isArray(value)) return value.map(roundAll);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundAll(v)]));
  return value;
}

async function runStripProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const build = buildLabel(options);
  const cases = {};
  let ok = true;
  const session = options.dist
    ? (run) => withDistProbeSession({ root: options.root, dist: options.dist, launch: VIEWPORT }, run)
    : (run) => withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: VIEWPORT }, run);
  await session(async ({ browser, port }) => {
    for (const caseId of options.caseIds) {
      const caseDef = STRIP_CASES[caseId];
      let page = null, errors = [];
      try {
        // the arrangement is read at battle setup (game/teamArrangement.ts): one hostile, no allies, the gravity world
        const arrangement = JSON.stringify(arrangementFor(caseDef));
        ({ page, errors } = await openGamePage(browser, { port, viewport: VIEWPORT }));
        await page.evaluate((value) => { localStorage.setItem('cot.game.teams.v1', value); }, arrangement);
        await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); },
          { specId: options.spec, mapId: caseDef.map, gameMode: caseDef.mode });
        await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 300000, polling: 250 });
        await sleep(1500);
        cases[caseId] = await runCase(page, caseId, caseDef, options, build);
        const rc = cases[caseId].renderCheck;
        console.log(`[${TOOL}] ${caseId}: ${cases[caseId].frames.length} frames, render check ${rc.ok ? 'ok' : 'MISMATCH'} (worst ${rc.worst})`);
        if (!rc.ok) ok = false;
      } catch (error) {
        ok = false;
        cases[caseId] = { failed: String(error?.message || error), pageErrors: errors };
        console.error(`[${TOOL}] ${caseId} FAILED: ${String(error?.stack || error).slice(0, 500)}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  });
  const receipt = writeProbeReceipt(options, { ok, build, viewport: VIEWPORT, cases });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, cases };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseStripArgs, run: runStripProbe });
