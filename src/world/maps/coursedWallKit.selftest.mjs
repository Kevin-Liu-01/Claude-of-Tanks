// coursedWallKit.selftest.mjs — the brick-print maps' field walls in their region's build (props lane A, #6, 2026-10-16):
// every coping builds inside the legacy module (3 m along z) on the stone bucket's attributes, no more triangles than the
// legacy's 84, its broken state a low stepped bite; each kit its coping; the collision, the terrain fit and the footprint
// are the legacy module's exactly (its draws spent, its band frozen, its geometry the fit's); props.ts lays it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSED_WALLSTONE } from './inhabitKit.ts';
import { buildCoursedWall, coursedCopingFor, coursedWallType } from './coursedWallKit.ts';
import { deriveRuntimeStructureContactBand } from '../structureCollision.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const extent = (g) => { const p = g.attributes.position; let x = 0, y0 = Infinity, y1 = -Infinity, z = 0; for (let i = 0; i < p.count; i++) { x = Math.max(x, Math.abs(p.getX(i))); z = Math.max(z, Math.abs(p.getZ(i))); y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); } return { x, y0, y1, z }; };

const legacyTris = COURSED_WALLSTONE.build(mulberry32(1)).attributes.position.count / 3;
for (const coping of ['rollschicht', 'saddleback', 'tiled', 'block', 'slab']) {
  const g = buildCoursedWall(coping), e = extent(g), tris = g.attributes.position.count / 3;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv'], `${coping}: the stone bucket's attributes`);
  assert.ok(g.index === null);
  // (r2, 2026-10-16: the courses dressed — their arrises off — and the coping's eaves its own thickness: up to 110)
  assert.ok(tris <= 110, `${coping}: ${tris} triangles (the legacy ${legacyTris})`);
  assert.ok(e.z <= 1.52 && e.z > 1.45, `${coping}: fills its 3 m module (${e.z.toFixed(2)})`);
  assert.ok(e.x < 0.36, `${coping}: stays on its line (${e.x.toFixed(2)})`);
  assert.ok(e.y0 <= -0.09 && e.y1 > 1.0 && e.y1 < 1.3, `${coping}: sunk and about the legacy's height (${e.y0.toFixed(2)}..${e.y1.toFixed(2)})`);
  const b = buildCoursedWall(coping, true), eb = extent(b);
  assert.ok(eb.y1 < 0.62, `${coping}: broken lies low (${eb.y1.toFixed(2)})`);
  assert.ok(b.attributes.position.count / 3 <= 1.5 * tris, `${coping}: broken ${b.attributes.position.count / 3} triangles (1.5 x the intact ${tris})`);
  for (const x of [g, b]) for (const v of x.attributes.position.array) assert.ok(Number.isFinite(v));
  assert.deepEqual(buildCoursedWall(coping).attributes.position.array, g.attributes.position.array, `${coping}: deterministic`);
}
for (const [arch, want] of [['ruhr', 'rollschicht'], ['saar', 'rollschicht'], ['franconian', 'saddleback'], ['shanghai', 'tiled'],
  ['glencanyon', 'block'], ['sarajevo', 'slab'], ['kyushu', 'slab'], [null, 'slab']]) assert.equal(coursedCopingFor(arch), want, `${arch}: ${want}`);

// the collision, the fit and the footprint are the legacy module's
const t = coursedWallType('ruhr', COURSED_WALLSTONE, () => mulberry32(0x0f0f7));
for (const field of ['cls', 'mat', 'contact', 'r', 'h', 'hw', 'hl', 'wall', 'collider', 'keep', 'crushMin']) assert.equal(t[field], COURSED_WALLSTONE[field], field);
let drawsA = 0, drawsB = 0;
const a = mulberry32(99), c = mulberry32(99);
const built = t.build(() => { drawsA++; return a(); });
const old = COURSED_WALLSTONE.build(() => { drawsB++; return c(); });
assert.equal(drawsA, drawsB, 'the legacy draws are spent exactly');
assert.deepEqual(t.contactBand, deriveRuntimeStructureContactBand({ baked: [old] }), 'the frozen band is the legacy module\'s');
assert.deepEqual(t.fitGeometry.attributes.position.array, old.attributes.position.array, 'the terrain fit reads the legacy module');
let bA = 0, bB = 0;
const ba = mulberry32(5), bb = mulberry32(5);
t.broken(() => { bA++; return ba(); }); COURSED_WALLSTONE.broken(() => { bB++; return bb(); });
assert.equal(bA, bB, 'the legacy broken draws are spent exactly');
assert.deepEqual(t.footprintBuild().attributes.position.array, COURSED_WALLSTONE.build(mulberry32(0x0f0f7)).attributes.position.array, 'the legacy footprint');
built.dispose(); old.dispose();

