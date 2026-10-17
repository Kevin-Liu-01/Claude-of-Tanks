// The trees lane (2026-10-07, the cities lane's Ruinspires: "almost no trees in the city"): VegetationConfig `townTrees`
// on the real seeded producer of Ruinspires. Off (the default), every tree keeps out of the village rect and 24 m round
// it, and a map with `parks` grows trees only inside them, so the parks inside its town grew nothing. On, a belt's trees
// and a park's stand inside the village (the road, ground, slope and spawn rules still hold), and a belt's trees need no
// park. A construction receipt: no GPU, no art claim (the city's trees are the cities lane's to place); a map that
// sets it (Ruinspires, the cities lane's) is a town map.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

// the maps that opt in are town maps: a village with parks or tree belts to plant in it (the cities lane's Ruinspires)
for (const id of MAP_IDS) {
  const veg = getMapConfig(id).vegetation;
  if (veg?.townTrees === true) assert.ok((veg.parks ?? []).length || (veg.belts ?? []).length, `${id}: townTrees on a map with parks or belts`);
}

const cfg = getMapConfig('ruinspires'), field = createHeightField(1337, cfg);
const village = field._layout.village; // (the layout's, as vegetation.ts reads it)
assert.ok(village && village.x1 > village.x0 && village.z1 > village.z0, 'Ruinspires has a village rect');
// the town's inner ground, 30 m in from its rect and inside the border's rim forest, which keeps its own rules (its
// blocks stand on a ring 442 m out at the least, up to 35 m either way: the valley round's wider town, ±420 by ±330 m,
// reaches the ring at its corners)
const inTown = (x, z) => x > village.x0 + 30 && x < village.x1 - 30 && z > village.z0 + 30 && z < village.z1 - 30
  && Math.hypot(x, z) < 390;
// (the Miljacka valley round, landed 2026-10-17: the map's own parks moved up the flanks above the bench streets, on the
// town's rim, so the receipt plants a test park on its inner ground beside them, as it lays a test belt)
const PARK = { x: 250, z: -150, r: 40 };
const parks = [...(cfg.vegetation.parks ?? []), PARK];
assert.ok(parks.some((p) => inTown(p.x, p.z)), 'a park inside the town');
const inPark = (x, z) => parks.some((p) => Math.hypot(x - p.x, z - p.z) < p.r);
// the map's own rows (the quays' and the boulevard's lindens, cfg.vegetation.belts): a tree within a metre of a row's line
const ROWS = cfg.vegetation.belts ?? [];
const onRow = (x, z) => ROWS.some((b) => {
  const dx = b.x1 - b.x0, dz = b.z1 - b.z0, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - b.x0) * dx + (z - b.z0) * dz) / l2));
  return Math.hypot(x - b.x0 - dx * t, z - b.z0 - dz * t) < (b.jitter ?? 0) + 1;
});
// a test belt up the town's west quarter, across streets and blocks, a tree every 6 m
const BELT = { x0: -250, z0: -150, x1: -250, z1: 150, gap: 6, jitter: 0, skip: 0, species: 'oak' };
const nearBelt = (x, z) => Math.abs(x - BELT.x0) < 0.5 && z > BELT.z0 - 0.5 && z < BELT.z1 + 0.5;

const restore = canvasFixture();
try {
  const build = (vegetation) => createVegetation(field, { setupShadowMaterial() {} }, 2001, { ...cfg, vegetation: { ...cfg.vegetation, parks, ...vegetation } });
  // (each side says its own setting: the map may set townTrees itself)
  const off = build({ townTrees: false, belts: [...(cfg.vegetation.belts ?? []), BELT] }), on = build({ townTrees: true, belts: [...(cfg.vegetation.belts ?? []), BELT] });
  try {
    const at = (t) => [t.mat.elements[12], t.mat.elements[14]];
    const townOff = off._trees.filter((t) => inTown(...at(t))), townOn = on._trees.filter((t) => inTown(...at(t)));
    // off: nothing on the town's inner ground
    assert.equal(townOff.length, 0, `off: no tree in the town (${townOff.length})`);
    // on: the parks inside the town grow, the belt stands inside it, and no other tree enters it
    const parkTrees = townOn.filter((t) => inPark(...at(t))).length, beltTrees = townOn.filter((t) => nearBelt(...at(t))).length;
    assert.ok(parkTrees > 20, `on: the town's parks grow (${parkTrees})`);
    assert.ok(beltTrees >= 8, `on: the belt stands in the town (${beltTrees} of ${Math.round(300 / BELT.gap) + 1} seats)`);
    // the map's own rows stand in the town with it on (Ruinspires' quays and boulevard)
    const rowTrees = townOn.filter((t) => onRow(...at(t))).length;
    if (ROWS.length) assert.ok(rowTrees >= ROWS.length, `on: the map's own rows stand in the town (${rowTrees} on ${ROWS.length} rows)`);
    const strays = ROWS.length ? [] : townOn.filter((t) => !inPark(...at(t)) && !nearBelt(...at(t)));
    assert.equal(strays.length, 0, `on: no tree in the town outside its parks and belts (${strays.length})`);
    console.log(JSON.stringify({ map: 'ruinspires', village, off: { trees: off._trees.length, town: townOff.length },
      on: { trees: on._trees.length, town: townOn.length, parks: parkTrees, belt: beltTrees, rows: rowTrees } }));
  } finally {
    for (const w of [off, on]) { w.dispose(); disposeObject3DResources(w.group); }
  }
} finally { restore(); }
console.log('townTrees.selftest: off, no tree in the town; on, its parks grow and its belts stand in it, nothing else enters; the maps that set it are town maps PASS');
