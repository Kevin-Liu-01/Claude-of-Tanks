// src/world/hinterland/drafts/copper_mesa.ts — Copper Mesa Mine's hinterland (the horizons stream, 2026-10-16;
// C-map-briefs §19), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics
// find this strictly better. The ring drew "a giant pale beige surface ... like a wall round the world" in the Naga
// Hills' ridges class; the real place is a mining town in a valley under two bare mountains, with dark wet ranges west.
//
// Queenstown under Mount Lyell, on Tasmania's west coast, in 1976: the Mount Lyell company's town in the Queen River's
// valley, the hills round it stripped by eighty years of smelter fumes, cutting and rain to pink, ochre and grey
// conglomerate, gullied to the bone. Standing there: east, Mount Owen (~1,150 m) straight over the town, ~1,000 m above
// it 3-4 km out, bare and gullied; north-east Mount Lyell (~1,200 m) with the West Lyell open cut's benches on its flank,
// Gormanston's cottages and the Iron Blow on the Linda saddle between them, headframes over the shafts; north Mount
// Sedgwick, the Tyndall Range behind, the pipeline and line from Lake Margaret; west the Queen River running down to the
// King River's valley, then dark buttongrass and rainforest ranges under the west-coast cloud; south Mount Jukes and
// Mount Huxley's dark shoulders, Mount Darwin beyond.
import type { HinterlandConfig } from '../spec.ts';

/** The stripped conglomerate: pink-mauve grey with ochre (sceneryRocks' breccia, the map's CONGLOMERATE). */
const LYELL_ROCK = 0xb08f86;
/** The wet ranges' faces under buttongrass, cutting grass and rainforest: a dark olive, not the stripped pink (the
 * region's rock stands bare past ~20°, so the ranges' steep faces take this tone; one long bed, no banding). */
const RAINFOREST = { rockHex: 0x39432f, strata: { bedM: 2000 } };
/** Sedgwick's and Tyndall's quartzite tops over their scrub: a darker grey-green. */
const RANGE_TOPS = { rockHex: 0x55584a, strata: { bedM: 2000 } };

