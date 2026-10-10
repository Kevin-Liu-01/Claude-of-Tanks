import { shapeFarTreeBase } from './farTreeBase.ts';
import { keepStreams } from './geometryStreams.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript-compiler-api';
import { TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, TREE_SPECIES } from './treeSpecies.ts';
import { bendMangroveRoot, shapeMangroveFarStem } from './tidalMangrove.ts';
import { treeBiomeColour, treeBiomePalette, treeBiomeSlot, treeBiomeWoodSpread } from './treeBiomes.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { HORIZON_FOREST_IMPOSTOR_SKY_FILL, HORIZON_FOREST_IMPOSTOR_THIN, HORIZON_FOREST_IMPOSTOR_WRAP } from './horizonForestImpostors.ts';
import * as growth from './treeGrowth.ts';
import { makeSprayAtlas, SPRAY_ATLAS_COVERAGE, SPRAY_ATLAS_TILES } from './treeSprayAtlas.ts';

// 2026-10-01 (frozen pins retired): the receipt used to compare every map's near/far/bush library with a "historical"
// build (the 0823acd74 jitter and merge swapped into the live builders) and pin both literals by sha256, so any change
// to near-tree jitter failed here. The original per-vertex jitter is kept only as the known TEARING negative control.
// The live contracts: far shells stay joined under the shell jitter at every amount, the jitter is bounded,
// deterministic and in place, final transforms overwrite intermediate normals, and the near-palm/index/attribute
// mutations are rejected.
const originalJitter = `function jitterRadial(
  geo: THREE.BufferGeometry,
  rng: RandomSource,
  amount: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}`;
const text = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = source.statements.filter(ts.isFunctionDeclaration);
const farNames = ['buildOakFarGeometry', 'buildPineFarGeometry', 'buildPalmFarGeometry', 'buildBirchFarGeometry'];
const callOwners = [];
for (const fn of functions) {
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'jitterFarShell') callOwners.push(fn.name.text);
    node.forEachChild(visit);
  }
  visit(fn);
}
assert.deepEqual(callOwners, ['buildPalmGeometry', farNames[0], farNames[1], farNames[1], farNames[2], farNames[2], farNames[3]],
  'six far shells and the near palm crown use joined corners');
for (const name of ['canopyJitterNoise', 'canopyCornerKey', 'jitterFarShell']) {
  const fn = functions.find(node => node.name.text === name);
  assert.ok(fn);
  function visit(node) {
    assert.ok(!ts.isNewExpression(node) && !ts.isArrayLiteralExpression(node)
      && !ts.isObjectLiteralExpression(node) && !ts.isArrowFunction(node), `${name}: no per-shell scratch allocation`);
    node.forEachChild(visit);
  }
  visit(fn.body);
}

