// The vehicle set pieces break (2026-10-12, item 7; the owner: "some vehicles like the construuction vehicles and other
// stuff are not breaking on impact or being fired"). Every intact set piece is a destructible of its own, its broken build
// the piece's own wreck; the heavy plant stops a round and is wrecked by it, the light rover is crushed and broken like a
// car; the collision layer's dense list and the mass table agree; both authorities break a crushable where a round
// stops on it (the world-hit resolve), so a heavy piece is wrecked by the round it stops; the dressing hands every intact
// piece to the props. (2026-10-14, Lane C: re-applied on main 9c511dd48 as item/propsC-setpiece-break.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SET_PIECE_MASS, setPieceDestructibleKind, setPieceDestructibleTypes, isDenseSetPieceKind } from './setPieceDestructibles.ts';
import { SET_PIECE_SIZE } from './vehicleSetPieces.ts';
import { DENSE_SET_PIECE_KINDS, shellPassesThroughCollisionRecord } from '../collision.ts';

const types = setPieceDestructibleTypes();
for (const kind of Object.keys(SET_PIECE_SIZE)) {
  const key = setPieceDestructibleKind(kind), type = types[key], size = SET_PIECE_SIZE[kind], mass = SET_PIECE_MASS[kind];
  assert.ok(type, `${kind}: a destructible type`);
  assert.equal(type.cls, 'break'); assert.equal(type.mat, 'vehicle', `${kind}: burns and crushes as a map vehicle`);
  assert.equal(type.contact, 'ob'); assert.equal(type.collider, true, `${kind}: a round meets it (the rover too)`);
  assert.equal(type.groundPose, true, `${kind}: seated on the ground under its corners`);
  assert.equal(type.hw, size.hw); assert.equal(type.hl, size.hl); assert.equal(type.h, size.h);
  assert.ok(mass.keep > 0 && mass.keep < 1 && mass.crushMin > 0, `${kind}: a mass class`);
  assert.equal(DENSE_SET_PIECE_KINDS.has(key), mass.dense, `${kind}: the collision layer's dense list matches the mass table`);
  assert.equal(isDenseSetPieceKind(key), mass.dense);
  const intact = type.build(() => 0.5), broken = type.broken(() => 0.5);
  assert.ok(intact.getAttribute('position').count > 100 && broken.getAttribute('position').count > 100, `${kind}: intact and wrecked builds`);
  assert.ok(intact.getAttribute('color'), `${kind}: its own painted vertex colours`);
  intact.dispose(); broken.dispose();
  // the shell rules on its collision record
  const record = { min: [0, 0, 0], max: [1, 1, 1], crushable: true, crushed: false, kind: key };
  if (mass.dense) {
    assert.equal(shellPassesThroughCollisionRecord(record), false, `${kind}: stops a round (real cover)`);
  } else {
    assert.equal(shellPassesThroughCollisionRecord(record), true, `${kind}: a round breaks it and flies on, as through a car`);
  }
}
// heavy plant is harder to crush than the rover, and slows a hull more
assert.ok(SET_PIECE_MASS.haulpak.crushMin > SET_PIECE_MASS.bv206.crushMin && SET_PIECE_MASS.bv206.crushMin > SET_PIECE_MASS.lrv.crushMin);
assert.ok(SET_PIECE_MASS.haulpak.keep < SET_PIECE_MASS.lrv.keep);
// other cover is unchanged: a stone wall stops a round; a fence is shot through
assert.equal(shellPassesThroughCollisionRecord({ min: [0, 0, 0], max: [1, 1, 1], crushable: true, kind: 'wallstone' }), false);
assert.equal(shellPassesThroughCollisionRecord({ min: [0, 0, 0], max: [1, 1, 1], crushable: true, kind: 'fence' }), true);
// both authorities break the crushable a round stops on (so a heavy piece is wrecked where the round stops on it); the
// dressing hands intact pieces to the props
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(src('../../game/state.ts'), /function resolveWorldShellImpact\([^)]*\): void \{[\s\S]{0,240}crushWorldPropFromShell\(world, bus, shell, hit, game\._fortified\);/);
assert.match(src('../../sim/authoritativeMatch.ts'), /function resolveWorldShellHit\([^)]*\): void \{[\s\S]{0,240}destroyShellObstacle\(shell, worldHit\);/);
assert.match(src('../../sim/authoritativeMatch.ts'), /function destroyShellObstacle\([^)]*\): void \{\s*const obstacle = obstacleForWorldHit\(worldHit\);\s*if \(!obstacle\?\.crushable\) return;/);
assert.match(src('./mapKits.ts'), /if \(!piece\.wrecked && ctx\.setPieceDestructible\) \{ ctx\.setPieceDestructible\(piece\); continue; \}/);
assert.match(src('../props.ts'), /setPieceDestructible: \(piece\) => \{ setPieceRecords\.push\(piece\); \}/);
console.log(`setPieceDestructibles: ${Object.keys(types).length} set-piece kinds breakable (${[...DENSE_SET_PIECE_KINDS].length} heavy: stop a round and are wrecked by it; the rover crushed and shot through like a car)`);
