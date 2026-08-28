// tools/module-crit-probe.mjs — CRIT DISTRIBUTION sanity (module_hitbox r1).
// Fires a seeded volume of realistic shots (era-matched shells, random
// bearings, aim points sampled over the target's armor envelope, live combat
// RNG) through the REAL traceTank + resolveShellHit pipeline and reports:
//   - outcome mix (pen / nonpen / ricochet / screens)
//   - crit rate GIVEN a pen (shots that damaged >= 1 module)
//   - per-module share of all crits
//   - crew hits, fires started, ammo-rack detonations
// Balance gates (armor doc §9 intent): crits are neither absent nor constant
// — the probe fails when pens crit < 15% or > 90% of the time.
//
// Usage: node tools/module-crit-probe.mjs [--shots N] [--seed S]

import { Vector3 } from 'three';

await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.js');
const { traceTank } = await import('../src/sim/armor.ts');
const { resolveShellHit, createCombatState } = await import('../src/sim/damage.ts');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SHOTS = Number(opt('shots', 400));
const SEED = Number(opt('seed', 4242));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

// Era-matched target/gun pool: WW2 guns vs WW2 tanks, modern vs modern.
const POOL = {
  ww2: ['m4a3e8', 'tiger1', 't34_85', 'is2', 'panther_g', 'kv2', 'is3'],
  modern: ['m1a2', 't90m', 'leo2a7', 'k2', 'leclerc', 'type99a', 't90a', 'm60a1', 'challenger2'],
};

const POSE = { pos: new Vector3(0, 0, 0), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };

function freshTarget(spec) {
  return {
    id: spec.id,
    spec,
    state: { pos: new Vector3(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 },
    combat: createCombatState(spec),
  };
}

function envelopeOf(armor) {
  let mn = null, mx = null;
  for (const p of armor.hullPlates || []) {
    if (p.kind === 'era') continue;
    for (const v of p.verts) {
      if (!mn) { mn = [...v]; mx = [...v]; continue; }
      for (let a = 0; a < 3; a++) {
        if (v[a] < mn[a]) mn[a] = v[a];
        if (v[a] > mx[a]) mx[a] = v[a];
      }
    }
  }
  return { mn, mx };
}

const tally = {
  shots: 0, kinds: {}, pens: 0, penWithCrit: 0, critModules: {}, critsTotal: 0,
  crewHits: 0, fires: 0, ammoRacks: 0, destroyed: 0,
};

for (let s = 0; s < SHOTS; s++) {
  const era = rng() < 0.5 ? 'ww2' : 'modern';
  const ids = POOL[era].filter((id) => TANK_SPECS[id]);
  const target = freshTarget(TANK_SPECS[ids[(rng() * ids.length) | 0]]);
  const shooter = TANK_SPECS[ids[(rng() * ids.length) | 0]];
  const shellSpec = shooter.gun.shells[(rng() * shooter.gun.shells.length) | 0];

  // Aim point sampled over the hull envelope (full height band, so turret
  // ring / deck grazes appear at realistic rates); bearing anywhere on the
  // horizontal circle with a mild downward tilt spread.
  const env = envelopeOf(target.spec.armor);
  const aim = new Vector3(
    env.mn[0] + rng() * (env.mx[0] - env.mn[0]),
    env.mn[1] + rng() * (env.mx[1] * 1.25 - env.mn[1]), // reaches into the turret band
    env.mn[2] + rng() * (env.mx[2] - env.mn[2]),
  );
  const bearing = rng() * Math.PI * 2;
  const tilt = -0.05 - rng() * 0.1; // shallow plunging, long-range feel
  const dir = new Vector3(Math.sin(bearing), Math.sin(tilt), Math.cos(bearing)).normalize().negate();
  const distM = 100 + rng() * 700;
  const from = aim.clone().addScaledVector(dir, -distM);
  const to = aim.clone().addScaledVector(dir, 6);

  const shell = {
    id: s, spec: shellSpec, shooterId: 'probe', isPlayer: false,
    pos: to.clone(), prevPos: from.clone(),
    vel: dir.clone().multiplyScalar(shellSpec.velocityMps),
    ageS: distM / shellSpec.velocityMps, distM, dead: false,
    penRollDone: false, remainingPenMm: 0, dmgRoll: 0, freshPenRollMm: 0,
    bounces: 0, carriedThrough: false,
  };
  const hits = traceTank(from, to, POSE, target.spec.armor, target.combat.eraSpent);
  if (!hits.length) { s--; continue; } // grazed past — resample
  const ev = resolveShellHit(shell, target, hits, rng);

  tally.shots++;
  tally.kinds[ev.kind] = (tally.kinds[ev.kind] || 0) + 1;
  const isPen = ev.kind === 'pen' || ev.kind === 'he_pen';
  if (isPen) tally.pens++;
  if (ev.modulesHit.length) {
    if (isPen) tally.penWithCrit++;
    for (const m of ev.modulesHit) {
      tally.critModules[m.module] = (tally.critModules[m.module] || 0) + 1;
      tally.critsTotal++;
    }
  }
  tally.crewHits += ev.crewHit.length;
  if (ev.fireStarted) tally.fires++;
  if (ev.ammoRacked) tally.ammoRacks++;
  if (ev.destroyed) tally.destroyed++;
}

const pct = (n, d) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
console.log(`[crit] ${tally.shots} shots (seed ${SEED})`);
console.log('  outcomes:', Object.entries(tally.kinds)
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k} ${pct(n, tally.shots)}`).join('  '));
console.log(`  pens: ${tally.pens} — crit given pen: ${pct(tally.penWithCrit, tally.pens)}`);
console.log('  crit share by module:', Object.entries(tally.critModules)
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k} ${pct(n, tally.critsTotal)}`).join('  '));
console.log(`  crew hits: ${tally.crewHits}  fires: ${tally.fires}  ammo-racks: ${tally.ammoRacks}  kills: ${tally.destroyed}`);

const critRate = tally.pens > 0 ? tally.penWithCrit / tally.pens : 0;
if (tally.pens >= 20 && (critRate < 0.15 || critRate > 0.9)) {
  console.error(`[crit] FAIL — crit-given-pen ${(critRate * 100).toFixed(1)}% outside the 15–90% sanity band`);
  process.exit(1);
}
console.log('[crit] sanity band OK (crits neither absent nor constant)');
