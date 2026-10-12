// The kill's burn (fx 8p, 2026-10-10; wave 356's critic on a plain kill: "a blotchy dissolve then paints orange patches
// over the camouflage, gun included, at 1.20 s and leaves the tank uniformly rust by 2.00 s ... a material swap, not
// fire damage"; carrying dcore's wave 350 fix: "the turret is already rust-coloured in mid-air ... ember dots that
// persist as specks"). The char waits for the fire to take hold, then spreads out of the turret ring across the hull by
// distance over seconds (a cook-off's faster than a plain kill's or a burn-out's) behind a grey soot edge; the front
// glows only near the fire in its first second; the gun's overhang chars last and least; ember cracks flare as the char
// reaches them and cool while the hull's heat cools to nothing; the finished wreck is r7's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeBurnUniforms, applyBurnHook } from './materials.ts';

const mats = readFileSync(new URL('./materials.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('./tankFactoryCore.ts', import.meta.url), 'utf8');
const grab = (name) => { const i = mats.indexOf(`const ${name} = \``); const a = mats.indexOf('`', i) + 1; return mats.slice(a, mats.indexOf('`;', a)); };
const diffuse = grab('BURN_DIFFUSE_GLSL'), emissive = grab('BURN_EMISSIVE_GLSL'), common = grab('BURN_COMMON_GLSL');

// ---- the shader's laws, pinned (the mirror below evaluates exactly these) ------------------------------------------
assert.match(common, /uniform vec3 uBurnO;\s*uniform vec4 uBurnK;/, 'the fire and the char clock are uniforms');
assert.ok(!/\$\{/.test(diffuse + emissive + common), 'the burn GLSL is plain text (the headless compile probe reads it raw)');
assert.match(diffuse, /float brnD01 = length\( vec3\( brnV\.x, brnV\.y \* \( brnV\.y > 0\.0 \? 0\.6 : 1\.4 \), brnV\.z \) \) \/ brnR;/,
  'the char spreads by distance from the fire, a little sooner upward and later down the running gear');
assert.match(diffuse, /float brnLimb = smoothstep\( 1\.0, 1\.3, length\( brnV\.xz \) \/ brnR \) \* smoothstep\( -0\.6, 0\.0, brnV\.y \);/,
  'the overhang past the hull\'s footprint at and above the deck');
assert.match(diffuse, /float brnTau = max\( uBurnT - uBurnK\.y, 0\.0 \) \/ max\( uBurnK\.z, 0\.5 \);\s*float brnThr = brnD01 \+ brnN \* 0\.25 \+ 0\.2 \+ 0\.3 \* brnLimb;\s*float brnX = 1\.7 \* sqrt\( brnTau \) - brnThr;/,
  'nothing before the fire takes hold (uBurnK.y); a coherent ragged front out of it, its reach the root of the time (the charred area grows steadily), the whole hull by uBurnK.z s, the overhang last');
assert.match(diffuse, /brnAge = \( brnTau - \( brnThr \/ 1\.7 \) \* \( brnThr \/ 1\.7 \) \) \* uBurnK\.z;/, 'an ember\'s clock: since the front passed it');
assert.match(diffuse, /float brnSoot = smoothstep\( 0\.0, 0\.24, brnX \+ 0\.2 \);/, 'a soot edge leads the char');
assert.match(diffuse, /float brnCap = \( 1\.0 - 0\.46 \* brnKeep \) \* \( 1\.0 - 0\.5 \* brnLimb \);\s*brnM \*= brnCap;\s*brnSoot \*= brnCap;/,
  'r7\'s survivor panels; the overhang keeps half its paint');
assert.match(diffuse, /diffuseColor\.rgb = mix\( diffuseColor\.rgb, vec3\( brnLum \) \* 0\.62, max\( brnM, brnSoot \) \* 0\.55 \);\s*diffuseColor\.rgb \*= 1\.0 - 0\.35 \* max\( brnSoot - brnM, 0\.0 \);\s*diffuseColor\.rgb = mix\( diffuseColor\.rgb, brnChar, brnM \);/,
  'the soot greys and darkens the paint ahead of the char, then the char');
assert.match(diffuse, /brnNear = 1\.0 - smoothstep\( 0\.8, 2\.6, length\( brnV \) \);/, 'the fire\'s neighbourhood');
assert.match(emissive, /float brnT0 = uBurnK\.y \+ 0\.0138 \* uBurnK\.z;\s*float brnFire = smoothstep\( brnT0 - 0\.25, brnT0, uBurnT \) \* exp\( -max\( uBurnT - brnT0, 0\.0 \) \);\s*totalEmissiveRadiance \+= vec3\( 1\.35, 0\.38, 0\.065 \) \* brnBand \* brnNear \* brnFire \* 1\.2/,
  'the front glows only near the fire, in the first second of its char');
assert.ok(Math.abs((0.2 / 1.7) ** 2 - 0.0138) < 5e-4, 'brnT0: the front reaches the threshold 0.2 at 0.0138 of the spread');
assert.ok(!/brnBand \* uBurnGlow/.test(emissive), 'no orange line swept across the paint (r6\'s edge glow)');
assert.match(emissive, /float brnPkGlow = brnAge > 0\.0 \? smoothstep\( 0\.0, 0\.25, brnAge \) \* exp\( -brnAge \/ 2\.2 \) : 0\.0;/,
  'an ember crack flares as the char reaches it and cools');
assert.match(emissive, /\* brnPkLive \* \( 1\.0 - brnKeep \) \* \( 0\.35 \+ 1\.6 \* brnPkGlow \);/, 'over a dull seam glow, all of it the hull\'s heat');
// the drivers (tankFactoryCore.ts): the fire at the turret ring, the clock by the kill, the heat with no floor
assert.match(core, /const BURN_CHAR_DELAY_S = ([\d.]+), BURN_SPREAD_COOKOFF_S = ([\d.]+), BURN_SPREAD_PLAIN_S = ([\d.]+);/, 'the char clock');
const [, D, SC, SP] = /const BURN_CHAR_DELAY_S = ([\d.]+), BURN_SPREAD_COOKOFF_S = ([\d.]+), BURN_SPREAD_PLAIN_S = ([\d.]+);/.exec(core).map(Number);
assert.ok(D >= 0.3 && D <= 0.6, `the char waits only for the fire to take hold (${D} s; wave 405: "char comes late")`);
assert.ok(Math.abs(D + SC - 6) <= 0.6 && Math.abs(D + SP - 9) <= 0.8, `~6 s a cook-off, ~9 s a plain kill or a burn-out (${D + SC}, ${D + SP})`);
assert.match(core, /turretG\.getWorldPosition\(burnU\.uBurnO\.value\);\s*burnU\.uBurnK\.value\.set\(burnReachM \* Math\.abs\(root\.scale\.x \|\| 1\), BURN_CHAR_DELAY_S, BURN_SPREAD_PLAIN_S, 0\);/,
  'the fire is the turret ring at the kill');
assert.match(core, /function launchDestroyedTurret\(pop: boolean, ageS: number\): void \{\s*popScale = pop \? 1 : 0\.22;[^}]*burnU\.uBurnK\.value\.z = pop \? BURN_SPREAD_COOKOFF_S : BURN_SPREAD_PLAIN_S;/,
  'a cook-off spreads faster');
assert.match(core, /startWreckPresentation\(ageS0\);\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*launchDestroyedTurret\(!!\(opts && opts\.pop\), ageS0\);/,
  'the kill sets the burn, then says whether it was a cook-off');
assert.match(core, /function emberHeat\(ageS: number\): number \{\s*const t = ageS - BURN_CHAR_DELAY_S;\s*if \(!\(t > 0\)\) return 0;\s*return 0\.95 \* Math\.min\(1, t \/ 0\.8\) \* Math\.exp\(-t \/ 7\);/,
  'no heat before the fire takes hold, none left on a cold wreck');
assert.ok(!/uBurnEmber\.value = 0\.10 \+/.test(core), 'no ember floor: a cold wreck has no glowing specks');
assert.match(core, /burnU\.uBurnEmber\.value = emberHeat\(wreckAge\) \*/, 'the live wreck\'s heat is emberHeat\'s');

// ---- the uniforms and the hook ---------------------------------------------------------------------------------------
{
  const a = makeBurnUniforms(7), b = makeBurnUniforms(31);
  assert.ok(a.uBurnO.value.isVector3 && a.uBurnK.value.isVector4, 'the fire is a point, the clock four numbers');
  a.uBurnO.value.set(1, 2, 3); a.uBurnK.value.set(4, 1, 5, 0);
  assert.deepEqual(b.uBurnO.value.toArray(), [0, 0, 0], 'one visual\'s fire never moves another\'s');
  assert.deepEqual(b.uBurnK.value.toArray(), [5, 1, 8, 0], 'a plain kill\'s clock by default');
  const mat = new THREE.MeshStandardMaterial();
  assert.equal(applyBurnHook(mat, a), true);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>' };
  mat.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.uBurnO, a.uBurnO, 'the hook carries the visual\'s own fire');
  assert.equal(shader.uniforms.uBurnK, a.uBurnK);
  assert.ok(shader.fragmentShader.includes('brnSoot') && shader.fragmentShader.includes('brnPkGlow'), 'the patched program carries the 8p burn');
  mat.dispose();
}

// ---- the mirror: what a hull does over its burn ----------------------------------------------------------------------
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** One point's burn at kill age `t`: (dx, dy, dz) from the fire, noise n, survivor-panel noise keep, reach R, clock. */
function burnAt(t, { dx = 0, dy = 0, dz = 0, n = 0.5, keep = 0, R = 4.8, d = D, spread = SP }) {
  const r = Math.max(R, 0.5);
  const d01 = Math.hypot(dx, dy * (dy > 0 ? 0.6 : 1.4), dz) / r;
  const limb = sm(1.0, 1.3, Math.hypot(dx, dz) / r) * sm(-0.6, 0, dy);
  const tau = Math.max(t - d, 0) / Math.max(spread, 0.5);
  const thr = d01 + n * 0.25 + 0.2 + 0.3 * limb;
  const x = 1.7 * Math.sqrt(tau) - thr;
  const cap = (1 - 0.46 * keep) * (1 - 0.5 * limb);
  const m = sm(0, 0.24, x) * cap, soot = sm(0, 0.24, x + 0.2) * cap;
  const near = 1 - sm(0.8, 2.6, Math.hypot(dx, dy, dz));
  const t0 = d + 0.0138 * spread;
  const fire = sm(t0 - 0.25, t0, t) * Math.exp(-Math.max(t - t0, 0));
  const age = (tau - (thr / 1.7) ** 2) * spread, pk = age > 0 ? sm(0, 0.25, age) * Math.exp(-age / 2.2) : 0;
  return { m, soot, near, fire, age, pk, limb };
}
const firstChar = (pt, spread, level = 0.5) => { for (let t = 0; t < 30; t += 0.01) if (burnAt(t, { ...pt, spread }).m >= level * (1 - 0.46 * (pt.keep ?? 0))) return t; return Infinity; };
{
  // an M1A2-sized hull: reach ~4.8 m from the ring; its far deck corner, its bottom corner and its overhanging gun
  const ring = { dx: 0.4, dy: 0.1, dz: 0.3 }, deckCorner = { dx: 1.8, dy: -0.15, dz: -4.4 },
    trackEnd = { dx: 1.8, dy: -1.5, dz: -4.4 }, muzzle = { dx: 0, dy: 0.5, dz: 6.2 };
  for (const pt of [ring, deckCorner, trackEnd, muzzle]) assert.equal(burnAt(D - 0.01, pt).m, 0, 'nothing chars before the fire takes hold');
  for (const pt of [ring, deckCorner, trackEnd, muzzle]) assert.equal(burnAt(0.5, pt).soot, 0, 'nor soots: the kill reads in the vehicle\'s own paint');
  const tRing = firstChar(ring, SP), tCorner = firstChar(deckCorner, SP), tTrack = firstChar(trackEnd, SP), tMuzzle = firstChar(muzzle, SP);
  assert.ok(tRing < D + 1.2, `the char starts at the fire within about a second of the kill (${tRing.toFixed(2)} s)`);
  assert.ok(tRing < tCorner && tCorner < tTrack, `and spreads out across the hull and down it (${tRing.toFixed(2)} < ${tCorner.toFixed(2)} < ${tTrack.toFixed(2)} s)`);
  assert.ok(tMuzzle > tCorner, `the gun's overhang chars last (${tMuzzle.toFixed(2)} s vs the far corner's ${tCorner.toFixed(2)} s)`);
  assert.ok(tCorner > 3.5, `a plain kill's char takes seconds to cross the hull (the far corner at ${tCorner.toFixed(2)} s; r7: ~1.5 s)`);
  // (wave 405: "all at once") the charred share of the hull grows steadily: no second of the spread chars more than a
  // third of the hull
  {
    const pts = [];
    for (let i = 0; i < 400; i++) {
      const a = (i * 2.399963) % (2 * Math.PI), r = Math.sqrt((i + 0.5) / 400) * 4.6;
      pts.push({ dx: Math.cos(a) * r, dy: ((i * 7) % 11) / 11 * 1.6 - 1.2, dz: Math.sin(a) * r, n: ((i * 13) % 17) / 17 });
    }
    const share = (t) => pts.filter((pt) => burnAt(t, pt).m >= 0.5).length / pts.length;
    let worst = 0;
    for (let t = D; t < D + SP; t += 0.25) worst = Math.max(worst, share(t + 1) - share(t));
    assert.ok(worst <= 0.34, `the char spreads steadily (at most ${(worst * 100).toFixed(0)} % of the hull in any second)`);
    assert.ok(share(D + 1.5) >= 0.03, `and has begun by ${(D + 1.5).toFixed(1)} s (${(share(D + 1.5) * 100).toFixed(0)} %)`);
  }
  const done = (spread) => Math.max(...[ring, deckCorner, trackEnd].flatMap((pt) => [0, 1].map((n) => firstChar({ ...pt, n }, spread, 0.98))));
  assert.ok(done(SC) <= 6.6 && done(SP) <= 9.8 && done(SC) < done(SP), `the hull is charred by ~6 s on a cook-off, ~9 s on a plain kill (${done(SC).toFixed(1)}, ${done(SP).toFixed(1)} s)`);
  assert.ok(burnAt(60, muzzle).m <= 0.6 * burnAt(60, deckCorner).m, 'and the overhang chars least');
  // the soot edge leads: somewhere the paint is sooted before it is charred
  const lead = [];
  for (let t = D; t < D + SP; t += 0.1) { const b = burnAt(t, deckCorner); if (b.soot > 0.5 && b.m < 0.1) lead.push(t); }
  assert.ok(lead.length >= 3, `a grey soot edge leads the char (${(lead.length / 10).toFixed(1)} s of soot before char at the far corner)`);
  // orange only near the fire, in its first second
  for (let t = 0; t < 12; t += 0.05) {
    for (const pt of [deckCorner, trackEnd, muzzle]) assert.equal(burnAt(t, pt).near, 0, 'no glowing front away from the fire');
  }
  {
    const t0 = D + 0.0138 * SP;
    assert.ok(burnAt(t0 - 0.3, ring).fire === 0 && burnAt(t0 + 0.1, ring).fire > 0.8 && burnAt(t0 + 2, ring).fire < 0.15,
      'the fire\'s glow is the first second of its char');
  }
  // embers: each crack flares as the char reaches it and cools
  const flare = (pt, dt) => burnAt(firstChar(pt, SP, 0.02) + dt, pt).pk;
  assert.equal(burnAt(D, deckCorner).pk, 0, 'no ember before the char reaches it');
  assert.ok(Math.max(flare(deckCorner, 0.4), flare(deckCorner, 0.6)) > 0.6, 'it flares as the char comes');
  assert.ok(flare(deckCorner, 6) < 0.1, 'and cools');
  // the finished wreck is r7's: the soot and the char agree, the soot's darkening is gone
  for (const pt of [ring, deckCorner, trackEnd, { ...deckCorner, keep: 1 }]) {
    const b = burnAt(30, pt);
    assert.ok(Math.abs(b.soot - b.m) < 1e-9 && Math.abs(b.m - (1 - 0.46 * (pt.keep ?? 0))) < 1e-9, 'the finished hull is r7\'s char');
  }
  // the heat (tankFactoryCore emberHeat): none before the fire, none left on a cold wreck
  const heat = (a) => { const t = a - D; return t > 0 ? 0.95 * Math.min(1, t / 0.8) * Math.exp(-t / 7) : 0; };
  assert.ok(heat(D) === 0 && heat(D + 1) > 0.8 && heat(60) < 0.001, 'the hull\'s heat rises with the fire and cools to nothing');
}
console.log(`wreckBurn selftest: the char waits ${D} s for the fire, spreads out of the turret ring across the hull behind a soot edge (~${(D + SC).toFixed(1)} s a cook-off, ~${(D + SP).toFixed(1)} s a plain kill), glows only near the fire, the overhang last and least, embers flare and cool, the finished wreck r7's — ok`);
