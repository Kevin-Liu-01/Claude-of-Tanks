// The ring's cliff normals (the mountains lane, 2026-10-04, after the light lane's finding on Redrock's sunward view: the
// faces turned away from the sun read at 74-82 % of the sunlit sand). horizon.ts sharpenHorizonCliffNormals: on ground
// steeper than 50-65 degrees a ring vertex takes its geometry's own normal (its faces', area-weighted) instead of the
// analytic normal of the smoothed heights, which tipped Redrock's cliffs up by a median 43 degrees and lit half of the
// faces turned from the sun. Built for three cliff rings, past the seam band (the first 60 m past the square keep the
// playable ground's normals): the shipped normals stay within a few degrees of the geometry, and a face turned from the
// sun is not lit by its normal.
//   node src/world/horizonCliffNormals.selftest.mjs
import assert from 'node:assert/strict';
import { BufferGeometry } from 'three';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';

installWorldBuildFixture();
const { buildHorizonRing } = await import('./maps/horizon.ts');
const { getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');

const report = {};
for (const mapId of ['badlands', 'copper_mesa', 'titan_gorge']) {
  const cfg = getMapConfig(mapId), hf = createHeightField(1337, cfg);
  const ring = buildHorizonRing(null, cfg, 1337, hf);
  const g = ring.geometry;
  const faces = new BufferGeometry();
  faces.setAttribute('position', g.getAttribute('position'));
  faces.setIndex(g.getIndex());
  faces.computeVertexNormals();
  const geometric = faces.getAttribute('normal'), shipped = g.getAttribute('normal'), pos = g.getAttribute('position');
  const sky = cfg.sky ?? {};
  const az = (sky.sunAzimuthDeg ?? 115) * Math.PI / 180, el = (sky.sunElevationDeg ?? 32) * Math.PI / 180;
  const sun = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const tips = [];
  let backlit = 0, litBackwards = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.max(Math.abs(x), Math.abs(z)) - 512 <= 60 || Math.hypot(x, z) > 1400) continue;
    // (the ring is wound facing down for computeVertexNormals: its geometric normal is the negation)
    const gx = -geometric.getX(i), gy = -geometric.getY(i), gz = -geometric.getZ(i);
    if (!(gy > 0 && gy < 0.42)) continue; // steeper than 65 degrees
    const sx = shipped.getX(i), sy = shipped.getY(i), sz = shipped.getZ(i);
    tips.push(Math.acos(Math.max(-1, Math.min(1, sx * gx + sy * gy + sz * gz))) * 180 / Math.PI);
    if (gx * sun[0] + gy * sun[1] + gz * sun[2] < -0.1) {
      backlit++;
      if (sx * sun[0] + sy * sun[1] + sz * sun[2] > 0.1) litBackwards++;
    }
  }
  faces.dispose();
  tips.sort((a, b) => a - b);
  const p90 = tips.length ? tips[Math.floor(0.9 * (tips.length - 1))] : 0;
  report[mapId] = { steep: tips.length, tipP90Deg: +p90.toFixed(2), backlit, litBackwards };
  assert.ok(tips.length > 0 || mapId === 'badlands', `${mapId}: the ring has cliffs past the seam band`);
  assert.ok(p90 <= 8, `${mapId}: a cliff's normal is its geometry's (p90 tip ${p90.toFixed(1)} degrees)`);
  assert.equal(litBackwards, 0, `${mapId}: no face turned from the sun is lit by its normal (${litBackwards} of ${backlit})`);
}
console.log('horizonCliffNormals.selftest: the ring\'s cliffs take their geometry\'s normals', JSON.stringify(report));