// the bunker r2 standard (tools/r2-standard.mjs; the LOOKS sweep's bar) on every coping
{
  const { r2Check } = await import('../../../tools/r2-standard.mjs');
  const ARCH = { urban: 'franconian', railyard: 'ruhr', foundry: 'saar', caldera: 'kyushu', blackglass: 'shanghai', skybridge: 'glencanyon', ruinspires: 'sarajevo' };
  const res = r2Check({ kind: 'destructible:wallstone@coursed', maps: Object.keys(ARCH), bucket: 'stone', caps: { near: 110 },
    resolve: (m) => { const c = coursedCopingFor(ARCH[m]); return { form: c, build: () => buildCoursedWall(c), broken: () => buildCoursedWall(c, true) }; } });
  assert.ok(res.ok, `the r2 standard:\n  ${res.problems.join('\n  ')}`);
}

// the dry-stone field wall (the non-brick maps' wallstone): crowned at the r2 bar, the legacy's draws, band, fit and footprint
{
  const { DESTRUCTIBLE_TYPES, wallStoneBox, wallStoneFor } = await import('./inhabitKit.ts');
  const { dryStoneWallType } = await import('./coursedWallKit.ts');
  const { r2Check } = await import('../../../tools/r2-standard.mjs');
  const legacyStone = { ...DESTRUCTIBLE_TYPES.wallstone, mat: 'fieldStone' };
  const ds = dryStoneWallType(legacyStone, null, () => mulberry32(0x0f0f7));
  let dA = 0, dB = 0;
  const ra = mulberry32(31), rb = mulberry32(31);
  const drawn = ds.build(() => { dA++; return ra(); }), old = legacyStone.build(() => { dB++; return rb(); });
  assert.equal(dA, dB, 'the dry-stone legacy draws are spent exactly');
  assert.deepEqual(ds.contactBand, deriveRuntimeStructureContactBand({ baked: [old] }), 'the frozen band is the legacy module\'s');
  assert.deepEqual(ds.fitGeometry.attributes.position.array, old.attributes.position.array, 'the terrain fit reads the legacy module');
  assert.deepEqual(ds.footprintBuild().attributes.position.array, legacyStone.build(mulberry32(0x0f0f7)).attributes.position.array, 'the legacy footprint');
  for (const seed of [1, 3, 77, 1234]) {
    const box = wallStoneBox(mulberry32(seed));
    const res = r2Check({ kind: 'destructible:wallstone (dry stone)', maps: ['field'], bucket: 'fieldStone',
      resolve: () => ({ form: `envelope ${seed}`, build: () => wallStoneFor(box, true), broken: () => DESTRUCTIBLE_TYPES.wallstone.broken(mulberry32(seed + 1)) }) });
    assert.ok(res.ok, `the r2 standard:\n  ${res.problems.join('\n  ')}`);
  }
  drawn.dispose(); old.dispose();
  const propsSrc = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
  assert.ok(propsSrc.includes("wallstone: dryStoneWallType({ ...DESTRUCTIBLE_TYPES.wallstone, mat: fieldWallBucket }, snowCap ? withSnowLoad : null, () => mulberry32(0x0f0f7))"), 'props.ts lays the crowned dry-stone walls');
}

const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.ok(props.includes('wallstone: coursedWallType(regionalArchitecture?.id, COURSED_WALLSTONE, () => mulberry32(0x0f0f7))'), 'props.ts lays the coursed walls');
assert.ok(props.includes('fitWallSpan(pool.mats4[record.slot], pool.meta.fitGeometry ?? geoI, heightField, span, record, WALL_SEG);'), 'the fit reads the legacy');
console.log(`coursedWallKit.selftest: 5 copings dressed (the r2 standard), broken low, kits mapped, legacy collision/fit/footprint, wired`);
