// src/world/maps/desert.ts — Sirocco Wadi, redesigned 2026-10-01 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, prop tones, name and id are the map's identity and stay; the battlefield under them
// is new. The old layout was Verdant's: its five landforms, its default country cross for roads, its three beat
// sites and spawns 470 m apart with the player pad beside the village.
//
// Reference: the eroded edge of the Dahar sandstone plateau in southern Tunisia, where wadis leave the escarpment
// between mesa outliers and braid across a sand basin toward the coast. The sirocco drives sand across that basin
// and piles linear draa and tall star dunes against the rock. The ksour, the fortified granary villages, stand at
// the wadi crossings, where the water table is shallow and the caravan routes meet.
//
// The story on the ground: two sandstone mesas stand on the west of the basin, the North Mesa in the north-west
// corner and the Gara south-west of centre. (They are the map's own mesa noise at threshold 0.80; that field broke
// into these two outliers and nothing else.) The Wadi Sirocco comes in from the west edge between them, passes the
// Gara's northern tip, crosses the basin through the centre and braids out to the east edge. Its bed is a shallow
// gravel floor with takyr crusts, 5–7 m below the basin, with bankside rims that give hull-down ground on both sides.
// The ksar village straddles the wadi where the caravan road fords it; the dry bed between its banks is the souk
// ground, kept clear. Two star dunes answer the two mesas across the centre: the Erg Dune north-east of the village
// and the Gara Dune in the south-east corner. They are tall, steep sand masses that block sight like the mesas do.
// Lower draa ridges, aligned with the wind, roll across the open basin.
//
// The layout is rotationally symmetric about the ford (0, 0): every feature in one team's half has a counterpart
// of the same kind and value in the other half, turned through 180°. Alpha starts south of the Gara with the Gara
// Dune on its east flank. Bravo starts north of the Erg Dune with the North Mesa on its west flank. The caravan road
// runs south to north through the ford; the wadi track runs west to east along the banks. The three zone-control
// objectives sit on gravel bars in the bed (the gap between the mesas, the ford, the eastern fan) and are equally
// far from both teams.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The scenery's sandstone in the Dahar's own colour: the dusty buff-red of the boulders (props rockTone), not the
// Buntsandstein red the geology defaults to.
const DAHAR_ROCK = [0.058, 0.24, 0.55] as const;

// The wadi centreline, symmetric through the ford: (x, z) and (-x, -z) are both on it.
const WADI = [
  [-512, 140], [-420, 132], [-330, 120], [-250, 100], [-180, 66], [-115, 34], [-55, 16], [0, 0],
  [55, -16], [115, -34], [180, -66], [250, -100], [330, -120], [420, -132], [512, -140],
] as const;

// Takyr crusts: shallow pale dips along the bed every ~45 m (the M layer, the cracked dry clay tone below), kept
// out of the souk ground at the ford and short of the border rim.
function takyrCrusts(): { x: number; z: number; r: number; dip: number }[] {
  const out: { x: number; z: number; r: number; dip: number }[] = [];
  for (let i = 1; i < WADI.length; i++) {
    const [ax, az] = WADI[i - 1], [bx, bz] = WADI[i];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 45));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, x = Math.round(ax + (bx - ax) * t), z = Math.round(az + (bz - az) * t);
      if (Math.abs(x) > 456 || Math.hypot(x, z) < 70) continue;
      out.push({ x, z, r: 22, dip: 0.7 });
    }
  }
  return out;
}

// The wadi bed: a chain of gorge segments along WADI, each with a flat gravel floor (65 % of its width) between
// graded banks. A segment spans its leg of the centreline plus half its neighbours' end tapers (length = leg / 0.86),
// so the depth stays even across every joint (the tapers are complementary smoothsteps). The bed is wider where a
// zone-control gravel bar sits (the gap between the mesas and the eastern fan). Through the ksar the settlement
// grading keeps 45 % of the depth: a shallow ford under the souk ground. The outer legs run on past the red line so
// the bed continues into the outland.
const WADI_WIDTH = [80, 80, 112, 76, 72, 70, 84, 84, 70, 72, 76, 112, 80, 80];
const WADI_DEPTH = 7.5;
function wadiGorges(): { kind: string; x: number; z: number; length: number; width: number; height: number;
  yawDeg: number; wetScale: number }[] {
  const out = [];
  for (let i = 1; i < WADI.length; i++) {
    const width = WADI_WIDTH[i - 1];
    const [ax, az] = WADI[i - 1], [bx, bz] = WADI[i];
    const leg = Math.hypot(bx - ax, bz - az);
    out.push({
      kind: 'gorge', x: (ax + bx) / 2, z: (az + bz) / 2, length: Math.round(leg / 0.86), width,
      height: -WADI_DEPTH, yawDeg: Math.round(Math.atan2(bz - az, bx - ax) * 1800 / Math.PI) / 10,
      wetScale: 1, // the takyr crusts lie IN the bed: the marsh weight must not lift it back up
    });
  }
  return out;
}

