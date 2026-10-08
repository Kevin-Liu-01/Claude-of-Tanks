import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise } from './proceduralTexture.ts';
import { SNOW_ROCK_HOLD_LINE, mulberry32 } from './terrain.ts';
import { groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// Skies lane (2026-10-06, the gauntlet's waves 127 and 128: Glacier's and Frosthollow's ring faces "a featureless,
// vertically smeared grey sheet", "draped cloth"): the snow faces. Every change sits behind uReduxD.y > 1.5, so this pins:
// (1) that guard selects exactly the snow maps — every registered map's packed climate class enumerated: the snow set at
// 2, every other map at 0 or 1, an unknown id and the `?ground=legacy` A/B (all redux terms zeroed) at 0; (2) the shader's
// structure — the basis guard once, right above the two stretch lines kept verbatim; the snow branch's couloirs and ledges
// around the ground lane's hold line (once, verbatim); the farRock guard once, right after round 35's ledge amplitude; (3)
// the shear the basis guard removes, measured on a CPU twin of the wall basis over the material's own noise fields: the
// stretch form's |dv/dx| grows with the height, the snow form's stays small at every height. No GPU or art claim.

// 1. The guard's map set.
const SNOW = ['alpine', 'whiteout', 'winter'];
const classOf = (id) => groundReduxUniformValues(resolveGroundReduxProfile(id)).reduxD[1];
const selected = MAP_IDS.filter((id) => classOf(id) > 1.5).sort();
assert.deepEqual(selected, SNOW, 'uReduxD.y > 1.5 selects exactly the snow maps');
for (const id of MAP_IDS) {
  const y = classOf(id);
  if (SNOW.includes(id)) assert.equal(y, 2, `${id}: the snow class`);
  else assert.ok(y === 0 || y === 1, `${id}: climate class ${y} stays under the guard (0 vegetated, 1 arid)`);
}
assert.equal(classOf('no-such-map'), 0, 'an unknown id runs the vegetated class');
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.ok(/redux\.reduxD\.fill\(0\);/.test(source), 'the legacy A/B zeroes the class with the other redux terms');

// 2. The shader's structure (SPLAT_COMMON_FRAG).
const common = source.slice(source.indexOf('const SPLAT_COMMON_FRAG'), source.indexOf('const SPLAT_NORMAL_FRAG'));
assert.ok(common.length > 10000, 'the shared fragment found');
const count = (text, needle) => text.split(needle).length - 1;
const BASIS_GUARD = 'if (uReduxD.y > 1.5) { wallVScale = 1.0; bedSwell = 1.0; }';
assert.equal(count(common, BASIS_GUARD), 1, 'the basis guard once');
// (written against either basis form — the multiplicative stretch or the ground lane's bounded band, both of which read
// wallVScale * bedSwell: the guard sits after the swell's declaration and before the wall's v is first written, so every
// form evaluates with the stretch at 1 on a snow map and untouched elsewhere)
const guardAt = common.indexOf(BASIS_GUARD);
const swellAt = common.indexOf('float bedSwell = ');
const firstV = common.indexOf('gWallUVx.y = ', swellAt);
assert.ok(swellAt > 0 && swellAt < guardAt, "the guard follows the swell's declaration");
assert.ok(firstV > guardAt, "and precedes the wall's v");
assert.ok(common.slice(guardAt, common.indexOf('gCliffJ = cliffJ;', guardAt)).includes('wallVScale * bedSwell'), 'the basis reads the stretch the guard sets');
assert.equal(count(common, SNOW_ROCK_HOLD_LINE), 1, "the ground lane's hold line once, verbatim (snowRockHoldLine swaps it per map)");
const snowAt = common.indexOf('if (uReduxD.y > 1.5) {\n    float rockW = max(fR, steepW) * (1.0 - fMs);');
assert.ok(snowAt > 0, 'the snow-on-rock branch');
const snowBranch = common.slice(snowAt, common.indexOf('gSnowRock = hold * rockW;', snowAt));
const holdAt = snowBranch.indexOf(SNOW_ROCK_HOLD_LINE);
assert.ok(holdAt > 0, 'the hold line inside the snow branch');
for (const term of ['float coulN = ', 'float couloir = ', 'float gully = ']) assert.ok(snowBranch.indexOf(term) > 0 && snowBranch.indexOf(term) < holdAt, `${term.trim()} shapes the gullies above the hold line`);
for (const term of ['float ledge = bedSignal(wp.y + ledgeWarp * 2.2, ', 'float ledgeHold = ', 'hold = max(hold, ledgeHold * ']) assert.ok(snowBranch.indexOf(term) > holdAt, `${term.trim()} after the hold line`);
const FAR_GUARD = 'if (uReduxD.y > 1.5) ledgeAmp = wallFar;';
const LEDGE_AMP = 'float ledgeAmp = mix(0.5, 1.0, smoothstep(0.02, 0.12, uStrata)) * wallFar;';
assert.equal(count(common, FAR_GUARD), 1, 'the farRock guard once');
assert.equal(count(common, LEDGE_AMP), 1, "round 35's ledge amplitude verbatim, once");
assert.ok(common.indexOf(FAR_GUARD) > common.indexOf(LEDGE_AMP), 'the farRock guard follows the amplitude it overrides');

// 3. The shear, on a CPU twin of the wall basis (terrain.ts splatCompute) over the uNoise fields (makeShaderNoiseTexture's
// seed and formulas; level-0 bilinear reads, the near field's case).
const S = 256, noi = new SimplexNoise({ random: mulberry32(3011) });
const R = new Float32Array(S * S), G = new Float32Array(S * S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const u = x / S, v = y / S;
  R[y * S + x] = (tileableTorusNoise(noi, u, v, 4, 4, 3) * 0.6 + tileableTorusNoise(noi, u, v, 9, 9, 27) * 0.4) * 0.5 + 0.5;
  G[y * S + x] = (tileableTorusNoise(noi, u, v, 2, 2, 55) * 0.7 + tileableTorusNoise(noi, u, v, 5, 5, 91) * 0.3) * 0.5 + 0.5;
}
const tex = (g, u, v) => {
  const fx0 = u * S - 0.5, fy0 = v * S - 0.5, x0 = Math.floor(fx0), y0 = Math.floor(fy0), fx = fx0 - x0, fy = fy0 - y0;
  const a = x0 & (S - 1), b = y0 & (S - 1), a1 = (a + 1) & (S - 1), b1 = (b + 1) & (S - 1);
  return g[b * S + a] * (1 - fx) * (1 - fy) + g[b * S + a1] * fx * (1 - fy) + g[b1 * S + a] * (1 - fx) * fy + g[b1 * S + a1] * fx * fy;
};
const nz = (g, x, z, s, ox, oz) => tex(g, x * s + ox, z * s + oz);
const wallV = (x, y, z, stretch) => {
  const cliffJ = nz(G, x, z, 0.0013, 0.57, 0.23), cliffJ2 = nz(R, x, z, 0.0047, 0.91, 0.13);
  const wallVOff = cliffJ * 9.7 + cliffJ2 * 2.3;
  const bedWob = (nz(G, x, z, 0.0208, 0.37, 0.83) - 0.5) * 3.2 + (nz(R, x, z, 0.0588, 0.71, 0.19) - 0.5) * 1.1;
  const scale = stretch ? (0.87 + cliffJ * 0.26) * (1.0 + 0.36 * (nz(R, x, z, 0.011, 0.17, 0.53) - 0.5)) : 1.0;
  return -y * scale + wallVOff + bedWob;
};
const rng = mulberry32(6100);
const pct = (a, q) => { const s = [...a].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const shear = {};
for (const h of [50, 150, 250]) {
  const st = [], sn = [];
  for (let i = 0; i < 1200; i++) {
    const x = (rng() - 0.5) * 3000, z = (rng() - 0.5) * 3000, d = 0.25; // a wall facing ±z: along it is x
    st.push(Math.abs(wallV(x + d, h, z, true) - wallV(x - d, h, z, true)) / (2 * d));
    sn.push(Math.abs(wallV(x + d, h, z, false) - wallV(x - d, h, z, false)) / (2 * d));
  }
  shear[h] = { stretch: pct(st, 0.5), snow: pct(sn, 0.5), snowP90: pct(sn, 0.9) };
}
assert.ok(shear[50].stretch < shear[150].stretch && shear[150].stretch < shear[250].stretch, 'the stretch form shears more with height');
assert.ok(shear[250].stretch > 5, `the stretch form at 250 m: a median ${shear[250].stretch.toFixed(1)} m of v per metre along the wall`);
for (const h of [50, 150, 250]) assert.ok(shear[h].snowP90 < 2, `the snow form at ${h} m: p90 ${shear[h].snowP90.toFixed(2)} (the offset and the wander only)`);
assert.ok(Math.abs(shear[250].snow - shear[50].snow) < 0.05, 'and the snow form does not grow with height');

console.log(`snowFaces.selftest: uReduxD.y > 1.5 selects exactly ${SNOW.join('/')} of ${MAP_IDS.length} maps (the rest 0 or 1); the basis guard between the swell and the wall's v, the couloirs and ledges around the hold line, the farRock guard; the stretch form's shear (median ${[50, 150, 250].map((h) => shear[h].stretch.toFixed(1)).join(' / ')} at 50 / 150 / 250 m) against the snow form's (${[50, 150, 250].map((h) => shear[h].snow.toFixed(2)).join(' / ')}) PASS; no GPU/art claim`);
