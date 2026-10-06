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
  crownLobes, emitCrownShadowHull, emitLeafCards, forestGrownProfile, GROWTH_CROWN_POROSITY, GROWTH_CROWN_SHADING, GROWTH_SPECIES,
  growTreeSkeleton, TREE_GROWTH_PROFILES, tuftLobes,
} from './treeGrowth.ts';
import {
  applyCrownDappleDepth, CROWN_DAPPLE_ATTRIBUTE, CROWN_DAPPLE_LAW, CROWN_DAPPLE_PROGRAM_KEY, crownDappleTags, crownDappleThreshold,
  getCrownDappleDepthMaterial, patchCrownDappleDepthShader,
} from './crownShadowDapple.ts';
import { makeSprayAtlas, SHRUB_STEM_TILE, SPRAY_ATLAS_COVERAGE, SPRAY_ATLAS_TILES, SPRAY_KINDS } from './treeSprayAtlas.ts';
import { LOD_SHADOW_FADE_ATTRIBUTE } from '../engine/lodShadowFade.ts';
import { growShrubSkeleton } from './treeGrowth.ts';
import { TREE_BIOMES, treeBiomeArid, treeBiomeColour, treeBiomeOpen, treeBiomePalette, treeBiomeShrub, treeBiomeShrubColour, treeBiomeSlot, treeBiomeUpland } from './treeBiomes.ts';
import { BARE_SPRAY_KINDS, bareFormPalette, grownFormSprayKind, grownTintLaw } from './vegetation.ts';
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
    // trees round 4 (the gauntlet's wave 39: Caldera's midground Canary pines read as "round broadleaf crowns", the crown's
    // few lobes lighting each pine as a handful of lit round masses): a tufted pine's cards shade by its tufts — a mass
    // for about every four sprays, each a fist of needles, every card centre in its own tuft — and no other crown has any
    const tufts = skeleton.tufts;
    if (profile.habit === 'tuft') {
      assert.ok(tufts && tufts.length === Math.max(2, Math.round(skeleton.leaves.length / 4)) && tufts.length > lobes.length * 2,
        `${species}/${variant}: ${tufts?.length} tufts for ${skeleton.leaves.length} sprays (${lobes.length} lobes)`);
      for (const l of tufts) assert.ok(Math.max(l.rx, l.ry, l.rz) < 1.6 && Math.min(l.rx, l.ry, l.rz) >= 0.15, `${species}: a tuft is a fist of needles`);
      let held = 0;
      for (const s of skeleton.leaves) {
        const cx = s.x + s.ax * s.length * 0.45, cy = s.y + s.ay * s.length * 0.45, cz = s.z + s.az * s.length * 0.45;
        // a tuft's ellipsoid is its members' box with a hand's margin: a centre in the box's corner sits within √2 of it
        if (tufts.some((l) => ((cx - l.x) / l.rx) ** 2 + ((cy - l.y) / l.ry) ** 2 + ((cz - l.z) / l.rz) ** 2 <= 2)) held++;
      }
      assert.ok(held >= 0.98 * skeleton.leaves.length, `${species}/${variant}: the tufts hold ${held}/${skeleton.leaves.length} card centres`);
      assert.deepEqual(tuftLobes(skeleton), tufts, `${species}: the tufts are deterministic from the sprays`);
    } else assert.equal(tufts, undefined, `${species}: only a tufted pine shades by tufts`);
    const shadeLobes = tufts ?? lobes;

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
    const field = (x, y, z) => shadeLobes.reduce((f, l) => f + Math.exp(-(((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 + ((z - l.z) / l.rz) ** 2)), 0);
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
      for (const l of shadeLobes) f += Math.exp(-(((p.getX(i) - l.x) / l.rx) ** 2 + ((p.getY(i) - l.y) / l.ry) ** 2 + ((p.getZ(i) - l.z) / l.rz) ** 2));
      depth.push([f, lum(c.getX(i), c.getY(i), c.getZ(i))]);
    }
    depth.sort((x, y) => x[0] - y[0]);
    const k = Math.max(1, Math.floor(depth.length / 5));
    const shell = depth.slice(0, k).reduce((s, x) => s + x[1], 0) / k, heart = depth.slice(-k).reduce((s, x) => s + x[1], 0) / k;
    // trees round 4: the floor takes the card's own ramp at its stem row, and a tufted pine's tuft by its stem
    const floor = lum(0.5, 0.6, 0.4) * (1 - GROWTH_CROWN_SHADING.depthShade) * (1 - GROWTH_CROWN_SHADING.underside)
      * GROWTH_CROWN_SHADING.cardRamp[0] * (tufts ? 1 - GROWTH_CROWN_SHADING.tuftCrownDepth : 1) - 1e-6;
    assert.ok(heart < shell * 0.9, `${species}/${variant}: the heart (${heart.toFixed(3)}) sits in shade under the shell (${shell.toFixed(3)})`);
    assert.ok(depth.every((x) => x[1] >= floor), `${species}: no card darker than the shade law's floor`);
    if (variant === 1) report.species[species] = { lobes: lobes.length, tufts: tufts?.length ?? 0, sprays: skeleton.leaves.length, facing: +facing.toFixed(2), authored: +authored.toFixed(2), shell: +shell.toFixed(3), heart: +heart.toFixed(3) };
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
      // a pine's brush and an acacia's leaflets keep their gaps under the alpha test (wave 26: the pines' shaded hearts and
      // the acacia's body filled each tile's core, "flat broadleaf leaf-card clusters", "lime-green blob foliage"): under
      // 5 % of the 8 × 8 windows wholly opaque (14.5 %, 6.8 %, 10 % and 28 % before; an oak's leaf mass 23 %)
      if (kind === 'canaryPine' || kind === 'aleppoPine' || kind === 'pine' || kind === 'pinyon' || kind === 'acacia') {
        let solid = 0, windows = 0;
        for (let y = 0; y + 8 <= 256; y += 2) for (let x = 0; x + 8 <= 256; x += 2) {
          let opaque = true;
          for (let j = 0; j < 8 && opaque; j++) for (let i = 0; i < 8; i++) if (data[((y + j) * 256 + x + i) * 4 + 3] < 97) { opaque = false; break; }
          windows++; if (opaque) solid++;
        }
        assert.ok(solid / windows < 0.05, `${kind}: its tile keeps its gaps (${(solid / windows * 100).toFixed(1)} % of the windows solid)`);
      }
      // round 3 (wave 31, the Fulda spruce's sprays "read as broadleaf"): the spruce's and the fir's herringbone stays
      // open between its side twigs (19 % and 25 % of the windows solid before, one serrated leaf)
      if (kind === 'spruce' || kind === 'fir') {
        let solid = 0, windows = 0;
        for (let y = 0; y + 8 <= 256; y += 2) for (let x = 0; x + 8 <= 256; x += 2) {
          let opaque = true;
          for (let j = 0; j < 8 && opaque; j++) for (let i = 0; i < 8; i++) if (data[((y + j) * 256 + x + i) * 4 + 3] < 97) { opaque = false; break; }
          windows++; if (opaque) solid++;
        }
        assert.ok(solid / windows < (kind === 'fir' ? 0.2 : 0.14), `${kind}: its herringbone stays open (${(solid / windows * 100).toFixed(1)} % solid)`);
      }
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
  // trees round 4 (the gauntlet's wave 39: "oversized flat cards with little interior shading up close"): a crown's card
  // darkens toward its seat — a lone lobe far off (no depth) over a crown centre below (no underside) leaves the ramp alone: the stem row at the
  // ramp's foot, the tip row at its head, so a cluster reads as leaves round its twig, the twig in their shade
  const crowned = { ...skeleton, crown: { x: 0, y: -5, z: 0, r: 1 }, lobes: [{ x: 40, y: 40, z: 40, rx: 1, ry: 1, rz: 1 }] };
  const ramped = emitLeafCards(crowned, { tint: () => [0.5, 0.6, 0.4], tiles: 2, rng: mulberry32(1), rows: 2 });
  const rc = ramped.getAttribute('color'), rleaf = ramped.getAttribute('aLeaf');
  const [stemK, tipK] = GROWTH_CROWN_SHADING.cardRamp;
  assert.ok(stemK < 0.85 && tipK > 1 && (stemK + tipK) / 2 > 0.9, `the ramp darkens the seat and lifts the tip (${stemK}, ${tipK})`);
  for (let i = 0; i < rc.count; i++) {
    const stem = rleaf.getY(i) < 0; // along the card from its centre: the stem row behind it, the tip row ahead
    const k = stem ? stemK : tipK;
    assert.deepEqual([rc.getX(i), rc.getY(i), rc.getZ(i)].map((x) => +x.toFixed(4)), [0.5 * k, 0.6 * k, 0.4 * k].map((x) => +x.toFixed(4)),
      `a crown card's ${stem ? 'stem' : 'tip'} row takes the ramp`);
  }
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
// (2026-10-05, the map-revival lane: Caldera is the Aso caldera — sugi, Japanese red pine, the grassland's low scrub)
assert.equal(treeBiomeShrub('caldera'), 'broom');
assert.equal(treeBiomeSlot('caldera', 'pine')?.form, 'sugi');
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
  // wave 26: the round-2b khaki-olive (hue 0.17, half the saturation) still read "lime-green" in the Sirocco sun; wave
  // 31: round 3's yellow-green (0.2) lit golden-olive — Acacia raddiana is a grey-green
  assert.ok(Math.abs(h - 0.26) < 1e-9 && sat <= 0.128 + 1e-9 && l >= 0.2, 'the tone pulls the leaves toward a grey green at a third the saturation');
  const filled = treeBiomePalette({}, null, false, arid);
  assert.ok(filled.cardHue === arid.cardHue && filled.cardSat === arid.cardSat && filled.texTone === arid.texTone, 'an unnamed palette takes the place\'s colour');
  const named = { cardHue: 0.3, cardSat: 0.4, texTone: (x, y, z) => [x, y, z] };
  const kept = treeBiomePalette(named, null, false, arid);
  assert.ok(kept.cardHue === 0.3 && kept.cardSat === 0.4 && kept.texTone === named.texTone, 'a named colour wins');
  assert.equal(treeBiomeColour('verdant'), null, 'a temperate place keeps the green defaults');
  assert.equal(treeBiomeShrub('badlands'), 'broom', 'Wadi Rum\'s scrub is white broom');
  assert.equal(treeBiomeSlot('caldera', 'acacia')?.form, 'redPine', 'no umbrella acacia in Aso: the red pine');
  // (Caldera round 2: Aso's sugi stand in closed plantation blocks — Las Cañadas' open groves are gone)
  assert.ok(!treeBiomeOpen('caldera') && !treeBiomeArid('caldera') && treeBiomeOpen('desert') && !treeBiomeOpen('verdant'),
    'open groves on the arid places only');
  // Copper Mesa is Queenstown under Mount Lyell (the map-revival lane, merged in batch 4, 2026-10-06; the trees lane's
  // Arizona uplands row of wave 28 went with the old identity): eucalypt regrowth in the acacia and cedar slots, the
  // tea-tree scrub in the holm oak's leaf, no zoning by height; the juniper and pinyon forms stay grown conifers
  assert.equal(treeBiomeSlot('copper_mesa', 'acacia')?.form, 'eucalyptus');
  assert.equal(treeBiomeSlot('copper_mesa', 'cedar')?.form, 'eucalyptus');
  assert.equal(treeBiomeShrub('copper_mesa'), 'holmOak');
  assert.ok(!treeBiomeUpland('copper_mesa') && !treeBiomeUpland('caldera'), 'Queenstown and Aso are not zoned by height');
  assert.deepEqual(MAP_IDS.filter((id) => treeBiomeUpland(id)), [], 'no map sets the upland hook');
  for (const form of ['juniper', 'pinyon']) assert.equal(TREE_GROWTH_PROFILES[form].family, 'conifer', `${form}: a conifer (the high zone)`);
}
{
  // a form's own colour wins over the map palette's (tuned for the slot's species): Dalmatia's olives silver-grey, its
  // holm oaks a dull grey-green (wave 26 on Saltwind Narrows: "uniform mid-green oak type with no olive-grey tone")
  const olive = treeBiomeSlot('saltwind', 'acacia');
  assert.equal(olive?.form, 'olive');
  const acaciaPalette = { cardHue: 0.22, cardSat: 0.3, texTone: (x, y, z) => [x, y, z] };
  const silver = treeBiomePalette(acaciaPalette, olive, false);
  assert.ok(silver.cardSat <= 0.08 && silver.cardHue >= 0.25 && silver.texTone !== acaciaPalette.texTone, 'the olive takes its own silver over the acacia palette');
  const [oh, os, ol] = silver.texTone(0.2, 0.3, 0.3);
  assert.ok(oh > 0.25 && os <= 0.15 + 1e-9 && ol > 0.3, 'its leaves turn grey-green, toward blue, at half their saturation and lighter');
  const holm = treeBiomePalette({}, treeBiomeSlot('saltwind', 'cedar'), true);
  assert.ok(holm.cardSat < 0.12, 'the holm oak a dull grey-green');
  assert.deepEqual(treeBiomePalette(acaciaPalette, { form: 'acacia' }, false), acaciaPalette, 'a form without its own colour keeps the map palette');
}
assert.ok(!GROWTH_SPECIES.includes('broom'), 'the broom is a shrub form, never a tree slot');
{
  const broom = growShrubSkeleton('broom', 'bush', mulberry32(9));
  assert.ok(broom.leaves.length >= 32 && broom.leaves.every((l) => l.y >= -0.0601), `a broom mound of ${broom.leaves.length} sprays on the ground`);
  // trees round 5 (the cities lane's Ironworks): the buddleia, a shrub form too — a mound of long, narrow, arching sprays
  // on the ground, deterministic, its tile purple-flowered (a share of its painted texels violet: the panicles)
  assert.ok(!GROWTH_SPECIES.includes('buddleia'), 'the buddleia is a shrub form, never a tree slot');
  const buddleia = growShrubSkeleton('buddleia', 'bush', mulberry32(9));
  assert.deepEqual(buddleia, growShrubSkeleton('buddleia', 'bush', mulberry32(9)), 'the buddleia grows deterministically');
  assert.ok(buddleia.leaves.length >= 32 && buddleia.leaves.every((l) => l.y >= -0.0601), `a buddleia mound of ${buddleia.leaves.length} sprays on the ground`);
  assert.ok(TREE_GROWTH_PROFILES.buddleia.cardBend >= 0.3 && TREE_GROWTH_PROFILES.buddleia.aspect < 0.7, 'its sprays long, narrow and arching');
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  try {
    const image = makeSprayAtlas('buddleia', mulberry32(7), 256, null, 0).image;
    const data = image.getContext ? image.getContext('2d').getImageData(0, 0, image.width, image.height).data : image.data;
    let opaque = 0, violet = 0;
    const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      opaque++;
      c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255).getHSL(hsl);
      if (hsl.h > 0.7 && hsl.h < 0.85 && hsl.s > 0.3) violet++;
    }
    assert.ok(violet > 0.05 * opaque && violet < 0.5 * opaque, `the buddleia's tile carries its purple panicles (${violet} of ${opaque} texels)`);
  } finally { globalThis.document = savedDocument; globalThis.ImageData = savedImageData; }
}

