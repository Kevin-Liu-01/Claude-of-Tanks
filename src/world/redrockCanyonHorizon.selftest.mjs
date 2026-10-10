import assert from 'node:assert/strict';
import { Color } from 'three';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { createHeightField } from './terrain.ts';
import { redrockCanyonFloorHalfWidth, redrockCanyonCenter, sampleRedrockCanyon } from './redrockCanyon.ts';
import { shapeRedrockOutland, tintRedrockOutlandFloor } from './horizonRedrock.ts';

// Vista pass (2026-09-19, owner: 'consider this a triple AAA pass'): the ring ladder is 431 columns and 18 / 36 rows with
// ridged relief, the first ridge stands 700-720 m out and the skirt seats on the terrain; every geometry receipt below is
// re-established at this commit (the 1049e4e byte identity it guarded is superseded by that owner direction).
const columns = HORIZON_SEGMENTS, config = getMapConfig('badlands');
// 2026-10-01 (frozen pins retired): the sha256 pins of the pre-canyon (opt-out) Badlands ring at three seeds were
// change detectors; the opt-out ring is still built live as the negative control the refinement must beat, and every
// other map's ring answers to horizonResources' shared gates.

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
// Round 39 (owner 2026-09-22, "make the divide an enclosed area instead of being in a 'gap'"): the canyon is a
// closed basin — the floor stays open to the map edge and just past it (to the ring's 585 m row), climbs between 612
// and ~800 m, and a headwall stands across both former mouths from 900 m out (the restored 1049e4e mesa ring ends at the authored 1240 m row, so
// the probes stop at 1200 m). The previous open-mouth design is the negative control below.
function assertEnclosedCanyon(ring) {
  for (const z of [-580, -540, 540, 580]) {
    for (const lane of [-140, 0, 140]) {
      const x = redrockCanyonCenter(z) + lane;
      assert.ok(surface(ring, x, z) < 14, `floor still open just past the edge: ${x},${z} -> ${surface(ring, x, z)}`);
    }
  }
  for (const z of [-760, 760]) {
    const h = surface(ring, redrockCanyonCenter(z), z);
    assert.ok(h > 14 && h < 85, `headwall climbing halfway out: ${z} -> ${h}`);
  }
  for (const z of [-1200, -1100, -1000, 1000, 1100, 1200]) {
    for (const lane of [-140, 0, 140]) {
      const x = redrockCanyonCenter(z) + lane;
      assert.ok(surface(ring, x, z) > 45, `headwall closes the mouth: ${x},${z} -> ${surface(ring, x, z)}`);
    }
  }
  let opposingDifference=0;
  for (const z of [-430, 0, 430]) {
    const center = redrockCanyonCenter(z);
    const west = surface(ring, center - 1000, z), east = surface(ring, center + 1000, z);
    assert.ok(west > 45 && east > 60, 'Substantial plateau walls frame the valley');
    opposingDifference+=Math.abs(east-west);
  }
  assert.ok(opposingDifference/3>9,'The regional flanks remain unequal across the valley, including curved tributary mouths');
}

