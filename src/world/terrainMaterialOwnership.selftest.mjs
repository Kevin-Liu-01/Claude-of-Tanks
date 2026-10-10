import { assertTerrainFetchExpressionCensus } from './terrainMaskShaderTestOracle.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { landUseTierOf } from './landUse.ts';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
// ground lane (2026-10-03): the land use's field layout is declared in landUse.ts and spliced into the splat fragment
// (`${'$'}{LAND_USE_GLSL}`); its uniform declarations count as the material's own
const landUseSource = readFileSync(new URL('./landUse.ts', import.meta.url), 'utf8');
const landUseGlsl = landUseSource.slice(landUseSource.indexOf('export const LAND_USE_GLSL'));
const compact = text => text.replace(/\s+/g, '');
function unique(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length, 1, `one actual ${label}`);
  return matches[0][1];
}
const scalar = (text, name) => unique(text, new RegExp(`float ${name} = ([^;]+);`, 'g'), name);
const normalTerm = (text, name) => unique(text,
  new RegExp(`n\\.xy \\+= ([^;]*\\b${name}\\.xy\\b[^;]*);`, 'g'), `${name} normal consumer`);
const nearAlbedo = text => unique(text, /a\.rgb \*= ([^;]*\(gl2 - glM\)[^;]*);/g, 'near albedo consumer');
const farAlbedo = text => unique(text, /a\.rgb \*= ([^;]*\bgLum\b[^;]*);/g, 'far albedo consumer');

async function compile(text) {
  // Only local production scalar declarations and the four actual consumer
  // expressions are imported. Texture reads have explicit scalar test ports;
  // this is not a GLSL interpreter, compiled GPU shader or rendered-pixel proof.
  const declarations = ['meadowG', 'openNear2', 'nearG', 'farG']
    .map(name => `const ${name} = ${scalar(text, name)};`).join('\n');
  const body = `const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
    const mix = (a,b,w) => a*(1-w)+b*w;
    const max = Math.max;
    export function sample({fD,fR,fMs,projW,roadCore,dNear2,farM,dn2,gnF,gl2,glM,gLum,gCropW,gCropReliefW,gSoilW}) {
      ${declarations}
      return {nearG,farG,nearN:${normalTerm(text, 'dn2')},nearA:${nearAlbedo(text)},
        farN:${normalTerm(text, 'gnF')},farA:${farAlbedo(text)}};
    }`;
  return (await import(`data:text/javascript;base64,${Buffer.from(body).toString('base64')}`)).sample;
}
const fields = ['fD', 'fR', 'fMs', 'projW', 'roadCore'];
const ports = overrides => ({ fD: 0, fR: 0, fMs: 0, projW: 0, roadCore: 0,
  dNear2: .73, farM: .61, dn2: { xy: -.7 }, gnF: { xy: .4 },
  gl2: .8, glM: .2, gLum: .7, gCropW: 0, gCropReliefW: 0, gSoilW: 0, ...overrides });
