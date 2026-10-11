import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROAD_FRAME_ARC_UNITS, ROAD_FRAME_RESIDUAL_STEPS, createHeightField, makeMaskTexture, mulberry32, stackLandUseBake } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';
import {
  MAP_PATH_SURFACES, MAP_PAVED_SURFACES, ROAD_SURFACE_BY_CLIMATE, ROAD_SURFACE_CODE, ROAD_SURFACE_MAP_OVERRIDES,
  pavedSurfaceUniforms, roadSurfaceUniforms,
} from './roadSurfaces.ts';

// Roads lane (2026-10-09; owner: "make sure roads and stuff are really good", then: the roads "need to look a lot better,
// especially paved ones"). Pins: the catalogue's surfaces are real classes on real maps' paths; every map takes its climate's
// worked road under its own departures (2026-10-10, the owner's free hand — the former protected maps with the rest); the
// road frame layer carries every road's running length, heading and the texel's exact distance at every texel of its ramp,
// and the stack addresses it after the road layer; the material reads it with one exact fetch and draws the paved classes
// and the worked carriageway from the uniforms. No GPU or art claim.

// the catalogue: real maps, real classes, no dirt as a paved class; the former protected maps (the free hand would allow
// it) carry no paved class or path surface until a period ruling gives them one
const PROTECTED = ['verdant', 'frontier', 'winter', 'saltwind', 'reservoir', 'railyard', 'coastal', 'desert', 'fjord'];
for (const [id, paved] of Object.entries(MAP_PAVED_SURFACES)) {
  assert.ok(MAP_IDS.includes(id), `${id} is a map`);
  assert.ok(!PROTECTED.includes(id), `${id} is not one of the former protected maps (no period ruling paves them)`);
  for (const key of ['street', 'square']) {
    if (paved[key] === undefined) continue;
    if (key === 'square' && paved[key] === 'print') continue; // (the squares' own print or slabs)
    assert.ok(ROAD_SURFACE_CODE[paved[key]] > 0 && paved[key] !== 'dirt', `${id}'s ${key} is a paved class`);
  }
}
for (const [id, list] of Object.entries(MAP_PATH_SURFACES)) {
  assert.ok(MAP_IDS.includes(id) && !PROTECTED.includes(id), `${id} is a map with a period ruling for its paths`);
  const paths = getMapConfig(id).terrain.roads.paths;
  assert.ok(list.length <= paths.length, `${id}: no surface past its ${paths.length} paths`);
  for (const surface of list) assert.ok(surface === null || ROAD_SURFACE_CODE[surface] > 0, `${id}: ${surface} is a class`);
}
// (2026-10-10, the owner's free hand) the former protected maps take their climate's worked road like every other map
const row = (w) => ({ a: [w.relief, w.stones, w.potholes, w.treads], b: [w.washboard, w.toneFloor, w.laneTone, w.windrow],
  c: [w.dust, w.braids, w.midStrip, w.pale], d: [...(w.soil ?? [1, 1, 1]), w.fieldTone] });
for (const id of PROTECTED) {
  // (none keeps the old law's off row; a regional departure — Sirocco's sand, Saltmere's loam — rides on its climate's row)
  const own = ROAD_SURFACE_MAP_OVERRIDES[id];
  assert.ok(!own || (own.relief === undefined && own.laneTone === undefined), `${id}: no old-law override`);
  for (const climate of ['vegetated', 'arid', 'snow']) {
    assert.deepEqual(roadSurfaceUniforms(id, climate, undefined), row({ ...ROAD_SURFACE_BY_CLIMATE[climate], ...(own ?? {}) }), `${id} (${climate}): its climate's row`);
  }
}
// R3 (the gauntlet's wave 349b: "darkening the ruts is the wrong direction"): no climate darkens its dry wheel paths — only
// a snow road's slush; every vegetated and arid road is dusted, its paths paler; the sward grows between a farm road's paths
assert.deepEqual([ROAD_SURFACE_BY_CLIMATE.vegetated.laneTone, ROAD_SURFACE_BY_CLIMATE.arid.laneTone], [0, 0], 'no lane darkening on dry ground');
for (const c of ['vegetated', 'arid']) assert.ok(ROAD_SURFACE_BY_CLIMATE[c].dust > 0 && ROAD_SURFACE_BY_CLIMATE[c].pale > 0, `${c}: dust and pale paths`);
assert.ok(ROAD_SURFACE_BY_CLIMATE.vegetated.midStrip > 0 && ROAD_SURFACE_BY_CLIMATE.arid.midStrip === 0, 'the sward strip on a vegetated map only');
// Redrock: braided sand tracks (no washboard, potholes or windrow in the sand) under its splat's own fields; the steppe dry
assert.deepEqual(roadSurfaceUniforms('badlands', 'arid', { stones: 0.9 }).a,
  [ROAD_SURFACE_BY_CLIMATE.arid.relief, 0.5, 0, ROAD_SURFACE_BY_CLIMATE.arid.treads], 'Redrock: the arid row, no potholes, its own stones');