function compile(input = text, mode = 'current') {
  const src = ts.createSourceFile('fixture.ts', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fns = src.statements.filter(ts.isFunctionDeclaration);
  const first = fns.findIndex(n => n.name.text === 'paintFlat'), last = fns.findIndex(n => n.name.text === 'buildBushCards');
  assert.ok(first >= 0 && last > first);
  const get = name => fns.find(n => n.name.text === name).getText(src).replace(/^export /, '');
  const variable = name => {
    let value;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(src) === name) {
        assert.equal(value, undefined); value = node.initializer.getText(src);
      }
      node.forEachChild(visit);
    }
    visit(src); assert.ok(value, name); return value;
  };
  const oldJitterFixture = fns.some(n => n.name.text === 'jitterRadial') ? '' : originalJitter;
  const code = fns.slice(first, last + 1).map(node => {
    const name = node.name.text;
    if (mode === 'tearing' && name === 'jitterRadial') return originalJitter;
    if (mode === 'tearing' && name === 'jitterFarShell') return originalJitter.replace('jitterRadial', 'jitterFarShell');
    let code = node.getText(src).replace(/^export /, '');
    if (mode === 'near-palm' && name === 'buildPalmGeometry') {
      assert.ok(code.includes('jitterFarShell(core, rng, 0.25)'));
      code = code.replace('jitterFarShell(core, rng, 0.25)', 'jitterRadial(core, rng, 0.25)');
    }
    if (mode === 'indexed' && name === 'mergeParts') return 'function mergeParts(parts) { return mergeGeometries(parts, false); }';
    if (mode === 'poisoned' && name === 'jitterFarShell') code = code.replace('  return geo;', "  geo.getAttribute('normal').array.fill(NaN);\n  return geo;");
    return code;
  }).join('\n');
  const start = input.indexOf('  const OAK_SHAPES:'), end = input.indexOf('  const foliageTex =', start);
  assert.ok(start > 0 && end > start);
  return runInNewContext(stripTypeScriptTypes(`${get('attribute')}\n${get('clamp')}\n${get('mulberry32').replace('function mulberry32(', 'function randomCore(')}
    const streams = [];
    function mulberry32(seed) {
      const next = randomCore(seed), entry = {seed, calls: 0, next}; streams.push(entry);
      return () => { entry.calls++; return next(); };
    }
    function rngReceipt() {
      const receipt = streams.map(({seed, calls, next}) => ({seed, calls, tail: [next(), next(), next(), next()]}));
      streams.length = 0; return receipt;
    }
    const BIRCH_VAR = ${variable('BIRCH_VAR')};\n// trees round 4: the fine wood's girth (buildGrownTree's aWoodFine tag)\nconst GROWTH_WOOD_FINE_R = ${variable('GROWTH_WOOD_FINE_R')};\nconst GROWTH_WOOD_MID_R = ${variable('GROWTH_WOOD_MID_R')};\n// trees round 5: the forest-grown near variants (a closed wood's species)\nconst FOREST_NEAR_VARIANTS = ${variable('FOREST_NEAR_VARIANTS')};\n${get('makeBirchFoliageTexture')}\n${oldJitterFixture}\n${code}
    function library(seed, input) {
      const cfg = { vegetation: input }, veg = ${variable('veg')};
      ${input.slice(start, end)}
      return { SPECIES, palOf, speciesList, bushSpecies }; }
    ({library, mulberry32, randomCore, rngReceipt, buildBushCards, buildBroadleafCards, buildPalmGeometry, sphereNormals,
      jitterShell: typeof jitterFarShell === 'function' ? jitterFarShell : jitterRadial,
      ${farNames.join(',')}});`), {
    THREE, mergeGeometries, Float32Array, TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, bendMangroveRoot, shapeMangroveFarStem, shapeFarTreeBase,
    // p2 trees lane (2026-10-01): the desktop registry grows its near trees (treeGrowth.ts) and paints spray atlases;
    // both compiles take the same grown builders, so the near comparison stays exact on the desktop path
    vegetationGrowsTrees: () => true, texSize: (px) => px, makeSprayAtlas, SPRAY_ATLAS_TILES, SPRAY_ATLAS_COVERAGE,
    growTreeSkeleton: growth.growTreeSkeleton, emitBranchGeometry: growth.emitBranchGeometry, emitLeafCards: growth.emitLeafCards,
    emitCrownShadowHull: growth.emitCrownShadowHull, GROWTH_TUBE_SIDES: growth.GROWTH_TUBE_SIDES, TREE_GROWTH_PROFILES: growth.TREE_GROWTH_PROFILES,
    weldGrownGeometry: growth.weldGrownGeometry, canopySkyOcclusion: growth.canopySkyOcclusion, GROWTH_CANOPY_AO: growth.GROWTH_CANOPY_AO,
    // a palm's cards are built fresh without the billboard frame's two streams (geometryStreams.ts, 2026-10-07)
    keepStreams,
    growthCrownAttachments: growth.growthCrownAttachments, growthCardRows: growth.growthCardRows,
    GROWTH_CROWN_STEM_WIDTH: growth.GROWTH_CROWN_STEM_WIDTH,
    // trees round 2 (2026-10-03): the crowns' lobes and hull normal (the shrubs' shade, the snow load) and the map's biome
    crownLobes: growth.crownLobes, crownSurfaceNormal: growth.crownSurfaceNormal, treeBiomeSlot, treeBiomePalette, treeBiomeColour,
    // trees round 5: a closed wood's species grow forest-grown near variants (the wood spread opens the rule)
    treeBiomeWoodSpread,
    GROWTH_CROWN_SHADING: growth.GROWTH_CROWN_SHADING,
    // trees round 4: a birch's dark collar (its stem's foot)
    GROWTH_BIRCH_FOOT: growth.GROWTH_BIRCH_FOOT,
    _c: new THREE.Color(), _v3: new THREE.Vector3(), _e: new THREE.Euler(),
    _qq: new THREE.Quaternion(), _m: new THREE.Matrix4(), _scale: new THREE.Vector3(1, 1, 1),
  });
}
const current = compile(), tearing = compile(text, 'tearing');
const poisoned = compile(text, 'poisoned');
function random(seed) {
  const next = current.randomCore(seed); let calls = 0;
  return { rng: () => { calls++; return next(); }, receipt: () => ({ calls, tail: [next(), next(), next(), next()] }) };
}
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function budget(g) {
  return { attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => [name,
    [a.count, a.itemSize, a.normalized, a.array.constructor.name, a.array.byteLength]])),
  index: g.index ? [g.index.count, g.index.array.constructor.name, g.index.array.byteLength] : null };
}
function exact(a, b, label) {
  assert.deepEqual(budget(a), budget(b), label + ': exact storage and draw API');
  for (const name of Object.keys(a.attributes)) assert.ok(bytes(a.attributes[name].array).equals(bytes(b.attributes[name].array)), label + '/' + name + ': exact bytes');
  assert.deepEqual(a.index?.array, b.index?.array); assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.drawRange, b.drawRange);
  assert.deepEqual(JSON.parse(JSON.stringify(a.userData)), JSON.parse(JSON.stringify(b.userData)));
  a.computeBoundingBox(); b.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingSphere();
  assert.deepEqual(a.boundingBox, b.boundingBox); assert.deepEqual(a.boundingSphere, b.boundingSphere);
}
function cornerGroups(p) {
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i);
  }
  return [...groups.values()].filter(g => g.length > 1);
}
function gap(p, groups) {
  let max = 0;
  for (const ids of groups) for (const a of ids) for (const b of ids) max = Math.max(max,
    Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b)));
  return max;
}
const joined = (g, corners) => assert.ok(gap(g.attributes.position, corners) < 1e-6, 'shared shell corners stay joined');
const factories = [() => new THREE.IcosahedronGeometry(.25, 0), () => new THREE.IcosahedronGeometry(1.5, 0),
  () => new THREE.IcosahedronGeometry(1.5, 1), () => new THREE.ConeGeometry(1.5, 3, 7, 1, true),
  () => new THREE.ConeGeometry(.8, 1.6, 9, 2, false)];
