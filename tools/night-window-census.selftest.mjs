import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectNightWindowCensus } from './night-window-census.mjs';
import { inspectNightWindow } from '../src/dev/nightWindowInspection.ts';
import { markWorldWindowPane } from '../src/world/worldNightEmissionGeometry.ts';

const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
material.userData.nightLightKind = 'window';
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1, 2);
for (let index = 0; index < 34; index++) {
  const pane = markWorldWindowPane(new THREE.BoxGeometry(1, 1, .03), 'curtain', [0, 0, 1]);
  const mesh = new THREE.Mesh(pane, material); mesh.position.x = index * 3; mesh.name = `pane-${index}`;
  root.add(mesh);
  if (index >= 33) continue;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, .1), new THREE.MeshBasicMaterial());
  backing.name = `buried-backing-${index}`; backing.position.set(index * 3, 0, .1); root.add(backing);
}
const before = [...root.children], previous = globalThis.window;
globalThis.window = { __DEBUG: { world: { group: root, mapId: 'fixture' }, camera,
  inspectNightWindow: () => inspectNightWindow(root, camera.position) } };
try {
  const result = await collectNightWindowCensus({ moduleUrl: 'three' });
  assert.equal(result.candidateCount, 68);
  assert.equal(result.scanned, 68);
  assert.equal(result.originalInspection, null);
  assert.equal(result.withinOriginal64, false);
  assert.equal(result.firstPassingRank, 66, 'Search bias is reported separately from true buried panes');
  assert.equal(result.rows[0].hit.owner, 'buried-backing-0');
  assert.equal(result.rows[0].frontPass, false);
  assert.equal(result.rows[0].pass, false);
  assert.equal(result.rows[66].frontPass, true);
  assert.equal(result.rows[66].reverse, null);
  const row = result.rows[66];
  assert(Math.abs(new THREE.Vector3().fromArray(row.camera).distanceTo(new THREE.Vector3().fromArray(row.point)) - Math.hypot(4, .65, .25)) < 1e-8);
  assert.deepEqual(root.children, before, 'census does not add/remove scene owners');
  assert.equal((await collectNightWindowCensus({ moduleUrl: 'three', limit: 64 })).firstPassingRank, null);
  await assert.rejects(collectNightWindowCensus({ moduleUrl: 'three', limit: 257 }), /1–256/);
} finally { globalThis.window = previous; }
for (const mesh of root.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
console.log('night-window-census: bounded same-geometry rejection owners, buried panes and nearest-64 bias PASS');
