// Paint on the paved ground (world/groundMarkings.ts, the map-revival lane 2026-10-05; Kestrel's apron markings): every
// quad faces up and sits on the given ground a few centimetres up; a stripe breaks where it crosses a slab joint and
// paints nothing in a keep-out; a number's segments read along its heading on its box; the build is deterministic; the
// worn-paint mask tiles; Kestrel's own markings stay on its pavement inside a small budget.
import assert from 'node:assert/strict';
import { buildGroundMarkingGeometry, wornPaintTexture } from './groundMarkings.ts';

const flat = (x, z) => 0.01 * x - 0.02 * z;
function triangles(geometry) {
  const pos = geometry.getAttribute('position'), idx = geometry.index.array, out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
    out.push(v);
  }
  return out;
}
function facesUp([[ax, , az], [bx, , bz], [cx, , cz]]) { return (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0; }
const centroid = (tri) => [0, 2].map((k) => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);

// 1. a straight stripe across four joints of a 6 m slab grid: five painted spans, none touching a joint
{
  const cfg = { lines: [{ points: [[1, 2], [25, 2]], width: 0.3, paint: 'yellow' }], slabM: 6, breakM: 0.09 };
  const { geometry } = buildGroundMarkingGeometry(cfg, flat);
  const tris = triangles(geometry);
  assert.ok(tris.every(facesUp), 'every stripe quad faces up');
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const toJoint = Math.abs(x - 6 * Math.round(x / 6));
    assert.ok(toJoint >= 0.09 - 1e-6, `a stripe vertex at x ${x.toFixed(3)} stands on a joint`);
    assert.ok(Math.abs(pos.getY(i) - flat(x, pos.getZ(i)) - 0.035) < 1e-5, 'a stripe vertex sits 3.5 cm over the ground');
  }
  const xs = [...new Set(Array.from({ length: pos.count }, (_, i) => +pos.getX(i).toFixed(3)))].sort((a, b) => a - b);
  const gaps = xs.filter((x, i) => i > 0 && x - xs[i - 1] > 0.17 && x - xs[i - 1] < 0.19);
  assert.equal(gaps.length, 4, 'one break at each of the four joints the stripe crosses');
}

// 2. a keep-out takes its ground out of a stripe; a number inside one is not painted
{
  const keepOut = [{ x0: 10, x1: 20, z0: -5, z1: 5 }];
  const cfg = { lines: [{ points: [[0, 0], [30, 0]], width: 0.4, paint: 'white' }],
    numbers: [{ x: 15, z: 0, headingDeg: 0, text: '7', height: 2, paint: 'yellow', box: 'black' }], keepOut };
  const { geometry } = buildGroundMarkingGeometry(cfg, flat);
  for (const tri of triangles(geometry)) {
    const [x] = centroid(tri);
    assert.ok(x < 10 || x > 20, 'nothing paints inside a keep-out');
  }
}

// 3. a number: its box first, then each lit segment, reading along the heading (heading 90°: toward +x, its digits
// stacked along +z — the reader's right), the box under the numerals
{
  const cfg = { lines: [], numbers: [{ x: 0, z: 0, headingDeg: 90, text: '18', height: 2, paint: 'yellow', box: 'black' }] };
  const { geometry, pieces } = buildGroundMarkingGeometry(cfg, flat);
  assert.equal(pieces, 1 + 2 + 7, 'the box, the 1 (two segments) and the 8 (seven)');
  const tris = triangles(geometry);
  assert.ok(tris.every(facesUp), 'every number quad faces up');
  const one = tris.slice(2, 6).map(centroid), eight = tris.slice(6).map(centroid);
  assert.ok(Math.max(...one.map(([, z]) => z)) < Math.min(...eight.map(([, z]) => z)), 'the 1 reads before the 8, to the reader\'s right');
  // the 1's two segments stand on the digit's right side: toward the 8
  const oneZ = one.map(([, z]) => z), w = 2 * 0.56;
  assert.ok(oneZ.every((z) => z > -(2 * w + 0.6) / 2 + w * 0.6), 'the 1 is drawn on its right edge');
  const over = ([x, y, z]) => y - flat(x, z);
  assert.ok(tris.slice(0, 2).flat().every((v) => Math.abs(over(v) - 0.035) < 1e-5), 'the box sits 3.5 cm over the ground');
  assert.ok(tris.slice(2).flat().every((v) => Math.abs(over(v) - 0.039) < 1e-5), 'the numerals sit a few millimetres over their box');
}

