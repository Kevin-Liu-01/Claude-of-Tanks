// fieldHutCover.selftest (physics stream DST-03, 2026-10-16; the coordinator's rulings, "what's drawn: if it looks like
// it would stop a round, it does"): the log, stone and steel huts stop shells as they are drawn; plank, canvas and brush
// do not.
//   1. The field hut, the sauna, the alpine refuge, the longhouse, the quonset and the guard post (collision.ts
//      DENSE_HUT_SLAB_KINDS; the builds their pools draw) stand their shell records as their own slabs (props.ts
//      SLAB_SHELL_KINDS, rockCollision.ts placeLocalShellSlabs) and are dense cover (collision.ts isDenseCrushableCover):
//      a round stops on one, so HE detonates there and the authority breaks the hut it stops on. Rounds fired level at
//      each hut from eight sides, three lanes, at hull and turret heights, meet its record, three in four or more within
//      0.35 m of its drawn walls. (The world collider audit on integ/226 read 23 % of the shells through a drawn field
//      hut passing it: its record was the contact band, light cover a round flies through.) The motor pool is dense on
//      its structure band, whose open bays stay open.
//   2. The lean-to, the hunting blind and the fisher shack (plank and brush), and canvas, are light cover: a round flies
//      on through them, breaking them (sim/shellLightCover.ts, authoritativeMatch.ts traceWorld), while the world's
//      raycast — the one the spotting reads — stops on a tent.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { localShellSlabs, placeLocalShellSlabs } from './rockCollision.ts';
import { rayCollisionRecord, shellPassesThroughCollisionRecord } from './collision.ts';
import { SLAB_SHELL_KINDS } from './props.ts';
import { DENSE_HUT_SLAB_KINDS } from './collision.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const normal = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };

// ---- 1. the dense huts (log, stone and steel: the coordinator's ruling, "if it looks like it would stop a round, it does")
const shooting = {};
for (const kind of DENSE_HUT_SLAB_KINDS) {
  assert.ok(SLAB_SHELL_KINDS.has(kind), `${kind}: its shells meet its own slabs`);
  const geometry = DESTRUCTIBLE_BUILDING_TYPES[kind].build(mulberry32(7));
  const slabs = localShellSlabs(geometry);
  assert.ok(slabs?.length, `${kind}: it stands slabs`);
  const X = 40, Y = 2, Z = -12, YAW = 0.6;
  const record = { min: [0, 0, 0], max: [0, 0, 0], kind, crushable: true, propIdx: 3 };
  placeLocalShellSlabs(record, slabs, X, Y, Z, YAW, 1);
  assert.equal(shellPassesThroughCollisionRecord(record), false, `${kind}: dense cover, a round stops on it`);
  const parts = record.shape2.kind === 'compound' ? record.shape2.parts.length : 1;
  assert.ok(parts <= 64, `${kind}: within the shards' part limit (${parts})`);
  // the drawn hut on the same seat
  const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(X, Y, Z); mesh.rotation.y = YAW; mesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  geometry.computeBoundingBox();
  const top = geometry.boundingBox.max.y;
  let near = 0, shots = 0;
  for (let side = 0; side < 8; side++) {
    const a = side * Math.PI / 4 + 0.1, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    for (const h of [0.8, 1.4, 2.0]) {
      if (h > top - 0.2) continue;
      for (const off of [-1, 0, 1]) {
        const origin = new THREE.Vector3(X - dir.x * 14 - dir.z * off, Y + h, Z - dir.z * 14 + dir.x * off);
        raycaster.set(origin, dir); raycaster.far = 28;
        const drawn = raycaster.intersectObject(mesh, false)[0];
        if (!drawn) continue; // (an opening the hut leaves: a doorway seen through)
        shots++;
        const hit = rayCollisionRecord(origin, dir, record, 28, normal);
        assert.ok(hit >= 0, `${kind} side ${side} at ${h} m: the round meets the hut's record`);
        if (Math.abs(hit - drawn.distance) <= 0.35) near++;
      }
    }
  }
  // (the slabs are convex hulls of six corners a level: where a hut's lean-to or log store stands out at a corner the hull
  // bridges to it, and a guard post's window slits are closed by its steel)
  assert.ok(shots >= 30 && near / shots >= 0.75, `${kind}: the rounds stop at its drawn walls (${near} of ${shots} within 0.35 m)`);
  shooting[kind] = `${near}/${shots}`;
}
// the motor pool keeps its structure band (its open bays open) and stops a round on its solid walls
assert.equal(shellPassesThroughCollisionRecord({ min: [0, 0, 0], max: [9, 4, 12], kind: 'motorpool', crushable: true }), false, 'a motor pool\'s walls stop a round');
assert.ok(!SLAB_SHELL_KINDS.has('motorpool'), 'a motor pool keeps its structure band: its open bays stay open');
// plank, canvas and brush stay light cover
for (const kind of ['leanto', 'huntingblind', 'fishershack']) {
  assert.ok(shellPassesThroughCollisionRecord({ min: [0, 0, 0], max: [3, 3, 3], kind, crushable: true }), `${kind}: light cover, a round flies through`);
}

// ---- 2. canvas
for (const kind of ['commandtent', 'deserttent', 'fieldhospital']) {
  const tent = { min: [0, 0, 0], max: [4, 3, 4], kind, crushable: true, propIdx: 9 };
  assert.ok(shellPassesThroughCollisionRecord(tent), `${kind}: canvas is light cover, a round flies on through it`);
  const sight = rayCollisionRecord(new THREE.Vector3(-5, 1.5, 2), new THREE.Vector3(1, 0, 0), tent, 20, normal);
  assert.ok(sight >= 0, `${kind}: the world's raycast (the sight line) stops on it`);
}
console.log(`fieldHutCover.selftest: the log, stone and steel huts are dense cover on their own slabs (rounds within 0.35 m of the drawn walls: ${Object.entries(shooting).map(([k, v]) => `${k} ${v}`).join(', ')}), the motor pool on its structure band; plank and canvas are light cover a round flies through and a sight line stops on`);
