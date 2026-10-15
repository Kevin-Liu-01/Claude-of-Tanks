// HL-3 (the horizons stream, 2026-10-13; B-architecture §4.2): the Hinterland's mesh laws, pure:
//   - the depth compression: R(d) = d to 2.5 km, monotonic, R(∞) under the cloud dome (3.4 km), inverted exactly; the
//     direction from the camera exact; the earth's drop d²/2R′; the GLSL twin carries the same constants;
//   - the CDLOD selection: deterministic for a pose, no node inside the square, adjacent nodes within one level of
//     each other (no cracks), the scope (×8) refining only inside its cone, the node count inside the budget;
//   - the worker's answer: the whole pipeline in process (buildHinterlandWire), packed and unpacked, the levels packed
//     into one float atlas whose blocks hold their levels' samples;
//   - the hook keeps the hinterland out of the old ring's path unless the map migrates.
import assert from 'node:assert/strict';

const { compressDistance, trueDistance, curvatureDrop, compressPoint, HINTERLAND_PROJECT_GLSL } = await import('./project.ts');
const { selectHinterlandNodes, hinterlandMorph, HINTERLAND_LOD_DESKTOP } = await import('./lod.ts');

// ---- the compression
assert.equal(compressDistance(1000), 1000);
assert.equal(compressDistance(2500), 2500);
let prev = 0;
for (let d = 0; d <= 200_000; d += 250) {
  const r = compressDistance(d);
  assert.ok(r >= prev, 'R is monotonic'); prev = r;
  assert.ok(r < 3400, 'R stays under the cloud dome');
  if (d > 0) assert.ok(Math.abs(trueDistance(r) - d) < Math.max(1e-6, d * 1e-6) || d > 150_000, `R⁻¹(R(${d}))`);
}
assert.ok(Math.abs(compressDistance(80_000) - 3283.4) < 1, `R(80 km) ${compressDistance(80_000).toFixed(1)}`);
assert.ok(Math.abs(curvatureDrop(10_000) - 6.85) < 0.01 && Math.abs(curvatureDrop(80_000) - 438.4) < 0.1, 'the earth drops 6.8 m at 10 km, 438 m at 80 km');
const out = [0, 0, 0];
const cam = [120, 30, -80];
const d = compressPoint(9000, 400, 15000, cam[0], cam[1], cam[2], out);
const dir0 = [9000 - cam[0], 400 - curvatureDrop(Math.hypot(9000 - cam[0], 15000 - cam[2])) - cam[1], 15000 - cam[2]];
const dir1 = [out[0] - cam[0], out[1] - cam[1], out[2] - cam[2]];
const n0 = Math.hypot(...dir0), n1 = Math.hypot(...dir1);
assert.ok(Math.abs(n1 - compressDistance(d)) < 1e-6, 'the drawn distance is R(d)');
assert.ok(dir0.every((c, i) => Math.abs(c / n0 - dir1[i] / n1) < 1e-9), 'the direction from the camera is exact');
for (const k of ['HL_FROM = 2500.0', 'HL_SPAN = 800.0', 'HL_FALLOFF = 20000.0', 'HL_EARTH_R = 7300000.0']) assert.ok(HINTERLAND_PROJECT_GLSL.includes(k), `GLSL twin: ${k}`);

