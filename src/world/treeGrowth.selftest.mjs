// p2 trees lane (2026-10-01): the grown near trees (treeGrowth.ts), their branch-spray atlases (treeSprayAtlas.ts) and
// their integration in vegetation.ts. Pins, per species and variant, a deterministic skeleton and geometry, the budgets
// (spray cards, wood tubes, the crown shadow hull), the structure that makes a grown tree read as one (every branch
// rooted in its parent, every spray seated on its branch, the crown inside its envelope, nothing in the ground), the
// species' silhouettes against each other, the shadow hull covering the crown, the attributes the vegetation
// materials read (styled bark UVs, aFlex, aCard, unit normals), the atlases' tiles (straight alpha, transparent
// margins, flooded padding, coverage envelopes, determinism), and the build's routing: the desktop tiers grow every
// species but the palm (and the tidal-mangrove willow form), cast each pool's shadow from its own hull, paint leaf
// sprays only where a palette opts birches into leaves, and the mobile tier and `legacyTrees` keep the legacy card
// trees. A construction receipt: no GPU, no art or frame-cost claim (those live in the lane's captures and probes).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import {
  emitBranchGeometry, emitCrownShadowHull, emitLeafCards, envelopeFraction, growTreeSkeleton, GROWTH_LEAF_BUDGET,
  GROWTH_LOWEST_WOOD_M, GROWTH_SIDE_TUBE_BUDGET, GROWTH_SPECIES, GROWTH_SPRAY_CLEARANCE_M, TREE_GROWTH_PROFILES,
  weldGrownGeometry,
} from './treeGrowth.ts';
import { finishSprayTiles, makePalmFrondAtlas, makeSprayAtlas, SPRAY_ATLAS_TILES, SPRAY_KINDS } from './treeSprayAtlas.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sha = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex').slice(0, 16);
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const finite = (g, name) => { const a = g.getAttribute(name); assert.ok(a, name); assert.ok(a.array.every(Number.isFinite), `${name} finite`); return a; };

function grow(species, variant, tier = 'desktop', seed = 2001) {
  const skeleton = growTreeSkeleton(species, mulberry32(seed + variant * 7), { variant, tier });
  const profile = TREE_GROWTH_PROFILES[species];
  const wood = emitBranchGeometry(skeleton, { tint: profile.barkTint, topTint: profile.barkTopTint, barkStyle: profile.bark, rng: mulberry32(seed ^ 0x77), tier });
  const cards = emitLeafCards(skeleton, { tint: (shade) => [0.5 + shade * 0.5, 0.6, 0.4], tiles: SPRAY_ATLAS_TILES, rng: mulberry32(seed ^ 0x99) });
  const hull = emitCrownShadowHull(skeleton);
  return { skeleton, wood, cards, hull, profile };
}

/** Distance from p to the polyline of a branch (the nearest segment). */
function distanceToBranch(branch, p) {
  let best = Infinity;
  for (let i = 1; i < branch.nodes.length; i++) {
    const a = branch.nodes[i - 1], b = branch.nodes[i];
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2));
    best = Math.min(best, Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z));
  }
  return best;
}

