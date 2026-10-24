// The woods catch-up (item 41, world-woods-241, 2026-10-22: trees-r9b, trees-canopy-light and ground-stand-floor ported
// by hunk onto the 10-22 tree kits). Pins the by-place table and the forms it routes, without a map build: Monsoon
// Ridge's Naga Hills forms and no palm; Wadi Rum's and the oasis's Acacia tortilis, half the savanna acacia's sprays
// under one flat umbrella, their leaflets passing two fifths of the back-lit gain; Glacier Pass's April snow on its
// spruce and its larches bare; round 8's canopy form (the forest-grown form, the open-grown form, the age's girth, the
// crowns' inner wood) on the three places whose blind critics passed it (Monsoon Ridge, Glacier Pass, Copper Mesa), every
// other place — Verdant's woods, the bar, among them, and Obsidian Caldera's, which failed — growing round 5's trees
// exactly. A construction receipt: the pictures and the cost live in the lane's captures.
import assert from 'node:assert/strict';
import {
  forestGrownProfile, GROWTH_CANOPY_FOREST_FORM, GROWTH_FOREST_FORM, GROWTH_LEAF_BUDGET, growTreeSkeleton, openGrownProfile,
  TREE_GROWTH_PROFILES,
} from './treeGrowth.ts';
import {
  TREE_BIOMES, treeBiomeBare, treeBiomeCanopyForm, treeBiomeSlot, treeBiomeSnagValue, treeBiomeSnow, treeBiomeSnowPalette,
  treeBiomeTransmission, treeBiomeWoodSpread,
} from './treeBiomes.ts';
import { getMapConfig } from './maps/index.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Monsoon Ridge: no palm planted, every slot a Naga Hills form, the shell-killed snags charred near-black
{
  const veg = getMapConfig('monsoon').vegetation;
  for (const mix of [veg.clusterMix, veg.loneMix, veg.rimMix]) assert.ok(mix.every(([sp]) => sp !== 'palm'), 'Kohima plants no palm');
  assert.ok(!veg.species.includes('palm'));
  const forms = Object.fromEntries(veg.species.map((sp) => [sp, treeBiomeSlot('monsoon', sp)?.form]));
  assert.deepEqual(forms, { eucalyptus: 'castanopsis', pine: 'khasiPine', willow: 'holmOak', oak: 'bamboo' }, JSON.stringify(forms));
  const [lo, hi] = treeBiomeSnagValue('monsoon');
  assert.ok(lo < 0.2 && hi < 0.3, 'Monsoon chars its snags near-black');
  assert.equal(treeBiomeSnagValue('verdant'), null, 'every other place keeps the charred grey');
  assert.equal(veg.standFloor, undefined, "no stand floor (item 41: dropped, its frames' bare red soil under the clumps)");
}

// Wadi Rum and the Saharan oasis: Acacia tortilis — forked near the sand, one flat thin umbrella, half the sprays
{
  for (const [mapId, slots] of [['badlands', ['acacia', 'cedar', 'oak']], ['oasis', ['acacia', 'eucalyptus']]]) {
    for (const slot of slots) assert.equal(treeBiomeSlot(mapId, slot)?.form, 'tortilis', `${mapId}: the ${slot} slot grows as Acacia tortilis`);
    assert.equal(treeBiomeTransmission(mapId), 0.4, `${mapId}: the leaflets pass two fifths of the back-lit gain`);
  }
  assert.equal(treeBiomeSlot('desert', 'eucalyptus')?.form, 'acacia', 'Sirocco keeps its savanna acacia');
  assert.equal(treeBiomeTransmission('desert'), 1, 'and the whole gain');
  const t = TREE_GROWTH_PROFILES.tortilis, a = TREE_GROWTH_PROFILES.acacia;
  assert.ok(t.envelope === 'umbrella' && t.crownR > a.crownR && t.forkAt[1] < a.forkAt[0], 'a flat umbrella forked lower than the savanna acacia');
  for (let variant = 0; variant < 3; variant++) {
    const sprays = growTreeSkeleton('tortilis', mulberry32(2001 + variant * 7), { variant, tier: 'desktop' }).leaves.length;
    assert.ok(sprays <= Math.round(GROWTH_LEAF_BUDGET.desktop * 0.5), `tortilis/${variant}: half the budget's sprays (${sprays})`);
  }
}

