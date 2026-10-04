// shadeFill.selftest — shade on dark materials kept off black (2026-10-03, the shade-fill lane; the gauntlet's waves 29, 34
// and 36: a tank's shadow on Verdant's grass at about RGB (12, 40, 8), a shaded village wall "a flat, textureless matte-black
// mass", Saltmere's granite tor "crushed to near-black against the bright sky").
//
// The numeric probe: shaded / sunlit pairs at fixed poses (section 5), each measured as the median of fixed boxes and
// inverted through the old output chain (post.ts: the scene-referred saturation and contrast, three's AgX, the sRGB
// transfer, the black point; agxgrade.py in the lane's tools carries the full-colour inversion) to the light the scene
// held. The scene held 11-22 % of the sunlit light in shade; the old chain showed a quarter to a third of that share in
// deep shade: the scene-referred contrast's constant slope (1.28) times AgX's own slope, which rises below the card.
// Pinned here: the crush the old chain gave (the receipt fails it), the photographic toe that fixes it (the slope eases
// below the card only: nothing at or above the card moves), the facing rule for the shadow's ambient dim (a face turned
// from the sun keeps its sky), and the share of the scene's light the fixed chain shows for each pair.
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
const CHANNEL_FROM = constant(post, 'GRADE_TOE_CHANNEL_FROM'), CHANNEL_TO = constant(post, 'GRADE_TOE_CHANNEL_TO');
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
assert.match(post, /if \( uToe\.y > 0\.0 \) \{[\s\S]{0,600}vec3 cotU = log2\( max\( outputColor\.rgb, vec3\( 1e-6 \) \) \* \( 1\.0 \/ 0\.18 \) \);\s*vec3 cotUC = min\( cotU, vec3\( 0\.0 \) \);\s*float cotUL = min\( log2\( max\( sceneLuma, 1e-6 \) \* \( 1\.0 \/ 0\.18 \) \), 0\.0 \);\s*vec3 cotT = clamp\( cotUC \/ uToe\.y \+ 1\.0, 0\.0, 1\.0 \);\s*float cotTL = clamp\( cotUL \/ uToe\.y \+ 1\.0, 0\.0, 1\.0 \);\s*vec3 cotLiftC = uToe\.y \* \( cotT \* cotT \* cotT \* \( 1\.0 - 0\.5 \* cotT \) - 0\.5 \) - cotUC;\s*float cotLiftL = uToe\.y \* \( cotTL \* cotTL \* cotTL \* \( 1\.0 - 0\.5 \* cotTL \) - 0\.5 \) - cotUL;\s*vec3 cotLift = \( uContrast - uToe\.x \) \* mix\( vec3\( cotLiftL \), cotLiftC, smoothstep\( uToe\.z, uToe\.w, -cotUL \) \);\s*outputColor\.rgb = 0\.18 \* exp2\( uContrast \* cotU \+ cotLift \);\s*\} else \{\s*outputColor\.rgb = 0\.18 \* pow\( max\( outputColor\.rgb, vec3\( 1e-6 \) \) \* \( 1\.0 \/ 0\.18 \), vec3\( uContrast \) \);\s*\}/,
  'the toe in the output pass: the constant slope plus a lift under the card, read from the luminance near it and per channel deep under it');
