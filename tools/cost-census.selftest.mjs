// tools/cost-census.selftest.mjs — the cost census counts a props group's draws, triangles, programs and destructible pools
// as the GPU is sent them (instanced pools × their instances, hidden groups skipped), and compares a branch to its base
// map by map against the landing limits.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { censusRow, compareRows } from './cost-census.mjs';

const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial();
const box = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
const pool = new THREE.InstancedMesh(box, mat, 10);
pool.count = 7; pool.name = 'destructible-drum';
const broken = new THREE.InstancedMesh(box, mat, 10);
broken.count = 0; broken.name = 'destructible-drum-broken';
const hidden = new THREE.Group(); hidden.visible = false; hidden.add(new THREE.Mesh(box, mat));
const two = new THREE.Mesh(box, [mat, new THREE.MeshBasicMaterial()]); two.name = 'house';
group.add(pool, broken, hidden, two);
const row = censusRow('fixture', { group, destructibles: [{ kind: 'drum' }, { kind: 'drum' }, { kind: 'crate' }], obstacles: [1, 2], colliders: [] }, 5);
assert.equal(row.draws, 1 + 2, 'a pool is one draw, a two-material mesh two; an empty pool and a hidden group none');
assert.equal(row.triangles, 7 * 12 + 12);
assert.equal(row.programs, 2);
assert.deepEqual(row.pools, { drum: { draws: 1, trisPer: 12, instances: 7 } });
assert.deepEqual(row.kinds, { drum: 2, crate: 1 });
assert.equal(row.obstacles, 2);

const base = [{ mapId: 'a', draws: 100, triangles: 50000, programs: 20, obstacles: 10, colliders: 4, pools: { drum: { draws: 1, trisPer: 88, instances: 500 } } },
  { mapId: 'b', draws: 80, triangles: 30000, programs: 18, obstacles: 9, colliders: 3, pools: {} }];
const branch = [{ mapId: 'a', draws: 100, triangles: 62000, programs: 21, obstacles: 10, colliders: 4, pools: { drum: { draws: 1, trisPer: 112, instances: 500 } } },
  { mapId: 'b', draws: 81, triangles: 80000, programs: 18, obstacles: 9, colliders: 3, pools: { crate: { draws: 1, trisPer: 100, instances: 5 } } }];
const cmp = compareRows(base, branch, { maxTris: 45000, maxDraws: 0 });
assert.equal(cmp[0].triangles, 12000);
assert.deepEqual(cmp[0].pools.drum, { tris: 12000, trisPer: [88, 112], instances: [500, 500] });
assert.equal(cmp[0].ok, true);
assert.equal(cmp[1].ok, false, 'a map over the triangle or draw limit fails');
assert.deepEqual(cmp[1].pools.crate, { tris: 500, trisPer: [0, 100], instances: [0, 5] });
console.log('cost-census selftest: rows (draws, triangles, programs, pools) and base/branch limits PASS');