// ---- the CDLOD selection
const flat = (_x0, _z0, _s, o) => { o[0] = -20; o[1] = 60; return o; };
const buf = new Float32Array(HINTERLAND_LOD_DESKTOP.maxNodes * 4);
const select = (x, y, z, fov, visible = null) => {
  const n = selectHinterlandNodes(x, y, z, fov, visible, flat, HINTERLAND_LOD_DESKTOP, buf);
  return Array.from({ length: n }, (_, i) => ({ x0: buf[i * 4], z0: buf[i * 4 + 1], s: buf[i * 4 + 2], k: buf[i * 4 + 3] }));
};
const a = select(420, 6, -300, 60), b = select(420, 6, -300, 60);
assert.deepEqual(a, b, 'deterministic for a pose');
assert.ok(a.length > 50 && a.length < HINTERLAND_LOD_DESKTOP.maxNodes, `nodes ${a.length}`);
for (const n of a) assert.ok(!(n.x0 >= -512 && n.x0 + n.s <= 512 && n.z0 >= -512 && n.z0 + n.s <= 512), 'no node inside the square');
// coverage: every point of the land (outside the square, inside the root) lies in exactly one node
for (let i = 0; i < 400; i++) {
  const ang = i * 2.39996, r = 540 + (i * 197) % 70000;
  const px = Math.sin(ang) * r, pz = Math.cos(ang) * r;
  if (Math.max(Math.abs(px), Math.abs(pz)) >= 81_920) continue;
  const hits = a.filter((n) => px >= n.x0 && px < n.x0 + n.s && pz >= n.z0 && pz < n.z0 + n.s).length;
  assert.equal(hits, 1, `point (${px.toFixed(0)}, ${pz.toFixed(0)}) in one node`);
}
// neighbours differ by at most one level along a shared edge (no cracks)
const key = (x, z) => `${x},${z}`;
const owner = (px, pz) => a.find((n) => px >= n.x0 && px < n.x0 + n.s && pz >= n.z0 && pz < n.z0 + n.s);
let checked = 0;
for (const n of a) {
  for (const [px, pz] of [[n.x0 + n.s + 1, n.z0 + n.s / 2], [n.x0 - 1, n.z0 + n.s / 2], [n.x0 + n.s / 2, n.z0 + n.s + 1], [n.x0 + n.s / 2, n.z0 - 1]]) {
    const m = owner(px, pz);
    if (!m) continue;
    checked++;
    assert.ok(Math.max(m.s / n.s, n.s / m.s) <= 2, `adjacent nodes within one level (${n.s} by ${m.s})`);
  }
}
assert.ok(checked > 100);
assert.equal(hinterlandMorph(1000, 64, 2.4), 1, 'past twice its range a vertex sits on the coarser grid');
assert.equal(hinterlandMorph(100, 64, 2.4), 0);
// the scope: ×8 refines inside its cone only (the side planes cull the rest)
const coneVisible = (fx, fz, halfDeg) => (minX, _minY, minZ, maxX, _maxY, maxZ) => {
  // a crude cone test from the camera at (420, -300) toward (fx, fz): any box corner within the half-angle
  for (const [x, z] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ], [(minX + maxX) / 2, (minZ + maxZ) / 2]]) {
    const ax = x - 420, az = z + 300, n = Math.hypot(ax, az) || 1;
    if ((ax * fx + az * fz) / n > Math.cos(halfDeg * Math.PI / 180)) return true;
  }
  return Math.max(minX - 420, 0, 420 - maxX) === 0 && Math.max(minZ + 300, 0, -300 - maxZ) === 0;
};
const wide = select(420, 6, -300, 60, coneVisible(0, 1, 40)), scope = select(420, 6, -300, 7.5, coneVisible(0, 1, 5));
const finest = (list, x, z) => list.find((n) => x >= n.x0 && x < n.x0 + n.s && z >= n.z0 && z < n.z0 + n.s)?.s ?? Infinity;
assert.ok(finest(scope, 420, 3000) < finest(wide, 420, 3000), 'the scope refines the land in its cone');
assert.ok(scope.length < wide.length * 1.6, `the scope's nodes stay in budget (${scope.length} against ${wide.length})`);
// ---- the worker's answer in process (the Polders lab draft over its own ground), its atlas and its scene object
const { buildHinterlandWire } = await import('./worker.ts');
const { wirePyramid, wireTrees, copyHinterlandWire } = await import('./wire.ts');
const { HL_SURFACE_FLAG } = await import('./surface.ts');
const { samplePyramid } = await import('./pyramid.ts');
const { packHinterlandHeights } = await import('./mesh.ts');
const { createHinterlandObject } = await import('./install.ts');
const { hinterlandSupplyFor, supplyHinterland, withdrawHinterland } = await import('../hinterlandHook.ts');
const { wire, transfer } = buildHinterlandWire({ mapId: 'polders', terrainVariant: null, fieldSeed: 1337, search: '?hinterland=1', tier: 'desktop' });
assert.ok(transfer.length >= wire.levels.length + 2, 'the heights, trees and buildings travel as transfers');
assert.ok(wire.trees.length > 0 && wire.buildings.length > 0 && wire.settlements.length > 0, 'the plan travels');
const copy = copyHinterlandWire(wire);
assert.notEqual(copy.levels[0].heights.buffer, wire.levels[0].heights.buffer, 'a kept copy owns its buffers');
assert.equal(wireTrees(wire).length * 9, wire.trees.length);
const pyramid = wirePyramid(wire);
const atlas = packHinterlandHeights(pyramid.levels);
for (let li = 0; li < pyramid.levels.length; li++) {
  const L = pyramid.levels[li], blk = atlas.blocks[li], data = atlas.texture.image.data;
  for (const [i, j] of [[0, 0], [L.n - 1, 0], [7, L.n - 3], [L.n >> 1, L.n >> 2]]) {
    assert.equal(data[(blk.y0 + j) * atlas.width + blk.x0 + i], L.heights[j * L.n + i], `atlas block ${li} holds its level`);
  }
}
// the surface atlas: one level per height level, the square left unbaked, the polders' water, woods and settlements
assert.equal(wire.surface?.length, wire.levels.length, 'a surface level for each height level');
assert.equal(wire.surface[0].texelM, wire.levels[0].texelM, 'near the battlefield the surface is at the heights\' own 4 m (straight parcel edges)');
assert.equal(wire.surface[1].texelM, wire.levels[1].texelM * 2, 'farther out at half their samples');
// the parcels' edges: the fields' texels carry their signed offsets to the nearer edges (decoded within 1/128 m), in the
// land-use grid's frame the wire names
{
  assert.ok(Array.isArray(wire.landRot) && Math.abs(Math.hypot(wire.landRot[0], wire.landRot[1]) - 1) < 1e-9, 'the grid\'s heading travels');
  const S = wire.surface[0];
  let fields = 0, bad = 0;
  for (let k = 0; k < S.n * S.n; k++) {
    const e = S.edges;
    const u = (e[k * 4] << 8) | e[k * 4 + 1], v = (e[k * 4 + 2] << 8) | e[k * 4 + 3];
    if (u === 65535) continue;
    fields++;
    const sU = u / 128 - 256, sV = v / 128 - 256;
    if (Math.abs(sU) > 256 || Math.abs(sV) > 256) bad++;
  }
  assert.ok(fields > 5000 && bad === 0, `the polders' field texels carry their edges (${fields})`);
}
const flagSeen = { water: 0, sea: 0, woods: 0, settlement: 0, road: 0 };
for (const S of wire.surface) for (let k = 3; k < S.rgba.length; k += 4) for (const name of Object.keys(flagSeen)) if (S.rgba[k] & HL_SURFACE_FLAG[name]) flagSeen[name]++;
for (const [name, count] of Object.entries(flagSeen)) assert.ok(count > 0, `the polders' surface holds ${name} (${count})`);
const S0 = wire.surface[0], mid = (S0.n >> 1) * (S0.n + 1) * 4;
assert.deepEqual([...S0.rgba.subarray(mid, mid + 4)], [0, 0, 0, 0], 'inside the square nothing is baked');
const object = createHinterlandObject(copy, {});
const land = object.getObjectByName('hinterland-land');
assert.ok(land && land.isMesh && land.geometry.isInstancedBufferGeometry && land.frustumCulled === false, 'one instanced land draw');
// the outland (HZ.11): the buildings and verticals in one draw, the trees in two, each standing on the drawn land
const outland = object.getObjectByName('hinterland-outland');
const built = outland?.getObjectByName('hinterland-buildings');
assert.ok(built && outland.getObjectByName('hinterland-trees-near') && outland.getObjectByName('hinterland-trees-far'), 'buildings, near and far trees');
const ostats = outland.userData.hinterlandOutland;
assert.ok(ostats.buildingTris > 4000 && ostats.nearTrees > 500 && ostats.farTrees > 200, `the outland draws (${JSON.stringify(ostats)})`);
// the woods' own trees (the impostors' set): along the edges and through the woods inside 1.75 km, on the ground under the canopy
assert.ok(ostats.woodsTrees > 500, `the polders' woods stand as trees near the line (${ostats.woodsTrees})`);
{
  let off = 0, n = 0;
  for (let i = 0; i < wire.trees.length; i += 9) {
    const y = wire.trees[i + 8];
    if (!Number.isFinite(y)) continue;
    n++;
    if (y > samplePyramid(pyramid, wire.trees[i], wire.trees[i + 1]) + 0.5) off++;
  }
  assert.ok(n === wire.trees.length / 9 && off === 0, `every tree stands on the land under the canopy (${off} of ${n} above it)`);
}
assert.ok(ostats.buildingTris + ostats.nearTreeTris + ostats.farTreeTris < 260000, 'the outland stays inside its triangle budget');
{
  const pos = built.geometry.getAttribute('position');
  let below = 0;
  for (let i = 0; i < pos.count; i += 37) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (pos.getY(i) < samplePyramid(pyramid, x, z) - 12) below++;
  }
  assert.ok(below / (pos.count / 37) < 0.02, `no building sinks into the land (${below})`);
}
// the woods: near the line (where their own trees stand) the land under them rises only by a shrub layer, never a hill
// (the pilot's frames: trees on a smooth grassy mound); past 2.15 km they stand as the full canopy
{
  const check = (S, keep, test) => {
    let woodsTexels = 0, ok = 0;
    for (let j = 0; j < S.n; j += 2) for (let i = 0; i < S.n; i += 2) {
      const k = (j * S.n + i) * 4;
      if (!(S.rgba[k + 3] & HL_SURFACE_FLAG.woods)) continue;
      const x = -S.halfM + i * S.texelM, z = -S.halfM + j * S.texelM;
      if (!keep(x, z)) continue;
      woodsTexels++;
      if (test(samplePyramid(pyramid, x, z))) ok++;
    }
    return [ok, woodsTexels];
  };
  const [shrub, nearWoods] = check(wire.surface[0], (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 700, (h) => h > 1 && h < 7);
  assert.ok(nearWoods > 20 && shrub / nearWoods > 0.8, `near woods: a shrub layer under their trees (${shrub}/${nearWoods})`);
  const [canopy, farWoods] = check(wire.surface[2], (x, z) => Math.hypot(x, z) > 2300 && Math.hypot(x, z) < 6000, (h) => h > 8);
  assert.ok(farWoods > 10 && canopy / farWoods > 0.6, `far woods: the canopy (${canopy}/${farWoods})`);
}
// the air (air.ts): the far haze's target binds the dome's own sky each draw, and the fog colour stays without one
{
  const { createHinterlandAir } = await import('./air.ts');
  const THREE = await import('three');
  const air = createHinterlandAir();
  const scene = new THREE.Scene();
  air.update(scene);
  assert.equal(air.uniforms.uHlSkyOn.value, 0, 'no published sky: the fog colour');
  const skyView = new THREE.Texture();
  scene.userData.atmosphere = { active: true, skyView, sunDir: { x: 0, y: 2, z: 0 }, knee: new THREE.Vector3(1, 2, 3), skyIntensity: 0.8, viewHeightKm: 0.1 };
  const dome = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { uDeckHorizon: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.4) }, uDeckClosed: { value: 0.25 } } }));
  dome.name = 'atmosphere-dome';
  scene.add(dome);
  air.update(scene);
  assert.equal(air.uniforms.uHlSkyOn.value, 1);
  assert.equal(air.uniforms.tAtmoSky.value, skyView, 'the dome\'s own lookup');
  assert.equal(air.uniforms.uAtmoIntensity.value, 0.8);
  assert.ok(Math.abs(air.uniforms.uAtmoSun.value.y - 1) < 1e-9, 'the sun normalised');
  assert.equal(air.uniforms.uHlDeckClosed.value, 0.25, 'the deck greying the dome uses');
  assert.match(air.fragmentPars, /vec3 hlHazeTarget\( vec3 fallback \)/);
}

// the hook: a terrain build of another map (or the trench variant) never takes this supply
const supply = { request: { mapId: 'polders', terrainVariant: null }, pending: false, buildSteps: function* () { return null; } };
supplyHinterland(supply);
assert.equal(hinterlandSupplyFor({ id: 'polders' }), supply);
assert.equal(hinterlandSupplyFor({ id: 'verdant' }), null);
assert.equal(hinterlandSupplyFor({ id: 'polders', assaultTrenches: true }), null);
withdrawHinterland(supply);
assert.equal(hinterlandSupplyFor({ id: 'polders' }), null);

console.log(`hinterlandMesh.selftest: compression, curvature and selection ok — ${a.length} nodes all round, ${wide.length} in view, ${scope.length} through the ×8 scope`);