const rows = [];
for (const species of GROWTH_SPECIES) {
  for (let variant = 0; variant < 3; variant++) {
    const a = grow(species, variant), b = grow(species, variant);
    // deterministic: the same seed grows the same tree, byte for byte
    for (const key of ['wood', 'cards']) for (const name of Object.keys(a[key].attributes)) {
      assert.equal(sha(a[key].attributes[name].array), sha(b[key].attributes[name].array), `${species}/${variant}: ${key}.${name} deterministic`);
    }
    assert.equal(sha(a.hull), sha(b.hull), `${species}/${variant}: hull deterministic`);
    const { skeleton, wood, cards, hull, profile } = a;
    // budgets (desktop)
    const leafBudget = Math.round(GROWTH_LEAF_BUDGET.desktop * (profile.family === 'conifer' ? 1.3 : 1));
    assert.ok(skeleton.leaves.length <= leafBudget, `${species}/${variant}: ${skeleton.leaves.length} sprays within ${leafBudget}`);
    assert.equal(tris(cards), skeleton.leaves.length * 4, 'four triangles per spray card');
    const sideTubes = skeleton.branches.filter((br) => br.mesh && br.order >= 2).length;
    assert.ok(sideTubes <= GROWTH_SIDE_TUBE_BUDGET.desktop, `${species}/${variant}: ${sideTubes} side tubes`);
    assert.ok(tris(wood) <= 1400, `${species}/${variant}: wood ${tris(wood)} triangles`);
    assert.ok(hull.length / 9 <= 700, `${species}/${variant}: shadow hull ${hull.length / 9} triangles`);
    if (profile.family !== 'dead') assert.ok(skeleton.leaves.length >= 40, `${species}/${variant}: a crown of ${skeleton.leaves.length} sprays`);
    else assert.ok(skeleton.leaves.length <= 40, `${species}/${variant}: a snag keeps a few dead twig sprays (${skeleton.leaves.length})`);
    // structure: the stem from the ground; every branch rooted in its parent
    const stem = skeleton.branches[0];
    assert.equal(stem.order, 0); assert.equal(stem.parent, -1);
    assert.ok(stem.nodes[0].y <= 0 && Math.hypot(stem.nodes[0].x, stem.nodes[0].z) < 1e-6, 'the stem stands on the origin');
    skeleton.branches.forEach((branch, index) => {
      if (index === 0) return;
      const parent = skeleton.branches[branch.parent];
      assert.ok(parent && branch.parent < index, `${species}: a branch's parent grows before it`);
      assert.ok(distanceToBranch(parent, branch.nodes[0]) <= parent.nodes[0].r + 0.02, `${species}/${variant}: branch ${index} rooted on its parent`);
      for (const node of branch.nodes) assert.ok(node.y >= 0.2 && node.y <= skeleton.height + 0.6, `${species}: wood within the tree's height`);
      if (branch.mesh && branch.order === 1 && profile.form === 'excurrent') {
        assert.ok(Math.min(...branch.nodes.map((n) => n.y)) >= GROWTH_LOWEST_WOOD_M - 1e-6, `${species}: no limb wood in the stem's collision band`);
      }
    });
    // every spray seated on a branch (its seat within the branch's tube plus a centimetre)
    for (const site of skeleton.leaves) {
      let seat = Infinity;
      for (const branch of skeleton.branches) seat = Math.min(seat, distanceToBranch(branch, site));
      assert.ok(seat < 0.05, `${species}/${variant}: spray seated on its branch (${seat.toFixed(3)} m off)`);
      assert.ok(Math.abs(Math.hypot(site.ax, site.ay, site.az) - 1) < 1e-6 && Math.abs(Math.hypot(site.nx, site.ny, site.nz) - 1) < 1e-6);
      assert.ok(Math.abs(site.ax * site.nx + site.ay * site.ny + site.az * site.nz) < 1e-6, 'the face is perpendicular to the axis');
    }
    // nothing in the ground: the cards end over it (a rolled card's edge may dip a hand's breadth)
    const cp = finite(cards, 'position');
    let cardMin = Infinity, cardMaxR = 0;
    for (let i = 0; i < cp.count; i++) { cardMin = Math.min(cardMin, cp.getY(i)); cardMaxR = Math.max(cardMaxR, Math.hypot(cp.getX(i), cp.getZ(i))); }
    if (cp.count) assert.ok(cardMin >= -0.3, `${species}/${variant}: sprays end over the ground (${cardMin.toFixed(2)})`);
    // attributes the materials read
    const n = finite(cards, 'normal'); finite(cards, 'uv'); finite(cards, 'color'); finite(cards, 'aFlex');
    const card = finite(cards, 'aCard');
    for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5, 'unit card normals');
    for (let i = 0; i < card.count; i++) assert.ok(card.getW(i) > 0.5, 'the cascade sample reaches the crown radius');
    const wp = finite(wood, 'position'); finite(wood, 'normal'); finite(wood, 'color'); finite(wood, 'aFlex');
    const wuv = finite(wood, 'uv');
    for (let i = 0; i < wuv.count; i++) {
      const style = Math.floor((wuv.getX(i) - 2) / 2);
      assert.equal(style, profile.bark, `${species}: every grown bark face selects its style (u ${wuv.getX(i)})`);
    }
    assert.equal(wood.index, null, 'flat wood (the pool merges it with the flare and roots)');
    // the hull covers the crown: most spray centres fall inside its bounding box
    const hb = new THREE.Box3();
    for (let i = 0; i < hull.length; i += 3) hb.expandByPoint(new THREE.Vector3(hull[i], hull[i + 1], hull[i + 2]));
    const inside = skeleton.leaves.filter((l) => hb.containsPoint(new THREE.Vector3(l.x + l.ax * l.length * 0.45, l.y + l.ay * l.length * 0.45, l.z + l.az * l.length * 0.45))).length;
    if (skeleton.leaves.length) assert.ok(inside / skeleton.leaves.length >= 0.85, `${species}/${variant}: the hull covers ${inside}/${skeleton.leaves.length} sprays`);
    rows.push({ species, variant, height: +skeleton.height.toFixed(2), sprays: skeleton.leaves.length, branches: skeleton.branches.length,
      woodTris: tris(wood), cardTris: tris(cards), hullTris: hull.length / 9, crownR: +cardMaxR.toFixed(2), wood: sha(wp.array) });
    // the mobile budgets
    const m = grow(species, variant, 'mobile');
    assert.ok(m.skeleton.leaves.length <= Math.round(GROWTH_LEAF_BUDGET.mobile * (profile.family === 'conifer' ? 1.3 : 1)), `${species}: mobile sprays`);
    assert.ok(tris(m.wood) <= tris(wood) + 1, `${species}/${variant}: the mobile wood is no heavier`);
  }
}

