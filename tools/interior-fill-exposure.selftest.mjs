// Interior fill exposure (2026-10-29, the owner's voxel blocks): a fill record measured on the current build has no
// voxel outside the body's column spans or on its shell, and the same record left behind by a skin that moved (seeded
// here by moving its lattice one and two voxels up, and one forward) is caught. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { committedFillRecord, fillExposure } from './interior-fill-exposure.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

const id = 'kv2';
const record = await committedFillRecord(id);
assert.ok(record, `${id}: a committed fill record`);
const tank = createTank(id, null, { proceduralOnly: true });
try {
  const moved = (dx, dy, dz) => ({ ...record, o: [record.o[0] + dx * record.v, record.o[1] + dy * record.v, record.o[2] + dz * record.v] });
  const current = fillExposure({ id, record, root: tank.root });
  assert.ok(current.voxels > 0, 'the record holds fill voxels');
  assert.deepEqual([current.onShell, current.exposed], [0, 0], `${id}'s committed fills sit inside its current body`);
  for (const [label, seeded] of [['one voxel up', moved(0, 1, 0)], ['two voxels up', moved(0, 2, 0)], ['one voxel forward', moved(0, 0, 1)]]) {
    const r = fillExposure({ id, record: seeded, root: tank.root });
    assert.equal(r.voxels, current.voxels, `${label}: the same voxels`);
    assert.ok(r.onShell + r.exposed > 0, `${label}: a stale fill is caught (on shell ${r.onShell}, exposed ${r.exposed})`);
    assert.ok(r.box && r.centroid, `${label}: the offending region is located`);
  }
} finally { tank.dispose?.(); }
console.log(`interior fill exposure: ${id}'s committed fills inside its body; seeded stale fills (up 1, up 2, forward 1) caught PASS`);