assert.deepEqual(roadSurfaceUniforms('badlands', 'arid', undefined).c.slice(0, 2), [0.8, 1], 'Redrock: dusted pale, braided');
assert.equal(roadSurfaceUniforms('badlands', 'arid', undefined).b[0], 0, 'Redrock: no washboard in the sand');
assert.ok(roadSurfaceUniforms('steppe', 'vegetated', undefined).c[0] >= 0.8, 'the steppe in its dry season');
assert.ok(roadSurfaceUniforms('monsoon', 'vegetated', undefined).c[0] <= 0.15, 'Monsoon Ridge wet');
// (R3, wave 341's pads) the road's soil: the splat's soil tint (Saltwind's terra rossa) unless the catalogue names the road's
// own (Saltmere's Léon loam over its strand-sand dirt layer); the field's tone in a desert's tracks and pads
assert.deepEqual(roadSurfaceUniforms('saltwind', 'vegetated', undefined, [0.46, 0.30, 0.34]).d.slice(0, 3), [0.46, 0.30, 0.34], 'Saltwind: the splat\'s terra rossa');
assert.deepEqual(roadSurfaceUniforms('coastal', 'vegetated', undefined, [1.2, 1.1, 1.0]).d.slice(0, 3), [0.56, 0.47, 0.37], 'Saltmere: the road\'s own loam');
assert.ok(roadSurfaceUniforms('desert', 'arid', undefined).d[3] >= 0.8 && roadSurfaceUniforms('badlands', 'arid', undefined).d[3] === 1, 'Sirocco and Redrock: the sand\'s own tone');
// the paved uniforms: classes by code, the town rect only with kerbs, the old print without a config
const town = { x0: -100, x1: 60, z0: -40, z1: 80 };
assert.deepEqual(pavedSurfaceUniforms(undefined, town).cls, [0, 0, 0, 0], 'no config: the R print');
assert.deepEqual(pavedSurfaceUniforms(undefined, town).wear, [1, 1, 1, 0], 'no config: town wear, dry');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.urban, town).cls, [3, 2, 1, 0.36], 'Steinburg: patched streets, a sett square in arcs, 0.36 m gutters');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.urban, town).town, [-20, 20, 80, 60], 'its kerbed town rect');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.cliffbridge, town).town, [0, 0, 0, 0], 'no kerbs: no town rect');
assert.deepEqual(pavedSurfaceUniforms(undefined, town).extra, [1, 0, 0, 0], 'no config: tone 1, no town street class, no lines or fills');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.urban, town).extra, [0.92, 2, 1, 0], 'Steinburg: setts inside the kerbed town, centre lines past it');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.ruinspires, town).extra.slice(2), [1, 1], 'Ruinspires: centre lines and shell-hole fills');
assert.equal(pavedSurfaceUniforms(MAP_PAVED_SURFACES.foundry, town).extra[0], 0.55, 'Ironworks: sooty setts');
// (r4 frames: Kestrel's concrete lane class read smoother than its own slab print — it keeps the print, roads and aprons)
assert.equal(MAP_PAVED_SURFACES.airfield, undefined, 'Kestrel keeps its airfield slabs');

