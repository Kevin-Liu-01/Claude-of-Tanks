// Owner-directed kit set aside from a registered source comparison (the K1's photo-supplement mechanism,
// reference-supplement.mjs, for parts an owner asked for that the print does not carry). Each part is one named group
// directly under its rig; procedural-fidelity.html authenticates its exact geometry, pose and materials against the
// receipt before the numeric masks drop it, the shaded boards keep the whole vehicle, and the drivers keep a fresh
// raw full-vehicle comparison beside it. Nothing else on the vehicle is excused: the rest clears its own bar.
// First-party: Kevin B. Liu (NOTICE.md).

// The owner's words, verbatim (2026-10-27, release 262's Oplot lane).
const OPLOT_OWNER_WORDS = 'make thesee tannks a lot more visually distinct and specialized with extra side armor, '
  + 'fuel barrles inn back, lights, 2 gun towers instead of 1 (i know we have that caapabilty), etc';

// The owner's words, verbatim (2026-10-31, release 266's STB-1 lane).
const STB1_OWNER_WORDS = 'raise the drums on the stb1 so theyre visible in the hero images a lil more!!! just rule of cool type stuf';

export const OWNER_KIT_TARGETS = Object.freeze({
  bm_oplot_m: Object.freeze({
    ownerDecision: `Owner: "${OPLOT_OWNER_WORDS}". Main (262): exempt the kit from the source comparison; do not trim it.`,
    decisionDate: '2026-10-27',
    parts: Object.freeze([
      Object.freeze({ group: 'oplotMKt762', parent: 'rig_turret', ownerWords: '2 gun towers instead of 1',
        part: 'the second roof station: the KT-7.62 mini-turret on its ring (the print carries the KT-12.7 only)',
        metadata: Object.freeze({ fitting: 'pintleMG', remoteControlled: true }), reference: 'owner-kit:bm_oplot_m:oplotMKt762' }),
      Object.freeze({ group: 'oplotMKitSternDrums', parent: 'rig_hull', ownerWords: 'fuel barrles inn back',
        part: 'the twin 200 L stern drums, their cradle and straps',
        metadata: Object.freeze({ ownerKit: true, fitting: 'ownerKit' }), reference: 'owner-kit:bm_oplot_m:oplotMKitSternDrums' }),
      Object.freeze({ group: 'oplotMKitLights', parent: 'rig_turret', ownerWords: 'lights',
        part: 'the LED light bars on the cheek stacks and the bustle work lamp',
        metadata: Object.freeze({ ownerKit: true, fitting: 'ownerKit' }), reference: 'owner-kit:bm_oplot_m:oplotMKitLights' }),
    ]),
    // the owner's "extra side armor" on this tank is a lower Duplet course: ERA in the skirt sector's destructible
    // cluster (hit faces, lids that fly off), which cannot be one rigid group; it stays in the comparison
    retained: 'the lower Duplet skirt course ("extra side armor"): skirt-sector ERA, compared as built',
  }),
  // 266: the owner's stern drums on the STB-1 (265: "make the stb 1 have two big fuel barrels and back"); the owner's
  // model they are compared against has none
  stb1: Object.freeze({
    ownerDecision: `Owner: "${STB1_OWNER_WORDS}". Main (266): exempt the kit from the source comparison; do not trim it.`,
    decisionDate: '2026-10-31',
    parts: Object.freeze([
      Object.freeze({ group: 'stb1KitSternDrums', parent: 'rig_hull', ownerWords: 'raise the drums on the stb1',
        part: 'the two 200 L stern drums on their welded shelf: the shelf, its gussets, the saddles, the drums and straps',
        metadata: Object.freeze({ ownerKit: true, fitting: 'ownerKit' }), reference: 'owner-kit:stb1:stb1KitSternDrums' }),
    ]),
    retained: 'everything else on the STB-1, the roof M2 included, compared as built',
  }),
});
