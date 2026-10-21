import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ALIGN_TOLERANCE, TURRET_YAWS_DEG, alignPoses, boundGroups, combatBarrelDigest } from './gun-barrel-align.mjs';

// Gun-barrel alignment receipt (230, gallery-anatomy finding 2026-10-21: the Gallery anatomy layers draw the combat
// barrel, and on the Strv 103B, KV-2 and others it ran beside, under or past the drawn gun, so a shot could hit the gun
// where none is drawn and pass through the drawn one). tools/gun-barrel-align-census.mjs measured the fleet on
// origin/integ/230 4c75b76e70: 109 of 220 tanks off by more than 20 mm, 0.5 deg, 30 mm at the muzzle or 20 mm of radius,
// because builders seat rig_turret, rig_gun and the muzzle themselves while spec.armor kept older generic pivots (the
// turret cells, measured in the builder's rig_turret frame, sat displaced with them: the KV-2's 0.42 m aft, the M1A1's
// 0.55 m). The fix seats the combat frame on the drawn rig (src/vehicles/combatGunRigs.generated.ts, applied by
// finalizeCombatAnatomy for the player's fleet and every authority; the KV-2 and the Swedish hull guns at their spec
// sources). docs/geometry-gate/gun-barrel-align.json keeps one row per tank, measured at rest and at full elevation and
// depression across three yaws (a casemate's arc ends; a hull-aimed gun at its one pose), bound to the tank's turret and
// gun group digests in the fleet geometry ledger (the hull's too for a gun fixed in the hull) and to its combat barrel.
// This receipt holds the whole fleet against it without building a tank, re-measures two rows, and proves the census
// with a seeded trunnion.
const LEDGER = 'docs/geometry-gate/gun-barrel-align.json';
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const fleet = JSON.parse(readFileSync('docs/references/fleet-geometry-ledger.json', 'utf8')).tanks;
await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const { COMBAT_GUN_RIGS } = await import('../src/vehicles/combatGunRigs.generated.ts');
const refresh = (ids) => `node tools/gun-barrel-align-census.mjs --ledger=${LEDGER} --update --ids=${ids.join(',')}`;

// Class 2 (open follow-up, scoped by the coordinator 2026-10-21, no builder rework in 230): rig_turret carries a scale whose
// y and z differ and rig_gun counter-scales it, so the drawn gun shears and elevates less than the sim lays it. Their rows
// are aligned at rest at every yaw (status 'skewed'); the fix is an unscaled rig_turret with the squash baked into the
// turret buckets, which also stops the turret cells measuring 1/scale too tall.
const OPEN_SKEWED = new Set(ledger.openSkewed || []);
// Owned by item/vehicles-turret-upgrades-230 until it lands; re-measured on the combined tree then (coordinator rule 3).
const TURRET_LANE = new Set(ledger.turretLane || []);

// The measuring standard cannot quietly loosen.
const T = ledger.tolerance;
assert.ok(T.offsetM <= 0.02 && T.angleDeg <= 0.5 && T.axialM <= 0.03 && T.radiusM <= 0.02, `ledger standard ${JSON.stringify(T)}`);
assert.deepEqual(T, { ...ALIGN_TOLERANCE }, 'the ledger was measured at the census tolerance');
const turretSpec = { armor: {}, gunElevationDeg: 20, gunDepressionDeg: 8 };
assert.equal(alignPoses(turretSpec).length, TURRET_YAWS_DEG.length * 3, 'a turret is measured at rest, full elevation and full depression at each yaw');
assert.deepEqual(alignPoses({ armor: { turretless: true }, hydropneumaticAim: {} }), [{ yawDeg: 0, pitchDeg: 0 }], 'a hull-aimed gun has one pose');

const rows = ledger.tanks;
const missing = ALL_TANK_IDS.filter((id) => !rows[id]);
assert.deepEqual(missing, [], `every tank has a gun-barrel row: ${refresh(missing)}`);
assert.deepEqual(Object.keys(rows).filter((id) => !ALL_TANK_IDS.includes(id)), [], 'no row for a retired id');
const stale = ALL_TANK_IDS.filter((id) => {
  const groups = fleet[id]?.high?.groups, held = rows[id].geometry ?? {}, want = boundGroups(rows[id].kind);
  return !groups || want.some((g) => held[g] !== groups[g]) || Object.keys(held).length !== want.length
    || rows[id].combat !== combatBarrelDigest(getSpec(id));
});
assert.deepEqual(stale, [], `the turret/gun geometry or the combat barrel moved since these rows were measured; re-measure them: ${refresh(stale)}`);

