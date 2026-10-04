// Trees round 2 (2026-10-03): the grown crowns read as masses of leaves — a construction receipt for treeGrowth.ts's
// crown lobes, its lobe-union card normals and crown-depth shade, the billboard frame each card carries (and the turn
// the near material and the impostor bake make with it), the evenly thinned crown that keeps a conifer's apex, and
// crownShadowDapple.ts's dappled crown shadow (the program text, the shared material, the crown masses' porosity tags
// and the atlas shares they read). No GPU: the look itself lives in the lane's captures; this pins the laws the look
// rests on.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import {
  crownLobes, emitCrownShadowHull, emitLeafCards, GROWTH_CROWN_POROSITY, GROWTH_CROWN_SHADING, GROWTH_SPECIES, growTreeSkeleton,
  TREE_GROWTH_PROFILES,
} from './treeGrowth.ts';
import {
  applyCrownDappleDepth, CROWN_DAPPLE_ATTRIBUTE, CROWN_DAPPLE_LAW, CROWN_DAPPLE_PROGRAM_KEY, crownDappleTags, crownDappleThreshold,
  getCrownDappleDepthMaterial, patchCrownDappleDepthShader,
} from './crownShadowDapple.ts';
import { makeSprayAtlas, SPRAY_ATLAS_COVERAGE, SPRAY_KINDS } from './treeSprayAtlas.ts';
import { LOD_SHADOW_FADE_ATTRIBUTE } from '../engine/lodShadowFade.ts';
import { growShrubSkeleton } from './treeGrowth.ts';
import { TREE_BIOMES, treeBiomeColour, treeBiomePalette, treeBiomeShrub, treeBiomeSlot } from './treeBiomes.ts';
import { grownTintLaw } from './vegetation.ts';
import { TREE_SPECIES } from './treeSpecies.ts';
import { MAP_IDS } from './maps/mapIds.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const report = { species: {}, dapple: null, porosity: {} };

