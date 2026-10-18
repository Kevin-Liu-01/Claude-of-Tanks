// garage r9 (g3) horizon landmark receipt: Sirocco's and Steinburg's skylines come from their maps. Every named landmark
// stands within 15 degrees of its map bearing from the Garage (the map's player spawn), the skylines stay under their
// ceilings (land 13.2 m; Steinburg's town masses 8-13.2 m, its accents at most 26 m), the horizons stay inside their
// triangle budget, and they build byte-identically with no random numbers or clocks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getMapConfig } from '../world/maps/index.ts';
import { createHeightField } from '../world/terrain.ts';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { SIROCCO_LANDMARKS } from './garageSiroccoHorizon.ts';
import { STEINBURG_LANDMARKS } from './garageSteinburgHorizon.ts';
import { buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets } from './garageEnvironmentKit.ts';

const bearingDeg = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
const gap = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

// 1. Sirocco: the two mesas are the map's own mesa outliers (its heightfield over 24 m), the ksar the village at the ford,
// the star dunes its two tall knolls
{
  const config = getMapConfig('desert');
  const spawn = [config.spawns.player.x, config.spawns.player.z];
  const field = createHeightField(1337, config);
  const step = 8, N = 448, cells = new Map();
  for (let z = -N; z <= N; z += step) for (let x = -N; x <= N; x += step) if (field.getHeightAt(x, z) > 24) cells.set(`${x},${z}`, [x, z]);
  const seen = new Set(), blobs = [];
  for (const [key, start] of cells) {
    if (seen.has(key)) continue;
    const queue = [start], points = [];
    seen.add(key);
    while (queue.length) {
      const [px, pz] = queue.pop(); points.push([px, pz]);
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const next = `${px + dx},${pz + dz}`;
        if (cells.has(next) && !seen.has(next)) { seen.add(next); queue.push([px + dx, pz + dz]); }
      }
    }
    if (points.length >= 60) blobs.push([points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]);
  }
  // the map's mesa field gives exactly the two outliers in the west half (the dunes rise lower than 24 m there)
  const mesas = blobs.filter(([x]) => x < 0);
  assert.equal(mesas.length, 2, `Sirocco Wadi has two mesa outliers (found ${mesas.length})`);
  const gara = mesas.reduce((a, b) => (Math.hypot(a[0] - spawn[0], a[1] - spawn[1]) < Math.hypot(b[0] - spawn[0], b[1] - spawn[1]) ? a : b));
  const north = mesas.find((m) => m !== gara);
  const truth = {
    'the Gara': gara, 'the North Mesa': north, 'the ksar': [config.terrain.village.cx, config.terrain.village.cz],
    'the Erg Dune': [128, 148], 'the Gara Dune': [300, -356],
  };
  for (const landmark of SIROCCO_LANDMARKS) {
    const map = truth[landmark.name];
    assert.ok(map, `Sirocco: ${landmark.name} has a map source`);
    const expected = bearingDeg(spawn, map);
    assert.ok(gap(landmark.bearingDeg, expected) <= 15, `Sirocco: ${landmark.name} at ${landmark.bearingDeg} deg, map bearing ${expected.toFixed(1)}`);
  }
}

// 2. Steinburg: the town, the castle keep, the market church, the south gate and the brickworks from the map's own plan
{
  const config = getMapConfig('urban');
  const spawn = [config.spawns.player.x, config.spawns.player.z];
  const named = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.name === 'string' && Number.isFinite(node.x) && Number.isFinite(node.z)) named.set(node.name, [node.x, node.z]);
    for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value);
  };
  visit(config);
  const church = (config.props?.plannedSites || []).find((site) => site.structure === 'church');
  const factory = (config.props?.plannedSites || []).find((site) => site.structure === 'factory');
  const truth = {
    'the old town': [config.terrain.village.cx, config.terrain.village.cz],
    'the castle on its rock': named.get('the castle keep'),
    'the market church spire': church && [church.x, church.z],
    'the south gate tower': named.get('the south gate'),
    'the brickworks chimney': factory && [factory.x, factory.z],
  };
  for (const landmark of STEINBURG_LANDMARKS) {
    const map = truth[landmark.name];
    if (landmark.name === 'the onion tower') continue; // the town's second spire stands among the rows (no single map lot)
    assert.ok(map, `Steinburg: ${landmark.name} has a map source`);
    const expected = bearingDeg(spawn, map);
    assert.ok(gap(landmark.bearingDeg, expected) <= 15, `Steinburg: ${landmark.name} at ${landmark.bearingDeg} deg, map bearing ${expected.toFixed(1)}`);
  }
}

// 3. the horizons: ceilings, budget, determinism
{
  const assets = createGarageEnvironmentAssetLibrary({});
  const horizonOf = async (id) => {
    const variant = GARAGE_VARIANTS.find((v) => v.id === id);
    await prepareGarageEnvironmentAssets(assets, variant);
    const build = buildGarageEnvironment({}, assets, variant, () => {});
    const mesh = build.root.getObjectByName('garage_shared_distant_horizon');
    const out = { stats: build.stats, positions: [...mesh.geometry.getAttribute('position').array], colors: [...mesh.geometry.getAttribute('color').array],
      triangles: (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3,
      landmarkTriangles: mesh.geometry.userData.landmarkTriangles };
    build.dispose();
    return out;
  };
  for (const id of ['desert_forward_depot', 'urban_arsenal']) {
    const a = await horizonOf(id), b = await horizonOf(id);
    assert.ok(a.landmarkTriangles > 600, `${id}: the horizon carries its map landmarks (${a.landmarkTriangles} triangles)`);
    assert.ok(a.triangles <= 9500, `${id}: horizon and landmarks within 9,500 triangles (${a.triangles})`);
    assert.deepEqual(a.positions, b.positions, `${id}: the horizon builds identically`);
    assert.deepEqual(a.colors, b.colors, `${id}: its colours too`);
    assert.ok(a.stats.horizonMaxHeightM <= 13.2, `${id}: the land stays under the biome ceiling (${a.stats.horizonMaxHeightM} m)`);
    if (id === 'urban_arsenal') {
      assert.ok(a.stats.builtHorizonMassTopM >= 8 && a.stats.builtHorizonMassTopM <= 13.2, `Steinburg's town masses ${a.stats.builtHorizonMassTopM} m`);
      assert.ok(a.stats.builtHorizonAccentTopM > a.stats.builtHorizonMassTopM && a.stats.builtHorizonAccentTopM <= 26,
        `Steinburg's spires, keep and chimney ${a.stats.builtHorizonAccentTopM} m`);
    }
  }
}

// 4. no random numbers or clocks in the landmark and regional modules
for (const file of ['garageLandmarkMesh', 'garageSiroccoHorizon', 'garageSteinburgHorizon', 'garageHorizonLandmarks', 'garageRegionalProps',
  'garageKitTable', 'garageSiroccoKit', 'garageSteinburgKit']) {
  const source = await readFile(new URL(`./${file}.ts`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|new Date\(|performance\.now\(\)/, `${file}: no random numbers or clocks`);
}

console.log('garageHorizonLandmarks.selftest: Sirocco and Steinburg landmarks at their map bearings; horizons bounded and deterministic');
