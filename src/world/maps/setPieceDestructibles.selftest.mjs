// The vehicle set pieces break (2026-10-12, item 7; the owner: "some vehicles like the construuction vehicles and other
// stuff are not breaking on impact or being fired"). Every intact set piece is a destructible of its own, its broken build
// the piece's own wreck; the heavy plant stops a round and is wrecked by it, the light rover is crushed and broken like a
// car; the collision layer's dense list and the mass table agree; both authorities break a crushable where a round
// stops on it (the world-hit resolve), so a heavy piece is wrecked by the round it stops; the dressing hands every intact
// piece to the props. (2026-10-14, Lane C: re-applied on main 9c511dd48 as item/propsC-setpiece-break.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SET_PIECE_MASS, setPieceDestructibleKind, setPieceDestructibleTypes, isDenseSetPieceKind } from './setPieceDestructibles.ts';
import { SET_PIECE_SIZE, buildSetPiece } from './vehicleSetPieces.ts';
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
// (Lane C, #8 r2; the r2 rule, draws +0) an intact set piece draws in the baked bucket as a span its hidden pool mirrors:
// the span collapses when its instance is hidden and returns when it is shown
{
  const { HiddenSpanPiece, bindClutterBatch } = await import('../crushableClutter.ts');
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const a = buildSetPiece('lrv').toNonIndexed(), b = buildSetPiece('d8h').toNonIndexed();
  for (const g of [a, b]) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const span = new HiddenSpanPiece();
  span.ownPiece(b);
  const merged = mergeGeometries([a, b], false);
  bindClutterBatch([a, b], merged);
  const pos = merged.getAttribute('position'), first = a.getAttribute('position').count, n = b.getAttribute('position').count;
  const home = Array.from(pos.array.slice(first * 3, (first + n) * 3));
  span.setHidden(true);
  for (let i = first; i < first + n; i++) assert.ok(pos.getX(i) === home[0] && pos.getY(i) === home[1] && pos.getZ(i) === home[2], 'hidden: collapsed onto its first vertex');
  assert.equal(pos.getX(0), a.getAttribute('position').getX(0), 'the other piece untouched');
  span.setHidden(false);
  assert.deepEqual(Array.from(pos.array.slice(first * 3, (first + n) * 3)), home, 'shown: home again');
  const props = src('../props.ts');
  assert.match(props, /const spans = setPieceSpans\.get\(kind\);\s*if \(spans\) \{\s*imI\.visible = false;/, 'the set pieces\' intact pools draw nothing');
  assert.match(props, /spans\[index\]\?\.setHidden\(Math\.abs\(matrix\.determinant\(\)\) < 1e-9\);/, 'and mirror every hide and show onto the baked span');
  assert.match(props, /const g = intact\.clone\(\)\.applyMatrix4\(pool\.mats4\[rec\.slot\]\);\s*buckets\.baked\.push\(g\);/, 'each intact piece in the baked bucket at its instance pose');
}
// (Lane C, #24; the owner: "trams and wagons" break) the spurs' rolling stock as heavy destructibles: every kind a type
// with its own wreck (derailed onto the ballast, burnt, broken by kind), dense cover in the collision layer, the dressing
// hands each standing vehicle to the props on its rail pose and the props register it there
{
  const { rollingStockDestructibleTypes, rollingStockDestructibleKind, ROLLING_STOCK_MASS } = await import('./setPieceDestructibles.ts');
  const { ROLLING_STOCK_LENGTH, ROLLING_STOCK_BODY, RAIL_HEAD_M } = await import('./rollingStock.ts');
  const stock = rollingStockDestructibleTypes();
  for (const kind of Object.keys(ROLLING_STOCK_LENGTH)) {
    const key = rollingStockDestructibleKind(kind), type = stock[key];
    assert.ok(type, `${kind}: a destructible type`);
    assert.equal(type.cls, 'break'); assert.equal(type.mat, 'vehicle'); assert.equal(type.collider, true);
    assert.ok(DENSE_SET_PIECE_KINDS.has(key), `${kind}: dense cover (a round stops on it and a gun round wrecks it)`);
    assert.equal(shellPassesThroughCollisionRecord({ min: [0, 0, 0], max: [1, 1, 1], crushable: true, kind: key }), false);
    assert.equal(type.hw, ROLLING_STOCK_BODY[kind].w / 2); assert.ok(Math.abs(type.h - ROLLING_STOCK_BODY[kind].h - RAIL_HEAD_M) < 1e-9);
    assert.equal(type.crushMin, ROLLING_STOCK_MASS.crushMin);
    if (!['omm', 'g10', 'tank', 'v60'].includes(kind)) continue; // (the 1520 mm stock is placed nowhere: no build here)
    const intact = type.build(() => 0.5), broken = type.broken(() => 0.5);
    intact.computeBoundingBox(); broken.computeBoundingBox();
    assert.ok(Math.abs(intact.boundingBox.min.y - (RAIL_HEAD_M - 0.03)) < 0.02, `${kind}: the wheels on the rail head over the ground`);
    assert.ok(broken.boundingBox.min.y > -0.05 && broken.boundingBox.max.y < intact.boundingBox.max.y, `${kind}: derailed onto the ballast`);
    assert.ok(broken.boundingBox.max.x > intact.boundingBox.max.x + 0.2, `${kind}: off the rails to its right`);
    intact.dispose(); broken.dispose();
  }
  const kits = src('./mapKits.ts'), props = src('../props.ts');
  assert.match(kits, /if \(ctx\.rollingStockDestructible\) \{\s*ctx\.rollingStockDestructible\(\{ kind, x: p\.x, y: y - RAIL_HEAD_Y, z: p\.z, yaw: Math\.atan2\(p\.ux, p\.uz\), pitch \}\);\s*continue;/,
    'the dressing hands each standing vehicle to the props');
  assert.match(props, /rollingStockDestructible: \(stock\) => \{ rollingStockRecords\.push\(stock\); \}/);
  assert.match(props, /const rec = addDestructible\(kind, stock\.x, stock\.y, stock\.z, stock\.yaw, 1, -stock\.pitch, 0\);/);
}
console.log(`setPieceDestructibles: ${Object.keys(types).length} set-piece kinds breakable (${[...DENSE_SET_PIECE_KINDS].length} heavy: stop a round and are wrecked by it; the rover crushed and shot through like a car)`);
