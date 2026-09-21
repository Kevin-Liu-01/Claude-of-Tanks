import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHorizonRing } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import {
  HORIZON_ROCK_MAX_SLOPE, HORIZON_ROCK_VARIANTS, buildHorizonBoulder, buildHorizonRockfield,
} from './horizonRockfield.ts';

// Round 32 (owner 2026-09-21): "redrock still has the noticeable texture/shadow/quality loss beyond the map borders".
// The rock and sand outlands carry instanced boulders on the near ring faces; wooded maps keep their ring forest
// instead. Deterministic, bounded, seated beyond the playable square, the near class casting shadows.

const previousDocument = globalThis.document;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = {
      width: 0, height: 0,
      getContext() {
        return {
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData(image) { canvas.pixels = image.data; },
          clearRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
          rect() {}, clip() {}, moveTo() {}, lineTo() {}, fill() {},
          createLinearGradient: () => ({ addColorStop() {} }),
        };
      },
    };
    return canvas;
  },
};

const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), matrix = new THREE.Matrix4();
function instancesOf(group) {
  const out = [];
  group.traverse((object) => {
    if (!object.isInstancedMesh) return;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      out.push({ mesh: object.name, x: position.x, y: position.y, z: position.z, scale: scale.x, cast: object.castShadow });
    }
  });
  return out;
}

