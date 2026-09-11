import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { buildHorizonRing, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import { createHeightField } from './terrain.ts';
import { seatHorizonTerrainSeam } from './horizonRedrock.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function triangleHeight(p, a, b, c, x, z) {
  const ax = p[a * 3], az = p[a * 3 + 2], bx = p[b * 3], bz = p[b * 3 + 2];
  const cx = p[c * 3], cz = p[c * 3 + 2];
  const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
  const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
  const wc = 1 - wa - wb;
  return Math.min(wa, wb, wc) >= -1e-6 ? wa * p[a * 3 + 1] + wb * p[b * 3 + 1] + wc * p[c * 3 + 1] : null;
}
function surface(ring, x, z) {
  // The conditioned seam reuses the same vertices at nonuniform angles.
  // Intersect actual triangles instead of inferring a uniform angular wedge.
  for (let row = 0; row < ring.rows.length - 1; row++) for (let column = 0; column < N; column++) {
    const next = (column + 1) % N;
    const a = row * N + column, b = (row + 1) * N + column;
    const c = row * N + next, d = (row + 1) * N + next;
    const h = triangleHeight(ring.positions, a, b, c, x, z)
      ?? triangleHeight(ring.positions, c, b, d, x, z);
    if (h !== null) return h;
  }
  throw Error(`Probe outside actual ring: ${x},${z}`);
}

const N = 287, previousDocument = globalThis.document;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
try {
  for (const id of ['autumn', 'saltwind', 'steppe']) {
    const mesh = buildHorizonRing(null, getMapConfig(id), 1337);
    const image = mesh.material.map.image;
    assert.equal(image.width, 512); assert.equal(image.height, 192);
    const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
    let angularDifferences = 0;
    for (let y = 0; y < image.height; y++) for (let x = 1; x < image.width; x++) {
      const a = y * image.width * 4, b = a + x * 4;
      for (let channel = 0; channel < 3; channel++) angularDifferences += pixels[a + channel] !== pixels[b + channel];

    }
    assert.ok(angularDifferences > 10000, 'every rolling map retains original authored angular atlas detail');
    assert.equal(mesh.geometry.attributes.position.count, 2880, 'same ten rows and seam column');
    assert.equal(mesh.geometry.index.count, 15498, 'same continuous annular topology');
    disposeObject3DResources(mesh);
  }
  for (const groundSeed of [1337, 2049, 7719]) {
    const config = getMapConfig('autumn'), field = createHeightField(groundSeed, config);
    const before = sampleHorizonGeometry(config, 1337);
    let queries = 0;
    const ring = sampleHorizonGeometry(config, 1337, {getHeightAt(x,z) { queries++; return field.getHeightAt(x,z); }});
    assert.deepEqual(ring.rows, before.rows);
    assert.deepEqual(ring.positions.slice(0,N*3), before.positions.slice(0,N*3), 'buried anchor exact');
    assert.deepEqual(ring.positions.slice(N*6), before.positions.slice(N*6), 'all farther landforms exact');
    const sign=(p,a,b,c)=>(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])-(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);
    for(let col=0;col<N;col++) {
      const i=N+col, o=i*3;
      assert.ok(Math.abs(Math.max(Math.abs(ring.positions[o]),Math.abs(ring.positions[o+2]))-511.5)<.001);
      assert.ok(Math.abs(ring.heights[i]-field.getHeightAt(ring.positions[o],ring.positions[o+2]))<.00001);
      for(let row=0;row<2;row++) {
        const a=row*N+col,b=a+N,c=row*N+(col+1)%N,d=c+N;
        for(const ids of [[a,b,c],[c,b,d]]) assert.ok(sign(ring.positions,...ids)*sign(before.positions,...ids)>0,'no folded or zero-area seam triangles');
      }
    }
    let maximum=0, maximumPoint=null;
    const check=(x,z)=>{const error=Math.abs(surface(ring,x,z)-field.getHeightAt(x,z));if(error>maximum){maximum=error;maximumPoint={x,z,actual:surface(ring,x,z),ground:field.getHeightAt(x,z)};}};
    for(let along=-512;along<=512;along+=8) for(const [x,z] of [[-512,along],[512,along],[along,-512],[along,512]]) check(x,z);
    for(let col=0;col<N;col++) {
      const angle=(col+.5)/N*Math.PI*2,scale=512/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle)));
      const x=Math.cos(angle)*scale,z=Math.sin(angle)*scale;
      check(x,z);
    }
    assert.ok(maximum<3,`Autumn actual indexed perimeter mismatch ${maximum} ${JSON.stringify(maximumPoint)}`);
    const p=before.positions,h=before.heights; seatHorizonTerrainSeam(before,field);
    assert.equal(before.positions,p);assert.equal(before.heights,h);assert.deepEqual(before.positions,ring.positions);
    console.log(JSON.stringify({groundSeed,queries,maximum}));
  }
} finally { globalThis.document = previousDocument; }
console.log('autumnHorizonSeam: original atlas, unchanged outer/buried rows and bounded live seam PASS');