for (const species of GROWTH_SPECIES) {
  const profile = TREE_GROWTH_PROFILES[species];
  for (let variant = 0; variant < 3; variant++) {
    const skeleton = growTreeSkeleton(species, mulberry32(4001 + variant * 13), { variant, tier: 'desktop' });
    // a palm's head (fronds round one point) and a snag's few dead twigs carry no masses
    if (profile.family === 'palm' || profile.family === 'dead') { assert.equal(skeleton.lobes, undefined, `${species}: no lobes`); continue; }
    // the lobes: a handful of masses covering the crown (every card centre inside its nearest lobe, a little slack)
    const lobes = skeleton.lobes;
    assert.ok(lobes && lobes.length >= 2 && lobes.length <= 10, `${species}/${variant}: ${lobes?.length} lobes`);
    for (const l of lobes) assert.ok(l.rx > 0.3 && l.ry > 0.3 && l.rz > 0.3 && [l.x, l.y, l.z].every(Number.isFinite), `${species}: a lobe has extent`);
    let covered = 0;
    for (const s of skeleton.leaves) {
      const cx = s.x + s.ax * s.length * 0.45, cy = s.y + s.ay * s.length * 0.45, cz = s.z + s.az * s.length * 0.45;
      const inside = lobes.some((l) => ((cx - l.x) / l.rx) ** 2 + ((cy - l.y) / l.ry) ** 2 + ((cz - l.z) / l.rz) ** 2 <= 1.1);
      if (inside) covered++;
    }
    assert.ok(covered >= 0.95 * skeleton.leaves.length, `${species}/${variant}: the lobes hold ${covered}/${skeleton.leaves.length} card centres`);
    assert.deepEqual(crownLobes(skeleton, lobes.length), lobes, `${species}: the lobes are deterministic from the sprays`);

    const tint = () => [0.5, 0.6, 0.4];
    const cards = emitLeafCards(skeleton, { tint, tiles: 2, rng: mulberry32(7), rows: 2 });
    const p = cards.getAttribute('position'), n = cards.getAttribute('normal'), c = cards.getAttribute('color');
    const axis = cards.getAttribute('aAxis'), leaf = cards.getAttribute('aLeaf'), card = cards.getAttribute('aCard');
    assert.ok(axis && leaf && card, `${species}: the cards carry the billboard frame`);
    // the frame reproduces the authored card: each vertex lies |across| from its point on the card's axis, square to it
    let worst = 0;
    for (let i = 0; i < p.count; i++) {
      const ax = axis.getX(i), ay = axis.getY(i), az = axis.getZ(i);
      assert.ok(Math.abs(Math.hypot(ax, ay, az) - 1) < 1e-5, 'a unit card axis');
      const ox = card.getX(i) + ax * leaf.getY(i), oy = card.getY(i) + ay * leaf.getY(i) - leaf.getZ(i), oz = card.getZ(i) + az * leaf.getY(i);
      const dx = p.getX(i) - ox, dy = p.getY(i) - oy, dz = p.getZ(i) - oz;
      worst = Math.max(worst, Math.abs(Math.hypot(dx, dy, dz) - Math.abs(leaf.getX(i))));
      // the authored offset is square to the axis (the sag is along world down, which a level axis keeps square too)
      const along = (dx * ax + dy * ay + dz * az);
      assert.ok(Math.abs(along) < 1e-3 + Math.abs(leaf.getZ(i)) * Math.abs(ay), `${species}: the across offset is square to the axis`);
    }
    assert.ok(worst < 1e-3, `${species}/${variant}: the frame reproduces the authored vertex (${worst.toExponential(2)} m)`);
    // the turn toward a camera shows the cluster's face: the facing card's normal looks at the camera more than the
    // authored card's (mean |n·v| over the cards, four ground-level views)
    let authored = 0, facing = 0, samples = 0;
    for (const az of [0, 1.7, 3.1, 4.6]) {
      const cam = new THREE.Vector3(Math.cos(az) * 25, 2.6, Math.sin(az) * 25);
      for (let i = 0; i < p.count; i += 4) {
        // the card's four welded corners are vertices i..i+5 of the flat list: take the first triangle's edges
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), d = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        const ctr = new THREE.Vector3().fromBufferAttribute(card, i);
        const view = cam.clone().sub(ctr).normalize();
        const nA = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
        const ax3 = new THREE.Vector3().fromBufferAttribute(axis, i);
        const right = ax3.clone().cross(cam.clone().sub(ctr)).normalize();
        const nF = right.clone().cross(ax3).normalize();
        authored += Math.abs(nA.dot(view)); facing += Math.abs(nF.dot(view)); samples++;
      }
    }
    authored /= samples; facing /= samples;
    assert.ok(facing > authored + 0.15 && facing > 0.6, `${species}/${variant}: the facing clusters show their face (|n·v| ${facing.toFixed(2)} against ${authored.toFixed(2)})`);
    // the lobe-union normals turn out of the crown: a step along a vertex's normal leaves the lobes' union (the field
    // Σ e^{−|q|²} falls along it)
    const field = (x, y, z) => lobes.reduce((f, l) => f + Math.exp(-(((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 + ((z - l.z) / l.rz) ** 2)), 0);
    let outward = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (field(x + n.getX(i) * 0.05, y + n.getY(i) * 0.05, z + n.getZ(i) * 0.05) < field(x, y, z)) outward++;
    }
    assert.ok(outward >= 0.85 * p.count, `${species}/${variant}: ${outward}/${p.count} card normals face out of the crown's lobes`);
    // the depth shade: the crown's heart is darker than its shell (the deepest fifth of the vertices by the lobes'
    // field against the shallowest fifth), and nothing is darker than the law allows
    const depth = [];
    for (let i = 0; i < p.count; i++) {
      let f = 0;
      for (const l of lobes) f += Math.exp(-(((p.getX(i) - l.x) / l.rx) ** 2 + ((p.getY(i) - l.y) / l.ry) ** 2 + ((p.getZ(i) - l.z) / l.rz) ** 2));
      depth.push([f, lum(c.getX(i), c.getY(i), c.getZ(i))]);
    }
    depth.sort((x, y) => x[0] - y[0]);
    const k = Math.max(1, Math.floor(depth.length / 5));
    const shell = depth.slice(0, k).reduce((s, x) => s + x[1], 0) / k, heart = depth.slice(-k).reduce((s, x) => s + x[1], 0) / k;
    const floor = lum(0.5, 0.6, 0.4) * (1 - GROWTH_CROWN_SHADING.depthShade) * (1 - GROWTH_CROWN_SHADING.underside) - 1e-6;
    assert.ok(heart < shell * 0.9, `${species}/${variant}: the heart (${heart.toFixed(3)}) sits in shade under the shell (${shell.toFixed(3)})`);
    assert.ok(depth.every((x) => x[1] >= floor), `${species}: no card darker than the shade law's floor`);
    if (variant === 1) report.species[species] = { lobes: lobes.length, sprays: skeleton.leaves.length, facing: +facing.toFixed(2), authored: +authored.toFixed(2), shell: +shell.toFixed(3), heart: +heart.toFixed(3) };
    // a conifer's apex: no bare leader — the top tenth of the tree carries sprays, and the highest spray tip reaches
    // within a hand's breadth of the stem's top
    if (profile.family === 'conifer' && profile.form === 'excurrent') {
      const top = skeleton.branches[0].nodes.at(-1).y;
      const apex = skeleton.leaves.filter((s) => s.y > top * 0.9).length;
      const tip = Math.max(...skeleton.leaves.map((s) => s.y + s.ay * s.length));
      assert.ok(apex >= 5, `${species}/${variant}: the apex carries ${apex} sprays`);
      assert.ok(tip >= top - 0.25, `${species}/${variant}: the spire's tip ${tip.toFixed(2)} m reaches the leader's top ${top.toFixed(2)} m`);
    }
    // the hull: the wood leads (whole triangles), the crown masses follow, each with its porosity
    const coverage = SPRAY_ATLAS_COVERAGE[species] ?? GROWTH_CROWN_POROSITY.coverage;
    const hull = emitCrownShadowHull(skeleton, 8, coverage);
    assert.ok(Number.isInteger(hull.woodVertices) && hull.woodVertices % 3 === 0 && hull.woodVertices < hull.length / 3, `${species}: the hull's wood split`);
    assert.ok(hull.masses.length >= 2 && hull.masses[0].start === hull.woodVertices && hull.masses.at(-1).end === hull.length / 3,
      `${species}: the masses tile the crown after the wood`);
    for (const mass of hull.masses) {
      assert.ok(mass.end > mass.start && (mass.end - mass.start) % 3 === 0, `${species}: a mass is whole triangles`);
      assert.ok(mass.transmittance >= GROWTH_CROWN_POROSITY.min && mass.transmittance <= GROWTH_CROWN_POROSITY.max, `${species}: a mass's porosity in the law's band`);
    }
    const mean = hull.masses.reduce((sum, mass) => sum + mass.transmittance, 0) / hull.masses.length;
    (report.porosity[species] ??= []).push(+mean.toFixed(3));
    // a sparser atlas lets more sun through the same crown
    const sparse = emitCrownShadowHull(skeleton, 8, coverage * 0.5);
    assert.ok(sparse.masses.every((mass, m) => mass.transmittance >= hull.masses[m].transmittance), `${species}: half the leaf, more sun`);
  }
}
// the porosity follows the crowns: the airy Aleppo pine and larch let more of the sun through than the dense oak and
// chestnut (wave 6's "dense, unexplained dark shadow-shape" under a sparse crown)
{
  const meanOf = (species) => report.porosity[species].reduce((a, b) => a + b, 0) / report.porosity[species].length;
  for (const sparse of ['aleppoPine', 'larch']) for (const dense of ['oak', 'chestnut']) {
    assert.ok(meanOf(sparse) > meanOf(dense) + 0.1, `${sparse} (${meanOf(sparse).toFixed(2)}) lets more sun through than ${dense} (${meanOf(dense).toFixed(2)})`);
  }
}
// the atlas shares the porosity reads are the painted atlases' own (re-measured at 256 px)
{
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  try {
    for (const kind of SPRAY_KINDS) {
      const image = makeSprayAtlas(kind, mulberry32(7), 256, null, 0).image;
      const data = image.getContext ? image.getContext('2d').getImageData(0, 0, image.width, image.height).data : image.data;
      let alpha = 0;
      for (let i = 3; i < data.length; i += 4) alpha += data[i] / 255;
      const share = alpha / (data.length / 4);
      assert.ok(Math.abs(share - SPRAY_ATLAS_COVERAGE[kind]) <= 0.03, `${kind}: the atlas share ${share.toFixed(3)} against the table's ${SPRAY_ATLAS_COVERAGE[kind]}`);
    }
  } finally {
    globalThis.document = savedDocument;
    globalThis.ImageData = savedImageData;
  }
}

