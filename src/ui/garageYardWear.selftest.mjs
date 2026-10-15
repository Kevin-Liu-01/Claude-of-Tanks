import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GARAGE_HARDSTAND,
  GARAGE_HARDSTAND_STYLES,
  garageFacilityAlbedo,
  garageHardstandAlbedo,
  garageHardstandDetailKind,
  garageHardstandKind,
  garageHardstandNormal,
  garageHardstandNormalKind,
} from './garageYardWear.ts';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { garageHardstandDetailData } from './garageHardstandProgram.ts';
import { GARAGE_PLATFORM_GEOMETRY } from '../game/garagePresentationPose.ts';

// 2026-10-10 (the owner: "more detailed ... better textures"; wave 357: "giant bevelled castle flagstones", "car-park
// lane dashes painted on concrete, lawn and sand"): every outdoor Garage draws its own hardstand (sawn slabs at a real
// pitch or compacted earth, the yard's working history, its region's sand, snow, salt, cinders, soot, mud or dust) and
// its service facilities take shared weathered steel, enamel and concrete albedos instead of brick and flat colour.

// plain Node has no canvas: the textures are skipped, never faked
assert.equal(garageHardstandAlbedo('slab-sand', { x: 0, z: 10 }), null, 'no canvas, no albedo');
assert.equal(garageHardstandNormal('slab'), null, 'no canvas, no normal');
assert.equal(garageFacilityAlbedo('steel'), null, 'no canvas, no facility albedo');

// one floor per Garage, and the floors differ by region
const outdoor = GARAGE_VARIANTS.filter((variant) => variant.id !== 'verdant_motor_pool');
const styles = new Set(outdoor.map((variant) => GARAGE_HARDSTAND_STYLES[variant.architecture]));
assert.equal(styles.size, outdoor.length, 'each outdoor Garage has its own hardstand style');
assert.ok(outdoor.some((variant) => garageHardstandKind(GARAGE_HARDSTAND_STYLES[variant.architecture]) === 'earth'),
  'compacted earth where the region has no slab');
assert.equal(GARAGE_HARDSTAND_STYLES.shade_depot, 'earth-sand', 'Sirocco: compacted wadi sand and gravel');
assert.equal(GARAGE_HARDSTAND_STYLES.repair_bunker, 'earth-snow', 'Frosthollow: snow-packed');
assert.equal(GARAGE_HARDSTAND_STYLES.factory_line, 'earth-slag', 'Ironworks: a slag yard');
// wave 393: round pebble bumps read as "a repeating dimpled cratered-foam texture"; earth relief is irregular noise at a
// low amplitude on a 6.4 m tile, packed snow a softer field of its own, slabs keep their joints
for (const variant of outdoor) {
  const style = GARAGE_HARDSTAND_STYLES[variant.architecture];
  const expected = garageHardstandKind(style) === 'slab' ? 'slab' : style === 'earth-snow' ? 'snow' : 'earth';
  assert.equal(garageHardstandNormalKind(style), expected, `${variant.id}: ${style} takes the ${expected} relief`);
}

// the texel layout is the apron's: square texels, slabs at a real pitch, the joint grid wrapping at the canvas edge
assert.equal(GARAGE_HARDSTAND.widthM, 29);
assert.equal(GARAGE_HARDSTAND.depthM, 24);
assert.ok(Math.abs(GARAGE_HARDSTAND.canvasH / GARAGE_HARDSTAND.canvasW - 24 / 29) < 0.01, 'square texels on the apron');
for (const pitch of GARAGE_HARDSTAND.slabPitchM) {
  assert.ok(pitch > 3 && pitch < 6, `slabs pour at a real yard pitch (${pitch.toFixed(2)} m)`);
  // the re-judge, 2026-10-15: joints squared to the facades and the turntable (the view's axis); the grid reflects onto
  // itself at the canvas's edges, so the mirrored apron stays seamless (each span within 10 cm of whole pitches)
  for (const span of [29 / Math.SQRT2, 24 / Math.SQRT2]) {
    assert.ok(Math.abs(span / pitch - Math.round(span / pitch)) * pitch < 0.1, `the joint grid reflects at the canvas edge (${span.toFixed(2)} m)`);
  }
}
assert.equal(GARAGE_HARDSTAND.jointAxisDeg, 45, 'the joints run square to the view axis');

