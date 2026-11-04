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
//   weeds and damp hollows, or a shelled city's dust over broken brick and masonry, not the woods' leaf litter.
// Cost: four noise reads for the mosaic, four for the town, and one hash cell per stone layer (no loop, no neighbour
// search, no texture fetch of a layer). uLandTier sets the phones' share: 0 (Low and the phones' lower tiers) the
// mosaic and the town's tones only, 1 adds the stones, 2 the full block.
export const GROUND_SURFACE_GLSL = /* glsl */`  // ground-269 (groundSurfaceShader.ts): the ground-surface table's laws — the open ground's mosaic, the close stones and
  // the town floor, by class code (groundSurfaces.ts)
  {
    // the detail relief's cap (SPLAT_NORMAL_FRAG): the turf's own on the sward, the ground's elsewhere, none on rock
    gGsTilt = uGsNear.x > 0.0 && fR < 0.5 ? mix(uGsNear.y, uGsNear.x, clamp(meadowG, 0.0, 1.0)) : 0.0;
    vec2 gsSun = normalize(uSunDirW.xz + vec2(1e-4));
    float gsOff = (1.0 - roadCore) * (1.0 - fMs) * (1.0 - projW);
    // the open ground's 1–10 m mosaic (sward, tussock)
    float gsThin = 0.0;
    float gsSwardW = uGsOpen.y * meadowG * (1.0 - fR) * (1.0 - max(gCropW, gSoilW)) * (1.0 - woods) * gsOff
      * (1.0 - smoothstep(120.0, 240.0, camDist)) * tileVis(2.5);
    if (uGsOpen.x > 0.5 && uGsOpen.x < 2.5 && gsSwardW > 0.003) {
      vec2 gsM = nzq(uvW, 0.071, vec2(0.61, 0.17));
      float gsF = nzq(uv, 0.23, vec2(0.13, 0.77)).x;
      float tus = step(1.5, uGsOpen.x);
      // (thresholds on the noise's measured spread: nzq p25 0.43, p50 0.51, p75 0.59, p90 0.66)
      float lush = smoothstep(0.52, 0.64, gsM.x);
      float cured = smoothstep(0.54, 0.66, gsM.y) * (1.0 - lush);
      gsThin = smoothstep(mix(0.55, 0.50, tus), mix(0.65, 0.60, tus), gsF * 0.5 + (1.0 - gsM.x) * 0.5) * (1.0 - lush);
      float gsL = reduxLuma(a.rgb);
      vec3 soilC = uMeanD.rgb * uSoilTint * (0.80 + 0.40 * gsF) * mix(1.0, 1.10, cured);
      vec3 gsA = a.rgb;
      gsA = mix(gsA, gsA * vec3(0.80, 0.92, 0.82), lush * 0.85);
      gsA = mix(gsA, mix(gsA, vec3(gsL) * uTintA * 1.12, 0.55), cured * 0.75);
      gsA = mix(gsA, mix(gsA, soilC, 0.70), gsThin * 0.80);
      a.rgb = mix(a.rgb, gsA, min(1.0, gsSwardW));
      gsThin *= gsSwardW;
    }
    // the town floor: the village's worn ground (the share fD took from the village mask)
    float gsTownW = 0.0;
    if (uGsTown.x > 0.5) {
      gsTownW = clamp(mk.a * uTownWear * (0.35 + 0.65 * n1), 0.0, 1.0) * keepM * (1.0 - seaSand) * gsOff * (1.0 - fR);
      if (gsTownW > 0.003) {
        vec2 tq = nzq(uvW, 0.11, vec2(0.37, 0.83));
        float tf = nzq(uv, 0.31, vec2(0.71, 0.29)).y;
        // the floor's own tone: the map's soil greyed to a pale gravel (luminance 0.22, its hue a third kept), carrying a third
        // of the drawn ground's grain (the woods' litter of the dirt set read as twigs and straw on a town's yards)
        float gL = reduxLuma(a.rgb), dL = max(reduxLuma(uMeanD.rgb), 0.02);
        vec3 grey = mix(vec3(dL), uMeanD.rgb, 0.35) * uSoilTint;
        grey *= (0.22 / max(reduxLuma(grey), 0.02)) * mix(1.0, gL / dL, 0.33);
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
          floorC = grey * vec3(1.06, 1.03, 0.99) * 1.10 * (0.88 + 0.24 * tf);
          floorC = mix(floorC, vec3(0.30, 0.17, 0.12) * (0.85 + 0.30 * tf), brick * 0.65);
          floorC = mix(floorC, vec3(0.34, 0.33, 0.31) * (0.85 + 0.30 * tf), conc * 0.60);
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
      float gsOpenS = uGsOpen.z > 0.5 ? gsThin * uGsOpen.w : 0.0;
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
        float dens = kind > 1.5 && kind < 2.5 ? 0.70 : 0.42;
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
        vec3 stoneC = mix(vec3(gL), a.rgb, 0.35) * (0.80 + 0.70 * h.x);
        if (kind > 2.5) stoneC = h2.y > 0.55 ? vec3(0.31, 0.17, 0.12) * (0.80 + 0.40 * h.x) : vec3(0.36, 0.35, 0.33) * (0.75 + 0.50 * h.x);
        a.rgb = mix(a.rgb, stoneC, disc * gsS);
        a.rgb *= 1.0 - 0.38 * shd * gsS;
        n.xy += d * disc * 0.45 * gsS;
        a.a = mix(a.a, 0.90, disc * gsS);
      }
    }
  }`;