// the layout: a catalogued path takes its surface where the map's own pathStyles leave it unstyled
{
  const field = createHeightField(1337, getMapConfig('polders'));
  const styles = field._layout.roadStyles;
  assert.ok(styles && styles.length === field._layout.roads.length, 'Tidegate: a style per road line');
  const want = MAP_PATH_SURFACES.polders;
  for (let i = 0; i < want.length; i++) assert.deepEqual(styles[i], want[i] ? { surface: want[i], catalogue: true } : null, `Tidegate path ${i}`);
  // the road layer marks a catalogued class with bit 7, so the Low tier draws the path as the map's own road. (2026-10-10:
  // built as production builds it — Tidegate's shore stamp (shoreDirt, seaRamp[0] 0.12) reuses the road raster after the
  // layers are taken; before, every texel read its distance to the water and the layer came out empty)
  const texture = makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout, null, field._waterWetnessAt, 0.12);
  assert.ok(texture.userData.roadFrame, 'Tidegate keeps its road frame through the shore stamp');
  const layer = texture.userData.roadLayer, n = texture.image.width;
  const [x0, z0] = field._layout.roads[0][1];
  const t = (Math.floor((z0 + 512) * n / 1024) * n + Math.floor((x0 + 512) * n / 1024)) * 4;
  assert.equal(layer.data[t], 128 | ROAD_SURFACE_CODE.clinker, 'Tidegate\'s mill lane: clinker, marked as the catalogue\'s');
}

assert.equal(32768 / ROAD_FRAME_ARC_UNITS, 512, 'the running length wraps at 512 m (15 bits under the side bit)');
// the road frame layer: every texel within 14 m of a road holds the nearest line's running length (1/64 m, 16 bits) and
// heading (16 bits of a turn); on a straight east-west road the length grows with x and the heading is 0
{
  const cfg = getMapConfig('steppe');
  const field = createHeightField(1337, cfg);
  const texture = makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout, null, field._waterWetnessAt, null);
  const frame = texture.userData.roadFrame;
  const n = texture.image.width;
  assert.ok(frame && frame.n === n && frame.data.length === n * n * 4, 'one frame layer, a texel per mask texel');
  const px = texture.image.data;
  let near = 0, missing = 0;
  for (let i = 0; i < n * n; i++) {
    if (px[i * 4 + 1] > 0) { near++; if (!frame.data[i * 4] && !frame.data[i * 4 + 1] && !frame.data[i * 4 + 2] && !frame.data[i * 4 + 3]) missing++; }
  }
  assert.ok(near > 1000 && missing / near < 0.002, `every texel of a road's ramp has a frame (${missing} of ${near} empty)`);
  // along one road's segment the running length steps by the texel spacing projected on the heading
  const road = field._layout.roads[0];
  const [ax, az] = road[0], [bx, bz] = road[1];
  const len = Math.hypot(bx - ax, bz - az);
  const texelOf = (x, z) => Math.floor((z + 512) * n / 1024) * n + Math.floor((x + 512) * n / 1024);
  const arcAt = (i) => ((frame.data[i * 4] & 127) * 256 + frame.data[i * 4 + 1]) / ROAD_FRAME_ARC_UNITS;
  const sideAt = (i) => (frame.data[i * 4] & 128 ? -1 : 1);
  // (R3) B A: the heading in 12 bits over a nibble of the mask's distance byte's rounding residual
  const turnAt = (i) => (frame.data[i * 4 + 2] * 16 + (frame.data[i * 4 + 3] >> 4)) / 4096;
  const want = ((Math.atan2(bz - az, bx - ax) / (2 * Math.PI)) % 1 + 1) % 1;
  for (const t of [0.3, 0.5, 0.7]) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (Math.max(Math.abs(x), Math.abs(z)) > 500) continue;
    const i = texelOf(x, z);
    const turnErr = Math.min(Math.abs(turnAt(i) - want), 1 - Math.abs(turnAt(i) - want));
    assert.ok(turnErr < 0.003, `the heading at ${t} of the first segment (${turnAt(i).toFixed(4)} vs ${want.toFixed(4)})`);
    // the texel centre's own running length: within a texel's diagonal of the point's
    assert.ok(Math.abs(arcAt(i) - (t * len) % 512) < 1024 / n * 1.5, `the running length at ${t} (${arcAt(i).toFixed(2)} vs ${(t * len).toFixed(2)})`);
    // the side bit: 6 m left of the heading and 6 m right of it stand on opposite sides
    const lx = -(bz - az) / len, lz = (bx - ax) / len;
    assert.equal(sideAt(texelOf(x + lx * 6, z + lz * 6)), 1, `left of the heading at ${t}`);
    assert.equal(sideAt(texelOf(x - lx * 6, z - lz * 6)), -1, `right of the heading at ${t}`);
  }
  // (R3, the gauntlet's Autumn "worm trails": the texel centre's distance read from G alone is a 4.7 cm step) G's byte and
  // the frame's residual give the texel centre's exact distance to its nearest line within a few millimetres
  {
    const segs = [];
    for (const nodes of field._layout.roads) for (let k = 0; k + 1 < nodes.length; k++) segs.push([...nodes[k], ...nodes[k + 1]]);
    const exact = (x, z) => {
      let best = 1e9;
      for (const [ax2, az2, bx2, bz2] of segs) {
        const dx = bx2 - ax2, dz = bz2 - az2, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax2) * dx + (z - az2) * dz) / l2));
        best = Math.min(best, Math.hypot(x - ax2 - dx * t, z - az2 - dz * t));
      }
      return best;
    };
    let checked = 0, worst = 0, worstByte = 0;
    for (let i = 0; i < n * n && checked < 400; i += 61) {
      if (!px[i * 4 + 1] || px[i * 4 + 1] > 250) continue;
      const tx = i % n, tz = Math.floor(i / n);
      const d = exact((tx + 0.5) * 1024 / n - 512, (tz + 0.5) * 1024 / n - 512);
      const byteOnly = (1 - px[i * 4 + 1] / 255) * 12;
      if (Math.abs(byteOnly - d) > 0.03) continue; // (a stamp rewrote this texel's G: a pad's)
      const q = frame.data[i * 4 + 3] & 15;
      const withRes = (1 - (px[i * 4 + 1] + q / ROAD_FRAME_RESIDUAL_STEPS - 0.5) / 255) * 12;
      worst = Math.max(worst, Math.abs(withRes - d));
      worstByte = Math.max(worstByte, Math.abs(byteOnly - d));
      checked++;
    }
    assert.ok(checked > 100, `enough ramp texels checked (${checked})`);
    assert.ok(worst < 0.004, `the residual's distance within 4 mm (worst ${(worst * 1000).toFixed(2)} mm, the byte alone ${(worstByte * 1000).toFixed(1)} mm)`);
  }
  // the stack: the frame after the road layer (here the only layer), addressed by uRoadFrame
  const st = stackLandUseBake(texture, null, 1, null, frame);
  const rows = texture.image.height;
  assert.deepEqual(st.frame.toArray(), [n, rows + 128, 1, 0], 'uRoadFrame: the layer\'s size and first row');
  assert.deepEqual(st.road.toArray(), [1, 0, 0, 0], 'no styled net: the road class is off');
  const W = st.texture.image.width;
  for (let j = 0; j < n; j += 97) {
    assert.deepEqual([...st.texture.image.data.subarray((rows + 128 + j) * W * 4, (rows + 128 + j) * W * 4 + n * 4)],
      [...frame.data.subarray(j * n * 4, (j + 1) * n * 4)], `the frame's row ${j} in the stack`);
  }
}

