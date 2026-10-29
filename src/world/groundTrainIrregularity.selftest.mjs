import assert from 'node:assert/strict';
import { terrainSourceText } from './terrainSourceText.mjs';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// 264b (2026-10-29, Main's flags from item 264's blind critics, after the owner's "weird parallel lines on ground … on
// all maps"): the ground terms the critics still read as ruled bands once the land use's were gone. Pins:
// (a) the sand maps' near ripple and megaripple trains (the Desert's and Mars's chase frames: "regular parallel ripple
//     stripes") — each cell its own spacing, the crests bent by the material's own noise and broken in patches, sharp
//     over broad troughs; sandWaves (the dune bedforms) untouched;
// (b) a turned field's lift per channel, and Ironworks' brownfield plots a coal-dusted loam's brown over the works' dark
//     red-brown dirt (the critics' "near-black flat" plot beside the slag tip);
// (c) a vegetated map's sward: the landform dapple's relief cut and faded at grazing views (Blackglass's "dark pocked
//     dimples … rippled water", Monsoon's and Mangrove's phone smear, the pasture strip behind Steinburg's field2).
// No GPU or art claim: the frames and the blind critics are the lane's evidence (TESTS-OWED, 264b).

const source = terrainSourceText();
const flat = source.replace(/\s+/g, ' ');
const has = (line, what) => assert.ok(flat.includes(line.replace(/\s+/g, ' ')), what ?? `the material: ${line}`);

