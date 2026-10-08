// Every convex part holds its outline (the hitbox lane, 2026-10-08). The shell clip (collision.ts rayCollisionRecord),
// the point test and the movement SAT read each edge of a convex part as a half-plane, so a corner that turns against
// the outline's winding cuts away everything behind its line: before collision.ts convexOutlineInPlace the shards held
// 887 barbed-wire, 54 stone-wall, 50 structure, 2 desert-tent and (the first rock shards) 112 stone parts that lost more
// than a tenth of their outline. Here every convex part of every map's shard, read as packed (the builders' own corners,
// to the packer's 0.1 mm), keeps at least 99 % of its outline's area in the game's own point test, and level shells aimed
// through it at its mid-height stop on it; and the decoder's reading (which drops a quantised reflex corner) holds it
// whole.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { MAP_IDS } from '../src/world/maps/catalog.ts';
import { collisionFootprintContainsPoint, convexHull2, convexOutlineInPlace, rayCollisionRecord } from '../src/world/collision.ts';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';

// the outline law on its own: a zigzag corner and a repeated one go, the hull stays, a typed array is copied
{
  const zig = [0, 0, 2, 0, 2.001, 0.0005, 4, 0, 4, 3, 0, 3];
  const clean = convexOutlineInPlace(zig);
  assert.equal(clean, zig, 'cleaned in place');
  assert.deepEqual(clean, [0, 0, 4, 0, 4, 3, 0, 3], 'the reflex corner and the collinear one are dropped');
  assert.deepEqual(convexOutlineInPlace([0, 0, 2, 0, 2.001, -0.005, 4, 0, 4, 3, 0, 3]), [0, 0, 2.001, -0.005, 4, 0, 4, 3, 0, 3],
    'a corner standing 5 mm out of the outline is its hull\'s: kept');
  assert.deepEqual(convexOutlineInPlace([0, 0, 2, 0, 2.001, -0.0005, 4, 0, 4, 3, 0, 3]), [0, 0, 4, 0, 4, 3, 0, 3],
    'one within a millimetre of its chord is dropped (the packer\'s 0.1 mm could turn it)');
  assert.deepEqual(convexOutlineInPlace([0, 0, 0, 0, 1, 0, 1, 1, 0, 1]), [0, 0, 1, 0, 1, 1, 0, 1], 'a repeated corner is dropped');
  const cw = convexOutlineInPlace([0, 0, 0, 3, 4, 3, 4, 0, 2.001, 0.0005, 2, 0]);
  assert.deepEqual(cw, [0, 0, 0, 3, 4, 3, 4, 0], 'either winding');
  const typed = Float64Array.from([0, 0, 1, 0, 1, 1]);
  assert.ok(Array.isArray(convexOutlineInPlace(typed)), 'a typed outline is copied');
  assert.deepEqual(convexOutlineInPlace([0, 0, 1, 1, 2, 2]), [0, 0, 1, 1, 2, 2], 'an outline with no area is left alone');
}

