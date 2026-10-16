import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';

// 2026-10-01: the owner's September renewal (4c34b3e8b, fleet-renewal-publication-20260930.md; cdbfe54dc) rebuilt
// all four T-72-derived running gears on detailed source studies: t72b3m_2022 on t72b3m_2016, t72bu_1989 on t72bu,
// t72m1_jaguar on t72b3 and bmpt_terminator2 on t80u. They now wear their donor study's X-standard track steel
// (2026-09-17) instead of the retired legacy builders' T72_TRACK_FINISH override. The law stays the same: one
// continuous band a side, neutral track steel that no camouflage map or scheme tint reaches, the donor's own finish.
const T72_DERIVED = Object.freeze({
  t72b3m_2022: FLEET_RENEWAL_DONORS.t72b3m_2022, t72bu_1989: FLEET_RENEWAL_DONORS.t72bu_1989,
  t72m1_jaguar: FLEET_RENEWAL_DONORS.t72m1_jaguar, bmpt_terminator2: 't80u',
});
assert.deepEqual(T72_DERIVED, { t72b3m_2022: 't72b3m_2016', t72bu_1989: 't72bu', t72m1_jaguar: 't72b3', bmpt_terminator2: 't80u' });

const finishOf = (id) => {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const bands = [];
    tank.root.traverse((object) => {
      if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') bands.push(object);
    });
    assert.deepEqual(bands.map((band) => band.name).sort(), ['gearTrackBandL', 'gearTrackBandR'],
      `${id}: exactly one continuous track band remains on each side`);
    return bands.map((band) => {
      assert.equal(band.material.map, null, `${id} ${band.name}: no camouflage map on the track band`);
      assert.equal(band.userData?.appearanceRole, 'trackBand', `${id} ${band.name}: semantic track role survives`);
      const { r, g, b } = band.material.color;
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 0.03, `${id} ${band.name}: neutral steel, not camouflage green`);
      return [band.name, band.material.color.getHex(), band.material.roughness, band.material.envMapIntensity];
    }).sort();
  } finally { tank.dispose(); }
};

for (const [id, donorId] of Object.entries(T72_DERIVED)) {
  assert.deepEqual(finishOf(id), finishOf(donorId), `${id}: track band wears its donor study's steel finish`);
}

console.log('t72TrackFinish.selftest: all T-72-derived bands use their donor studies\' neutral track steel');
