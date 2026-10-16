// src/world/roadSurfaceShader.ts — the roads' GLSL in the terrain splat (terrain.ts SPLAT_COMMON_FRAG interpolates both
// chunks in place, inside splatCompute(), so they read its locals: a, n, nrmOn, uv, wp, mk, dRoad, gRoad*, tileVis, …).
// Ground lane, 2026-10-14 (the R1c landing, GND-01): moved out of terrain.ts byte for byte so the road rounds (R3, R5)
// edit this file instead of the token-held terrain.ts; the evaluated SPLAT_COMMON_FRAG is unchanged by the move
// (roadSurfaceShader.selftest.mjs). The CPU side (catalogue, classes, uniforms) is roadSurfaces.ts.

/** R1a: the dirt carriageway as a worked surface (grooved ruts, treads, crown, windrow, stones, potholes, washboard). */
export const ROAD_CARRIAGEWAY_GLSL = /* glsl */`    // roads lane R1a (2026-10-09; owner: "make sure roads and stuff are really good", R029 "the roads are so flat"; the
    // gauntlet: "flat grey or near-black roads", "a flat smeared pink-brown band with no ruts, ridges or tyre marks",
    // Redrock's "smeared tracks"): the carriageway as a worked surface — the wheel ruts as grooves (a floor, steep walls,
    // the soil squeezed up in a lip beside each, the floor beside the sun's wall in the wall's shadow) instead of two soft
    // painted bands; the vehicles' treads printed in their floors; the crown and camber; the grader's windrow of loose
    // stone at the edge; stones strewn on the crown and the edges and swept out of the wheel paths; potholes, puddled on
    // a wet map; washboard on an arid track. Each term holds while its feature spans enough pixels across its own
    // direction (stripeVis: a groove seen down the road holds far past tileVis's grazing major axis) and fades to tone
    vec2 acrU = gradD / max(length(gradD), 0.25);
    float wR = roadCore * (1.0 - gRoadTex);
    // (the tier: Low draws none of it, Medium the grooves alone, High everything)
    if (dW > 0.002 && wR > 0.002 && uRoadSurf.x + uRoadSurf.y + uRoadSurf.z + uRoadSurfB.x > 0.0 && uLandTier > 0.5) {
      float e = dRoad - 1.55 - laneWob, ae = abs(e), se = e < 0.0 ? -1.0 : 1.0;
      float fwA = max(abs(dot(gDwX, acrU)) + abs(dot(gDwY, acrU)), 1e-4);
      float relV = stripeVis(0.60, acrU) * uRoadSurf.x;
      grooveRel = relV * wR;
      rutShade = mix(1.0, uRoadSurfB.z, grooveRel);
      // (1) the profile across the road, metres: h = -depth·groove + lip·lip + crown + windrow
      float wg = 0.30, sw = max(0.09, 1.6 * fwA);
      float tW = clamp((ae - (wg - sw)) / (2.0 * sw), 0.0, 1.0);
      float groove = 1.0 - tW * tW * (3.0 - 2.0 * tW);
      float depth = (0.035 + 0.05 * rutAmp) * min(uRoadRuts.x, 1.5);
      float lipX = (ae - wg - sw - 0.08) / 0.11;
      float lip = exp(-lipX * lipX) * (se > 0.0 ? 1.0 : 0.7) * rutAmp;
      float hwv = max(roadHalfB, 2.6);
      float wX = (dRoad - hwv + 0.10) / 0.28;
      float windrow = exp(-wX * wX) * uRoadSurfB.w * roadCore;
      float dh = depth * 6.0 * tW * (1.0 - tW) / (2.0 * sw) * se
        - 0.04 * 2.0 * lipX / 0.11 * lip * se
        - 0.10 * dRoad / (hwv * hwv) * roadCore
        - 0.035 * 2.0 * wX / 0.28 * windrow;
      // (R2, the first frames: seen from 12–16 m up the grooves' walls and their shadow drew two thin dark lines — the
      // gauntlet's old "ink lines") a wall ~0.15 m across holds while it spans enough pixels across the road; past that the
      // groove is its soft floor tone alone
      float wallV = stripeVis(2.4, acrU);
      if (nrmOn) n.xy -= 0.5 * dh * acrU * relV * wallV * (1.0 - gRoadTex);
      // the floor compacted and cleaner, the lip loose and paler; the floor beside the wall on the sun's side shaded by it
      float sunA = dot(uSunDirW.xz, acrU);         // > 0: the sun stands outward of the road, its light falls inward
      float shL = depth * abs(sunA) / max(uSunDirW.y, 0.08);
      float uS = sunA >= 0.0 ? e : -e;             // the wall on the sun's side at uS = +wg
      float shade = groove * smoothstep(wg - shL - sw, wg - shL + sw, uS) * step(0.02, abs(sunA));
      // (r4 frames: near the camera the grooves read as black channels on Monsoon and Amberford) the wall's shadow and the
      // floor's tone held soft — the relief's own shading carries most of the groove
      a.rgb *= 1.0 - (0.045 * groove * rutAmp + (0.14 * shade - 0.05 * lip) * wallV - 0.05 * windrow) * relV * wR;
      // (2) the treads printed in a rut's floor: a tank's track plates (0.16 m pitch) or a lorry's chevrons (0.128 m),
      // one vehicle's print a 9 m stretch (both its ruts), some stretches worn smooth — laid in the road frame
      if (gRoadFrameW > 0.5 && uRoadSurf.w > 0.0 && uLandTier > 1.5) {
        // (R2: the first frames' treads read as a ruled ladder down whole ruts) a print holds a few metres where the last
        // vehicle passed, worn in and out (field b at 0.09), its bars uneven, centred in the groove's floor
        vec2 ph = cellHash2(vec2(floor(gRoadS / 9.0), 7.0));
        float chevron = step(0.55, ph.x);
        float pitch = mix(0.16, 0.128, chevron);
        float floorW = 1.0 - smoothstep(0.08, 0.24, ae);
        float hold = smoothstep(0.45, 0.70, nz(vec2(gRoadS, ae * 4.0), 0.09, vec2(0.17, 0.59)).g);
        float tv = stripeVis(pitch, gRoadAlong) * floorW * hold * step(ph.x, 0.62) * rutAmp * uRoadSurf.w * gRoadFrameW * wR;
        if (tv > 0.01) {
          float barI = floor((gRoadS + chevron * 0.55 * ae) / pitch);
          float phase = 6.2831853 * ((gRoadS + chevron * 0.55 * ae) / pitch + ph.y);
          float barK = 0.45 + 0.55 * cellHash2(vec2(barI, ph.y * 97.0)).x;
          if (nrmOn) n.xy += 0.5 * 0.006 * (6.2831853 / pitch) * sin(phase) * gRoadAlong * tv * barK;
          a.rgb *= 1.0 - 0.03 * (0.5 - 0.5 * cos(phase)) * tv * barK;
        }
      }
      // (3) stones: one candidate a 0.12 m cell, strewn on the crown and the edges, swept out of the wheel paths; past
      // their own pixels, their speckle
      if (uRoadSurf.y > 0.0 && uLandTier > 1.5) {
        float crownW = 1.0 - smoothstep(0.5, 1.1, dRoad);
        float edgeW = smoothstep(hwv - 1.4, hwv - 0.2, dRoad);
        float dens = uRoadSurf.y * (0.06 + 0.30 * crownW + 0.34 * edgeW + 0.40 * windrow) * (1.0 - 0.8 * groove);
        float sv = tileVis(0.12);
        if (sv > 0.01) {
          vec2 sp = wp.xz / 0.12, sci = floor(sp), scf = fract(sp);
          vec2 h1 = cellHash2(sci + vec2(19.0, 3.0));
          if (h1.x < dens) {
            vec2 h2 = cellHash2(sci + vec2(-7.0, 41.0));
            vec2 dv = (scf - (0.30 + 0.40 * h2)) / (0.14 + 0.16 * h1.y);
            float q = dot(dv, dv);
            if (q < 1.6) {
              float body = 1.0 - smoothstep(0.80, 1.0, q);
              vec3 stoneC = mix(uMeanR.rgb, a.rgb, 0.35) * (0.70 + 0.55 * h2.x);
              a.rgb = mix(a.rgb, stoneC, body * sv * wR);
              a.rgb *= 1.0 - 0.30 * smoothstep(0.85, 1.0, q) * (1.0 - smoothstep(1.0, 1.6, q)) * sv * wR; // its seat's shadow
              if (nrmOn) n.xy += 0.5 * dv * 0.9 * body * sv * wR;
            }
          }
        }
        float gritV = tileVis(0.43) * (1.0 - sv) * (1.0 - smoothstep(30.0, 80.0, camDist));
        if (gritV > 0.01) {
          float grit = nz(uv, 2.3, vec2(0.71, 0.13)).r;
          a.rgb *= 1.0 - (0.22 * smoothstep(0.66, 0.88, grit) - 0.10 * (1.0 - smoothstep(0.04, 0.22, grit))) * min(dens * 1.6, 1.0) * gritV * wR;
        }
      }
      // (4) potholes: one candidate a 5 m world cell, an oval bowl 0.6–1.8 m long down the road, its floor damp and, on a
      // wet map, holding water; its rim of crumbs paler
      if (uRoadSurf.z > 0.0 && uLandTier > 1.5) {
        float hv = tileVis(1.2);
        vec2 pci = floor(wp.xz / 5.0);
        vec2 p1 = cellHash2(pci + vec2(61.0, 17.0));
        if (hv > 0.01 && p1.x < 0.16 * uRoadSurf.z) {
          vec2 p2 = cellHash2(pci + vec2(5.0, 89.0));
          vec2 pc = (pci + 0.25 + 0.5 * p2) * 5.0;
          vec2 al = gRoadFrameW > 0.5 ? gRoadAlong : vec2(-acrU.y, acrU.x);
          vec2 dq = wp.xz - pc;
          vec2 pe = vec2(dot(dq, al) / (0.30 + 0.60 * p1.y), dot(dq, vec2(-al.y, al.x)) / (0.28 + 0.40 * p2.y));
          float q = dot(pe, pe);
          if (q < 1.5) {
            float bowl = q < 1.0 ? (1.0 - q) * (1.0 - q) : 0.0;
            float rim = smoothstep(0.85, 1.05, q) * (1.0 - smoothstep(1.05, 1.5, q));
            float pw = hv * wR;
            if (nrmOn && q < 1.0) {
              vec2 gq = 2.0 * vec2(pe.x / (0.30 + 0.60 * p1.y), pe.y / (0.28 + 0.40 * p2.y));
              vec2 gw = gq.x * al + gq.y * vec2(-al.y, al.x);    // ∇q in world xz
              n.xy -= 0.5 * (0.10 * 2.0 * (1.0 - q)) * gw * pw;  // h = -0.10·(1 - q)², ∇h = 0.20·(1 - q)·∇q
            }
            a.rgb *= 1.0 - (0.22 * bowl - 0.07 * rim) * pw;
            if (uReduxD.y < 0.5) {
              // (R2: a whole-sky mirror in a small oval read as a blue paint dot) muddy water — its own brown, half the gloss
              float pond = smoothstep(0.30, 0.70, bowl) * uRoadPuddle * pw;
              a.rgb = mix(a.rgb, a.rgb * 0.42 + uMeanD.rgb * 0.10, pond);
              n.xy = mix(n.xy, vec2(0.5), pond);
              gRoadPuddle = max(gRoadPuddle, pond * 0.45);
            }
          }
        }
      }
      // (5) washboard: corrugations across an arid track every 0.8 m, in stretches, strongest in the wheel paths
      if (uRoadSurfB.x > 0.0 && gRoadFrameW > 0.5 && uLandTier > 1.5) {
        float wv = stripeVis(0.8, gRoadAlong) * uRoadSurfB.x * gRoadFrameW * wR * (0.55 + 0.45 * lane);
        if (wv > 0.01) wv *= smoothstep(0.42, 0.62, nz(uv, 0.011, vec2(0.27, 0.59)).g);
        if (wv > 0.01) {
          float wph = 6.2831853 * gRoadS / 0.8;
          if (nrmOn) n.xy += 0.5 * 0.025 * (6.2831853 / 0.8) * sin(wph) * gRoadAlong * wv;
          a.rgb *= 1.0 + 0.04 * cos(wph) * wv;
        }
      }
    }`;