// trees round 4 (the ground lane on Obsidian Caldera's establishing view: the broom "saturated green" on the ash plain):
// a place's shrub colour (TreeBiome.shrubColour) wins over the bush slot's palette. Las Cañadas named the only one, the
// Teide broom's ash-dulled grey-green; Caldera is now the Aso caldera (the map-revival lane, merged in batch 4,
// 2026-10-06), whose grassland scrub keeps the slot's green, so no place names one and the precedence is pinned on the
// receipt's own copy of that colour (its sprays' saturation cut to three tenths, the hue turned to olive, a little paler)
{
  const ash = Object.freeze({
    cardHue: 0.23, cardSat: 0.05, texTone: (_h, s, l) => [0.22, Math.min(1, s * 0.3), Math.min(1, l * 1.07)],
  });
  const slot = { cardHue: 0.3, cardSat: 0.4, texTone: (hh, ss, ll) => [hh, ss, ll] };
  const pal = treeBiomePalette(slot, { colour: ash }, false, treeBiomeColour('caldera'));
  assert.equal(pal.cardSat, ash.cardSat, 'the shrub colour wins over the slot palette\'s named saturation');
  assert.strictEqual(pal.texTone, ash.texTone, 'and its tone');
  assert.equal(treeBiomeShrubColour('caldera'), null, 'Aso\'s grassland scrub keeps the slot\'s green');
  assert.deepEqual(MAP_IDS.filter((id) => treeBiomeShrubColour(id)), [], 'no place names a shrub colour');
}

