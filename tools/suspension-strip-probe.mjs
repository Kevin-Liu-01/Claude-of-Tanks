#!/usr/bin/env node
// Suspension strip probe (PR #9 physics lane, 2026-10-03; owner: "maintaining perfect beautiful suspension", then "use
// the gauntlet loop for all visual verification ... especially in comparison to world of tanks and war thunder and
// realistic"). Frame strips of the player hull in a real solo battle — the real map, lighting, tank visual, running
// gear and physics — for the visual gauntlet's critics: rough ground at speed, a hard stop, a landing in every gravity
// world, level drops onto flat ground, a rest on a slope and across one.
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
 * The cases. `map`/`mode`/`gravity` pick the battle and `spec` its hull (the --spec option's otherwise); `find` the
 * stage (searched on the live height field, clear of obstacles); `kind` how the capture window is anchored: `landing`
 * (touchdown), `stop` (brake and stop), `drive` (steady travel), `rest`.
 */
export const STRIP_CASES = Object.freeze({
  rough: { map: 'badlands', mode: 'standard', find: 'rough', kind: 'drive', speed: 11, throttle: 1, view: 'side',
    frames: [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8] },
  hardstop: { map: 'steppe', mode: 'standard', find: 'flat', kind: 'stop', speed: 'top', throttle: 1, brakeAtS: 1.0, view: 'side' },
  slope: { map: 'alpine', mode: 'standard', find: 'slope', kind: 'rest', speed: 0, throttle: 0, view: 'side', frames: [0.5, 2, 4] },
  // round 3 (gauntlet wave 23: "the 'uneven ground' landing is flat"): the Earth drop lands on an uneven patch
  'land-earth': { map: 'mars', mode: 'standard', find: 'uneven', kind: 'landing', drop: 3, view: 'quarter' },
  'land-gearth': { map: 'mars', mode: 'mars', gravity: 'earth', find: 'flat', kind: 'landing', jump: true, view: 'quarter' },
  'land-mars': { map: 'mars', mode: 'mars', gravity: 'mars', find: 'flat', kind: 'landing', jump: true, stretch: 2, view: 'quarter' },
  // round 4 (wave 33, the Moon strips: "reach the ground fastest and stop almost dead, no float"): the Moon's 12.5 m/s
  // rocket jump is its hardest landing, so a 3 m drop beside it lands at 3.2 m/s; at a sixth of a g a landing's settle
  // runs on a sixth of the speed, so the Moon's frames after touchdown run four times as long (Mars's twice: its capped
  // hop lands again at 0.7 s)
  'land-moon': { map: 'mars', mode: 'mars', gravity: 'moon', find: 'flat', kind: 'landing', jump: true, stretch: 4, view: 'quarter' },
  'land-moon-drop': { map: 'mars', mode: 'mars', gravity: 'moon', find: 'flat', kind: 'landing', drop: 3, stretch: 4,
    view: 'quarter' },
  // round 4 (wave 33: "landings are pure vertical drops: hull pitch and roll never move, even when one side touches
  // first"): every landing above fell in the attitude it had settled in on that ground; here a level hull falls 3 m onto
  // a 9-10 degree cross slope, so one track lands first and the landing turns the hull onto the slope
  // round 5 (wave 38: "after the side-slope landing the hull still leans on the uphill track"): that stage's cross slope
  // twisted under the hull, so the stage search now holds it even (pageFindStage), and the frames after touchdown run
  // twice as long, to the settled lean onto the downhill track
  'land-cross': { map: 'badlands', mode: 'standard', find: 'cross', kind: 'landing', drop: 3, level: true, stretch: 2,
    view: 'quarter' },
  // round 5: parked across a 15-20-degree slope, the hull leans onto its downhill track (watched from ahead)
  'rest-cross': { map: 'badlands', mode: 'standard', find: 'cross-steep', kind: 'rest', speed: 0, throttle: 0, view: 'front',
    frames: [0.5, 2, 4] },
  // round 5 (wave 38: "flat landings are perfectly level pistons"): a level 2 m drop onto flat ground nods the hull about
  // its centre of mass, a rear-engined T-90M tail down and a front-engined Merkava 4 nose down, and rocks it back; the
  // frames after touchdown run twice as long, through the rock back
  'land-flat': { map: 'mars', mode: 'standard', find: 'flat', kind: 'landing', drop: 2, stretch: 2, view: 'side' },
  'land-flat-fwd': { map: 'mars', mode: 'standard', spec: 'merkava4b', find: 'flat', kind: 'landing', drop: 2, stretch: 2,
    view: 'side' },
  // round 4 (wave 33: "peak compression barely scales with impact"): a 1 m drop (3.9 m/s) beside the 3 m one (7.3 m/s)
  'land-1m': { map: 'mars', mode: 'standard', find: 'flat', kind: 'landing', drop: 1, view: 'quarter' },
  // round 3 (wave 23: "the turbo landings read 0.0 m/s forward speed"): Turbo Ball jumps at speed, a running jump. Its
  // flight carries it some 160 m, so the stage search grades the landing zone too (landingZone), and the case runs on
  // Kestrel Airfield's runway: Olympus Basin has no flat zone that far from a flat stage (wave 33's frames came down on
  // a 27-degree upslope there)
  'land-turbo': { map: 'airfield', mode: 'turbo_ball', find: 'flat', kind: 'landing', jump: true, speed: 'top', throttle: 1,
    view: 'quarter' },
  // round 7 (the trench ruling, 2026-10-04): a field trench and a Frontline Assault sector line crossed at 11 m/s, and the
  // assault line under the E100 X at 6 m/s (the matrix case that was thrown 38 degrees nose-up off its far wall), the
  // throttle held at the run's speed. The camera stands in the trench 14 m along it, its eye a little over the lips, so
  // the hull crosses the trench's own profile; the frames are anchored on the root crossing the trench's centre line.
  // (The matrix's drive-trench, a 2 m box ditch with sheer walls, has no counterpart on any map.)
  'trench-field': { map: 'badlands', mode: 'standard', find: 'trench-field', kind: 'cross', speed: 11, cruise: true,
    view: 'trench' },
  'trench-assault': { map: 'badlands', mode: 'frontline_assault', find: 'trench-assault', kind: 'cross', speed: 11, cruise: true,
    view: 'trench' },
  'trench-assault-heavy': { map: 'badlands', mode: 'frontline_assault', spec: 'jpz_e100_x', find: 'trench-assault', kind: 'cross',
    speed: 6, cruise: true, stretch: 2, view: 'trench' },
  // round 8 (the track-contact parity hand-over, 2026-10-04): the same crossings watched from 24 m, the eye 1.6 m over the
  // lips, so a hull at 11 m/s stays in frame through the run (the coordinator: "pull the camera back"); a hull driven off
  // a flat roof's edge at 4 m/s (the hull resting on its body past its tracks, tipping off, the fall and the landing);
  // and the foot of the steepest drivable descent clear of works on Alpine (a 37-degree face, 5.4 m over 7 m; Badlands
  // has none clear) taken at 12 m/s, the nose's strike on the runout
  'trench-field-wide': { map: 'badlands', mode: 'standard', find: 'trench-field', kind: 'cross', speed: 11, cruise: true,
    view: 'trench-wide' },
  'trench-assault-wide': { map: 'badlands', mode: 'frontline_assault', find: 'trench-assault', kind: 'cross', speed: 11,
    cruise: true, view: 'trench-wide' },
  'trench-assault-heavy-wide': { map: 'badlands', mode: 'frontline_assault', spec: 'jpz_e100_x', find: 'trench-assault',
    kind: 'cross', speed: 6, cruise: true, stretch: 2, view: 'trench-wide' },
  'roof-drive-off': { map: 'urban', mode: 'standard', find: 'roof-edge', kind: 'cross', speed: 4, cruise: true, stretch: 2,
    view: 'roof' },
  'flank-foot': { map: 'alpine', mode: 'standard', find: 'flank-foot', kind: 'cross', speed: 12, cruise: true,
    view: 'foot' },
});

/** Step offsets (sim ticks) captured around a landing's touchdown and around a hard stop. */
export const LANDING_STEPS = Object.freeze([-10, -1, 0, 1, 2, 4, 8, 16, 32]);
/** Step offsets around a trench crossing's anchor (the root over the trench's centre line), at 11 m/s. */
export const CROSS_STEPS = Object.freeze([-45, -30, -18, -9, 0, 9, 18, 27, 36, 48, 66, 90]);
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
// world (its height field and obstacles). `landing` ({ fromM, toM }, along the heading) is a landing zone a running
// jump's flight carries the hull to, graded as flat ground too (round 3, gauntlet wave 33: Turbo Ball's 33 m/s jump
// flew 150 m past its flat stage and came down on a 27-degree upslope, on its track fronts 2.3 m over the ground under
// its root, and the frames read as a tank floating).
function pageFindStage(world, kind, landing) {
  const hf = world.heightField;
  const h = (x, z) => hf.getHeightAt(x, z);
  const wet = (x, z) => (hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0) > 0.02;
  const obstacles = typeof world.getObstacles === 'function' ? world.getObstacles() : [];
  const blocked = (x, z, margin) => obstacles.some((o) => !o.crushed
    && x > o.min[0] - margin && x < o.max[0] + margin && z > o.min[2] - margin && z < o.max[2] + margin);
  if (kind === 'trench-field' || kind === 'trench-assault') {
    // round 7: a straight run across one of the battle's own trench lines (terrain.ts fieldTrenchLines /
    // assaultTrenchLines; the cross-section runs along the line's axis) where it is full depth (an assault line clear
    // of the communication trench along its axis), the run in and out dry and clear, the run-in even
    const plan = kind === 'trench-field' ? hf.fieldTrenchLines : hf.assaultTrenchLines;
    // the works along a trench line (wire, sandbags, hedgehogs) are crushable and line its lips: a crossing goes through
    // them as a tank does; anything that is not crushable keeps a 4 m berth
    const hard = (x, z) => obstacles.some((o) => !o.crushed && !o.crushable
      && x > o.min[0] - 4 && x < o.max[0] + 4 && z > o.min[2] - 4 && z < o.max[2] + 4);
    const profile = plan?.profile ?? { floorHalfWidthM: 2.3, wallRunM: 1.7, depthM: 1.55 };
    const half = profile.floorHalfWidthM + profile.wallRunM;
    const approach = 20;
    let bestTrench = null, relaxedTrench = null;
    for (const line of plan?.lines ?? []) {
      for (const dir of [1, -1]) {
        for (const along of kind === 'trench-field' ? [-12, -6, 0, 6, 12] : [-36, -28, -20, -12, 12, 20, 28, 36]) {
          const cx = line.x + line.lx * along, cz = line.z + line.lz * along;
          const fx = line.ax * dir, fz = line.az * dir;
          let ok = true, maxGrade = 0, maxSide = 0, prev = null;
          for (let s = -approach - 4; s <= half + 14; s += 1) {
            const x = cx + fx * s, z = cz + fz * s;
            if (wet(x, z) || hard(x, z)) { ok = false; break; }
            // the run-in is even; past the trench its own banks and spoil stand, and the run-out only has to be clear
            if (s >= -(half + 6)) { prev = null; continue; }
            const y = h(x, z);
            if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(y - prev));
            maxSide = Math.max(maxSide, Math.abs(h(x + fz * 2, z - fx * 2) - h(x - fz * 2, z + fx * 2)) / 4);
            prev = y;
          }
          if (!ok) continue;
          const lip = (h(cx - fx * (half + 1), cz - fz * (half + 1)) + h(cx + fx * (half + 1), cz + fz * (half + 1))) / 2;
          const depth = lip - h(cx, cz);
          const score = -maxGrade * 10 - maxSide * 10 - Math.abs(depth - profile.depthM) * 5 - Math.abs(along) * 0.01;
          const candidate = { x: cx - fx * approach, z: cz - fz * approach, yaw: Math.atan2(fx, fz), score: +score.toFixed(4),
            maxGrade: +maxGrade.toFixed(3), maxSide: +maxSide.toFixed(3),
            trench: { x: cx, z: cz, ax: fx, az: fz, lx: line.lx, lz: line.lz, halfM: half, lipY: +lip.toFixed(3),
              depthM: +depth.toFixed(3) } };
          // a run-in that is not even is kept as a fallback (recorded as relaxed), never preferred
          if (maxGrade > 0.15 || maxSide > 0.1) {
            if (!relaxedTrench || score > relaxedTrench.score) relaxedTrench = { ...candidate, relaxed: true };
            continue;
          }
          if (!bestTrench || score > bestTrench.score) bestTrench = candidate;
        }
      }
    }
    return bestTrench ?? relaxedTrench;
  }
  if (kind === 'roof-edge') {
    // round 8: a flat roof 3-7 m over the ground (an axis-aligned box record, or one convex polygon), the hull staged on
    // it 5 m in from an edge at least 8 m long and driven off it, the roof at least 10 m deep behind that edge, the
    // street past it dry, even and clear of anything solid for 20 m
    let bestRoof = null;
    for (const o of obstacles) {
      if (o.crushed || o.crushable || o.dead) continue;
      const shape = o.shape2;
      let ring = null;
      if (!shape) ring = [o.min[0], o.min[2], o.max[0], o.min[2], o.max[0], o.max[2], o.min[0], o.max[2]];
      else if (shape.kind === 'convex' && Array.isArray(shape.points)) ring = shape.points;
      if (!ring || ring.length < 6) continue;
      const n = ring.length / 2;
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += ring[2 * i]; cz += ring[2 * i + 1]; }
      cx /= n; cz /= n;
      // a point inside the convex ring (the same side of every edge as its centroid)
      const inside = (x, z) => {
        for (let i = 0; i < n; i++) {
          const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[(2 * i + 2) % ring.length], bz = ring[(2 * i + 3) % ring.length];
          const side = (bx - ax) * (z - az) - (bz - az) * (x - ax);
          const ref = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
          if (side * ref < 0) return false;
        }
        return true;
      };
      const top = o.max[1];
      for (let i = 0; i < n; i++) {
        const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[(2 * i + 2) % ring.length], bz = ring[(2 * i + 3) % ring.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 8) continue;
        const ex = (ax + bx) / 2, ez = (az + bz) / 2;
        let nx = (bz - az) / len, nz = -(bx - ax) / len;
        if (nx * (ex - cx) + nz * (ez - cz) < 0) { nx = -nx; nz = -nz; }
        if (!inside(ex - nx * 10, ez - nz * 10)) continue;
        const street = h(ex + nx * 3, ez + nz * 3);
        const height = top - street;
        if (height < 3 || height > 7) continue;
        let ok = true, maxGrade = 0, prev = null;
        for (let step = 1; step <= 20 && ok; step++) {
          for (const side of [-4, 0, 4]) {
            const x = ex + nx * step - nz * side, z = ez + nz * step + nx * side;
            if (wet(x, z) || obstacles.some((q) => q !== o && !q.crushed && !q.crushable
              && x > q.min[0] - 3 && x < q.max[0] + 3 && z > q.min[2] - 3 && z < q.max[2] + 3)) { ok = false; break; }
          }
          const y = h(ex + nx * step, ez + nz * step);
          if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(y - prev));
          prev = y;
        }
        // nothing else stands on the roof's run-in
        for (let step = 0; step <= 10 && ok; step++) {
          const x = ex - nx * step, z = ez - nz * step;
          if (obstacles.some((q) => q !== o && !q.crushed && q.max[1] > top + 0.2
            && x > q.min[0] - 2 && x < q.max[0] + 2 && z > q.min[2] - 2 && z < q.max[2] + 2)) ok = false;
        }
        if (!ok || maxGrade > 0.15) continue;
        const score = -Math.abs(height - 4.5) - maxGrade * 10 + Math.min(len, 16) * 0.1;
        if (!bestRoof || score > bestRoof.score) {
          bestRoof = { x: ex - nx * 5, z: ez - nz * 5, y: top, yaw: Math.atan2(nx, nz), score: +score.toFixed(4),
            maxGrade: +maxGrade.toFixed(3), roof: { heightM: +height.toFixed(2), top: +top.toFixed(2), edgeM: +len.toFixed(1) },
            trench: { x: ex, z: ez, ax: nx, az: nz, lx: -nz, lz: nx, halfM: 0, lipY: +top.toFixed(3), depthM: +height.toFixed(3) } };
        }
      }
    }
    return bestRoof;
  }
  if (kind === 'flank-foot') {
    // round 8: the steepest drivable descent on the map (20-45 degrees over 5 m or more) with an even runout at its
    // foot, dry and clear, its run-in at the top even for 12 m: the hull takes it at speed and its nose meets the runout
    let bestFoot = null;
    const steepMin = Math.tan(20 * Math.PI / 180), steepMax = Math.tan(45 * Math.PI / 180);
    for (let gx = -280; gx <= 280; gx += 6) {
      for (let gz = -280; gz <= 280; gz += 6) {
        for (let k = 0; k < 16; k++) {
          const yaw = (k * 2 * Math.PI) / 16;
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          // the face: from (gx, gz) down along the heading, each metre falling between the grades
          let run = 0, drop = 0;
          for (let step = 1; step <= 20; step++) {
            const fall = h(gx + fx * (step - 1), gz + fz * (step - 1)) - h(gx + fx * step, gz + fz * step);
            if (fall < steepMin || fall > steepMax) break;
            run = step; drop += fall;
          }
          if (run < 5) continue;
          const footX = gx + fx * run, footZ = gz + fz * run;
          let ok = true, maxGrade = 0, maxSide = 0, prev = null;
          for (let step = -12; step <= run + 20 && ok; step++) {
            const x = gx + fx * step, z = gz + fz * step;
            if (wet(x, z) || blocked(x, z, 4)) { ok = false; break; }
            maxSide = Math.max(maxSide, Math.abs(h(x + fz * 2, z - fx * 2) - h(x - fz * 2, z + fx * 2)) / 4);
            if (step >= 0 && step <= run) { prev = null; continue; }
            const y = h(x, z);
            if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(y - prev));
            prev = y;
          }
          if (!ok || maxGrade > 0.15 || maxSide > 0.15) continue;
          const score = (drop / run) * 10 + Math.min(run, 12) * 0.1 - maxSide * 10 - maxGrade * 5;
          if (!bestFoot || score > bestFoot.score) {
            const foot = h(footX, footZ);
            bestFoot = { x: gx - fx * 12, z: gz - fz * 12, yaw, score: +score.toFixed(4), maxGrade: +maxGrade.toFixed(3),
              face: { runM: run, dropM: +drop.toFixed(2), gradeDeg: +(Math.atan(drop / run) * 57.2958).toFixed(1) },
              trench: { x: footX, z: footZ, ax: fx, az: fz, lx: fz, lz: -fx, halfM: 0, lipY: +foot.toFixed(3), depthM: 0 } };
          }
        }
      }
    }
    return bestFoot;
  }
  const crossKind = kind === 'cross' || kind === 'cross-steep';
  let best = null;
  // round 7: the slope stage is searched on a finer grid and heading set (a fall line with no cross slope is rare)
  const gridStep = kind === 'slope' ? 10 : 20, headings = kind === 'slope' ? 16 : 8;
  for (let gx = -280; gx <= 280; gx += gridStep) {
    for (let gz = -280; gz <= 280; gz += gridStep) {
      for (let k = 0; k < headings; k++) {
        const yaw = (k * 2 * Math.PI) / headings;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const len = kind === 'rough' ? 40 : kind === 'flat' ? 70 : kind === 'uneven' || crossKind ? 12 : 10;
        let ok = true, rough = 0, maxGrade = 0, maxSide = 0, prev = null, prev2 = null, wetAny = false;
        for (let s = -6; s <= len; s += 1) {
          const x = gx + fx * s, z = gz + fz * s;
          const y = h(x, z);
          if (wet(x, z)) wetAny = true;
          if (blocked(x, z, 6)) { ok = false; break; }
          if (prev !== null) maxGrade = Math.max(maxGrade, Math.abs(y - prev));
          if (prev2 !== null) rough += Math.abs(y - 2 * prev + prev2);
          // the cross slope along the whole line (round 3: the rough strip's stage crossed a 14-degree side slope its
          // start did not show, and the roll read as the suspension's)
          maxSide = Math.max(maxSide, Math.abs(h(x + fz * 2, z - fx * 2) - h(x - fz * 2, z + fx * 2)) / 4);
          prev2 = prev; prev = y;
        }
        if (!ok || wetAny) continue;
        if (landing) {
          // the landing zone: flat, dry, clear and well inside the border; the flight over the ground between is free
          let lprev = null, lGrade = 0, lSide = 0, lOk = true;
          for (let s = landing.fromM; s <= landing.toM; s += 1) {
            const x = gx + fx * s, z = gz + fz * s;
            if (Math.max(Math.abs(x), Math.abs(z)) > 430 || wet(x, z) || blocked(x, z, 6)) { lOk = false; break; }
            const y = h(x, z);
            if (lprev !== null) lGrade = Math.max(lGrade, Math.abs(y - lprev));
            lSide = Math.max(lSide, Math.abs(h(x + fz * 2, z - fx * 2) - h(x - fz * 2, z + fx * 2)) / 4);
            lprev = y;
          }
          if (!lOk || lGrade > 0.06 || lSide > 0.05) continue;
        }
        const side = Math.abs(h(gx + fz * 2, gz - fx * 2) - h(gx - fz * 2, gz + fx * 2)) / 4;
        let score;
        if (kind === 'rough') { if (maxGrade > 0.3 || maxSide > 0.12) continue; score = rough; }
        else if (kind === 'uneven') {
          // a landing patch with bumps under the tracks and no slope to slide on
          if (maxGrade > 0.2 || maxSide > 0.1 || rough < 0.25) continue;
          score = -Math.abs(rough - 0.5) - maxSide;
        }
        else if (kind === 'flat') { if (maxGrade > 0.06 || side > 0.05) continue; score = -rough - maxGrade * 10; }
        else if (crossKind) {
          // round 4: a cross slope of about 10 degrees, even along the heading, so a level hull lands on one track first.
          // Round 5: even under the hull too, within about a degree from 4 m behind it to 9 m ahead (wave 38's stage
          // twisted 3 degrees over that, and the twist read as a lean the wrong way); 'cross-steep' is a 15-20-degree one
          // to park across
          const sides = [-4, -2, 0, 2, 4, 6, 9].map((s) => (h(gx + fx * s + fz * 2, gz + fz * s - fx * 2)
            - h(gx + fx * s - fz * 2, gz + fz * s + fx * 2)) / 4);
          const minSide = Math.min(...sides.map(Math.abs));
          const twist = Math.max(...sides) - Math.min(...sides);
          const [low, high, target] = kind === 'cross' ? [0.14, 0.22, 0.175] : [0.26, 0.38, 0.31];
          if (maxGrade > 0.08 || minSide < low || maxSide > high || twist > 0.021 || rough > 0.3) continue;
          score = -Math.abs(Math.atan(side) - target) * 10 - twist * 20 - rough - maxGrade;
        }
        else {
          // round 7 (wave 42: "1.3 degrees of roll pointed straight up the 18-degree slope"): the stage's own cross
          // slope ran 0.4-1.9 degrees under the hull; a hull parked up the fall line has the cross slope held within
          // 0.7 degree along its whole line
          const grade = (h(gx + fx * 4, gz + fz * 4) - h(gx - fx * 4, gz - fz * 4)) / 8;
          if (maxSide > 0.013 || rough > 0.6 || Math.abs(Math.atan(grade) - 0.31) > 0.05) continue;
          score = -Math.abs(Math.atan(grade) - 0.31) * 10 - rough - maxSide * 20;
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

/** A hull falling level whatever it stood on (round 4's cross-slope drop): its attitude and its turn rates zeroed. */
function pageLevel(state) {
  const spring = state._spring;
  spring.pitch = spring.roll = spring.pitchV = spring.rollV = 0;
  state.visualPitch = state.visualRoll = 0;
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

/** The player's road wheels as rendered: hull-local stations and travel (`off`, + up into the hull) per side. L and R
 * are the tank's own left and right (round 7; wave 42: "R is the tank's left in the side views"): the running gear's
 * side +1 sits at hull-local +x, which for a hull facing +z in this right-handed, y-up world is its left. */
function pageRoadWheels(root) {
  let wheels = null;
  root.traverse((object) => {
    if (!wheels && typeof object.userData?.runningGearRoadWheels === 'function') {
      wheels = { L: object.userData.runningGearRoadWheels(1), R: object.userData.runningGearRoadWheels(-1), owner: object };
    }
  });
  return wheels;
}

/** A road wheel's tyre bottom over the ground under its footprint (round 7; wave 42, "GROUND TOUCHDOWN with 0 of 6
 * wheels"): the least gap over the centre, the rim edges across the axle and half a radius fore and aft, as the
 * renderer rests a wheel on the highest ground under it. Read at the centre alone, a level tyre touching a 9-degree
 * cross slope with its uphill rim read 5 cm clear. */
function pageWheelGap(owner, w, hf, V) {
  let gap = Infinity;
  for (const [dx, dz] of [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.55 * w.r], [0, -0.55 * w.r]]) {
    const at = owner.localToWorld(new V(w.x + dx, w.y + w.off - w.r, w.z + dz));
    gap = Math.min(gap, at.y - hf.getHeightAt(at.x, at.z));
  }
  return gap;
}

const PAGE_HELPERS = [pageFindStage, pageResetVertical, pageLevel, pageJump, pageRoadWheels, pageWheelGap]
  .map((fn) => fn.toString()).join('\n');

async function installHelpers(page) {
  await page.evaluate(`window.__strip = (() => { ${PAGE_HELPERS}
    return { pageFindStage, pageResetVertical, pageLevel, pageJump, pageRoadWheels, pageWheelGap }; })(); true`);
}

async function stageCase(page, stage) {
  return page.evaluate(async ({ stage }) => {
    const D = window.__DEBUG; const game = D.game; const world = D.world; const hf = world.heightField;
    const H = window.__strip;
    game.preBattleS = Infinity; // freeze the frame loop's battle stepping: every tick from here is a fastForward
    // the mode's objective markers stay out of the strips (round 3: a Turbo Ball goal column hid the rear third of the
    // tank in every turbo frame)
    D.scene?.getObjectByName?.('match-mode-objectives')?.removeFromParent?.();
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
    const y = Number.isFinite(stage.y) ? stage.y : hf.getHeightAt(stage.x, stage.z);
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
        for (const w of wheels[side]) restGap[side].push(H.pageWheelGap(wheels.owner, w, hf, V));
      }
    }
    window.__stripRestGap = restGap;
    // the contact floor the sim seats the hull on, against the running gear's own (a rest scan that finds a surface
    // under the tracks lowers the seat floor up to 12 cm, and the road wheels then droop that much at rest)
    const cg = p.contactGeom;
    const visualCg = p.visual.contactGeom ?? null;
    const contact = cg ? { bottomYM: cg.bottomYM, gearBottomYM: visualCg?.gearBottomYM ?? cg.gearBottomYM ?? null,
      halfLenM: cg.halfLenM, zCenterM: cg.zCenterM } : null;
    // what renders under the running gear's own bottom line (round 3: in the browser build the contact floor sat 12 cm
    // under the gear line, the hull rode that much high and its road wheels hung 14 cm at rest): every visible,
    // colour-writing part whose lowest point lies more than 2.5 cm under the gear line, as the rest-contact scan reads it.
    // Like the scan (vehicles/restPoseContact.ts), a BatchedMesh is read as its packed geometry without its instance
    // matrices (flagged `batched`): the end wheels' batch on batchStatic builds reads its wheels' radius under the hull
    // origin, 33-37 cm under the gear line, and that is what pulls the floor down to the scan's 12 cm cap.
    const gearLine = Number.isFinite(visualCg?.gearBottomYM) ? visualCg.gearBottomYM : 0;
    const root = p.visual.root;
    root.updateWorldMatrix(true, true);
    const M4 = root.matrixWorld.constructor;
    const toRoot = new M4().copy(root.matrixWorld).invert();
    const m = new M4(), mi = new M4(), v = new V();
    const lowParts = [];
    root.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.geometry?.attributes?.position) return;
      for (let q = o; q && q !== root.parent; q = q.parent) if (q.visible === false) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((mt) => mt && mt.colorWrite !== false)) return;
      const pos = o.geometry.attributes.position;
      const count = o.isInstancedMesh ? o.count : 1;
      const stride = Math.max(1, Math.floor(pos.count / 300));
      let low = Infinity;
      for (let k = 0; k < count; k++) {
        m.copy(o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m.multiply(mi); }
        m.premultiply(toRoot);
        for (let i = 0; i < pos.count; i += stride) { v.fromBufferAttribute(pos, i).applyMatrix4(m); if (v.y < low) low = v.y; }
      }
      if (low < gearLine - 0.025) {
        lowParts.push({ name: o.name || '', type: o.type, parent: o.parent?.name || '', grand: o.parent?.parent?.name || '',
          instances: count, batched: o.isBatchedMesh === true, lowCm: Math.round((low - gearLine) * 100) });
      }
    });
    lowParts.sort((a, b) => a.lowCm - b.lowCm);
    return { y: st.pos.y, jump: p.modeJumpMps ?? null, gravity: p.modeGravityScale ?? 1, wheels: wheels ? wheels.L.length : 0, contact,
      visualContact: visualCg ? { bottomYM: visualCg.bottomYM, gearBottomYM: visualCg.gearBottomYM ?? null, panYM: visualCg.panYM ?? null } : null,
      lowParts: lowParts.slice(0, 12),
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
    let landedAt = -1, stoppedAt = -1, landedPos = null, crossedAt = -1;
    for (let i = 0; i < ticks; i++) {
      const tick = plan.tick + i;
      const braking = plan.brakeTick != null && tick >= plan.brakeTick;
      p.input.throttle = braking ? 0 : plan.throttle;
      p.input.brake = braking || plan.throttle === 0;
      p.input.steer = 0;
      p.input.aimLocked = true;
      if (plan.jumpTick === tick) H.pageJump(st, p.modeJumpMps);
      if (plan.dropTick === tick) {
        H.pageResetVertical(st, st.pos.y + plan.drop, 0, false);
        if (plan.level) H.pageLevel(st);
      }
      const wasAirborne = !st.grounded;
      D.fastForward(1 / 60);
      if (landedAt < 0 && tick > (plan.jumpTick ?? plan.dropTick ?? -1) && st.landingImpactMps > 0 && wasAirborne) {
        landedAt = tick;
        landedPos = { x: st.pos.x, z: st.pos.z, yaw: st.yaw };
      }
      if (stoppedAt < 0 && braking && Math.abs(st.speed) < 0.05) stoppedAt = tick;
      if (crossedAt < 0 && plan.trench && (st.pos.x - plan.trench.x) * plan.trench.ax + (st.pos.z - plan.trench.z) * plan.trench.az >= 0) {
        crossedAt = tick;
      }
    }
    return { landedAt, stoppedAt, landedPos, crossedAt };
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
    if (view === 'trench') {
      // round 7: in the trench, 14 m along it from the crossing, the eye a little over the lips (the fixed pose's lipY)
      const lip = fixed?.lipY ?? ground;
      cam = [x + rx * 14, lip + 0.9, z + rz * 14];
      at = [x, lip - 0.2, z];
    } else if (view === 'trench-wide') {
      // round 8: 24 m along it, the eye 1.6 m over the lips, so a hull at speed stays in frame through the run
      const lip = fixed?.lipY ?? ground;
      cam = [x + rx * 24, lip + 1.6, z + rz * 24];
      at = [x, lip, z];
    } else if (view === 'foot') {
      // round 8: beside a descent's foot on its lower side, 20 m off and 4 m out on the runout, the eye 2.5 m over the
      // higher of the foot and the ground under the camera, looking back at the foot (the fixed pose's lipY)
      const foot = fixed?.lipY ?? ground;
      const lower = hf.getHeightAt(x - rx * 20, z - rz * 20) < hf.getHeightAt(x + rx * 20, z + rz * 20) ? -1 : 1;
      const cx = x + lower * rx * 20 + fx * 4, cz = z + lower * rz * 20 + fz * 4;
      cam = [cx, Math.max(foot, hf.getHeightAt(cx, cz)) + 2.5, cz];
      at = [x - fx * 2, foot + 1, z - fz * 2];
    } else if (view === 'roof') {
      // round 8: from the street 10 m past the roof's edge and 14 m to its side, the eye a metre under the roof line,
      // looking at the edge the hull drives off (the fixed pose's lipY is the roof)
      const roof = fixed?.lipY ?? ground;
      cam = [x + fx * 10 + rx * 14, roof - 1, z + fz * 10 + rz * 14];
      at = [x + fx * 2, roof - 1.5, z + fz * 2];
    } else if (view === 'quarter') {
      cam = [x + rx * 9.5 + fx * 5, ground + 2.4, z + rz * 9.5 + fz * 5];
      at = [x, ground + 1.4, z];
    } else if (view === 'front') {
      // ahead of the hull, looking back along it: a cross slope's roll reads face on (round 5)
      cam = [x + fx * 12, ground + 1.8, z + fz * 12];
      at = [x, ground + 1.2, z];
    } else {
      // the side the ground is lower on (round 3: on a cross slope the camera 13 m up the slope sat under the ground and
      // the rough strips looked up through the terrain, upside down, the tank never in view)
      const side = hf.getHeightAt(x - rx * 13, z - rz * 13) < hf.getHeightAt(x + rx * 13, z + rz * 13) ? -1 : 1;
      cam = [x + side * rx * 13 - fx * 1, ground + 1.7, z + side * rz * 13 - fz * 1];
      at = [x + fx * 0.5, ground + 1.1, z + fz * 0.5];
    }
    // never under the ground beneath the camera itself
    cam[1] = Math.max(cam[1], hf.getHeightAt(cam[0], cam[2]) + 1.2);
    D.rig.setExternalPose(new V(...cam), new V(...at), 40);
    return { x: at0.x, z: at0.z, yaw: at0.yaw, lipY: fixed?.lipY };
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
          const gap = H.pageWheelGap(wheels.owner, w, hf, V) - (restGap[side][i] ?? 0);
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
  if (caseDef.kind === 'landing') {
    // the frames after touchdown spread by the case's stretch (a low-gravity settle runs that much slower)
    const stretch = caseDef.stretch ?? 1;
    return LANDING_STEPS.map((s) => (s > 0 ? s * stretch : s)).map((s) => ({ tick: anchors.landing + s, step: s, t: s / 60 }));
  }
  if (caseDef.kind === 'stop') {
    return [
      ...STOP_STEPS.map((s) => ({ tick: anchors.brake + s, step: s, t: s / 60 })),
      ...STOPPED_STEPS.map((s) => ({ tick: anchors.stop + s, step: anchors.stop + s - anchors.brake, t: (anchors.stop + s - anchors.brake) / 60 })),
    ];
  }
  if (caseDef.kind === 'cross') {
    const stretch = caseDef.stretch ?? 1;
    return CROSS_STEPS.map((s) => s * stretch).map((s) => ({ tick: anchors.cross + s, step: s, t: s / 60 }));
  }
  return caseDef.frames.map((sec) => ({ tick: Math.round(sec * 60), step: Math.round(sec * 60), t: sec }));
}

/**
 * Where a running jump comes down, along its heading from the stage: the run to the jump's tick at the case's speed,
 * then the flight at that speed for the time the mode's jump stays up (the ruleset's jump speed and gravity), with a
 * margin either side. Null for a case that does not jump at speed.
 */
async function landingZone(page, caseDef, jumpTick) {
  if (!caseDef.jump || !caseDef.speed) return null;
  return page.evaluate(({ speed, jumpTick }) => {
    const p = window.__DEBUG.game.player;
    const v = speed === 'top' ? p.spec.topSpeedKmh / 3.6 * (p.modeSpeedMultiplier ?? 1) : speed;
    const g = 9.81 * (p.modeGravityScale ?? 1);
    const flightS = (2 * (p.modeJumpMps ?? 0)) / g;
    const reach = v * (jumpTick / 60 + flightS);
    return { fromM: Math.round(reach - 30), toM: Math.round(reach + 35), reachM: Math.round(reach) };
  }, { speed: caseDef.speed, jumpTick });
}

async function runCase(page, caseId, caseDef, options, build) {
  await installHelpers(page);
  const startTick = 30;
  const zone = await landingZone(page, caseDef, startTick);
  const stage = await page.evaluate(`window.__strip.pageFindStage(window.__DEBUG.world, ${JSON.stringify(caseDef.find)}, ${
    JSON.stringify(zone)})`);
  if (stage && zone) stage.landingZone = zone;
  if (!stage) throw new Error(`${caseId}: no ${caseDef.find} stage found on ${caseDef.map}${zone ? ` with a flat landing zone ${zone.fromM}-${zone.toM} m on` : ''}`);
  const plan = {
    tick: 0, throttle: caseDef.throttle ?? 0, drop: caseDef.drop ?? 0,
    jumpTick: caseDef.jump ? startTick : null, dropTick: caseDef.drop ? startTick : null, level: caseDef.level === true,
    brakeTick: caseDef.brakeAtS != null ? Math.round(caseDef.brakeAtS * 60) : null,
    trench: stage.trench ?? null,
  };
  if (caseDef.cruise) {
    // the throttle that holds the run's speed (the drive's target is the throttle times the top speed)
    plan.throttle = await page.evaluate((speed) => {
      const p = window.__DEBUG.game.player;
      return Math.min(1, speed / (p.spec.topSpeedKmh / 3.6 * (p.modeSpeedMultiplier ?? 1)));
    }, caseDef.speed);
  }
  // dry run: find the anchors (the touchdown, the stop) on the same deterministic stage
  let meta = await stageCase(page, stage);
  await launchCase(page, caseDef);
  const anchors = { landing: -1, brake: plan.brakeTick ?? 0, stop: -1, cross: -1 };
  if (caseDef.kind === 'cross') {
    // A crossing goes through the works on its run-in (pageFindStage) and the dry run crushes them: the capture run then
    // met them crushed and reached the trench 5 ticks before the dry run had (the field trench on Badlands). A first
    // pass crushes them, and the anchor is read on a second over the same ground the capture run drives.
    for (let tick = 0; tick < 60 * 40; tick += 30) {
      plan.tick = tick;
      if ((await advance(page, 30, plan)).crossedAt >= 0) break;
    }
    meta = await stageCase(page, stage);
    await launchCase(page, caseDef);
  }
  if (caseDef.kind === 'landing' || caseDef.kind === 'stop' || caseDef.kind === 'cross') {
    const limit = 60 * 40;
    for (let tick = 0; tick < limit; tick += 30) {
      plan.tick = tick;
      const found = await advance(page, 30, plan);
      // (the step that lands, or stops, is shown after that many steps plus itself)
      if (caseDef.kind === 'landing' && found.landedAt >= 0) {
        anchors.landing = found.landedAt + 1;
        anchors.landedPos = found.landedPos;
        // the ground it came down on: its steepest grade and cross slope over 8 m about the touchdown
        anchors.landingSite = await page.evaluate(({ x, z }) => {
          const hf = window.__DEBUG.world.heightField;
          let grade = 0;
          for (const [a, b] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]]) {
            grade = Math.max(grade, Math.abs(hf.getHeightAt(x + a * 4, z + b * 4) - hf.getHeightAt(x - a * 4, z - b * 4)) / 8);
          }
          return { gradeDeg: +(Math.atan(grade) * 57.2958).toFixed(1) };
        }, found.landedPos);
        break;
      }
      if (caseDef.kind === 'stop' && found.stoppedAt >= 0) { anchors.stop = found.stoppedAt + 1; break; }
      if (caseDef.kind === 'cross' && found.crossedAt >= 0) { anchors.cross = found.crossedAt + 1; break; }
    }
    if (caseDef.kind === 'cross' && anchors.cross < 0) throw new Error(`${caseId}: the hull never reached the trench within 40 s`);
    if (caseDef.kind === 'landing' && anchors.landing < 0) throw new Error(`${caseId}: no touchdown within 40 s`);
    if (caseDef.kind === 'stop' && anchors.stop < 0) throw new Error(`${caseId}: no stop within 40 s`);
    await stageCase(page, stage);
    await launchCase(page, caseDef);
  }
  // a landing is watched where the dry run touched down (a running jump lands 20 m on from its takeoff)
  const fixed = caseDef.kind === 'landing' || caseDef.kind === 'rest' || caseDef.kind === 'cross'
    ? await placeCamera(page, caseDef.view, false, caseDef.kind === 'landing' ? anchors.landedPos ?? null
      : caseDef.kind === 'cross' ? { x: stage.trench.x, z: stage.trench.z, yaw: stage.yaw, lipY: stage.trench.lipY } : null)
    : null;
  const frames = [];
  const met = { landing: -1, stop: -1, cross: -1 };
  let tick = 0;
  const targets = captureTicks(caseDef, anchors);
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    if (target.tick > tick) {
      plan.tick = tick;
      const found = await advance(page, target.tick - tick, plan);
      if (met.landing < 0 && found.landedAt >= 0) met.landing = found.landedAt + 1;
      if (met.stop < 0 && found.stoppedAt >= 0) met.stop = found.stoppedAt + 1;
      if (met.cross < 0 && found.crossedAt >= 0) met.cross = found.crossedAt + 1;
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
    || (caseDef.kind === 'stop' && met.stop !== anchors.stop)
    || (caseDef.kind === 'cross' && met.cross !== anchors.cross);
  if (anchorMismatch) throw new Error(`${caseId}: capture run anchors ${JSON.stringify(met)} differ from the dry run's ${JSON.stringify(anchors)}`);
  if (caseDef.kind === 'drive' && frames.some((f) => Math.abs(f.speed) < 0.5 * caseDef.speed)) {
    throw new Error(`${caseId}: the hull did not hold its run (speeds ${frames.map((f) => f.speed.toFixed(1)).join(', ')})`);
  }
  const worstRender = frames.reduce((w, f) => Math.max(w, Math.abs(f.renderError?.y ?? 0),
    Math.abs(f.renderError?.pitch ?? 0), Math.abs(f.renderError?.roll ?? 0)), 0);
  const record = { caseId, spec: caseDef.spec ?? options.spec, map: caseDef.map, mode: caseDef.mode, gravity: caseDef.gravity ?? null,
    build, stage, anchors, meta,
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
          { specId: caseDef.spec ?? options.spec, mapId: caseDef.map, gameMode: caseDef.mode });
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