// (a) the ripple trains
const fn = /vec2 sandRipples\(vec2 p, vec2 w0, float cellM, float swing, vec2 ph, vec2 k, vec2 amp\) \{([\s\S]*?)\n\}/.exec(source);
assert.ok(fn, 'the ripples have their own train function');
const body = fn[1].replace(/\s+/g, ' ');
assert.ok(body.includes('float d = dot(p - (c + 0.5) * cellM, w);'), 'each train measures its phase from its own cell centre (no global phase)');
const jitter = /d \* k\.x \* \(([0-9.]+) \+ ([0-9.]+) \* fract\(/.exec(body);
assert.ok(jitter, 'each cell runs the ripples at its own spacing');
const lo = Number(jitter[1]), span = Number(jitter[2]);
assert.ok(lo < 1 && lo + span > 1 && span >= 0.15 && span <= 0.4, `the spacing varies ±${(span * 50).toFixed(0)} % cell by cell, about the authored one`);
assert.ok(body.includes('+ ph.x;') && body.includes('+ ph.y);'), 'both trains take the caller\'s phase field');
const harmonic = /float s1 = sin\(a1\) - ([0-9.]+) \* sin\(2\.0 \* a1\);/.exec(body);
assert.ok(harmonic && Number(harmonic[1]) > 0.15 && Number(harmonic[1]) < 0.5, 'the crests stand sharp over broad troughs (a second harmonic of the slope, under half)');
// the slope's mean over a period stays zero: the harmonic tilts no ground
const h = Number(harmonic[1]);
let mean = 0;
for (let i = 0; i < 720; i++) { const a = (i / 720) * 2 * Math.PI; mean += Math.sin(a) - h * Math.sin(2 * a); }
assert.ok(Math.abs(mean / 720) < 1e-9, 'the sharpened profile adds no net tilt');
// the noise texture's channels (makeShaderNoiseTexture: R 4–9 cycles a tile, G 2–5) sit at 0.43–0.57 between their
// quartiles and 0.32–0.69 between the 5th and 95th percentiles (seed 3011): a window wider than that never breaks a train
has('vec4 ripN = nz(uv, 0.11, vec2(0.37, 0.71));', 'the ripples\' own read: 1–4 m features (a 9 m tile)');
const patch = /nearRip \*= \(0\.35 \+ 0\.65 \* smoothstep\(([0-9.]+), ([0-9.]+), n1\)\) \* \(0\.2 \+ 0\.8 \* smoothstep\(([0-9.]+), ([0-9.]+), ripN\.r\)\);/.exec(flat);
assert.ok(patch, 'the near crests stand in patches: strong and faint stretches (n1) and breaks every metre or two (ripN.r)');
for (const [a, b] of [[patch[1], patch[2]], [patch[3], patch[4]]]) {
  assert.ok(Number(a) >= 0.38 && Number(b) <= 0.62 && Number(b) - Number(a) <= 0.24, `a patch window (${a}–${b}) inside the channel's spread, so some ground has no crests and some has them whole`);
}
const ph = /vec2 ripPh = vec2\(sinuosity \+ \(n1h - 0\.5\) \* ([0-9.]+) \+ \(ripN\.g - 0\.5\) \* ([0-9.]+), sinuosity \* 0\.4 \+ \(n1h - 0\.5\) \* ([0-9.]+)\);/.exec(flat);
assert.ok(ph, 'the crests bend with the material\'s own noise at metres (n1h, 2–5 m; ripN.g, 1–4 m)');
// between the channel's quartiles (±0.07) the bend moves a 0.38 m crest by a fifth to a half of its spacing; its own
// wave number (the bend over a feature's half width) stays a fraction of the train's 16.5 rad/m, so no new period
const bendRad = 0.07 * Number(ph[1]) + 0.07 * Number(ph[2]);
assert.ok(bendRad >= 1.2 && bendRad <= 3.2, `a crest wanders ${(bendRad / (2 * Math.PI)).toFixed(2)} of a spacing along its run`);
assert.ok((0.19 * Number(ph[1])) / 1.0 < 16.5 * 0.35, 'the bend\'s slope stays under a third of the train\'s wave number');
assert.ok(0.07 * Number(ph[3]) <= 0.3, 'the megaripples take only a breath of the bend');
has('vec2 rSlope = sandRipples(uv, wind0, 22.0, 0.6, ripPh, vec2(16.5, 0.55), vec2(nearRip, megaRip));', 'the near and megaripple trains call the ripples\' function');
assert.equal((flat.match(/sandRipples\(/g) ?? []).length, 2, 'one definition and one call');
assert.ok(/vec2 bedSlope = sandWaves\(uv, wind0, 260\.0, 0\.45,/.test(flat), 'the dune bedforms keep sandWaves');

// (c) the sward's dapple: its relief cut and faded where the view grazes the flat (Blackglass's pocks, the phone smears)
const swardRelief = /#define SWARD_DAP_RELIEF ([0-9.]+)/.exec(flat);
assert.ok(swardRelief && Number(swardRelief[1]) >= 0.25 && Number(swardRelief[1]) <= 0.6, 'the sward keeps a share of the dapple\'s relief (0.25 left a flat meadow, 0.6 faint pocks)');
has('float swardRelief = mix(1.0, SWARD_DAP_RELIEF, vegSward);', 'the cut applies on a vegetated map\'s sward only (fields, arid and snow maps keep theirs)');
has('float vegGround = dapField * (1.0 - step(0.5, uReduxD.y));', 'a vegetated map\'s open ground: fields, arid and snow maps keep their dapple');
has('max(smoothstep(0.01, 0.08, slope), vegGround));', 'the grazing fade runs on a vegetated map\'s flat open ground as on a slope');
assert.ok(!/uDbgA/.test(flat), 'no tuning knob left in the material');

// (b) the plough's lift per channel
has('uniform vec3 uPloughLift;', 'the turned field\'s lift is a colour');
has('cropCol = ploughSoil * vec3(0.62, 0.55, 0.47) * uPloughLift * bright;');
has("shader.uniforms.uPloughLift = { value: typeof ploughLift === 'number' ? new THREE.Vector3(ploughLift, ploughLift, ploughLift) : new THREE.Vector3(...ploughLift) };",
  'a scalar lift stays grey (every map that had one) and a triple lifts each channel');
const foundryLift = getMapConfig('foundry').splat?.ploughLift;
assert.ok(Array.isArray(foundryLift) && foundryLift.length === 3, 'Ironworks lifts its turned plots per channel');
assert.ok(foundryLift.every((v) => v >= 1 && v <= 4), `each channel lifted, never darker (${foundryLift.join(', ')}): a loam's brown over the works' dark red-brown dirt`);
assert.ok(foundryLift[1] >= foundryLift[0] && foundryLift[2] >= foundryLift[0], 'green and blue lifted at least as far as red: brown, not maroon');
assert.equal(getMapConfig('foundry').splat.soilTint, undefined, 'the works\' own dirt layer (cinder verges, yards) keeps its tone');
for (const id of MAP_IDS) {
  const lift = getMapConfig(id).splat?.ploughLift;
  if (lift == null || id === 'foundry') continue;
  assert.equal(typeof lift, 'number', `${id}: its scalar lift as it was`);
}

console.log(`groundTrainIrregularity: the ripple trains each cell's spacing (±${(span * 50).toFixed(0)} %), bent ${(bendRad / (2 * Math.PI)).toFixed(2)} of a spacing and broken in patches; the sward's dapple relief ×${swardRelief[1]}, graze-faded; Ironworks' turned plots lifted ${foundryLift.join('/')} PASS; no GPU/art claim`);