try {
  // --- the boulder primitive: three faceted variants with a flattened seat and rock-tinted vertex colours
  const rock = new THREE.Color(0x96533b).convertSRGBToLinear();
  for (let variant = 0; variant < HORIZON_ROCK_VARIANTS; variant++) {
    const geometry = buildHorizonBoulder(variant, 1234 + variant, rock);
    const pos = geometry.attributes.position;
    assert.ok(pos.count >= 60 && pos.count <= 600, `variant ${variant}: a low-poly boulder (${pos.count} vertices)`);
    let minY = Infinity, maxY = -Infinity, maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
      maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    assert.ok(minY >= -0.75 && minY <= -0.3, `variant ${variant}: flattened seat (${minY.toFixed(2)})`);
    assert.ok(maxY > 0.5 && maxR > 0.8 && maxR < 2.4, `variant ${variant}: squat boulder proportions`);
    assert.ok(geometry.attributes.color && geometry.attributes.normal, `variant ${variant}: vertex colours and normals`);
    const again = buildHorizonBoulder(variant, 1234 + variant, rock);
    assert.deepEqual([...again.attributes.position.array.slice(0, 30)], [...pos.array.slice(0, 30)], `variant ${variant}: deterministic`);
  }

  // --- a synthetic ring: flat faces beyond the square carry rocks, walls and the sea do not, density 0 builds nothing
  const columns = 24;
  const radii = [500, 520, 560, 610, 700, 820];
  const rows = radii.map((r, i) => ({ r, aer: 0, skirt: i === 0, interpolated: i > 0 && i < 4 }));
  const positions = new Float32Array(rows.length * columns * 3), heights = new Float32Array(rows.length * columns);
  for (let row = 0; row < rows.length; row++) {
    for (let c = 0; c < columns; c++) {
      const a = (c / columns) * Math.PI * 2, i = row * columns + c;
      // the ring follows the playable square near the seam (a rounded square), as the seated real rings do
      const square = radii[row] / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      positions[i * 3] = Math.cos(a) * square; positions[i * 3 + 2] = Math.sin(a) * square;
      const h = row === 0 ? -10 : 4 + row * 1.5;
      positions[i * 3 + 1] = h; heights[i] = h;
    }
  }
  const base = {
    columns, rows, positions, heights, seed: 77, rock, fog: new THREE.Color(0.7, 0.6, 0.5), density: 1, maxInstances: 600, ridgeRow: 4,
  };
  assert.equal(buildHorizonRockfield({ ...base, density: 0 }), null, 'density 0 builds nothing');
  const group = buildHorizonRockfield(base);
  assert.ok(group && group.name === 'horizon-rocks', 'a rockfield group');
  const placed = instancesOf(group);
  assert.equal(placed.length, group.userData.horizonRockfield.instances, 'the census matches the instances');
  assert.ok(placed.length > 40 && placed.length <= 600, `bounded (${placed.length})`);
  for (const rockInstance of placed) {
    assert.ok(Math.max(Math.abs(rockInstance.x), Math.abs(rockInstance.z)) > 511, `every boulder lies beyond the playable square (${rockInstance.x.toFixed(0)}, ${rockInstance.z.toFixed(0)})`);
    assert.ok(rockInstance.y > 3 && rockInstance.y < 14, `seated on the face (${rockInstance.y.toFixed(2)})`);
    assert.ok(rockInstance.scale >= 0.13 && rockInstance.scale <= 5.7, `boulder scale ${rockInstance.scale.toFixed(2)}`);
  }
  const near = placed.filter((r) => r.mesh.startsWith('horizon-rocks-near-'));
  assert.ok(near.length > 0 && near.every((r) => r.cast), 'the near class casts shadows');
  assert.ok(placed.filter((r) => !r.mesh.startsWith('horizon-rocks-near-')).every((r) => !r.cast), 'band and range classes do not');
  assert.ok(group.children.length >= 2 && group.children.length <= 9, `one instanced mesh per class and variant (${group.children.length})`);
  assert.ok(group.userData.horizonRockfield.band > group.userData.horizonRockfield.range, 'the rim band carries most of the rocks');
  const twin = buildHorizonRockfield(base);
  assert.deepEqual(instancesOf(twin).slice(0, 20), placed.slice(0, 20), 'deterministic for a seed');
  // a wall face (rise/run past the slope limit) never carries boulders
  const wallHeights = heights.slice();
  for (let c = 0; c < columns; c++) wallHeights[2 * columns + c] = 4 + 20 * 1.5 + (radii[2] - radii[1]) * (HORIZON_ROCK_MAX_SLOPE + 0.3);
  const walled = buildHorizonRockfield({ ...base, heights: wallHeights });
  const wallRocks = walled ? instancesOf(walled).filter((r) => { const rr = Math.hypot(r.x, r.z); return rr > radii[1] && rr < radii[2]; }) : [];
  assert.equal(wallRocks.length, 0, 'the wall face between rows 1 and 2 stays bare');

  // --- the real rings: Redrock's mesa outland carries rocks, the wooded Verdant keeps its ring forest instead
  const badlands = buildHorizonRing(null, getMapConfig('badlands'), 1337);
  const rocks = badlands.getObjectByName('horizon-rocks');
  assert.ok(rocks, 'Redrock Divide (badlands) strews boulders over its outland');
  const census = rocks.userData.horizonRockfield;
  assert.ok(census.instances >= 400 && census.instances <= 3000, `bounded outland rockfield (${census.instances})`);
  assert.ok(census.near >= 100, `a shadow-casting near class (${census.near})`);
  const redrockRocks = instancesOf(rocks);
  for (const rockInstance of redrockRocks) {
    assert.ok(Math.max(Math.abs(rockInstance.x), Math.abs(rockInstance.z)) > 511, 'beyond the square');
    assert.ok(Math.max(Math.abs(rockInstance.x), Math.abs(rockInstance.z)) < 910, 'inside the near ranges (square metric)');
  }
  // eviction owns the boulder material and the three shared primitives together with the ring's own resources
  const ownedBefore = { materials: 0, geometries: 0 };
  badlands.traverse((object) => { if (object.isInstancedMesh && object.name.startsWith('horizon-rocks-')) ownedBefore.materials = 1; });
  assert.equal(ownedBefore.materials, 1, 'the rockfield is attached under the ring mesh');
  const disposed = disposeObject3DResources(badlands);
  assert.ok(disposed.materials >= 2, `eviction owns the ring and rock materials (${disposed.materials})`);
  assert.ok(disposed.geometries >= 1 + HORIZON_ROCK_VARIANTS, `eviction owns the ring geometry and the boulder primitives (${disposed.geometries})`);
  const verdant = buildHorizonRing(null, getMapConfig('verdant'), 1337);
  assert.equal(verdant.getObjectByName('horizon-rocks'), undefined, 'a wooded map keeps its ring forest, no rockfield');
  assert.ok(verdant.getObjectByName('horizon-forest'), 'Verdant still stands its ring forest');
  const copper = buildHorizonRing(null, getMapConfig('copper_mesa'), 1337);
  assert.ok(copper.getObjectByName('horizon-rocks'), 'every mesa outland carries rocks');
  console.log(`horizonRockfield.selftest: Redrock outland carries ${census.instances} boulders (${census.near} near), synthetic ring ${placed.length}, wooded maps none`);
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
