// Receipt of Saltwind's soil (the ground lane, 2026-10-08, after gauntlet waves 286b and 287 on Saltwind Narrows: the
// terra rossa "one flat, saturated orange-red in every frame", "a flat, saturated red or vermilion decal with hard edges",
// "a grey seam strip along its front edge", "no limestone rubble", grass "evenly scattered and identical" over a lawn).
// Certifies, from the sources and the CPU land use (no GPU, no art claim; the look is the wave's):
//   1. the karst's red earth is one hue in its three uses (the turned field, the vineyard's earth, the garrigue's bare
//      ground) and that hue, over the coast's sand photo, is a dusty brick: red 1.9-2.3x its green (wave 177's
//      "clay-court orange" was 3.4) and green 1.5-2.0x its blue (wave 83's mauve was 1.33);
//   2. the place's worn soil (saltwind.ts soilTint over the same sand) is the same brick;
//   3. the turned field is dulled and broken: its dry crust on the breaker's crowns and the plough's limestone clasts
//      (drifts near the camera, a fifth of its far mean), with no new noise reads;
//   4. a karst field ends raggedly against its margin, and its wall footing is rubble in clumps and gaps — never the
//      unbroken grey band that read as a seam where the scenery lane's wall keeps off a boulder or an apron;
//   5. half the karst's walled ground is garrigue grazing (cured grass, its red soil between the tussocks), and the
//      place's sward and tufts are cured yellow-grey, thinner.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAND_CROP, createLandFieldSample, landUseAt, resolveLandUseProfile } from './landUse.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import { getMapConfig } from './maps/index.ts';

const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const compact = (s) => s.replace(/\s+/g, ' ');

// 1. one hue, a dusty brick over the coast's sand (saltwind.ts: the dirt layer's photo mean, ~0.55 / 0.42 / 0.22)
const HUE = 'soilHue / max(reduxLuma(soilHue), 1e-3) * vec3(';
const uses = [...terrain.matchAll(/soilHue \/ max\(reduxLuma\(soilHue\), 1e-3\) \* vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/g)];
assert.equal(uses.length, 3, `the karst's red earth has three uses (got ${uses.length})`);
const mults = uses.map((m) => m.slice(1).map(Number));
for (const m of mults) assert.deepEqual(m, mults[0], `one hue for every karst use (${HUE}${m.join(', ')}))`);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SAND = [0.55, 0.42, 0.22];
const L = luma(SAND);
const soilHue = SAND.map((c) => 0.65 * c + 0.35 * L); // terrain.ts: mix(photo, its luminance, 0.35)
const brick = soilHue.map((c, i) => c / luma(soilHue) * mults[0][i] * 0.105);
const rg = brick[0] / brick[1], gb = brick[1] / brick[2];
assert.ok(rg >= 1.9 && rg <= 2.3, `the terra rossa's red ${rg.toFixed(2)}x its green (1.9-2.3: neither wave 177's orange 3.4 nor wave 83's mauve)`);
assert.ok(gb >= 1.5 && gb <= 2.0, `its green ${gb.toFixed(2)}x its blue (1.5-2.0: wave 83's mauve was 1.33)`);
assert.ok(luma(brick) > 0.10 && luma(brick) < 0.16, `its albedo luminance ${luma(brick).toFixed(3)} (a dusty brick, 0.10-0.16)`);

// 2. the worn soil: the same brick (the place's tint over the same sand)
{
  const tint = getMapConfig('saltwind').splat.soilTint;
  const worn = SAND.map((c, i) => c * tint[i]);
  const wrg = worn[0] / worn[1], wgb = worn[1] / worn[2];
  assert.ok(wrg >= 1.8 && wrg <= 2.3 && wgb >= 1.5 && wgb <= 2.0,
    `Saltwind's worn soil ${worn.map((v) => v.toFixed(3)).join(' / ')}: red ${wrg.toFixed(2)}x green, green ${wgb.toFixed(2)}x blue`);
  assert.ok(Math.abs(luma(worn) - luma(brick)) < 0.03, 'the worn soil and the turned field are one soil');
}

