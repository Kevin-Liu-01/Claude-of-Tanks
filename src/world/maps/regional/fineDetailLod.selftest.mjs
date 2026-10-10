// A kit's fine joinery is drawn near the camera only (regional-buildings lane, 2026-10-03; the urban GPU blocker): the
// window frames and glazing bars, shutter rails, door panels and downpipes, and the sides and caps of timbers, shutter
// leaves, surrounds, sills and quoins (geometry.ts EmitOptions.fine, fineSides and the coarse faces of a span) merge by
// 120 m cell into one receive-only multi-draw batch per bucket (THREE.BatchedMesh: one draw call), and props.ts shows a
// cell only within the quality preset's fine-detail distance of the camera, hiding it 15 m past that (hysteresis).
//
// Built on Saltwind Ridge (the dalmatian kit: louvred shutters, framed windows, panelled doors, dressed quoins) the way
// the collision capture builds it: the batches exist, cast no shadow, draw through their own materials, keep each cell's
// geometry inside the box the update measures against, start visible (the deployment warm uploads them with the rest),
// all hide for a camera far above the map, show for a camera inside them, and hide and show again at distances 10-20 m
// apart. Phones never build fine joinery (regionalArchitecture.selftest.mjs holds that per builder).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMapConfig } from '../index.ts';

const { installWorldBuildFixture } = await import('../../../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [terrain, vegetation, props, models] = await Promise.all([
  import('../../terrain.ts'), import('../../vegetation.ts'), import('../../props.ts'), import('../../propsModelStore.ts'),
]);
await models.preloadPropModels();
const config = getMapConfig('saltwind');
assert.equal(config.props.architecture, 'dalmatian', 'Saltwind Ridge builds the dalmatian kit');
const engine = { anisotropy: 4, setupShadowMaterial() {} };
const field = terrain.createHeightField(1337, config);
const flora = vegetation.createVegetation(field, engine, 2001, config);
const dressing = props.createProps(field, engine, 2002, config, flora);

const batches = dressing.group.userData.fineDetail;
assert.ok(Array.isArray(batches) && batches.length >= 1, 'the fine joinery stands in multi-draw batches');
const box = new THREE.Box3();
let cellCount = 0;
for (const { mesh, cells } of batches) {
  assert.ok(mesh.isBatchedMesh, `${mesh.name}: one multi-draw batch`);
  // (facades lane, 2026-10-05: the facade craft's metalwork and render work batch too, on a desktop build)
  assert.match(mesh.name, /^props-bucket-(structureWood|regionalStone|structureMetal|regionalPlaster)-batch$/,
    'a batch is a timber, stone, metal or render dressing bucket');
  assert.equal(mesh.parent, dressing.group, `${mesh.name}: in the props group`);
  assert.equal(mesh.castShadow, false, `${mesh.name}: casts no shadow`);
  assert.equal(mesh.receiveShadow, true, `${mesh.name}: receives the sun's`);
  // culled whole by its own sphere (three's per-instance culling would walk and re-upload the draw list every frame)
  assert.equal(mesh.frustumCulled, true, `${mesh.name}: culled by the frustum whole`);
  assert.equal(mesh.perObjectFrustumCulled, false, `${mesh.name}: no per-instance culling or sorting each frame`);
  assert.equal(mesh.sortObjects, false, `${mesh.name}: no per-instance sorting`);
  // its own material: one shared by a batched and a plain mesh re-resolves its program at every switch
  assert.ok(!dressing.group.children.some((o) => o !== mesh && o.material === mesh.material), `${mesh.name}: its own material`);
  assert.ok(cells.length >= 2, `${mesh.name}: the joinery in cells (${cells.length})`);
  for (const { id, box: b } of cells) {
    assert.equal(mesh.getVisibleAt(id), true, `${mesh.name} cell ${id}: built visible, so the deployment warm uploads it`);
    mesh.getBoundingBoxAt(mesh.getGeometryIdAt(id), box);
    const eps = 1e-3;
    assert.ok(box.min.x >= b.minX - eps && box.max.x <= b.maxX + eps && box.min.y >= b.minY - eps && box.max.y <= b.maxY + eps
      && box.min.z >= b.minZ - eps && box.max.z <= b.maxZ + eps, `${mesh.name} cell ${id}: its geometry stays inside the box the update measures`);
    // a cell gathers the pieces whose centres fall in one 120 m square: its box is that square and a building's reach
    assert.ok(b.maxX - b.minX <= 160 && b.maxZ - b.minZ <= 160, `${mesh.name} cell ${id}: a 120 m cell (${(b.maxX - b.minX).toFixed(0)} x ${(b.maxZ - b.minZ).toFixed(0)} m)`);
    cellCount++;
  }
}
const timber = batches.find((b) => b.mesh.name === 'props-bucket-structureWood-batch');
assert.ok(timber, 'the timber dressing is batched');
const always = timber.mesh.instanceCount - timber.cells.length;
assert.ok(always === 0 || always === 1, 'the batch holds the always-drawn dressing as at most one more instance');
assert.ok(!dressing.group.children.some((o) => o.name === 'props-bucket-structureWood-detail'), 'no separate draw for the timber dressing beside its batch');
// a bucket's batch takes the place of its always-drawn dressing mesh (the metalwork's, on a desktop build): no draw beside it
for (const { mesh } of batches) {
  const detail = mesh.name.replace(/-batch$/, '-detail');
  assert.ok(!dressing.group.children.some((o) => o.name === detail), `no separate draw for ${detail} beside its batch`);
}

