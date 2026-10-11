// Receipt for terrain.mounds (the map-revival lane, 2026-10-06, Tidegate Polders' molenbergen): a built mound stands
// over the finished ground — its crest level at the ground at its centre plus its height out to crestR, a batter falling
// to the foot at baseR, the ground past it untouched — and a map without mounds (or with an empty list) builds the
// same surface to the bit.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');

const polders = getMapConfig('polders');
const mounds = polders.terrain.mounds ?? [];
assert.ok(mounds.length >= 2, 'Polders authors its two molenbergen');
const bare = createHeightField(1337, { ...polders, terrain: { ...polders.terrain, mounds: [] } });
const built = createHeightField(1337, polders);
for (const m of mounds) {
  const crest = bare.getHeightAt(m.x, m.z) + m.height;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    // the crest: level at its authored height over the centre's ground, out to crestR
    for (const d of [0, m.crestR * 0.5, m.crestR * 0.98]) {
      const y = built.getHeightAt(m.x + Math.cos(a) * d, m.z + Math.sin(a) * d);
      assert.ok(Math.abs(y - crest) < 1e-9, `mound at ${m.x},${m.z}: the crest stands level (${y} vs ${crest})`);
    }
    // the batter: between the crest and the ground beneath, falling outward
    let last = crest;
    for (let d = m.crestR; d <= m.baseR; d += (m.baseR - m.crestR) / 8) {
      const x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
      const y = built.getHeightAt(x, z), under = bare.getHeightAt(x, z);
      assert.ok(y <= last + 1e-6 || y <= under + 1e-6, `mound at ${m.x},${m.z}: the batter falls outward`);
      last = y;
    }
    // past the foot the ground is the bare ground's
    for (const d of [m.baseR + 0.2, m.baseR + 3, m.baseR + 10]) {
      const x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
      assert.equal(built.getHeightAt(x, z), bare.getHeightAt(x, z), `mound at ${m.x},${m.z}: the ground past its foot is untouched`);
    }
  }
}
// a map without mounds builds the same surface whether the list is absent or empty
const verdant = getMapConfig('verdant');
const plain = createHeightField(1337, verdant), empty = createHeightField(1337, { ...verdant, terrain: { ...verdant.terrain, mounds: [] } });
for (let z = -480; z <= 480; z += 40) for (let x = -480; x <= 480; x += 40) {
  assert.equal(empty.getHeightAt(x, z), plain.getHeightAt(x, z), `verdant ${x},${z}: an empty mound list changes nothing`);
}
console.log(`terrainMounds.selftest: ${mounds.length} mounds level on their crests, falling to their feet, the ground past them untouched; a map without mounds unchanged`);
