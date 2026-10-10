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
// - Aso (Obsidian Caldera, the map-revival lane's round 2; was Las Cañadas' few open groves): sugi in closed plantation
//   blocks, the farmed floor open between them (wave 114: "low-poly shrubs spread evenly");
// - Whiteout Station (an ice sheet, wave 28): no tree, no shrub.
// And the woods those stands make keep their summer colour: Verdant's leafy birches (its pine and willow slots) tint
// their crowns as leaves, not as the bare twigs' warm grey (vegetation.ts grownTintLaw; the round-2 hand-over's frames).
// A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { createLandFieldSample } from './landUse.ts';
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
  // Wadi Rum: few trees, open groves in the low ground, no palm (the Redrock lane, round 10: the wadi's floor shows no
  // spring — the gauntlet's wave 270 read its palms as "a palm growing through a lush green acacia on open sand")
  {
    assert.equal(treeBiomeArid('badlands'), true);
    const { cfg, field, world } = produce('badlands');
    try {
      const trees = world._trees.filter(inside);
      assert.ok(trees.length < 600, `Wadi Rum's floor carries few trees (${trees.length})`);
      const sites = cfg.vegetation.palmSites ?? [];
      assert.ok(Array.isArray(cfg.vegetation.palmSites) && sites.length === 0 && cfg.vegetation.palmFallback === 'acacia', 'no spring: every palm drawn an acacia');
      assert.equal(trees.filter((t) => t.species === 'palm').length, 0, 'no palm on the wadi\'s floor');
      const groves = world._clusters.filter(inside);
      assert.ok(groves.length <= 8, `a handful of groves (${groves.length})`);
      const seated = groves.filter((c) => hollowDepth(field, c.x, c.z) >= 0.8);
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
      // (batch 4, 2026-10-06: the map-revival lane's 13 sugi blocks (ae19fa97b) are filled by the trees lane's closed
      // woods (through ba3fc82c8, round 5), so the bound counts only the floor between them: a floor tree stands beyond
      // 1.6 of every grove's outline. Measured: 151 at the lane's tip, 176 merged; the total, 707 then 1056, keeps a
      // loose backstop so a runaway producer still fails. mr3's ruling.)
      const floor = trees.filter((t) => groves.every((_, i) => world._standOutline(i, t.x, t.z) > 1.6)).length;
      assert.ok(floor < 220, `the farmed floor stays open between the groves (${floor} floor trees)`);
      assert.ok(trees.length < 1400, `the square's trees stay bounded (${trees.length} trees)`);
      let closed = 0;
      for (let i = 0; i < groves.length; i++) {
        const g = groves[i], members = trees.filter((t) => world._standOutline(i, t.x, t.z) <= 1).length;
        if (members > 2 && (Math.PI * g.r * g.r) / members <= 120) closed++;
      }
      assert.ok(closed >= groves.length * 0.75, `most blocks are closed woods (${closed} of ${groves.length})`);
      report.caldera = { trees: trees.length, floor, groves: groves.length, closed };
    } finally { world.dispose(); }
  }
  // (Copper Mesa's Arizona zoning test — juniper and pinyon on the high ground, mesquite in the washes — went with the
  // trees lane's Arizona row: the map is Queenstown under Mount Lyell since the map-revival lane's merge in batch 4,
  // 2026-10-06, and no map sets the upland hook)
  // trees round 5 (the coordinator's ruling on the gauntlet's wave 100: "conifers standing inside the brown ploughed
  // fields ... the Hessian farmland reads as savanna parkland"): on a field-system map no field tree stands in a field's
  // interior (past its grass margin, clear of a road's verge, away from a wood's edge) and no conifer form stands in the
  // open; the law moves the field trees it meets there (to a hedge, their own field's boundary, a wood's edge) and drops
  // hardly any, so the field keeps its cover. A town map's park trees keep their belts.
  for (const id of ['frontier', 'coastal', 'reservoir']) {
    const { world, field } = produce(id);
    try {
      const law = world.group.userData.fieldTreeLaw, sample = createLandFieldSample();
      assert.ok(law.moved >= 10 && law.dropped <= 2 && law.interior === 0 && law.coniferOpen === 0,
        `${id}: the field law moves its field trees off the interiors (${JSON.stringify(law)})`);
      let interior = 0, coniferOpen = 0, fieldTrees = 0;
      for (const t of world._trees) {
        if (!t.field || !inside(t)) continue;
        fieldTrees++;
        if (world._clusters.some((_, i) => world._standOutline(i, t.x, t.z) <= 1.2)) continue;
        field._landUseAt(t.x, t.z, sample);
        if (sample.active && sample.edgeM > sample.marginM + 3 && field._roadDist(t.x, t.z) > 18) interior++;
        const form = treeBiomeSlot(id, t.species)?.form ?? t.species;
        if (TREE_GROWTH_PROFILES[form]?.family === 'conifer') coniferOpen++;
      }
      assert.ok(fieldTrees > 30, `${id}: its field trees stand (${fieldTrees})`);
      assert.equal(interior, 0, `${id}: no field tree in a field's interior`);
      assert.equal(coniferOpen, 0, `${id}: no conifer form in the open`);
      report[`${id}FieldLaw`] = { moved: law.moved, dropped: law.dropped, swapped: law.swapped, open: law.open };
    } finally { world.dispose(); }
  }
  {
    const { world } = produce('urban');
    try {
      assert.equal(world.group.userData.fieldTreeLaw.moved, 0, 'a town map keeps its park trees in their belts');
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