/** R1c: the paved surfaces in the road's frame (setts, asphalt, clinker, brick soling, concrete; kerbs, gutters, wet). */
export const ROAD_PAVING_GLSL = /* glsl */`      // roads lane R1c (2026-10-09; owner: the roads "need to look a lot better, especially paved ones"; the gauntlet:
      // Steinburg's street "a flat near-black band … no cobble, kerb, wear", its square "a uniform grey cobble plane",
      // Suzhou Creek's "navy-black asphalt plane", Ruinspires' "featureless blue-grey asphalt"): the surface here is a
      // styled path's own, else the map's paved class (splat.pavedSurface: its streets, and its squares off any
      // centreline), else the R layer's print as before (and the airfield's slabs) — each drawn in the road's frame
      // a kerbed town's streets paved out to the kerbs' face (props.ts KERB_OFFSET_M 5.05: splat.pavedSurface.kerbs)
      float paveTownW = 0.0;
      if (uPaveTown.z > 0.0 && uLandTier > 0.5) {
        vec2 tq = abs(wp.xz - uPaveTown.xy) - uPaveTown.zw;
        paveTownW = 1.0 - smoothstep(0.0, 6.0, max(tq.x, tq.y));
        paveCore = max(paveCore, paveTownW * (1.0 - smoothstep(4.95, 5.10, dRoad)) * gRoadTex * step(dRoad, 11.9));
      }
      float onStreet = max(1.0 - smoothstep(roadHalf + 0.6, roadHalf + 2.4, dRoad), paveTownW * (1.0 - smoothstep(5.1, 5.4, dRoad)));
      float streetCls = paveTownW > 0.5 && uPaveExtra.y > 0.5 ? uPaveExtra.y : uPaveClass.x;
      float pCls = gRoadClass > 0.5 && abs(gRoadClass - 4.0) > 0.5 ? gRoadClass : (onStreet > 0.5 ? streetCls : uPaveClass.y);
      if (uLandTier < 0.5) pCls = gRoadClass > 0.5 && gRoadClass < 3.5 ? gRoadClass : 0.0; // (Low: the old law)
      vec4 pav = vec4(0.0), pnn = NRM_MEAN;
      if (pCls < 0.5) {
        pav = splatSamp(uAlbR, uv * 0.31, df, mipB, uMeanR);
        pnn = splatSamp(uNrmR, uv * 0.31, df, mipB, NRM_MEAN);
        pnn.z = 0.5;
        float pvar = nz(uv, 0.037, vec2(0.77, 0.19)).r; // NB: "patch" is a reserved word in GLSL ES
        // r6: 0.86+0.26 -> 0.72+0.22 — the near-white sett sheet under a blue
        // sky ambient read as a frozen canal; darker worn stone keeps the
        // street below the facade value range
        pav.rgb *= 0.72 + smoothstep(0.35, 0.75, pvar) * 0.22;
        if (uPaveSlab.x > 0.0) {
          // maps lane B (2026-10-03, the gauntlet: Kestrel Airfield's apron "reads as a cobbled plaza"): airfield
          // concrete in place of the map's sett print — square slabs with sealed expansion joints, a tone per slab (pours
          // of different age), the aggregate's mottle, oil and fuel stains, and rubber streaks along the runway's axis
          vec2 slabP = wp.xz / uPaveSlab.x;
          vec2 slabH = cellHash2(floor(slabP));
          vec2 slabF = fract(slabP);
          vec2 jointD = min(slabF, 1.0 - slabF) * uPaveSlab.x;
          vec2 jointFw = max(fwidth(wp.xz), vec2(1e-4));
          vec2 jointL = 1.0 - smoothstep(vec2(uPaveSlab.y) - jointFw, vec2(uPaveSlab.y) + jointFw, jointD);
          float joint = max(jointL.x, jointL.y) * tileVis(uPaveSlab.x);
          vec3 conc = vec3(dot(uMeanR.rgb, vec3(0.30, 0.59, 0.11))) * vec3(1.03, 1.01, 0.97);
          conc *= 0.88 + slabH.x * 0.18;
          conc *= 0.92 + nz(uv, 0.23, vec2(0.29, 0.63)).r * 0.16;
          float stain = smoothstep(0.64, 0.84, nzq(uv, 0.11, vec2(0.17, 0.41)).x) * uPaveSlab.z;
          stain = max(stain, smoothstep(0.80, 0.96, slabH.y) * smoothstep(0.45, 0.75, nz(uv, 0.37, vec2(0.83, 0.07)).g) * uPaveSlab.z);
          conc *= 1.0 - stain * 0.40;
          // (the noise stretched 150:1 along the runway's x axis, read at the across-axis scale's explicit LOD; faint, as
          // the slab roads up from the valleys run across that axis)
          float tyre = smoothstep(0.70, 0.86, nz(vec2(wp.x * 0.00677, wp.z), 0.31, vec2(0.0)).r)
            * smoothstep(0.40, 0.66, nz(uv, 0.006, vec2(0.37, 0.91)).g) * uPaveSlab.w;
          conc *= 1.0 - tyre * 0.22;
          conc *= 1.0 - joint * 0.55;
          pav = vec4(conc, mix(0.86, 0.60, stain));
          pnn = NRM_MEAN;
        }
      } else if (uLandTier < 0.5) {
        // (the Low tier — the phones' default — draws a styled path by the law before the roads lane, verbatim)
        // (2026-10-05) a styled path's own surface (terrain.ts RoadPathStyle), in the road's frame: setts in courses
        // across it, or asphalt — dark and even, the wheel paths polished paler, oil down the lanes' middles — and, patched,
        // its repairs (newer darker, older paler and greyer, their seams sealed) and the old surface's cracks
        if (gRoadClass > 0.5 && gRoadClass < 3.5) {
          vec2 rq = vec2(dot(wp.xz, gRoadDir), dot(wp.xz, vec2(-gRoadDir.y, gRoadDir.x)));
          if (gRoadClass > 1.5 && gRoadClass < 2.5) {
            // setts: courses 0.16 m along the road, setts 0.18–0.26 m across, the joints staggered course to course
            float course = rq.x / 0.16, ci = floor(course);
            vec2 cr = cellHash2(vec2(ci, 17.0));
            float sw = 0.18 + 0.08 * cr.y;
            float sc = (rq.y + cr.x * sw) / sw, si = floor(sc);
            vec2 sh = cellHash2(vec2(ci, si + 311.0));
            vec2 sf = vec2(fract(course) * 0.16, fract(sc) * sw);
            float edgeD = min(min(sf.x, 0.16 - sf.x), min(sf.y, sw - sf.y));
            float settVis = tileVis(0.35);
            float jointS = (1.0 - smoothstep(0.010, 0.018 + 0.5 * gFootM, edgeD)) * settVis;
            vec3 sett = vec3(0.128, 0.125, 0.119) * (0.78 + 0.44 * sh.x) * vec3(1.0 + 0.08 * (sh.y - 0.5), 1.0, 1.0 - 0.06 * (sh.y - 0.5));
            pav = vec4(mix(mix(vec3(0.112, 0.109, 0.104), sett, settVis), vec3(0.040, 0.036, 0.031), jointS), 0.88);
            // a sett's worn, rounded top
            vec2 st2 = vec2(sf.x / 0.16 - 0.5, sf.y / sw - 0.5);
            pnn = vec4(vec2(0.5) + (st2.x * gRoadDir + st2.y * vec2(-gRoadDir.y, gRoadDir.x)) * 0.45 * settVis * (1.0 - jointS), 0.5, 1.0);
          } else {
            float agg = nz(uv, 1.9, vec2(0.31, 0.57)).r;
            vec3 asph = vec3(0.068, 0.068, 0.072) * (0.92 + 0.16 * agg);
            float laneP = abs(fract(rq.y / 3.5) - 0.5) * 3.5; // metres from a 3.5 m lane's middle
            float wheelP = (laneP - 0.95) / 0.35;
            asph *= 1.0 + 0.10 * exp(-wheelP * wheelP) * tileVis(1.0);
            asph *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.45, laneP)) * smoothstep(0.55, 0.80, nz(uv, 0.21, vec2(0.13, 0.71)).g);
            if (gRoadClass > 2.5) {
              vec2 pc = vec2(rq.x / 4.2, rq.y / 2.4), pcI = floor(pc), pcF = fract(pc);
              vec2 ph = cellHash2(pcI + vec2(53.0, 7.0));
              float inPatch = step(ph.x, 0.38);
              vec2 pe = min(pcF, 1.0 - pcF) * vec2(4.2, 2.4);
              float seam = (1.0 - smoothstep(0.03, 0.06 + gFootM, min(pe.x, pe.y))) * inPatch * tileVis(0.6);
              asph = mix(asph, ph.y > 0.5 ? asph * 0.78 : mix(asph, vec3(0.13, 0.128, 0.122), 0.55), inPatch);
              asph *= 1.0 - 0.45 * seam;
              float crack = (1.0 - smoothstep(0.0, 0.02 + gFootM, abs(nz(uv, 0.9, vec2(0.71, 0.29)).r - 0.5) * 0.12))
                * (1.0 - inPatch) * tileVis(0.5) * 0.5;
              asph *= 1.0 - crack;
            }
            pav = vec4(asph, 0.80);
            pnn = NRM_MEAN;
          }
        }
      } else {
        // the road's own frame on a street (along: the running length; across: signed metres off the centreline, its side
        // from the distance field's gradient), the world's axes on a square off any centreline
        bool fr = gRoadFrameW > 0.5 && onStreet > 0.5;
        vec2 al = fr ? gRoadAlong : vec2(1.0, 0.0), pr = vec2(-al.y, al.x);
        vec2 rq = fr ? vec2(gRoadS, gRoadYOk > 0.5 ? gRoadY : dRoad * (dot(gradD, pr) < 0.0 ? -1.0 : 1.0)) : wp.xz;
        float fwP = max(gFootM, 1e-3);
        // the wheel paths of a two-lane street: 0.85 m either side of each 3.2 m lane's middle
        float wpX = (abs(abs(rq.y) - 1.6) - 0.85) / 0.32;
        float wheelW = fr ? exp(-wpX * wpX) : 0.0;
        vec2 pN = vec2(0.0);
        if (abs(pCls - 2.0) < 0.5) {
          // SETTS — courses across the road (or the segmental arcs of a German street, uPaveClass.z), a course 0.17 m
          // along, its setts 0.17–0.26 m across and staggered course to course; each sett its own stone of one rock (its
          // greys ±12 %, a faint warm or cool cast on some), its top domed and worn round, the wheel tracks grimed darker,
          // some sunk or tilted, one in a hundred and twenty lost; the joints sand and grit, mossed where no wheel runs.
          // (R2, the first frames: Ironworks' setts read "a tiled bathroom" near and a smooth pale band past 20 m.) Each
          // joint direction holds while its own lines span enough pixels — the joints along the road (between a course's
          // setts) stay as streaks far down the street where the courses' joints, foreshortened, fade — and past both the
          // stone's tone and the joints' average carry an irregular drift of the ground (relaid stretches, wear) and the
          // map's own stone tone (uPaveExtra.x: Ironworks' sooty basalt, Ronda's pale limestone)
          float vC = stripeVis(0.17, al), vL = stripeVis(0.22, pr);
          float sv = max(vC, vL), svs = min(vC, vL);
          float mossy = (1.0 - wheelW) * smoothstep(0.45, 0.75, nz(uv, 0.08, vec2(0.21, 0.63)).g);
          vec3 col;
          float jointS = 0.0;
          if (sv > 0.004) {
            vec2 sq = rq;
            if (mod(uPaveClass.z, 2.0) > 0.5) { float cc = (fract(sq.y / 2.6) - 0.5) * 2.6; sq.x += 1.7 - sqrt(2.89 - cc * cc); }
            float course = sq.x / 0.17, ci = floor(course);
            vec2 cr = cellHash2(vec2(ci, 17.0));
            float swd = 0.17 + 0.09 * cr.y;
            float sc = (sq.y + cr.x * swd) / swd, si = floor(sc);
            vec2 sh = cellHash2(vec2(ci, si + 311.0));
            vec2 sf = vec2(fract(course) * 0.17, fract(sc) * swd);
            // (ground lane, 2026-10-15: Ironworks' setts read as a plain brown band — dust-coloured hairline joints, gone past
            // 9 m) sand-and-grit joints a centimetre and more, dark, held to 40 m; each stone ±18 %, its dome lit
            float jw = 0.010 + 0.006 * sh.y;
            float jC = (1.0 - smoothstep(jw, jw + 0.004 + 0.6 * fwP, min(sf.x, 0.17 - sf.x))) * vC;
            float jL = (1.0 - smoothstep(jw, jw + 0.004 + 0.6 * fwP, min(sf.y, swd - sf.y))) * vL;
            // (r4 frames: a square's joints along the view still ruled it in fine stripes 20–50 m out — a corduroy) the joints'
            // dust lightens them toward the stones' own tone with distance
            jointS = max(jC, jL) * (1.0 - 0.5 * smoothstep(12.0, 40.0, camDist));
            vec3 stone = vec3(0.150, 0.146, 0.139) * (0.82 + 0.36 * sh.x)
              * mix(vec3(1.0), sh.y > 0.5 ? vec3(1.04, 1.0, 0.95) : vec3(0.96, 0.99, 1.04), 0.6 * fract(sh.x * 3.7));
            stone *= 1.0 - 0.12 * wheelW; // (wave 333: worn wheel tracks darker, grimed with rubber and oil)
            vec3 jointC = mix(mix(stone * 0.30, uMeanD.rgb * 0.40, 0.35), uMeanG.rgb * 0.50, mossy * 0.5);
            float lost = step(0.992, sh.y) * svs;
            vec3 settMean = mix(vec3(0.150, 0.146, 0.139), jointC, 0.26) * (1.0 - 0.10 * wheelW);
            col = mix(mix(settMean, stone, sv), jointC, jointS);
            col = mix(col, jointC * 0.6, lost);
            vec2 st2 = vec2(sf.x / 0.17 - 0.5, sf.y / swd - 0.5);
            vec2 tilt = (cellHash2(vec2(si, ci) + 3.7) - 0.5) * 0.18;
            pN = ((st2.x * 0.80 + tilt.x) * al + (st2.y * 0.80 + tilt.y) * pr) * (1.0 - jointS) * (1.0 - lost) * svs;
          } else {
            // (roads lane R1 cost, 2026-10-10: past both sets of joints' resolution — a wide paved view's far half, where the
            // v3 series measured the paving's cost — the stones' limit at once: no per-sett hash, the same mean tone)
            vec3 jointM = mix(mix(vec3(0.150, 0.146, 0.139) * 0.30, uMeanD.rgb * 0.40, 0.35), uMeanG.rgb * 0.50, mossy * 0.5);
            col = mix(vec3(0.150, 0.146, 0.139), jointM, 0.26) * (1.0 - 0.10 * wheelW);
          }
          col *= 0.94 + 0.12 * nzq(uv, 0.35, vec2(0.23, 0.41)).x;
          if (fr) col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.45, abs(abs(rq.y) - 1.6))) * smoothstep(0.50, 0.78, nz(uv, 0.21, vec2(0.13, 0.71)).g);
          col *= uPaveExtra.x;
          pav = vec4(col, mix(0.86, 0.68, wheelW * (1.0 - jointS)));
        } else if ((pCls > 4.5 && pCls < 5.5) || pCls > 6.5) {
          // BRICK — clinker (5: the Dutch dyke road's klinkers in herringbone across the road, sand-jointed, red-brown to
          // purple) or brick soling (7: the char's herringbone of common brick, broken and mud-dressed)
          bool soling = pCls > 6.5;
          float bw = soling ? 0.115 : 0.10;
          vec2 hq = vec2(rq.x + rq.y, rq.y - rq.x) * 0.70710678 / bw;   // 45° to the road
          vec2 hc = floor(hq), hf = fract(hq);
          float hd = mod(hc.x - hc.y, 4.0);
          vec2 lp, sz = vec2(2.0, 1.0), bid = hc;
          if (hd < 0.5) lp = hf;
          else if (hd < 1.5) { lp = vec2(hf.x + 1.0, hf.y); bid = hc - vec2(1.0, 0.0); }
          else if (hd < 2.5) { lp = vec2(hf.x, hf.y + 1.0); sz = vec2(1.0, 2.0); bid = hc - vec2(0.0, 1.0); }
          else { lp = hf; sz = vec2(1.0, 2.0); }
          vec2 bh = cellHash2(bid + vec2(sz.x * 13.0, 5.0));
          float bEdge = min(min(lp.x, sz.x - lp.x), min(lp.y, sz.y - lp.y)) * bw;
          float bv = tileVis(bw * 2.0);
          float jointB = (1.0 - smoothstep(0.005, 0.009 + 0.6 * fwP, bEdge)) * bv;
          // (R2, the first frames: Jade River's soling a saturated orange tile floor near and a smooth salmon band past
          // 10 m) weathered brick — dust-browned, ±18 % brick to brick, the joints filled with the road's own dust — under
          // an irregular drift, the wheel tracks smoothed and darkened, and on a soling road its broken stretches: holes
          // 0.5–2 m where the bricks are gone, mud in their floors, loose bricks round them
          vec3 brick = soling ? vec3(0.212, 0.122, 0.086) : vec3(0.150, 0.082, 0.066);
          brick *= 0.88 + 0.24 * bh.x;
          brick = mix(brick, brick * vec3(0.82, 0.80, 0.90), step(0.88, bh.y));     // the burnt purple ones
          brick = mix(brick, brick * vec3(1.14, 1.08, 0.96), step(0.90, fract(bh.x * 6.7)) * (soling ? 1.0 : 0.0));
          vec3 jointC = soling ? mix(brick * 0.75, uMeanD.rgb * 0.95, 0.6) : vec3(0.22, 0.20, 0.16);
          vec3 bMean = mix(soling ? vec3(0.195, 0.116, 0.084) : vec3(0.140, 0.080, 0.067), jointC, 0.22);
          vec3 col = mix(bMean, mix(brick, jointC, jointB), bv);
          col *= 0.92 + 0.16 * nzq(uv, 0.35, vec2(0.61, 0.23)).x;
          col *= 1.0 - 0.12 * wheelW;
          float broken = soling ? step(0.90, bh.y) * bv : 0.0;           // a brick gone or broken: the mud under it
          if (soling) {
            vec2 hci = floor(wp.xz / 4.0);
            vec2 hh = cellHash2(hci + vec2(37.0, 71.0));
            if (hh.x < 0.22) {
              vec2 hh2 = cellHash2(hci + vec2(3.0, 19.0));
              vec2 hc0 = (hci + 0.25 + 0.5 * hh2) * 4.0;
              float hr = 0.35 + 0.65 * hh.y;
              // (r4 frames: the holes read as smooth dark ovals) their edges as ragged as lost bricks leave them — the outline
              // stepped along the brick courses and broken by two noise octaves, the mud's edge soft where it creeps out
              float hdist = length((wp.xz - hc0) * vec2(1.0, 1.0 + 0.6 * hh2.x)) + (nz(uv, 1.3, vec2(0.71, 0.43)).g - 0.5) * 0.50
                + (nz(uv, 4.3, vec2(0.29, 0.13)).r - 0.5) * 0.18 + (bh.x - 0.5) * 0.16;
              float hole = 1.0 - smoothstep(hr - 0.10, hr + 0.06 + fwP, hdist);
              float loose = (1.0 - smoothstep(hr, hr + 0.35, hdist)) * (1.0 - hole) * step(0.6, bh.x);
              broken = max(broken, hole * tileVis(0.6));
              col = mix(col, col * 0.85, loose * 0.6);
            }
          }
          col = mix(col, uMeanD.rgb * 0.58, broken);
          // the dust and mud the traffic spreads over it (a soling road between its fields; a dyke road's sand in the joints)
          float dressing = soling ? 0.25 + 0.35 * smoothstep(0.40, 0.70, nz(uv, 0.06, vec2(0.33, 0.17)).g) : 0.10;
          col = mix(col, uMeanD.rgb * vec3(1.0, 0.97, 0.92), dressing * (1.0 - 0.5 * wheelW));
          pav = vec4(col, mix(0.88, 0.95, broken));
          vec2 bq = (lp / sz - 0.5);
          vec2 hb = vec2(bq.x - bq.y, bq.x + bq.y) * 0.70710678;          // back from the 45° frame
          vec2 tiltB = (bh - 0.5) * (soling ? 0.22 : 0.08);
          pN = ((hb.x * 0.35 + tiltB.x) * al + (hb.y * 0.35 + tiltB.y) * pr) * (1.0 - jointB) * bv * (1.0 - broken);
        } else if (abs(pCls - 6.0) < 0.5) {
          // CONCRETE — a lane road in slabs: sawn transverse joints every 4.5 m, the centre joint, each slab its own pour
          // (tone), the aggregate's speckle, a corner crack in some, rubber darkening the wheel paths, the joints sealed
          float slabL = 4.5;
          float si2 = floor(rq.x / slabL), side2 = rq.y < 0.0 ? 0.0 : 1.0;
          vec2 slh = cellHash2(vec2(si2, side2 + 37.0));
          float jx = abs(fract(rq.x / slabL) - 0.5) * slabL;
          float jT = 1.0 - smoothstep(slabL * 0.5 - 0.012, slabL * 0.5 - 0.012 + fwP + 0.004, jx);
          float jL = fr ? 1.0 - smoothstep(0.012, 0.016 + fwP, abs(rq.y)) : 0.0;
          float jointC2 = max(jT, jL) * tileVis(0.5);
          vec3 conc = vec3(0.30, 0.295, 0.28) * (0.86 + 0.20 * slh.x);
          conc *= 1.0 + (nz(uv, 3.1, vec2(0.41, 0.23)).r - 0.5) * 0.22 * tileVis(0.08);
          conc *= 1.0 - 0.16 * wheelW;
          float lc = fract(rq.x / slabL) - 0.5;
          float crackLine = abs((lc * slabL) - (rq.y - (side2 - 0.5) * 2.0) * (slh.y - 0.5) * 2.0);
          float cornerCrack = step(0.70, slh.y) * (1.0 - smoothstep(0.004, 0.006 + fwP, crackLine)) * step(abs(lc), 0.30) * tileVis(0.3);
          conc *= 1.0 - 0.55 * max(jointC2, cornerCrack);
          float stainC = smoothstep(0.66, 0.86, nzq(uv, 0.11, vec2(0.17, 0.41)).x);
          conc *= 1.0 - 0.25 * stainC;
          pav = vec4(conc, mix(0.88, 0.70, wheelW));
        } else {
          // ASPHALT (1) / PATCHED (3) — an aged binder course, mid grey with its aggregate showing; paler and smoother in the
          // wheel paths, dark with drip down the lanes' middles; the centre seam and transverse cracks sealed with tar, a
          // crazed net in the worn wheel paths; repairs cut square along it (a patched street's rule, a few on any), and on
          // a patched street the round fills of old holes; iron covers on the crown and the lanes
          float agg = nz(uv, 1.9, vec2(0.31, 0.57)).r;
          float big = nz(uv, 0.021, vec2(0.17, 0.83)).g;
          vec3 asph = vec3(0.118, 0.116, 0.111) * (0.90 + 0.16 * agg) * (0.88 + 0.24 * big);
          // (roads lane R1 cost, 2026-10-10: each fine term's taps only while it can resolve — the v3 series measured the
          // procedural paving on wide views)
          float aggV = tileVis(0.06);
          if (aggV > 0.01) {
            float aggF = nz(uv, 6.1, vec2(0.13, 0.77)).r;
            asph *= 1.0 + (smoothstep(0.62, 0.86, aggF) * 0.45 - smoothstep(0.30, 0.10, aggF) * 0.18) * aggV;
          }
          // (R2: the first frames' asphalt "smooth plastic") the aggregate's second octave, the binder bled dark in blotches
          // of a few metres, and on a country road its edge ravelled — the binder gone, the stone paler and broken — before
          // the verge
          float aggGV = tileVis(0.03);
          if (aggGV > 0.01) asph *= 1.0 + (nz(uv, 13.0, vec2(0.53, 0.29)).r - 0.5) * 0.22 * aggGV;
          asph *= 1.0 - 0.13 * smoothstep(0.56, 0.84, nzq(uv, 0.09, vec2(0.71, 0.37)).x);
          if (fr) {
            float ravel = smoothstep(roadHalf - 1.0, roadHalf - 0.15, dRoad) * (1.0 - paveTownW)
              * smoothstep(0.40, 0.70, nz(uv, 1.1, vec2(0.37, 0.61)).r);
            asph = mix(asph, asph * vec3(1.20, 1.19, 1.15), ravel);
          }
          float laneP = abs(abs(rq.y) - 1.6);
          asph *= 1.0 + 0.09 * wheelW;
          if (fr) asph *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.45, laneP)) * smoothstep(0.50, 0.78, nz(uv, 0.21, vec2(0.13, 0.71)).g);
          float rough = mix(0.82, 0.66, wheelW);
          float crk = 0.0;
          if (fr && gFootM < 0.4) {
            float wv = (nz(vec2(rq.x, 0.0), 0.37, vec2(0.71, 0.29)).r - 0.5) * 0.10;
            crk = (1.0 - smoothstep(0.018, 0.018 + fwP, abs(rq.y + wv))) * step(0.5, uPaveWear.y);
            float tci = floor(rq.x / 7.0);
            vec2 th = cellHash2(vec2(tci, 23.0));
            float tx = (tci + 0.15 + 0.7 * th.x) * 7.0 + (nz(vec2(0.0, rq.y), 0.6, vec2(0.11, 0.47)).r - 0.5) * 0.25;
            crk = max(crk, (1.0 - smoothstep(0.008, 0.008 + fwP, abs(rq.x - tx))) * step(0.35, th.y) * step(abs(rq.y), 1.0 + 3.0 * th.y) * uPaveWear.y);
          }
          float netV = wheelW * smoothstep(0.55, 0.75, big) * uPaveWear.y * tileVis(0.26);
          if (netV > 0.01) {
            vec2 cq = rq / 0.26 + (vec2(nz(uv, 0.7, vec2(0.3, 0.1)).g, nz(uv, 0.7, vec2(0.6, 0.9)).g) - 0.5) * 0.9;
            vec2 cf = fract(cq);
            float cE = min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y)) * 0.26;
            crk = max(crk, (1.0 - smoothstep(0.003, 0.003 + fwP, cE)) * netV);
          }
          crk *= tileVis(0.12);
          asph *= 1.0 - 0.55 * crk;
          rough = mix(rough, 0.45, crk * 0.6);
          // the repairs (wave 333 on Suzhou Creek: the patched style's "large pale rectangles read as pasted blocks"): each a
          // cut reinstated by hand — an outline that wanders (field b at 1.4: tongues of 0.2–0.7 m), a newer fill darker and
          // smoother sealed with a thin tar seam, an older one barely off the road's own grey; trench strips along the lanes
          float patchRate = (pCls > 2.5 ? 0.30 : 0.08) * uPaveWear.x;
          vec2 cellS = vec2(7.0, 3.2);
          vec2 pcI = floor(rq / cellS);
          vec2 ph = cellHash2(pcI + vec2(53.0, 7.0));
          float seam = 0.0;
          if (ph.x < patchRate) {
            vec2 ph2 = cellHash2(pcI + vec2(11.0, 29.0));
            vec2 hs = ph2.x > 0.7 ? vec2(2.6 + 0.8 * ph2.y, 0.35 + 0.15 * ph.y) : vec2(0.6 + 1.6 * ph2.y, 0.45 + 0.9 * ph.y);
            vec2 pc0 = (pcI + 0.5) * cellS + (ph2 - 0.5) * max(cellS - 2.0 * hs, vec2(0.0)) * vec2(1.0, 0.8);
            vec2 bd = abs(rq - pc0) - hs;
            float sd = length(max(bd, 0.0)) + min(max(bd.x, bd.y), 0.0) - 0.12;
            sd += (nz(uv, 1.4, vec2(0.19, 0.73)).g - 0.5) * 0.30 + (tileVis(0.25) > 0.01 ? (nz(uv, 4.1, vec2(0.61, 0.07)).r - 0.5) * 0.06 : 0.0);
            float inPatch = 1.0 - smoothstep(-0.01, 0.01 + fwP, sd);
            float newer = step(0.45, ph.y);
            seam = (1.0 - smoothstep(0.012, 0.024 + fwP, abs(sd))) * tileVis(0.4) * newer;
            asph = mix(asph, newer > 0.5 ? asph * 0.84 : asph * vec3(1.05, 1.05, 1.03), inPatch);
            rough = mix(rough, newer > 0.5 ? 0.70 : 0.84, inPatch);
          }
          asph *= 1.0 - 0.30 * seam;
          if (pCls > 2.5 && uPaveExtra.w > 0.0) {
            // the fills of shell holes (uPaveExtra.w: a shelled city's), their edges as ragged as the holes were
            vec2 rci = floor(rq / 6.0);
            vec2 rh = cellHash2(rci + vec2(91.0, 13.0));
            float on = step(rh.y, 0.22 * uPaveExtra.w);
            float rr = 0.35 + 0.55 * fract(rh.x * 7.3);
            float rd = length(rq - (rci + 0.3 + 0.4 * rh) * 6.0) + (nz(uv, 1.7, vec2(0.43, 0.29)).g - 0.5) * 0.40
              + (nz(uv, 5.3, vec2(0.17, 0.83)).r - 0.5) * 0.10;
            asph = mix(asph, asph * 0.84, on * (1.0 - smoothstep(rr - 0.03, rr + 0.03 + fwP, rd)));
            asph *= 1.0 - 0.22 * on * (1.0 - smoothstep(0.015, 0.035 + fwP, abs(rd - rr))) * tileVis(0.5);
          }
          // a road's centre line (uPaveExtra.z, a map from the 1950s on): worn white paint, 6 m dashes with 12 m gaps along
          // the running length, flaked in patches — on the country roads (a kerbed town's streets carry none)
          if (fr && uPaveExtra.z > 0.0 && paveTownW < 0.5 && gRoadYOk > 0.5) {
            float dash = step(fract(gRoadS / 18.0), 6.0 / 18.0);
            float lineW = 1.0 - smoothstep(0.06, 0.06 + fwP, abs(rq.y));
            float paint = dash * lineW * stripeVis(0.12, pr) * (0.55 + 0.45 * smoothstep(0.30, 0.60, nz(uv, 2.7, vec2(0.83, 0.19)).r))
              * uPaveExtra.z;
            asph = mix(asph, vec3(0.46, 0.46, 0.43), paint * 0.85);
            rough = mix(rough, 0.60, paint);
          }
          if (fr && uPaveWear.z > 0.0 && paveTownW > 0.5) {
            float mci = floor(rq.x / 34.0);
            vec2 mh = cellHash2(vec2(mci, 71.0));
            vec2 mc = vec2((mci + 0.2 + 0.6 * mh.x) * 34.0, mh.y > 0.5 ? 0.0 : (mh.y > 0.25 ? 1.6 : -1.6));
            float md = length(rq - mc);
            float cover = (1.0 - smoothstep(0.31, 0.31 + fwP, md)) * step(fract(mh.x * 9.1), uPaveWear.z) * tileVis(0.62);
            if (cover > 0.0) {
              float boss = step(0.5, fract(floor((rq.x - mc.x) / 0.055) * 0.5 + floor((rq.y - mc.y) / 0.055) * 0.5)) * tileVis(0.11);
              vec3 iron = vec3(0.070, 0.064, 0.058) * (1.0 + 0.25 * boss) * mix(vec3(1.0), vec3(1.25, 0.95, 0.75), smoothstep(0.6, 0.9, agg));
              iron *= 1.0 - 0.5 * (1.0 - smoothstep(0.012, 0.02 + fwP, abs(md - 0.29)));
              asph = mix(asph, iron, cover);
              rough = mix(rough, 0.52, cover);
              pN += (rq - mc) / max(md, 1e-3) * 0.3 * (1.0 - smoothstep(0.0, 0.03 + fwP, abs(md - 0.31))) * cover;
            }
          }
          pav = vec4(asph * uPaveExtra.x, rough);
          pN = (pN.x * al + pN.y * pr) * 1.0;
        }
        // the gutter: rows of small setts along the kerb, the street's dirt and leaves gathered in them (a kerbed street,
        // uPaveClass.w its width)
        float gutW = uPaveClass.w;
        if (gutW > 0.0 && fr && abs(pCls - 2.0) > 0.5) {
          float gIn = dRoad - (5.0 - gutW);
          float gutB = smoothstep(-0.01, 0.01 + fwP, gIn) * (1.0 - smoothstep(5.1, 5.3, dRoad)) * paveTownW;
          if (gutB > 0.001) {
            float row = floor(gIn / 0.12), colI = floor(gRoadS / 0.12 + row * 0.5);
            vec2 gh2 = cellHash2(vec2(colI, row + 61.0));
            vec2 gf = vec2(fract(gRoadS / 0.12 + row * 0.5), fract(gIn / 0.12)) * 0.12;
            float gE = min(min(gf.x, 0.12 - gf.x), min(gf.y, 0.12 - gf.y));
            float gv = tileVis(0.12);
            float gJ = (1.0 - smoothstep(0.006, 0.010 + 0.6 * fwP, gE)) * gv;
            vec3 gStone = vec3(0.19, 0.185, 0.175) * (0.78 + 0.44 * gh2.x);
            vec3 gDirt = uMeanD.rgb * 0.55;
            vec3 gCol = mix(mix(vec3(0.165), gDirt, 0.2), mix(gStone, gDirt, gJ), gv);
            gCol = mix(gCol, gDirt * 0.8, 0.35 * smoothstep(gutW * 0.5, gutW, gIn) * smoothstep(0.45, 0.7, nz(uv, 0.09, vec2(0.61, 0.13)).g));
            pav = mix(pav, vec4(gCol, 0.86), gutB);
            pN = mix(pN, ((gf.y / 0.12 - 0.5) * pr * 0.35 + (gf.x / 0.12 - 0.5) * al * 0.35) * (1.0 - gJ) * gv, gutB);
          }
        }
        // (wave 333: "flat single-material planes … no wear, kerb spill or contact darkening") the grime against a kerb —
        // the street's dirt and leaves washed to its foot, darkest at the face; on a square off any centreline its edges
        // trodden darker and weedy, its middle worn in broad stains
        if (fr && paveTownW > 0.0) {
          float kg = smoothstep(4.35, 5.0, dRoad) * (1.0 - smoothstep(5.05, 5.25, dRoad)) * paveTownW;
          pav.rgb *= 1.0 - 0.24 * kg * (0.7 + 0.3 * nz(uv, 0.9, vec2(0.37, 0.53)).r);
          pav.rgb = mix(pav.rgb, uMeanD.rgb * 0.5, 0.25 * kg * smoothstep(0.55, 0.8, nz(uv, 2.6, vec2(0.11, 0.91)).r) * tileVis(0.2));
        }
        if (!fr && uLandTier > 0.5) {
          float edgeG = 1.0 - smoothstep(0.55, 0.95, mk.r);
          pav.rgb *= 1.0 - 0.18 * edgeG;
          pav.rgb = mix(pav.rgb, uMeanG.rgb * 0.7, 0.30 * edgeG * smoothstep(0.55, 0.80, nz(uv, 0.31, vec2(0.71, 0.23)).g) * tileVis(0.3));
          pav.rgb *= 1.0 - 0.12 * smoothstep(0.52, 0.80, nzq(uv, 0.05, vec2(0.47, 0.19)).x);
        }
        // standing water (uPaveWear.w, a wet town's): in the gutters and the worn wheel paths' low spots, dark and smooth
        if (uPaveWear.w > 0.0 && fr) {
          float lowSpot = max(smoothstep(4.3, 4.9, dRoad) * paveTownW, wheelW * 0.7);
          float pond = smoothstep(0.62, 0.80, nzq(uv, 0.06, vec2(0.29, 0.83)).x + 0.12 * lowSpot) * lowSpot * uPaveWear.w * uRoadPuddle;
          pav.rgb = mix(pav.rgb, pav.rgb * 0.45, pond);
          pav.a = mix(pav.a, 0.08, pond);
          pN *= 1.0 - pond;
          gRoadPuddle = max(gRoadPuddle, pond * paveCore);
        }
        pnn = vec4(vec2(0.5) + pN, 0.5, 1.0);
      }`;
