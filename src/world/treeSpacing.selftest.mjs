// Trees round 2b (2026-10-03, the gauntlet's wave 15: "trees scattered at even, savanna-like spacing, palms included,
// whatever the place", "lush green groves on Wadi Rum"): where the trees stand (vegetation.ts placeTreeClusters,
// placeLoneTrees, palmSites; treeBiomes.ts arid). On the real seeded producers:
// - Verdant (a temperate field map): the lone trees no longer scatter evenly over the open field; most stand at a
//   woodlot's edge (just outside its outline) or along a road's verge;
// - Redrock Divide (Wadi Rum): open groves seated in the low ground, few trees, and its palms at the springs only;
// - Sirocco Wadi and Sunscar Oasis: every palm inside the map's palm sites (the wadi bed, the oasis), palm stands
//   seated there; Sirocco's trees few, and its border's in the low ground or at the water (wave 26: "a lone lollipop
//   broadleaf ... on the foreground dune");
// - Aso (Obsidian Caldera, the map-revival lane's round 2; was Las Cañadas' few open groves): sugi in closed plantation
//   blocks, the farmed floor open between them (wave 114: "low-poly shrubs spread evenly").
// And the woods those stands make keep their summer colour: Verdant's leafy birches (its pine and willow slots) tint
// their crowns as leaves, not as the bare twigs' warm grey (vegetation.ts grownTintLaw; the round-2 hand-over's frames).
// A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeArid } from './treeBiomes.ts';

const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement() { return createCanvas(1, 1); } };

const inside = (t) => Math.max(Math.abs(t.x), Math.abs(t.z)) < 455;
const report = {};
function produce(id) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  return { cfg, field, world: createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg) };
}
const hollowDepth = (field, x, z) => {
  let mean = 0;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mean += field.getHeightAt(x + Math.cos(a) * 30, z + Math.sin(a) * 30); }
  return mean / 8 - field.getHeightAt(x, z);
};

try {
  // Verdant: the field trees gather at the woods' edges and the roads (a stand's outline fraction under 1.6, or a
  // verge); an even scatter would leave most of them out in the open
  {
    const { world } = produce('verdant');
    try {
      const trees = world._trees.filter(inside);
      const clusters = world._clusters;
      const nearWood = (t) => clusters.some((_, i) => world._standOutline(i, t.x, t.z) < 1.6);
      const open = trees.filter((t) => !nearWood(t));
      assert.ok(trees.length > 2000, `Verdant keeps its woods (${trees.length} trees)`);
      // (the open set keeps the road-verge trees, the true singles and the map's belts: 11.6 % on 2026-10-03, ~14 % with
      // the round-1 scatter's lone trees out in the field)
      assert.ok(open.length / trees.length < 0.13, `the open field holds few trees (${open.length} of ${trees.length})`);
      // the birch crowns in leaf: each near crown's mean card tint is green (the twigs' law left them olive-brown)
      const birchTints = [];
      world.group.traverse((o) => {
        if (!o.userData?.treeFoliage || o.material?.map?.name !== 'sprayAtlas:birch') return;
        const c = o.geometry.getAttribute('color');
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < c.count; i++) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); }
        birchTints.push([r / c.count, g / c.count, b / c.count]);
      });
      assert.ok(birchTints.length >= 2, `Verdant grows leafy birch crowns (${birchTints.length} pools)`);
      for (const [r, g, b] of birchTints) assert.ok(g > r * 1.2 && g > b, `a leafy birch crown tints green (${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`);
      report.verdant = { trees: trees.length, open: open.length, birchPools: birchTints.length };
    } finally { world.dispose(); }
  }
  // Wadi Rum: few trees, open groves in the low ground, palms at the springs only
  {
    assert.equal(treeBiomeArid('badlands'), true);
    const { cfg, field, world } = produce('badlands');
    try {
      const trees = world._trees.filter(inside);
      assert.ok(trees.length < 600, `Wadi Rum's floor carries few trees (${trees.length})`);
      const sites = cfg.vegetation.palmSites;
      assert.ok(sites?.length === 2, 'two springs');
      for (const t of trees) if (t.species === 'palm') assert.ok(sites.some((s) => Math.hypot(t.x - s.x, t.z - s.z) < s.r), 'a palm at a spring');
      const groves = world._clusters.filter(inside);
      assert.ok(groves.length <= 8, `a handful of groves (${groves.length})`);
      const seated = groves.filter((c) => hollowDepth(field, c.x, c.z) >= 0.8 || sites.some((s) => Math.hypot(c.x - s.x, c.z - s.z) < s.r));
      assert.equal(seated.length, groves.length, 'every grove in the low ground or at a spring');
      report.badlands = { trees: trees.length, groves: groves.length, palms: trees.filter((t) => t.species === 'palm').length };
    } finally { world.dispose(); }
  }
  // the Sahara's wadi and oasis: every palm inside the map's palm sites, and palms there (the date-palm groves)
  for (const id of ['desert', 'oasis']) {
    const { cfg, field, world } = produce(id);
    try {
      const sites = cfg.vegetation.palmSites;
      assert.ok(sites?.length > 0, `${id}: palm sites named`);
      const palms = world._trees.filter((t) => inside(t) && t.species === 'palm');
      const stray = palms.filter((t) => !sites.some((s) => Math.hypot(t.x - s.x, t.z - s.z) < s.r));
      assert.equal(stray.length, 0, `${id}: no palm outside the palm sites (${stray.length} of ${palms.length})`);
      assert.ok(palms.length >= 10, `${id}: the palm groves stand (${palms.length} palms)`);
      report[id] = { palms: palms.length };
      if (id === 'desert') {
        const trees = world._trees.filter(inside);
        assert.ok(trees.length < 400, `Sirocco's wadi carries few trees (${trees.length})`);
        // the border's trees (past the playable square) stand in the low ground or at the water, never on a dune
        const border = world._trees.filter((t) => !inside(t));
        for (const t of border) {
          assert.ok(hollowDepth(field, t.x, t.z) >= 1.2 || sites.some((s) => Math.hypot(t.x - s.x, t.z - s.z) < s.r),
            `a border tree in the low ground (${t.species} at ${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
        }
        Object.assign(report[id], { trees: trees.length, border: border.length });
      }
    } finally { world.dispose(); }
  }
  // Aso: a dozen or so sugi blocks, most of them closed woods (a wood's members over its ground no sparser than 120 m² a
  // tree on its bounding radius — an open grove is past it), the farmed floor open between them
  {
    const { world } = produce('caldera');
    try {
      const trees = world._trees.filter(inside), groves = world._clusters;
      assert.ok(groves.length >= 8 && groves.length <= 16, `a dozen or so sugi blocks (${groves.length})`);
      assert.ok(trees.length < 1000, `the farmed floor stays open between them (${trees.length} trees)`);
      let closed = 0;
      for (let i = 0; i < groves.length; i++) {
        const g = groves[i], members = trees.filter((t) => world._standOutline(i, t.x, t.z) <= 1).length;
        if (members > 2 && (Math.PI * g.r * g.r) / members <= 120) closed++;
      }
      assert.ok(closed >= groves.length * 0.75, `most blocks are closed woods (${closed} of ${groves.length})`);
      report.caldera = { trees: trees.length, groves: groves.length, closed };
    } finally { world.dispose(); }
  }
  console.log(`treeSpacing.selftest: ${JSON.stringify(report)} PASS`);
} finally {
  globalThis.document = savedDocument;
  globalThis.ImageData = savedImageData;
}