// trees round 5 (2026-10-05, the gauntlet's wave 98 on the near field bush: "lobed leaf cards two to four times life
// size with no twigs", "floating leaf confetti"): a shrub atlas (makeSprayAtlas `shrub`) paints a blade-leaved kind's
// sprays at a shrub's leaf size — the leaves' colour steps along the tile's rows (each leaf its own shade: the smaller
// the leaves, the closer the steps) at least two fifths again as close as the crown tiles' (the olive's narrow lances,
// whose steps across a blade come close in either, a sixth) — and its stems on the last
// tile: grey-brown wood standing on the tile's seat (its bottom centre), a thin share of the tile. The crown atlases keep
// their shares (above).
{
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  const S = 512, T = S / SPRAY_ATLAS_TILES;
  const pixels = (image) => (image.getContext ? image.getContext('2d').getImageData(0, 0, image.width, image.height).data : image.data);
  /** A tile's colour steps along its rows: the share of neighbouring opaque texel pairs whose colours differ. */
  const tileSteps = (data, tile) => {
    const tx = (tile % SPRAY_ATLAS_TILES) * T, ty = Math.floor(tile / SPRAY_ATLAS_TILES) * T;
    let pairs = 0, steps = 0;
    for (let y = 0; y < T; y++) for (let x = 0; x < T - 1; x++) {
      const i = ((ty + y) * S + tx + x) * 4, j = i + 4;
      if (data[i + 3] < 200 || data[j + 3] < 200) continue;
      pairs++;
      if (Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) > 18) steps++;
    }
    return steps / pairs;
  };
  /** A tile's opaque texels (at the alpha test) and its origin. */
  const tileEdge = (data, tile) => {
    const tx = (tile % SPRAY_ATLAS_TILES) * T, ty = Math.floor(tile / SPRAY_ATLAS_TILES) * T;
    let area = 0;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (data[((ty + y) * S + tx + x) * 4 + 3] >= 97) area++;
    return { area, tx, ty };
  };
  report.shrubAtlas = {};
  try {
    for (const kind of ['oak', 'beech', 'holmOak', 'chestnut', 'birch', 'mangrove', 'olive', 'acacia', 'spruce', 'broom']) {
      const shrub = pixels(makeSprayAtlas(kind, mulberry32(79), S, null, 0, true).image);
      const crown = pixels(makeSprayAtlas(kind, mulberry32(79), S, null, 0).image);
      const bladed = !['acacia', 'spruce', 'broom'].includes(kind);
      let shrubSteps = 0, crownSteps = 0;
      for (let tile = 0; tile < SHRUB_STEM_TILE; tile++) {
        const a = tileEdge(shrub, tile);
        assert.ok(a.area > 0.08 * T * T, `${kind}: a shrub spray tile is foliage (${(a.area / (T * T)).toFixed(3)})`);
        shrubSteps += tileSteps(shrub, tile) / SHRUB_STEM_TILE; crownSteps += tileSteps(crown, tile) / SHRUB_STEM_TILE;
      }
      if (bladed) {
        assert.ok(shrubSteps > (kind === 'olive' ? 1.15 : 1.4) * crownSteps, `${kind}: the shrub's leaves are smaller than the crown's (colour steps ${shrubSteps.toFixed(3)} against ${crownSteps.toFixed(3)})`);
      }
      // the stem tile: wood, not leaves — warm grey-brown, thin, standing on the seat
      const stem = tileEdge(shrub, SHRUB_STEM_TILE);
      assert.ok(stem.area > 0.025 * T * T && stem.area < 0.2 * T * T, `${kind}: the stems a thin share of their tile (${(stem.area / (T * T)).toFixed(3)})`);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const i = ((stem.ty + y) * S + stem.tx + x) * 4;
        if (shrub[i + 3] >= 200) { r += shrub[i]; g += shrub[i + 1]; b += shrub[i + 2]; n++; }
      }
      const c = new THREE.Color(r / n / 255, g / n / 255, b / n / 255), hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      assert.ok(r >= g && g >= b && hsl.s < 0.3 && hsl.l > 0.15 && hsl.l < 0.6, `${kind}: the stems are grey-brown bark (${c.getHexString()})`);
      let seat = 0;
      for (let y = Math.floor(T * 0.9); y < Math.floor(T * 0.95); y++) for (let x = Math.floor(T * 0.4); x < Math.ceil(T * 0.6); x++) {
        if (shrub[((stem.ty + y) * S + stem.tx + x) * 4 + 3] >= 97) seat++;
      }
      assert.ok(seat > 0, `${kind}: the stems stand on the card's seat`);
      report.shrubAtlas[kind] = { steps: +shrubSteps.toFixed(3), crownSteps: +crownSteps.toFixed(3), stems: +(stem.area / (T * T)).toFixed(3) };
    }
  } finally {
    globalThis.document = savedDocument;
    globalThis.ImageData = savedImageData;
  }
}

