// fieldHutCover.selftest (physics stream DST-03, 2026-10-16; the coordinator's rulings): a field hut stops shells as it is
// drawn, and canvas does not.
//   1. A field hut (structureKit.ts makeFieldHut, the build its pool draws) stands its shell record as its own slabs
//      (props.ts SLAB_SHELL_KINDS, rockCollision.ts placeLocalShellSlabs) and is dense cover (collision.ts
//      isDenseCrushableCover): a round stops on it, so HE detonates there and the authority breaks the hut it stops on.
//      Shells fired level at its walls from eight sides at hull and turret heights stop on the record, four in five
//      within 0.35 m of the drawn timber and every one within 0.9 m; one aimed past it meets neither. (The world collider audit on integ/226 read 23 % of the shells
//      through a drawn field hut passing it: its record was the contact band, light cover a round flies through.)
//   2. Canvas is shoot-through for shells and blocks sight: a command tent's and a desert tent's records are light cover
//      (a round flies on through them, breaking them: sim/shellLightCover.ts, authoritativeMatch.ts traceWorld), while
//      the world's raycast — the one the spotting reads — stops on them.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { localShellSlabs, placeLocalShellSlabs } from './rockCollision.ts';
import { rayCollisionRecord, shellPassesThroughCollisionRecord } from './collision.ts';
import { SLAB_SHELL_KINDS } from './props.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const normal = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };

// ---- 1. the field hut
assert.ok(SLAB_SHELL_KINDS.has('fieldhut'), 'a field hut\'s shells meet its own slabs');
const geometry = DESTRUCTIBLE_BUILDING_TYPES.fieldhut.build(mulberry32(7));
const slabs = localShellSlabs(geometry);
assert.ok(slabs?.length, 'the hut stands slabs');
const X = 40, Y = 2, Z = -12, YAW = 0.6;
const record = { min: [0, 0, 0], max: [0, 0, 0], kind: 'fieldhut', crushable: true, propIdx: 3 };
placeLocalShellSlabs(record, slabs, X, Y, Z, YAW, 1);
assert.equal(shellPassesThroughCollisionRecord(record), false, 'a field hut is dense cover: a round stops on it');
// the drawn hut on the same seat
const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
mesh.position.set(X, Y, Z); mesh.rotation.y = YAW; mesh.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
geometry.computeBoundingBox();
const box = geometry.boundingBox, top = box.max.y;
let stopped = 0, shots = 0, worst = 0;
for (let side = 0; side < 8; side++) {
  const a = side * Math.PI / 4, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  for (const h of [0.8, 1.4, 2.0]) {
    if (h > top - 0.2) continue;
    const origin = new THREE.Vector3(X - dir.x * 12, Y + h, Z - dir.z * 12);
    raycaster.set(origin, dir); raycaster.far = 24;
    const drawn = raycaster.intersectObject(mesh, false)[0];
    if (!drawn) continue; // (an opening the hut leaves: a doorway seen through)
    shots++;
    const hit = rayCollisionRecord(origin, dir, record, 24, normal);
    assert.ok(hit >= 0, `side ${side} at ${h} m: the round meets the hut's record`);
    worst = Math.max(worst, Math.abs(hit - drawn.distance));
    if (Math.abs(hit - drawn.distance) <= 0.35) stopped++; else if (process.env.HUT_DEBUG) console.log(`side ${side} h ${h}: record ${hit.toFixed(2)} drawn ${drawn.distance.toFixed(2)}`);
  }
}
// (the slabs are convex hulls of six corners a level: where the hut's lean-to and its log store stand out at a corner the
// hull bridges to them, up to 0.9 m off the wall on that diagonal)
assert.ok(shots >= 16 && stopped / shots >= 0.8 && worst <= 0.9, `the rounds stop at the drawn walls (${stopped} of ${shots} within 0.35 m; worst ${worst.toFixed(2)} m)`);
const past = new THREE.Vector3(X - 12, Y + 1.2, Z + 9);
assert.equal(rayCollisionRecord(past, new THREE.Vector3(1, 0, 0), record, 24, normal), -1, 'a round past the hut meets nothing');

// ---- 2. canvas
for (const kind of ['commandtent', 'deserttent', 'fieldhospital']) {
  const tent = { min: [0, 0, 0], max: [4, 3, 4], kind, crushable: true, propIdx: 9 };
  assert.ok(shellPassesThroughCollisionRecord(tent), `${kind}: canvas is light cover, a round flies on through it`);
  const sight = rayCollisionRecord(new THREE.Vector3(-5, 1.5, 2), new THREE.Vector3(1, 0, 0), tent, 20, normal);
  assert.ok(sight >= 0, `${kind}: the world's raycast (the sight line) stops on it`);
}
console.log(`fieldHutCover.selftest: a field hut is dense cover on its own slabs (${slabs.length}): ${stopped} of ${shots} level rounds stop within 0.35 m of its drawn walls (worst ${worst.toFixed(2)} m); canvas tents are light cover a round flies through and a sight line stops on`);
