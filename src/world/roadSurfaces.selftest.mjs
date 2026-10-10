import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField, makeMaskTexture, mulberry32, stackLandUseBake } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';
import {
  MAP_PATH_SURFACES, MAP_PAVED_SURFACES, ROAD_SURFACE_BY_CLIMATE, ROAD_SURFACE_CODE, ROAD_SURFACE_MAP_OVERRIDES,
  pavedSurfaceUniforms, roadSurfaceUniforms,
} from './roadSurfaces.ts';

// Roads lane (2026-10-09; owner: "make sure roads and stuff are really good", then: the roads "need to look a lot better,
// especially paved ones"). Pins: the catalogue's surfaces are real classes on real maps' paths; the owner's protected maps
// keep the old road law; the road frame layer carries every road's running length and heading at every texel of its
// ramp, and the stack addresses it after the road layer; the material reads it with one exact fetch and draws the paved
// classes and the worked carriageway from the uniforms. No GPU or art claim.

// the catalogue: real maps, real classes, no dirt as a paved class, no protected map paved
const PROTECTED = ['verdant', 'frontier', 'winter', 'saltwind', 'reservoir', 'railyard', 'coastal', 'desert', 'fjord'];
for (const [id, paved] of Object.entries(MAP_PAVED_SURFACES)) {
  assert.ok(MAP_IDS.includes(id), `${id} is a map`);
  assert.ok(!PROTECTED.includes(id), `${id} is not one of the owner's protected maps`);
  for (const key of ['street', 'square']) {
    if (paved[key] === undefined) continue;
    assert.ok(ROAD_SURFACE_CODE[paved[key]] > 0 && paved[key] !== 'dirt', `${id}'s ${key} is a paved class`);
  }
}
for (const [id, list] of Object.entries(MAP_PATH_SURFACES)) {
  assert.ok(MAP_IDS.includes(id) && !PROTECTED.includes(id), `${id} is an unprotected map`);
  const paths = getMapConfig(id).terrain.roads.paths;
  assert.ok(list.length <= paths.length, `${id}: no surface past its ${paths.length} paths`);
  for (const surface of list) assert.ok(surface === null || ROAD_SURFACE_CODE[surface] > 0, `${id}: ${surface} is a class`);
}
// the protected maps keep the old law: no relief, stones, potholes, treads or washboard, the old tone (floor 0) and the
// lanes' whole albedo darkening (laneTone 1), whatever their climate or splat
for (const id of PROTECTED) {
  for (const climate of ['vegetated', 'arid', 'snow']) {
    const { a, b } = roadSurfaceUniforms(id, climate, { relief: 2, stones: 2 });
    assert.deepEqual([...a, b[0], b[1], b[2], b[3]], [0, 0, 0, 0, 0, 0, 1, 0], `${id} (${climate}): the old road law`);
  }
}
assert.ok(PROTECTED.every((id) => ROAD_SURFACE_MAP_OVERRIDES[id]), 'every protected map has its override');
// an unprotected map takes its climate's row under its splat's own fields
assert.deepEqual(roadSurfaceUniforms('badlands', 'arid', { stones: 0.5 }).a,
  [ROAD_SURFACE_BY_CLIMATE.arid.relief, 0.5, ROAD_SURFACE_BY_CLIMATE.arid.potholes, ROAD_SURFACE_BY_CLIMATE.arid.treads],
  'Redrock: the arid row, its own stones');
// the paved uniforms: classes by code, the town rect only with kerbs, the old print without a config
const town = { x0: -100, x1: 60, z0: -40, z1: 80 };
assert.deepEqual(pavedSurfaceUniforms(undefined, town).cls, [0, 0, 0, 0], 'no config: the R print');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.urban, town).cls, [3, 2, 1, 0.36], 'Steinburg: patched streets, a sett square in arcs, 0.36 m gutters');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.urban, town).town, [-20, 20, 80, 60], 'its kerbed town rect');
assert.deepEqual(pavedSurfaceUniforms(MAP_PAVED_SURFACES.cliffbridge, town).town, [0, 0, 0, 0], 'no kerbs: no town rect');

