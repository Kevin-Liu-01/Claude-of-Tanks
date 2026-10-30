// Interior fill exposure (2026-10-29, the owner's voxel blocks): a fill record measured on the current build has no
// voxel outside the body's column spans or on its shell, and the same record left behind by a skin that moved (seeded
// here by moving its lattice one and two voxels up, and one forward) is caught. challenger2 has plate faces on its
// lattice planes: re-anchoring on the record's 6-decimal origin once read 54 false on-shell voxels there.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { committedFillRecord, fillExposure, lanePending, laneScope } from './interior-fill-exposure.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

// --lane (tank:release:check): the selected ids, plus each id whose fill record line or hull/turret/gun digest moved
// against the base; an id with no record now has nothing to expose. Only the pending ids are built for digests.
{
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const row = (hull) => ({ high: { groups: { hull, turret: 't', gun: 'g', runningGear: 'r', other: 'o' } } });
  const now = { a: 'A', b: 'B', c: 'C2', d: 'D', e: 'E', f: null, g: 'G' };
  const then = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F', g: 'G' };
  const ledger = { a: row('h'), b: row('h'), c: row('h'), d: row('h'), e: row('h'), f: row('h') }; // g: new since the base
  const body = (hull) => ({ hull, turret: 't', gun: 'g' });
  assert.deepEqual(lanePending({ all, selected: ['a'], now, then }), ['b', 'd', 'e', 'g'], 'only unselected ids with an unchanged record are built');
  const digests = { b: body('h'), d: body('h2'), e: { ...body('h'), gun: 'g2' }, g: body('h') };
  const scope = laneScope({ all, selected: ['a'], now, then, ledger, digests });
  assert.deepEqual(scope.records, ['c'], 'a changed fill record is measured');
  assert.deepEqual(scope.bodies, ['d', 'e', 'g'], 'a moved hull or gun, or an id the base ledger lacks, is measured');
  assert.deepEqual(scope.ids, ['a', 'c', 'd', 'e', 'g'], 'unmoved b and record-less f are not');
  assert.deepEqual(laneScope({ all, selected: ['f'], now, then, ledger, digests: { ...digests, a: body('h') } }).ids, ['c', 'd', 'e', 'f', 'g'],
    'a selected id always runs');
  assert.ok(laneScope({ all, selected: ['f'], now, then, ledger, digests }).bodies.includes('a'), 'a pending id left unbuilt counts as moved');
}

for (const id of ['kv2', 'challenger2']) {
  const record = await committedFillRecord(id);
  assert.ok(record, `${id}: a committed fill record`);
  const tank = createTank(id, null, { proceduralOnly: true });
  try {
    const current = fillExposure({ id, record, root: tank.root });
    assert.ok(current.voxels > 0, `${id}: the record holds fill voxels`);
    assert.deepEqual([current.onShell, current.exposed], [0, 0], `${id}'s committed fills sit inside its current body`);
    if (id !== 'kv2') continue;
    const moved = (dx, dy, dz) => ({ ...record, o: [record.o[0] + dx * record.v, record.o[1] + dy * record.v, record.o[2] + dz * record.v] });
    for (const [label, seeded] of [['one voxel up', moved(0, 1, 0)], ['two voxels up', moved(0, 2, 0)], ['one voxel forward', moved(0, 0, 1)]]) {
      const r = fillExposure({ id, record: seeded, root: tank.root });
      assert.equal(r.voxels, current.voxels, `${label}: the same voxels`);
      assert.ok(r.onShell + r.exposed > 0, `${label}: a stale fill is caught (on shell ${r.onShell}, exposed ${r.exposed})`);
      assert.ok(r.box && r.centroid, `${label}: the offending region is located`);
    }
  } finally { tank.dispose?.(); }
}
console.log('interior fill exposure: --lane scope (selected, moved records and bodies); kv2 and challenger2 committed fills inside their bodies; seeded stale fills (up 1, up 2, forward 1) caught PASS');
