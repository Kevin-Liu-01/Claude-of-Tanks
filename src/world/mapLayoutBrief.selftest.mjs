// Receipt for the battlefields rebuilt to docs/MAP-LAYOUT-BRIEF.md (src/world/maps/layoutBriefMaps.ts): every
// measurable band of tools/map-layout-metrics.mjs holds on each one — or the map names its exception and the reason
// is reported — and the invariants behind the bands hold outright: both teams can drive to every zone-control zone
// and the turbo-ball kickoff, the zones keep their authored places, the spawn anchors are screened from each other,
// and the map no longer carries the Verdant landform skeleton or its beat sites.
import assert from 'node:assert/strict';
import { computeLayoutMetrics, TARGETS } from '../../tools/map-layout-metrics.mjs';
import { LAYOUT_BRIEF_MAPS } from './maps/layoutBriefMaps.ts';
import { getMapConfig } from './maps/index.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../sim/matchObjectiveLayouts.ts';

assert.ok(LAYOUT_BRIEF_MAPS.length > 0, 'the brief roster names at least one rebuilt map');
// The skeleton the census found under twelve maps: Verdant Fields' five landforms and three strongpoint sites as they
// stood before the brief (frozen here when Verdant itself was rebuilt, 2026-10-02, so the check keeps its meaning).
const VERDANT_SKELETON = {
  landforms: [
    { kind: 'ridge', x: -244, z: 18, yawDeg: 10 }, { kind: 'ridge', x: 246, z: 54, yawDeg: -14 }, { kind: 'ridge', x: -54, z: 232, yawDeg: 74 },
    { kind: 'knoll', x: 168, z: -218 }, { kind: 'basin', x: -142, z: -176 },
  ],
  beats: [
    { id: 'western-hedgerow-post', x: -254, z: 64 }, { id: 'eastern-field-observer', x: 246, z: 70 },
    { id: 'northern-command-fold', x: 24, z: 270 },
  ],
};
// A landform borrows the skeleton when it is the same kind within 75 m of one of Verdant's, and a ridge only when it also
// runs the same way, its axis within 30 degrees of the swell's (2026-10-03: Skybridge Chasm's north-south canyon
// shoulders stand where two of Verdant's east-west swells stood, a different landform in the same place).
const axisApart = (a, b) => { const d = (((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };
const borrowedFrom = (forms) => VERDANT_SKELETON.landforms.filter((form) => forms.some((own) => own.kind === form.kind
  && Math.hypot(own.x - form.x, own.z - form.z) < 75
  && (form.kind !== 'ridge' || axisApart(own.yawDeg ?? 0, form.yawDeg) <= 30))).length;
// negative controls: the skeleton copied as it was is caught whole, and so is a copy nudged 60 m with its swells turned
// 25 degrees; only the ridges turned across the swells' run (80 degrees) stop counting
assert.equal(borrowedFrom(VERDANT_SKELETON.landforms), 5, 'a true copy of Verdant\'s skeleton is borrowed whole');
assert.equal(borrowedFrom(VERDANT_SKELETON.landforms.map((form) => ({ ...form, x: form.x + 60,
  ...(form.kind === 'ridge' ? { yawDeg: form.yawDeg + 25 } : {}) }))), 5, 'a nudged, slightly turned copy is still borrowed');
assert.equal(borrowedFrom(VERDANT_SKELETON.landforms.map((form) => form.kind === 'ridge' ? { ...form, yawDeg: form.yawDeg + 80 }
  : form)), 2, 'ridges turned across the swells stop counting; the knoll and the basin still do');
for (const mapId of LAYOUT_BRIEF_MAPS) {
  const config = getMapConfig(mapId);
  const m = await computeLayoutMetrics(mapId);
  const misses = m.checks.filter((check) => check.ok === false);
  assert.deepEqual(misses, [], `${mapId}: every brief band holds (${misses.map((c) => `${c.key}=${c.value}`).join(', ')})`);
  for (const check of m.checks.filter((c) => c.ok === 'exception')) {
    assert.ok(typeof check.reason === 'string' && check.reason.length > 40, `${mapId}/${check.key}: an exception states its reason`);
  }
  for (const check of m.checks.filter((c) => c.band)) {
    assert.ok(typeof check.bandReason === 'string' && check.bandReason.length > 40, `${mapId}/${check.key}: a map band states its reason`);
  }
  assert.equal(m.checks.length, Object.keys(TARGETS).length, `${mapId}: every band is evaluated`);

  // objectives: authored, reachable by both teams, seated where they were authored
  const hints = MATCH_OBJECTIVE_LAYOUTS[mapId];
  assert.ok(hints?.zones?.length === 3 && hints.kickoff, `${mapId}: authored zone and kickoff hints`);
  const zones = m.objectives.zone_control;
  assert.ok(Array.isArray(zones) && zones.length === 3, `${mapId}: three placed zones`);
  zones.forEach((zone, index) => {
    assert.ok(zone.fromAlpha > 0 && zone.fromBravo > 0, `${mapId}: zone ${index + 1} reachable by both teams`);
    const hint = hints.zones[index];
    assert.ok(Math.hypot(zone.x - hint.x, zone.z - hint.z) < 1, `${mapId}: zone ${index + 1} seats on its authored apron`);
  });
  const kickoff = m.objectives.turbo_ball[0];
  assert.ok(Math.hypot(kickoff.x - hints.kickoff.x, kickoff.z - hints.kickoff.z) < 1, `${mapId}: the kickoff seats where authored`);
  assert.ok(Array.isArray(m.objectives.capture_the_flag), `${mapId}: flag bases place`);

  // no borrowed skeleton: at most one of Verdant's five landforms survives (borrowedFrom above), none of its beat sites
  const borrowed = borrowedFrom(config.terrain.landforms ?? []);
  assert.ok(borrowed <= 1, `${mapId}: Verdant's landform skeleton is gone (${borrowed}/5 within 75 m)`);
  for (const beat of VERDANT_SKELETON.beats) {
    assert.ok((config.props.tacticalBeats ?? []).every((own) => Math.hypot(own.x - beat.x, own.z - beat.z) >= 60),
      `${mapId}: no strongpoint on Verdant's ${beat.id} site`);
  }
  console.log(`mapLayoutBrief ${mapId}: ${m.checks.map((c) => `${c.key}=${c.value}${c.ok === 'exception' ? '(exception)' : ''}`).join(' ')}`);
}
console.log(`mapLayoutBrief.selftest: ${LAYOUT_BRIEF_MAPS.length} rebuilt map(s) hold the brief`);
