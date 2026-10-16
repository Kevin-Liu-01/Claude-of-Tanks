import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GARAGE_HARDSTAND,
  GARAGE_HARDSTAND_STYLES,
  garageFacilityAlbedo,
  garageHardstandAlbedo,
  garageHardstandKind,
  garageHardstandNormal,
  garageHardstandNormalKind,
} from './garageYardWear.ts';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
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
  assert.ok(pitch > 4 && pitch < 6, `slabs pour at a real yard pitch (${pitch.toFixed(2)} m)`);
}

const kit = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
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
assert.match(kit, /const edge = Math\.min\(14\.5 - Math\.abs\(x\), 12 - Math\.abs\(z\)\) \/ GARAGE_HARDSTAND_FEATHER_M;/,
  'the apron thins out over its outer metres instead of stopping at a cut');
assert.match(kit, /const rise = 1 - THREE\.MathUtils\.smoothstep\(ground, 0\.18, APRON_RISE_LIMIT_M - 0\.01\);/,
  'the apron is gone before the ground climbs to the rise limit, so no crossing line shows on a slope');
assert.match(kit, /new THREE\.MeshStandardMaterial\(\{ \.\.\.options, transparent: true, depthWrite: false \}\);\s*engineCtx\.setupShadowMaterial\?\.\(material, garageHardstandGradedHook\);\s*material\.customProgramCacheKey = \(\) => GARAGE_HARDSTAND_PROGRAM_KEY;/,
  'the graded floor blends over the terrain on its own keyed program after the cascade hook');
assert.match(kit, /hardstand\.renderOrder = -1;/, 'the floor draws before the decals that lie on it');
const program = await readFile(new URL('./garageHardstandProgram.ts', import.meta.url), 'utf8');
assert.match(program, /attribute float hardstandBlend;/, 'each vertex carries its share of worked ground');
assert.match(program, /diffuseColor\.a \*= smoothstep\(0\.36, 0\.64, vHardstandBlend \+ \(hardstandBreak - 0\.5\) \* 0\.72\);/,
  'the margin is broken by noise, not a ruled line');
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

console.log(`garageYardWear.selftest: ${styles.size} regional hardstands, shared facility albedos, no paint`);