// the material: one exact fetch of the frame; the paved classes and the worked carriageway read their uniforms
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ');
for (const line of [
  'uniform vec4 uRoadFrame;',
  'vec4 fc = texelFetch(uMask, ft + ivec2(0, int(uRoadFrame.y + 0.5)), 0);',
  'gRoadS = (fArc - (fSide < 0.0 ? 32768.0 : 0.0)) * (1.0 / 64.0) + dot(wp.xz - fC, gRoadAlong);',
  'gRoadY = fSide * fDc + dot(wp.xz - fC, vec2(-gRoadAlong.y, gRoadAlong.x));',
  'gRoadYOk = step(fDc, 11.9) * step(abs(abs(gRoadY) - dRoad), 1.2);',
  'uniform vec4 uRoadSurf, uRoadSurfB;',
  'uniform vec4 uRoadSurfC;',
  'shader.uniforms.uRoadSurfC = { value: new THREE.Vector4(...roadWork.c) };',
  // (R3) the frame's 12-bit heading and the texel centre's exact distance from G's byte and the residual
  'float fTurn = (floor(fc.b * 255.0 + 0.5) * 16.0 + fAh) * (6.2831853 / 4096.0);',
  'float fDc = (1.0 - texelFetch(uMask, ft, 0).g - ((fA - 16.0 * fAh) / 15.0 - 0.5) / 255.0) * 12.0;',
  // the worked road's lanes a parallel pair weaving together on the exact signed offset; none of the old darkening
  'float laneY = workedR && gRoadYOk > 0.5 ? abs(gRoadY - roadWeave) : dRoad;',
  'float trodMid = (1.0 - smoothstep(0.6, 2.4, dRoad)) * roadCore * rutAmp * mix(1.0, uRoadSurfB.z, workedK);',
  // (R3b) the middle strip stops at a village (the mask's town wear) and holds in stretches and patches, never one stripe
  'float townM = 1.0 - smoothstep(0.06, 0.30, mk.a);',
  'float mg = midStr * smoothstep(0.34, 0.56, nz(uv, 0.009, vec2(0.23, 0.67)).g) * patchM * townM',
  'uniform vec4 uPaveClass, uPaveWear, uPaveTown;',
  'shader.uniforms.uRoadFrame = { value: maskStack.frame };',
  'const roadWork = roadSurfaceUniforms(mapId, groundProfile.climate, S.roadSurface, S.soilTint as [number, number, number] | undefined);',
  'shader.uniforms.uRoadSurfD = { value: new THREE.Vector4(...roadWork.d) };',
  'if (workedR) packedRoad *= uRoadSurfD.rgb;',
  'const pavedCfg: PavedSurfaceConfig | undefined = S.pavedSurface ?? MAP_PAVED_SURFACES[mapId];',
  'if (gRoadClass > 0.5) gRoadTex = abs(gRoadClass - 4.0) < 0.5 ? 0.0 : 1.0;',
  'if (gRoadClass > 127.5) gRoadClass = uLandTier > 0.5 ? gRoadClass - 128.0 : 0.0;',
  'float roadFloorL = floorK * dot(a.rgb, vec3(0.34, 0.45, 0.21));',
  'a.rgb *= 1.0 - min(mix(rut * rutShade, trodMid * 0.55, laneFar), 1.0) * mix(0.34, 0.26, gRoadTex) * (1.0 - gRoadTex * step(0.5, uLandTier));',
]) assert.ok(source.includes(line.replace(/\s+/g, ' ')), `the material: ${line}`);
// (the old law, exactly, where every gain is 0: the worked carriageway's block is skipped, the floor clamps to 1, the old
// grey pull holds and the lanes keep their whole darkening)
assert.ok(source.includes('if (dW > 0.002 && wR > 0.002 && uRoadSurf.x + uRoadSurf.y + uRoadSurf.z + uRoadSurfB.x > 0.0 && uLandTier > 0.5) {'),
  'the worked carriageway runs only where a gain is set, and never on the Low tier (the phones keep the old law)');