// the shrubs carry the frame but no lobes: their normals and tint are the round-1 law (no depth shade)
{
  const skeleton = { species: 'oak', height: 1, branches: [], crown: { x: 0, y: 0.6, z: 0, r: 1 },
    leaves: [{ x: 0, y: 0.2, z: 0, ax: 0, ay: 1, az: 0, nx: 0, ny: 0, nz: 1, length: 0.6, width: 0.4, shade: 1, flex: 0.2, tile: 0, bend: 0, branch: -1 }] };
  const cards = emitLeafCards(skeleton, { tint: () => [0.5, 0.6, 0.4], tiles: 2, rng: mulberry32(1), rows: 2 });
  const c = cards.getAttribute('color');
  for (let i = 0; i < c.count; i++) assert.deepEqual([c.getX(i), c.getY(i), c.getZ(i)].map((v) => +v.toFixed(5)), [0.5, 0.6, 0.4], 'no depth shade without lobes');
  assert.ok(cards.getAttribute('aAxis') && cards.getAttribute('aLeaf'), 'a shrub card carries the billboard frame');
}

// the dappled crown shadow
{
  const shader = {
    vertexShader: THREE.ShaderLib.depth.vertexShader,
    fragmentShader: THREE.ShaderLib.depth.fragmentShader,
    uniforms: {},
  };
  patchCrownDappleDepthShader(shader);
  assert.match(shader.vertexShader, new RegExp(`attribute float ${CROWN_DAPPLE_ATTRIBUTE};`), 'the crown flag reaches the depth pass');
  assert.match(shader.vertexShader, /attribute float aLodF;/, 'and the LOD dissolve stays');
  assert.match(shader.vertexShader, /vCotSun = \( mat3\( viewMatrix \) \* vLodShadowWorldPosition \)\.xy;/, 'sun space: the shadow camera\'s rotation alone');
  assert.match(shader.fragmentShader, /if \( vCotCrown > 0\.5 \)/, 'only the crown masses open');
  assert.match(shader.fragmentShader, /dFdx\( vCotSun \)/, 'the gaps close by the cascade texel');
  assert.doesNotMatch(shader.fragmentShader, /gl_FragCoord/, 'no screen-space seed: a cascade snap never reseeds the gaps');
  const material = getCrownDappleDepthMaterial();
  assert.equal(material.customProgramCacheKey(), CROWN_DAPPLE_PROGRAM_KEY);
  assert.equal(material.depthPacking, THREE.RGBADepthPacking, 'the renderer-compatible packing');
  assert.equal(material.userData.lodShadowFade, true, 'the shadow audits see the dissolve');
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(LOD_SHADOW_FADE_ATTRIBUTE, new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1);
  assert.throws(() => applyCrownDappleDepth(mesh), /requires aCrown/, 'a proxy without crown flags is refused');
  geometry.setAttribute(CROWN_DAPPLE_ATTRIBUTE, new THREE.BufferAttribute(crownDappleTags(count, [{ start: 6, end: 18, transmittance: 0.3 }]), 1));
  applyCrownDappleDepth(mesh);
  assert.equal(mesh.customDepthMaterial, material, 'every world shares the one program');
  assert.equal(mesh.userData.lodShadowFadeCaster, true);
  // the tags: 0 on the wood and the trailing casters; mass m carries m + 1 and, in the fraction, its threshold
  const tags = crownDappleTags(12, [{ start: 3, end: 6, transmittance: 0.1 }, { start: 6, end: 9, transmittance: 0.6 }]);
  assert.deepEqual([...tags.slice(0, 3), ...tags.slice(9)], [0, 0, 0, 0, 0, 0], 'the wood and the trailing casters stay solid');
  assert.ok(Math.floor(tags[3]) === 1 && Math.floor(tags[6]) === 2, 'each mass its own pattern index');
  const decode = (tag) => (tag - Math.floor(tag) - 0.02) / 0.96;
  assert.ok(Math.abs(decode(tags[3]) - crownDappleThreshold(0.1)) < 1e-4 && Math.abs(decode(tags[6]) - crownDappleThreshold(0.6)) < 1e-4,
    'the fraction carries the mass\'s threshold');
  assert.ok(tags.every((tag) => tag === 0 || (tag - Math.floor(tag) >= 0.02 - 1e-6 && tag - Math.floor(tag) <= 0.98 + 1e-6)),
    'the fraction keeps clear of the integers (the interpolated tag never changes mass)');
  assert.match(shader.fragmentShader, /float cotMass = floor\( vCotCrown \);/, 'the shader reads the mass');
  assert.match(shader.fragmentShader, /if \( cotLeaf < cotThreshold \* cotDetail \) discard;/, 'and opens it to its own threshold');
  // the gap share: the law's threshold over the two-octave noise opens about a quarter of a crown to the sun (the
  // same hash and noise as the shader, on a CPU grid)
  const hash = (x, y) => {
    let px = x * 0.1031, py = y * 0.1030; px -= Math.floor(px); py -= Math.floor(py);
    const d = px * (py + 33.33) + py * (px + 33.33); px += d; py += d;
    const v = (px + py) * px; return v - Math.floor(v);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  };
  // the law's quantiles: a mass opened to crownDappleThreshold(t) lets about t of the sun through, on a grid of the
  // shader's own noise, and two masses' patterns (the per-mass offset) are independent: through both, about t1 x t2
  const values = [], second = [];
  const [ox, oy] = CROWN_DAPPLE_LAW.massOffsetM;
  const leaf = (x, y) => noise(x / CROWN_DAPPLE_LAW.cellM, y / CROWN_DAPPLE_LAW.cellM) * 0.62
    + noise(x / (CROWN_DAPPLE_LAW.cellM * CROWN_DAPPLE_LAW.fine) + 17.31, y / (CROWN_DAPPLE_LAW.cellM * CROWN_DAPPLE_LAW.fine) + 17.31) * 0.38;
  for (let y = -60; y < 60; y += 0.23) for (let x = -60; x < 60; x += 0.29) { values.push(leaf(x, y)); second.push(leaf(x + ox, y + oy)); }
  const shares = {};
  for (const t of [0.1, 0.3, 0.5, 0.7]) {
    const level = crownDappleThreshold(t);
    const share = values.filter((v) => v < level).length / values.length;
    assert.ok(Math.abs(share - t) < 0.03, `a mass at ${t} lets ${(share * 100).toFixed(1)} % of the sun through`);
    shares[t] = +share.toFixed(3);
  }
  const l1 = crownDappleThreshold(0.4), l2 = crownDappleThreshold(0.5);
  const both = values.filter((v, i) => v < l1 && second[i] < l2).length / values.length;
  assert.ok(Math.abs(both - 0.2) < 0.04, `the sun through two masses (0.4 and 0.5): ${(both * 100).toFixed(1)} %`);
  report.dapple = { shares, twoMasses: +both.toFixed(3) };
}

