// cropKit.selftest — the regional crops (props lane A, #18b): the form each kit's country grows, the card painted on the
// crop stream's own nine draws a stalk (the plot stream after the atlas exact: the plots stand where the wheat's stood),
// each card neither empty nor a filled wall, the row heights by crop, the volume cards on the row's own supported spans
// only, and each plot's triangles within budget. The biome forms and the legacy wheat are cropBiomeIdentity's.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { placeCropFieldsOf, regionalCropForm } from './cropKit.ts';
import { getMapConfig } from './index.ts';

globalThis.document = { createElement: () => createCanvas(1, 1) };
// each kit's country's crop; a map's own form wins; a kit with none keeps the legacy wheat
const expected = { frontier: 'maize', longleaf: 'maize', cliffbridge: 'sunflower', polders: 'beet', coastal: 'brassica', mangrove: 'wet-upright',
  reservoir: 'grain', orchard: 'grain', saltwind: 'grain', verdant: 'grain', delta: 'wet-upright', autumn: 'harvest', steppe: undefined };
for (const [mapId, form] of Object.entries(expected)) assert.equal(regionalCropForm(getMapConfig(mapId).props), form, `${mapId}: ${form ?? 'legacy wheat'}`);

const field = { getHeightAt: (x, z) => x * 0.002 - z * 0.003, getNormalAt: () => ({ y: 1 }), getGroundType: () => 'grass', _roadDist: () => 1000, _noVeg: () => false };
function build(architecture, seed = 2002) {
  const group = new THREE.Group();
  let draws = 0;
  const realRandom = Math.random;
  placeCropFieldsOf({ heightField: field, P: { cropFields: 2, ...(architecture ? { architecture } : {}) },
    L: { village: { x0: 800, x1: 900, z0: 800, z1: 900 }, spawns: { player: { x: 900, z: 900 }, enemies: [] } },
    noVeg: () => false, seed, aniso: 4, engineCtx: { setupShadowMaterial() {} }, group, autumnCropRows: null });
  assert.equal(Math.random, realRandom);
  return group.children[0];
}
const legacy = build(null);
const stationsOf = (mesh) => {
  // the rows' stations on the ground (x, z): where the plots and their rows were placed
  const p = mesh.geometry.getAttribute('position'), out = new Set();
  for (let i = 0; i < p.count; i++) out.add(`${p.getX(i).toFixed(3)},${p.getZ(i).toFixed(3)}`);
  return out;
};
const wheatStations = stationsOf(legacy);
const H = { maize: [2.1, 2.6], sunflower: [1.65, 2.1], beet: [0.42, 0.55], brassica: [0.5, 0.65] };
for (const [arch, form] of [['hessian', 'maize'], ['andalusian', 'sunflower'], ['polder', 'beet'], ['breton', 'brassica']]) {
  const mesh = build(arch);
  // the plots and their first rows stand where the legacy wheat's did (the same draws, in the same order)
  const own = stationsOf(mesh);
  assert.ok([...wheatStations].every((k) => own.has(k)), `${form}: the plot stream is the wheat's (every row station where the wheat's stood)`);
  // the card: nonempty, permeable
  const img = mesh.material.map.image, data = img.getContext('2d').getImageData(0, 0, 256, 256).data;
  let covered = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] / 255 >= 0.42) covered++;
  const fraction = covered / (256 * 256);
  assert.ok(fraction > 0.05 && fraction < 0.8, `${form}: the card is plants, neither empty nor a wall (${fraction.toFixed(2)})`);
  // the rows' height by crop
  const pos = mesh.geometry.getAttribute('position');
  let top = 0;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i) - field.getHeightAt(pos.getX(i), pos.getZ(i)));
  assert.ok(top >= H[form][0] * 0.86 && top <= H[form][1] * 1.14 + 0.05, `${form}: its rows stand ${top.toFixed(2)} m`);
  // its volume: more triangles than the wheat's rows, within the plot budget (two plots)
  const tris = mesh.geometry.index.count / 3, wheat = legacy.geometry.index.count / 3;
  assert.ok(tris > wheat && tris <= wheat * 3.2 && tris <= 2 * 1000, `${form}: ${tris} triangles over two plots (the wheat's ${wheat})`);
  // every index in range (the volume cards and drills on the row's own vertices)
  const idx = mesh.geometry.index.array;
  for (let i = 0; i < idx.length; i++) assert.ok(idx[i] < pos.count);
  console.log(`  ${arch} ${form}: card ${(fraction * 100).toFixed(0)} % covered, rows to ${top.toFixed(2)} m, ${tris} triangles (wheat ${wheat})`);
}
console.log('cropKit selftest: 13 maps\' crops by kit and form, the regional cards on the plot stream, rows by crop, volume within budget PASS');
process.exit(0);