let primitives = 0;
for (const make of factories) for (const seed of [0, 1, 1337, 2049, 0xffffffff]) for (const amount of [0, .25, .28, .30, .34, .36, .40, .45, .46]) {
  const g = make(), before = g.clone(), repeat = g.clone(), corners = cornerGroups(g.attributes.position);
  const a = random(seed), b = random(seed), refs = Object.values(g.attributes).map(x => x.array);
  current.jitterShell(g, a.rng, amount); current.jitterShell(repeat, b.rng, amount);
  const receipt = a.receipt(); assert.deepEqual(receipt, b.receipt(), 'a repeat jitter draws the same seeded stream');
  assert.deepEqual(budget(g), budget(before));
  assert.deepEqual(g.index?.array, before.index?.array); joined(g, corners);
  if (amount === 0) assert.deepEqual(g.attributes.position.array, before.attributes.position.array);
  assert.deepEqual(g.attributes.position.array, repeat.attributes.position.array);
  Object.values(g.attributes).forEach((x, i) => assert.equal(x.array, refs[i]));
  const p = g.attributes.position, q = before.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const radius = Math.hypot(q.getX(i), q.getZ(i)), next = Math.hypot(p.getX(i), p.getZ(i));
    assert.ok(Number.isFinite(next) && Number.isFinite(p.getY(i)));
    if (radius <= 1e-4) assert.deepEqual([p.getX(i), p.getY(i), p.getZ(i)], [q.getX(i), q.getY(i), q.getZ(i)]);
    else { assert.ok(Math.abs(next / radius - 1) <= amount + 2e-7); assert.ok(Math.abs(p.getY(i) - q.getY(i)) <= amount * .4 + 3e-7); }
  }
  for (const geometry of [g, before, repeat]) geometry.dispose(); primitives++;
}
const tornGaps = [];
for (const make of [factories[1], factories[3]]) {
  const g = make(), corners = cornerGroups(g.attributes.position); tearing.jitterShell(g, tearing.randomCore(1337), .36);
  tornGaps.push(gap(g.attributes.position, corners)); assert.throws(() => joined(g, corners), /shared shell corners/); g.dispose();
}
assert.ok(tornGaps[0] > .7 && tornGaps[1] > .15, 'the per-vertex tearing jitter is rejected by the joined-corner gate');

