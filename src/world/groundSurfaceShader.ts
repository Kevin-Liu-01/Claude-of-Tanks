// src/world/groundSurfaceShader.ts — the ground-surface table's laws in the terrain splat (item ground-269, 2026-11-04;
// DECISIONS "Ground detail and textures on every map"). terrain.ts interpolates the chunk once, in place inside
// splatCompute() of SPLAT_COMMON_FRAG, after the cover's own patchwork and before the borders, so it reads the
// composed albedo and the coverage weights there (a, n, fD, fR, fMs, meadowG, projW, roadCore, mk, keepM, uv, uvW, n1, n1h,
// gCropW, gSoilW, woods, camDist, gFootM …). The CPU side (classes, map rows, codes, uniforms) is groundSurfaces.ts.
//
// Three laws, each by class code, never by map:
// - the open ground's mosaic (uGsOpen.x 1 sward, 2 tussock): at 1–10 m a sward is lush in clumps, cured in others, and
//   thin over its soil between them — the scale between the photo tile's 4 m and the macro tints' 80 m, where the ground
//   read as one lawn tone ("looks flat"). Every state is a multiple of the ground's own colour or its soil's (no state
//   below 0.8 of the turf's light: the old near-black blotches are what the owner called the black spaces);
// - the close stones (uGsOpen.z / uGsWorn.z 1 stones, 2 grit, 3 debris): one stone per hash cell, each its own shade,
//   domed, with its contact shadow down-sun; on the worn soil, the sward's thin patches and the town floor;
// - the town floor (uGsTown.x 4 yard, 5 rubble): the village's worn ground is a yard of trodden earth and gravel with
//   weeds and damp hollows, or a shelled city's dust over broken brick and masonry, not the woods' leaf litter;
// - the works floor (uGsTown.x 6 slag; GROUND_SURFACE_WORKS_GLSL, after the roads): a works' lots, roads and hardstands,
//   or a rail yard's cinder off its streets, carry ash drifts, rust-stained and oil-damp ground and clinker lumps.
// Cost: four noise reads for the mosaic, five for the town, two for the works floor, and one hash cell per stone layer
// (no loop, no neighbour search, no texture fetch of a layer). uLandTier sets the phones' share: 0 (Low and the phones' lower tiers) the
// mosaic and the town's tones only, 1 adds the stones, 2 the full block.
export const GROUND_SURFACE_GLSL = /* glsl */`  // ground-269 (groundSurfaceShader.ts): the ground-surface table's laws — the open ground's mosaic, the close stones and
  // the town floor, by class code (groundSurfaces.ts)
  {
    // the detail relief's cap (SPLAT_NORMAL_FRAG): the turf's own on the sward, the ground's elsewhere, none on rock
    gGsTilt = uGsNear.x > 0.0 && fR < 0.5 ? mix(uGsNear.y, uGsNear.x, clamp(meadowG, 0.0, 1.0)) : 0.0;
    vec2 gsSun = normalize(uSunDirW.xz + vec2(1e-4));
    // (ab7, Ironworks: the mosaic's straw and soil laid orange flecks and combed straw over the slag the works' turf had
    // become) a works' floor is no sward and no soil of the table's: its own law draws it (GROUND_SURFACE_WORKS_GLSL)
    float gsOff = (1.0 - roadCore) * (1.0 - fMs) * (1.0 - projW) * (1.0 - gWorksFloor);
    // the open ground's 1–10 m mosaic (sward, tussock)
    float gsThin = 0.0;
    float gsSwardW = uGsOpen.y * meadowG * (1.0 - fR) * (1.0 - max(gCropW, gSoilW)) * (1.0 - woods) * gsOff
      * (1.0 - smoothstep(120.0, 240.0, camDist)) * tileVis(2.5);
    if (uGsOpen.x > 0.5 && uGsOpen.x < 2.5 && gsSwardW > 0.003) {
      // (ab3: at a grazing view the fine field's metre features stretched into thin arcs across the turf) each field eases to
      // its median once its features stop resolving — the patches' ~4 m and the fine field's ~1 m held while they span
      // ten pixels along the footprint's long axis — so the mosaic leaves the far ground as its mean, never as streaks
      vec2 gsM = mix(vec2(0.5), nzq(uvW, 0.071, vec2(0.61, 0.17)), tileVis(4.0));
      float gsF = mix(0.5, nzq(uv, 0.23, vec2(0.13, 0.77)).x, tileVis(1.2));
      float tus = step(1.5, uGsOpen.x);
      // (thresholds on the noise's measured spread: nzq p25 0.43, p50 0.51, p75 0.59, p90 0.66)
      float lush = smoothstep(0.52, 0.64, gsM.x);
      float cured = smoothstep(0.54, 0.66, gsM.y) * (1.0 - lush);
      gsThin = smoothstep(mix(0.55, 0.50, tus), mix(0.65, 0.60, tus), gsF * 0.5 + (1.0 - gsM.x) * 0.5) * (1.0 - lush);
      // cured straw and bare soil in their own light, not the turf's (ab2: on Ruinspires' and Suzhou's muted turf the states
      // as multiples of the green read as nothing): a sward's dead patches a pale straw (luminance ~0.13, the map's dry
      // tint uTintA its hue), its bare earth the map's soil at ~0.10, each grained by the noise alone (the critics' first
      // round on Suzhou Creek: the photo grass's blade strokes carried into the straw read as combed, curved brush strokes
      // across the hill)
      // (ab7, Cliffbridge: on a bright steppe those levels sat under the turf, and its warm dry swaths read as dull grey-olive
      // smudges) neither state darker than the turf it lies in: the straw a shade paler than the turf's mean, the soil a
      // shade under it; on a muted turf the levels above
      float turfL = reduxLuma(uMeanG.rgb * gMeadowTint);
      vec3 strawC = vec3(0.15, 0.13, 0.08) * uTintA / max(reduxLuma(uTintA), 0.3) * max(1.0, turfL * 1.12 / 0.131)
        * (0.88 + 0.24 * gsF);
      vec3 soilC = uMeanD.rgb * uSoilTint;
      soilC *= (max(0.10, turfL * 0.92) / max(reduxLuma(soilC), 0.02)) * (0.84 + 0.32 * gsF);
      vec3 gsA = a.rgb;
      gsA = mix(gsA, gsA * vec3(0.80, 0.92, 0.82), lush * 0.85);
      gsA = mix(gsA, strawC, cured * 0.55);
      gsA = mix(gsA, soilC, gsThin * 0.60);
      a.rgb = mix(a.rgb, gsA, min(1.0, gsSwardW));
      gsThin *= gsSwardW;
    }
    // the town floor: the village's worn ground (the share fD took from the village mask)
    float gsTownW = 0.0;
    if (uGsTown.x > 3.5 && uGsTown.x < 5.5) {
      gsTownW = clamp(mk.a * uTownWear * (0.35 + 0.65 * n1), 0.0, 1.0) * keepM * (1.0 - seaSand) * gsOff * (1.0 - fR);
      // (ab7, Ruinspires: the rubble's weeds were a 3 m field, gone past ~60 m, and the floor laid one grey apron across the
      // ground before the town — "B is greyish and flat" where the turf had run to the walls) a shelled city's turf
      // stands through its rubble in 20 m tongues, resolved to the horizon
      if (uGsTown.x > 4.5) gsTownW *= 1.0 - 0.8 * smoothstep(0.40, 0.56, nz(uvW, 0.047, vec2(0.29, 0.71)).b);
      if (gsTownW > 0.003) {
        vec2 tq = mix(vec2(0.5), nzq(uvW, 0.11, vec2(0.37, 0.83)), tileVis(3.0)); // (eased to the median past resolution)
        float tf = mix(0.5, nzq(uv, 0.31, vec2(0.71, 0.29)).y, tileVis(0.9));
        // the floor's own tone: the map's soil greyed toward a gravel, its light three tenths of the way from the drawn
        // ground's own to a pale gravel's 0.20 (the critics' rounds on Suzhou Creek: a paler floor laid a flat sandy apron
        // round the towers), carrying a third of the drawn ground's grain (the woods' litter of the dirt set: twigs, straw)
        float gL = reduxLuma(a.rgb), dL = max(reduxLuma(uMeanD.rgb), 0.02);
        vec3 grey = mix(vec3(dL), uMeanD.rgb, 0.35) * uSoilTint;
        grey *= (mix(min(gL, 0.20), 0.20, 0.3) / max(reduxLuma(grey), 0.02)) * mix(1.0, gL / dL, 0.33);
        vec3 floorC;
        if (uGsTown.x < 4.5) {
          // yard: pale trodden gravel and earth, its paths paler, its hollows damp, weeds where nothing treads
          float path = smoothstep(0.50, 0.62, tq.x);
          float hollow = smoothstep(0.55, 0.67, tq.y) * (1.0 - path);
          float weeds = smoothstep(0.56, 0.68, 1.0 - tq.x) * smoothstep(0.45, 0.60, tf);
          floorC = grey * vec3(1.04, 1.02, 0.97) * (0.90 + 0.20 * tf);
          floorC *= mix(1.0, 1.10, path) * mix(1.0, 0.82, hollow);
          floorC = mix(floorC, uMeanG.rgb * gMeadowTint * (0.85 + 0.30 * tf), weeds * 0.80);
          a.a = mix(a.a, mix(0.95, 0.80, hollow), gsTownW);
        } else {
          // rubble: pale dust over broken masonry, brick-red and concrete-grey drifts, a little green through it
          float brick = smoothstep(0.54, 0.66, tq.x);
          float conc = smoothstep(0.52, 0.64, tq.y) * (1.0 - brick);
          float weeds = smoothstep(0.60, 0.70, tf) * (1.0 - brick) * (1.0 - conc);
          // (round 1: "pale pink ground scattered with white and orange chips like confetti") the drifts a shade off the dust,
          // not painted over it
          // (and its tone in 20 m drifts too, which the far ground keeps when the 9 m and 3 m fields have eased away)
          floorC = grey * vec3(1.04, 1.02, 1.0) * (0.90 + 0.20 * tf) * (0.90 + 0.22 * n1h);
          floorC = mix(floorC, floorC * vec3(1.18, 0.86, 0.76), brick * 0.45);
          floorC = mix(floorC, floorC * vec3(0.92, 0.93, 0.95), conc * 0.40);
          floorC = mix(floorC, uMeanG.rgb * gMeadowTint, weeds * 0.60);
          a.a = mix(a.a, 0.96, gsTownW);
        }
        a.rgb = mix(a.rgb, floorC, gsTownW);
        // the floor's fine grit: one small stone per 0.13 m cell, a shade off the floor and lit on its sun side (a second
        // hash cell, the Low tier without it)
        float gritW = gsTownW * tileVis(0.13) * (1.0 - smoothstep(18.0, 40.0, camDist)) * step(0.5, uLandTier);
        if (gritW > 0.003) {
          vec2 gq = wp.xz / 0.13, gi = floor(gq), gf = gq - gi - 0.5;
          vec2 gh = cellHash2(gi + vec2(7.0, 101.0));
          vec2 gd = (gf - (gh - 0.5) * 0.4) / mix(0.20, 0.34, gh.x);
          float gdisc = (1.0 - smoothstep(0.7, 1.0, length(gd))) * step(gh.y, 0.62);
          a.rgb *= 1.0 + gdisc * gritW * ((gh.x - 0.5) * 0.55 + 0.18 * dot(normalize(gd + 1e-4), gsSun));
        }
      }
    }
    // the close stones: one per hash cell, on the worn soil, the sward's thin patches and the town floor
    if (uLandTier > 0.5) {
      // (on a sward the stones lie where it thins over its soil; a class with no mosaic of the table's — sand, snow, the
      // canyons' hardpan, regolith, gravel — carries them over its open ground)
      float gsOpenS = uGsOpen.z > 0.5 ? (uGsOpen.x > 0.5 && uGsOpen.x < 2.5 ? gsThin : meadowG * (1.0 - fR) * gsOff) * uGsOpen.w : 0.0;
      float gsWornS = uGsWorn.z > 0.5 ? fD * (1.0 - gsTownW) * keepM * gsOff * uGsWorn.w : 0.0;
      float gsTownS = uGsTown.y > 0.5 ? gsTownW * uGsTown.z : 0.0;
      float kind = gsTownS > max(gsOpenS, gsWornS) ? uGsTown.y : gsWornS > gsOpenS ? uGsWorn.z : uGsOpen.z;
      float gsS = max(gsOpenS, max(gsWornS, gsTownS)) * mix(0.55, 1.0, step(1.5, uLandTier));
      // grit: dense and small; debris: larger and angular; stones: between
      float cellM = kind > 2.5 ? 0.42 : kind > 1.5 ? 0.16 : 0.30;
      gsS *= tileVis(cellM) * (1.0 - smoothstep(25.0, 60.0, camDist));
      if (gsS > 0.003) {
        vec2 q = wp.xz / cellM, ci = floor(q), f = q - ci - 0.5;
        vec2 h = cellHash2(ci + vec2(41.0, 7.0)), h2 = cellHash2(ci + vec2(13.0, 59.0));
        float dens = kind > 1.5 && kind < 2.5 ? 0.70 : kind > 2.5 ? 0.26 : 0.42;
        float on = step(h.y, dens);
        float r = mix(0.16, 0.36, h.x);
        vec2 c = (h2 - 0.5) * (1.0 - 2.0 * r);
        vec2 d = (f - c) / r;
        float ang = h2.x * 6.2832;
        vec2 dr = vec2(cos(ang) * d.x - sin(ang) * d.y, sin(ang) * d.x + cos(ang) * d.y) * vec2(1.0, 1.0 + 0.6 * h2.y);
        float sd = kind > 2.5 ? max(abs(dr.x), abs(dr.y)) * 1.1 : length(dr);
        float disc = (1.0 - smoothstep(0.78, 1.0, sd)) * on;
        float shd = (1.0 - smoothstep(0.65, 1.15, length(d + gsSun * 0.38))) * on * (1.0 - disc);
        float gL = reduxLuma(a.rgb);
        // (on bright ground — snow, pale sand — a stone or a clod varies less and its shadow carries its form)
        vec3 stoneC = mix(vec3(gL), a.rgb, 0.35) * mix(0.80 + 0.70 * h.x, 0.90 + 0.18 * h.x, smoothstep(0.35, 0.65, gL));
        // (round 1's "confetti": the chips a fixed white and orange) a broken brick or a piece of concrete, a shade off the
        // floor it lies on
        if (kind > 2.5) stoneC = mix(vec3(gL), a.rgb, 0.4) * (h2.y > 0.55 ? vec3(1.12, 0.78, 0.66) : vec3(1.05, 1.05, 1.06)) * (0.72 + 0.50 * h.x);
        a.rgb = mix(a.rgb, stoneC, disc * gsS);
        a.rgb *= 1.0 - 0.38 * shd * gsS;
        n.xy += d * disc * 0.45 * gsS;
        a.a = mix(a.a, 0.90, disc * gsS);
      }
    }
  }`;


