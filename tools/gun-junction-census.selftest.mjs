import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Gun-junction receipt (227 gun-gaps, owner 2026-10-17: "c2 ariete has gap in gun. fix any of these"). The fleet census
// at 2 mm found the background, or the turret's inside, showing along the gun line on twelve tanks; each was closed with
// real geometry (sleeves, cradles, collars, mantlet bosses and a trunnion hood seated in their mounts), never
// re-baselined. r4 (2026-10-18) turns the census into a per-id ledger, docs/geometry-gate/gun-junction.json: one row per
// tank, measured at 4 mm, 12 directions round each gun axis, at rest, full elevation, full depression and half of each,
// and bound to the tank's turret and gun group digests in the fleet geometry ledger (the hull group too for a gun fixed
// in the hull). This receipt holds the whole fleet against it without building a tank, re-measures two rows, and proves
// the detector with a seeded defect.
const LEDGER = 'docs/geometry-gate/gun-junction.json';
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const fleet = JSON.parse(readFileSync('docs/references/fleet-geometry-ledger.json', 'utf8')).tanks;
await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const refresh = (ids) => `node tools/gun-junction-census.mjs --ledger=${LEDGER} --update --ids=${ids.join(',')}`;

// The measuring standard cannot quietly loosen: every original gap read at 4 mm and 12 directions (12-268 mm, from 3-7
// directions), and the poses cover both limits and the travel between them.
const S = ledger.settings;
assert.ok(S.resMm <= 4 && S.azimuths >= 12 && S.minMm <= 4 && S.minPx <= 12, `ledger standard ${JSON.stringify(S)}`);
for (const pose of ['rest', 'elev', 'dep', 'e0.5', 'd0.5']) assert.ok(S.poses.includes(pose), `ledger poses include ${pose}`);

const rows = ledger.tanks;
const missing = ALL_TANK_IDS.filter((id) => !rows[id]);
assert.deepEqual(missing, [], `every tank has a gun-junction row: ${refresh(missing)}`);
assert.deepEqual(Object.keys(rows).filter((id) => !ALL_TANK_IDS.includes(id)), [], 'no row for a retired id');
const stale = ALL_TANK_IDS.filter((id) => {
  const groups = fleet[id]?.high?.groups, held = rows[id].geometry ?? {};
  const want = rows[id].kind === 'hull-fixed' ? ['hull', 'turret', 'gun'] : ['turret', 'gun'];
  return !groups || want.some((g) => held[g] !== groups[g]) || Object.keys(held).length !== want.length;
});
assert.deepEqual(stale, [], `turret/gun geometry moved since these rows were measured; re-measure them: ${refresh(stale)}`);
const open = ALL_TANK_IDS.filter((id) => rows[id].status !== 'closed' && rows[id].status !== 'launcher');
assert.deepEqual(open, [], `every gun line closed: ${open.map((id) => `${id} ${JSON.stringify(rows[id])}`).join('; ')}`);
for (const id of ALL_TANK_IDS) {
  const row = rows[id], launcher = getSpec(id).gun?.fixedLaunchCanisters === true;
  if (row.status === 'launcher') assert.ok(launcher && row.mouths === 0, `${id}: only a fixed-canister launcher has no cannon mouth`);
  else assert.ok(row.mouths >= 1 && (row.kind === 'turret' || row.kind === 'hull-fixed'), `${id}: a closed row covers its main-gun mouths`);
}
const count = (k, v) => ALL_TANK_IDS.filter((id) => rows[id][k] === v).length;

const run = (...args) => spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/gun-junction-census.mjs', ...args],
  { encoding: 'utf8', timeout: 900000 });
// Two rows re-measured: the M3A3's trunnion hood (r4) and a gun fixed in the hull (Strv 103A).
const live = run(`--ledger=${LEDGER}`, '--check', '--gate', '--ids=m3a3_bradley,strv103a');
assert.equal(live.status, 0, `re-measured rows match the ledger (exit ${live.status})\n${live.stdout}\n${live.stderr}`);
assert.match(live.stdout, /^strv103a: CLOSED — 1 main mouth\(s\) fixed in the hull/m, 'the hull-fixed gun is censused');

// Negative control: the ZTZ-85-III tube, seated 30 mm inside its collar, pulled 60 mm forward opens a ~30 mm junction gap.
const seeded = run('--ids=ztz85_iii', '--poses=rest', '--res-mm=4', '--azimuths=12', '--seed-recoil-m=0.06', '--gate');
assert.equal(seeded.status, 1, `the seeded tube gap must fail the gate (exit ${seeded.status})\n${seeded.stdout}\n${seeded.stderr}`);
const size = Number(seeded.stdout.match(/gun-junction ([\d.]+) mm at/)?.[1]);
assert.ok(size >= 20 && size <= 45, `the seeded 60 mm pull opens a 20-45 mm gun-junction run (read ${size} mm)\n${seeded.stdout}`);
console.log(`gun-junction-census.selftest: ${ALL_TANK_IDS.length} rows current (${count('status', 'closed')} closed, `
  + `${count('kind', 'hull-fixed')} of them fixed in the hull; ${count('status', 'launcher')} fixed-canister launchers); `
  + `m3a3_bradley and strv103a re-measured; seeded 60 mm pull read as a ${size} mm gap PASS`);
