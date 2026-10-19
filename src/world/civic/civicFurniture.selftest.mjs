// civicFurniture.selftest.mjs — the civic kit's furniture and its memorial column at the props r2 bar (the maps lane, 228;
// the owner's bar: bunkers r2, every prop kind member-built, regional, grounded, its broken state no raft;
// tools/r2-standard.mjs): the kiosk, the Litfaßsäule, the TelH78, the bollard and the planter on every map whose plan
// places them, and the Friedenssäule ('saeule', wellKit.ts) on its kit's stone, desktop and phone. Each kind's record
// keeps its class rules: the column fortified (collision.ts), the furniture a hull breaks.
import assert from 'node:assert/strict';
import { assertR2 } from '../../../tools/r2-standard.mjs';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { CIVIC_BUILDERS, CIVIC_RECORDS } = await import('./civicFurnitureKit.ts');
const { CIVIC_PLAN_MAPS, civicPlanFor } = await import('./plans/index.ts');
const { buildMonument, wellStoneOf } = await import('../maps/wellKit.ts');
const { isFortifiedCoverKind } = await import('../collision.ts');
const { getMapConfig } = await import('../maps/index.ts');
const { ARCHITECTURE_STYLES } = await import('../maps/regional/index.ts');

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const placing = (kind) => CIVIC_PLAN_MAPS.filter((m) => civicPlanFor(m).areas.some((a) => [...a.furniture, ...a.parking].some((p) => p.kind === kind)
  || a.monument?.kind === kind));

const CAPS = { kiosk: 1400, litfass: 700, telzelle: 1000, poller: 300, pflanzkuebel: 400 };
const rows = [];
for (const [kind, b] of Object.entries(CIVIC_BUILDERS)) {
  const maps = placing(kind);
  assert.ok(maps.length, `${kind}: placed by a plan`);
  const r = assertR2({
    kind: `civic:${kind}`, maps, caps: { near: CAPS[kind] },
    resolve: (mapId) => ({ form: `${kind}:${civicPlanFor(mapId).style}`, build: () => b.build(mulberry(5)), broken: () => b.broken(mulberry(5)) }),
  });
  for (const f of r.forms) rows.push(`${f.form} ${f.metrics.tris}t box ${f.metrics.boxShare}`);
  const rec = CIVIC_RECORDS[kind];
  assert.ok(rec.cls === 'break' && rec.r > 0 && rec.h > 0, `${kind}: a breakable record`);
  assert.ok(!isFortifiedCoverKind(kind), `${kind}: a hull breaks it`);
}
// the memorial column on each placing map's kit stone, desktop and phone, its caps (review AC3: 9.0k / 4.5k / 7.0k)
for (const mapId of placing('memorialcolumn')) {
  const arch = getMapConfig(mapId).props?.architecture;
  const style = ARCHITECTURE_STYLES?.find((st) => st.id === arch) ?? null;
  assert.ok(style, `${mapId}: its kit ${arch}`);
  const stone = style ? wellStoneOf(style) : { kind: 'sandstone', dressed: true, tint: [1, 0.9, 0.75], damp: 0.6 };
  for (const mobile of [false, true]) {
    const ctx = { stone, mobile };
    const r = assertR2({
      kind: `civic:memorialcolumn${mobile ? ':phone' : ''}`, maps: [mapId], route: 'landmark',
      caps: { near: mobile ? 4500 : 9000 },
      resolve: () => ({ form: `saeule:${arch}${mobile ? ':phone' : ''}`, bucket: 'regionalStone', build: () => buildMonument('saeule', ctx, false), broken: () => buildMonument('saeule', ctx, true) }),
    });
    for (const f of r.forms) rows.push(`${f.form} ${f.metrics.tris}t box ${f.metrics.boxShare}`);
    const broken = buildMonument('saeule', ctx, true), intact = buildMonument('saeule', ctx, false);
    assert.ok(broken.attributes.position.count / 3 <= 7000, `the broken column within 7.0k triangles`);
    intact.computeBoundingBox();
    assert.ok(Math.abs(intact.boundingBox.max.y - CIVIC_RECORDS.memorialcolumn.h) < 0.4, `the column ${intact.boundingBox.max.y.toFixed(2)} m tall (its record ${CIVIC_RECORDS.memorialcolumn.h})`);
  }
}
assert.ok(isFortifiedCoverKind('memorialcolumn') && CIVIC_RECORDS.memorialcolumn.crushMin >= 999 && CIVIC_RECORDS.memorialcolumn.collider, 'the column is fortified cover');
console.log(`civicFurniture.selftest: ${rows.length} forms at the r2 bar — ${rows.join('; ')} — ok`);