// 3. dulled and broken, with no new reads
{
  const field = compact(terrain.slice(terrain.indexOf('// terra rossa: the karst\'s red earth, turned'), terrain.indexOf('} else if (crop < 12.5) {')));
  assert.ok(field.includes('float crust = smoothstep(0.42, 0.78, n1h);'), 'the dry crust on the breaker\'s crowns');
  assert.ok(field.includes('vec3 clast = vec3(0.215, 0.205, 0.182) * bright;'), 'the limestone clasts\' cream-grey');
  assert.ok(field.includes('cropCol = mix(cropCol, clast, 0.18 * (1.0 - clastVis));'), 'the clasts\' share of the far mean');
  assert.equal([...field.matchAll(/\bnzq\(/g)].length, 2, 'the clasts read the two noise fields the stones always took');
  assert.ok(!/\(n1 - 0\.5\) \* 0\.9/.test(field), 'the furrows run straight (no metre-scale meander)');
}

// 4. the karst field's edge and its wall footing
{
  assert.ok(compact(terrain).includes('float inField = bnd > 2.5 ? smoothstep(0.85, 1.75, edgeM + (n1h - 0.5) * 0.45 + (n1 - 0.5) * 0.40)'),
    'a karst field ends raggedly against its margin');
  assert.ok(terrain.includes('float rubble = smoothstep(0.46, 0.66, n1h) * (0.45 + 0.55 * smoothstep(0.30, 0.70, n1));'),
    'the footing is rubble in clumps and gaps');
  assert.ok(!terrain.includes('(0.25 + 0.75 * smoothstep(0.38, 0.62, n1h))'), 'no unbroken footing band (wave 287\'s grey seam)');
  // the rubble's share of the line: under about half of it, as the breaker's field sits ~uniform in 0..1
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let mean = 0;
  for (let i = 0; i < 1000; i++) mean += sst(0.46, 0.66, (i + 0.5) / 1000) * (0.45 + 0.55 * 0.5);
  assert.ok(mean / 1000 < 0.45, `the footing covers ${(mean / 10).toFixed(0)} % of its line at its strongest (under 45 %)`);
}

// 5. half the karst's walled ground is grazing, and the place's sward is cured
{
  assert.ok(compact(terrain).includes('if (bnd > 2.5) { rows = 0.0; float bareVis = tileVis(1.5);'), 'a karst pasture is garrigue');
  let grazing = 0, total = 0;
  const s0 = createLandFieldSample(), saltwind = resolveLandUseProfile('saltwind');
  for (let z = -460; z <= 460; z += 6.7) for (let x = -460; x <= 460; x += 6.7) {
    landUseAt(saltwind, x, z, s0);
    if (!s0.active || s0.edgeM < s0.marginM) continue;
    total++; if (s0.crop === LAND_CROP.pasture) grazing++;
  }
  assert.ok(total > 500, `the walled ground sampled (${total})`);
  assert.ok(grazing / total >= 0.38, `Saltwind's walled ground is ${(100 * grazing / total).toFixed(0)} % grazing (>= 38 %)`);
  const grass = resolveGroundReduxProfile('saltwind').grass;
  assert.ok(grass && grass.tip[1] / grass.tip[0] < 1.0, `the sward's tip is cured yellow-grey (green ${(grass.tip[1] / grass.tip[0]).toFixed(2)}x its red)`);
  assert.ok(grass.density <= 0.5, 'and thinner');
  const veg = getMapConfig('saltwind').vegetation;
  assert.equal(typeof veg.grassTexTone, 'function', 'the cards\' own paint cured as well as their tint');
  assert.ok(veg.grassDensity <= 0.55, 'fewer tufts');
  console.log(`saltwindSoil: terra rossa ${brick.map((v) => v.toFixed(3)).join(' / ')} (red ${rg.toFixed(2)}x green, green ${gb.toFixed(2)}x blue), `
    + `${(100 * grazing / total).toFixed(0)} % grazing, footing rubble, ragged edge PASS; no GPU/art claim`);
}