const settled = new Set(['aligned', 'launcher', 'no-barrel']);
const open = ALL_TANK_IDS.filter((id) => !TURRET_LANE.has(id) && !settled.has(rows[id].status)
  && !(rows[id].status === 'skewed' && OPEN_SKEWED.has(id)));
assert.deepEqual(open, [], `every combat barrel runs down its drawn gun: ${open.map((id) => `${id} ${JSON.stringify(rows[id])}`).join('; ')}`);
for (const id of OPEN_SKEWED) {
  const row = rows[id];
  assert.ok(row.status === 'skewed' || row.status === 'aligned', `${id}: an open skewed row is skewed or (fixed) aligned, never a plain mismatch`);
  if (row.status === 'skewed') {
    assert.ok(row.rest.offsetMm <= T.offsetM * 1000 && row.rest.angleDeg <= T.angleDeg && row.rest.axialMm <= T.axialM * 1000,
      `${id}: a skewed row is aligned at rest at every yaw (${JSON.stringify(row.rest)})`);
    assert.ok(row.turretScale && Math.abs(row.turretScale[1] - row.turretScale[2]) > 1e-4, `${id}: skewed means a rig_turret scale with y != z`);
  }
}
assert.deepEqual([...OPEN_SKEWED].filter((id) => rows[id].status === 'aligned'), [], 'a fixed skewed tank leaves the open list');
for (const id of ALL_TANK_IDS) {
  const row = rows[id], launcher = getSpec(id).gun?.fixedLaunchCanisters === true;
  if (row.status === 'launcher') assert.ok(launcher && row.mouths === 0, `${id}: only a fixed-canister launcher has no cannon mouth`);
}

// The combat-rig table is applied where every consumer reads the spec: the finalized spec carries each row.
for (const [id, rig] of Object.entries(COMBAT_GUN_RIGS)) {
  assert.ok(ALL_TANK_IDS.includes(id), `combat-rig row for an unregistered id ${id}`);
  assert.ok(!TURRET_LANE.has(id), `${id}: the turret lane's tanks take rows only after its merge`);
  const armor = getSpec(id).armor;
  assert.deepEqual([armor.turretPivot, armor.gunPivot, armor.gunBarrel.lengthM], [[...rig.turretPivot], [...rig.gunPivot], rig.lengthM],
    `${id}: finalizeCombatAnatomy applies its combat-rig row`);
  if (rig.radiusM !== undefined) assert.equal(armor.gunBarrel.radiusM, rig.radiusM, `${id}: the row's radius is applied`);
  const reach = Math.hypot(rig.turretPivot[0], rig.turretPivot[2]) + Math.hypot(rig.gunPivot[0], rig.gunPivot[2]) + rig.lengthM;
  assert.ok(armor.boundingRadiusM >= reach, `${id}: the trace broadphase radius reaches the muzzle`);
}
const count = (v) => ALL_TANK_IDS.filter((id) => rows[id].status === v).length;

const run = (...args) => spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/gun-barrel-align-census.mjs', ...args],
  { encoding: 'utf8', timeout: 900000 });
// Two rows re-measured: the KV-2 (its spec frame moved onto the builder's rig) and a hull-aimed gun (Strv 103B).
const live = run(`--ledger=${LEDGER}`, '--check', '--gate', '--ids=kv2,strv103b');
assert.equal(live.status, 0, `re-measured rows match the ledger (exit ${live.status})\n${live.stdout}\n${live.stderr}`);
assert.match(live.stdout, /^strv103b: ALIGNED — 1 mouth\(s\) hull-fixed, 1 pose\(s\)/m, 'the hull-aimed gun is censused at its one pose');

// Negative control: the M1A1's trunnion raised 50 mm in the census's copy reads as a ~50 mm offset and fails the gate.
const seeded = run('--ids=m1a1', '--seed-pivot-m=0.05', '--gate');
assert.equal(seeded.status, 1, `the seeded trunnion must fail the gate (exit ${seeded.status})\n${seeded.stdout}\n${seeded.stderr}`);
const offset = Number(seeded.stdout.match(/worst offset ([\d.]+) mm/)?.[1]);
assert.ok(offset >= 45 && offset <= 55, `the seeded 50 mm trunnion reads as a 45-55 mm offset (read ${offset} mm)\n${seeded.stdout}`);
console.log(`gun-barrel-align-census.selftest: ${ALL_TANK_IDS.length} rows current (${count('aligned')} aligned, ${count('skewed')} skewed `
  + `open, ${count('launcher')} launchers; ${TURRET_LANE.size} turret-lane rows held for its merge); ${Object.keys(COMBAT_GUN_RIGS).length} `
  + `combat-rig rows applied; kv2 and strv103b re-measured; seeded 50 mm trunnion read as ${offset} mm PASS`);
