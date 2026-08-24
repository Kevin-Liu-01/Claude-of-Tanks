// src/world/maps/winter.js — Erlenberg vibes: snow splat, a frozen lake you
// can drive across, bare birches, snow-dusted pines, flat overcast light.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'winter',
  name: 'Frosthollow',
  blurb: 'Snowbound farmland, bare birch stands and a frozen lake',

  terrain: {
    hillScale: 1.0,
    microScale: 0.9,
    rimH: 25,
    frozenMarshes: true,
    // no soggy marsh bowls — everything frozen reads as a crisp ice sheet
    marshes: [],
    // shallow depths: the sheet now flattens nearly to the shoreline and the
    // level tracks the LOWEST bank point, so banks stay ~0.5 m snow lips —
    // the old 1.0-1.3 m drops read as steep-walled craters, not lakes
    lakes: [
      { x: 195, z: -120, r: 88, depth: 0.55 },
      { x: -190, z: -210, r: 62, depth: 0.5 },
      { x: -265, z: 265, r: 56, depth: 0.45 },
    ],
    // wider settlement footprint: the hamlet reads as a proper village core
    // instead of one lonely building cluster on an empty snowfield
    village: { x0: -84, x1: 100, z0: -56, z1: 150, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
    landforms: [
      { kind: 'ridge', x: -246, z: 20, length: 322, width: 80, height: 7.2, yawDeg: 12 },
      { kind: 'ridge', x: 248, z: 56, length: 304, width: 82, height: 6.8, yawDeg: -14 },
      { kind: 'ridge', x: -48, z: 242, length: 206, width: 66, height: 5.4, yawDeg: 76 },
      { kind: 'knoll', x: 172, z: -222, rx: 88, rz: 68, height: 6.2, yawDeg: 20 },
      { kind: 'basin', x: -146, z: -178, rx: 104, rz: 76, height: -2.7, yawDeg: -16 },
    ],
  },

  spawns: {
    player: { x: 14, z: -78 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc on the base side (was a
    // mid-map scatter reaching ±330 x abreast of the village). Flat-scanned
    // via tools/tmp-ai-r7-spawnscan.mjs — minNy>=0.86, relief<=5 m over the
    // pad radius, frozen-lake sheets avoided, >=38 m apart, >=380 m from the
    // player pad.
    enemies: [
      { x: 38, z: 332 }, { x: -33, z: 336 }, { x: 69, z: 308 }, { x: -63, z: 370 },
      { x: 140, z: 418 }, { x: -132, z: 392 }, { x: 186, z: 380 },
    ],
  },

  splat: {
    // lighting_post r5: saturation 0.05 -> 0.03 — shadowed snow read as blue paint
    grassTone: (h, s, l) => [0.575, 0.03, clamp01(0.62 + l * 0.38)], // snowpack
    dirtTone: (h, s, l) => [0.075, 0.11, clamp01(l * 0.85 + 0.10)], // frozen mud
    // pale snow-dusted rock: keeps steep lake banks / cut slopes from reading
    // as dark holes punched into the snowfield
    rockTone: (h, s, l) => [0.585, 0.05, clamp01(l * 1.0 + 0.22)],
    mudTone: (h, s, l) => [0.565, 0.24, clamp01(0.60 + l * 0.34)], // (fallback if iceLake off)
    mudRough: 0.18,
    marshGloss: 1.0, // r6: full ice response — the sheet needs a real sheen
    // dedicated ice-sheet layer: blue-grey albedo, bright refrozen pressure
    // cracks, dark depth blotches, glossy clear-ice roughness. Drift LOW:
    // 0.85 buried most of the sheet back under snow albedo and the "lake"
    // vanished into the snowfield
    iceLake: true,
    // 0.45 (r5): more windblown snow encroaching from the shores — the sheet
    // grades into the snowfield instead of sitting as a clean punched ellipse
    // r9: 0.45 -> 0.30 — at 0.45 the drift + bright macro buried the clear-
    // ice fields and the signature lake read as a snow-swept depression from
    // the establishing camera; 0.30 keeps the drifted shore band but exposes
    // the darker glossy ice interior (pairs with the makeIceLayer value-
    // contrast push and the 0.20 ice roughness floor in terrain.js)
    // r2 (content_breadth): 0.30 -> 0.18 — the lake still read as a "soft
    // white-blue smudge" in the establishing shot; less windblown snow on the
    // sheet exposes the refrozen crack veins + glossy clear-ice fields so the
    // basin finally reads as ICE (pairs with the new shoreline reed/pressure-
    // ridge dressing in maps/mapKits.js)
    // r4: 0.18 -> 0.12 — pairs with the darker makeIceLayer fields; less
    // wind-blown snow albedo re-burying the clear-ice interior
    // r6 (content_breadth): 0.12 -> 0.20 — the critique flipped back: the
    // fully-exposed sheet reads as one uniform pale print with a hard rim.
    // 0.20 restores partial snow-drift patches (pairs with the new mapKits
    // drift-lens geometry) while the crack veins still read.
    iceDrift: 0.20,
    // terrain_environment r3: fresnel sky tint the clear-ice fields reflect
    // at grazing view angles (terrain.js uIceSky) — pairs with the darker
    // makeIceLayer fields + 0.13 roughness floor for a real ice identity
    // r4: brightened a step — pairs with the stronger 0.48 fresnel weight in
    // terrain.js so the sheet reads specular from the establishing camera
    iceSky: [0.76, 0.82, 0.92],
    // lighting_post r5: tintB desaturated toward neutral (was [0.90,0.93,1.00])
    tintA: [1.03, 1.04, 1.09], tintB: [0.95, 0.965, 1.005], tintC: [1.04, 1.04, 1.07],
    roadTint: [0.74, 0.68, 0.62], // worn dark slush tracks through the snow
  },

  vegetation: {
    species: ['birch', 'pine'],
    clusterMix: [['birch', 0.55], ['pine', 0.45]],
    loneMix: [['birch', 0.6], ['pine', 0.4]],
    rimMix: [['pine', 0.8], ['birch', 0.2]],
    clusterCount: 66, // denser birch/pine stands — forest blocks as landmarks (r5)
    loneCount: 92,
    rimCount: 64,
    // sparser, FROSTED tufts: the old dark dense scatter read as uniform
    // speckle noise across the snowfield in wide shots. r5: slightly up now
    // that the scatter clumps in hollows instead of pepper-spraying
    // r7: 0.24 -> 0.10 — even clumped, the scatter read as high-contrast
    // dark speckle ("scattered dirt") across the snowfield in wide shots;
    // winter growth stays sparse and hugs features, with LIGHTER rime tones
    // r8 (critique: "leafless scrub renders as tiny insect-like scribbles
    // scattered on the snow"): density 0.10 -> 0.07 and bushes 0.22 -> 0.15
    // cull the smallest scatter class that degenerates into mid-field
    // speckle, and the surviving tufts ride even lighter/waxier rime tones
    // so they read as frost-bound straw, not debris.
    grassDensity: 0.07,
    grassTexTone: (h, s, l) => [0.105, 0.10, clamp01(l * 1.0 + 0.36)], // rimed straw
    tuftTone: (h, s, l) => [0.11, 0.07, clamp01(l * 0.9 + 0.40)],
    bushCount: 0.15,
    // pine scrub, not birch twig-balls: the dark leafless bush scatter read
    // as speckle noise against the snow in establishing shots
    bushSpecies: 'pine',
    palettes: {
      // r3 (content_breadth): the foreground stands read as DEAD AUTUMN
      // SAPLINGS — pale trunks, beige-mauve twig puffs, zero snow, one
      // saturated green pine breaking the set (critique, major). Both
      // species now run a HOAR-FROST palette: twig/needle textures pushed
      // toward pale rime, near-card tints cooled and lifted, and the new
      // `snow` knob (vegetation.js, handoff r3) lays a white top-weighted
      // snow load on the card cloud. `jitterHue` clamps the per-instance
      // hue jitter (authored for verdant variety) to near value-only so no
      // lone summer-green tree can survive on a snow map.
      birch: {
        // r4 (content_breadth): snow 0.60 -> 0.75 — feeds the new branch-
        // conforming snow-cap lobes in vegetation.js buildBirchGeometry (the
        // crowns read as "floating white confetti" without an opaque snow
        // mass tying the card cloud together)
        cardHue: 0.58, cardSat: 0.03, cardL0: 0.46,
        // rime-grey twig haze: cool hue, near-zero sat, high floor — the
        // twig texture's dark strokes read as frost-bound brush, not brown
        texTone: (h, s, l) => [0.58, clamp01(s * 0.14), clamp01(l * 0.62 + 0.34)],
        canopy: { hue: 0.575, sat: 0.045, l0: 0.42, l1: 0.60 },
        snow: 0.75, jitterHue: 0.22,
      },
      pine: { // winter spruce under snow load: frosted blue-green underlayer,
        // the `snow` knob whitens the upward tier surfaces (near cards) and
        // the lifted canopy l1 carries the same read in the far LOD
        texTone: (h, s, l) => [clamp01(h * 0.98), clamp01(s * 0.32), clamp01(l * 1.02 + 0.18)],
        cardHue: 0.40, cardSat: 0.07, cardL0: 0.42,
        canopy: { hue: 0.46, sat: 0.05, l0: 0.42, l1: 0.66 },
        // r6 terrain_environment: 0.55 -> 0.90 — "conifers carry zero snow
        // load and read summer-green against full snow cover" (critique).
        // Feeds the strengthened card whitening AND the new opaque bough
        // snow lobes in vegetation.js buildPineTrunk.
        snow: 0.90, jitterHue: 0.22,
      },
    },
  },

  props: {
    // world-dressing r1: winter catalog — log cabins, steep-roof alpine
    // houses, an onion-dome church and open woodsheds replace the all-cottage
    // village (every up-facing surface takes the snow-cap shader load)
    plan: ['rangerlodge', 'alpine', 'schoolhouse', 'onionchurch', 'logcabin', 'ruin',
      'woodshed', 'alpine', 'cottage', 'logcabin', 'barn', 'woodshed',
      'alpine', 'ruin', 'logcabin', 'barn'],
    destructibleBuildings: ['saunahut', 'alpinerefuge', 'fieldhospital', 'huntingblind'],
    tacticalBeats: [
      { id: 'western-moraine-refuge', role: 'brawl', x: -254, z: 64, yawDeg: 12,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'eastern-snow-watch', role: 'scout', x: 246, z: 70, yawDeg: -12,
        structure: 'huntingblind', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'northern-aid-station', role: 'support', x: 24, z: 270, yawDeg: 4,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    tones: {
      plaster: (h, s, l) => [0.085, clamp01(s * 0.7), clamp01(l * 1.02 + 0.03)],
      roof: (h, s, l) => [0.58, clamp01(s * 0.25), clamp01(l * 1.35 + 0.18)], // snow-capped
      stone: (h, s, l) => [0.60, clamp01(s * 0.35), clamp01(l * 1.05 + 0.05)],
      wood: (h, s, l) => [h, clamp01(s * 0.7), clamp01(l * 0.95 + 0.02)],
      // terrain_environment r3: the all-white "snowed-over" tone erased the
      // thatch texture entirely — foreground stacks read as raw untextured
      // white primitives (the critique's "unsubdivided icosphere rock").
      // Frosted warm straw keeps the haystack identity under a pale rime.
      straw: (h, s, l) => [0.105, clamp01(s * 0.42 + 0.06), clamp01(l * 1.02 + 0.10)],
    },
    // terrain_environment r3: l*1.25+0.12 -> l*0.70+0.02 — the near-white
    // boulders read as featureless dough lumps on the snow (probed: the
    // "raw icosphere" in the establishing foreground was rock instance 49
    // at [67,-226]). Under the BRIGHT overcast fill (hemi 0.92, env 0.60)
    // even mid-grey albedo renders pale, so the sides must go properly dark;
    // the geometry's up-facing gradient (props.js) keeps snow-dusted caps.
    rockTone: (h, s, l) => [0.60, 0.05, clamp01(l * 0.70 + 0.02)],
    wallStoneChance: 0.25,
    wallRuns: [
      [-56, 8, -56, 64, 2], [74, 30, 74, 96, 4], [-8, 110, 52, 110, 2],
      [-186, -62, -118, -62, 3], [-64, 218, 8, 218, 4], [196, 108, 258, 108, 2],
      [-266, 66, -212, 66, 1],
      // r2 (content_breadth): the establishing shot's lower-left two-thirds
      // was featureless snowfield — snow-capped field-boundary walls stage
      // the foreground and lead the eye to the frozen lake (basin at
      // [195,-120] r88; camera [40,52,-288] -> [175,-4,-75])
      [66, -244, 138, -244, 2], [138, -244, 138, -186, 1],
      [88, -178, 156, -178, 3],
      // north-shore run beyond the lake for depth layering
      [216, -46, 272, -46, 2],
      // r4 (content_breadth): the establishing frame's bare bottom-left
      // third (projection-probed: screen-left = INCREASING world x for the
      // [40,52,-288]->[175,-4,-75] camera, so the bowl is x 150..260,
      // z -300..-235, south of the [66,-244] run) gets an L-shaped field
      // boundary + a cross run, and the bottom-center approach two more —
      // the quadrant reads composed and holds hull-down cover
      [-24, -206, 48, -206, 2], [-2, -158, 56, -158, 3],
      [150, -262, 224, -262, 2], [224, -262, 224, -306, 1],
      [162, -240, 162, -290, 3],
    ],
    // r3 terrain_environment: winter boulders sink to ~45% — a rock standing
    // proud ON the snow renders as a pale dough ball under the flat overcast
    // (albedo-independent engine fill washes small props); half-drifted rock
    // shoulders read natural and keep their cover role
    rockSink: 0.45,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // r2: haystacks 4 -> 8 (snow-capped stacks as mid-field silhouettes),
    // outcrops 12 -> 15, +1 road wreck — the open snowfield needed more
    // battle-worn anchors between the village and the basin
    // r4 (content_breadth): haystacks 8 -> 12, rocks 150 -> 190, outcrops
    // 15 -> 19 — pairs with the SW wall runs above so the bare bowl west of
    // the establishing camera picks up drifted rocks/stack silhouettes too
    // r5 terrain_environment: craters 22 -> 36 — battle scarring reads
    // LOUDEST on snow (dark pits on white); the map carried almost none
    haystacks: 12, rocks: 190, outcrops: 19, craters: 36, rubblePiles: 0,
    // Legacy-map quality backport: snow-bound modern hulks (the
    // snow-cap shader dusts them like every prop), frozen supply columns
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['k2', 'type10', 't80u', 'leo2a7', 't90m'],
    },
    sandbagLines: 10,
    hedgehogs: 8,
    // world-dressing r1: winter inhabitants — sleds on the snowfield (the
    // snow-cap shader dresses them drifted), firewood in every yard, rail
    // fences along the lanes
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 1, benches: 1, coreClutter: 6,
      sleds: 6,
      troughs: 1, handcarts: 1, carts: 2,
      roadFence: 'fencerail', yardFence: 'fenceplank',
      // DESTRUCTIBLES r1: a frozen supply column + winter bivouacs
      trucks: 3, jeeps: 1, drumClusters: 3, camps: 2,
      modernClutter: { barrier: 4, roadsign: 4, cone: 6, transformer: 3, cablespool: 3 },
    },
  },

  horizon: {
    // r3: the 0.38 snowline left every foothill and the whole near wall bare
    // — with the warm grade on top the range read as tan desert dunes framing
    // a snow map. Snowline dropped to 0.18 (snow-bound to the valley floor,
    // rock only piercing on cliffs), base/rock pushed cold blue-grey and the
    // caps near-white so the ring still reads FROZEN through fog + warm grade.
    baseHex: 0x76839a, amp: 1.04, style: 'alpine', snowline: 0.24,
    // r7: haze 0.8 -> 0.68 — the aerial ramp buried the rebuilt ridge detail
    // (sastrugi/rib texture) under fog by the second row; the overcast scene
    // fog still softens the ring, the bake just stops double-fogging it
    // r8: snowHex 0xf4f8fe -> 0xdfe7f1 and haze 0.68 -> 0.60. The near-white
    // snow wall sat on the tonemap shoulder where the (boosted) sastrugi/rib
    // texture contrast compressed to nothing — the ring rendered as a flat
    // untextured gradient (critique). A step darker drops the wall into the
    // midtones where surface structure actually reads, and the lighter haze
    // stops double-washing it; the scene fog still provides depth recession.
    rockHex: 0x424c66, snowHex: 0xdfe7f1, haze: 0.60,
  },

  sky: {
    // FLAT OVERCAST: higher-but-weak sun (no warm horizon glow), heavy grey
    // cloud deck, raised ambient/env fill so light reads diffuse
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    // turbidity 13 → 8.5: the mie-loaded sky sampled a warm CREAM horizon
    // color that leaked into the fog mix + aerial scatter and tanned the
    // whole alpine ring; 8.5 keeps the milky overcast without the sepia cast
    turbidity: 7.2, rayleigh: 2.2, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    // 0.0018 fogged the alpine wall to a flat cutout by 800 m — 0.0011 keeps
    // the overcast depth while letting snow/rock contrast survive to the ridge
    // envIntensity raised for the ice sheet's sky reflection; sun dropped and
    // hemi raised so light reads flatter/more diffuse (overcast brief)
    // fogMix 0.88 → 0.94: scene fog locks to the COLD tint, not the sky sample
    // r7: 0.0011 -> 0.00088 — with the rebuilt fractal alpine ring the fog
    // was still averaging the 4 ridge rows into one flat cream wall; the
    // lighter fog keeps per-row aerial separation legible
    // r8: 0.00088 -> 0.00064. Debug-painting the ring rows proved the wall's
    // baked snow/rock texture is ~70-90% buried under the white wash stack
    // (scene fog + post.js aerial scatter-in + desat) — no amount of baked
    // contrast survives it. Halving the scene-fog share (0.47 -> 0.27 at
    // 900 m) lets the rebuilt sastrugi/rib/crag structure and the darker
    // alpine recenter finally read; the aerial pass still owns depth grading.
    // terrain_environment r3: envIntensity 0.52 -> 0.60 — the ice sheet's
    // sky-reflection term needs the headroom (roughness floor now 0.13)
    fogDensity: 0.00058, fogTintHex: 0xaebdce, fogMix: 0.82, envIntensity: 0.30,
    // lighting_post r3 (round 3): per-map overcast deck tuning (overrides the
    // sky.js overcast auto-detect values) — a lower/darker broken stratus
    // deck (tint 0xaab2bc -> 0x9aa3ae) reads against the bright snow bounce
    // in the 2-12° establishing band.
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0x9aa3ae,
    cloudAltM: 320, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xdfe7f2, hemiIntensity: 0.74, postExposure: 0.94,
  },

  minimap: {
    base: [170, 178, 186], hard: [128, 122, 114], soft: [150, 168, 186],
    forest: 'rgba(64,80,72,0.85)', forestStroke: 'rgba(38,50,44,0.9)',
    water: 'rgba(158,190,214,0.85)', waterStroke: 'rgba(104,134,158,0.9)',
    roadCasing: 'rgba(60,54,46,0.9)', roadFill: 'rgba(120,108,96,0.95)',
    buildingFill: '#e4e7ec',
  },

  // camera raised (42 -> 56): from 42 m the frozen lake subtends a few pixels
  // of near-grazing sliver and its signature ice sheet could not read at all
  // framed so the frozen lake (the map's signature feature) reads clearly:
  // slightly raised and shifted vs the old [16,42,-302] which caught the
  // sheet at a few pixels of near-grazing sliver
  shot: { pos: [40, 52, -288], look: [175, -4, -75] },
};
