// smallPropsDestructible.selftest.mjs — the small props that were static walls break now (destruction stream,
// 2026-10-13; the owner: "make sure all props below a certain size are destructible whether from ramming or shooting").
//
// The village well (on twenty maps), the square's monument (Steinburg, Amberford, the foundry town) and the rail yard's
// coal stockpiles were geometry in the world's buckets with a plain wall record: a hull stopped dead at them, rounds burst
// on them and nothing ever broke. The well and the monument are destructible props now (inhabitKit.ts: a stone curb and
// roof, an obelisk; their broken builds), laid at the end of the build in their placeholders' places so every other
// placement and identity keeps its own; the coal piles are crushable clutter a hull flattens. Real props builds in Node.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
  import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'), import('./propsModelStore.ts'),
  import('../vehicles/fleetFactory.ts')]);
const { DESTRUCTIBLE_TYPES } = await import('./maps/inhabitKit.ts');
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };
async function build(mapId) {
  const config = maps.getMapConfig(mapId);
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  return props.createProps(field, engine, 2002, config, flora);
}

// ---- the kinds: breakable by a hull at speed and by a round (a collider), with their broken builds
for (const kind of ['well', 'monument']) {
  const t = DESTRUCTIBLE_TYPES[kind];
  assert.equal(t.cls, 'break', `${kind} breaks`);
  assert.equal(t.collider, true, `${kind} stops a round, which breaks it`);
  assert.ok(t.crushMin > 0 && t.crushMin <= 3, `${kind}: a hull breaks it from ${t.crushMin} m/s`);
  assert.ok(typeof t.broken === 'function', `${kind} has its broken build`);
}

// ---- Steinburg's well and the foundry town's monument are records of the props' destructibles, crushable, with a shell
// record; a ram over the threshold breaks them and frees the way. (The maps lane, 228: Steinburg's square takes its civic
// plan's memorial column in the monument's place — fortified cover, below.)
for (const [mapId, kinds] of [['urban', ['well']], ['foundry', ['monument']]]) {
  const built = await build(mapId);
  for (const kind of kinds) {
    const index = built.destructibles.findIndex((d) => d.kind === kind);
    assert.ok(index >= 0, `Steinburg places its ${kind} as a destructible`);
    const record = built.destructibles[index];
    assert.ok(record.ob && record.ob.crushable && record.ob.propIdx === index, `${kind}: its movement record is crushable and names it`);
    assert.ok(record.col && record.col.crushable, `${kind}: its shell record breaks under a round`);
    assert.ok(built.obstacles.includes(record.ob) && built.colliders.includes(record.col), `${kind}: both in the world's lists`);
    assert.equal(built.obstacles.filter((r) => !r.kind && Math.abs(r.min[0] - record.ob.min[0]) < 0.01 && Math.abs(r.min[2] - record.ob.min[2]) < 0.01).length, 0,
      `${kind}: no plain wall record left where it stands`);
    assert.ok(built.crushDestructible(index, 1, 0, 8, 'ram'), `${kind}: a hull at 8 m/s breaks it`);
    assert.ok(record.ob.crushed, `${kind}: and drives on through it`);
  }
}

// ---- Steinburg's memorial column (world/civic): the monument's place and draws, fortified cover (collision.ts): crushable,
// no hull overruns it (crushMin 999), its shell record stops a round; no walked monument beside it
{
  const { isFortifiedCoverKind } = await import('./collision.ts');
  const built = await build('urban');
  const columns = built.destructibles.filter((d) => d.kind === 'memorialcolumn' && d.slot >= 0);
  assert.equal(columns.length, 1, 'Steinburg places one memorial column');
  const [c] = columns;
  assert.ok(Math.hypot(c.x + 62.5, c.z + 19.8) < 0.05, `the column at its seat (${c.x}, ${c.z})`);
  assert.ok(c.ob && c.ob.crushable && c.ob.crushMin === 999 && isFortifiedCoverKind(c.ob.kind), 'the column is fortified cover');
  assert.ok(c.col && built.colliders.includes(c.col), 'the column stops a round');
  assert.ok(Math.abs(c.h - 12.3) < 0.2, `the column stands 12.3 m (${c.h})`);
  assert.equal(built.destructibles.filter((d) => d.kind === 'monument' && d.slot >= 0).length, 0, 'no walked monument beside it');
}

// ---- the rail yard: its coal stockpiles flatten under a hull
{
  const built = await build('railyard');
  const coal = built.obstacles.filter((r) => r.kind === 'coal-heap');
  assert.ok(coal.length >= 4, `the yard stacks its coal (${coal.length})`);
  for (const r of coal) assert.ok(r.crushable && Number.isInteger(r.propIdx) && r.crushMin === 0, 'every pile is crushable clutter, at any speed');
  const pile = built.destructibles[coal[0].propIdx];
  assert.ok(pile && pile.clutter, 'a pile is its clutter');
  assert.ok(built.crushDestructible(coal[0].propIdx, 0, 1, 3, 'ram'), 'a hull flattens it');
  assert.ok(coal[0].crushed, 'and drives over it');
}

console.log('smallPropsDestructible selftest: the village well and the square\'s monument break under a hull and a round, Steinburg\'s memorial column stands as fortified cover, the rail yard\'s coal flattens — ok');
