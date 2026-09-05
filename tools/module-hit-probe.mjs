// tools/module-hit-probe.mjs — MODULE HITBOX correctness gate (pure sim, node).
//
// For every registered tank with an armor model, this probe:
//   1. STRUCTURE — measures the hull/turret plate envelopes and checks every
//      module/crew box against its frame envelope: an INTERNAL box whose
//      center pokes outside the armor envelope is unreachable (or reachable
//      only through the ENVELOPE-SEAM CATCH) and flags OUTSIDE.
//   2. SCRIPTED SHOTS — fires a rigged mega-pen shell through each module
//      precise authored shape centers from all six canonical bearings via the
//      REAL traceTank + resolveShellHit pipeline and asserts:
//        trace   — the box is crossed by the segment at all (geometry sane);
//        resolve — the module actually ROLLS damage on a penetrating hit
//                  (externality, plate ordering and the post-pen fragment
//                  corridor all honored — i.e. the module is reachable in
//                  gameplay, not just in geometry).
//   3. TRACK LINKS — side shots at running-gear height must reach trackL/R
//      via the external track plate's moduleLink (or the track box itself).
//
// Usage: node tools/module-hit-probe.mjs [--ids=a,b] [--json out.json] [-v]
// Exit non-zero when any tank has a hard FAIL (trace-miss or resolve-miss).
//
// RNG rigging: rng() => 0 makes every saving throw succeed (0 < chance), so
// a resolve-miss is a geometry/pipeline failure, never a failed save.

import { Vector3 } from 'three';
import { writeFileSync } from 'node:fs';

// Register the FULL roster (specs + modern1-3 + userdrops + variants) the
// same way the game does. tankFactory is node-safe (no DOM at module scope).
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS, ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const { blastTargets, tankPoseFromState, traceTank } = await import('../src/sim/armor.ts');
const { createCombatState, resolveShellHit } = await import('../src/sim/damage.ts');

const args = process.argv.slice(2);
const eq = args.find((a) => a.startsWith('--ids='));
const requested = eq ? eq.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;
const verbose = args.includes('-v');
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : '';

// Mega-pen probe shell: rigged so armor never stops it and the post-pen
// sweep length remains the tank's real largest authored caliber. Penetration
// is rigged so this gate measures anatomy reachability, not balance values.
function probeShellFor(spec) {
  const caliberMm = Math.max(
    1,
    ...((spec.gun && spec.gun.shells) || []).map((shell) => Number(shell.caliberMm) || 0),
    Number(spec.gun && spec.gun.caliberMm) || 0,
  );
  return {
    name: 'MODULE REACHABILITY PROBE', type: 'APFSDS', caliberMm,
    pen100Mm: 5000, pen1000Mm: 5000, pen2000Mm: 5000,
    dmg: 100, velocityMps: 1700, moduleDmg: Math.max(125, caliberMm), tracer: 'APFSDS',
  };
}
const rng0 = () => 0;

