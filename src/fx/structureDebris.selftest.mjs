// structureDebris.selftest.mjs — a thrown piece lies where its flight meets the ground, and a piece laid still on a
// standing building is part of that building (destruction stream, 2026-10-12; the owner's Steinburg screenshot: "rows of
// brick chunks hanging in the air in strips ... make sure ... their rubble properly falls down onto ground that can
// potentially be uneven").
//
// Before: the piece program clamped a piece to the ground read under its SPAWN point and let it slide on at that height
// (a collapse's pieces lay in a flat ring at the heap plateau's height, in the air past its skirt), and a damaged roof's
// slipped tiles were still pool pieces that outlived the roof and the building.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PIECE_DRAG, createStructureDebris, pieceLanding } from './structureDebris.ts';

const out = new Float64Array(4);

// ---- flat ground: the flight's own law (drag k, gravity), landing when the centre is half a piece over the ground
{
  const half = 0.06;
  const t = pieceLanding(0, 5, 0, 2, 0, 0, half, () => 0, out);
  const expectT = Math.sqrt((5 - half) / 4.9);
  assert.ok(Math.abs(t - expectT) < 0.01, `lands when it falls to the ground: ${t} vs ${expectT}`);
  const expectX = 2 * (1 - Math.exp(-PIECE_DRAG * t)) / PIECE_DRAG;
  assert.ok(Math.abs(out[2] - expectX) < 1e-6 && Math.abs(out[3]) < 1e-9, 'its landing point is on its flight');
  assert.equal(out[1], 0, 'the ground there');
}

// ---- a step down (a heap's plateau, then the street 2 m below): thrown off the plateau it lands on the street, never
// at the plateau's height (the strips)
{
  const ground = (x) => (x < 3 ? 2 : 0);
  const half = 0.08;
  const t = pieceLanding(2.4, 2 + half + 0.4, 0, 3.5, 1.2, 0, half, ground, out);
  assert.ok(Number.isFinite(t), 'it lands');
  assert.ok(out[2] > 3, `it carries past the edge (${out[2].toFixed(2)})`);
  assert.equal(out[1], 0, 'and lies on the street, not on an invisible plateau');
}

// ---- a slope: the landing height is the slope's at the landing point
{
  const ground = (x, z) => 0.4 * x + 0.1 * z;
  pieceLanding(0, 6, 0, 1.5, 0.5, -0.8, 0.05, ground, out);
  assert.ok(Math.abs(out[1] - ground(out[2], out[3])) < 1e-9, 'the slope under where it lands');
}

// ---- a piece that starts in the ground (laid in a rising heap) lies on its surface at once; one that never comes down
// within the horizon says so
{
  const t0 = pieceLanding(0, 0.5, 0, 1, 0, 0, 0.1, () => 1, out);
  assert.equal(t0, 0, 'already under the ground: it lies there at once');
  assert.equal(out[1], 1);
  const tInf = pieceLanding(0, 10, 0, 0, 0, 0, 0.1, () => -1e6, out, 2);
  assert.equal(tInf, Infinity, 'no ground within the horizon');
}

// ---- the writer: a thrown piece carries its landing to the program; a still piece on a standing building becomes a box in
// the building's own run (tagged, so it falls and folds with it), not a pool piece that outlives it
{
  const ground = (x) => (x < 2 ? 3 : 0.5);
  let now = 10;
  const debris = createStructureDebris({ now: () => now, groundY: ground, baseGroundY: ground, poolCapacity: 16, pieceCap: 64 });
  const brick = new THREE.MeshStandardMaterial({ name: 'stone' });
  const placement = { x: 0, y: 3, z: 0, yaw: 0 };
  const w = debris.begin(placement, () => brick, 0, false, { tag: 32768 + 5 });
  assert.ok(w.pieces.push('stone', 'brick', 0, 0, 1, 0, 0, 0, 0, 1, 0.3, 0.3, 0.3, 1, 1, 1, 7, 0.5, 0), 'a thrown piece');
  assert.ok(w.pieces.push('roof', 'tile', 0, 0.5, 6, 0, 0, 0, 0, 1, 0.2, 0.012, 0.36, 1, 1, 1, 0, 0, 0), 'a still tile on the roof');
  assert.equal(w.pieces.count, 1, 'only the thrown piece takes a pool slot');
  const made = debris.commit();
  const rim = made.find((m) => m.name === 'fx-structure-rim-roof');
  assert.ok(rim, 'the still tile is laid in the building\'s roof run');
  assert.equal(rim.geometry.getAttribute('position').count, 24, 'as one box');
  assert.equal(rim.geometry.getAttribute('aDamage').getX(0), 32768 + 5, 'tagged: it falls and folds with the building');
  const pool = debris.group.children.find((m) => m.name === 'fx-structure-pieces-brick');
  assert.ok(pool, 'the thrown brick has its pool');
  const g = pool.geometry;
  const tLand = g.getAttribute('aLD').getX(0), restGround = g.getAttribute('aCG').getW(0);
  assert.ok(Number.isFinite(tLand) && tLand > 0 && tLand < 5, `it lands (${tLand})`);
  assert.equal(restGround, 0.5, 'on the ground where it lands, below the plateau it was thrown from');
  // a settled stage (a late joiner) lays the still piece too, and throws nothing
  const s = debris.begin(placement, () => brick, 0, true, { tag: 32768 + 5 });
  assert.ok(s.pieces.push('roof', 'tile', 0, 0.5, 6, 0.2, 0, 0, 0, 1, 0.2, 0.012, 0.36, 1, 1, 1, 0, 0, 0), 'a settled stage keeps its still tile');
  assert.equal(s.pieces.push('stone', 'brick', 0, 0, 1, 0, 0, 0, 0, 1, 0.3, 0.3, 0.3, 1, 1, 1, 4, 0.5, 0), false, 'and throws nothing');
  assert.equal(debris.commit().length, 1);
  // an untagged stage (a collapse's own pile) keeps still pieces in the pool where they lie
  const c = debris.begin(placement, () => brick, 0, false, {});
  assert.ok(c.pieces.push('stone', 'block', 0, 3, 0, 0, 0, 0, 0, 1, 0.3, 0.3, 0.3, 1, 1, 1, 0, 0, 0));
  assert.equal(c.pieces.count, 1, 'a collapse pile\'s still piece stays a piece');
  debris.commit();
  now += 1;
  debris.update();
  debris.reset();
}

console.log('structureDebris selftest: ok');
