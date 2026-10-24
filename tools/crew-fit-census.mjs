#!/usr/bin/env node
// Crew-fit census (CPU only, no tank builds): for every playable vehicle and combat crew station, does a P50 (1.75 m)
// person in the role's posture fit inside the exact hull/turret shell (armor.collisionShells, turret at rest), and does
// the station's combat box and every crew hit shape stay inside that shell?
//
//   node tools/crew-fit-census.mjs [--ids=a,b] [--json=out.json] [--quiet] [--probes=dump.json]
//
// --probes judges dumped combat data ({ id: { armor } }, e.g. a base's legacy stations) instead of the live fleet.
//
// Per station it reports:
// The shell is armour at every turret yaw: a hull crew member's is the hull's cells (the turret turns over them); a
// turret crew member's is the turret's cells, the hull's under it at every turret yaw (the basket turns with it) and
// the turret ring between them (its full width).
//   boxOut    share of the station box (3 cm grid, corners included) outside the shell by more than 1 cm, and the
//             farthest such point (boxOutM);
//   shapesOut share of the crew hit shapes' surface samples outside the armour by more than 1 cm (crewArmour: the shell
//             without the turret ring's opening, which the combat shells leave open);
//   body      whether a 1.75 m body (head, torso, thighs, shins, boots, the Gallery mannequin's segment table) in the
//             role's posture family fits entirely inside the shell, 5 mm in, with its head centre at a point of a 5 cm
//             grid over the station box grown 15 cm each way: drivers seated or reclined, gunners and commanders seated
//             (upright or hunched; in a hull crew capsule also reclined), turret loaders standing or seated.
// The search and the containment here are independent of the seat fitter (tools/crew-seat-fit.mjs): it judges it.
import { readFileSync, writeFileSync } from 'node:fs';
import { crewArmour, crewShell } from './crew-seat-fit.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const probes = typeof args.probes === 'string' ? JSON.parse(readFileSync(args.probes, 'utf8')) : null;
const fleet = probes ? null : (await import('../src/vehicles/tankFactory.ts'), await import('../src/vehicles/specs.ts'));
const armorOf = (id) => probes ? probes[id]?.armor : fleet.getSpec(id)?.armor;
const ids = typeof args.ids === 'string' ? args.ids.split(',').filter(Boolean) : probes ? Object.keys(probes) : [...fleet.ALL_TANK_IDS];
const TOL = 0.01;
const BODY_MARGIN = 0.005;
/** How far outside its station box a seated person's head may be and still sit at that station. */
const HEAD_REACH_M = 0.15;

// --- shell ---------------------------------------------------------------------------------------------------------
// "Inside" is the armour definition the combat seats are held to (tools/crew-seat-fit.mjs crewShell): armour at every
// turret yaw, the turret ring's opening included. The search below is the census's own.
function makeShell(armor) {
  const shells = { hull: crewShell(armor, 'hull'), turret: crewShell(armor, 'turret') };
  const armour = { hull: crewArmour(armor, 'hull'), turret: crewArmour(armor, 'turret') };
  const empty = !(armor.collisionShells?.hull || []).length && !(armor.collisionShells?.turret || []).length;
  return {
    inside: (p, frame, tol) => shells[frame].inside(p, -tol),
    /** Hit shapes are held to the armour proper: never the turret ring's open gap. */
    armoured: (p, frame, tol) => armour[frame].inside(p, -tol),
    insideXYZ: (x, y, z, turretFrame, tol) => shells[turretFrame ? 'turret' : 'hull'].inside([x, y, z], -tol),
    /** How far a point lies above or below its column's nearest inside interval (1 m when the column is empty). */
    excess(p, frame) {
      let best = 1;
      for (const [lo, hi] of shells[frame].column(p[0], p[2], 0)) best = Math.min(best, p[1] < lo ? lo - p[1] : p[1] > hi ? p[1] - hi : 0);
      return best;
    },
    empty,
  };
}

