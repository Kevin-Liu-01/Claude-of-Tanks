// groundSurfaces.selftest (item ground-269, 2026-11-04; DECISIONS "Ground detail and textures on every map"): the
// ground-surface table holds a row for every class and every battlefield; each map's layer classes wear the photo sets
// its texture plan routes to those layers (sourcedTextures.ts); the simulation surface each class names is the surface
// the world's law gives that ground (trackSurface.ts's policy for the map's palette, the marshes' ice or mud, the paved
// catalogue's streets) — so the ground that is drawn is the ground that is heard — with the residuals named; the
// material's codes cover every law the chunk draws, and terrain.ts interpolates the chunk once inside splatCompute().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROUND_CLASSES, GROUND_CLASS_IDS, GROUND_CLOSE_CODE, GROUND_MACRO_CODE, MAP_GROUND, ROAD_CLASS, groundSurfaceUniformValues,
} from './groundSurfaces.ts';
import { GROUND_SURFACE_GLSL, GROUND_SURFACE_WORKS_GLSL } from './groundSurfaceShader.ts';
import { MAP_IDS } from './maps/mapIds.ts';
import { getMapConfig } from './maps/index.ts';
import { resolveSourcedTerrainPalette, sourcedTerrainLayerSet } from './sourcedTextures.ts';
import { trackSurfacePolicy } from './trackSurface.ts';
import { BUILT_ENVIRONMENT } from './maps/builtEnvironmentTable.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';

const SIM = new Set(['earth', 'hard', 'sand', 'snow', 'mud', 'water']);

// 1. Every class has a row; every battlefield has a row of classes that exist.
assert.deepEqual(Object.keys(GROUND_CLASSES).sort(), [...GROUND_CLASS_IDS].sort(), 'one row per class');
for (const [id, c] of Object.entries(GROUND_CLASSES)) {
  assert.ok(SIM.has(c.sim), `${id}: a sim surface`);
  assert.ok((c.textures.photo != null) !== (c.textures.painter != null), `${id}: a photo set or a painter`);
  assert.ok(c.macro.strength >= 0 && c.macro.strength <= 1.3 && c.close.strength >= 0 && c.close.strength <= 1.3, `${id}: strengths`);
  assert.ok(GROUND_MACRO_CODE[c.macro.kind] !== undefined && GROUND_CLOSE_CODE[c.close.kind] !== undefined, `${id}: known laws`);
}
assert.equal(GROUND_CLASSES.tilled.cover, 'none', 'no tufts on fresh tilled soil (DECISIONS 2026-10-28)');
assert.deepEqual(Object.keys(MAP_GROUND).sort(), [...MAP_IDS].sort(), 'one row per battlefield');
for (const [mapId, g] of Object.entries(MAP_GROUND)) {
  for (const key of ['open', 'worn', 'steep', 'wet']) assert.ok(GROUND_CLASSES[g[key]], `${mapId}.${key}: a class`);
  if (g.town) assert.ok(GROUND_CLASSES[g.town], `${mapId}.town: a class`);
}

// 2. Each layer's class wears the set the map's texture plan routes to that layer (a null plan keeps a painter).
const LAYER = { open: 'G', worn: 'D', steep: 'R' };
for (const mapId of MAP_IDS) {
  const splat = getMapConfig(mapId).splat ?? {};
  for (const [key, layer] of Object.entries(LAYER)) {
    const cls = GROUND_CLASSES[MAP_GROUND[mapId][key]];
    const set = sourcedTerrainLayerSet(mapId, splat, layer);
    if (cls.textures.photo) {
      // (the plan's warm rock set is the rock class's own photo)
      assert.equal(set === 'rockWarm' ? 'rock' : set, cls.textures.photo, `${mapId} ${layer}: the plan's set is ${set}, the class ${MAP_GROUND[mapId][key]} wears ${cls.textures.photo}`);
    } else {
      assert.ok(set === null || /set/.test(cls.textures.painter), `${mapId} ${layer}: a painter class over a planned set names it (${set})`);
    }
  }
}

