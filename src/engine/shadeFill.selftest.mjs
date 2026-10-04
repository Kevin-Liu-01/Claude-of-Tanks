// shadeFill.selftest — shade on dark materials kept off black (2026-10-03, the shade-fill lane; the gauntlet's waves 29, 34
// and 36: a tank's shadow on Verdant's grass at about RGB (12, 40, 8), a shaded village wall "a flat, textureless matte-black
// mass", Saltmere's granite tor "crushed to near-black against the bright sky").
//
// The numeric probe. Three shaded / sunlit pairs measured on the gauntlet's own frames (the median of a fixed box each)
// and inverted through the output chain (post.ts: the scene-referred saturation and contrast, three's AgX, the sRGB
// transfer, the black point; agxgrade.py in the lane's tools carries the full-colour inversion) — the light the scene
// held before the grade, as a share of the sunlit surface's:
//   the grass in a tank's cast shadow, beside the hull (wave 29, verdant chase)   0.0285 / 0.1742 = 0.164
//   the shaded run of a village wall, its face turned from the sun (wave 34)        0.0299 / 0.1406 = 0.212
//   the granite tor's shaded faces, turned from the sun, against sunlit ground (36) 0.0538 / 0.2489 = 0.216
// The light balance was already a clear day's (the scene held 16-22 % of the sunlit light in shade); the grade crushed
// it to 6-15 % on screen: the scene-referred contrast's constant slope (1.28) times AgX's own slope, which rises below the
// card. Pinned here: the crush the old chain gave (the receipt fails it), the photographic toe that fixes it (the slope
// eases below the card only: nothing at or above the card moves), the facing rule for the shadow's ambient dim (a face
// turned from the sun keeps its sky), and the shade ratios the fixed chain gives the three pairs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
const constant = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(m, `declares ${name}`);
  return Number(m[1]);
};
const CONTRAST = constant(post, 'GRADE_CONTRAST'), BLACK = constant(post, 'GRADE_BLACK_POINT');
const TOE_SLOPE = constant(post, 'GRADE_TOE_SLOPE'), TOE_STOPS = constant(post, 'GRADE_TOE_STOPS');
const dim = lighting.match(/const SHADOW_AMBIENT_DIM = \[([\d., ]+)\];/)[1].split(',').map(Number);
const DIM_LUMA = 0.2126 * dim[0] + 0.7152 * dim[1] + 0.0722 * dim[2];

// ---- the chain's twin on a grey value (three's AgXToneMapping keeps grey: its inset and outset matrices' rows sum to one)
const MIN_EV = -12.47393, MAX_EV = 4.026069;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sig = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
const agxGrey = (x) => clamp(Math.max(sig(clamp((Math.log2(Math.max(x, 1e-10)) - MIN_EV) / (MAX_EV - MIN_EV), 0, 1)), 0) ** 2.2, 0, 1);
const oetf = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const eotf = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const constantSlope = (x) => 0.18 * (Math.max(x, 1e-6) / 0.18) ** CONTRAST;
const toe = (x, slope = TOE_SLOPE, stops = TOE_STOPS) => {
  const u = Math.log2(Math.max(x, 1e-6) / 0.18);
  if (u >= 0) return 0.18 * 2 ** (CONTRAST * u);
  const t = clamp((u + stops) / stops, 0, 1), g = t ** 3 * (1 - 0.5 * t);
  return 0.18 * 2 ** (slope * u - (CONTRAST - slope) * stops * (0.5 - g));
};
/** The display-linear luminance a grey scene value (exposure applied) reaches on screen. */
const display = (x, pre) => eotf(Math.max(oetf(agxGrey(pre(x))) - BLACK, 0) / (1 - BLACK));
const slopeAt = (stops, pre) => { const x = 0.18 * 2 ** stops; return Math.log(display(x * 1.02, pre) / display(x, pre)) / Math.log(1.02); };

// ---- 1. the GLSL is the twin, on the grounded rig by day
assert.match(post, /if \( uToe\.y > 0\.0 \) \{[\s\S]{0,400}vec3 cotU = log2\( max\( outputColor\.rgb, vec3\( 1e-6 \) \) \* \( 1\.0 \/ 0\.18 \) \);\s*vec3 cotT = clamp\( \( cotU \+ uToe\.y \) \/ uToe\.y, 0\.0, 1\.0 \);\s*vec3 cotG = cotT \* cotT \* cotT \* \( 1\.0 - 0\.5 \* cotT \);\s*vec3 cotBelow = uToe\.x \* cotU - \( uContrast - uToe\.x \) \* uToe\.y \* \( 0\.5 - cotG \);\s*outputColor\.rgb = 0\.18 \* exp2\( mix\( cotBelow, uContrast \* cotU, step\( 0\.0, cotU \) \) \);\s*\} else \{\s*outputColor\.rgb = 0\.18 \* pow\( max\( outputColor\.rgb, vec3\( 1e-6 \) \) \* \( 1\.0 \/ 0\.18 \), vec3\( uContrast \) \);\s*\}/,
  'the toe in the output pass: the slope eases below the card, the constant slope above it and off the toe');
