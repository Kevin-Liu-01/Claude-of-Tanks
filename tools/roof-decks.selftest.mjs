// Decks (physics stream F2, 2026-10-13; the owner: "if they land on top of buildings or other weird objects"): a
// building's movement record carries what a hull stands on up there — its roof coverings and raised tops — as floor-only
// parts with drawn tops (world/structureCollision.ts structureDecks, world/collision.ts collisionPartIsDeck). A house of
// four walls under a gable roof that overhangs them: the roof is a deck whose top is the gable within centimetres; the
// footprint certification leaves it out; a hull dropped onto the roof stands on it (it fell into the house before); a
// hull on the ground beside the house meets the walls, never the eave over its turret; the same run twice is the same.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import {
  appendStructureCollisionBand, certifyStructureCollisionProfile, deriveRuntimeStructureCollisionProfile, mergeStructureDecks,
} from '../src/world/structureCollision.ts';
import { collisionPartIsDeck, collisionPartTopAt } from '../src/world/collision.ts';

await ensureAuthorityFleet(['t90m']);

// a 10 x 8 m house: four 0.3 m walls 4 m tall, and a gable roof from 4 m at the eaves (0.6 m past the walls) to 6.5 m
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const walls = [box(10, 4, 0.3, 0, 2, -4), box(10, 4, 0.3, 0, 2, 4), box(0.3, 4, 8, -5, 2, 0), box(0.3, 4, 8, 5, 2, 0)];
function gable(halfW, halfD, eave, ridge, thick) {
  // a slab under each pitch: top surface eave (z = ±halfD) to ridge (z = 0), `thick` deep; ridge along x
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const s of [-1, 1]) {
    const tE = [halfW * s, eave, halfD * s], tR = [halfW * s, ridge, 0];
    const p = (x, y, z) => [x, y, z];
    const top = [p(-halfW, eave, halfD * s), p(halfW, eave, halfD * s), p(halfW, ridge, 0), p(-halfW, ridge, 0)];
    const bot = top.map(([x, y, z]) => [x, y - thick, z]);
    quad(top[0], top[1], top[2], top[3]);
    quad(bot[3], bot[2], bot[1], bot[0]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[j], top[i], bot[i], bot[j]); }
    void tE; void tR;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return mergeVertices(g);
}
const roof = gable(5.6, 4.6, 4, 6.5, 0.2);
const buckets = { walls, roof: [roof] };
const profile = deriveRuntimeStructureCollisionProfile(buckets);
const contact = profile.contact;
assert.ok(contact.decks >= 1, `the roof rides the contact band as a deck (${contact.decks})`);
const record = appendStructureCollisionBand([], contact, 0, 0, 30, 0);
record.kind = 'structure';
// laid out on its ground band alone (placement reads that), its decks held apart until the props are built
assert.ok(record.shape2.parts.every((part) => !part.tp) && record.deckParts?.length === contact.decks, 'the decks wait apart while the world is laid out');
assert.ok(record.max[1] < 4.5, `the record stands to its walls while laid out (${record.max[1].toFixed(2)} m)`);
assert.equal(mergeStructureDecks([record]), 1, 'and join it when the props are built');
assert.ok(!record.deckParts && record.max[1] > 6.4, `its top raised to the ridge (${record.max[1].toFixed(2)} m)`);
const parts = record.shape2.parts;
const decks = parts.filter((part) => collisionPartIsDeck(record, part));
assert.equal(decks.length, contact.decks, 'every deck part is a deck to the push and the routes');
// the gable within 5 cm over the roof (z = 30 + dz): eave 4 m at |dz| = 4.6, ridge 6.5 m
let worst = 0, checked = 0;
for (let dx = -5; dx <= 5; dx += 1) for (let dz = -4.4; dz <= 4.4; dz += 0.4) {
  const drawn = 6.5 - (6.5 - 4) * Math.abs(dz) / 4.6;
  let top = -Infinity;
  for (const part of decks) {
    const inside = (() => { const p = part.points; let sign = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; const c = (p[j] - p[i]) * (30 + dz - p[i + 1]) - (p[j + 1] - p[i + 1]) * (dx - p[i]); if (Math.abs(c) < 1e-9) continue; const s = c > 0 ? 1 : -1; if (!sign) sign = s; else if (s !== sign) return false; } return true; })();
    if (inside) top = Math.max(top, collisionPartTopAt(record, part, dx, 30 + dz));
  }
  if (!Number.isFinite(top)) continue;
  worst = Math.max(worst, Math.abs(top - drawn));
  checked++;
}
assert.ok(checked > 80 && worst < 0.05, `the deck's top is the gable (${checked} points, worst ${(worst * 100).toFixed(1)} cm)`);
// the footprint certification scores the ground-contact parts alone
const cert = certifyStructureCollisionProfile(buckets, profile);
assert.ok(cert.contact.score > 0.5, `the walls' footprint certifies without the deck (${cert.contact.score.toFixed(2)})`);

// a hull dropped onto the roof, along the ridge: it stands on the roof, not in the house
const flat = () => 0;
let minY = Infinity;
const drop = runCase('t90m', 'earth', { id: 'roof-drop', terrain: flat, obstacles: [record], seconds: 4, rest: true,
  spawn: { x: 0, z: 30, yaw: Math.PI / 2, dropTo: 1.5 }, input: () => ({ throttle: 0 }), allowBlocked: true }, { replay: false,
  trace: (tick, match) => { if (tick > 120) minY = Math.min(minY, match.entityById.get('subject').state.pos.y); } });
assert.ok(minY > 5.5, `a hull dropped onto the roof stands on it (${minY.toFixed(2)} m; the ridge 6.5 m)`);
// a hull driven past the house beside its wall, its turret under the eave: the walls stop it, the eave never does
let maxXZ = 0;
const pass = runCase('t90m', 'earth', { id: 'eave-pass', terrain: flat, obstacles: [record], seconds: 6,
  spawn: { x: -14, z: 30 - 4.3 - 2.2, yaw: Math.PI / 2 }, input: () => ({ throttle: 1 }), allowBlocked: true }, { replay: false,
  trace: (tick, match) => { const s = match.entityById.get('subject').state; maxXZ = Math.max(maxXZ, s.pos.x); } });
assert.ok(maxXZ > 8, `a hull beside the wall drives on under the eave (x ${maxXZ.toFixed(1)})`);
assert.ok(pass.popXZMaxM <= 0.12 && pass.obstaclePenMaxM <= 0.1, `and is not pushed by it (${pass.popXZMaxM.toFixed(3)} / ${pass.obstaclePenMaxM.toFixed(3)} m)`);
// deterministic
const again = runCase('t90m', 'earth', { id: 'roof-drop', terrain: flat, obstacles: [record], seconds: 4, rest: true,
  spawn: { x: 0, z: 30, yaw: Math.PI / 2, dropTo: 1.5 }, input: () => ({ throttle: 0 }), allowBlocked: true }, { replay: false });
assert.deepEqual(again.final, drop.final, 'the same drop, the same pose');
console.log(`roof-decks.selftest: a gable roof rides its house's movement record as ${contact.decks} deck part(s), its top within ${(worst * 100).toFixed(1)} cm; a hull dropped on it stands at ${minY.toFixed(2)} m; one beside the wall drives on under the eave; deterministic`);