const DRAFT: HinterlandConfig = {
  place: 'Queenstown under Mount Lyell, west coast of Tasmania, 1976: the mining town in the Queen River valley, the hills '
    + 'round it stripped bare and gullied to pink and ochre conglomerate; Mount Owen and Mount Lyell ~1,000 m over it with '
    + 'the open cuts and Gormanston on the saddle; dark rainforest ranges west and south under the cloud',
  region: 'tasmanianMine',
  lab: true,
  outland: {
    // (the woods on the ranges' gentler ground, in their altitude band: the stripped hills round the town stay bare)
    woods: 0.5, hedges: 0, fields: 0, links: 2,
    settle: {
      villages: 1, hamlets: 2, farms: 1, works: 2, town: null,
      villagesAt: [{ azDeg: 64, distM: 3900, name: 'Gormanston', buildings: 30 }],
    },
  },
  landforms: [
    // east: Mount Owen, a long bare massif over the town, its summits along a north-south crest, gullied to the bone
    { kind: 'massif', at: { azDeg: 106, distM: 3600 }, heightM: 1000, lengthM: 5600, widthM: 4000, strikeDeg: 8, name: 'Mount Owen',
      geology: { rockHex: LYELL_ROCK, gullies: 1, erosion: 0.85 }, cover: { bare: true } },
    // north-east: Mount Lyell, its crest beyond the Linda saddle
    { kind: 'massif', at: { azDeg: 42, distM: 5300 }, heightM: 1050, lengthM: 5000, widthM: 3600, strikeDeg: 20, name: 'Mount Lyell',
      geology: { rockHex: LYELL_ROCK, gullies: 1, erosion: 0.85 }, cover: { bare: true } },
    // the Linda saddle between them, Gormanston and the Iron Blow on it
    { kind: 'ridge', at: { azDeg: 66, distM: 4300 }, heightM: 270, lengthM: 2600, widthM: 1800, strikeDeg: 150, name: 'the Linda saddle',
      geology: { rockHex: LYELL_ROCK, gullies: 0.9 }, cover: { bare: true } },
    // the open cuts: West Lyell's benches on Lyell's south-west flank, the Iron Blow on the saddle
    { kind: 'canyon', at: { azDeg: 47, distM: 3500 }, heightM: 170, lengthM: 1100, widthM: 800, strikeDeg: 45, name: 'the West Lyell open cut' },
    { kind: 'canyon', at: { azDeg: 62, distM: 4050 }, heightM: 60, lengthM: 420, widthM: 320, strikeDeg: 60, name: 'the Iron Blow' },
    // north: Mount Sedgwick, the Tyndall Range behind
    { kind: 'massif', at: { azDeg: 12, distM: 9000 }, heightM: 880, lengthM: 6000, widthM: 4200, strikeDeg: 100, name: 'Mount Sedgwick',
      geology: { gullies: 0.8, ...RANGE_TOPS }, cover: { forest: [0, 520] } },
    { kind: 'massif', at: { azDeg: 28, distM: 16000 }, heightM: 1050, lengthM: 9000, widthM: 5000, strikeDeg: 160, name: 'the Tyndall Range',
      geology: { gullies: 0.8, ...RANGE_TOPS }, cover: { forest: [0, 600] } },
    // south-west: the Queen River running down past the smelters to the King River at Lynchford, its valley opening the
    // corner's view to the ranges; west, the King's valley, the dark ranges rising beyond
    { kind: 'valley', at: { azDeg: 228, distM: 2600 }, heightM: 90, lengthM: 5200, widthM: 1400, strikeDeg: 228, name: 'the Queen River valley' },
    { kind: 'valley', at: { azDeg: 245, distM: 8500 }, heightM: 140, lengthM: 8000, widthM: 3200, strikeDeg: 200, name: 'the King River' },
    { kind: 'ridge', at: { azDeg: 282, distM: 7800 }, heightM: 520, lengthM: 9000, widthM: 2600, strikeDeg: 170, notched: true,
      name: 'the ranges west of the King', geology: RAINFOREST, cover: { forest: [0, 520] } },
    { kind: 'ridge', at: { azDeg: 249, distM: 9600 }, heightM: 820, lengthM: 8000, widthM: 2800, strikeDeg: 150, notched: true,
      name: 'the ranges over the King River gorge', geology: RAINFOREST, cover: { forest: [0, 600] } },
    // south: Mount Jukes and Mount Huxley's dark shoulders, Mount Darwin beyond
    { kind: 'massif', at: { azDeg: 174, distM: 11500 }, heightM: 1030, lengthM: 6500, widthM: 4200, strikeDeg: 80, name: 'Mount Jukes',
      geology: { gullies: 0.8, ...RAINFOREST }, cover: { forest: [0, 620] } },
    { kind: 'massif', at: { azDeg: 216, distM: 10500 }, heightM: 1150, lengthM: 6000, widthM: 4400, strikeDeg: 40, name: 'Mount Huxley',
      geology: { gullies: 0.8, ...RAINFOREST }, cover: { forest: [0, 650] } },
  ],
  far: [
    // west and south: the buttongrass plains and rainforest ranges toward Macquarie Harbour, dark under the cloud
    { azDeg: [150, 320], distKm: [12, 30], reliefM: 750, form: 'forested', layers: 2, name: 'the rainforest ranges west and south' },
    // north and east: the West Coast Range running on behind Sedgwick and Lyell
    { azDeg: [320, 150], distKm: [12, 28], reliefM: 900, form: 'ridges', layers: 2, name: 'the West Coast Range' },
  ],
  landmarks: [
    { kind: 'headframe', at: { azDeg: 58, distM: 3700 }, heightM: 38, name: 'the North Lyell shaft' },
    { kind: 'headframe', at: { azDeg: 70, distM: 4250 }, heightM: 34, name: 'the Crown Lyell shaft' },
    { kind: 'chimney', at: { azDeg: 118, distM: 1350 }, heightM: 62, name: 'the smelters\' stack' },
    { kind: 'pylonLine', from: 'exit:n', azDeg: 352, name: 'the line from Lake Margaret' },
  ],
  exceptions: {
    C1: 'Queenstown lies under Mount Owen and Mount Lyell, ~1,000 m over the town within 3-5 km: the high skyline east is the place (the brief)',
  },
};

export default DRAFT;
