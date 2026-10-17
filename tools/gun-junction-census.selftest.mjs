import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Gun-junction census receipt (227 gun-gaps, owner 2026-10-17: "c2 ariete has gap in gun. fix any of these"). The fleet
// census at 2 mm found the background showing through the gun line on nine tanks; each was closed with real geometry
// (sleeves, cradles, collars and mantlet tails seated in their mounts), never re-baselined. This holds the nine closed at
// rest, full elevation and full depression at the cheap setting (4 mm pixels, 12 directions round each gun axis, which
// still reads every original gap: 12-268 mm from 3-7 of 12 directions), and proves the detector with a seeded defect:
// the ZTZ-85-III tube, seated 30 mm inside its collar, pulled 60 mm forward must open a gun-junction run of about 30 mm.
const FIXED = ['c2_ariete', 'ztz85_iii', 't90am', 't90m_proryv', 'pl01', 'pl01_105', 'fv510', 'fv510_milan', 'spz_wotan'];
const run = (...args) => spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/gun-junction-census.mjs',
  '--res-mm=4', '--azimuths=12', ...args], { encoding: 'utf8', timeout: 900000 });

const closed = run(`--ids=${FIXED.join(',')}`, '--gate');
assert.equal(closed.status, 0, `fixed guns must stay closed (exit ${closed.status})\n${closed.stdout}\n${closed.stderr}`);
for (const id of FIXED) {
  assert.match(closed.stdout, new RegExp(`^${id}: CLOSED — 1 main mouth\\(s\\), 3 poses`, 'm'), `${id}: closed at rest, elevation and depression`);
}

const seeded = run('--ids=ztz85_iii', '--poses=rest', '--seed-recoil-m=0.06', '--gate');
assert.equal(seeded.status, 1, `the seeded tube gap must fail the gate (exit ${seeded.status})\n${seeded.stdout}\n${seeded.stderr}`);
const size = Number(seeded.stdout.match(/gun-junction ([\d.]+) mm at/)?.[1]);
assert.ok(size >= 20 && size <= 45, `the seeded 60 mm pull opens a 20-45 mm gun-junction run (read ${size} mm)\n${seeded.stdout}`);
console.log(`gun-junction-census.selftest: ${FIXED.length} guns closed at rest/elevation/depression; seeded 60 mm pull read as a ${size} mm gun-junction gap PASS`);
