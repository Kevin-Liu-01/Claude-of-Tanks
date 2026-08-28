// src/world/maps/desert.ts — El Halluf vibes: ridged dunes, flat-topped mesas,
// an adobe village on the crossroads, palm clusters, warm sand haze.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'desert',
  name: 'Sirocco Wadi',
  blurb: 'Sun-baked dunes, red mesas and an adobe crossroads village',

  terrain: {
    hillScale: 0.85,
    microScale: 0.7,
    rimH: 30,
    dunes: { amp: 7.5 },
    // Broad tablelands with a graded talus shoulder. The former tight
    // threshold crossed the full mesa rise in roughly one terrain cell and
    // produced triangular "spike hills" beside the village.
    mesas: {
      amp: 36, thr0: 0.70, thr1: 0.755,
      wallWidth: 2.2, tierWidth: 0.16, tierScale: 0.22,
      corridorFloor: 1,
    },
    marshes: [], // no marshes — dry wadi
    // r2 (content_breadth): village footprint widened (-70..74 -> -92..92,
    // -34..112 -> -46..132) — the crossroads settlement read as "a handful of
    // isolated boxes along the road"; more road frontage inside the box means
    // more placement slots for the longer adobe/bazaar plan below
    village: { x0: -92, x1: 92, z0: -46, z1: 132, cx: 4, cz: 40, feather: 40, flatten: 0.9 },
    landforms: [
      { kind: 'ridge', x: -250, z: 26, length: 300, width: 82, height: 5.4, yawDeg: 8 },
      { kind: 'ridge', x: 246, z: 60, length: 284, width: 78, height: 5.0, yawDeg: -12 },
      { kind: 'ridge', x: -40, z: 246, length: 208, width: 66, height: 4.2, yawDeg: 78 },
      { kind: 'knoll', x: 178, z: -226, rx: 92, rz: 70, height: 5.8, yawDeg: 22 },
      { kind: 'basin', x: -154, z: -184, rx: 118, rz: 78, height: -3.0, yawDeg: -18 },
    ],
  },

  spawns: {
    // r1 (content_breadth): player spawn moved off the mesa flank (14,-86 sat
    // on a 0.60-normal slope and the ally lateral offsets ±22/44 m landed ON
    // the striated cliff wall — the establishing shot framed a tank fused
    // into the mesa). (68,-82) scans flat (min normal.y 0.98 over the whole
    // ±55 m ally arc, max Δh 2.4 m — tools: scan over createHeightField).
    player: { x: 68, z: -82 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc on the base side (was a
    // mid-map scatter with points abreast of the village at ±325 x). Cells
    // flat-scanned via tools/tmp-ai-r7-spawnscan.mjs (raw terrain minNy>=0.86,
    // relief<=5 m over the pad radius, mesa faces rejected, >=38 m apart,
    // >=380 m from the player pad; the r9 spawnClear fade keeps macro dunes
    // out of every pad).
    enemies: [
      { x: -10, z: 378 }, { x: -114, z: 389 }, { x: 59, z: 410 }, { x: -179, z: 365 },
      { x: 96, z: 313 }, { x: -218, z: 364 }, { x: 146, z: 419 },
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
    rockTone: (h: number, s: number, l: number) => [h, clamp01(s * 0.42), clamp01(0.53 + (l - 0.5) * 0.70)],
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
    species: ['palm', 'oak'],
    clusterMix: [['palm', 1]],
    // all-palm standalone trees: the occasional far-LOD oak read as a pale
    // olive saucer floating over the oasis
    loneMix: [['palm', 1]],
    rimMix: [['palm', 1]],
    // r5: denser oases + more standalone palms — the sparse-stick read was a
    // top critique item; scrub density up with the new clump-gated scatter
    // r8: fewer LONE palms, more oasis clusters — uniformly scattered far
    // palms rendered as thin spider silhouettes of inconsistent scale across
    // the open flats (critique); date palms grow at water, i.e. in clumps
    clusterCount: 27,
    loneCount: 36, // r4: a few more standalone palms breaking the open flats
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
    grassDensity: 0.60,
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
    bushCount: 0.92, // r4: more wadi scrub — mid-map emptiness critique
    bushSpecies: 'oak',
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
    plan: ['caravanserai', 'adobe', 'market', 'minaret', 'compoundSouk', 'tower',
      'adobe', 'ruin', 'compound', 'bathhouse', 'marketRow', 'adobe', 'adobe',
      'compoundSouk', 'adobe', 'market', 'ruin', 'adobe'],
    destructibleBuildings: ['deserttent', 'commandtent', 'checkpointhut', 'guardpost'],
    tacticalBeats: [
      { id: 'western-wadi-camp', role: 'brawl', x: -254, z: 64, yawDeg: 10,
        structure: 'deserttent', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'eastern-mesa-watch', role: 'scout', x: 254, z: 70, yawDeg: -10,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 3.0 } },
      { id: 'northern-relay-camp', role: 'support', x: 28, z: 270, yawDeg: 2,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    // denser packing: fill both road sides more often and let neighbouring
    // adobes huddle (flat-roof villages cluster tight around their souk)
    sideSkip: 0.12, spacingPad: 7,
    // r5: 14 m-deep compound footprints need one extra lateral step so their
    // street wall clears the carriageway (front face >= ~4.5 m off the road
    // centerline at the closest roll), and a wider ground-fit tolerance so a
    // 24 m footprint still finds slots on the feathered village apron
    // (flatten 0.9 keeps the actual spread well under this inside the core)
    buildingLat: [11.5, 4.5], maxSpread: 2.2,
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
    wallRuns: [
      [-58, 4, -58, 58, 2], [70, 26, 70, 92, 3], [-6, 104, 48, 104, 1],
      [-170, -70, -110, -70, 2], [150, -180, 150, -120, 1], [-70, 210, 0, 210, 3],
      // r2: courtyard walls hugging the crossroads (junction ~[4,40]) — low
      // sandstone compounds that knit the bazaar blocks together
      [-30, 16, -30, 52, 2], [-30, 16, -2, 16, 1],
      [34, 58, 34, 92, 3], [34, 92, 66, 92, 2],
      [-46, 76, -12, 76, 1],
    ],
    well: true, hayCrates: true, fences: false, telegraph: true, carts: true, logs: false,
    // r3: craters 18 -> 30, +1 wreck — more battle scarring/track marks to
    // break the open bowl between the landforms
    // r4: rocks 210 -> 275, outcrops 24 -> 36, craters 30 -> 48, wrecks 5 ->
    // 7 — the critique's "hundreds of meters of empty sand" needs mid-scale
    // props, not just the new sandMacro albedo fields
    haystacks: 0, rocks: 275, outcrops: 36, craters: 48,
    // r6 terrain_environment: rubble around the adobe village — the
    // settlement read as "~10 bare boxes on empty sand" (critique); collapsed
    // mud-brick piles knit the compounds into a lived-in, fought-over block
    rubblePiles: 14,
    // DESTRUCTIBLES r1: modern-era hulks on the wadi routes (baked roster
    // tanks), convoy dressing + defended-crossroads clutter
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['m1a2', 't90m', 'merkava3d', 'ariete', 'type99a'],
    },
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

  horizon: {
    // banding up / grain down (r3): the far canyon walls must read as
    // stratified sandstone beds, not vertical fiber — constant-altitude
    // strata survive grazing angles where granular grain smears
    // r6: banding up / grain down again — constant-altitude beds are the only
    // feature that survives grazing-angle minification on the far ring
    baseHex: 0xa87c4e, amp: 1.15, style: 'mesa', banding: 0.30,
    rockHex: 0x96603a, haze: 0.85, grain: 0.7,
  },

  sky: {
    sunElevationDeg: 44, sunAzimuthDeg: 115,
    turbidity: 7, rayleigh: 0.55, mieCoefficient: 0.009, mieDirectionalG: 0.8,
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
    fogDensity: 0.00047, fogTintHex: 0xc7ac85, fogMix: 0.60, envIntensity: 0.16, // lighting_post r4: 0.22 -> 0.16 (sun/lee dune separation)
    cloudOpacity: 0.35, cloudOpacity2: 0.18, cloudTintHex: 0xfff2df,
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
    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.20, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)
    // lighting_post r3 (round 3): per-map display exposure trim (post.ts
    // uExposure). 0.93 (not the 0.88 the LP probe used) because the r3
    // content_breadth sun/fog/albedo retune above already pulls sand
    // midtones down — together they land dune relief in the readable band.
    postExposure: 0.90, // lighting_post r4: keep the raised sun from re-blowing the sand top end
  },

  minimap: {
    base: [146, 122, 82], hard: [160, 140, 104], soft: [122, 104, 70],
    forest: 'rgba(88,104,44,0.85)', forestStroke: 'rgba(52,64,26,0.9)',
    water: 'rgba(140,118,80,0.6)', waterStroke: 'rgba(90,76,52,0.7)',
    roadCasing: 'rgba(88,72,48,0.9)', roadFill: 'rgba(214,192,150,0.95)',
    buildingFill: '#e0cba4',
  },

  shot: { pos: [-85, 46, -162], look: [60, 10, 172] },
};