// --- body ---------------------------------------------------------------------------------------------------------
// The P50 body of the combat crew seats and the Gallery mannequin (segment fractions of 1.75 m): a helmeted head, a
// torso of two capsules, thighs, shins and boots, in the role's posture ladders (joint angles base → most tucked).
const H = 1.75;
const SEG = { spine: 0.296 * H, neck: 0.05 * H, headR: 0.061 * H, thigh: 0.251 * H, shin: 0.246 * H, hipHalf: 0.052 * H };
// [trunk (+ leans forward), hip (thigh from straight down, forward), knee flexion, neck pitch]
const POSTURES = {
  driverSeated: [[-0.15, 1.5, 1.3, -0.1], [-0.55, 1.5, 1.25, -0.3]],
  driverReclined: [[-0.55, 1.5, 1.25, -0.3], [-1.1, 1.75, 0.6, -0.35]],
  gunner: [[0.22, 1.52, 1.5, 0.18], [-0.2, 1.95, 2.3, 0.35]],
  commander: [[0.04, 1.5, 1.45, 0], [-0.3, 1.95, 2.3, 0.25]],
  loaderStanding: [[0.14, 0.22, 0.3, 0.12], [0.3, 1.2, 2.0, 0.2]],
  loaderSeated: [[0.12, 1.45, 1.5, 0.1], [-0.3, 1.95, 2.3, 0.25]],
  seatedHunched: [[0.35, 1.6, 1.7, 0.3], [0.6, 1.9, 2.2, 0.45]],
};
const TUCKS = [0, 0.25, 0.5, 0.75, 1];
const up = (a) => [Math.cos(a), Math.sin(a)];
const down = (a) => [-Math.cos(a), Math.sin(a)];
const add = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s];
const SPHERE = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
  if (i || j || k) SPHERE.push([i, j, k].map((v) => v / Math.hypot(i, j, k)));
}
/** Surface sample points of a posed body, head centre at the origin (frame-local offsets). */
function bodyPoints([trunk, hip, knee, neck]) {
  const pelvis = [0, 0];
  const shoulder = add(pelvis, up(trunk), SEG.spine);
  const head = add(add(shoulder, up(trunk + neck), SEG.neck), up(trunk + neck), SEG.headR);
  const kneeP = add(pelvis, down(hip), SEG.thigh);
  const ankle = add(kneeP, down(hip - knee), SEG.shin);
  const rel = (p) => [p[0] - head[0], p[1] - head[1]];
  const points = SPHERE.map((d) => [d[0] * 0.115, d[1] * 0.13, d[2] * 0.125]);
  const capsules = [
    [add(pelvis, up(trunk), 0.05), add(pelvis, up(trunk), SEG.spine * 0.78), 0.13, [-0.07, 0.07]],
    [pelvis, kneeP, 0.075, [-SEG.hipHalf * 1.7, SEG.hipHalf * 1.7]],
    [kneeP, ankle, 0.055, [-SEG.hipHalf * 1.75, SEG.hipHalf * 1.75]],
    [[ankle[0] - 0.04, ankle[1] - 0.05], [ankle[0] - 0.04, ankle[1] + 0.21], 0.045, [-SEG.hipHalf * 1.75, SEG.hipHalf * 1.75]],
  ];
  for (const [a0, b0, r, laterals] of capsules) {
    const a = rel(a0), b = rel(b0);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / 0.05));
    const dir = len > 1e-9 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
    const perp = [-dir[1], dir[0]];
    for (const x of laterals) {
      for (let i = 0; i <= steps; i++) {
        const c = [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps];
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const s = Math.cos(ang) * r, l = Math.sin(ang) * r;
          points.push([x + l, c[0] + perp[0] * s, c[1] + perp[1] * s]);
        }
        if (i === 0) points.push([x, c[0] - dir[0] * r, c[1] - dir[1] * r]);
        if (i === steps) points.push([x, c[0] + dir[0] * r, c[1] + dir[1] * r]);
      }
    }
  }
  return points;
}
const BODY_CACHE = new Map();
function postureBodies(posture) {
  if (!BODY_CACHE.has(posture)) {
    const [base, tucked] = POSTURES[posture];
    BODY_CACHE.set(posture, TUCKS.map((t) => ({ tuck: t, points: bodyPoints(base.map((v, i) => v + (tucked[i] - v) * t)) })));
  }
  return BODY_CACHE.get(posture);
}
/** The postures a role may take: any driver may sit or recline; a turret loader may stand; hull capsule crew recline. */
function roleFamilies(crew, frame) {
  if (/driver|radio/i.test(crew)) return ['driverSeated', 'driverReclined'];
  if (/loader/i.test(crew)) return frame === 'turret' ? ['loaderStanding', 'loaderSeated', 'seatedHunched'] : ['loaderSeated', 'seatedHunched'];
  const seated = /commander/i.test(crew) ? ['commander', 'seatedHunched'] : ['gunner', 'seatedHunched'];
  return frame === 'hull' ? [...seated, 'driverReclined'] : seated;
}

function bodyFit(shell, box, frame, crew) {
  const postures = roleFamilies(crew, frame);
  const grid = (axis) => {
    const lo = box.min[axis] - HEAD_REACH_M, hi = box.max[axis] + HEAD_REACH_M;
    const n = Math.max(1, Math.round((hi - lo) / 0.05));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(lo + (hi - lo) * i / n);
    const mid = (lo + hi) / 2;
    return out.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  };
  const gx = grid(0), gy = grid(1), gz = grid(2);
  const turretFrame = frame === 'turret';
  let best = { inside: -1 };
  for (const posture of postures) {
    for (const body of postureBodies(posture)) {
      const points = body.points;
      let killer = 0; // the point that failed last is tried first
      for (const y of gy) for (const z of gz) for (const x of gx) {
        const k = points[killer];
        if (best.inside >= 0 && !shell.insideXYZ(x + k[0], y + k[1], z + k[2], turretFrame, -BODY_MARGIN)) continue;
        let inside = 0, failed = false;
        for (let index = 0; index < points.length; index++) {
          const p = points[index];
          if (shell.insideXYZ(x + p[0], y + p[1], z + p[2], turretFrame, -BODY_MARGIN)) inside++;
          else { failed = true; killer = index; if (best.inside >= 0) break; }
        }
        if (!failed) return { fits: true, posture, tuck: body.tuck, head: [x, y, z] };
        if (inside > best.inside) best = { inside, total: points.length, posture, tuck: body.tuck };
      }
    }
  }
  return { fits: false, posture: best.posture, tuck: best.tuck };
}