// the layout: a catalogued path takes its surface where the map's own pathStyles leave it unstyled
{
  const field = createHeightField(1337, getMapConfig('polders'));
  const styles = field._layout.roadStyles;
  assert.ok(styles && styles.length === field._layout.roads.length, 'Tidegate: a style per road line');
  const want = MAP_PATH_SURFACES.polders;
  for (let i = 0; i < want.length; i++) assert.deepEqual(styles[i], want[i] ? { surface: want[i] } : null, `Tidegate path ${i}`);
}

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
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const texelOf = (x, z) => Math.floor((z + 512) * n / 1024) * n + Math.floor((x + 512) * n / 1024);
  const arcAt = (i) => (frame.data[i * 4] * 256 + frame.data[i * 4 + 1]) / 64;
  const turnAt = (i) => (frame.data[i * 4 + 2] * 256 + frame.data[i * 4 + 3]) / 65536;
  const want = ((Math.atan2(bz - az, bx - ax) / (2 * Math.PI)) % 1 + 1) % 1;
  for (const t of [0.3, 0.5, 0.7]) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (Math.max(Math.abs(x), Math.abs(z)) > 500) continue;
    const i = texelOf(x, z);
    const turnErr = Math.min(Math.abs(turnAt(i) - want), 1 - Math.abs(turnAt(i) - want));
    assert.ok(turnErr < 0.003, `the heading at ${t} of the first segment (${turnAt(i).toFixed(4)} vs ${want.toFixed(4)})`);
    // the texel centre's own running length: within a texel's diagonal of the point's
    assert.ok(Math.abs(arcAt(i) - (t * len) % 1024) < 1024 / n * 1.5, `the running length at ${t} (${arcAt(i).toFixed(2)} vs ${(t * len).toFixed(2)})`);
    void ux; void uz;
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
  'gRoadS = (fc.r * 65280.0 + fc.g * 255.0) * (1.0 / 64.0) + dot(wp.xz - fC, gRoadAlong);',
  'uniform vec4 uRoadSurf, uRoadSurfB;',
  'uniform vec4 uPaveClass, uPaveWear, uPaveTown;',
  'shader.uniforms.uRoadFrame = { value: maskStack.frame };',
  'const roadWork = roadSurfaceUniforms(mapId, groundProfile.climate, S.roadSurface);',
  'const pavedCfg: PavedSurfaceConfig | undefined = S.pavedSurface ?? MAP_PAVED_SURFACES[mapId];',
  'if (gRoadClass > 0.5) gRoadTex = abs(gRoadClass - 4.0) < 0.5 ? 0.0 : 1.0;',
  'float roadFloorL = uRoadSurfB.y * dot(a.rgb, vec3(0.34, 0.45, 0.21));',
  'a.rgb *= 1.0 - min(mix(rut * rutShade, trodMid * 0.55, laneFar), 1.0) * mix(0.34, 0.26, gRoadTex);',
]) assert.ok(source.includes(line.replace(/\s+/g, ' ')), `the material: ${line}`);
// (the old law, exactly, where every gain is 0: the worked carriageway's block is skipped, the floor clamps to 1, the old
// grey pull holds and the lanes keep their whole darkening)
assert.ok(source.includes('if (dW > 0.002 && wR > 0.002 && uRoadSurf.x + uRoadSurf.y + uRoadSurf.z + uRoadSurfB.x > 0.0) {'),
  'the worked carriageway runs only where a gain is set');
assert.ok(source.includes('uRoadSurfB.y > 0.0 ? 0.12 : 0.26'), 'the old grey pull without a tone floor');

console.log('roadSurfaces: the catalogue\'s classes and maps, the protected maps\' old law, the layout\'s catalogued paths, the road frame layer\'s running length and heading, its stack address and the material\'s reads PASS; no GPU/art claim');