// silhouettes: the species read apart from their crowns' proportions (width / height of the spray cloud, averaged)
const shape = {};
for (const species of GROWTH_SPECIES.filter((sp) => sp !== 'snag')) {
  let w = 0, h = 0, low = 0;
  for (let variant = 0; variant < 3; variant++) {
    const { skeleton } = grow(species, variant);
    let maxR = 0, minY = Infinity, maxY = -Infinity;
    for (const l of skeleton.leaves) { maxR = Math.max(maxR, Math.hypot(l.x, l.z)); minY = Math.min(minY, l.y); maxY = Math.max(maxY, l.y); }
    w += 2 * maxR; h += maxY - minY; low += minY / skeleton.height;
  }
  shape[species] = { aspect: +(w / h).toFixed(2), crownBase: +(low / 3).toFixed(2) };
}
assert.ok(shape.cypress.aspect < 0.45 && shape.poplar.aspect < 0.75, `the columns are narrow (${JSON.stringify([shape.cypress, shape.poplar])})`);
assert.ok(shape.acacia.aspect > 1.6 && shape.cedar.aspect > shape.spruce.aspect, 'the umbrella and the cedar tiers are broad');
assert.ok(shape.spruce.crownBase < 0.2 && shape.fir.crownBase < 0.2, 'the spruce and fir crowns reach down to the ground');
assert.ok(shape.pine.crownBase > 0.4 && shape.eucalyptus.crownBase > 0.3, 'the pine and the eucalyptus stand on long clear boles');
assert.ok(shape.oak.aspect > shape.poplar.aspect * 1.6, 'the oak spreads where the poplar rises');
// the envelopes narrow the way the species do
assert.ok(envelopeFraction('cone', 0.9) < envelopeFraction('cone', 0.2) && envelopeFraction('column', 0.5) > 0.9);
// the snag: a broken stem, dead limbs (some snapped), a few dead twig sprays and no sprays on a snapped limb
{
  const { skeleton } = grow('snag', 1);
  assert.ok(skeleton.branches[0].broken, 'the stem is snapped');
  for (const site of skeleton.leaves) {
    const owner = skeleton.branches.filter((b) => !b.broken).some((b) => distanceToBranch(b, site) < 0.05);
    assert.ok(owner, 'dead twigs seat on unbroken limbs only');
  }
}

