import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Color } from 'three';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { sampleHorizonGeometry } from './maps/horizon.ts';
import { createHeightField } from './terrain.ts';
import { redrockCanyonCenter, sampleRedrockCanyon } from './redrockCanyon.ts';
import { shapeRedrockOutland, tintRedrockOutlandFloor } from './horizonRedrock.ts';

const columns = 287, config = getMapConfig('badlands');
const seeds = [1337, 2049, 7719];
// Exact source/build-independent pre-canyon Badlands geometry, captured before
// modifying the horizon. Never refresh these to make an unrelated change pass.
const historicalHashes = [
  '913f29167543f352d1dd1d40a9fc5dcf73968671a36b3b0e8dabc124ec78d84d',
  'ae9e2a9335b40ab6ad2e6eb3f6cc4c3b5a5eb289e24ca4097307303b0b998cd9',
  '76c3b1a2377b24872c4f75fa4380dfebb727cce2072b18afa221a246148c0775',
];
function digest(ring) {
  return createHash('sha256').update(new Uint8Array(ring.positions.buffer))
    .update(new Uint8Array(ring.heights.buffer)).update(JSON.stringify(ring.rows))
    .update(String(ring.maxHeight)).digest('hex');
}

/** Intersect actual indexed triangles in XZ; do not substitute the analytic
 * field at the probe point or infer a visible canyon from its vertices alone. */
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
  for (let row = 0; row < ring.rows.length - 1; row++) for (let column = 0; column < columns; column++) {
    const next = (column + 1) % columns;
    const a = row * columns + column, b = (row + 1) * columns + column;
    const c = row * columns + next, d = (row + 1) * columns + next;
    const h = triangleHeight(ring.positions, a, b, c, x, z)
      ?? triangleHeight(ring.positions, c, b, d, x, z);
    if (h !== null) return h;
  }
  throw Error(`Probe outside actual ring: ${x},${z}`);
}
function assertOpenCanyon(ring) {
  for (const z of [-1600, -1300, -1000, -700, 700, 1000, 1300, 1600]) {
    for (const lane of [-140, 0, 140]) {
      const x = redrockCanyonCenter(z) + lane;
      assert.ok(surface(ring, x, z) < 14, `N/S mouth remains low through every row: ${x},${z}`);
    }
  }
  for (const z of [-430, 0, 430]) {
    const center = redrockCanyonCenter(z);
    const west = surface(ring, center - 1000, z), east = surface(ring, center + 1000, z);
    assert.ok(west > 45 && east > 60, 'Substantial plateau walls frame the valley');
    assert.ok(Math.abs(east - west) > 9, 'Unequal opposing flanks, not mirrored peaks');
  }
}

// Compile only the actual shaping owner with refinement disabled. This keeps
// the current road surface and all pre-existing seating logic in the witness.
const ownerSource = readFileSync(new URL('./horizonRedrock.ts', import.meta.url), 'utf8');
const refinementCall = 'if (ground) refineCanyonSeam(ring, columns, ground);';
assert.equal(ownerSource.split(refinementCall).length, 2);
const unrefinedShape = new Function('sampleRedrockCanyon', stripTypeScriptTypes(
  ownerSource.replace(refinementCall, '').replace(/^import .*;$/gm, '').replace(/export /g, ''),
  {mode:'transform'}) + '\nreturn shapeRedrockOutland;')(sampleRedrockCanyon);