// the luminance it reads is the exposed scene luminance the saturation pivots on
assert.match(post, /float sceneLuma = dot\( outputColor\.rgb, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \);\s*outputColor\.rgb = max\( mix\( vec3\( sceneLuma \), outputColor\.rgb, uSatLinear \), vec3\( 0\.0 \) \);\s*if \( uToe\.y > 0\.0 \) \{/);
assert.match(post, /uToe: \{ value: new THREE\.Vector4\(0, 0, 0, 0\) \},/);
assert.match(post, /uniform vec4 uToe;/);
assert.match(post, /const toeOn = model\.mode === 'physical' && model\.night < 0\.999;/, 'the grounded rig by day');
assert.match(post, /u\.uToe\.value\.set\(toeSlope, toeOn \? lightTune\('GRADE_TOE_STOPS', GRADE_TOE_STOPS\) : 0,\s*lightTune\('GRADE_TOE_CHANNEL_FROM', GRADE_TOE_CHANNEL_FROM\), lightTune\('GRADE_TOE_CHANNEL_TO', GRADE_TOE_CHANNEL_TO\)\);/);
assert.match(post, /\} else \{\s*u\.uToe\.value\.set\(0, 0, 0, 0\);/, 'without a model (before the first preset) the constant slope');
assert.match(post, /const toeSlope = THREE\.MathUtils\.lerp\(lightTune\('GRADE_TOE_SLOPE', GRADE_TOE_SLOPE\) \* model\.contrast, u\.uContrast\.value as number,\s*THREE\.MathUtils\.clamp\(model\.night, 0, 1\)\);/,
  'the toe\'s slope returns to the constant one with the night');
assert.ok(CHANNEL_FROM > 0 && CHANNEL_FROM < CHANNEL_TO && CHANNEL_TO <= TOE_STOPS, 'the hand-over to the channels lies under the card, inside the toe');

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

// ---- 3b. the toe reads the luminance near the card, each channel deep under it: a sunlit saturated colour keeps the colour
// the constant slope gives it (read per channel, the toe lifted a sunlit grass's weak blue — three stops under the card
// while its luminance sits at it — and took its chroma: Railyard's overcast grass −23 %, ΔE 8, on the GPU)
const liftOf = (u) => { const uc = Math.min(u, 0), t = clamp(uc / TOE_STOPS + 1, 0, 1); return TOE_STOPS * (t ** 3 * (1 - 0.5 * t) - 0.5) - uc; };
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** The scene-referred contrast and toe on an exposed, saturated RGB triple (sceneLuma: its luminance before the saturation). */
const toeRGB = (rgb, sceneLuma) => {
  const uL = Math.min(Math.log2(Math.max(sceneLuma, 1e-6) / 0.18), 0), w = smooth(CHANNEL_FROM, CHANNEL_TO, -uL);
  return rgb.map((v) => { const u = Math.log2(Math.max(v, 1e-6) / 0.18); return 0.18 * 2 ** (CONTRAST * u + (CONTRAST - TOE_SLOPE) * (liftOf(uL) + (liftOf(u) - liftOf(uL)) * w)); });
};
const constantRGB = (rgb) => rgb.map((v) => constantSlope(v));
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// a grey reads the toe the same either way
for (const x of [0.005, 0.02, 0.06, 0.12, 0.18, 0.5]) {
  const [r] = toeRGB([x, x, x], x);
  assert.ok(Math.abs(r / toe(x) - 1) < 1e-9, `a grey ${x}: the luminance's toe and the channels' agree`);
}
// sunlit saturated colours at and near the card: every channel lifted alike (the constant slope's channel ratios held)
for (const rgb of [[0.10, 0.20, 0.02], [0.16, 0.19, 0.04], [0.07, 0.12, 0.03], [0.22, 0.17, 0.09]]) {
  const L = lumOf(rgb), out = toeRGB(rgb, L), old = constantRGB(rgb);
  const gains = out.map((v, i) => v / old[i]);
  assert.ok(Math.max(...gains) / Math.min(...gains) - 1 < 0.01,
    `a sunlit colour ${rgb} (${Math.log2(L / 0.18).toFixed(2)} stops): its channels lifted alike (${gains.map((g) => g.toFixed(3)).join(', ')})`);
  if (L >= 0.18) assert.ok(Math.abs(gains[0] - 1) < 1e-9, 'at and above the card: unchanged');
}
// deep shade (2.5 stops and more under the card): each channel's own toe — the weak channels lifted more than the
// strong one, the shade's chroma a camera's rather than the constant slope's saturated hole
{
  const rgb = [0.012, 0.022, 0.004], L = lumOf(rgb), out = toeRGB(rgb, L);
  out.forEach((v, i) => assert.ok(Math.abs(v / toe(rgb[i]) - 1) < 1e-9, `deep shade channel ${i}: its own toe`));
  assert.ok(out[2] / constantRGB(rgb)[2] > out[1] / constantRGB(rgb)[1], 'the weak channel lifted more');
}

// ---- 4. the facing rule: a face turned from the sun keeps the ambient the dim took
const facingGain = 1 / DIM_LUMA;
assert.ok(facingGain > 1.1 && facingGain < 1.2, `a face turned from the sun keeps its sky: ×${facingGain.toFixed(3)} on its shade`);

// ---- 5. the probe: five pairs at fixed poses (the skies lab's --poses on the PR head 24d0a3131, desktop high, 1600 × 900;
// the boxes sit on one material each — the gauntlet frame's wall box of the first estimate took in the sunlit grass blades
// in front of the wall). [scene shade, scene sun] is the light the scene held; the old chain showed under two fifths of the
// scene's share in deep shade, the fixed chain shows the share itself (0.85-1.15 of it: the composite slope about one).
// The GPU capture of the fix at the same poses and boxes measured, before → after: 6.1 → 13.9 %, 3.5 → 14.7 %,
// 3.8 → 11.2 %, 14.5 → 18.8 %, 9.1 → 11.4 %; this twin lands within a point of each.
const PAIRS = [
  // [name, scene shade, scene sun, the facing rule's gain on the shade, the share the old chain showed under, the band shown]
  // beside a hull the hull hides about a fifth of the sky (vehicleGroundOcclusion.ts) on top of the circumsolar sky the
  // cast shadow takes: about 15 % is that ground's physical share, shown as it is
  ['verdant chase: the grass beside the hull, in its cast shadow (wave 29)', 0.0283, 0.1740, 1, 0.4, [0.13, 0.17]],
  // a vertical face turned from the sun sees half the sky, its circumsolar part behind it, against a run facing the sun:
  // about three stops (12.5 %) in a photograph; the scene holds 15.7 % with the facing rule
  ['verdant wall corner: the wall\'s shaded run against its sunlit run (wave 34)', 0.0200, 0.1458, facingGain, 0.4, [0.13, 0.18]],
  // no sunlit granite in this pose (the sun stands behind the tor): against the sunlit dry grass, a brighter material
  ['coastal tor side: the tor\'s shaded faces against the sunlit dry grass (wave 36)', 0.0270, 0.2493, facingGain, 0.4, [0.10, 0.14]],
  // open shade on the ground clear of the hull: a clear day's share
  ['coastal chase: the dry grass in the tank\'s shadow', 0.0538, 0.2414, 1, 0.7, [0.17, 0.22]],
  // bright sand: its shade sits about a stop under the card, where the old chain barely crushed (the control: no overshoot)
  ['desert chase: the sand in the shadow\'s tail', 0.0605, 0.6008, 1, 1, [0.10, 0.13]],
];
const ratios = [];
for (const [name, shade, sun, gain, crushed, [lo, hi]] of PAIRS) {
  const share = (shade * gain) / sun;
  const before = display(shade, constantSlope) / display(sun, constantSlope);
  const after = display(shade * gain, toe) / display(sun, toe);
  assert.ok(before / (shade / sun) < crushed, `${name}: the old chain showed ${(before * 100).toFixed(1)} %, ${(before / (shade / sun)).toFixed(2)} of the scene's ${(shade / sun * 100).toFixed(1)} %`);
  assert.ok(after / share > 0.85 && after / share < 1.15, `${name}: the fixed chain shows ${(after * 100).toFixed(1)} %, ${(after / share).toFixed(2)} of the scene's ${(share * 100).toFixed(1)} %`);
  assert.ok(after >= lo && after <= hi, `${name}: ${(after * 100).toFixed(1)} % (${lo * 100}-${hi * 100} %)`);
  ratios.push(`${(before * 100).toFixed(1)} → ${(after * 100).toFixed(1)} %`);
}

console.log(`shadeFill.selftest: the photographic toe (slope ${CONTRAST} → ${TOE_SLOPE} over ${TOE_STOPS} stops under the card; a camera's 0.9-1.25 composite to 4 stops), nothing at or over the card moved, the lift read from the luminance near the card (a sunlit colour's channels alike) and per channel ${CHANNEL_FROM}-${CHANNEL_TO} stops under it, the facing rule ×${facingGain.toFixed(3)}; the five probe pairs ${ratios.join(', ')} PASS`);