// 3. The sim surface each class names is the world's law for that ground. The open and worn ground print by the map's
// track policy (trackSurface.ts: sand, snow, a shore's beach, else earth); the town floor stands off the roads (earth,
// or the policy's sand or snow); the wet ground is ice under frozen marshes, else mud; the paved catalogue's streets
// are hard and a dirt road earth. The steep ground is the map's ground underfoot where the policy prints sand or snow
// (the walls are not driven; a shell there reads the map's ground): named here as the residual, never hidden.
const policySurface = (p) => (p === 'sand' ? 'sand' : p === 'snow' ? 'snow' : 'earth');
const residuals = [];
for (const mapId of MAP_IDS) {
  const cfg = getMapConfig(mapId);
  const palette = resolveSourcedTerrainPalette(mapId, cfg.splat ?? {});
  const policy = trackSurfacePolicy(palette);
  const g = MAP_GROUND[mapId];
  const open = policySurface(policy);
  assert.equal(GROUND_CLASSES[g.open].sim, open, `${mapId}: the open ground ${g.open} prints ${open} (policy ${policy})`);
  const worn = policy === 'shore' ? 'sand' : open;
  assert.equal(GROUND_CLASSES[g.worn].sim, worn, `${mapId}: the worn ground ${g.worn} prints ${worn}`);
  const wet = cfg.terrain?.frozenMarshes ? 'hard' : 'mud';
  assert.equal(GROUND_CLASSES[g.wet].sim, wet, `${mapId}: the wet ground ${g.wet} is ${wet}`);
  if (g.town) {
    const town = GROUND_CLASSES[g.town].sim;
    if (town !== open) residuals.push(`${mapId}: town floor ${g.town} (${town}) on ${open}`);
  }
  const steep = GROUND_CLASSES[g.steep].sim;
  if (steep !== open && steep !== 'hard') residuals.push(`${mapId}: steep ${g.steep} (${steep}) on ${open}`);
  const paved = BUILT_ENVIRONMENT[mapId].roads.paved;
  for (const surface of [paved?.street, paved?.townStreet, paved?.square === 'print' ? null : paved?.square, ...(BUILT_ENVIRONMENT[mapId].roads.paths ?? [])]) {
    if (!surface) continue;
    assert.equal(GROUND_CLASSES[ROAD_CLASS[surface]].sim, surface === 'dirt' ? 'earth' : 'hard', `${mapId}: ${surface} roads`);
  }
}
// the residuals as they stand (2026-11-04): the canyon and desert walls on a sand print, the snow maps' rock on snow, and
// Aegis Crossing's paved town rect (townPaving), which the height field's ground type reads as earth off the roads
assert.deepEqual(residuals.sort(), [
  'alpine: steep rock (earth) on snow',
  'badlands: steep sandstone (earth) on sand',
  'cliffbridge: town floor setts (hard) on earth',
  'copper_mesa: steep rock (earth) on sand',
  'desert: steep sandstone (earth) on sand',
  'mars: steep sandstone (earth) on sand',
  'moon: steep rock (earth) on sand',
  'oasis: steep sandstone (earth) on sand',
  'whiteout: steep rock (earth) on snow',
  'winter: steep rock (earth) on snow',
], 'the named residuals of the sim column');

// 4. Ground cover: a map with no sward draws no grassland class; a map with one has a vegetated open ground or a sward
// of its margins (reeds, marram, sedge).
for (const mapId of MAP_IDS) {
  const grass = resolveGroundReduxProfile(mapId).grass;
  const g = MAP_GROUND[mapId], cover = GROUND_CLASSES[g.open].cover;
  if (!grass) assert.ok(!['meadow', 'steppe', 'verge'].includes(cover), `${mapId}: no sward, no grassland class`);
  // (a reed sward is the water's margin: the wet ground's cover)
  else if (grass.kind === 'reed') assert.ok(cover !== 'none' || GROUND_CLASSES[g.wet].cover === 'reed', `${mapId}: the reeds' margin`);
  else assert.notEqual(cover, 'none', `${mapId}: a ${grass.kind} sward stands on its open ground`);
}

