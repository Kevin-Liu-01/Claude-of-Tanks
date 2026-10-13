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
import { createDebrisChunks, makeChunkPiece } from './debrisChunks.ts';

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

// ---- a clod thrown up off the ground it starts in (a crater's floor) flies, and lands where its flight comes down
{
  const t = pieceLanding(0, 0.02, 0, 2, 5, 0, 0.1, () => 0, out);
  assert.ok(t > 0.8 && out[2] > 1, `it flies before it lands (${t.toFixed(2)} s, ${out[2].toFixed(2)} m)`);
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

// ---- a high piece takes long steps until it nears the ground (a collapse throws hundreds in one frame): a brick off a
// 12 m eave lands where the closed form says, on fewer than a third of the ground reads a 1/24 s walk took
{
  let reads = 0;
  const flat = () => { reads++; return 0; };
  const half = 0.1, k = PIECE_DRAG;
  const t = pieceLanding(0, 12, 0, 2.5, 1, 0, half, flat, out);
  // the closed form's fall: 12 + 1·(1 − e^(−kt))/k − 4.9 t² = the piece's half height above the ground (the bisection
  // brackets the 1/24 s step to 0.65 ms: under 2 cm at the fall's 16 m/s)
  const y = (s) => 12 + (1 - Math.exp(-k * s)) / k - 4.9 * s * s - half;
  assert.ok(Math.abs(y(t)) < 0.02, `it lands where its flight meets the ground (${y(t).toFixed(4)} m off)`);
  const walked = Math.ceil(t * 24) + 7;
  assert.ok(reads * 3 <= walked, `on ${reads} ground reads (a 1/24 s walk: ${walked})`);
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
  // (2026-10-13) a piece thrown a metre up lands after the collapse's frame: its landing is solved in the next update,
  // not in the frame that threw it (LANDING_DEFER_S), and the program flies it until then
  assert.equal(g.getAttribute('aLD').getX(0), 1e4, 'its landing waits for the next update');
  debris.update();
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

// ---- the blasts' chunks (debrisChunks: a wall's bricks, a field's clods, a prop's planks) land the same way: given the
// ground as drawn, a chunk thrown off a 2 m bank lies on the street below, not at the bank's height
{
  let t = 0;
  const ground = (x) => (x < 1 ? 2 : 0);
  const chunks = createDebrisChunks({ seed: 3, now: () => t, groundAt: ground });
  const k = makeChunkPiece();
  Object.assign(k, { shape: 'brick', x: 0, y: 2.3, z: 0, vx: 4, vy: 1, vz: 0, life: 6, scale: 0.25, groundY: 2, drag: 0.3 });
  chunks.emit(k);
  chunks.update();
  const pool = chunks.group.children.find((m) => m.name === 'fx-chunks-brick');
  const g = pool.geometry;
  assert.ok(g.getAttribute('aLT').getX(0) > 0, 'its landing age is carried');
  assert.equal(g.getAttribute('aSG').getY(0), 0, 'and the ground where it lands: the street');
  // without a ground sampler a chunk keeps its recipe's ground (the legacy law, a negative landing)
  const legacy = createDebrisChunks({ seed: 3, now: () => t });
  legacy.emit(k);
  const lg = legacy.group.children.find((m) => m.name === 'fx-chunks-brick').geometry;
  assert.ok(lg.getAttribute('aLT').getX(0) < 0);
}


// ---- (2026-10-13, the bar for deploy 223: a collapse costs its frame at most 3 ms over production) a collapse's hundreds
// of pieces solve their landings over the frames after it, each before it lands: the frame that throws them solves only
// those about to land
{
  let now = 0;
  let reads = 0;
  const ground = () => { reads++; return 0; };
  const debris = createStructureDebris({ now: () => now, groundY: ground, baseGroundY: ground, poolCapacity: 256, pieceCap: 1024 });
  const mat = new THREE.MeshStandardMaterial({ name: 'stone' });
  const w = debris.begin({ x: 0, y: 0, z: 0, yaw: 0 }, () => mat, 0, false, {});
  for (let k = 0; k < 600; k++) w.pieces.push('stone', 'chunk', k % 3, (k % 20) * 0.5, 1 + (k % 9), 0, 0, 0, 0, 1, 0.3, 0.3, 0.3, 1, 1, 1, 1, 0.5, 0.3);
  debris.commit();
  const atThrow = reads;
  assert.ok(atThrow < 2000, `the throwing frame reads the ground ${atThrow} times (each piece once, the near ones' flights)`);
  const pools = debris.group.children.filter((m) => /fx-structure-pieces/.test(m.name));
  const late = () => { let n = 0; for (const m of pools) { const a = m.geometry.getAttribute('aLD'), b = m.geometry.getAttribute('aPB');
    for (let i = 0; i < m.geometry.instanceCount; i++) if (a.getX(i) > 1e3 && b.getW(i) + 0.05 < now) n++; } return n; };
  let frames = 0;
  for (; frames < 60; frames++) {
    now += 1 / 60;
    debris.update();
    // every piece's landing is known before its flight could reach the ground (the soonest a 1 m drop takes: 0.45 s)
    if (now > 0.4) assert.equal(late(), 0, `no piece in flight without its landing at ${now.toFixed(2)} s`);
  }
  let unsolved = 0;
  for (const m of pools) { const a = m.geometry.getAttribute('aLD'); for (let i = 0; i < m.geometry.instanceCount; i++) if (a.getX(i) > 1e3) unsolved++; }
  assert.equal(unsolved, 0, 'every landing solved within a second');
}

console.log('structureDebris selftest: ok');