// the biomes: every entry names a registered map, real slots and grown forms; Las Cañadas' shrubs are its broom, and a
// broom mound is a shrub like any other (the shrub law's budget and grounding)
for (const [mapId, biome] of Object.entries(TREE_BIOMES)) {
  assert.ok(MAP_IDS.includes(mapId), `${mapId}: a registered map`);
  for (const [slot, entry] of Object.entries(biome.slots)) {
    assert.ok(TREE_SPECIES.includes(slot), `${mapId}: ${slot} is a species slot`);
    assert.ok(TREE_GROWTH_PROFILES[entry.form] && GROWTH_SPECIES.includes(entry.form), `${mapId}: ${slot} grows as a grown tree form (${entry.form})`);
  }
  if (biome.shrub) assert.ok(TREE_GROWTH_PROFILES[biome.shrub], `${mapId}: its shrub form exists`);
}
assert.equal(treeBiomeShrub('caldera'), 'broom');
assert.equal(treeBiomeSlot('caldera', 'pine')?.form, 'canaryPine');
assert.equal(treeBiomeSlot('verdant', 'oak'), null, 'a slot the table leaves alone grows as itself');
{
  // the palette a form grows with (wave 6: Cinder Junction's sooty-gold twig tint painted its leafy birches orange-brown)
  const tone = (h, sat, l) => [0.12, sat * 0.5, l];
  const twigs = { cardHue: 0.14, cardSat: 0.26, texTone: tone, jitterHue: 0.5, snow: 0.2 };
  const leafy = treeBiomePalette(twigs, { form: 'birch', leaves: true }, false);
  assert.ok(leafy.birchLeaves === true && leafy.cardHue === undefined && leafy.cardSat === undefined && leafy.texTone === undefined,
    'a leafy form on a palette tuned for bare twigs sets the twigs\' colours aside');
  assert.ok(leafy.jitterHue === 0.5 && leafy.snow === 0.2, 'and keeps the rest of the map palette');
  const authored = { cardHue: 0.2, cardSat: 0.3, texTone: tone, birchLeaves: true };
  assert.deepEqual(treeBiomePalette(authored, { form: 'birch', leaves: true }, false), authored, 'a palette authored for leaves keeps its colours');
  const cross = treeBiomePalette({ cardHue: 0.3, cardSat: 0.2, texTone: tone }, { form: 'holmOak' }, true);
  assert.ok(cross.cardHue === undefined && cross.cardSat === undefined && cross.texTone === tone, 'a form of another family keeps the tone, not the card hue');
  assert.equal(treeBiomePalette(twigs, null, false), twigs, 'no form: the map palette as it is');
  // the table's railyard birches are leafy, and their map palette is the twig-tuned one this rule is for
  assert.equal(treeBiomeSlot('railyard', 'birch')?.leaves, true);
  // and the card tint law a crown falls back on where its palette names no card colour: a birch crown in leaf takes the
  // leaves' hue and saturation, its bare twigs keep their warm grey (the round-2 hand-over: the leafy birches of
  // Prokhorovka's pine and willow slots and of the Fulda Gap's aspens grew olive-brown crowns on the twigs' law)
  const tint = ([hue, sat]) => new THREE.Color().setHSL(hue, sat, 0.5, THREE.SRGBColorSpace);
  const inLeaf = tint(grownTintLaw('birch', true)), bare = tint(grownTintLaw('birch', false));
  assert.ok(inLeaf.g > inLeaf.r && inLeaf.g > inLeaf.b, 'a birch crown in leaf tints its leaves green');
  assert.deepEqual(grownTintLaw('birch', true).slice(0, 2), grownTintLaw('broadleaf').slice(0, 2), 'with the broadleaf crowns\' hue and saturation');
  assert.equal(grownTintLaw('birch', true)[2], grownTintLaw('birch', false)[2], 'at the birch\'s own gain');
  assert.ok(bare.r > bare.g && bare.g > bare.b, 'bare twigs keep their warm grey');
}
{
  // the place's foliage colour (wave 15: "lush green groves on Wadi Rum"): it fills what a map palette leaves unnamed and
  // never overrides a named colour; Wadi Rum's acacias are dust-dulled over white-broom scrub, Las Cañadas' acacia slot a pine
  const arid = treeBiomeColour('badlands');
  assert.ok(arid && arid.cardSat < 0.2 && typeof arid.texTone === 'function', 'Wadi Rum carries a dust-dulled foliage colour');
  const [h, sat, l] = arid.texTone(0.22, 0.4, 0.2);
  assert.ok(Math.abs(h - 0.17) < 1e-9 && sat <= 0.2 + 1e-9 && l >= 0.2, 'the tone pulls the leaves toward a pale khaki at half the saturation');
  const filled = treeBiomePalette({}, null, false, arid);
  assert.ok(filled.cardHue === arid.cardHue && filled.cardSat === arid.cardSat && filled.texTone === arid.texTone, 'an unnamed palette takes the place\'s colour');
  const named = { cardHue: 0.3, cardSat: 0.4, texTone: (x, y, z) => [x, y, z] };
  const kept = treeBiomePalette(named, null, false, arid);
  assert.ok(kept.cardHue === 0.3 && kept.cardSat === 0.4 && kept.texTone === named.texTone, 'a named colour wins');
  assert.equal(treeBiomeColour('verdant'), null, 'a temperate place keeps the green defaults');
  assert.equal(treeBiomeShrub('badlands'), 'broom', 'Wadi Rum\'s scrub is white broom');
  assert.equal(treeBiomeSlot('caldera', 'acacia')?.form, 'canaryPine', 'no umbrella acacia on Teide');
}
assert.ok(!GROWTH_SPECIES.includes('broom'), 'the broom is a shrub form, never a tree slot');
{
  const broom = growShrubSkeleton('broom', 'bush', mulberry32(9));
  assert.ok(broom.leaves.length >= 32 && broom.leaves.every((l) => l.y >= -0.0601), `a broom mound of ${broom.leaves.length} sprays on the ground`);
}

console.log(JSON.stringify(report));
console.log('treeCrownShading.selftest: lobes, lobe-union normals, crown-depth shade, the billboard frame and its facing turn, the conifer apex and the dappled crown shadow PASS');