// 5. The material's vectors: finite, codes the chunk draws, a town floor only of the table's own laws.
const MACRO_DRAWN = new Set([0, 1, 2, 3, 4, 5, 6]), CLOSE_DRAWN = new Set([0, 1, 2, 3]);
for (const mapId of MAP_IDS) {
  const u = groundSurfaceUniformValues(mapId);
  for (const v of [...u.open, ...u.worn, ...u.town, ...u.near]) assert.ok(Number.isFinite(v), `${mapId}: finite`);
  // (c4: sand's and snow's relief is their detail and their darkest facet no black — their caps 0.65; c8: 1, no shade
  // side held; the turf's and the soils' still under 0.7)
  assert.ok(u.near[0] > 0.2 && u.near[0] <= 1 && u.near[1] > 0.2 && u.near[1] <= 1, `${mapId}: relief caps ${u.near}`);
  for (const [i, cls] of [[0, MAP_GROUND[mapId].open], [1, MAP_GROUND[mapId].worn]]) {
    const m = GROUND_CLASSES[cls].macro.kind;
    if (m !== 'sand' && m !== 'snow') assert.ok(u.near[i] <= 0.7, `${mapId}: ${cls}'s relief cap ${u.near[i]}`);
  }
  assert.equal(u.near[2], 0.42, `${mapId}: the setts' joints' floor`);
  assert.equal(u.near[3], 1, `${mapId}: the fields' grain and the hardstanding's staggered repairs`);
  assert.ok(MACRO_DRAWN.has(u.open[0]) && CLOSE_DRAWN.has(u.open[2]) && CLOSE_DRAWN.has(u.worn[2]), `${mapId}: drawn codes`);
  assert.ok([0, 4, 5, 6].includes(u.town[0]), `${mapId}: town floor code ${u.town[0]}`);
}
assert.deepEqual(groundSurfaceUniformValues('urban').town, [4, 1, 1, 1], 'Steinburg: a yard with its stones');
assert.deepEqual(groundSurfaceUniformValues('ruinspires').town, [5, 3, 1, 1], 'Ruinspires: rubble with its debris');
assert.deepEqual(groundSurfaceUniformValues('railyard').town, [6, 2, 0.8, 1], "Cinder Junction: its cinder under the works floor's drifts");
assert.deepEqual(groundSurfaceUniformValues('foundry').town, [6, 2, 0.6, 1], 'Ironworks: a works floor of slag with its clinker');
assert.deepEqual(groundSurfaceUniformValues('no-such-map'), groundSurfaceUniformValues('verdant'), 'an unknown id runs Verdant');

// 6. The chunk: plain GLSL with a branch for each drawn code, interpolated once inside splatCompute() after the cover's
// patchwork and before the borders; its uniforms declared once; the material sets them.
assert.ok(!GROUND_SURFACE_GLSL.includes('`') && !GROUND_SURFACE_GLSL.includes('${'), 'plain GLSL');
assert.ok(!GROUND_SURFACE_GLSL.startsWith('\n') && !GROUND_SURFACE_GLSL.endsWith('\n'), 'whole lines');
for (const text of ['uGsOpen.x < 2.5', 'step(1.5, uGsOpen.x)', 'uGsTown.x > 3.5 && uGsTown.x < 5.5', 'uGsTown.x < 4.5', 'kind > 2.5',
  'kind > 1.5', 'uLandTier > 0.5'])
  assert.ok(GROUND_SURFACE_GLSL.includes(text), `the chunk draws ${text}`);
assert.ok(GROUND_SURFACE_WORKS_GLSL.includes('float wkF = uGsTown.x > 5.5 ? max(gWorksFloor, yardW * (1.0 - roadCore) * keepM) : 0.0;'),
  'the works floor by its code, over a works and a rail yard');
