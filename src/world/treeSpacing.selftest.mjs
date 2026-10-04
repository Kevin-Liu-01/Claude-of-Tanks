// Trees round 2b (2026-10-03, the gauntlet's wave 15: "trees scattered at even, savanna-like spacing, palms included,
// whatever the place", "lush green groves on Wadi Rum"): where the trees stand (vegetation.ts placeTreeClusters,
// placeLoneTrees, palmSites; treeBiomes.ts arid). On the real seeded producers:
// - Verdant (a temperate field map): the lone trees no longer scatter evenly over the open field; most stand at a
//   woodlot's edge (just outside its outline) or along a road's verge; round 3 (wave 31: "trees stand singly like
//   savanna; real places have closed woods, groves, shelterbelts and hedgerow lines"): the woods' canopies close over
//   most of their ground, and the field trees stand in groups and lines, hardly a single one alone;
// - Redrock Divide (Wadi Rum): open groves seated in the low ground, few trees, and its palms at the springs only;
// - Sirocco Wadi and Sunscar Oasis: every palm inside the map's palm sites (the wadi bed, the oasis), palm stands
//   seated there; Sirocco's trees few, and its border's in the low ground or at the water (wave 26: "a lone lollipop
//   broadleaf ... on the foreground dune");
// - Las Cañadas (Obsidian Caldera): a floor nearly bare of trees — a few open groves and scattered pines (wave 26:
//   "evenly spaced, grid-like" stands);
// - Copper Mesa (the Arizona uplands, wave 28: "green broadleaf and fir clumps on sand"): juniper and pinyon on the
//   higher ground only, mesquite in the low ground only, few of either;
// - Whiteout Station (an ice sheet, wave 28): no tree, no shrub.
// And the woods those stands make keep their summer colour: Verdant's leafy birches (its pine and willow slots) tint
// their crowns as leaves, not as the bare twigs' warm grey (vegetation.ts grownTintLaw; the round-2 hand-over's frames).
// A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeArid, treeBiomeSlot } from './treeBiomes.ts';
import { TREE_GROWTH_PROFILES } from './treeGrowth.ts';

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
      // round 3: the woods' canopy closes (the crowns over 60 % of a wood's ground; 45 % in round 2b, a parkland)
      let ground = 0, shaded = 0;
      const cells = new Map(), cellOf = (x, z) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
      for (const t of world._trees) { const k = cellOf(t.x, t.z); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
      clusters.forEach((c, i) => {
        for (let x = c.x - c.r * 1.5; x <= c.x + c.r * 1.5; x += 2) for (let z = c.z - c.r * 1.5; z <= c.z + c.r * 1.5; z += 2) {
          if (world._standOutline(i, x, z) > 1) continue;
          ground++;
          const gx = Math.floor(x / 10), gz = Math.floor(z / 10);
          let under = false;
          for (let dx = -1; dx <= 1 && !under; dx++) for (let dz = -1; dz <= 1 && !under; dz++) {
            for (const t of cells.get(`${gx + dx},${gz + dz}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < t.cr) { under = true; break; }
          }
          if (under) shaded++;
        }
      });
      assert.ok(shaded / ground > 0.6, `the woods' canopy closes (${(shaded / ground * 100).toFixed(0)} % of their ground)`);
      // round 3: hardly a field tree stands alone (no other tree within 12 m: 10 % of the open trees in round 2b)
      const alone = open.filter((t) => {
        const gx = Math.floor(t.x / 10), gz = Math.floor(t.z / 10);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          for (const o of cells.get(`${gx + dx},${gz + dz}`) ?? []) if (o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 12) return false;
        }
        return true;
      });
      assert.ok(alone.length / open.length < 0.06, `the field trees stand in groups (${alone.length} of ${open.length} alone)`);
      // round 3b: a closed wood's interior meets the far tier sooner (the wood's edge in front of it): its trees carry a
      // near scale, none outside its heart
      const interior = world._trees.filter((t) => t.nearScale !== undefined);
      assert.ok(interior.length > trees.length * 0.25, `the woods' interiors take the far tier sooner (${interior.length} of ${trees.length})`);
      for (const t of interior) {
        assert.ok(t.nearScale > 0.4 && t.nearScale < 1, 'a share of the full-detail radius');
        assert.ok(clusters.some((_, i) => world._standOutline(i, t.x, t.z) < 0.75), 'only a wood\'s interior');
      }
      report.verdant = { trees: trees.length, open: open.length, alone: alone.length, closure: +(shaded / ground).toFixed(2), birchPools: birchTints.length };
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
  // Las Cañadas: a few open groves, scattered pines, the broom carrying the floor
  {
    const { world } = produce('caldera');
    try {
      const trees = world._trees.filter(inside), groves = world._clusters;
      assert.ok(trees.length < 250, `the caldera floor carries few trees (${trees.length})`);
      assert.ok(groves.length <= 6, `a few groves (${groves.length})`);
      // open: a grove's trees over twice a wood's ground each (the woodlots' 48-84 m² a tree)
      for (let i = 0; i < groves.length; i++) {
        const g = groves[i], members = trees.filter((t) => world._standOutline(i, t.x, t.z) <= 1).length;
        assert.ok(members > 2 && (Math.PI * g.r * g.r) / members > 90, `grove ${i} is open (${members} trees on ${(Math.PI * g.r * g.r).toFixed(0)} m²)`);
      }
      report.caldera = { trees: trees.length, groves: groves.length };
    } finally { world.dispose(); }
  }
  // Copper Mesa: each form in its zone of the square's heights (the top two fifths for the juniper and the pinyon, the
  // bottom two fifths for the mesquite), every tree past the square's edge too
  {
    const { field, world } = produce('copper_mesa');
    try {
      const heights = [];
      for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) heights.push(field.getHeightAt(x, z));
      heights.sort((a, b) => a - b);
      const low = heights[Math.floor(heights.length * 0.4)], high = heights[Math.floor(heights.length * 0.6)];
      const zoned = { conifer: 0, broadleaf: 0 };
      for (const t of world._trees) {
        if (t.species === 'snag') continue;
        const form = treeBiomeSlot('copper_mesa', t.species)?.form ?? t.species;
        const conifer = TREE_GROWTH_PROFILES[form].family === 'conifer', h = field.getHeightAt(t.x, t.z);
        assert.ok(conifer ? h >= high - 1e-6 : h <= low + 1e-6,
          `${form} in its zone (${h.toFixed(1)} m; the low ground under ${low.toFixed(1)}, the high over ${high.toFixed(1)})`);
        zoned[conifer ? 'conifer' : 'broadleaf']++;
      }
      assert.ok(zoned.conifer >= 20 && zoned.broadleaf >= 20, `both zones grow (${JSON.stringify(zoned)})`);
      assert.ok(world._trees.filter(inside).length < 300, `the mine's uplands carry few trees (${world._trees.filter(inside).length})`);
      report.copper_mesa = zoned;
    } finally { world.dispose(); }
  }
  // Whiteout Station: the ice sheet grows nothing
  {
    const { world } = produce('whiteout');
    try {
      assert.equal(world._trees.length, 0, 'no tree on the ice');
      assert.equal(world.concealers.length, 0, 'no shrub on the ice (no foliage concealment at all)');
      report.whiteout = { trees: 0 };
    } finally { world.dispose(); }
  }
  console.log(`treeSpacing.selftest: ${JSON.stringify(report)} PASS`);
} finally {
  globalThis.document = savedDocument;
  globalThis.ImageData = savedImageData;
}