let near = 0, far = 0, bushes = 0;
const finite = (g, label) => { for (const [name, attr] of Object.entries(g.attributes)) assert.ok(attr.array.every(Number.isFinite), `${label}/${name}: finite`); };
function checkLibrary(seed, veg, label) {
  const a = current.library(seed, veg), p = poisoned.library(seed, veg);
  for (const species of a.speciesList) {
    for (let k = 0; k < 3; k++) {
      const actual = a.SPECIES[species].near(k, a.palOf(species));
      current.rngReceipt();
      for (const key of Object.keys(actual)) { finite(actual[key], `${label}/${species}/${k}/near/${key}`); actual[key].dispose(); }
      near++;
    }
    for (let k = 0; k < 2; k++) {
      const r = random(seed + a.SPECIES[species].farSeed + k * 101), t = random(seed + a.SPECIES[species].farSeed + k * 101);
      const actual = a.SPECIES[species].far(r.rng, a.palOf(species), k), poisonedNormals = p.SPECIES[species].far(t.rng, p.palOf(species), k);
      assert.deepEqual(r.receipt(), t.receipt(), label + '/far constructor RNG');
      for (const key of Object.keys(actual)) {
        const part = actual[key], partLabel = `${label}/${species}/${k}/far/${key}`;
        finite(part, partLabel);
        if (key !== 'trunk') {
          const n = part.attributes.normal;
          for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-6, partLabel + ': unit normals');
        }
        exact(part, poisonedNormals[key], partLabel + ': all final transforms overwrite intermediate normals');
        part.dispose(); poisonedNormals[key].dispose();
      }
      far++;
    }
  }
  const r = random(seed + 491);
  const bush = current.buildBushCards(r.rng, a.palOf(a.bushSpecies));
  finite(bush, label + '/bush'); bush.dispose(); bushes++;
}
for (const id of MAP_IDS) checkLibrary(1337, getMapConfig(id).vegetation, id);
for (const seed of [0, 1337, 7719]) for (const snow of [0, .65]) checkLibrary(seed, {
  species: TREE_SPECIES, bushSpecies: 'oak', palettes: { pine: { snow, cardHue: .23 }, birch: { snow, cardHue: .57 },
    oak: { cardHue: .2 }, palm: { frond: { hue: .18, sat: .2, l: .4 } } },
}, `all-species/${seed}/${snow}`);

const badNear = compile(text, 'near-palm'), badIndex = compile(text, 'indexed');
const a = current.buildPalmGeometry(current.mulberry32(1337)), b = badNear.buildPalmGeometry(badNear.mulberry32(1337));
assert.throws(() => exact(a.trunk, b.trunk, 'near-palm opt-in'), /exact bytes/);
for (const g of [...Object.values(a), ...Object.values(b)]) g.dispose();
// Bush sprays now write final buffers directly. Exercise the still-merged
// broadleaf cards so the indexed-merge mutation changes the actual draw API.
const cardRng = random(77), indexedRng = random(77);
const cards = current.buildBroadleafCards(cardRng.rng, 58, 1);
const indexed = badIndex.buildBroadleafCards(indexedRng.rng, 58, 1);
assert.deepEqual(cardRng.receipt(), indexedRng.receipt(), 'index control preserves constructor RNG');
assert.equal(cards.index, null); assert.ok(indexed.index, 'mutation really retained an index');
const expanded = indexed.toNonIndexed();
try { exact(cards, expanded, 'index control expanded geometry'); } finally { expanded.dispose(); }
assert.throws(() => exact(cards, indexed, 'index regression'), /exact storage/);
for (const name of Object.keys(cards.attributes)) {
  const bad = cards.clone(); bad.attributes[name].array[0] += .125;
  assert.throws(() => exact(cards, bad, name), /exact bytes/); bad.dispose();
}
cards.dispose(); indexed.dispose();
// Round 77c (2026-09-26): the seam beyond the red line. The far tier's quads (treeImpostors.ts) and the horizon ring's
// forest (horizonForestImpostors.ts, bound to the same atlas) must light through ONE law: the far canopy hook's matte
// wrap and translucency and the far material's sky fill are the ring material's constants — a change to either side
// without the other re-opens the round-77b seam (the ring a paler, softer forest over the dark impostor rim).
const farHookMatch = text.match(/const farCanopyWindHook = makeTreeWindHook\(2\.5, 8\.0, ([0-9.]+), true, true, ([0-9.]+)\);/);
assert.ok(farHookMatch, 'the far canopy hook (wrap, matte, thin) is where the receipt expects it');
assert.equal(Number(farHookMatch[1]), HORIZON_FOREST_IMPOSTOR_WRAP, 'the ring forest wraps like the far tier');
assert.equal(Number(farHookMatch[2]), HORIZON_FOREST_IMPOSTOR_THIN, 'the ring forest transmits like the far tier');
const impostorText = readFileSync(new URL('./treeImpostors.ts', import.meta.url), 'utf8');
const skyFill = impostorText.match(/material\.envMapIntensity = ([0-9.]+); \/\/ the far canopy's sky fill/);
assert.ok(skyFill && Number(skyFill[1]) === HORIZON_FOREST_IMPOSTOR_SKY_FILL, 'the ring forest takes the far tier\'s sky fill');
const ringImpostorLaw = { wrap: HORIZON_FOREST_IMPOSTOR_WRAP, thin: HORIZON_FOREST_IMPOSTOR_THIN, skyFill: HORIZON_FOREST_IMPOSTOR_SKY_FILL };
console.log(JSON.stringify({ protocol: 'vegetation-far-seams-v2', primitives, near, far, bushes, tornGaps, ringImpostorLaw }));
console.log('Far seams: joined bounded deterministic shell jitter, finite libraries, recomputed far normals, tearing/near-palm/index/attribute mutations rejected. No native art or cost acceptance.');