for (const chunk of [GROUND_SURFACE_GLSL, GROUND_SURFACE_WORKS_GLSL]) {
  assert.ok(!chunk.includes('`') && !chunk.includes('${'), 'plain GLSL');
  assert.ok(!/texture2D|textureLod\(u(Alb|Nrm)/.test(chunk), 'no layer fetch: noise reads and hash cells only');
  assert.ok(!/\bfor\s*\(|\bwhile\s*\(/.test(chunk), 'no loop (no per-pixel search)');
  // (ab8, Blackglass: a read of nz(...).b drew the woods mask, tiled, as dark smudges) the noise texture's B channel is the
  // woods mask, read only at its own 1/1024 scale in terrain.ts
  assert.ok(!/nz\([^;]*\)\.b\b/.test(chunk), 'no read of the woods mask as a noise field');
}
assert.ok(GROUND_SURFACE_GLSL.includes('gsTownW *= 1.0 - 0.6 * gParcelW;'), 'the town floor over a land-use parcel at the old wear\'s share');
const raw = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const fragAt = raw.indexOf('const SPLAT_COMMON_FRAG = /* glsl */`');
const computeAt = raw.indexOf('void splatCompute() {', fragAt);
const fragEnd = raw.indexOf('\n`;\n', computeAt);
const tokenAt = raw.indexOf('${GROUND_SURFACE_GLSL}');
assert.equal(raw.split('${GROUND_SURFACE_GLSL}').length, 2, 'interpolated exactly once');
assert.ok(tokenAt > computeAt && tokenAt < fragEnd && raw[tokenAt - 1] === '\n', 'inside splatCompute(), on its own line');
assert.ok(tokenAt > raw.indexOf("the cover's own patchwork at 2–8 m", computeAt) && tokenAt < raw.indexOf('the borders themselves', computeAt),
  'after the patchwork, before the borders');
// the works floor after the roads (its roads and hardstands are its floor too), inside splatCompute(), once
const worksAt = raw.indexOf('${GROUND_SURFACE_WORKS_GLSL}');
assert.equal(raw.split('${GROUND_SURFACE_WORKS_GLSL}').length, 2, 'the works floor interpolated exactly once');
assert.ok(worksAt > raw.indexOf('a.rgb *= 1.0 - gutter * 0.18 * gRoadTex;', computeAt) && worksAt < fragEnd && raw[worksAt - 1] === '\n',
  'the works floor after the roads, inside splatCompute(), on its own line');
assert.equal(raw.split('uniform vec4 uGsOpen, uGsWorn, uGsTown;').length, 2, 'the uniforms declared once');
for (const name of ['uGsOpen', 'uGsWorn', 'uGsTown', 'uGsNear']) assert.ok(raw.includes(`shader.uniforms.${name} = {`), `the material sets ${name}`);
// the relief cap: set in splatCompute by the chunk, applied in the normal pass before the world normal is composed
assert.ok(GROUND_SURFACE_GLSL.includes('gGsTilt = uGsNear.x > 0.0'), 'the chunk sets the cap');
// (ab9, Blackglass: the lit facets alone drew pale combed arcs at range) and its other side, a facet's gain, the cap's own
// past ~45 m; the normal pass bounds both
assert.ok(GROUND_SURFACE_GLSL.includes('gGsGain = gGsTilt * mix(3.0, 1.0, smoothstep(15.0, 45.0, camDist));'), 'the chunk sets the gain');
assert.ok(raw.includes('float gsB = gsGL * (gsD < 0.0 ? gGsTilt : gGsGain);'), 'the normal pass bounds a facet\'s loss and its gain');
assert.ok(GROUND_SURFACE_GLSL.includes('* smoothstep(0.04, 0.22, saturate(dot(normalize(cameraPosition - wp), wn)));'),
  'the mosaic fades as the view grazes, by the mid dapple\'s law (diag2: its patches foreshortened to slivers)');
// (c7, Amberford's square: the table named the soil's mosaic and the material drew none of it) every macro code a map
// packs has its law in the chunks: the open ground's sward, tussock and soil, the worn ground's soil, the town's yard,
// rubble and slag (a worn ground of cinder is the rail yard's, drawn by the works floor over its yard: its map's town
// floor is slag too)
const MACRO_LAW = {
  open: { 1: 'uGsOpen.x > 0.5 && uGsOpen.x < 2.5', 2: 'step(1.5, uGsOpen.x)', 3: 'uGsOpen.x > 2.5 && uGsOpen.x < 3.5' },
  worn: { 3: 'uGsWorn.x > 2.5 && uGsWorn.x < 3.5', 6: 'uGsTown.x > 5.5' },
  town: { 4: 'if (uGsTown.x < 4.5)', 5: 'if (uGsTown.x > 4.5)', 6: 'uGsTown.x > 5.5' },
};
const lawText = GROUND_SURFACE_GLSL + GROUND_SURFACE_WORKS_GLSL;
for (const mapId of MAP_IDS) {
  const u = groundSurfaceUniformValues(mapId);
  for (const [side, code] of [['open', u.open[0]], ['worn', u.worn[0]], ['town', u.town[0]]]) {
    if (!code) continue;
    const gate = MACRO_LAW[side][code];
    assert.ok(gate && lawText.includes(gate), `${mapId}: the ${side} ground's macro code ${code} has its law in the chunks`);
    if (side === 'worn' && code === 6) assert.equal(u.town[0], 6, `${mapId}: a cinder worn ground stands under a slag town floor`);
  }
}
// (diag2: the splat's warp folds over ~23 % of the ground and smears metre fields into strands) no field of the table's
// reads the warped coordinate
assert.ok(![GROUND_SURFACE_GLSL, GROUND_SURFACE_WORKS_GLSL].some(t => t.split('\n').some(l => !l.trim().startsWith('//') && /\buvW\b/.test(l))),
  'the table\'s fields read uv, never the warped uvW');
// (ab9, Ironworks: "black" lots) the works floor never under a tenth of the light; (Cinder Junction: "pale blotches …
// repeating") its ash the 4–8 m drifts alone
assert.ok(GROUND_SURFACE_WORKS_GLSL.includes('max(1.0, 0.10 / max(reduxLuma(a.rgb), 0.01))')
  && !GROUND_SURFACE_WORKS_GLSL.split('\n').some(l => !l.trim().startsWith('//') && /\bn1h\b/.test(l)),
  'the works floor lifted off black, its ash the drifts alone');
// the sown fields' level and grain read the switch (the old clamp at 0), as the hardstanding's repairs do
assert.ok(raw.includes('if (uGsNear.w > 0.0) {\n        float gsML = max(reduxLuma(uMeanG.rgb), 1e-3);'), 'the crops keep their grain');
assert.ok(raw.includes('if (uGsNear.w > 0.0) hp.x += 0.5 * mod(floor(hp.y), 2.0)'), 'the repairs staggered');
// the props' foundation rings (props.ts contactDarkeningMaterial) keep two fifths of their darkening where the table runs
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.ok(props.includes('shader.uniforms.uGsContact = { value: 1 };') && props.includes('if (vColor.r < 0.5) diffuseColor.a *= mix(1.0, 0.4, uGsContact);'),
  'the foundation rings softened, the old law at uGsContact 0');
// the street-row towns' aprons give way to the town floor (props.ts apronGroundTableHook), the old decal at uGsApron 0
assert.ok(props.includes("decalKind === 'apron' ? apronGroundTableHook : null") && props.includes('diffuseColor.a *= 1.0 - uGsApron;'),
  'the aprons draw nothing where the table runs');
// the setts' joints and lost setts (roadSurfaceShader.ts) read the floor, the old law at 0
const pave = readFileSync(new URL('./roadSurfaceShader.ts', import.meta.url), 'utf8');
// (ab9, Ruinspires: "asphalt reads untextured", the phone's "large untextured paving slabs") the asphalt's and the print's
// mid grain read the floor too
assert.equal(pave.split('if (uGsNear.z > 0.0) asph *= mix(0.90, 1.10,').length, 2, 'the asphalt\'s mid mottle, by the table');
assert.equal(pave.split('if (uGsNear.z > 0.0) pav.rgb *= mix(0.90, 1.10,').length, 2, 'the print\'s grain, by the table');
// (c5, Ruinspires on the phone: "a checker of flat tones") the Low tier's asphalt its 1–2 m mottle, its repairs a shade off
assert.ok(pave.includes('if (gsPv > 0.5) asph *= mix(0.88, 1.12,') && pave.includes('asph * mix(0.78, 0.88, gsPv)'), 'the phone\'s asphalt, by the table');
for (const t of ['if (uGsNear.z > 0.0) jointC = max(jointC, stone * uGsNear.z);', 'uGsNear.z > 0.0 ? mix(jointC, uMeanD.rgb * uSoilTint * 0.8, 0.5) : jointC * 0.6',
  'if (uGsNear.z > 0.0) jointM = max(jointM,', 'vec3 settJ = uGsNear.z > 0.0 ? sett * uGsNear.z : vec3(0.040, 0.036, 0.031);'])
  assert.ok(pave.includes(t), `the paving reads the joints' floor: ${t}`);
const capAt = raw.indexOf('vec3 gsL = directionalLights[0].direction;');
const normalAt = raw.indexOf('normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);');
assert.ok(capAt > raw.indexOf('const SPLAT_NORMAL_FRAG') && normalAt > 0 && capAt > normalAt && capAt - normalAt < 1200,
  'the cap on the composed normal, against the key light (directionalLights[0]), in the normal pass');

console.log(`groundSurfaces: PASS (${GROUND_CLASS_IDS.length} classes, ${MAP_IDS.length} maps, ${residuals.length} named residuals)`);
