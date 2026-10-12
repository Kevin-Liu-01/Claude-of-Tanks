// campKit.selftest.mjs — (the destructible-kits lane, round 4, 2026-10-11; the owner: "our destructible buildings like
// the shed and bunkers that need complete redesigns") the military light kits rebuilt member by member (campKit.ts)
// keep their old record: each intact build spends exactly the old build's draws from the props stream (every later
// pool and placement keeps its seat); its collision and footprint come from the old build's solids (the shards stay);
// every member meets what holds it (no floating member, no free bar end); every part carries its piece for the settled
// wreck; the same stream builds the same kit; its caster is a solid in its own shape.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DESTRUCTIBLE_BUILDING_TYPES } from './structureKit.ts';
import { CAMP_KIT_IDS, createCampKits } from './campKit.ts';
import { auditPartContact, weldedComponents } from '../partContact.ts';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const digest = (g) => {
  const h = createHash('sha256');
  for (const [name, a] of Object.entries(g.attributes)) h.update(name).update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  return h.digest('hex');
};

// The old builds' draws (one per painted vertex) and their solids' bounds, as structureKit's first light kit built them
// (makeCheckpointHut, makeGuardPost, makeCommandTent, makeMotorPool at 5286c4319): the redesign spends exactly these and
// collides on exactly these.
const OLD = {
  checkpointhut: { draws: 192, verts: 288, bounds: [-2.349, 0, -3.15, 2.349, 3.348, 4.499] },
  guardpost: { draws: 360, verts: 540, bounds: [-1.95, 0, -1.95, 2.025, 4, 1.95] },
  commandtent: { draws: 192, verts: 276, bounds: [-3.1, -0.15, -4.1, 3.885, 5.226, 4.7] },
  motorpool: { draws: 600, verts: 1044, bounds: [-4.879, -0.075, -6.15, 4.879, 4.517, 6.15] },
};
assert.deepEqual([...CAMP_KIT_IDS].sort(), Object.keys(OLD).sort(), 'the four kits nearest the fight');

let captured = [];
const kits = createCampKits({ merge: (id, parts) => { captured = parts; return parts[0]; } });
const PIECE = /^(ground|post|leaf|sheet|block|small):[a-z0-9-]+$/;
const rows = [];
for (const id of CAMP_KIT_IDS) {
  const meta = DESTRUCTIBLE_BUILDING_TYPES[id], old = OLD[id];
  // the draw law: the props stream is left where the old build left it
  for (const seed of [5, 77]) {
    let calls = 0;
    const r = mulberry32(seed), counted = () => { calls++; return r(); };
    meta.build(counted).dispose();
    assert.equal(calls, old.draws, `${id}/${seed}: the redesign spends the old build's ${old.draws} draws (${calls})`);
  }
  // the collision and footprint from the old solids
  assert.ok(meta.collisionBuild && meta.shadowBuild, `${id}: collides on the old solids and casts through its own`);
  const solids = meta.collisionBuild();
  solids.computeBoundingBox();
  const b = solids.boundingBox;
  assert.equal(solids.getAttribute('position').count, old.verts, `${id}: the collision source is the old build`);
  [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].forEach((v, i) => assert.ok(Math.abs(v - old.bounds[i]) < 2e-3,
    `${id}: the old solids' bounds (${v.toFixed(3)} vs ${old.bounds[i]})`));
  solids.dispose();
  // deterministic in its stream
  const a = meta.build(mulberry32(31)), again = meta.build(mulberry32(31));
  assert.equal(digest(a), digest(again), `${id}: the same stream builds the same kit`);
  // every member meets what holds it
  const contact = auditPartContact(weldedComponents([a]), { tolerance: 0.02, groundY: 0.05 });
  assert.equal(contact.floating.length, 0, `${id}: no floating member (${JSON.stringify(contact.islands.slice(0, 2))})`);
  assert.equal(contact.dangling.length, 0, `${id}: no free bar end (${JSON.stringify(contact.dangling.slice(0, 2))})`);
  // every part in its piece; a piece that stays on the ground, and a body or roof that comes down
  kits[id].build(mulberry32(3));
  const pieces = captured.map((p) => p.userData.piece);
  assert.ok(pieces.every((p) => typeof p === 'string' && PIECE.test(p)), `${id}: every part names its piece`);
  const kinds = new Set(pieces.map((p) => p.split(':')[0]));
  assert.ok(kinds.has('ground'), `${id}: something stays where it stood`);
  assert.ok(kinds.has('block') || kinds.has('sheet'), `${id}: a body or a roof comes down`);
  for (const p of captured) p.dispose();
  // its caster: finite, inside its own bounds
  const caster = meta.shadowBuild();
  caster.computeBoundingBox();
  a.computeBoundingBox();
  const cb = caster.boundingBox, ab = a.boundingBox;
  assert.ok(caster.getAttribute('position').count >= 36 && caster.getAttribute('normal') && caster.getAttribute('uv'), `${id}: a caster of solids`);
  assert.ok(cb.min.x >= ab.min.x - 0.3 && cb.max.x <= ab.max.x + 0.3 && cb.min.z >= ab.min.z - 0.3 && cb.max.z <= ab.max.z + 0.3
    && cb.max.y <= ab.max.y + 0.1, `${id}: the caster stands in the kit's own shape`);
  rows.push(`${id} ${a.getAttribute('position').count / 3} tris, ${contact.components} members, ${new Set(pieces).size} pieces`);
  caster.dispose(); a.dispose(); again.dispose();
}
console.log(rows.join('\n'));
console.log('campKit.selftest: the four camp kits keep their old draws and solids, every member held, every part in its piece');