const kit = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const yardWear = await readFile(new URL('./garageYardWear.ts', import.meta.url), 'utf8');
const wear = await readFile(new URL('./garageYardWear.ts', import.meta.url), 'utf8');
const facility = await readFile(new URL('./garageFacilityDetails.ts', import.meta.url), 'utf8');
const relief = wear.slice(wear.indexOf('export function garageHardstandNormal('), wear.indexOf('export function garageHardstandKind('));
assert.doesNotMatch(relief, /Math\.sqrt\(1 - dd\)|pebbles?:/, 'no round pebble bumps in the floor relief');
assert.match(wear, /const EARTH_NORMAL_TILE_M = 6\.4;/, 'the earth relief repeats no tighter than every 6.4 m');
assert.match(kit, /hardstandNormalKind === 'snow' \? new THREE\.Vector2\(0\.3, 0\.3\) : new THREE\.Vector2\(0\.45, 0\.45\)/,
  'earth and snow relief at a low amplitude');
assert.match(kit, /garageHardstandAlbedo\(hardstandStyle, garageViewPoint\(approachSide, approachDepth\)/,
  'each pack draws its hardstand with track lanes down its own approach road');
assert.match(kit, /map: track\(hardstandAlbedo\), normalMap: hardstandNormal/,
  'the pack owns its albedo; the floor-kind normal is shared and never disposed by a pack');
assert.doesNotMatch(kit, /texturedMaterial\('cobble'/, 'no stretched paving tile on the hardstand');
assert.doesNotMatch(kit, /garage_service_yard_wear/, 'the yard history lives in the hardstand, not a second decal');
assert.match(kit, /return Math\.max\(ground, GARAGE_PLATFORM_GEOMETRY\.terrainSurfaceYM\) \+ 0\.02;/,
  'the apron drapes 2 cm over the shaped terrain, at the canonical ground surface inside the podium ring');
assert.match(kit, /if \(ground > APRON_RISE_LIMIT_M\) return ground - 0\.06;/,
  'above the rise limit the apron sinks under the terrain, so its edge follows the slope (wave 398: "jagged polygon edges")');
assert.ok(GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM + 0.02 < 0,
  'inside the podium ring the apron stays below the turntable base (y = 0)');
// 2026-10-11, wave 408 (Ironworks' K2 "on raw moss-and-rock moorland", "cookie-cut pads", Frosthollow's "ruler-straight
// seam"): every fleet pad lays the yard's own worked ground, its level core on the pad's datum and its margin draped over
// the terrain's feather, and the whole hardstand thins out into the terrain on a graded edge
assert.doesNotMatch(kit, /const padSlabs =/, 'no yard kind leaves its exhibits on raw terrain');
assert.match(kit, /if \(!terrace\.label\.startsWith\('fleet-service-'\)\) continue;[\s\S]*const y = \(radius \* PAD_REACH \* 1\.075 <= 1\.2 \? terrace\.y : samplePatch\(patch, heights, x, z\)\) \+ 0\.02;/,
  'worked ground lies on the fleet exhibit pads: the core on the datum, the margin draped');
assert.match(kit, /const PAD_RINGS = \[\[0, 1\], \[0\.5, 1\], \[0\.68, 1\], \[0\.84, 0\.45\], \[1, 0\]\] as const;/,
  'each pad thins out over its outer third');
assert.match(kit, /const edge = \(APRON_HALF_M - Math\.max\(Math\.abs\(x\), Math\.abs\(z\)\)\) \/ GARAGE_HARDSTAND_FEATHER_M;/,
  'the apron thins out over its outer metres instead of stopping at a cut');
// GA.03 (the garage critic panel, 2026-10-14: "the graded pad ends in a hard diagonal with raw grass or scrub in the lower
// left"): the canonical camera stands about 18 m out on the view axis and its frame's foot meets the ground about 13.5 m
// short of the turntable, 3.3 m either side of the axis; the apron must hold those points (and a larger hull's camera,
// 3 m further out) a full feather inside its edge
{
  const half = Number(kit.match(/const APRON_HALF_M = (\d+(?:\.\d+)?);/)?.[1]);
  assert.ok(half > 0, 'the apron names its half-size');
  const toWorld = (side, depth) => [Math.SQRT1_2 * (side - depth), -Math.SQRT1_2 * (side + depth)];
  for (const [side, depth] of [[-3.3, -13.5], [3.3, -13.5], [-4, -16.5], [4, -16.5], [-15.8, 4.9], [15.8, 4.9]]) {
    const [x, z] = toWorld(side, depth);
    assert.ok(half - Math.max(Math.abs(x), Math.abs(z)) >= 2.4 - 1e-6,
      `the frame's ground at view (${side}, ${depth}) lies on worked ground (world ${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  assert.match(kit, /uvs\.setXY\(index, positions\.getX\(index\) \/ 29 \+ 0\.5, 0\.5 - positions\.getZ\(index\) \/ 24\);/,
    'the larger apron keeps the 29 x 24 m texel layout (read mirrored beyond it)');
}
assert.match(kit, /const rise = 1 - THREE\.MathUtils\.smoothstep\(ground, 0\.18, APRON_RISE_LIMIT_M - 0\.01\);/,
  'the apron is gone before the ground climbs to the rise limit, so no crossing line shows on a slope');
assert.match(kit, /new THREE\.MeshStandardMaterial\(\{ \.\.\.options, transparent: true, depthWrite: false \}\);[\s\S]{0,260}engineCtx\.setupShadowMaterial\?\.\(material, garageHardstandGradedHook\(garageHardstandGrainTexture\([^)]*\), grainStrength,\s*hardstandDetail, hardstandWet, hardstandSparkle\)[\s\S]{0,80}\);\s*material\.customProgramCacheKey = \(\) => GARAGE_HARDSTAND_PROGRAM_KEY;/,
  'the graded floor blends over the terrain on its own keyed program after the cascade hook, with the shared grain');
assert.match(kit, /hardstand\.renderOrder = -1;/, 'the floor draws before the decals that lie on it');
const program = await readFile(new URL('./garageHardstandProgram.ts', import.meta.url), 'utf8');
assert.match(program, /attribute float hardstandBlend;/, 'each vertex carries its share of worked ground');
assert.match(program, /diffuseColor\.a \*= smoothstep\(0\.36, 0\.64, vHardstandBlend \+ \(hardstandBreak - 0\.5\) \* 0\.72\);/,
  'the margin is broken by noise, not a ruled line');
// round 5d-2 (waves 408 and 419: "a blurry, smeared texture", "stretched low-resolution image"): a shared 256 px/m grain
// multiplies into the yard's 35 px/m layout, neutral on average so it fades with distance
assert.match(program, /export const GARAGE_HARDSTAND_GRAIN_TILE_M = 2;/, 'the grain repeats every 2 m');
assert.match(program, /diffuseColor\.rgb \*= mix\(vec3\(1\.0\), texture2D\(hardstandGrain, vHardstandGround \* \$\{/, 'the grain multiplies into the albedo in the ground plane');
// GA.03 (the garage critic panel, 2026-10-14: "a detail layer per ground type ... a detail normal map and 16x anisotropic
// filtering"): every floor folds its ground type's relief into the albedo and the normal in the ground plane, on the same
// program everywhere; the reliefs are level and x1 on average (their mips fade out with distance)
assert.match(program, /vec4 hardstandDetailTexel = texture2D\(hardstandDetail, vHardstandGround \* hardstandDetailParams\.x\);/,
  'the detail is sampled in the ground plane at its own scale');
assert.match(program, /normal = normalize\(normal \+ vHardstandAxisX \* hardstandSlope\.x \+ vHardstandAxisZ \* hardstandSlope\.y\);/,
  'the detail relief tilts the floor normal');
assert.match(kit, /const floorAnisotropy = \(engineCtx\.anisotropy \?\? 4\) >= 8 \? 16 : \(engineCtx\.anisotropy \?\? 4\);/,
  'the floor filters at 16x where the device allows it');
assert.equal(garageHardstandDetailKind('slab-urban'), 'concrete');
// garage round 7, place-truth (the critic panel, 2026-10-14: Monsoon "a dry, sunny dirt yard with no wet sheen, puddles"):
// the same program carries standing water; Monsoon's wet mask polishes its puddles flat and glossy and dampens the yard,
// every other floor reads it at zero
assert.match(program, /float hardstandWater = hardstandWet \* texture2D\(hardstandWetMask, vMapUv\)\.r;/,
  'the puddles come from the yard\'s wet mask on the floor\'s own UVs');
assert.match(program, /roughnessFactor = mix\(roughnessFactor \* \(1\.0 - 0\.28 \* hardstandWet\), 0\.06, hardstandWater\);/,
  'the water is glossy and the wet yard damp');
assert.match(program, /normal = normalize\(mix\(normal, nonPerturbedNormal, hardstandWater \* 0\.92\)\);/, 'standing water lies flat');
assert.match(program, /shader\.uniforms\.hardstandWet = \{ value: wet\?\.mask \? wet\.amount : 0 \};/, 'dry floors read no water');
assert.match(kit, /const hardstandWetMaskTexture = garageHardstandWetMask\(hardstandStyle\);/, 'the pack asks its style for a wet mask');
assert.match(program, /totalEmissiveRadiance \+= vec3\(1\.5\) \* hardstandGlint \* hardstandSparkle \* \(1\.0 - smoothstep\(9\.0, 30\.0, length\(vViewPosition\)\)\);/,
  'snow sparkles near the camera and never shimmers far off');
assert.match(kit, /const hardstandSparkle = hardstandStyle === 'earth-snow' \? 1/, 'the snow yards sparkle');
assert.match(yardWear, /if \(style !== 'earth-wet' \|\| typeof document === 'undefined'\) return null;/, 'only the monsoon yard is wet');
assert.equal(garageHardstandDetailKind('earth-sand'), 'sand');
assert.equal(garageHardstandDetailKind('earth-snow'), 'snow');
assert.equal(garageHardstandDetailKind('earth-slag'), 'gravel');
assert.equal(garageHardstandDetailKind('earth-dust'), 'earth');
for (const kind of ['concrete', 'earth', 'sand', 'snow', 'gravel']) {
  const data = garageHardstandDetailData(kind);
  let r = 0, g = 0, b = 0, spread = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  r /= n; g /= n; b /= n;
  for (let i = 0; i < data.length; i += 4) spread += Math.abs(data[i] - 128) + Math.abs(data[i + 1] - 128);
  spread /= n;
  assert.ok(Math.abs(r - 128) < 3 && Math.abs(g - 128) < 3, `${kind}: the relief is level on average (${r.toFixed(1)}, ${g.toFixed(1)})`);
  assert.ok(Math.abs(b - 128) < 4, `${kind}: the albedo factor is x1 on average (${b.toFixed(1)})`);
  assert.ok(spread > 4, `${kind}: the relief carries real slopes (${spread.toFixed(1)})`);
}
const stage = await readFile(new URL('./garageStage.ts', import.meta.url), 'utf8');
assert.match(stage, /addOutdoorSeed\('hardstand-graded'/, 'the stage compiles the graded floor\'s program with the outdoor seeds');
// 2026-10-11, waves 393 and 398 ("repeated tread decals", "confetti speckle"): curved compacted wheel paths and clumped
// irregular grit replace the straight painted track lanes and the square flecks
assert.doesNotMatch(wear, /for \(let i = 0; i < 26000; i\+\+\)/, 'no square confetti speckle');
assert.match(wear, /const wheelPath = \(/, 'curved wheel paths');
assert.doesNotMatch(wear, /setLineDash|fillText/, 'no painted bay boxes, dashes or stencils');
assert.doesNotMatch(wear, /requestAnimationFrame|setInterval|addEventListener/, 'no per-frame or event work');
assert.match(kit, /masonry: \{ color: garageFacilityAlbedo\('concrete'/, 'facility footings are cast concrete, not brick');
assert.doesNotMatch(kit, /acquire\('brick', requestRender\)/, 'no brick on the service facilities');
assert.match(facility, /GARAGE_SHELTER_FINISHES\[variant\.architecture\]/, 'each Garage paints and roofs its shelters its own way');
assert.doesNotMatch(facility, /clusterBox\(cluster, 0, 0, 0\.10, 10\.8, 0\.20, 9\.0,/,
  'no raised deck under a bay: the exhibit and its kit stand on the pad');

// 2026-10-11, waves 393-402 ("flat grey trapezoid mountains", "cardboard mountains", "Saltmere never shows its sea"):
// the backdrop bands are landform faces of several rows, and the coast carries its sea past a cut-back quay
assert.match(kit, /const ROWS = 8;/, 'backdrop bands carry rows from foot to crest, not a fence');
assert.match(kit, /if \(style === 'coastal'\) \{\s*\/\/ the sea from the shore to the horizon/, 'the coastal backdrop carries its sea');
// round 5d-2 (waves 408 and 419: "flat untextured grey trapezoid slabs", "flat grey-blue blocks"): no stepped skyline
// crest in a silhouette tint; the town, the steelworks and the railway are building masses behind low land
assert.doesNotMatch(kit, /const sawtooth = skylineCell % 3 === 0|const shedRoof = skylineCell % 5 < 3|const tower = 0\.08 \+ skylineHash/,
  'no stepped skyline slabs');
assert.match(kit, /function addBuiltHorizon\(/, 'a built horizon of building masses');
assert.match(kit, /const shapeQuayAndShore = \(\): void => \{/, 'Saltmere cuts its bank to a quay and a shore');
console.log(`garageYardWear.selftest: ${styles.size} regional hardstands, shared facility albedos, no paint`);
