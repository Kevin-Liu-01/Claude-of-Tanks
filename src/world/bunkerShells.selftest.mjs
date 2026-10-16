// bunkerShells.selftest (physics stream, 2026-10-16; the coordinator: "rounds enter the drawn embrasures and doors ... the
// owner's bunkers-r2 is the visual bar, so the openings are real and must behave that way"): every map's concrete pillbox
// (Regelbau, DOT, hex: maps/fortKit.ts) stands its shell record as its authored layout (fortKit.ts pillboxShellParts,
// bandShells.ts), against the drawn work its pool draws (buildPillbox):
//   1. a round fired straight in at any point of an embrasure's mouth meets no record before the drawn throat (its steel
//      plate, or the room behind an open throat): the embrasures are open as drawn — on the slab shells every one stopped
//      short of the throat;
//   2. a round fired in at the door from the way in goes past the wall's face to the drawn steel leaf, and one fired out
//      from the room meets the leaf's back;
//   3. rounds fired level at the work from 32 sides, 5 lanes, every 0.2 m of its height meet its record within 0.35 m of
//      the drawn concrete three times in four or more (as well as the slabs, or better);
//   4. at most 64 parts a work, still fortified cover; the log and earth work keeps its slabs (pillboxShellParts null).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPillbox, fortFor, pillboxDoorway, pillboxEmbrasures, pillboxShellParts } from './maps/fortKit.ts';
import { pillboxShellBand, placeLocalShellBand } from './bandShells.ts';
import { localShellSlabs, placeLocalShellSlabs } from './rockCollision.ts';
import { rayCollisionRecord, shellPassesThroughCollisionRecord } from './collision.ts';
import { MAP_IDS } from './maps/index.ts';

const normal = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
const styles = new Map();
for (const id of MAP_IDS) { const fort = fortFor(id); if (fort && !styles.has(fort.style)) styles.set(fort.style, fort); }
assert.ok(styles.size >= 3, 'the maps build their pillboxes');
const lines = [];
for (const [style, fort] of styles) {
  if (style === 'logearth') { assert.equal(pillboxShellParts(style), null, 'the log and earth work keeps its slabs'); continue; }
  const geometry = buildPillbox(style, fort.tones, fort.seed, false);
  geometry.computeBoundingBox();
  const top = geometry.boundingBox.max.y;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const record = { min: [0, 0, 0], max: [0, 0, 0], kind: 'bunker', crushable: true, propIdx: 1 };
  placeLocalShellBand(record, pillboxShellBand(style), 0, 0, 0, 0);
  const slabs = { min: [0, 0, 0], max: [0, 0, 0], kind: 'bunker' };
  placeLocalShellSlabs(slabs, localShellSlabs(geometry), 0, 0, 0, 0, 1);
  const parts = record.shape2.kind === 'compound' ? record.shape2.parts.length : 1;
  assert.ok(parts <= 64, `${style}: within 64 parts (${parts})`);
  assert.equal(shellPassesThroughCollisionRecord(record), false, `${style}: still fortified cover (a round stops on it)`);
  const raycaster = new THREE.Raycaster();
  const drawnAt = (origin, dir) => { raycaster.set(origin, dir); raycaster.far = 30; return raycaster.intersectObject(mesh, false)[0]?.distance ?? Infinity; };
  // 1. the embrasures
  let rounds = 0;
  for (const e of pillboxEmbrasures(style)) {
    const tx = -e.nz, tz = e.nx, dir = new THREE.Vector3(-e.nx, 0, -e.nz);
    for (const u of [-0.3, 0, 0.3]) for (const v of [-0.3, 0, 0.3]) {
      const origin = new THREE.Vector3(e.x + e.nx * 6 + tx * u * e.hw, e.y + v * e.hh, e.z + e.nz * 6 + tz * u * e.hw);
      const drawn = drawnAt(origin, dir), hit = rayCollisionRecord(origin, dir, record, 30, normal);
      assert.ok(drawn > 6.2, `${style}: the drawn mouth is open at (${u}, ${v}) (${drawn.toFixed(2)} m to the first drawn face of 6)`);
      assert.ok(hit < 0 || hit >= drawn - 0.35, `${style}: a round into the embrasure at ${e.x.toFixed(2)}, ${e.z.toFixed(2)} (${u}, ${v}) meets no record before the drawn throat (${hit.toFixed(2)} of ${drawn.toFixed(2)} m)`);
      const slab = rayCollisionRecord(origin, dir, slabs, 30, normal);
      assert.ok(slab >= 0 && slab < drawn - 0.35, `${style}: (the slabs stopped it short of the throat: ${slab.toFixed(2)} of ${drawn.toFixed(2)} m)`);
      rounds++;
    }
  }
  // 2. the doorway
  const door = pillboxDoorway(style);
  assert.ok(door, `${style}: its door`);
  const tx = -door.nz, tz = door.nx;
  for (const u of [-0.5, 0, 0.5]) for (const y of [0.5, 0.9, 1.4]) {
    const at = (d) => new THREE.Vector3(door.x + door.nx * d + tx * u * door.hw, y, door.z + door.nz * d + tz * u * door.hw);
    const inward = new THREE.Vector3(-door.nx, 0, -door.nz), outward = new THREE.Vector3(door.nx, 0, door.nz);
    const drawnIn = drawnAt(at(1), inward), hitIn = rayCollisionRecord(at(1), inward, record, 30, normal);
    assert.ok(Math.abs(drawnIn - (1 + door.leaf)) < 0.06, `${style}: the drawn leaf stands ${door.leaf} m in (${drawnIn.toFixed(2)} m from 1 m out)`);
    assert.ok(hitIn > 1.1 && Math.abs(hitIn - drawnIn) <= 0.12, `${style}: a round in at the door (${u}, ${y}) goes in past the face to the leaf (${hitIn.toFixed(2)} of ${drawnIn.toFixed(2)} m)`);
    const from = 2.2, drawnOut = drawnAt(at(-from), outward), hitOut = rayCollisionRecord(at(-from), outward, record, 30, normal);
    assert.ok(Math.abs(hitOut - drawnOut) <= 0.12, `${style}: a round out from the room (${u}, ${y}) meets the leaf's back (${hitOut.toFixed(2)} of ${drawnOut.toFixed(2)} m)`);
    rounds++;
  }
  // 3. the walls
  let near = 0, shots = 0, slabNear = 0;
  for (let side = 0; side < 32; side++) {
    const a = side * Math.PI / 16 + 0.05, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    for (let h = 0.3; h < top; h += 0.2) for (const off of [-1.2, -0.6, 0, 0.6, 1.2]) {
      const origin = new THREE.Vector3(-dir.x * 14 - dir.z * off, h, -dir.z * 14 + dir.x * off);
      const drawn = drawnAt(origin, dir);
      if (drawn === Infinity) continue;
      shots++;
      const hit = rayCollisionRecord(origin, dir, record, 30, normal);
      if (hit >= 0 && Math.abs(hit - drawn) <= 0.35) near++;
      const slab = rayCollisionRecord(origin, dir, slabs, 30, normal);
      if (slab >= 0 && Math.abs(slab - drawn) <= 0.35) slabNear++;
    }
  }
  assert.ok(near / shots >= 0.75 && near >= slabNear, `${style}: the rounds meet it at the drawn concrete (${near} of ${shots} within 0.35 m; the slabs ${slabNear})`);
  lines.push(`${style} ${parts} parts, ${rounds} embrasure and door rounds in, ${near}/${shots} at the walls (slabs ${slabNear})`);
}
console.log(`bunkerShells.selftest: ${lines.join('; ')}`);