function close(a, b, label) {
  assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 2e-14, `${label}: ${a} != ${b}`);
}
function noReinjection(row, label) {
  for (const key of ['nearG', 'farG', 'nearN', 'farN']) assert.ok(row[key] === 0, `${label}/${key}`);
  assert.equal(row.nearA, 1, `${label}/near albedo unchanged`);
  assert.equal(row.farA, 1, `${label}/far albedo unchanged`);
}
function checkEndpoints(sample) {
  for (const field of fields) noReinjection(sample(ports({ [field]: 1 })), field);
  for (const distance of [0, .001, .25, .73, 1]) {
    for (const signal of [-1, -.2, 0, .4, 1]) {
      const p = ports({ dNear2: distance, farM: distance,
        dn2: { xy: signal }, gnF: { xy: signal }, gl2: signal });
      const actual = sample(p);
      // Frozen f84 predecessor response on pure G, where every material/road
      // exclusion is zero. Original gains, clipping and texture ports remain.
      assert.equal(actual.nearG, distance);
      assert.equal(actual.farG, distance);
      assert.equal(actual.nearN, signal * .75 * distance); // relief pass 2 (2026-09-12): the full 1049e4e clod relief (was .60)
      assert.equal(actual.farN, signal * distance * .9); // relief pass 2 (2026-09-12): far turf relief .45 -> .9 (1049e4e ran 1.5)
      // Near albedo octave strengthened with the 1049e4e presentation restore
      // (2026-09-11): gain 1.5 -> 1.9, clip -0.22..0.26 -> -0.28..0.32.
      assert.equal(actual.nearA, 1 + Math.max(-.28, Math.min(.32, (signal - p.glM) * 1.9)) * distance);
      assert.equal(actual.farA, (1 - distance * .55) + (.86 + p.gLum * .30) * (distance * .55));
    }
  }
}
function checkFractional(sample) {
  for (let i = 0; i < 2048; i++) {
    const p = ports({ dNear2: (i % 17) / 16, farM: (i % 23) / 22 });
    fields.forEach((name, j) => { p[name] = ((i * (j * 18 + 7) + j * 31) % 257) / 256; });
    const row = sample(p), remaining = fields.reduce((w, name) => w * (1 - p[name]), 1);
    close(row.nearG, p.dNear2 * remaining, 'independent residual near coverage');
    close(row.farG, p.farM * remaining, 'independent residual far coverage');
    assert.ok(row.nearG >= 0 && row.nearG <= p.dNear2);
    assert.ok(row.farG >= 0 && row.farG <= p.farM);
  }
  // Each ownership axis attenuates continuously, including fractional roads.
  for (const field of fields) {
    const full = sample(ports()), half = sample(ports({ [field]: .5 }));
    for (const key of ['nearG', 'farG', 'nearN', 'farN']) close(half[key], full[key] * .5, `${field}/${key}`);
    for (const key of ['nearA', 'farA']) close(half[key] - 1, (full[key] - 1) * .5, `${field}/${key}`);
    for (const v of [1e-7, .125, .5, .875, 1 - 1e-7]) {
      const low = sample(ports({ [field]: v - 1e-8 })), high = sample(ports({ [field]: v + 1e-8 }));
      assert.ok(high.nearG <= low.nearG && high.farG <= low.farG);
      assert.ok(low.nearG - high.nearG < 2e-8 && low.farG - high.farG < 2e-8);
    }
  }
}
// ground lane (2026-10-03): the land use owns its share of the meadow's detail as the layers do — a turned field
// (gSoilW) draws no near blades and none of the far turf (farmland: its relief is its furrows and clods), a sown crop
// (gCropW) keeps 40 % of the near grass detail and 15 % of the far turf; with neither (every map without a field system)
// the response above is unchanged
// (wave 274) the relief's share is gCropReliefW — a sown field's gCropW, but none on a young green crop, a short leafy sward
// whose ground keeps the sward's whole relief (terrainSurfaceDetail pins the weight)
function checkLandCover(sample) {
  const base = sample(ports()), soil = sample(ports({ gSoilW: 1 })), crop = sample(ports({ gCropW: 1, gCropReliefW: 1 }));
  assert.equal(soil.nearG, 0, 'a turned field draws no near blades');
  close(soil.farG, 0, 'a turned field keeps none of the far turf');
  close(crop.nearG, base.nearG * 0.4, 'a sown field keeps 40 % of the near grass detail');
  close(crop.farG, base.farG * 0.15, 'a sown field keeps 15 % of the far turf');
  const young = sample(ports({ gCropW: 1, gCropReliefW: 0 }));
  close(young.nearG, base.nearG, 'a young green crop keeps the near grass detail');
  close(young.farG, base.farG, 'and the far turf');
  for (const key of ['gCropReliefW', 'gSoilW']) for (let v = 0; v < 1; v += 0.125) {
    const lo = sample(ports({ [key]: v })), hi = sample(ports({ [key]: v + 0.125 }));
    assert.ok(hi.nearG <= lo.nearG && hi.farG <= lo.farG, `${key} attenuates the meadow's detail monotonically`);
  }
}
function checkSourceContract(text) {
  assert.equal(compact(scalar(text, 'meadowG')), '(1.0-fD)*(1.0-projW)*(1.0-fMs)', 'existing meadow ownership unchanged');
  // map pass 2026-09-12: the bare road shoulder gained its own authored scale
  // (uShoulderDirt, default 1) so snow passes keep white verges; the max()
  // competition between ambient wear, shoulder and town wear is unchanged.
  // (wave 71, the ground lane: a meadow's worn patch is grazed turf with its soil at the trodden core — wornCore; the
  // arid maps' sand and the snow maps' scoured crests keep the whole patch)
  // (2026-10-07, the ground lane's pads: a hardstand pad is the carriageway's packed ground, so the shoulder's dirt
  // stands down over the pad's stamp — apronRim — or a ring of bare ground outlined it; hardstandSurface pins the pad)
  assert.equal(compact(scalar(text, 'fD')),
    'clamp(max(wornCore*uWornDirtStrength,max(shoulder*uShoulderDirt*(1.0-apronRim),mk.a*uTownWear*(0.35+0.65*n1))),0.0,1.0)',
    'authored dirt/road/town blend policy unchanged');
  assert.equal(compact(scalar(text, 'wornCore')),
    '(uSandMacro>0.001||uReduxD.y>1.5)?worn:smoothstep(0.78,1.0,n2w+(n1w-0.5)*0.45)',
    'a meadow\'s worn patch soils only at its core; the arid and snow maps keep the whole patch');
  assertTerrainFetchExpressionCensus(text);
  assert.deepEqual(text.match(/texSize\(\d+\)/g), [...Array(6).fill('texSize(256)'), 'texSize(512)']);
  const declarations = (text.includes('${LAND_USE_GLSL}') ? text + landUseGlsl : text)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const uniforms = [...declarations.matchAll(/\buniform\s+\w+\s+([^;]+);/g)]
    // round 40: an array uniform (`uSeaOpenings[4]`) is owned by its name, like its `shader.uniforms.uSeaOpenings =` assignment
    .map((m) => [m[0], m[1].replace(/\[\d+\]$/, '')])
    .flatMap(match => match[1].split(',').map(name => name.trim())).sort();
  const expected = ['uAlbG','uAlbD','uAlbR','uAlbM','uNrmG','uNrmD','uNrmR','uNrmM','uMask','uNoise',
    'uTintA','uTintB','uTintC','uRoadTint','uSoilTint','uPloughLift','uMarshGloss','uMicroAmp','uStrata','uRoadTex','uTownWear',
    'uWornDirtStrength','uIceDrift','uMidRelief','uFieldPatch','uRipple','uSandMacro','uIceSky',
    // round 40 (2026-09-22): the sea openings past the square (edgeWater.ts) that the ring's marine faces render as open water
    'uMidFar','uMaskSize', // The extended coast reuses uMask; no extra sampler.
    'uRockGate','uSea','uSeaFoam','uSeaOpeningCount','uSeaOpenings','uSeaBanks','uSeaRamp',
    'uShoulderDirt', // map pass 2026-09-12: authored road-shoulder scale (scalar, no sampler)
    'uRoadPuddle', // ground lane (2026-10-05): the map's share of the ruts' puddles and their mud (scalar, no sampler)
    'uLaneK', // road pass 2026-09-12: mask-resolution-aware wheel-lane sharpness (scalar, no sampler)
    // round 42 (2026-09-23, AAA checks 4/11): the sun the vista ring shades with and the sky-light weight for steep faces turned from it
    'uSunDirW', 'uWallSkyLift',
    // ground lane (wave 65): the ring's caprock band, metres over the field's highest ground (vec2, no sampler)
    'uRingCap',
    // map revival lane 2 (2026-10-05, Aegis Crossing): a map's paved town rect (SplatConfig townPaving; vec4, no sampler)
    'uTownPave',
    'uSlopeGrassHold', // round 45 (2026-09-23): tropical hills hold turf to steeper slopes (scalar, no sampler)
    'uRingRock', // round 49 (2026-09-23): per-map slope band over which a ring face past the square becomes landform rock (vec2, no sampler)
    'uBeddedR', // round 55 (2026-09-24): 1 on the maps whose R layer is the procedural bedded sandstone tile — their wall crag is analytic (scalar, no sampler)
    // round 72b (2026-09-25): the horizon ring's surface atlas read by the terrain-material ring bands past the square — NO new sampler
    // (the program sits at the 16-unit limit: ten layer samplers, four cascades, the environment map, three's DFG LUT — a seventeenth
    // failed to link and the terrain drew with no program for a round); the atlas rides in uNrmM's unit during the bands' draw, flagged
    // by uRingDraw, with its radius window, gradient scale and amplitude
    'uRingDraw', 'uRingReliefR', 'uRingReliefGrad', 'uRingReliefAmp',
    // round 73 (2026-09-25, the ground redux): four packed vectors (transitions / folds / the wet strand / snow) and
    // the world clock the swash breathes on — no sampler, the material stays at the 16-unit budget
    'uReduxA', 'uReduxFold', 'uReduxSwash', 'uReduxSnow', 'uGroundTime',
    // round 73b (2026-09-26): two more packed vectors — the border lip / road verge / outcrop rim / mid albedo octave
    // and the rim's climate tint with the drifts' lee edge — no sampler; the strand's metres ride a vertex byte
    'uReduxB', 'uReduxC',
    // terrain v2 (2026-10-01, the Opus 5.5 redesign): the four layers' measured tile means (the far variant's and the
    // octaves' deep-mip mean fetches) and the exposure / bedding vector — uniforms, no sampler
    'uMeanG', 'uMeanD', 'uMeanR', 'uMeanM', 'uReduxD',
    // terrain v3 (2026-10-02): the ring atlas gradient's wall fade (vec2, set per relief character at the ring's bind) — no sampler
    'uRingReliefWall',
    // ground lane (2026-10-03): the land use's field system (landUse.ts) — five packed vectors, no sampler
    'uLandA', 'uLandB', 'uLandC', 'uLandD', 'uLandE',
    // ground lane (2026-10-03, the land-use bake): the bake's address in the ground mask's stack and the stack's own (two
    // vectors, no sampler — the bake rides in uMask's unit)
    'uLandBake', 'uMaskStack',
    // ground lane (2026-10-04, the tier gate): the land use's tier from the live preset (landUseTierOf; scalar, no sampler)
    'uLandTier',
    // ground lane (2026-10-04): the field grid's heading as (cos, sin), once on the CPU (vec2, no sampler)
    'uLandRot',
    // ground lane (2026-10-03): the two-formation bedrock's boundary (vec4, no sampler)
    'uFormation',
    // the Redrock lane (2026-10-07): the formations' own colours, the square's caprock band and the cliffs' weathering
    // (two vec4, two vec2, no sampler)
    'uFormationLow', 'uFormationUp', 'uCaprockY', 'uWallWeather', 'uJebelFace', 'uRippleNear', 'uRoadRuts',
    // the map-borders lane (2026-10-03): 1 when the map's R layer is its paving — natural steep faces take the D layer (scalar, no sampler)
    'uPavedRock',
    // maps lane B (2026-10-03): a sor's salt crust — on, polygon cell, damp margin (vec4, no sampler)
    'uSaltCrust',
    // maps lane B (2026-10-03): airfield concrete — slab, joint, stains, tyres (vec4, no sampler)
    'uPaveSlab',
    // ground lane (2026-10-05, the road styles): the road layer's size and first row in the mask stack, on when a styled
    // net bakes one (vec4, no sampler — the layer rides in uMask's unit, fetched exactly)
    'uRoadClass',
    // the map-revival lane (2026-10-05): the terrace zones' rects and riser band — the risers take the rock layer
    // (vec4[4] and vec4, no sampler)
    'uTerraceRect', 'uTerraceParam',
    // ground lane (2026-10-08): the village floored in cinder (groundRedux.ts cinderYard: Cinder Junction's yard; scalar,
    // no sampler)
    'uYardCinder',
    // ground lane (2026-10-08, wave 274): the thatch and soil under a thick sward near the camera (groundRedux.ts thatch;
    // scalar, no sampler)
    'uThatch',
  ].sort();
  assert.deepEqual(uniforms, expected, 'all declared uniforms are owned; the sampler budget is unchanged');
  assert.deepEqual([...text.matchAll(/shader\.uniforms\.(\w+)\s*=/g)].map(m => m[1]).sort(), expected);
  // round 47 (2026-09-23): the baked outland bay-contour mask joins the owners (retained and disposed with the material)
  assert.ok(compact(text).includes(compact(`textures: [
    grass.albedo, grass.normal, dirt.albedo, dirt.normal,
    rock.albedo, rock.normal, wet.albedo, wet.normal, mask, noiseTex,
    outlandWaterMask, ...(groundMask === mask ? [] : [groundMask]),
    ...(maskStack.texture === groundMask ? [] : [maskStack.texture]),
  ]`)), 'the same ten shader-only texture owners keep their positions ([0] grass, [4] rock feed the horizon ground tone); the outland bay mask is the eleventh, the land-use stack the last');
  // round 42 (2026-09-23): the program cache key moved with the sky-light fragment (was v31, relief pass 2 of 2026-09-12)
  // round 49 (2026-09-23): v38 — jointed marker-bed strata and the per-map ring rock band
  // round 55 (2026-09-24): v39 — the bedded sandstone maps' analytic wall crag replaces the tile's coarse wall tap
  // round 72b (2026-09-25): v40 — the ring bands read the horizon's surface atlas; v41 — through the M normal's unit (no seventeenth sampler);
  // round 73 (2026-09-26 rebase over 72b): v42 — the ground redux (height transitions, scree, snow drifts, folds, the wet strand, glint, the mid octave)
  // round 73b (2026-09-26): v43 — the borders (lip, rim, verge), the mid albedo octave, the strand in metres with its foam and wrack lines
  // terrain v2 (2026-10-01): v53 — the coverage-gated cost pass, the measured means, exposure and the non-periodic beds
  assert.ok(text.includes("world-terrain-splat-v54-${seaOpenings.length ? 'coast' : 'land'}"), 'coast and land shader variants have distinct keys');
  // the sampler budget: every sampler2D the fragment declares, no more than the ten layer samplers (four cascades, the environment
  // map and the DFG LUT fill the other six units)
  const samplers = [...text.matchAll(/uniform sampler2D ([^;]+);/g)].flatMap((m) => m[1].split(',').map((n) => n.trim()));
  assert.deepEqual(samplers.sort(), ['uAlbD', 'uAlbG', 'uAlbM', 'uAlbR', 'uMask', 'uNoise', 'uNrmD', 'uNrmG', 'uNrmM', 'uNrmR'],
    'ten sampler2D declarations: the terrain program has no texture unit to spare (MAX_TEXTURE_IMAGE_UNITS = 16)');
  assert.ok(text.includes('vec4 ringRel = textureLod(uNrmM, vec2(atan(wp.z, wp.x)'), 'the ring atlas is read through the M normal unit');
  assert.ok(text.includes('shader.uniforms.uNrmM = ringReliefUniforms.uNrmM;'), 'the M normal uniform object is the one the ring swaps');
}
// ground lane (2026-10-04, the GPU cut and the coordinator's tier gate): the land-use block's reads go out by tier — Low
// reads the bake alone, Medium adds the crop's own grain (the karst's stones, the brownfield's bare ground; a field's wet
// and dry is its fold and its own draw since wave 69's field layout, no read), High everything — Low draws none of the
// boundary features, rows or tramlines, and the field interior's skip of the margin's reads is exact by the block's own
// constants
function checkLandUseCut(text) {
  const start = text.indexOf('    if (landW > 0.003) {');
  assert.ok(start > 0, 'the land-use block');
  let depth = 0, end = -1;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const block = text.slice(start, end).replace(/\/\/[^\n]*/g, '');
  const reads = [...block.matchAll(/\b(nzq|nz|groundSamp|splatSamp|texture2D|textureLod|texelFetch)\(/g)].map((m) => m[1]).sort();
  // (farmland: the rows' bend is one coarse level of the noise — a textureLod, where it was a two-read nzq)
  // (wave 69's field layout: a field's wet and dry follow its fold and its own draw — the round 43 m noise is gone)
  // (wave 83: a standing crop's canopy between the grass tier's blades — two reads of the noise at its own level, near
  // the camera only, Medium and High: the crop's own grain)
  // (2026-10-05, Ruinspires' hardstanding: its grain and stains, Medium and High; its cracks, High; Ironworks' slag,
  // ballast and gravel: their stones' grain, one read, High, near, on a works' ground)
  // (2026-10-08, waves 177/287, Saltwind: the karst's grazing is garrigue — its tussocks' bare soil one more field of the
  // noise, Medium up, on a karst pasture only)
  // (2026-10-10, the Ironworks landing, round 4: a works' slag lot's relief, two octaves of the noise, High, near
  // (a 0.2 m footprint, where tileVis(0.8) ends), on a works' ground only)
  assert.deepEqual(reads, ['groundSamp', 'nz', 'nz', 'nz', 'nz', 'nz', 'nz', 'nz', ...Array(8).fill('nzq'), 'textureLod'],
    'the block reads seven noise fields, the canopy\'s two near reads, the hardstanding\'s three, the stones\' one, the slag\'s relief two, the bend\'s coarse level and the soil (the bake is lu_field\'s)');
  assert.ok(!/fieldN/.test(block), 'no round noise patch varies a field: its tone is its fold and its own draw');
  for (const [gate, read] of [
    ['float nBend = bendW > 0.001 && uLandTier > 1.5 ? ', 'textureLod(uNoise, uvW * 0.0021 + vec2(0.47, 0.13), 4.0)'],
    ['if (luEdge && luNear > 0.001 && uLandTier > 1.5) nEdge = mix(vec3(0.5), vec3(', 'nzq(uvW, 0.045, vec2(0.21, 0.83))'],
    ['if (soilRead && luNear > 0.001 && uLandTier > 1.5) soil = mix(uMeanD, ', 'groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB)'],
    ['float karstStone = 0.0; if (uLandTier > 0.5) { vec2 sq = ', 'nzq(uvW, 0.61, vec2(0.37, 0.71))'],
    ['float bareG = uLandTier > 0.5 ? ', 'smoothstep(0.52, 0.72, nzq(uvW, 0.29'],
    ['float bare = uLandTier > 0.5 ? ', 'smoothstep(0.52, 0.72, nzq(uvW, 0.11'],
    ['if (crop > 0.5 && crop < 3.5 && uLandTier > 0.5 && gFootM < 0.04) { vec2 uE = vec2(0.8090 * uv.x - 0.5878 * uv.y, 0.5878 * uv.x + 0.8090 * uv.y); float ear = ',
      'nz(uv, 1.7, vec2(0.31, 0.77))'],
    ['float hGrain = uLandTier > 0.5 ? ', 'nz(uv, 1.9, vec2(0.31, 0.57))'],
    ['float crackH = uLandTier > 1.5 ? (1.0 - smoothstep(0.0, 0.02 + gFootM, abs(', 'nz(uv, 0.9, vec2(0.71, 0.29))'],
    ['float hStain = uLandTier > 0.5 ? smoothstep(0.62, 0.82, ', 'nzq(uv, 0.17, vec2(0.37, 0.83))'],
    ['float stoneN = stoneVis > 0.001 ? ', 'nz(uv, 3.1, vec2(0.29, 0.61))'],
    ['if (nrmOn && uLandE.w > 1.5 && uLandTier > 1.5 && gFootM < 0.2) { vec2 tr = ', 'nz(uv, 0.53, vec2(0.37, 0.19))'],
  ]) assert.ok(compact(block).includes(compact(gate + read)), `${read}: read only behind ${gate}`);
  assert.ok(compact(block).includes(compact('nzq(uvW, 0.031, vec2(0.11, 0.59)).y, nzq(uvW, 0.17, vec2(0.83, 0.37)).x), luNear);')),
    'the headland\'s width and the hedge bank\'s break are read in the wander\'s own gated round');
  for (const gate of ['if (uLandTier < 0.5) {', 'float rowsShow = uLandTier > 0.5 ?', '&& crop < 3.5 && uLandTier > 0.5) {',
    '&& luEdge && uLandTier > 0.5) {', 'if (track > 0.01 && uLandTier > 0.5) {']) {
    assert.ok(block.includes(gate), `Low draws no boundary feature, rows or tramlines: ${gate}`);
  }
  // the interior skip: past 9 m + 1.3 margins the crop is whole and the headland gone whatever the noise reads
  const num = (re, label) => { const m = re.exec(block); assert.ok(m, label); return m.slice(1).map(Number); };
  const [t0, t1] = num(/bool luEdge = bnd < 1\.5 && edgeM < ([\d.]+) \+ ([\d.]+) \* uLandB\.y;/, 'the interior threshold');
  const [m0, m1] = num(/float marginM = uLandB\.y \* \(([\d.]+) \+ ([\d.]+) \* n1h\);/, 'the margin');
  const [n1hAmp] = num(/float edgeW = edgeM \+ \(n1h - 0\.5\) \* ([\d.]+) \+ \(nEdge\.x - 0\.5\) \* ([\d.]+);/, 'the edge breaker');
  const [, wanderAmp] = num(/float edgeW = edgeM \+ \(n1h - 0\.5\) \* ([\d.]+) \+ \(nEdge\.x - 0\.5\) \* ([\d.]+);/, 'the wander');
  // (farmland: the fade narrows with the footprint, never past the near field's width — the proof takes that cap)
  assert.ok(/smoothstep\(marginM, marginM \+ fadeM, edgeW\)/.test(block), 'the crop fades into the margin over fadeM');
  const [fade] = num(/float fadeM = min\(([\d.]+), /, 'the crop\'s fade into the margin, at its widest');
  const [h0, h1] = num(/float headW = ([\d.]+) \+ ([\d.]+) \* nEdge\.y;/, 'the headland');
  for (let margin = 0.5; margin <= 4; margin += 0.125) {
    const edgeW = t0 + t1 * margin - n1hAmp / 2 - wanderAmp / 2, marginM = margin * (m0 + m1);
    assert.ok(edgeW >= marginM + fade, `margin ${margin} m: the crop is whole past the threshold whatever the wander`);
    assert.ok(edgeW - marginM >= h0 + h1, `margin ${margin} m: the headland is gone past the threshold whatever its width`);
  }
  // the bake's read goes out with the ground mask's own, at the top of the splat; the block decodes it
  assert.ok(compact(text).includes(compact(`vec4 mk = maskAt(mUV);
  // ground lane (the GPU cut, hold 16): the land use's bake goes out with the ground mask's own read
  vec4 luA = vec4(0.0), luB = vec4(0.0), luK = vec4(0.5); ivec2 luT = ivec2(0);
  if (uLandA.x > 0.001) lu_fetch(wp.xz, luA, luB, luK, luT);`)), 'the bake is read with the ground mask');
  assert.ok(block.includes('lu_decode(wp.xz, luA, luB, luK, luT, crop, edgeM, track, rowDir, jit, hedgeL);'), 'the block decodes the early read');
  // the tier follows the live preset and lets go with the material
  assert.deepEqual(['ultra', 'high', 'medium', 'mobile-high', 'low', 'mobile', 'mobile-low'].map(landUseTierOf), [2, 2, 1, 1, 0, 0, 0],
    'High and Ultra draw the full block, Medium and the phones\' high tier the cheap reads, Low and the phones\' lower tiers the bake alone');
  assert.ok(compact(text).includes(compact('const offLandTier = onPresetChange(() => { landTier.value = landUseTierOf(resolvePresetName()); });')),
    'the tier follows a live preset change');
  assert.ok(compact(text).includes(compact("mat.addEventListener('dispose', () => { offLandTier(); });")), 'and lets go with the material');
}
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `unique mutation seam: ${from}`);
  return text.replace(from, to);
}
async function rejects(text, label) {
  const sample = await compile(text);
  assert.throws(() => { checkEndpoints(sample); checkFractional(sample); }, label);
}