// 4. deterministic; corners rounded; no geometry from a stripe of one node
{
  const cfg = { lines: [{ points: [[0, 0], [20, 0], [20, 20]], width: 0.3, paint: 'yellow' }, { points: [[5, 5]], width: 1, paint: 'white' }], slabM: 6 };
  const a = buildGroundMarkingGeometry(cfg, flat), b = buildGroundMarkingGeometry(cfg, flat);
  assert.deepEqual(Array.from(a.geometry.getAttribute('position').array), Array.from(b.geometry.getAttribute('position').array), 'the build repeats exactly');
  assert.deepEqual(Array.from(a.geometry.getAttribute('color').array), Array.from(b.geometry.getAttribute('color').array), 'the fade repeats exactly');
  const pos = a.geometry.getAttribute('position');
  let cornerCut = true;
  for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - 20, pos.getZ(i)) < 1.5) cornerCut = false;
  assert.ok(cornerCut, 'the corner is rounded into a curve, not painted to its node');
  assert.equal(buildGroundMarkingGeometry({ lines: [{ points: [[5, 5]], width: 1, paint: 'white' }] }, flat), null, 'nothing paints: no geometry');
}

// 5. the worn-paint mask: tiles (its edge texels meet), its alpha the paint left, never gone entirely
{
  const t = wornPaintTexture(2);
  const { data, width, height } = t.image;
  assert.equal(width, 128); assert.equal(height, 128);
  let min = 255, max = 0, seam = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      min = Math.min(min, a); max = Math.max(max, a);
    }
    seam = Math.max(seam, Math.abs(data[(y * width) * 4 + 3] - data[(y * width + width - 1) * 4 + 3]));
  }
  assert.ok(min >= Math.round(0.12 * 255) && max > 220, `the paint's alpha runs ${min}..${max}`);
  assert.ok(seam < 40, `the mask tiles across its edge (largest step ${seam})`);
  t.dispose();
}

// 6. Kestrel's markings: on its pavement (the road mask: carriageways and aprons), outside its keep-outs, facing up,
// a few centimetres over the terrain mesh, within a small budget
{
  const [maps, terrain] = await Promise.all([import('./maps/index.ts'), import('./terrain.ts')]);
  const config = maps.getMapConfig('airfield');
  const cfg = config.props.groundMarkings;
  assert.ok(cfg, 'Kestrel authors its markings');
  const field = terrain.createHeightField(1337, config);
  const ground = (x, z) => field.getHeightAt(x, z);
  const built = buildGroundMarkingGeometry(cfg, (x, z) => terrain.terrainNearMeshHeightAt(ground, x, z));
  const tris = triangles(built.geometry);
  assert.ok(tris.length < 4000, `Kestrel's paint stays small (${tris.length} triangles)`);
  for (const tri of tris) {
    assert.ok(facesUp(tri), 'a Kestrel quad faces down');
    const [x, z] = centroid(tri);
    assert.ok(field._roadDist(x, z) <= 3.4, `paint off the pavement at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.ok(!cfg.keepOut.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1), 'paint inside a Kestrel keep-out');
    for (const [vx, vy, vz] of tri) assert.ok(vy - ground(vx, vz) > 0.02 && vy - ground(vx, vz) < 0.05, 'paint seated a few centimetres up');
  }
}

console.log('groundMarkings selftest: OK');