// Trees lane (2026-10-05, the cities lane's Ironworks in March 1945): a bare map (VegetationConfig `bare`) stands its
// deciduous broadleaves leafless — each form's winter twigs in its own habit, the twigs' grey-brown, the twigs' open
// shadow — while the conifers and the evergreen broadleaves keep their leaves, and a map in leaf is unchanged.
{
  for (const form of ['birch', 'aspen', 'willow', 'beech', 'oak', 'chestnut', 'poplar', 'buddleia']) {
    assert.ok(BARE_SPRAY_KINDS[form], `${form}: a deciduous form has its winter twigs`);
    assert.equal(grownFormSprayKind(form, { bare: true }), BARE_SPRAY_KINDS[form]);
  }
  assert.equal(grownFormSprayKind('birch', { bare: true, birchLeaves: true }), 'birch-bare', 'bare wins over a slot\'s leaves');
  for (const form of ['olive', 'holmOak', 'eucalyptus', 'mangrove', 'acacia', 'pine', 'spruce', 'fir', 'cedar', 'larch', 'broom']) {
    assert.equal(BARE_SPRAY_KINDS[form], undefined, `${form}: keeps its leaves or needles`);
    assert.equal(grownFormSprayKind(form, { bare: true }), grownFormSprayKind(form, {}));
  }
  assert.equal(grownFormSprayKind('oak', {}), 'oak', 'a map in leaf keeps its leaves');
  assert.equal(grownFormSprayKind('birch', { birchLeaves: true }), 'birch');
  const leafPal = { cardHue: 0.24, cardSat: 0.3, texTone: null, birchLeaves: true, snow: 0 };
  assert.deepEqual(bareFormPalette(leafPal, 'oak', false), leafPal, 'unset: the palette as it was');
  assert.equal(bareFormPalette(leafPal, 'olive', true), leafPal, 'an evergreen form keeps its palette');
  const barePal = bareFormPalette(leafPal, 'oak', true);
  assert.ok(barePal.bare === true && barePal.birchLeaves === false && barePal.cardHue === undefined && barePal.cardSat === undefined,
    'a bare form drops the leaf colours its map tuned');
  for (const family of ['broadleaf', 'birch']) {
    assert.deepEqual(grownTintLaw(family, true, true), grownTintLaw('birch', false), `${family}: bare twigs take the twig law`);
  }
  assert.deepEqual(grownTintLaw('broadleaf', false, false), grownTintLaw('broadleaf'), 'a crown in leaf keeps its law');
  // the painted winter tiles: no green leaf, the twigs grey-brown; the poplar's shoots climb narrower than the oak's
  // spreading twigs; the buddleia's winter canes carry last summer's dry, rust-brown panicles, no violet
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  try {
    const stats = {};
    for (const kind of ['oak-bare', 'poplar-bare', 'buddleia-bare']) {
      const image = makeSprayAtlas(kind, mulberry32(7), 256, null, 0).image;
      const data = image.getContext ? image.getContext('2d').getImageData(0, 0, image.width, image.height).data : image.data;
      const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
      let opaque = 0, green = 0, rust = 0, violet = 0, sx = 0, sxx = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { // the first tile
        const i = (y * 256 + x) * 4;
        if (data[i + 3] < 200) continue;
        opaque++; sx += x; sxx += x * x;
        c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255).getHSL(hsl);
        if (hsl.h > 0.17 && hsl.h < 0.45 && hsl.s > 0.25) green++;
        if (hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.2) rust++;
        if (hsl.h > 0.7 && hsl.h < 0.85 && hsl.s > 0.3) violet++;
      }
      stats[kind] = { opaque, green: green / opaque, rust: rust / opaque, violet: violet / opaque, spread: Math.sqrt(sxx / opaque - (sx / opaque) ** 2) };
      assert.ok(opaque > 200 && green / opaque < 0.02, `${kind}: no green leaf (${JSON.stringify(stats[kind])})`);
    }
    assert.ok(stats['poplar-bare'].spread < stats['oak-bare'].spread, `the poplar's shoots climb narrower than the oak's twigs spread (${stats['poplar-bare'].spread.toFixed(1)} < ${stats['oak-bare'].spread.toFixed(1)} px)`);
    assert.ok(stats['buddleia-bare'].rust > 0.2 && stats['buddleia-bare'].violet < 0.005, `the buddleia's winter panicles dry and rust-brown, no flowers (${JSON.stringify(stats['buddleia-bare'])})`);
    report.bare = stats;
  } finally {
    globalThis.document = savedDocument;
    globalThis.ImageData = savedImageData;
  }
}