const camera = new THREE.Vector3();
const update = (x, y, z) => { camera.set(x, y, z); dressing.updateProps(0, camera); };
const shown = (b, c) => b.mesh.getVisibleAt(c.id);
// far above the map: every cell hides (the always-drawn instance stays)
update(0, 3000, 0);
assert.ok(batches.every((b) => b.cells.every((c) => !shown(b, c))), 'a camera 3 km up draws no fine joinery');
if (always) assert.equal(timber.mesh.getVisibleAt(0), true, 'the always-drawn dressing stays drawn');
// inside a cell's box: it shows; then straight up from its top until it hides, and back down until it shows
const cell = timber.cells[0], b = cell.box;
const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
update(cx, (b.minY + b.maxY) / 2, cz);
assert.equal(shown(timber, cell), true, 'a camera inside a cell draws its joinery');
let hideAt = null;
for (let h = 0; h <= 400; h++) {
  update(cx, b.maxY + h, cz);
  if (!shown(timber, cell)) { hideAt = h; break; }
}
assert.ok(hideAt !== null && hideAt >= 45 && hideAt <= 200, `the joinery hides at a preset's distance (${hideAt} m)`);
let showAt = null;
for (let h = hideAt; h >= 0; h--) {
  update(cx, b.maxY + h, cz);
  if (shown(timber, cell)) { showAt = h; break; }
}
assert.ok(showAt !== null && hideAt - showAt >= 10 && hideAt - showAt <= 20,
  `it shows again only well inside that distance (hysteresis: hides at ${hideAt} m, shows at ${showAt} m)`);
// (facades lane, 2026-10-06) the facade craft's finest pieces (geometry.ts EmitOptions.fine 'near': the balconettes'
// rails, the sills' dirt runs, the dentils) stand in near cells of their own, after the kit's: 40 m squares (a box of
// that square and a building's reach), in the same batches, hidden at half the distance a cell of the kit's own joinery
// hides at, with the same hysteresis
const near = batches.flatMap((bt) => bt.cells.filter((c) => c.near).map((c) => ({ bt, c })));
assert.ok(near.length >= 1, 'the craft\'s near pieces stand in near cells');
for (const { bt, c } of near) {
  assert.ok(c.box.maxX - c.box.minX <= 80 && c.box.maxZ - c.box.minZ <= 80,
    `${bt.mesh.name} near cell ${c.id}: a 40 m cell (${(c.box.maxX - c.box.minX).toFixed(0)} x ${(c.box.maxZ - c.box.minZ).toFixed(0)} m)`);
  assert.ok(bt.cells.indexOf(c) >= bt.cells.findLastIndex((x) => !x.near), `${bt.mesh.name}: the near cells follow the kit's cells`);
}
const { bt: nb, c: nc } = near[0];
const nx = (nc.box.minX + nc.box.maxX) / 2, nz = (nc.box.minZ + nc.box.maxZ) / 2;
update(nx, (nc.box.minY + nc.box.maxY) / 2, nz);
assert.equal(shown(nb, nc), true, 'a camera inside a near cell draws its pieces');
let nearHideAt = null;
for (let h = 0; h <= 400; h++) {
  update(nx, nc.box.maxY + h, nz);
  if (!shown(nb, nc)) { nearHideAt = h; break; }
}
const fineFar = hideAt - 16;
assert.ok(nearHideAt !== null && Math.abs(nearHideAt - (fineFar * 0.5 + 16)) <= 1,
  `the near pieces hide at half the fine-detail distance (${nearHideAt} m; the kit's joinery ${hideAt} m)`);
let nearShowAt = null;
for (let h = nearHideAt; h >= 0; h--) {
  update(nx, nc.box.maxY + h, nz);
  if (shown(nb, nc)) { nearShowAt = h; break; }
}
assert.ok(nearShowAt !== null && nearHideAt - nearShowAt >= 10 && nearHideAt - nearShowAt <= 20,
  `the near pieces show again well inside that distance (hides at ${nearHideAt} m, shows at ${nearShowAt} m)`);

console.log(`fineDetailLod.selftest: Saltwind Ridge's fine joinery in ${batches.length} receive-only multi-draw batches (${cellCount} cells, `
  + `${near.length} of them the craft's near cells), all hidden from 3 km up; one cell hides ${hideAt} m above its roofs and shows again at `
  + `${showAt} m, a near cell hides at ${nearHideAt} m and shows at ${nearShowAt} m`);