function signedArea(p,a,b,c) {
  return (p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])
    -(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);
}
const receipts = [];
const cliffColor = new Color(.2, .1, .05);
for (const [height, slope] of [[-22, 0], [42, 0], [90, .2], [4, .6]]) {
  const color = cliffColor.clone();
  tintRedrockOutlandFloor(color, height, slope);
  assert.deepEqual(color, cliffColor, 'Buried anchor, high ground and steep cliffs retain their palette');
}
{
  const color = cliffColor.clone();
  tintRedrockOutlandFloor(color, 4, 0);
  assert.deepEqual(color.toArray(), [.74, .38, .14], 'Low sandy floor has its own warm working-space albedo');
  for (const [height, slope] of [[10, .12], [42, .6], [26, .36]]) {
    const a = cliffColor.clone(), b = cliffColor.clone();
    tintRedrockOutlandFloor(a, height - .00001, slope - .00001);
    tintRedrockOutlandFloor(b, height + .00001, slope + .00001);
    assert.ok(a.toArray().every((value, i) => Number.isFinite(value)
      && Math.abs(value - b.toArray()[i]) < .0001), 'Tint boundaries are continuous');
  }
}
// Production fixes the horizon seed to1337 while the ground has its own seed.
// Exercise those real pairs as well as independently seeded ring stress cases.
for (const [ringSeed, groundSeed] of [[1337,1337],[2049,2049],[7719,7719],[1337,2049],[1337,7719]]) {
  const seedIndex = seeds.indexOf(ringSeed);
  const previous = sampleHorizonGeometry({ ...config, horizon: { ...config.horizon, redrockCanyon: false } }, ringSeed);
  assert.equal(digest(previous), historicalHashes[seedIndex], 'Historical opt-out is the exact original geometry');
  const field = createHeightField(groundSeed, config);
  let constructionQueries=0;
  const constructionStart=performance.now();
  const ring=sampleHorizonGeometry(config,ringSeed,{getHeightAt(x,z){constructionQueries++;return field.getHeightAt(x,z);}});
  const constructionMs=performance.now()-constructionStart;
  const unrefined=structuredClone(previous); unrefinedShape(unrefined,field);
  if(ringSeed===1337 && groundSeed===1337) {
    const error=Math.abs(surface(unrefined,456,-512)-field.getHeightAt(456,-512));
    assert.ok(error>3,'unrefined current-road seam must fail the unchanged 3m limit');
  }
  const step=2*Math.PI/columns;
  let lastAngle=-Infinity;
  for(let column=0;column<columns;column++) {
    const o=(columns+column)*3, nominal=column*step;
    let angle=Math.atan2(ring.positions[o+2],ring.positions[o]);
    angle+=Math.round((nominal-angle)/(2*Math.PI))*2*Math.PI;
    assert.ok(Math.abs(angle-nominal)<=.40001*step && angle>lastAngle,'bounded ordered seam angles');
    lastAngle=angle;
    const next=(column+1)%columns;
    for(let row=0;row<2;row++) {
      const a=row*columns+column,b=(row+1)*columns+column,c=row*columns+next,d=(row+1)*columns+next;
      for(const ids of [[a,b,c],[c,b,d]]) {
        const before=signedArea(unrefined.positions,...ids),after=signedArea(ring.positions,...ids);
        assert.ok(Math.abs(after)>1e-6 && before*after>0,'changed seam triangles preserve nonzero baseline winding');
      }
    }
  }
  assert.equal(ring.positions.length, 8610); assert.equal(ring.heights.length, 2870);
  assert.deepEqual(ring.rows, previous.rows); assert.equal(ring.rows.length, 10);
  assert.equal(ring.maxHeight, Math.max(...ring.heights));
  assert.deepEqual(ring.positions.slice(0, columns * 3), previous.positions.slice(0, columns * 3), 'Buried seam stays exact');
  for (let index = columns; index < ring.heights.length; index++) {
    const o = index * 3, row = Math.floor(index / columns), x = ring.positions[o], z = ring.positions[o + 2];
    assert.equal(ring.heights[index], ring.positions[o + 1]); assert.ok(Number.isFinite(ring.heights[index]));
    if (row === 1) {
      assert.ok(Math.abs(Math.max(Math.abs(x), Math.abs(z)) - 511.5) < .001);
      assert.ok(Math.abs(ring.heights[index] - field.getHeightAt(x, z)) < .00001, 'First row seats on final conditioned ground');
    } else {
      assert.equal(x, previous.positions[o]); assert.equal(z, previous.positions[o + 2]);
      assert.ok(Math.abs(ring.heights[index] - sampleRedrockCanyon(x, z)) < .00001, 'Same regional shape, not separate mountains');
    }
    const before = o - columns * 3;
    assert.ok(Math.hypot(x, z) - Math.hypot(ring.positions[before], ring.positions[before + 2]) > 1, 'No folded radial faces');
  }
  assertOpenCanyon(ring);
  assert.throws(() => assertOpenCanyon(previous), { code: 'ERR_ASSERTION' }, 'Reject the original round mountain ring');
  let maximumSeamError = 0, seamPoint = null;
  function checkSeam(x, z) {
    const actual = surface(ring, x, z), ground = field.getHeightAt(x, z), error = Math.abs(actual - ground);
    if (error > maximumSeamError) { maximumSeamError = error; seamPoint = { x, z, actual, ground }; }
  }
  for (let along = -512; along <= 512; along += 8) for (const [x, z] of [[-512, along], [512, along], [along, -512], [along, 512]]) checkSeam(x, z);
  // Include each angular wedge's midpoint, not just a coincident regular grid.
  for (let column = 0; column < columns; column++) {
    const angle = (column + .5) / columns * Math.PI * 2;
    const x = Math.cos(angle), z = Math.sin(angle), scale = 512 / Math.max(Math.abs(x), Math.abs(z));
    checkSeam(x * scale, z * scale);
  }
  assert.ok(maximumSeamError < 3, `Actual perimeter triangles seat against conditioned ground: ${maximumSeamError} ${JSON.stringify(seamPoint)}`);
  // In-place construction: no replacement typed backing, cache, texture or owner.
  const p = previous.positions, h = previous.heights, rows = previous.rows;
  shapeRedrockOutland(previous, field);
  assert.equal(previous.positions, p); assert.equal(previous.heights, h); assert.equal(previous.rows, rows);
  assert.deepEqual(previous.positions, ring.positions);
  receipts.push({ ringSeed, groundSeed, constructionQueries, constructionMs, maximumSeamError, maximumHeight: ring.maxHeight });
}
for (const id of MAP_IDS) if (id !== 'badlands') {
  const actual = getMapConfig(id);
  assert.deepEqual(sampleHorizonGeometry({ ...actual, horizon: { ...actual.horizon, redrockCanyon: true } }, 1337),
    sampleHorizonGeometry(actual, 1337), `${id}: no cross-map opt-in leak`);
}
console.log(JSON.stringify({ test: 'redrockCanyonHorizon', receipts,
  limits: 'CPU actual-triangle seam/mouth/topology and historical preservation. Native visual/prop/collision/FPS acceptance remains separate.' }, null, 2));