/** The works floor (uGsTown.x 6: the slag and cinder classes' town floor), interpolated once in splatCompute() after the
 * roads, so it lies over a works' lots, roads and hardstands alike (gWorksFloor) and over a rail yard's cinder off its
 * streets (yardW): Low and the phones' lower tiers draw its tones only. */
export const GROUND_SURFACE_WORKS_GLSL = /* glsl */`  // ground-269 (groundSurfaceShader.ts): the works floor — a slag or cinder town floor over the lots, roads and hardstands
  // (ab7, Cinder Junction on the phone: the yard's coal-dust floor "near-black and featureless" beside the brick paths)
  float wkF = uGsTown.x > 5.5 ? max(gWorksFloor, yardW * (1.0 - roadCore) * keepM) : 0.0;
  if (wkF > 0.003) {
    // (ab7, Ironworks: the slag lots, the works roads and the hardstands one black-grey tone from the chase camera to the
    // horizon — "dark asphalt with only track prints", flat on every view) ash blown into drifts, rust-stained ground,
    // oil-damp hollows at 4–20 m, each a multiple of the floor's own tone or a pale ash (none under 0.8 of the floor: no
    // black); the 20 m drifts held to the horizon, the 9 m field eased to its median past resolution
    vec2 wq = mix(vec2(0.5), nzq(uvW, 0.11, vec2(0.83, 0.47)), tileVis(3.0));
    float ash = max(smoothstep(0.56, 0.70, wq.x), 0.6 * smoothstep(0.54, 0.72, n1h));
    float rust = smoothstep(0.55, 0.68, wq.y) * (1.0 - ash);
    float damp = smoothstep(0.60, 0.72, 1.0 - wq.x) * (1.0 - rust);
    vec3 wk = mix(a.rgb, mix(vec3(reduxLuma(a.rgb)), vec3(0.170, 0.165, 0.155), 0.75), ash * 0.55);
    wk = mix(wk, wk * vec3(1.45, 1.08, 0.80), rust * 0.65);
    wk *= 1.0 - 0.18 * damp;
    a.rgb = mix(a.rgb, wk, wkF);
    a.a = mix(a.a, 0.80, damp * wkF);
    // the clinker: one lump per 0.16 m cell within ~40 m, a shade off the floor, lit on its sun side, domed in the normal
    float gritW = wkF * uGsTown.z * tileVis(0.16) * (1.0 - smoothstep(20.0, 45.0, camDist)) * step(0.5, uLandTier);
    if (gritW > 0.003) {
      vec2 gq = wp.xz / 0.16, gi = floor(gq), gf = gq - gi - 0.5;
      vec2 gh = cellHash2(gi + vec2(23.0, 71.0));
      vec2 gd = (gf - (gh - 0.5) * 0.4) / mix(0.22, 0.38, gh.x);
      float gdisc = (1.0 - smoothstep(0.7, 1.0, length(gd))) * step(gh.y, 0.55);
      a.rgb *= 1.0 + gdisc * gritW * ((gh.x - 0.5) * 0.60 + 0.20 * dot(normalize(gd + 1e-4), normalize(uSunDirW.xz + vec2(1e-4))));
      n.xy += gd * gdisc * 0.35 * gritW;
    }
  }`;