// Glacier Pass in April: the spruce laden and its needles a dark winter green, the larches bare; a map's own winter
// palette stays whole; a palm carries no load
{
  const snow = treeBiomeSnow('alpine');
  assert.ok(snow && snow.conifer >= 0.8 && treeBiomeBare('alpine'), 'the col under April snow, its larches bare');
  const laden = treeBiomeSnowPalette({}, 'conifer', snow);
  assert.ok(laden.snow === snow.conifer && laden.cardSat < 0.12 && laden.texTone, 'a conifer slot laden, its needles dulled');
  assert.equal(treeBiomeSnowPalette({ snow: 0.9 }, 'conifer', snow).snow, 0.9, "a map's own winter palette stays whole");
  assert.equal(treeBiomeSnowPalette({}, 'palm', snow).snow, undefined, 'a palm carries no snow');
  assert.equal(treeBiomeSnow('verdant'), null);
}

// round 8's canopy form by place: the four places that grow it, round 5's trees everywhere else
{
  const canopy = Object.keys(TREE_BIOMES).filter((id) => treeBiomeCanopyForm(id)).sort();
  // (item 41, 2026-10-23: the three places whose blind critics passed it; Obsidian Caldera's failed — its sugi grove
  // thinner, its pines spindly — and keeps round 5's woods)
  assert.deepEqual(canopy, ['alpine', 'copper_mesa', 'monsoon'], JSON.stringify(canopy));
  assert.ok(!treeBiomeCanopyForm('caldera'), "Caldera keeps round 5's woods");
  for (const id of canopy) assert.ok(treeBiomeWoodSpread(id) > 1, `${id}: its woods close (the forest form's maps)`);
  for (const id of ['verdant', 'frontier', 'reservoir', 'coastal']) assert.ok(!treeBiomeCanopyForm(id), `${id} keeps round 5's woods`);
  const oak = TREE_GROWTH_PROFILES.oak, r5 = forestGrownProfile(oak), r8 = forestGrownProfile(oak, true);
  assert.ok(Math.abs(r5.height - oak.height * GROWTH_FOREST_FORM.height) < 1e-9 && Math.abs(r5.crownR - oak.crownR * GROWTH_FOREST_FORM.crownR) < 1e-9,
    "a light-touch place's wood tree is round 5's");
  assert.deepEqual(r5.spray, oak.spray, "round 5's sprays unchanged");
  assert.ok(Math.abs(r8.crownR - oak.crownR * GROWTH_CANOPY_FOREST_FORM.crownR) < 1e-9 && r8.spray[0] > oak.spray[0], "round 8's crowns as wide as in the open, larger sprays");
  assert.ok(GROWTH_CANOPY_FOREST_FORM.crownBase < GROWTH_FOREST_FORM.crownBase, "round 8's crowns from lower on the stem");
  // the open-grown form: a broadleaf wider and lower; a conifer, a palm, an orchard tree and a clump keep their own
  const open = openGrownProfile(TREE_GROWTH_PROFILES.holmOak);
  assert.ok(open.crownR > TREE_GROWTH_PROFILES.holmOak.crownR && open.height < TREE_GROWTH_PROFILES.holmOak.height, 'an open-grown crown broad and low');
  for (const sp of ['spruce', 'palm', 'apple', 'bamboo']) assert.strictEqual(openGrownProfile(TREE_GROWTH_PROFILES[sp]), TREE_GROWTH_PROFILES[sp], `${sp}: its own form`);
  // the open-grown form and the age's girth only on a canopy place: the same skeleton as before elsewhere
  const plain = growTreeSkeleton('holmOak', mulberry32(9), { variant: 2, tier: 'desktop' });
  const asked = growTreeSkeleton('holmOak', mulberry32(9), { variant: 2, tier: 'desktop', open: true });
  assert.deepEqual(asked, plain, 'the open form needs the canopy form');
  const girth = growTreeSkeleton('holmOak', mulberry32(9), { variant: 2, tier: 'desktop', canopyForm: true });
  assert.ok(girth.branches[0].nodes[0].r > plain.branches[0].nodes[0].r, "round 8's old tree a stouter stem");
}

console.log('woodsCatchup.selftest: Monsoon\'s Naga Hills forms, Wadi Rum\'s and the oasis\'s tortilis, Glacier Pass\'s April snow, round 8 on Monsoon, Glacier and Copper Mesa PASS');