// Trees lane (2026-10-05, the farmland lane's Streuobst for Frontier Basin): the meadow orchard's fruit tree — at the
// placed trees' mean scale a short trunk of 1.2-1.8 m to its scaffolds, a broad, open, rounded crown about as wide as
// it is tall; its variants the plum (young, small), the apple (in its middle years) and the pear (old, tall, upright),
// each on its own atlas tiles with its summer fruit; never forest-grown; bare in winter as the oak's crooked twigs.
{
  const SCALE = 1.325; // the placed trees' mean (vegetation.ts addTree: 0.95-1.7)
  const apple = TREE_GROWTH_PROFILES.apple;
  assert.ok(GROWTH_SPECIES.includes('apple') && apple.orchard === true, 'the fruit tree is a tree form, an orchard one');
  assert.equal(forestGrownProfile(apple), apple, 'an orchard tree never grows forest-grown');
  const shape = (variant, seed, forest = false) => {
    const sk = growTreeSkeleton('apple', mulberry32(seed), { variant, tier: 'desktop', forest });
    const stem = sk.branches[0], fork = stem.nodes[stem.nodes.length - 1].y;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, len = 0;
    for (const l of sk.leaves) { minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x); minZ = Math.min(minZ, l.z); maxZ = Math.max(maxZ, l.z); len += l.length; }
    const width = ((maxX - minX) + (maxZ - minZ)) / 2 + len / sk.leaves.length;
    return { sk, fork: fork * SCALE, height: sk.height * SCALE, width: width * SCALE, sprays: sk.leaves.length };
  };
  const mean = (variant, key) => [0, 1, 2, 3].reduce((a, k) => a + shape(variant, 5101 + variant * 13 + k * 101)[key], 0) / 4;
  for (const variant of [0, 1, 2]) {
    const fork = mean(variant, 'fork');
    assert.ok(fork >= 1.2 && fork <= 1.85, `variant ${variant}: a short trunk to the scaffolds (${fork.toFixed(2)} m)`);
    assert.deepEqual(shape(variant, 77).sk, shape(variant, 77).sk, 'the fruit tree grows deterministically');
    assert.deepEqual(shape(variant, 77, true).sk, shape(variant, 77).sk, 'in a wood too it grows open');
  }
  const [plum, appleTree, pear] = [0, 1, 2].map((v) => ({ height: mean(v, 'height'), width: mean(v, 'width'), sprays: mean(v, 'sprays') }));
  assert.ok(appleTree.width / appleTree.height > 0.8 && appleTree.width / appleTree.height < 1.15,
    `the apple's crown about as wide as the tree is tall (${appleTree.width.toFixed(1)} m by ${appleTree.height.toFixed(1)} m)`);
  assert.ok(appleTree.height > 5 && appleTree.height < 7, `the apple 5-7 m tall (${appleTree.height.toFixed(1)})`);
  assert.ok(plum.height < appleTree.height && appleTree.height < pear.height, 'the plum smallest, the pear tallest');
  assert.ok(pear.width / pear.height < appleTree.width / appleTree.height, 'the pear more upright than the apple');
  const oakSprays = [0, 1, 2, 3].reduce((a, k) => a + growTreeSkeleton('oak', mulberry32(5114 + k * 101), { variant: 1, tier: 'desktop' }).leaves.length, 0) / 4;
  assert.ok(appleTree.sprays < oakSprays * 0.8, `an open crown, its sky showing through (${appleTree.sprays.toFixed(0)} sprays against the oak's ${oakSprays.toFixed(0)})`);
  const tilesOf = (variant) => new Set(shape(variant, 91).sk.leaves.map((l) => l.tile));
  assert.deepEqual([...tilesOf(0)], [3], 'the plum on the plum tile');
  assert.deepEqual([...tilesOf(1)].sort(), [0, 1], 'the apple on the apple tiles');
  assert.deepEqual([...tilesOf(2)], [2], 'the pear on the pear tile');
  assert.equal(BARE_SPRAY_KINDS.apple, 'oak-bare', 'bare in winter, the oak\'s crooked twigs');
  // the atlas: apples with a red cheek on tiles 0 and 1, yellow-green pears on tile 2, dark plums on tile 3
  const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() { return createCanvas(1, 1); } };
  try {
    const image = makeSprayAtlas('apple', mulberry32(7), 256, null, 0).image;
    const data = image.getContext ? image.getContext('2d').getImageData(0, 0, image.width, image.height).data : image.data;
    const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 }, tiles = [];
    for (let t = 0; t < 4; t++) {
      const ox = (t % 2) * 128, oy = Math.floor(t / 2) * 128;
      let red = 0, yellow = 0, violet = 0, opaque = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const i = ((oy + y) * 256 + ox + x) * 4;
        if (data[i + 3] < 200) continue;
        opaque++;
        c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255).getHSL(hsl);
        if (hsl.h < 0.085 && hsl.s > 0.25) red++;
        if (hsl.h > 0.13 && hsl.h < 0.19 && hsl.s > 0.3) yellow++;
        if (hsl.h > 0.68 && hsl.h < 0.85 && hsl.s > 0.15) violet++;
      }
      tiles.push({ red, yellow, violet, opaque });
    }
    assert.ok(tiles[0].red + tiles[1].red > 60 && tiles[2].red + tiles[3].red < 5, `the apples' red cheeks on the apple tiles (${JSON.stringify(tiles)})`);
    assert.ok(tiles[2].yellow > 20 && tiles[2].violet < 3, `the pears yellow-green on theirs (${JSON.stringify(tiles[2])})`);
    assert.ok(tiles[3].violet > 10 && tiles[0].violet + tiles[1].violet + tiles[2].violet < 5, `the plums dark violet on theirs (${JSON.stringify(tiles[3])})`);
    report.orchard = { plum, apple: appleTree, pear, oakSprays, tiles };
  } finally {
    globalThis.document = savedDocument;
    globalThis.ImageData = savedImageData;
  }
}

console.log(JSON.stringify(report));
console.log('treeCrownShading.selftest: lobes, lobe-union normals, crown-depth shade, the billboard frame and its facing turn, the conifer apex and the dappled crown shadow PASS');