assert.ok(source.includes('if (uLandTier < 0.5) pCls = gRoadClass > 0.5 && gRoadClass < 3.5 ? gRoadClass : 0.0;'), 'Low paves by the old law');
// the Low tier (the phones' default) keeps every old road term: the styled paths' old code verbatim, no kerbed pave-out, no
// square wear, the old tone and lane swing (the phone pair checks the frames)
{
  const main = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  const lowAt = main.indexOf('} else if (uLandTier < 0.5) {');
  assert.ok(lowAt > 0, 'the Low branch of the paved surfaces');
  const lowBlock = main.slice(lowAt, main.indexOf('\n      } else {\n', lowAt));
  for (const line of ["float course = rq.x / 0.16, ci = floor(course);", "vec3 asph = vec3(0.068, 0.068, 0.072) * (0.92 + 0.16 * agg);",
    "vec2 pc = vec2(rq.x / 4.2, rq.y / 2.4), pcI = floor(pc), pcF = fract(pc);"]) {
    assert.ok(lowBlock.includes(line), `the Low branch keeps the old styled law: ${line}`);
  }
  for (const line of ['if (uPaveTown.z > 0.0 && uLandTier > 0.5) {', 'if (!fr && uLandTier > 0.5) {',
    'float floorK = uLandTier > 0.5 ? uRoadSurfB.y : 0.0;',
    'bool workedR = uRoadSurf.x > 0.0 && uLandTier > 0.5;', 'float laneWob = workedR ? 0.0 : (n1 - 0.5) * 0.55;',
    'if (uLandTier < 0.5) rut = max(rut, padRut * rutAmp * 1.2);',
    'if (uLandTier < 0.5) a.rgb *= 1.0 - padRut * (uReduxD.y > 1.5 ? 0.06 : 0.20);']) assert.ok(main.includes(line), `Low keeps the old law: ${line}`);
}
assert.ok(source.includes('floorK > 0.0 ? 0.12 : 0.26'), 'the old grey pull without a tone floor');
// R4 (2026-10-10, the gauntlet's wave 349a): a joint or an edge is drawn at the share of the pixel it covers (bandCov: crisp
// near, its true weight far, never a widened stripe), the setts' joints with no distance fade and no lost setts, the bricks
// laid on edge at their true size (an n-to-1 herringbone), and a procedural paved road ends on its own crisp edge past the
// Low tier only (where the frame holds, off the kerbed and paved towns and the airfield's slabs)
{
  const bandCov = (d, hw, fw) => Math.min(1, Math.max(0, (Math.min(d + 0.5 * fw, hw) - Math.max(d - 0.5 * fw, -hw)) / Math.max(fw, 1e-4)));
  assert.equal(bandCov(0, 0.01, 0.001), 1, 'a resolved joint covers its pixel');
  assert.equal(bandCov(0.05, 0.01, 0.001), 0, 'and none beside it');
  assert.ok(Math.abs(bandCov(0, 0.01, 0.2) - 0.1) < 1e-9, 'a joint under a wide footprint: its width over the footprint');
  let mass = 0; for (let d = -0.5; d <= 0.5; d += 0.001) mass += bandCov(Math.abs(d), 0.01, 0.1) * 0.001;
  assert.ok(Math.abs(mass - 0.02) < 0.002, `the joint's weight is conserved under the footprint (${mass.toFixed(4)})`);
  for (const line of [
    'float bandCov(float d, float hw, float fw) {',
    'float jC = mix(2.0 * jw / 0.17, bandCov(min(sf.x, 0.17 - sf.x), jw, fwAl), vC);',
    'jointS = 1.0 - (1.0 - jC) * (1.0 - jL);',
    // (R4 cost) past both sets of joints' resolution the setts' limit at once — no per-sett hash on a wide view's far half
    'if (sv > 0.004) {', 'jointS = 0.19;',
    'float bw = soling ? 0.075 : 0.05, bn = soling ? 3.0 : 4.0;',
    'float hd = mod(hc.x - hc.y, 2.0 * bn);',
    'if (uLandTier > 0.5 && gRoadTex > 0.5 && gRoadYOk > 0.5 && gRoadFrameW > 0.5 && uPaveSlab.x <= 0.0) {',
    'float inE = bandCov(ayE, edgeY, fwE);',
    'a.rgb *= 1.0 - gutter * 0.18 * gRoadTex * (paveEdgeY > 0.0 ? 0.0 : 1.0);',
  ]) assert.ok(source.includes(line.replace(/\s+/g, ' ')), `R4: ${line}`);
  assert.ok(!source.includes('float lost = step(0.992, sh.y) * svs;') && !source.includes('smoothstep(9.0, 32.0, camDist)'),
    'no lost setts, no distance fade on the joints');
  // the n-to-1 herringbone tiles: every cell one brick's, each brick n cells, horizontal and vertical alternating
  for (const n of [3, 4]) {
    const owner = new Map();
    for (let cy = -20; cy < 20; cy++) for (let cx = -20; cx < 20; cx++) {
      const hd = ((cx - cy) % (2 * n) + 2 * n) % (2 * n);
      const id = hd < n ? `h${cx - hd},${cy}` : `v${cx},${cy - (2 * n - 1 - hd)}`;
      owner.set(id, (owner.get(id) ?? 0) + 1);
    }
    const sizes = [...owner.entries()].filter(([id]) => { const [x, y] = id.slice(1).split(',').map(Number); return Math.abs(x) < 12 && Math.abs(y) < 12; }).map(([, c]) => c);
    assert.ok(sizes.length > 50 && sizes.every((c) => c === n), `${n}-to-1 herringbone: every interior brick covers ${n} cells`);
  }
}

console.log('roadSurfaces: the catalogue\'s classes and maps, every map\'s worked road (the free hand), the layout\'s catalogued paths, the road frame layer\'s running length, heading and exact distance, its stack address and the material\'s reads PASS; no GPU/art claim');