const SAMPLES = 8;
const origin = new Vector3(), dir = new Vector3(), normal = new Vector3();
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let parts = 0, measured = 0, worst = 1, worstAt = '';
const families = new Map();
const unpack = (value) => {
  const ranged = value[0] === 'w';
  return { points: value.slice(ranged ? 3 : 1), y0: ranged ? value[1] : undefined, y1: ranged ? value[2] : undefined };
};
for (const mapId of MAP_IDS) {
  const manifest = decodeCollisionManifest(JSON.parse(readFileSync(new URL(`./world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8')));
  for (const list of ['obstacles', 'colliders']) {
    for (const packed of manifest[list]) {
      const shape = packed.s;
      if (!shape) continue;
      const simple = shape[0] === 'm' ? shape.slice(1) : [shape];
      for (const value of simple) {
        if (value[0] !== 'v' && value[0] !== 'w') continue;
        parts++;
        const part = unpack(value);
        const pairs = [];
        for (let i = 0; i < part.points.length; i += 2) pairs.push([part.points[i], part.points[i + 1]]);
        const hull = convexHull2(pairs);
        if (hull.length < 6) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < hull.length; i += 2) {
          x0 = Math.min(x0, hull[i]); x1 = Math.max(x1, hull[i]); z0 = Math.min(z0, hull[i + 1]); z1 = Math.max(z1, hull[i + 1]);
        }
        const y0 = part.y0 ?? packed.b[1], y1 = part.y1 ?? packed.b[4];
        const asPacked = { min: [x0, y0, z0], max: [x1, y1, z1], shape2: { kind: 'convex', cx: 0, cz: 0, points: part.points } };
        const asRead = { min: [x0, y0, z0], max: [x1, y1, z1], shape2: { kind: 'convex', cx: 0, cz: 0, points: convexOutlineInPlace(part.points.slice()) } };
        let inside = 0, held = 0, heldRead = 0;
        for (let a = 0; a < SAMPLES; a++) for (let b = 0; b < SAMPLES; b++) {
          const x = x0 + (x1 - x0) * (a + 0.5) / SAMPLES, z = z0 + (z1 - z0) * (b + 0.5) / SAMPLES;
          let inHull = true;
          for (let i = 0; i < hull.length && inHull; i += 2) {
            const j = (i + 2) % hull.length;
            if ((hull[j] - hull[i]) * (z - hull[i + 1]) - (hull[j + 1] - hull[i + 1]) * (x - hull[i]) < 1e-9) inHull = false;
          }
          if (!inHull) continue;
          inside++;
          if (collisionFootprintContainsPoint(asPacked, x, z, 0)) held++;
          if (collisionFootprintContainsPoint(asRead, x, z, 0)) heldRead++;
        }
        if (inside < 4) continue;
        measured++;
        const share = held / inside;
        const family = `${list}:${packed.k ?? (packed.q ? 'crushable' : 'solid')}`;
        const f = families.get(family) ?? { parts: 0, inside: 0, held: 0 };
        f.parts++; f.inside += inside; f.held += held; families.set(family, f);
        if (share < worst) { worst = share; worstAt = `${mapId} ${family} (${x0.toFixed(1)}, ${z0.toFixed(1)})`; }
        assert.ok(share >= 0.99, `${mapId} ${family} part at (${x0.toFixed(1)}, ${z0.toFixed(1)}) holds ${(share * 100).toFixed(1)} % of its outline`);
        assert.equal(heldRead, inside, `${mapId} ${family}: the decoder's reading holds the whole outline`);
        // level shells through its middle from four sides stop on it
        if (y1 - y0 > 1e-3) {
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max(x1 - x0, z1 - z0) + 4;
          let inHull = true;
          for (let i = 0; i < hull.length && inHull; i += 2) {
            const j = (i + 2) % hull.length;
            if ((hull[j] - hull[i]) * (cz - hull[i + 1]) - (hull[j + 1] - hull[i + 1]) * (cx - hull[i]) < 1e-9) inHull = false;
          }
          if (inHull) {
            for (const [dx, dz] of directions) {
              origin.set(cx - dx * span, (y0 + y1) / 2, cz - dz * span); dir.set(dx, 0, dz);
              assert.ok(rayCollisionRecord(origin, dir, asPacked, span * 2, normal) >= 0,
                `${mapId} ${family} part at (${x0.toFixed(1)}, ${z0.toFixed(1)}): a level shell through its middle stops on it`);
            }
          }
        }
      }
    }
  }
}
assert.ok(measured > 100000, `the shards' convex parts are measured (${measured})`);
const rows = [...families].sort((a, b) => b[1].parts - a[1].parts).slice(0, 6)
  .map(([k, f]) => `${k} ${f.parts} (${(100 * f.held / f.inside).toFixed(2)} %)`).join(', ');
console.log(`convexOutlines.selftest: ${measured} of ${parts} convex parts on ${MAP_IDS.length} maps hold at least 99 % of their outline `
  + `(worst ${(worst * 100).toFixed(1)} %, ${worstAt}) and stop level shells through their middles; ${rows}`);