/** Fresh real CombatState target for one spec. */
function freshTarget(spec) {
  return {
    id: spec.id,
    spec,
    state: { pos: new Vector3(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 },
    combat: createCombatState(spec),
  };
}

function freshShell(from, to, shellSpec) {
  const vel = new Vector3().subVectors(to, from).normalize().multiplyScalar(shellSpec.velocityMps);
  return {
    id: 1, spec: shellSpec, shooterId: 'probe', isPlayer: false,
    pos: to.clone(), prevPos: from.clone(), vel,
    ageS: 0.1, distM: from.distanceTo(to), dead: false,
    penRollDone: false, remainingPenMm: 0, dmgRoll: 0, freshPenRollMm: 0,
    bounces: 0, carriedThrough: false,
  };
}

const STATE = {
  pos: new Vector3(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0,
  turretYaw: 0, gunPitch: 0,
};
const POSE = tankPoseFromState(STATE);

/** AABB over a plate list's vertices (module-local frame). */
function plateEnvelope(plates) {
  let mn = null, mx = null;
  for (const p of plates || []) {
    if (p.kind === 'era') continue;
    for (const v of p.verts) {
      if (!mn) { mn = [...v]; mx = [...v]; continue; }
      for (let a = 0; a < 3; a++) {
        if (v[a] < mn[a]) mn[a] = v[a];
        if (v[a] > mx[a]) mx[a] = v[a];
      }
    }
  }
  return mn ? { mn, mx } : null;
}

const boxCenter = (b) => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

function shapeCenter(shape) {
  if (shape.kind === 'capsule') {
    return [
      (shape.a[0] + shape.b[0]) / 2,
      (shape.a[1] + shape.b[1]) / 2,
      (shape.a[2] + shape.b[2]) / 2,
    ];
  }
  if (shape.center) return [...shape.center];
  return boxCenter(shape);
}

function moduleShapes(box) {
  if (box.shapes && box.shapes.length) return box.shapes;
  if (box.parts && box.parts.length) return box.parts;
  return [box];
}

/** Center-inside-envelope test with tolerance (m). */
function centerInside(c, env, tol) {
  if (!env) return true;
  for (let a = 0; a < 3; a++) {
    if (c[a] < env.mn[a] - tol || c[a] > env.mx[a] + tol) return false;
  }
  return true;
}

// Canonical shot bearings — from 30 m out, through the shape center, 5 m past.
// Both signs matter: a module near one wall may exceed the real gun's
// post-penetration corridor when incorrectly tested from only the far side.
const SHOT_DIRECTIONS = Object.freeze([
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
  new Vector3(0, 1, 0), new Vector3(0, -1, 0),
]);

function shotSegment(centerW, dir) {
  const from = centerW.clone().addScaledVector(dir, -30);
  const to = centerW.clone().addScaledVector(dir, 5);
  return { from, to };
}

const rows = [];
let hardFails = 0;
let authoredModuleChecks = 0;
let trackSideChecks = 0;

const ids = (requested || ALL_TANK_IDS).filter((id) => TANK_SPECS[id] && TANK_SPECS[id].armor);
for (const id of ids) {
  const spec = TANK_SPECS[id];
  const armor = spec.armor;
  const row = { id, outside: [], traceMiss: [], resolveMiss: [], trackLink: 'ok', dimsDrift: [], notes: [] };

  const hullEnv = plateEnvelope(armor.hullPlates);
  const turretEnv = plateEnvelope(armor.turretPlates);

  // --- 0. armor envelope vs published dims (visual staleness detector) ------
  // The geometry gate pins every visual to spec.dims, so an armor envelope
  // that disagrees with dims disagrees with the RENDERED tank: shots aimed at
  // rendered metal pass through air (envelope small) or invisible armor eats
  // misses (envelope big). Donor-copied armor on recovered variants
  // (userdrops5/6 make()) is the classic source.
  if (hullEnv && spec.dims) {
    const d = spec.dims;
    const aw = Math.max(Math.abs(hullEnv.mn[0]), Math.abs(hullEnv.mx[0])) * 2;
    const al = hullEnv.mx[2] - hullEnv.mn[2];
    const tp = armor.turretPivot || [0, 0, 0];
    const at = turretEnv ? tp[1] + turretEnv.mx[1] : hullEnv.mx[1];
    const DIM_TOL = 0.22; // m — visuals gate to dims far tighter than this
    // Height allows 0.5 m: published heightM includes the cupola / MG /
    // sight tower, which the armor models deliberately do not plate (WoT
    // models them as turret-roof weak spots; ours reads them as roof).
    const H_TOL = 0.5;
    if (Math.abs(aw - d.widthM) > DIM_TOL) row.dimsDrift.push(`width ${aw.toFixed(2)} vs ${d.widthM}`);
    if (Math.abs(al - d.hullLengthM) > Math.max(DIM_TOL, d.hullLengthM * 0.05)) {
      row.dimsDrift.push(`hullLen ${al.toFixed(2)} vs ${d.hullLengthM}`);
    }
    if (Math.abs(at - d.heightM) > H_TOL) row.dimsDrift.push(`height ${at.toFixed(2)} vs ${d.heightM}`);
  }

  // --- 1. structural containment --------------------------------------------
  for (const box of armor.modules || []) {
    const ext = box.external !== undefined ? !!box.external : (box.module === 'optics' || box.module === 'gun');
    if (ext || box.module === 'trackL' || box.module === 'trackR') continue;
    const env = box.turretLocal ? turretEnv : hullEnv;
    // turretRing legitimately straddles the hull roof seam — allow extra slack.
    const tol = box.module === 'turretRing' ? 0.35 : 0.05;
    if (moduleShapes(box).some((shape) => !centerInside(shapeCenter(shape), env, tol))) {
      row.outside.push(box.module + (box.turretLocal ? '(T)' : ''));
    }
  }
  for (const box of armor.crew || []) {
    const env = box.turretLocal ? turretEnv : hullEnv;
    if (!centerInside(boxCenter(box), env, 0.05)) {
      row.outside.push(`crew:${box.crew}${box.turretLocal ? '(T)' : ''}`);
    }
  }

  // --- 2. scripted shots through every authored gameplay module ------------
  // Precise shape centers come from armor.ts itself, so segmented/capsule/
  // ellipsoid anatomy cannot be failed by the empty center of a broad union.
  const authoredModules = [...new Set((armor.modules || []).map((box) => box.module))]
    .filter((name) => name !== 'trackL' && name !== 'trackR');
  const worldTargets = blastTargets(POSE, armor).filter((target) => target.kind === 'module');
  const probeShell = probeShellFor(spec);
  for (const name of authoredModules) {
    authoredModuleChecks++;
    const centers = worldTargets
      .filter((target) => target.name === name)
      .map((target) => target.point);
    if (!centers.length) {
      row.traceMiss.push(name);
      continue;
    }
    let traced = false;
    let resolved = false;
    for (const centerW of centers) {
      for (const dir of SHOT_DIRECTIONS) {
        const { from, to } = shotSegment(centerW, dir);
        const hits = traceTank(from, to, POSE, armor, new Set());
        if (hits.some((hit) => hit.kind === 'module' && hit.module === name)) traced = true;
        // Resolve on a fresh target each bearing (fires, hull damage reset).
        const target = freshTarget(spec);
        const shell = freshShell(from, to, probeShell);
        const event = resolveShellHit(shell, target, hits, rng0);
        if ((event.modulesHit || []).some((hit) => hit.module === name)) {
          resolved = true;
          break;
        }
      }
      if (resolved) break;
    }
    if (!traced) row.traceMiss.push(name);
    else if (!resolved) row.resolveMiss.push(name);
  }

  // --- 3. both track sides are reachable at running-gear height -------------
  for (const trackName of ['trackL', 'trackR']) {
    const trk = (armor.modules || []).find((module) => module.module === trackName);
    if (trk) {
      trackSideChecks++;
      const c = boxCenter(trk);
      const y = Math.max(0.12, (trk.min[1] + trk.max[1]) / 2);
      const from = new Vector3(c[0] >= 0 ? 30 : -30, y, c[2]);
      const to = new Vector3(0, y, c[2]);
      const hits = traceTank(from, to, POSE, armor, new Set());
      const linked = hits.some((h) =>
        (h.kind === 'plate' && h.plate.moduleLink === trackName) ||
        (h.kind === 'module' && h.module === trackName));
      if (!linked) row.trackLink = row.trackLink === 'ok' ? `MISS:${trackName}` : `${row.trackLink},${trackName}`;
    } else {
      row.notes.push(`no ${trackName} box`);
    }
  }

  const bad = row.traceMiss.length + row.resolveMiss.length + (row.trackLink.startsWith('MISS') ? 1 : 0);
  if (bad > 0) hardFails++;
  rows.push(row);

  const flag = bad > 0 ? ' FAIL' : (row.outside.length || row.dimsDrift.length) ? ' warn' : '';
  if (verbose || flag.trim()) {
    console.log(
      `  ${id.padEnd(20)}${flag.padEnd(6)}` +
      (row.traceMiss.length ? ` trace-miss:[${row.traceMiss}]` : '') +
      (row.resolveMiss.length ? ` resolve-miss:[${row.resolveMiss}]` : '') +
      (row.trackLink !== 'ok' ? ` track:${row.trackLink}` : '') +
      (row.outside.length ? ` outside:[${row.outside}]` : '') +
      (row.dimsDrift.length ? ` dims-drift:[${row.dimsDrift.join('; ')}]` : '') +
      (row.notes.length ? ` (${row.notes.join('; ')})` : ''),
    );
  }
}

const outsideN = rows.filter((r) => r.outside.length).length;
const driftN = rows.filter((r) => r.dimsDrift.length).length;
console.log(
  `\n[module-hit] ${rows.length} tanks, ${authoredModuleChecks} authored modules, ` +
  `${trackSideChecks} track sides: ${hardFails} FAIL, ${outsideN} outside-envelope, ` +
  `${driftN} dims-drift warnings`,
);
if (jsonOut) {
  const summary = {
    tanks: rows.length,
    authoredModules: authoredModuleChecks,
    trackSides: trackSideChecks,
    hardFails,
    outsideEnvelope: outsideN,
    dimsDriftWarnings: driftN,
  };
  writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 1)}\n`,
  );
  console.log(`[module-hit] wrote ${jsonOut}`);
}
process.exit(hardFails > 0 ? 1 : 0);