// Compile only the actual shaping owner with refinement disabled. This keeps
// the current road surface and all pre-existing seating logic in the witness.
const ownerSource = readFileSync(new URL('./horizonRedrock.ts', import.meta.url), 'utf8');
const refinementCall = 'if (ground) refineCanyonSeam(ring, columns, ground, true);';
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
  const previous = sampleHorizonGeometry({ ...config, horizon: { ...config.horizon, redrockCanyon: false } }, ringSeed);
  const field = createHeightField(groundSeed, config);
  let constructionQueries=0;
  const constructionStart=performance.now();
  const ring=sampleHorizonGeometry(config,ringSeed,{getHeightAt(x,z){constructionQueries++;return field.getHeightAt(x,z);},getOutlandHeightAt:field.getOutlandHeightAt});
  const constructionMs=performance.now()-constructionStart;
  const unrefined=structuredClone(previous); unrefinedShape(unrefined,field);
  if(ringSeed===1337 && groundSeed===1337) {
    // vista pass (2026-09-19): with 431 columns a single probe no longer isolates the unrefined seam; the control now
    // takes the worst perimeter probe and requires the refinement to beat it
    let unrefinedMax=0;
    const probe=(x,z)=>{unrefinedMax=Math.max(unrefinedMax,Math.abs(surface(unrefined,x,z)-field.getHeightAt(x,z)));};
    for(let along=-512;along<=512;along+=8) for(const [x,z] of [[-512,along],[512,along],[along,-512],[along,512]]) probe(x,z);
    // the 431-column ring halves the unrefined chord error (worst about 2.1 m); the map-borders lane's road exits
    // (2026-10-03) grade the outland to every road that leaves the square, which takes another tenth off the worst
    // chord at an exit (1.89 m), and its road grades on the landform's own rim (no classic climb at an exit) and
    // foreground clearance past the red line take the steepest chords off the square's edge (1.06-1.20 m); the unrefined
    // control must still show a metre somewhere — the refined seat below stays within 0.00001 m
    assert.ok(unrefinedMax>1.0,`unrefined current-road seam must exceed 1 m somewhere (worst ${unrefinedMax.toFixed(2)} m)`);
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
  assert.ok(ring.rows.length > 18 && ring.rows.length <= 160, 'resolved exterior relief stays inside the row budget');
  assert.equal(ring.positions.length, columns * ring.rows.length * 3); assert.equal(ring.heights.length, columns * ring.rows.length);
  assert.equal(ring.maxHeight, Math.max(...ring.heights));
  for (let k=0;k<columns;k++) {
    assert.equal(ring.positions[k*3],previous.positions[k*3]);
    assert.equal(ring.positions[k*3+2],previous.positions[k*3+2]);
    assert.ok(ring.heights[k]<-64,'Closing anchors stay below the whole canyon');
  }
  let exterior = 0, stepped = 0;
  for (let index = columns; index < ring.heights.length; index++) {
    const o = index * 3, row = Math.floor(index / columns), x = ring.positions[o], z = ring.positions[o + 2];
    assert.equal(ring.heights[index], ring.positions[o + 1]); assert.ok(Number.isFinite(ring.heights[index]));
    if (row === 1) {
      assert.ok(Math.abs(Math.max(Math.abs(x), Math.abs(z)) - 511.5) < .001);
      assert.ok(Math.abs(ring.heights[index] - field.getHeightAt(x, z)) < .00001, 'First row seats on final conditioned ground');
    } else {
      // 2026-10-02 (the mountains lane; owner: "plain mesa walls … Redrock Divide"): past the seam band the regional
      // geology runs through the tableland bed stair (horizonEscarpment.ts: nil within 70 m of the edge, full by 230 m),
      // so the resolved exterior (180 m and more past the edge) follows the playable geology within one bed — 72 m, the
      // stair's thickest — instead of to the metre; the canyon's own form (the open floor, the headwalls, the unequal
      // plateau walls) is asserted below on the stepped ring, and the seam on the actual perimeter triangles
      if (Math.max(Math.abs(x), Math.abs(z)) >= 692) {
        const delta = Math.abs(ring.heights[index] - field.getOutlandHeightAt(x, z));
        assert.ok(delta <= 72, `Resolved exterior follows the playable regional geology within one bed (${delta.toFixed(1)} m)`);
        exterior++; if (delta > 4) stepped++;
      }
    }
    const before = o - columns * 3;
    assert.ok(Math.hypot(x, z) - Math.hypot(ring.positions[before], ring.positions[before + 2]) > 1, 'No folded radial faces');
  }
  // (the Redrock lane, round 10, the gauntlet's wave 270: the stair cut into the heads read as "a stack of flat-shaded
  // steps" over "a flat, hard-edged dark-red strip" — Redrock's horizon sets escarpment: false, and its resolved exterior
  // is the canyon's own jebel sections, to the ring's rows; a ring that keeps the stair still reaches its walls)
  if (config.horizon.escarpment === false) {
    assert.ok(stepped <= exterior * 0.02, `the exterior is the canyon's own heads, unstepped (${stepped} of ${exterior} vertices moved past 4 m)`);
  } else {
    assert.ok(stepped > exterior * 0.2, `the bed stair reaches the canyon's exterior walls (${stepped} of ${exterior} vertices moved past 4 m)`);
  }
  assertEnclosedCanyon(ring);
  // negative control: the pre-round-39 open design (the same ring with its mouth lanes forced back to the floor)
  const openMouths = structuredClone(ring);
  for (let index = columns; index < openMouths.heights.length; index++) {
    const x = openMouths.positions[index * 3], z = openMouths.positions[index * 3 + 2];
    if (Math.abs(z) > 612 && Math.abs(x - redrockCanyonCenter(z)) < redrockCanyonFloorHalfWidth(z)) {
      openMouths.heights[index] = 6; openMouths.positions[index * 3 + 1] = 6;
    }
  }
  assert.throws(() => assertEnclosedCanyon(openMouths), { code: 'ERR_ASSERTION' }, 'Reject the open-mouth canyon');
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
  for(let k=0;k<columns;k++) { const i=columns+k,x=previous.positions[i*3],z=previous.positions[i*3+2];
    assert.ok(Math.abs(previous.heights[i]-field.getHeightAt(x,z))<.00002,'in-place owner also seats on actual ground'); }
  receipts.push({ ringSeed, groundSeed, constructionQueries, constructionMs, maximumSeamError, maximumHeight: ring.maxHeight });
}
for (const id of MAP_IDS) if (id !== 'badlands') {
  const actual = getMapConfig(id);
  assert.deepEqual(sampleHorizonGeometry({ ...actual, horizon: { ...actual.horizon, redrockCanyon: true } }, 1337),
    sampleHorizonGeometry(actual, 1337), `${id}: no cross-map opt-in leak`);
}
// Inspect the interiors of the actual closing triangles on a steep snowy
// corner. The old locally buried anchors could bridge above its valley.
{
  const map=getMapConfig('alpine'),field=createHeightField(1337,map);
  const ring=sampleHorizonGeometry(map,1337,field),p=ring.positions;
  let protrusion=-Infinity,oldProtrusion=-Infinity;
  for(let k=0;k<columns;k++)for(const ids of [[k,columns+k,(k+1)%columns],[(k+1)%columns,columns+k,columns+(k+1)%columns]]) {
    for(let a=1;a<8;a++)for(let b=1;b<9-a;b++) {
      const weights=[a/10,b/10,1-(a+b)/10],point=[0,0,0];let oldHeight=0;
      for(let j=0;j<3;j++) {
        const i=ids[j];
        for(let axis=0;axis<3;axis++)point[axis]+=p[i*3+axis]*weights[j];
        oldHeight+=(i<columns?field.getHeightAt(p[i*3],p[i*3+2])-10:p[i*3+1])*weights[j];
      }
      const height=field.getHeightAt(point[0],point[2]);
      protrusion=Math.max(protrusion,point[1]-height);oldProtrusion=Math.max(oldProtrusion,oldHeight-height);
    }
  }
  assert.ok(protrusion<0,`Closing triangles stay below Alpine's playable valleys: ${protrusion}`);
  // (the map-borders lane's foreground clearance, 2026-10-03, lowers the ground the old anchors bridged toward: 1.46 m;
  // Glacier Pass's layout-brief rebuild on the borders' second pass, merged 2026-10-03, leaves 0.85 m: still a ledge the
  // old anchors raise above the valley, against a closing surface that now stays below it)
  assert.ok(oldProtrusion>0.5,`Negative control reproduces the visible ledge: ${oldProtrusion}`);
}
console.log(JSON.stringify({ test: 'redrockCanyonHorizon', receipts,
  limits: 'CPU actual-triangle seam/mouth/topology. Native visual/prop/collision/FPS acceptance remains separate.' }, null, 2));