assert.match(post, /const toeOn = model\.mode === 'physical' && model\.night < 0\.999;/, 'the grounded rig by day');
assert.match(post, /u\.uToe\.value\.set\(toeSlope, toeOn \? lightTune\('GRADE_TOE_STOPS', GRADE_TOE_STOPS\) : 0\);/);
assert.match(post, /\} else \{\s*u\.uToe\.value\.set\(0, 0\);/, 'without a model (before the first preset) the constant slope');
assert.match(post, /const toeSlope = THREE\.MathUtils\.lerp\(lightTune\('GRADE_TOE_SLOPE', GRADE_TOE_SLOPE\) \* model\.contrast, u\.uContrast\.value as number,\s*THREE\.MathUtils\.clamp\(model\.night, 0, 1\)\);/,
  'the toe\'s slope returns to the constant one with the night');

// ---- 2. at and above the card nothing moves (the sunlit range, the sky)
for (const stops of [0, 0.3, 1, 2, 3, 4.5]) {
  const x = 0.18 * 2 ** stops;
  assert.ok(Math.abs(toe(x) / constantSlope(x) - 1) < 1e-12, `${stops} stops over the card: the constant slope`);
}
// and the sunlit dark materials just under it barely: the sunlit grass (−0.05 stops), the sunlit wall (−0.36), a sunlit canopy (−0.6)
for (const [stops, bar] of [[-0.05, 0.01], [-0.36, 0.015], [-0.6, 0.04]]) {
  const x = 0.18 * 2 ** stops, gain = display(x, toe) / display(x, constantSlope) - 1;
  assert.ok(gain >= 0 && gain < bar, `${stops} stops: the toe lifts it ${(gain * 100).toFixed(2)} % (under ${bar * 100} %)`);
}

// ---- 3. the crush, and the photographic slope (display-linear against scene-linear, log-log)
// the old chain: the composite slope climbed from about 1 at the card to 2.0 at 2.5 stops under it and 4.8 at 4
assert.ok(slopeAt(-2.5, constantSlope) > 1.9 && slopeAt(-4, constantSlope) > 3, 'the old chain crushed the shade (the receipt fails it)');
for (let stops = -4; stops <= -0.25; stops += 0.25) {
  const s = slopeAt(stops, toe);
  assert.ok(s > 0.9 && s < 1.25, `${stops} stops: the composite slope ${s.toFixed(2)} is a camera's (0.9-1.25)`);
}
assert.ok(toe(0.01) < toe(0.02) && toe(0.02) < toe(0.1) && toe(0.1) < toe(0.18), 'monotonic');
assert.ok(display(0.18 * 2 ** -6, toe) < 0.005, 'six stops under the card is still near black (contact cores keep their dark)');

// ---- 4. the facing rule: a face turned from the sun keeps the ambient the dim took
const facingGain = 1 / DIM_LUMA;
assert.ok(facingGain > 1.1 && facingGain < 1.2, `a face turned from the sun keeps its sky: ×${facingGain.toFixed(3)} on its shade`);

// ---- 5. the three gauntlet pairs: the old chain under the 18 % bar, the fixed chain in a clear day's 18-25 %
const PAIRS = [
  // [name, shade, sun, the facing rule's gain on the shade]
  ['the grass beside the hull, in its cast shadow (sun-facing: the dim stays)', 0.0285, 0.1742, 1],
  ['the village wall\'s shaded run (its face turned from the sun)', 0.0299, 0.1406, facingGain],
  ['the tor\'s shaded faces (turned from the sun)', 0.0538, 0.2489, facingGain],
];
const ratios = [];
for (const [name, shade, sun, gain] of PAIRS) {
  const before = display(shade, constantSlope) / display(sun, constantSlope);
  const after = display(shade * gain, toe) / display(sun, toe);
  assert.ok(before < 0.16, `${name}: the old chain showed ${(before * 100).toFixed(1)} % (under the bar)`);
  ratios.push(`${(before * 100).toFixed(1)} → ${(after * 100).toFixed(1)} %`);
  if (gain > 1) assert.ok(after >= 0.18 && after <= 0.26, `${name}: ${(after * 100).toFixed(1)} % of the sunlit surface (18-25 %)`);
  // beside a hull the hull itself hides a fifth of the sky (vehicleGroundOcclusion.ts) on top of the circumsolar sky the
  // cast shadow takes: 15 % is that ground's physical share, shown as it is
  else assert.ok(after >= 0.14 && after <= 0.2, `${name}: ${(after * 100).toFixed(1)} % (the hull's own sky occlusion keeps it under a clear day's open shade)`);
}

console.log(`shadeFill.selftest: the photographic toe (slope ${CONTRAST} → ${TOE_SLOPE} over ${TOE_STOPS} stops under the card; a camera's 0.9-1.25 composite to 4 stops), nothing at or over the card moved, the facing rule ×${facingGain.toFixed(3)}; the three gauntlet pairs ${ratios.join(', ')} PASS`);
