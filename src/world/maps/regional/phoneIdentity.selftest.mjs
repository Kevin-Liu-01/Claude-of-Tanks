// A phone's collision is the desktop's, index for index (docs/DESTRUCTION.md §8.4; the facades lane, 2026-10-08). For
// every registered kit's every builder over plot sizes, wall families and world poses (half of them on a map's middle
// band, where the Sarajevan valley blocks and the Shanghai creek rows stand), a desktop build against a phone build of
// the same streams:
//   - the solids (every part that is not noCollision: the collision's input, structureCollision.ts) are byte for byte
//     the same;
//   - the build, look and weather streams draw exactly as often: a phone leaves its dressing out through
//     PartSink.dressing, which runs the dressing and keeps none of it, so a stream a solid draws from after the
//     dressing (a Franconian hoist dormer after the framed gable's windows, a Sarajevan collapsed end's piers after the
//     roof's aerial and the shell pocks) stands where the desktop's does.
// The desktop's own builds are unchanged by this (byte for byte against the tree before it, checked when it landed).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './index.ts';
import { hashSeed, streamFrom } from './geometry.ts';

const SEEDS = 6;
const WALLS = ['stone', 'plaster', 'plaster2', 'plaster3'];

function counted(seed) {
  const inner = streamFrom(seed);
  const stream = () => { stream.draws++; return inner(); };
  stream.draws = 0;
  return stream;
}

function solidsHash(parts) {
  const h = createHash('sha1');
  for (const [bucket, list] of Object.entries(parts).sort()) {
    for (const geometry of list) {
      if (geometry.userData?.noCollision) continue;
      const p = geometry.getAttribute('position');
      h.update(bucket);
      h.update(Buffer.from(p.array.buffer, p.array.byteOffset, p.array.byteLength));
    }
  }
  return h.digest('hex');
}

let builds = 0, drawn = 0;
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    for (let k = 0; k < SEEDS; k++) {
      const r = streamFrom(hashSeed(`${style.id}:${id}:phone`, k));
      const w = 6 + r() * 9, d = 7 + r() * 10, h = 6 + r() * 9, wall = WALLS[Math.floor(r() * WALLS.length)];
      const x = (r() - 0.5) * 400, z = k % 2 ? (r() - 0.5) * 120 : (r() - 0.5) * 400, yaw = (r() - 0.5) * Math.PI * 2;
      const bounds = { minX: -w / 2 - r() * 0.4, maxX: w / 2 + r() * 0.4, minZ: -d / 2 - r() * 0.4, maxZ: d / 2 + r() * 0.4, maxY: h + r() * 2 };
      const build = (tier) => {
        const rng = counted(hashSeed(`${style.id}:phone:${id}`, 2002, x, z, yaw));
        const variant = counted(hashSeed(`${style.id}:variant:phone:${id}`, 2002, x, z, yaw));
        const weather = counted(hashSeed(`${style.id}:weather:phone:${id}`, 2002, x, z, yaw));
        const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds, wallBucket: wall, rng, variant, mapId: 'phone',
          snowCap: false, tier, x, z, yaw }, weather);
        const out = { solids: solidsHash(parts), draws: [rng.draws, variant.draws, weather.draws] };
        for (const list of Object.values(parts)) for (const geometry of list) geometry.dispose();
        return out;
      };
      const desktop = build('desktop'), phone = build('mobile');
      const label = `${style.id}/${id} (plot ${w.toFixed(1)} x ${d.toFixed(1)}, ${wall}, at ${x.toFixed(0)}, ${z.toFixed(0)})`;
      assert.deepEqual(phone.draws, desktop.draws, `${label}: the phone draws the build, look and weather streams as the desktop does`);
      assert.equal(phone.solids, desktop.solids, `${label}: the phone's solids are the desktop's, byte for byte`);
      builds++;
      drawn += desktop.draws[0] + desktop.draws[1];
    }
  }
}
assert.ok(builds > 1000, `the kits' builders build (${builds})`);
console.log(`regional phone identity: ${builds} builds, every phone build's solids and stream draws (${drawn} in all) the desktop's`);