checkSourceContract(source);
checkLandUseCut(source);
checkSourceContract(source + '\n// uniform float commentaryIsNotADeclaration;\n');
const sample = await compile(source);
checkEndpoints(sample);
checkFractional(sample);
checkLandCover(sample);
await rejects(replaceOnce(source, scalar(source, 'nearG'), 'openNear2 * (1.0 - fMs)'), 'old near reinjection');
await rejects(replaceOnce(source, scalar(source, 'farG'), 'farM * (1.0 - fR) * (1.0 - fMs) * (1.0 - projW)'), 'old far reinjection');
await rejects(replaceOnce(source, scalar(source, 'meadowG'), '(1.0 - projW) * (1.0 - fMs)'), 'missing dirt ownership');
await rejects(replaceOnce(source, normalTerm(source, 'dn2'), 'dn2.xy * 0.60 * openNear2 * (1.0 - fMs)'), 'near normal bypass');
await rejects(replaceOnce(source, nearAlbedo(source), nearAlbedo(source).replace('* nearG', '* openNear2')), 'near albedo bypass');
await rejects(replaceOnce(source, normalTerm(source, 'gnF'), 'gnF.xy * farM * 0.24'), 'far normal bypass');
await rejects(replaceOnce(source, farAlbedo(source), farAlbedo(source).replace('farG *', 'farM *')), 'far albedo bypass');
assert.throws(() => checkSourceContract(source.replace('uniform float uSea;', 'uniform float uNewDetail; uniform float uSea;')));
assert.throws(() => checkSourceContract(source.replace('world-terrain-splat-v54', 'world-terrain-splat-v53')));
assert.throws(() => checkSourceContract(source.replace('uniform sampler2D uMask, uNoise;', 'uniform sampler2D uMask, uNoise, uRingRelief;')), 'a seventeenth sampler is refused');
console.log('terrainMaterialOwnership: actual scalar/consumer endpoints, pure-G legacy response, 2048 fractional cases, continuity, the land-use cover share and nine mutation controls PASS; no GPU/art/performance claim');