// the spray atlases (native canvas)
const priorDocument = globalThis.document, priorImageData = globalThis.ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
globalThis.ImageData = ImageData;
const atlasRows = [];
try {
  for (const kind of SPRAY_KINDS) {
    const t = makeSprayAtlas(kind, mulberry32(2052), 256), again = makeSprayAtlas(kind, mulberry32(2052), 256);
    assert.ok(t.image instanceof ImageData, 'straight-alpha ImageData upload');
    assert.equal(t.colorSpace, THREE.SRGBColorSpace); assert.equal(t.anisotropy, 8); assert.equal(t.generateMipmaps, true);
    assert.equal(sha(t.image.data), sha(again.image.data), `${kind}: deterministic pixels`);
    const d = t.image.data, s = t.image.width, S = s / SPRAY_ATLAS_TILES;
    let covered = 0, black = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= 97) covered++;
      if (d[i + 3] < 24 && d[i] + d[i + 1] + d[i + 2] < 30) black++;
    }
    // the tile borders are transparent (the deep mips cannot close the card into a rectangle)
    for (let ty = 0; ty < SPRAY_ATLAS_TILES; ty++) for (let tx = 0; tx < SPRAY_ATLAS_TILES; tx++) {
      for (const [x, y] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1], [S >> 1, 0]]) {
        assert.equal(d[((ty * S + y) * s + tx * S + x) * 4 + 3], 0, `${kind}: tile ${tx},${ty} margin transparent`);
      }
    }
    assert.equal(black, 0, `${kind}: the empty texels carry the tile's leaf tone, never black`);
    const coverage = covered / (s * s);
    const [lo, hi] = kind === 'birch-bare' ? [0.04, 0.3] : [0.08, 0.45];
    assert.ok(coverage >= lo && coverage <= hi, `${kind}: coverage ${coverage.toFixed(3)} in [${lo}, ${hi}]`);
    atlasRows.push({ kind, coverage: +coverage.toFixed(3), pixels: sha(d) });
    t.dispose(); again.dispose();
  }
  // the desktop palm's pinnate frond (one frond across the texture, its rachis rising from the bottom centre)
  {
    const t = makePalmFrondAtlas(mulberry32(2053), 256), again = makePalmFrondAtlas(mulberry32(2053), 256);
    assert.equal(sha(t.image.data), sha(again.image.data), 'palm frond: deterministic pixels');
    const d = t.image.data, s = t.image.width;
    let covered = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] >= 97) covered++;
    assert.ok(covered / (s * s) > 0.2 && covered / (s * s) < 0.7, `palm frond coverage ${(covered / (s * s)).toFixed(3)}: leaflets with gaps, not a solid blade`);
    assert.ok(d[((s - 3) * s + (s >> 1)) * 4 + 3] > 200, 'the rachis meets the strip base');
    assert.equal(d[3], 0, 'the frond leaves its corners open');
    let gaps = 0;
    for (let x = 0; x < s; x++) if (d[((s >> 1) * s + x) * 4 + 3] < 24) gaps++;
    assert.ok(gaps > s * 0.08, `a pinnate frond's mid row carries gaps between its leaflets (${gaps})`);
    atlasRows.push({ kind: 'palm-frond', coverage: +(covered / (s * s)).toFixed(3), pixels: sha(d) });
    t.dispose(); again.dispose();
  }
  // the finishing law on a synthetic tile: a solid tile keeps its centre and loses its border
  const S = 32, s = 64, px = new Uint8ClampedArray(s * s * 4).fill(255);
  finishSprayTiles(px, s, S, 2);
  assert.equal(px[((16) * s + 16) * 4 + 3], 255, 'the tile centre keeps its alpha');
  assert.equal(px[3], 0, 'the tile corner falls to zero');
} finally {
  if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
  if (priorImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = priorImageData;
}

// the weld: the same triangle list (every corner's every attribute) from fewer vertices, deterministic, idempotent
{
  const corners = (g) => {
    const out = {};
    for (const [name, a] of Object.entries(g.attributes)) {
      const idx = g.index?.array, n = idx ? idx.length : a.count, arr = new Float32Array(n * a.itemSize);
      for (let i = 0; i < n; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.array[(idx ? idx[i] : i) * a.itemSize + c];
      out[name] = sha(arr);
    }
    return out;
  };
  for (const species of ['oak', 'spruce', 'birch', 'snag']) {
    const { wood, cards } = grow(species, 1);
    for (const flat of [wood, cards]) {
      const welded = weldGrownGeometry(flat);
      assert.ok(welded.index, `${species}: the weld indexes`);
      assert.deepEqual(corners(welded), corners(flat), `${species}: the welded triangle list is the flat one`);
      assert.ok(welded.getAttribute('position').count <= flat.getAttribute('position').count * 0.55, `${species}: the weld shares vertices`);
      assert.equal(weldGrownGeometry(welded), welded, 'an indexed geometry passes through');
      assert.equal(sha(weldGrownGeometry(flat).index.array), sha(welded.index.array), 'the weld is deterministic');
    }
  }
}

// the integration: the real build on the desktop tier (no renderer), then legacyTrees, then the mobile tier
{
  const { createHeightField } = await import('./terrain.ts');
  const V = await import('./vegetation.ts');
  const { getMapConfig } = await import('./maps/index.ts');
  const quality = await import('../engine/quality.ts');
  const { disposeObject3DResources } = await import('../engine/resourceLifetime.ts');
  const canvas = () => {
    const saved = [globalThis.document, globalThis.ImageData];
    globalThis.document = { createElement: () => createCanvas(1, 1) }; globalThis.ImageData = ImageData;
    return () => { if (saved[0] === undefined) delete globalThis.document; else globalThis.document = saved[0]; if (saved[1] === undefined) delete globalThis.ImageData; else globalThis.ImageData = saved[1]; };
  };
  // the leaf opt-in: autumn's birches and aspens paint leaves, every other map's birches stay bare twigs
  assert.equal(V.grownSprayKind('birch', getMapConfig('autumn').vegetation.palettes.birch), 'birch');
  assert.equal(V.grownSprayKind('aspen', getMapConfig('autumn').vegetation.palettes.aspen), 'aspen');
  assert.equal(V.grownSprayKind('birch', {}), 'birch-bare');
  assert.equal(V.grownSprayKind('spruce', {}), 'spruce');
  const build = (id, extra = {}) => {
    const restore = canvas();
    try {
      const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
      return V.createVegetation(field, { setupShadowMaterial() {} }, 2001, { ...cfg, vegetation: { ...cfg.vegetation, ...extra } });
    } finally { restore(); }
  };
  const pools = (world) => world.group.children.filter((m) => m.isInstancedMesh && (m.userData.treeTrunk || m.userData.treeFoliage || m.userData.treeCanopyShadowProxy) && m.userData.treeLod !== 'far');
  // the bark sheet: four 256-column styles for the grown trees, the legacy single sheet everywhere else
  const barkWidth = (world) => pools(world).find((m) => m.userData.treeTrunk).material.map.image.width;
  // the bark sheet's first 256-column block (the furrowed sheet the legacy trunks read), as pixels
  const barkBlock0 = (world) => { const img = pools(world).find((m) => m.userData.treeTrunk).material.map.image;
    return sha(img.getContext('2d').getImageData(0, 0, 256, 256).data); };
  let desktopBlock0 = null;
  const desktop = build('fjord');
  try {
    assert.equal(V.vegetationGrowsTrees(), true);
    assert.equal(barkWidth(desktop), 1024, 'the grown trees read the four-style bark sheet');
    desktopBlock0 = barkBlock0(desktop);
    const meshes = pools(desktop);
    const trunks = meshes.filter((m) => m.userData.treeTrunk), proxies = meshes.filter((m) => m.userData.treeCanopyShadowProxy);
    assert.equal(proxies.length, trunks.length, 'one shadow proxy per near pool');
    for (const trunk of trunks) {
      const hull = trunk.geometry.userData.shadowHull;
      assert.ok(hull instanceof Float32Array && hull.length > 0, 'a grown trunk carries its crown hull');
      // the proxy is the hull welded (indexed): expanded through its index it is the hull's triangle list
      const expanded = (g) => { const p = g.attributes.position.array, idx = g.index?.array; if (!idx) return p;
        const out = new Float32Array(idx.length * 3); for (let i = 0; i < idx.length; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = p[idx[i] * 3 + k]; return out; };
      const proxy = proxies.find((p) => {
        if (!p.name.startsWith('treeCanopyShadow_')) return false;
        const e = expanded(p.geometry);
        return e.length === hull.length && e.every((v, i) => Math.abs(v - hull[i]) <= 1e-4);
      });
      assert.ok(proxy, 'the pool casts its own hull');
      assert.ok(proxy.geometry.index && proxy.geometry.attributes.position.count < hull.length / 3 * 0.5, 'the hull is welded');
      assert.ok(trunk.geometry.index && meshes.find((m) => m.userData.treeFoliage)?.geometry.index, 'the grown wood and cards are welded');
      assert.equal(trunk.castShadow, false, 'the trunk casts through the proxy');
    }
    for (const cards of meshes.filter((m) => m.userData.treeFoliage)) {
      assert.ok(cards.geometry.getAttribute('aCard'), 'grown cards carry the cascade sample');
      assert.equal(cards.castShadow, false);
    }
  } finally { desktop.dispose(); disposeObject3DResources(desktop.group); }
  // legacyTrees: the legacy card trees and lobe-hull proxies
  const legacy = build('fjord', { legacyTrees: true });
  try {
    for (const trunk of pools(legacy).filter((m) => m.userData.treeTrunk)) assert.equal(trunk.geometry.userData.shadowHull, undefined, 'legacy trunks carry no hull');
    assert.equal(barkWidth(legacy), 256, 'a legacy build keeps its single bark sheet');
    assert.equal(barkBlock0(legacy), desktopBlock0, 'the four-style sheet opens with the single sheet, pixel for pixel');
  } finally { legacy.dispose(); disposeObject3DResources(legacy.group); }
  // the mobile tier (resolved once, last): the legacy trees
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  quality.resolveDeviceTier();
  assert.equal(quality.getDeviceTier(), 'mobile');
  assert.equal(V.vegetationGrowsTrees(), false);
  const mobile = build('fjord');
  try {
    for (const trunk of pools(mobile).filter((m) => m.userData.treeTrunk)) assert.equal(trunk.geometry.userData.shadowHull, undefined, 'the phones keep the legacy trees');
    assert.equal(barkWidth(mobile), 256, 'the phones pay for no unused bark styles');
  } finally { mobile.dispose(); disposeObject3DResources(mobile.group); delete globalThis.window; }
}

console.log(JSON.stringify({ shape, atlas: atlasRows, budgets: rows.map((r) => [r.species, r.variant, r.sprays, r.woodTris, r.cardTris, r.hullTris]) }));
console.log(`treeGrowth.selftest: ${GROWTH_SPECIES.length} species × 3 variants grown deterministically within budget, rooted, seated and enveloped; silhouettes apart; ${SPRAY_KINDS.length} spray atlases; desktop / legacyTrees / mobile routing PASS`);
