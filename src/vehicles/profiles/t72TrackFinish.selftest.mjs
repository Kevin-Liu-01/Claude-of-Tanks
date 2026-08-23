import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { T72_TRACK_FINISH } from './t72.js';

const playableT72Ids = ['t72b3m', 't72bu', 't72m1_jaguar'];

for (const id of playableT72Ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const bands = [];
  tank.root.traverse((object) => {
    if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') {
      bands.push(object);
    }
  });
  assert.deepEqual(
    bands.map((band) => band.name).sort(),
    ['gearTrackBandL', 'gearTrackBandR'],
    `${id}: exactly one continuous track band remains on each side`,
  );
  for (const band of bands) {
    assert.equal(
      band.material.color.getHex(),
      T72_TRACK_FINISH.trackBandHex,
      `${id} ${band.name}: track band uses warm neutral steel, not camouflage green`,
    );
    assert.equal(
      band.material.roughness,
      T72_TRACK_FINISH.trackBandRoughness,
      `${id} ${band.name}: oxidized track steel stays matte`,
    );
    assert.equal(
      band.material.envMapIntensity,
      T72_TRACK_FINISH.trackBandEnvMapIntensity,
      `${id} ${band.name}: environment tint cannot recolor the track`,
    );
    assert.equal(band.userData?.appearanceRole, 'trackBand',
      `${id} ${band.name}: semantic track role survives the finish override`);
  }
  tank.dispose();
}

console.log('t72TrackFinish.selftest: all playable T-72 bands use neutral oxidized steel');