function boxSamples(box) {
  const out = [];
  const n = [0, 1, 2].map((axis) => Math.max(1, Math.round((box.max[axis] - box.min[axis]) / 0.03)));
  for (let i = 0; i <= n[0]; i++) for (let j = 0; j <= n[1]; j++) for (let k = 0; k <= n[2]; k++) {
    out.push([
      box.min[0] + (box.max[0] - box.min[0]) * i / n[0],
      box.min[1] + (box.max[1] - box.min[1]) * j / n[1],
      box.min[2] + (box.max[2] - box.min[2]) * k / n[2],
    ]);
  }
  return out;
}
function shapeSamples(shape) {
  const out = [];
  const dirs = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) {
    const th = (i + 0.5) / 6 * Math.PI, ph = j / 12 * Math.PI * 2;
    dirs.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]);
  }
  dirs.push([0, 1, 0], [0, -1, 0]);
  if (shape.kind === 'ellipsoid') {
    for (const d of dirs) out.push(d.map((v, axis) => shape.center[axis] + v * shape.radii[axis]));
  } else if (shape.kind === 'capsule') {
    for (let s = 0; s <= 4; s++) {
      const c = shape.a.map((v, axis) => v + (shape.b[axis] - v) * s / 4);
      for (const d of dirs) out.push(c.map((v, axis) => v + d[axis] * shape.radius));
    }
  } else {
    const radial = [0, 1, 2].filter((axis) => axis !== shape.axis);
    for (const t of [-1, -0.5, 0, 0.5, 1]) for (let j = 0; j < 12; j++) {
      const ph = j / 12 * Math.PI * 2;
      const p = shape.center.slice();
      p[shape.axis] += t * shape.halfLength;
      p[radial[0]] += Math.cos(ph) * shape.radii[0];
      p[radial[1]] += Math.sin(ph) * shape.radii[1];
      out.push(p);
    }
  }
  return out;
}

const rows = [];
const t0 = performance.now();
for (const id of ids) {
  const armor = armorOf(id);
  if (!armor) continue;
  const shell = makeShell(armor);
  for (const box of armor.crew || []) {
    const frame = box.turretLocal ? 'turret' : 'hull';
    const samples = boxSamples(box);
    let out = 0, outM = 0;
    for (const p of samples) {
      if (shell.inside(p, frame, TOL)) continue;
      out++;
      outM = Math.max(outM, shell.excess(p, frame));
    }
    const shapePoints = (box.shapes || []).flatMap(shapeSamples);
    const shapesOutCount = shapePoints.filter((p) => !shell.armoured(p, frame, TOL)).length;
    const body = shell.empty ? { fits: false } : bodyFit(shell, box, frame, box.crew);
    rows.push({
      id, crew: box.crew, station: box.station || null, frame,
      size: box.min.map((v, axis) => +(box.max[axis] - v).toFixed(3)),
      boxOut: +(out / samples.length).toFixed(4), boxOutM: +outM.toFixed(3),
      shapes: (box.shapes || []).length,
      shapesOut: shapePoints.length ? +(shapesOutCount / shapePoints.length).toFixed(4) : 0,
      bodyFits: body.fits, posture: body.posture || null, tuck: body.tuck ?? null,
    });
  }
}
const stations = rows.length;
const boxOut = rows.filter((row) => row.boxOut > 0);
const shapesOut = rows.filter((row) => row.shapesOut > 0);
const noBody = rows.filter((row) => !row.bodyFits);
const bad = rows.filter((row) => row.boxOut > 0 || row.shapesOut > 0 || !row.bodyFits);
const byRole = {};
for (const row of noBody) byRole[`${row.crew}@${row.frame}`] = (byRole[`${row.crew}@${row.frame}`] || 0) + 1;
const summary = {
  vehicles: new Set(rows.map((row) => row.id)).size, stations,
  boxOutside: boxOut.length, shapesOutside: shapesOut.length, bodyDoesNotFit: noBody.length,
  failingStations: bad.length, bodyMissByRole: byRole, seconds: +((performance.now() - t0) / 1000).toFixed(1),
};
if (!args.quiet) {
  for (const row of bad) {
    console.log(`${row.id.padEnd(26)} ${`${row.crew}@${row.frame}`.padEnd(22)} box ${row.size.join('x').padEnd(18)} `
      + `out ${(row.boxOut * 100).toFixed(1).padStart(5)}% ${row.boxOutM.toFixed(2)} m  shapes ${(row.shapesOut * 100).toFixed(1).padStart(5)}%  `
      + `body ${row.bodyFits ? `fits ${row.posture} t${row.tuck}` : `NO (best ${row.posture} t${row.tuck})`}`);
  }
}
console.log(JSON.stringify(summary));
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ summary, rows }, null, 1) + '\n');
