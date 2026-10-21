import assert from 'node:assert/strict';
import {
  createGarageWorkshopMaterialPalette,
  garageWorkshopFinishKey,
} from './garageWorkshopMaterials.ts';

const spec = (id, nation, base) => ({
  id,
  nation,
  era: 'modern',
  visual: { scheme: 'digital', base, weather: base, patches: ['#111111', '#eeeeee'] },
});

const burlak = spec('t90a_burlak_proto', 'Russia', '#435039');
const t90am = spec('t90am', 'Russia', '#3f5138');
const abrams = spec('m1a1_abrams_hc', 'USA', '#b09466');
const xk2_black_panther = spec('xk2_black_panther', 'South Korea', '#465341');

assert.equal(garageWorkshopFinishKey(burlak), 'service_t90m');
assert.equal(garageWorkshopFinishKey(t90am), 'service_t90m',
  'both Russian exhibits must share one immutable service palette');
assert.equal(garageWorkshopFinishKey(abrams), 'service_usa_desert');
assert.equal(garageWorkshopFinishKey(xk2_black_panther), 'service_bmp3_rok');

const palette = createGarageWorkshopMaterialPalette(burlak, {});
assert.equal(palette.textureCount, 0, 'background exhibits must allocate no texture maps');
assert.ok(palette.materialCount <= 11, 'the factory palette stays compact');
assert.equal(palette.hull.type, 'MeshStandardMaterial',
  'service paint must reuse the resident Garage shader family');
assert.equal(palette.hull.vertexColors, false,
  'service paint must not preserve a builder-specific camouflage colour channel');
assert.ok(palette.hull === palette.barrel, 'painted armor and gun share one static finish');
assert.ok(palette.trackLink === palette.spareTrack, 'live and spare track steel share one static material');
for (const material of new Set([
  palette.hull,
  palette.wheels,
  palette.wheelsRecessed,
  palette.rubber,
  palette.detail,
  palette.dark,
  palette.shadow,
  palette.trackLink,
  palette.glass,
  palette.canvasCloth,
  palette.wood,
])) {
  assert.ok(material.map === null, `${material.name} must remain map-free`);
  assert.ok(material.normalMap === null, `${material.name} must remain normal-map-free`);
  assert.ok(material.roughnessMap === null, `${material.name} must remain roughness-map-free`);
}
palette.dispose();

console.log('garageWorkshopMaterials.selftest: fixed shared factory finishes use zero texture maps');