export default {
  id: 'desert',
  name: 'Sirocco Wadi',
  blurb: 'A dry wadi between sandstone mesas and star dunes, forded by a walled ksar village',

  terrain: {
    hillScale: 0.5,   // the basin floor's swell: the wadi, mesas and dunes carry the structure (was 0.85)
    microScale: 0.9,  // the sand-sheet folds and scrapes are the open basin's hull-down ground (was 0.7)
    rimH: 30,
    // Sand sheet over the whole basin: lower than the old erg so the authored draa and the wadi read through it.
    dunes: { amp: 4.5 },
    // The map's own mesa noise at threshold 0.80: exactly two outliers, the North Mesa in the north-west corner and
    // the Gara south-west of centre (at 0.70 the same field was one S-shaped massif across the west half).
    mesas: {
      amp: 36, thr0: 0.80, thr1: 0.855,
      wallWidth: 2.2, tierWidth: 0.16, tierScale: 0.22,
      corridorFloor: 1,
    },
    marshes: takyrCrusts(),
    clearMarshVeg: true,
    // The ksar: one graded rect straddling the ford, the souk ground in the bed at its centre.
    village: { x0: -112, x1: 112, z0: -92, z1: 92, cx: 0, cz: 0, feather: 38, flatten: 0.86, relief: 0.14 },
    // Authored paths stop inside the square; the endpoint completion adds each exit and grades it through the rim
    // (maps/roadEndpoints.ts, maps/roadBorderCorridor.ts).
    roads: { paths: [
      // 0 — the caravan road: south edge, east of the Gara, through the ford, west of the Erg Dune, north edge.
      // Road 0 also carries the utility-pole line (mapQuality).
      [[72, -448], [70, -400], [64, -330], [44, -240], [24, -150], [10, -70], [0, 0],
        [-10, 70], [-24, 150], [-44, 240], [-64, 330], [-70, 400], [-72, 448]],
      // 1 — the wadi track: west edge along the north bank between the mesas, through the ksar, then along the
      // south bank out over the eastern fan to the east edge.
      [[-448, 184], [-420, 182], [-330, 174], [-250, 154], [-180, 108], [-112, 58], [-48, 26], [0, 0],
        [48, -26], [112, -58], [180, -108], [250, -154], [330, -174], [420, -182], [448, -184]],
      // 2 / 3 — the ksar's ring lanes: each leaves the caravan road and curls round a quarter to the wadi track.
      [[-7.4, 52], [40, 76], [104, 44], [118, -62.4]],
      [[7.4, -52], [-40, -76], [-104, -44], [-118, 62.4]],
    ] },
    // The souk ground (the dry bed at the ford, a gravel floor graded flat for the weekly market) and a gravel bar
    // in the bed on each flank: level aprons the zone-control placement seats its 30 m discs on.
    hardstands: [
      // levels: the bed under each apron (a hardstand otherwise takes the nearest road's grade, the bank's)
      // each strip's length runs along its leg of the bed (a strip's local +Z is (sin yaw, cos yaw))
      { x: 0, z: 0, width: 64, length: 72, yawDeg: 106, level: -2.4, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): 29 m south, off the mesa's foot onto the bed, a 16 m bank
      { x: -300, z: 84, width: 56, length: 64, yawDeg: 104, level: -7.8, grade: 0, bankM: 16 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 20 m bank
      { x: 292, z: -112, width: 60, length: 64, yawDeg: 104, level: -0.5, grade: 0, bankM: 20 },
    ],
    // The gravel bed between the banks is bare worked ground (the D layer's dusty dirt): one band per half of the
    // wadi (a worked-ground patch takes at most 24 vertices).
    workedGround: [
      { feather: 18, strength: 0.85, boundary: [
        [-512, 168], [-420, 160], [-330, 148], [-250, 128], [-180, 94], [-115, 62], [-55, 42], [0, 28],
        [0, -28], [-55, -12], [-115, 6], [-180, 38], [-250, 72], [-330, 92], [-420, 104], [-512, 112],
      ] },
      { feather: 18, strength: 0.85, boundary: [
        [512, -168], [420, -160], [330, -148], [250, -128], [180, -94], [115, -62], [55, -42], [0, -28],
        [0, 28], [55, 12], [115, -6], [180, -38], [250, -72], [330, -92], [420, -104], [512, -112],
      ] },
    ],
    landforms: [
      ...wadiGorges(),
      // Braided gravel bars in the bed: low tamarisk islands between the channels, cover for a crossing hull, each with
      // its rotated twin (none on the zone bars or in the souk ground).
      ...[[-412, 132, -7], [-210, 76, -26], [-160, 48, -26], [-112, 30, -16]].flatMap(([x, z, yaw]) => [
        { kind: 'knoll', x, z, rx: 26, rz: 12, height: 2.6, yawDeg: yaw, wetScale: 1 },
        { kind: 'knoll', x: -x, z: -z, rx: 26, rz: 12, height: 2.6, yawDeg: yaw, wetScale: 1 },
      ]),
      // The Erg Dune: a steep star dune north-east of the ksar, the Gara's counterpart across the ford. A tall
      // knoll whose sand flanks (rock stays gated to the mesa weight on this map) a hull cannot climb, with two
      // lower arms reaching south-west and north-east.
      { kind: 'knoll', x: 128, z: 148, rx: 96, rz: 82, height: 27, yawDeg: 34 },
      { kind: 'ridge', x: 70, z: 96, length: 150, width: 64, height: 7.5, yawDeg: 34 },
      { kind: 'ridge', x: 196, z: 214, length: 160, width: 66, height: 8.0, yawDeg: 38 },
      // The Gara Dune: the south-east star dune, the North Mesa's counterpart.
      { kind: 'knoll', x: 300, z: -356, rx: 100, rz: 78, height: 24, yawDeg: 30 },
      // Draa ridges across the open basin, aligned with the wind (the dune field's rippleDir 0.8 / 0.6, about 37°):
      // hull-down crests and sight breaks, each with its rotated twin.
      { kind: 'ridge', x: 150, z: 22, length: 170, width: 62, height: 5.5, yawDeg: 37 },
      { kind: 'ridge', x: -150, z: -22, length: 170, width: 62, height: 5.5, yawDeg: 37 },
      { kind: 'ridge', x: 330, z: 300, length: 200, width: 70, height: 6.0, yawDeg: 37 },
      { kind: 'ridge', x: -330, z: -300, length: 200, width: 70, height: 6.0, yawDeg: 37 },
      { kind: 'ridge', x: 140, z: -230, length: 180, width: 64, height: 5.5, yawDeg: 37 },
      { kind: 'ridge', x: -140, z: 230, length: 180, width: 64, height: 5.5, yawDeg: 37 },
      { kind: 'ridge', x: 372, z: -46, length: 160, width: 58, height: 5.0, yawDeg: 37 },
      { kind: 'ridge', x: -372, z: 46, length: 160, width: 58, height: 5.0, yawDeg: 37 },
      { kind: 'ridge', x: 318, z: -196, length: 150, width: 56, height: 4.5, yawDeg: 37 },
      { kind: 'ridge', x: -318, z: 196, length: 150, width: 56, height: 4.5, yawDeg: 37 },
    ],
  },

  spawns: {
    // Alpha deploys directly south of the Gara, which screens the pad from the ford and the north; bravo's seven
    // pads are the rotation of that ground, an arc north of the Erg Dune (its screen), clear of the North Mesa by
    // more than the 90 m spawn-clear fade. 848 m between the anchors.
    player: { x: -118, z: -408 },
    enemies: [
      { x: 118, z: 408 }, { x: 68, z: 398 }, { x: 170, z: 398 }, { x: 22, z: 380 },
      { x: 216, z: 380 }, { x: 94, z: 440 }, { x: 146, z: 440 },
    ],
  },

  splat: {
    // r3 (content_breadth): sand albedo CAP dropped (0.24+1.08l could hit
    // ~1.0 — real sand albedo is ~0.4, and an albedo-1.0 layer under the
    // hottest sun in the game tonemapped the whole midfield to one blown
    // cream void). 0.20+0.86l tops out ~0.82: still clearly sun-hammered,
    // but dune-face shading and the macro tints below survive to screen.
    grassTone: (h: number, s: number, l: number) => [0.096, 0.40, clamp01(0.20 + l * 0.86)],
    // r4 (content_breadth): the `worn` dirt-patch bands were the critique's
    // "smeared dirt/grime streaks" across the midfield dune faces — the dirt
    // layer's clod/crack texture (painted L 0.08-0.31) rode l*1.12+0.04, so
    // every noise-banded worn patch rendered at roughly HALF the sand
    // luminance and the establishing shot read paint smears, not terrain.
    // Root-caused live (tools/tmp-cb-r4-bandprobe*.mjs): bands persist with
    // ALL vegetation hidden => splat, not scrub shadows. Compress the dirt
    // tone into a sand-adjacent band (L 0.31-0.48, ~15-25% under the open
    // sand instead of ~50%) and desaturate a step: the same worn fields now
    // read as compacted gravel-lag flats. Pairs with grassDensity below so
    // the surviving darkening carries actual vegetation clusters.
    dirtTone: (h: number, s: number, l: number) => [0.088, 0.30, clamp01(0.31 + l * 0.38)],
    // r7: R layer is the dedicated stratified-sandstone painter — authored
    // already-red, so no retint hook (the old s*3.2 hook targeted the grey
    // generic rock and would push the beds to neon)
    sandstone: true,
    // r8: mild desaturation + slight lift on the authored beds — the full-
    // saturation ochre banding read as "candy taffy" stripes from 200-800 m
    // (critique); ~28% sat cut keeps the sedimentary read without the neon
    // r1 (content_breadth): luminance COMPRESSED toward the bed mean (0.70
    // contrast) on top of a deeper sat cut — the alternating chocolate/cream
    // beds still read as a layer-cake print on the near mesas; squeezing the
    // per-bed value swing keeps the sedimentary structure while the wall
    // finally reads as one weathered rock mass
    // r4: sat 0.55 -> 0.42 — pairs with the makeSandstoneLayer desaturation
    // (terrain.js) to kill the residual PINK cast on the cliff beds
    // ground lane (2026-10-03, the gauntlet: "a purple tint splotch on the mound", "violet-grey rock"): the beds a step
    // yellower and less desaturated — a near-grey rust beside the saturated sand read violet under the sky's fill
    rockTone: (h: number, s: number, l: number) => [clamp01(h + 0.022), clamp01(s * 0.62), clamp01(0.53 + (l - 0.5) * 0.70)],
    mudTone: (h: number, s: number, l: number) => [0.078, 0.30, clamp01(l * 1.5 + 0.04)], // cracked dry clay
    mudRough: 1.15,
    // r3 (content_breadth): tintB pushed to a REAL darkener (0.94 -> 0.84
    // peak) — the three macro tints were all within ~8% of unity, so at
    // 300-800 m (where every distance-faded detail pass is gone) the flats
    // rendered as one continuous tone. Darker sabkha/gravel patches at the
    // ~230 m noise scale are what keep the open erg readable at range.
    tintA: [1.07, 1.00, 0.84], tintB: [0.84, 0.78, 0.67], tintC: [1.09, 1.03, 0.88],
    // r5: darker packed track — the old near-sand tint made the desert road a
    // faint smear across the dunes
    roadTint: [0.94, 0.87, 0.76],
    // r7: 0.30 -> 0.20 — the R layer albedo is now REAL sedimentary strata
    // (makeSandstoneLayer); the world-Y shader bands only reinforce at range
    // so the two never stack into over-banded stripes
    // r8: 0.20 -> 0.15 — even with the per-cliff de-sync the constant-
    // frequency shader bands stacked on the desaturated beds read over-striped
    // r1 (content_breadth): 0.15 -> 0.10 — pairs with the compressed bed
    // contrast above; the shader bands only whisper at range now
    strata: 0.10,
    microAmp: 0.38,         // tame the near-field dot speckle (ripples instead)
    rippleDir: [0.8, 0.6],  // global wind direction for the sand ripples
    // r7: 0.26 -> 0.34 — with the darker sand albedo the dune-face ripple
    // waves must carry the directional detail in the sunlit center valley
    // r3 (content_breadth): 0.34 -> 0.55 — the foreground/mid dune faces
    // still read felt-smooth in the establishing shot; the darker albedo cap
    // above buys the headroom for a stronger anisotropic wave without the
    // old moire risk (the >300 m fade + rMod gate in terrain.js still hold)
    rippleAmp: 0.55,
    // bright low-sun sand turned the shared mid-frequency normal dapple into
    // a leopard-spot shadow field across the whole foreground — run it low
    // and let the wind ripples carry the mid-range surface interest
    // r3 (content_breadth): 0.3 -> 0.55 + midReliefFar 820 — the shared
    // dapple band died at 480 m, exactly where the critique's "textureless
    // cream void" begins; with the sand no longer on the tonemap shoulder
    // the dapple reads as dune mottle, not leopard spots. midReliefFar is
    // consumed by the terrain.js splat shader (uMidFar, landed r3).
    midRelief: 0.55,
    midReliefFar: 820,
    // r4 terrain_environment: the sandMacro sheet-variation pass (gravel-lag
    // basins + pale scoured sheets, terrain.js uSandMacro) was authored in r3
    // but never ENABLED for this map — the mid-map stayed "hundreds of meters
    // of featureless smooth sand" (critique). Full strength.
    sandMacro: 1.0,
  },

  vegetation: {
    species: ['palm', 'acacia', 'eucalyptus'],
    clusterMix: [['palm', 0.72], ['acacia', 0.23], ['eucalyptus', 0.05]],
    // Dry-canopy companions are deliberately sparse; their new silhouettes
    // stay grounded instead of using the old far-LOD oak saucer.
    loneMix: [['palm', 0.70], ['acacia', 0.25], ['eucalyptus', 0.05]],
    rimMix: [['palm', 0.55], ['acacia', 0.35], ['eucalyptus', 0.10]],
    // r5: denser oases + more standalone palms — the sparse-stick read was a
    // top critique item; scrub density up with the new clump-gated scatter
    // r8: fewer LONE palms, more oasis clusters — uniformly scattered far
    // palms rendered as thin spider silhouettes of inconsistent scale across
    // the open flats (critique); date palms grow at water, i.e. in clumps
    // Trees round 2b (2026-10-03, wave 26: "a lone lollipop broadleaf ... on the foreground dune"): the wadi's trees are
    // few — date-palm groves at the water and scattered acacias in the bed and the hollows (vegetation.ts treeBiomeArid
    // seats them there). Was 27 / 36.
    clusterCount: 12,
    loneCount: 16,
    rimCount: 22,
    // terrain_environment r3: dense understory scrub INSIDE the oases — the
    // palm clusters stood as bare sticks on clean sand (vegetation.ts
    // clusterScrub: >1 puts ~55% of the shrubs at the trunk bases)
    clusterScrub: 2.3,
    // r5 terrain_environment: keep the establishing camera's foreground frame
    // edge clear — a squat palm sat CLIPPED at the bottom-left of
    // battlefield_desert.png (shot pos [-85,46,-162] looking [60,10,172]);
    // no trees/scrub/tufts inside this disc
    avoid: [{ x: -78, z: -146, r: 48 }],
    // r6: 0.3 -> 0.42 — compensates the stricter two-scale thicket gating so
    // scrub concentrates into dense wadis instead of thinning out overall
    // r4 (content_breadth): 0.42 -> 0.60 — the wadi thickets share the same
    // n1/n2 noise belts as the splat's worn bands (sampleSplatNoise twins the
    // shader warp), so denser tufts land INSIDE the darkened fields and the
    // banding reads as vegetated wadis rather than bare paint
    // Trees round 2b (2026-10-03, wave 26: "an unbroken carpet of pale grass tufts covering the whole foreground
    // dune"): a thin sward that keeps to the wadi thickets' belts, as Wadi Rum's. Was 0.60.
    grassDensity: 0.15,
    // pale sun-bleached straw: the old darker olive tufts/scrub read as
    // black pepper speckle against the bright sand in establishing shots
    grassTexTone: (h: number, s: number, l: number) => [0.112, clamp01(s * 0.55), clamp01(l * 1.05 + 0.14)],
    // r7: lum capped (0.95+0.18 -> 0.72+0.16, max ~0.58) — the brightest dry
    // tufts on sunlit dune crests tonemapped to pure WHITE blades that read
    // as untextured geometry slivers in the establishing shot
    tuftTone: (h: number, s: number, l: number) => [0.115, 0.20, clamp01(l * 0.72 + 0.16)],
    // r7: 0.9 -> 0.78 — thins the isolated mid-field scrub dots (each casts a
    // hard shadow speck at establishing distance) while the clump-gated wadi
    // thickets keep their density
    bushCount: 1.1, // r4: more wadi scrub — mid-map emptiness critique (map pass 2026-09-12: denser)
    bushSpecies: 'acacia',
    // Trees round 2b (2026-10-03, the gauntlet's wave 15: "palms included, whatever the place"): date palms grow where
    // the water table is shallow, in the Wadi Sirocco's bed and on its banks; a palm drawn on the open flats grows as an
    // acacia. Discs along the centreline (each leg's middle and each joint, six tenths of the bed's width).
    palmSites: [
      ...WADI.slice(1).map(([bx, bz], i) => ({ x: (WADI[i][0] + bx) / 2, z: (WADI[i][1] + bz) / 2, r: WADI_WIDTH[i] * 0.6 })),
      ...WADI.slice(1, -1).map(([x, z], i) => ({ x, z, r: (WADI_WIDTH[i] + WADI_WIDTH[i + 1]) * 0.3 })),
    ],
    palmFallback: 'acacia',
    palettes: {
      oak: { // r7: sun-bleached sage scrub — the r6 olive still bottomed out
        // at ~0.26 luminance in the far cards, and against ~0.85-luminance
        // sand every bush collapsed to a black pepper speck by 250 m (the
        // establishing-shot noise critique). Lift + desaturate hard toward
        // the sand palette: dusty khaki-sage that keeps ~2:1 contrast near
        // the camera but melts toward the dune tone at range.
        texTone: (h: number, s: number, l: number) => [0.145, clamp01(s * 0.42), clamp01(l * 0.95 + 0.17)],
        cardHue: 0.14, cardSat: 0.16,
        canopy: { hue: 0.15, sat: 0.15, l0: 0.36, l1: 0.50 },
      },
      palm: { // r6: fronds desaturated + darkened ~20% — the old bright toy-
        // plastic green crowns broke the muted sand grade in the foreground;
        // dusty date-palm olive sits in the scene palette instead
        // r9: mid-range lift (texTone 0.80 -> 0.90, canopy l0/l1 up ~50%) —
        // against ~0.85-luminance sand the r6 crowns collapsed to near-black
        // spiky silhouettes at range ("glitched scaffolding" critique); dusty
        // olive with real value keeps the crown a readable green mass
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.99), clamp01(s * 0.74), clamp01(l * 0.90)],
        cardHue: 0.235, cardSat: 0.20,
        // near-LOD blade vertex tint (buildPalmGeometry pal.frond): khaki-olive
        frond: { hue: 0.19, sat: 0.19, l: 0.41 },
        // r6 (content_breadth): far-crown value up another step (l0 0.26 ->
        // 0.33, l1 0.40 -> 0.52) and sat 0.22 -> 0.17 — even after r9 the
        // 300 m+ palm clusters collapsed to DARK UNGROUNDED CONFETTI against
        // the ~0.85-luminance sand (critique, major). Dusty pale olive keeps
        // ~1.6:1 contrast at range and lets the aerial haze melt the crowns
        // toward the dune tone instead of punching black specks; pairs with
        // the crown-scaled contact-shadow blobs (vegetation.ts) that tie
        // each cluster to the ground.
        canopy: { hue: 0.24, sat: 0.17, l0: 0.33, l1: 0.52 },
      },
    },
  },

  props: {
    // regional-buildings lane: the Tunisian ksar kit (maps/regional/ksar.ts)
    architecture: 'ksar',
    // r2 (content_breadth): plan 10 -> 18 slots — three more adobe clusters
    // plus a souk ('market'/'marketRow' builders, maps/mapKits.ts via the
    // urbanKit registry) so the crossroads reads as a lived-in bazaar town
    // r5 (content_breadth): WALLED COMPOUNDS. The critique's midfield read
    // was "~6 small boxes scattered on a bare sand pan with no compound
    // walls/courtyards" — four 'compound'/'compoundSouk' slots (mapKits.ts:
    // mud-brick perimeter + gate, 2-story house, annex, well/souk anchor,
    // courtyard clutter) cluster the loose adobes into real family blocks.
    // world-dressing r1: + a minaret over the bazaar skyline (the settlement
    // read as all one-story flat roofs from the establishing camera)
    // 2026-10-01: the ksar's landmarks stand on authored lots (plannedSites below), one walled compound in each
    // quarter between the caravan road and the wadi track, set back from both; the road frontages take the houses,
    // the souk rows, the bathhouse and the watchtower.
    plan: ['adobe', 'market', 'adobe', 'ruin', 'tower', 'adobe', 'bathhouse', 'marketRow', 'adobe', 'adobe',
      'ruin', 'adobe', 'market', 'adobe', 'adobe', 'ruin', 'adobe', 'tower', 'adobe', 'marketRow', 'adobe',
      'ruin', 'adobe', 'adobe'],
    plannedSites: [
      { structure: 'caravanserai', x: 52, z: -70, yawDeg: -16 },
      { structure: 'compoundSouk', x: -52, z: 70, yawDeg: 164 },
      { structure: 'compound', x: 62, z: 44, yawDeg: 74 },
      { structure: 'compound', x: -62, z: -44, yawDeg: -106 },
      { structure: 'minaret', x: -24, z: 52, yawDeg: 0 },
      // back-lot houses in the four quarters, each with its 180° twin
      { structure: 'adobe', x: 90, z: 74, yawDeg: 74 }, { structure: 'adobe', x: -90, z: -74, yawDeg: 254 },
      { structure: 'adobe', x: 24, z: 84, yawDeg: 164 }, { structure: 'adobe', x: -24, z: -84, yawDeg: 344 },
      { structure: 'adobe', x: 96, z: -20, yawDeg: 74 }, { structure: 'adobe', x: -96, z: 20, yawDeg: 254 },
    ],
    // (the scenery lane, b16; gauntlet wave 121: "a modern prefab with blue glass windows") no steel checkpoint hut: the
    // two gates' checkpoints and the one among the scattered huts are the ksar's own gate posts (maps/regional
    // ksarGate.ts): plastered mud brick, a parapet, timber lintels, dark unglazed openings, in the hut's footprint. The
    // list keeps its entry: dropping it re-seats the scattered huts after it and every pass that avoids them (measured:
    // the guard post 132 m, crates, rugs, tents, spools, barriers, signs and wall runs moved)
    destructibleBuildings: ['deserttent', 'commandtent', 'checkpointhut', 'guardpost'],
    structureVariants: { checkpointhut: 'ksargate' },
    // Two pairs, each turned through 180° about the ford: a ruined bordj (desert fort) on each flank, on the far side
    // of the wadi from the team whose flank zone it watches, and a checkpoint where the caravan road enters the ksar.
    tacticalBeats: [
      { id: 'west-bordj', role: 'brawl', x: -250, z: 236, yawDeg: 192,
        structure: 'guardpost', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'east-bordj', role: 'brawl', x: 250, z: -236, yawDeg: 12,
        structure: 'guardpost', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 15 },
      { id: 'south-gate-checkpoint', role: 'scout', x: 34, z: -128, yawDeg: 8,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-gate-checkpoint', role: 'scout', x: -34, z: 128, yawDeg: 188,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      // a nomad camp at a well on each side of the basin, between the ksar and the flank zones
      { id: 'west-well-camp', role: 'support', x: -170, z: 10, yawDeg: 20,
        structure: 'deserttent', redoubt: true, outcrop: { count: 6, radius: 11, scaleMax: 2.8 }, wreck: true, wreckOffsetZ: -14 },
      { id: 'east-well-camp', role: 'support', x: 170, z: -10, yawDeg: 200,
        structure: 'deserttent', redoubt: true, outcrop: { count: 6, radius: 11, scaleMax: 2.8 }, wreck: true, wreckOffsetZ: 14 },
    ],
    // denser packing: fill both road sides more often and let neighbouring
    // adobes huddle (flat-roof villages cluster tight around their souk)
    // 2026-10-01: a ksar is a dense block of mud-brick houses on narrow lanes — tighter packing than the old
    // crossroads village (sideSkip 0.12, spacingPad 7) so the ford's quarter is close-quarters ground
    sideSkip: 0.05, spacingPad: 4.5,
    // r5: 14 m-deep compound footprints need one extra lateral step so their
    // street wall clears the carriageway (front face >= ~4.5 m off the road
    // centerline at the closest roll), and a wider ground-fit tolerance so a
    // 24 m footprint still finds slots on the feathered village apron
    // (flatten 0.9 keeps the actual spread well under this inside the core)
    // 2026-10-01: one more setback step — the wadi track runs diagonally through the ksar, and a 24 m compound turned
    // to a diagonal frontage reached the carriageway at the old [11.5, 4.5]
    buildingLat: [14, 4], maxSpread: 2.2,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.068, 0.52, clamp01(l * 0.98 + 0.02)], // warm sand-plaster adobe
      roof: (h: number, s: number, l: number) => [0.065, clamp01(s * 0.8), clamp01(l * 1.1)],
      stone: (h: number, s: number, l: number) => [0.07, clamp01(s * 2 + 0.1), clamp01(l * 1.18 + 0.03)], // sandstone
      wood: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.9), clamp01(l * 1.15)],
      straw: null,
    },
    // r4: sat 0.34 -> 0.20, lift trimmed — the saturated red-rock boulders
    // read as fleshy-pink blobs on the open sand (establishing shot)
    rockTone: (h: number, s: number, l: number) => [0.055, 0.20, clamp01(l * 1.06 + 0.03)], // dusty red-rock boulders
    wallStoneChance: 1.0,
    // Adobe garden walls on the wadi terraces beside the ksar (the palm gardens above the bed) and the ksar's own
    // enclosure, every run with its 180° twin; low walls that mask a hull's tracks.
    wallRuns: [
      [-240, 58, -190, 30, 2], [-190, 30, -190, -4, 1], [240, -58, 190, -30, 2], [190, -30, 190, 4, 1],
      [-200, 118, -150, 96, 3], [-150, 96, -150, 130, 0], [200, -118, 150, -96, 3], [150, -96, 150, -130, 0],
      [-100, 84, -42, 94, 2], [100, -84, 42, -94, 2],
      [-110, -18, -110, 42, 3], [110, 18, 110, -42, 3],
      // courtyard walls in the four quarters of the ksar, each with its twin
      [-86, -12, -46, -24, 1], [86, 12, 46, 24, 1], [-30, -70, -30, -38, 2], [30, 70, 30, 38, 2],
      [40, 96, 84, 82, 3], [-40, -96, -84, -82, 3], [-94, 22, -74, 50, 0], [94, -22, 74, -50, 0],
      [300, 84, 356, 46, 1], [-300, -84, -356, -46, 1],
    ],
    well: true, hayCrates: true, fences: false, telegraph: true, carts: true, logs: false,
    // r3: craters 18 -> 30, +1 wreck — more battle scarring/track marks to
    // break the open bowl between the landforms
    // r4: rocks 210 -> 275, outcrops 24 -> 36, craters 30 -> 48, wrecks 5 ->
    // 7 — the critique's "hundreds of meters of empty sand" needs mid-scale
    // props, not just the new sandMacro albedo fields
    haystacks: 0, rocks: 320, outcrops: 44, craters: 48,
    // r6 terrain_environment: rubble around the adobe village — the
    // settlement read as "~10 bare boxes on empty sand" (critique); collapsed
    // mud-brick piles knit the compounds into a lived-in, fought-over block
    rubblePiles: 14,
    // DESTRUCTIBLES r1: modern-era hulks on the wadi routes (baked roster
    // tanks), convoy dressing + defended-crossroads clutter
    // the map-vehicles lane (2026-10-06, the period ruling): the Maghreb: Tunisia's M60A3s and M48s, the T-55s and
    // T-62s over the Libyan border
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['m60a3', 'type59', 'm48', 't62mv1'] },
    sandbagLines: 12,
    hedgehogs: 8,
    // world-dressing r1: adobe boundary walls + souk inhabitants — stall
    // ring on the bazaar crossroads, terracotta jar clusters and hung-rug
    // display frames along the compound walls (all destructible)
    wallStyle: 'adobe',
    inhabit: {
      stalls: 4, benches: 1, coreClutter: 8,
      pots: 10,
      troughs: 1, laundry: 1, handcarts: 1, carts: 2,
      yardFence: 'fencewattle',
      // DESTRUCTIBLES r1: stalled convoy dressing — supply trucks on the
      // wadi road, utility 4x4s at the compounds, fuel dumps, a desert camp
      trucks: 4, jeeps: 2, drumClusters: 4, camps: 2,
      modernClutter: { barrier: 5, roadsign: 4, cone: 8, transformer: 3, cablespool: 4 },
    },
  },

  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Dahar sandstone. The wadi
  // cuts its banks into bedded ledges and scree on both sides; the North Mesa's flanks break into ledges; a rujm, the
  // cairn that marks a desert track, stands beside the caravan road and the wadi track where each enters the basin.
  // Turned through 180 degrees about the ford like the rest of the map.
  scenery: {
    rockFields: [
      { geology: 'sandstone', x: -330, z: 120, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at -330,120' },
      { geology: 'sandstone', x: -250, z: 100, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at -250,100' },
      { geology: 'sandstone', x: -180, z: 66, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at -180,66' },
      { geology: 'sandstone', x: 180, z: -66, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at 180,-66' },
      { geology: 'sandstone', x: 250, z: -100, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at 250,-100' },
      { geology: 'sandstone', x: 330, z: -120, radius: 46, count: 3, slopeBias: 0.95, size: [2.5, 5], forms: [['outcrop', 0.65], ['scree', 0.35]], tone: DAHAR_ROCK, name: 'the wadi banks at 330,-120' },
      { geology: 'sandstone', x: -264, z: 376, radius: 90, count: 8, slopeBias: 1, size: [3, 6], forms: [['outcrop', 0.7], ['scree', 0.3]], tone: DAHAR_ROCK, name: 'the North Mesa ledges' },
    ],
    landmarks: [
      { kind: 'cairn', x: 88, z: -360, scale: 1.5, height: 1.5, geology: 'sandstone', tone: DAHAR_ROCK, name: 'the rujm on the caravan road' },
      { kind: 'cairn', x: -88, z: 360, scale: 1.5, height: 1.5, geology: 'sandstone', tone: DAHAR_ROCK, name: 'the rujm on the caravan road north' },
      { kind: 'cairn', x: -380, z: 200, scale: 1.4, height: 1.4, geology: 'sandstone', tone: DAHAR_ROCK, name: 'the rujm on the wadi track' },
      { kind: 'cairn', x: 380, z: -200, scale: 1.4, height: 1.4, geology: 'sandstone', tone: DAHAR_ROCK, name: 'the rujm on the wadi track east' },
    ],
  },

  horizon: {
    // banding up / grain down (r3): the far canyon walls must read as
    // stratified sandstone beds, not vertical fiber — constant-altitude
    // strata survive grazing angles where granular grain smears
    // r6: banding up / grain down again — constant-altitude beds are the only
    // feature that survives grazing-angle minification on the far ring
    baseHex: 0xa87c4e, amp: 1.15, style: 'mesa', banding: 0.30,
    rockHex: 0x96603a, haze: 0.85, grain: 0.7,
    // the mountains lane (2026-10-03): the outland boulders a shade sparser — they follow the ring's tilted beds, and
    // the map's horizon draws no more triangles than the PR head's
    outlandRocks: 0.95,
  },

  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulus-humilis', coverage: 0.14, cirrus: 0.5, contrails: 0.3, contrailAge: 0.2 },
  sky: {
    sunElevationDeg: 44, sunAzimuthDeg: 115,
    // round 37 (AAA program check 5, 2026-09-22): rayleigh 0.55 → 0.85 — at 0.55 the anti-solar sky was an inky
    // saturated blue right down to the ridges (40 display luma at +4° against a horizon band near 140), so the pale
    // ranges read 2.3× brighter than the sky behind them; more Rayleigh lifts the low sky toward the dusty pale blue a
    // real desert horizon carries (Oasis inherits this sky), the zenith stays deep
    // 2026-10-03 (the skies lane; the gauntlet's wave 4, Sirocco's establishing: "the background ranges share the sand's
    // pale beige ... mountains, plain and village dissolve into one washed-out plane with none of the hard-sun shadow a
    // desert should show"): dry desert air is clear — turbidity 7 -> 5 and Mie 0.009 -> 0.006 (a bluer low sky behind the
    // ranges, the haze's target) with the haze itself thinned below (fogDensity 0.00047 -> 0.0003: a range 10 km out
    // keeps about half its contrast instead of a third)
    turbidity: 5, rayleigh: 0.85, mieCoefficient: 0.006, mieDirectionalG: 0.8,
    // 0.00105 washed the mesa tablelands to unshaded clay by 900 m — 0.00086
    // keeps the heat haze but lets the strata banding read on the skyline
    // r1 (content_breadth): 0.00086 -> 0.00066 — even at 0.00086 everything
    // past ~40% frame height in the establishing shot washed to one blown
    // cream tone; the lighter haze keeps dune-shadow value separation alive
    // through the midground while the warm tint still sells the heat
    // r3 (content_breadth): 0.00066 -> 0.00047 and fogMix 0.72 -> 0.60 —
    // even after the r1 cut the warm haze still laid a cream veil over
    // everything past ~250 m and compounded the albedo blow-out (the
    // map-picker thumbnail, rendered before fog thickens with distance,
    // showed visibly richer sand than the live establishing shot). The mie
    // sky + warm fog tint keep the heat identity; the veil no longer eats
    // the midfield value range.
    // round 47 (2026-09-23): envIntensity stays 0.16 — sky.ts clamps scene.environmentIntensity to
    // ENV_INTENSITY_FLOOR (0.21), so any preset value below that (0.16, or the 0.19 the audit proposed) renders the
    // same; a real environment lift here must exceed 0.21 and was not tested this round. Oasis inherits this value.
    // 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast)
    fogDensity: 0.00025, fogTintHex: 0xbdb5a8 /* round 47 (2026-09-23): a step cooler than the sun so haze and sand stop sharing one ochre (lane r47c) */, fogMix: 0.60, envIntensity: 0.16, // lighting_post r4: 0.22 -> 0.16 (sun/lee dune separation)
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): a textured high sky instead of a thin veil —
    // broken altocumulus (0.35 -> 0.78) under a cirrus sheet (0.18 -> 0.48) on an explicit 900 m virtual deck with a
    // slower slant haze (0.00012) and smaller 2600 m cells, so the deck keeps its cauliflower structure down to the
    // 2-12° band the battle cameras see; patchier light on the sand (cloudShadowAmp 0.26 over the 0.22 auto). The
    // Garage copy in game/garageSkyPresets.ts follows this block.
    cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudTintHex: 0xfff2df,
    cloudAltM: 900, cloudHazeK: 0.00012, cloudUvM: 2600, cloudShadowAmp: 0.26,
    // lighting_post r4: sun 4.9 → 4.15 — the hottest sun in the game over the
    // brightest albedo pushed open sand to ~1.5 linear, high on the ACES
    // shoulder where its texture variation compressed to nothing ("large
    // desert sand areas blow out to textureless near-white, overexposed ~1
    // stop"). 4.15 drops open sand to ~1.25 — still clearly the sun-hammered
    // map, but dune ripples and track marks survive the tonemap.
    // r1 (content_breadth): 4.15 -> 3.55 — pairs with the fogDensity cut AND
    // the lighting_post r8 global exposure raise (renderer 1.16 -> 1.20,
    // grade contrast 1.36): the brightest-albedo map must come down a notch
    // so midground dune faces keep readable shading instead of blowing out
    // r3 (content_breadth): 3.55 -> 3.30 and hemi 0.34 -> 0.30 — final step
    // of the wash-out fix: pairs with the 0.82 albedo cap + fog cut so open
    // sand sits ~0.9-1.1 linear (texture survives ACES) while dune shadow
    // sides keep a full stop of separation.
    // round 47 (2026-09-23, owner: "the ground patterns are too black"): hemi 0.20 -> 0.28 (effective 0.283 -> 0.397
    // with the scaled bounce floor, lighting.ts hemiFloorFor). Measured on the wall-probe views: true shade rises
    // (canyon-in darkest 1 % / 5 % of the ground +10.7 % / +8.1 %), lit sand +0.1..0.6 % (the sun stays 4.15 and
    // postExposure 0.90, so nothing re-blows). It does NOT touch the dark contour bands on the sunlit dune faces
    // (+2..4 %): those are the sand branch's own bands, not fill starvation — see docs/MAP-BEAUTIFICATION.md round 47.
    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.28, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)
    // lighting_post r3 (round 3): per-map display exposure trim (post.ts
    // uExposure). 0.93 (not the 0.88 the LP probe used) because the r3
    // content_breadth sun/fog/albedo retune above already pulls sand
    // midtones down — together they land dune relief in the readable band.
    postExposure: 0.90, // lighting_post r4: keep the raised sun from re-blowing the sand top end
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xad9b7c },
  },

  minimap: {
    base: [146, 122, 82], hard: [160, 140, 104], soft: [122, 104, 70],
    forest: 'rgba(88,104,44,0.85)', forestStroke: 'rgba(52,64,26,0.9)',
    water: 'rgba(140,118,80,0.6)', waterStroke: 'rgba(90,76,52,0.7)',
    roadCasing: 'rgba(88,72,48,0.9)', roadFill: 'rgba(214,192,150,0.95)',
    buildingFill: '#e0cba4',
  },

  // south-east of the ford over the eastern fan: the ksar on the wadi, the Gara behind it, the Erg Dune to the right
  shot: { pos: [196, 44, -150], look: [-40, 6, 40] },
} satisfies import('./contracts.ts').MapCompositionConfig;
