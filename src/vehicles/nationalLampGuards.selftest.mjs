// Release 227 (national lamp guards; the CN lane's follow-up "national lamp guard tangency"): every national turret driving
// lamp (profiles/nationalRoofSystems.ts nationalLamp) stood its two 9 mm guard posts flush with its base plate's ends, a
// post's flat face 0.4 mm off the plate's end face: coplanar, so the dark post and the plate z-fought over about 2.5 cm2 a
// post. The CN lane gave the Qilin's, Kunlun's and Yun's lamps a plate 10 mm longer at each end (guardInset); every other
// national lamp now takes the same plate (NATIONAL_LAMP_GUARD_INSET_M, the default), its posts and top bar where they were.
// On the eleven national tanks, at both qualities: each tank's two turret lamps are nationalLamp assemblies of its
// loadout's shape whose plate runs 10 mm past each post's outer face; the seating census of the lamps' neighbourhood
// (cnTurretGeometry.test-support.mjs seatingCensus) finds every lamp part reaching permanent stock and none resting on ERA
// alone; and no lamp part z-fights by the exact measure (coplanarOverlap.test-support.mjs: parallel faces clipped exactly;
// seatingCensus's sampled ZFIGHT misses the 5.6 mm post flat on the round and square lamps, and reads the square lamps'
// pane and bezel bar, two faces sharing an edge, as 9.8 cm2 by float noise). Negative control: the original flush plate,
// put back on one lamp of each shape, z-fights with both of its posts. The census's burial class (CROSS) is not asserted:
// the lamps' feet and plates were authored 17-46 mm into the cast roofs and add-on armour before this item.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';
import { NATIONAL_LAMP_GUARD_INSET_M } from './profiles/nationalRoofSystems.ts';
import { censusPart, seatingCensus } from './cnTurretGeometry.test-support.mjs';
import { zFightCensus } from './coplanarOverlap.test-support.mjs';

const IDS = ['t80u_zoria', 't72b3m_hetman', 't72b3_sich', 't80u_husarz', 't72b3m_wilk', 't72b3_zubr', 't80u_bars_m',
  't72b3m_bulat_m', 't72b3_bastion_m', 't72b3m_hetman_ii', 't72b3_zubr_ii'];
// one lamp of each shape for the negative control
const CONTROLS = new Set(['t80u_zoria', 't80u_husarz', 't72b3_sich']);
const MIN_ZFIGHT_M2 = 1e-5; // 0.1 cm2 visible
const owner = (p) => (p.bucket.startsWith('turret') ? 'turret' : p.bucket.startsWith('gun') ? 'gun' : 'hull');
const size = (p) => p.box.getSize(new THREE.Vector3());
const near = (a, b, e = 2e-4) => Math.abs(a - b) <= e;
const label = (p) => `${p.role ?? p.bucket}[${p.box.min.toArray().map((v) => v.toFixed(3))}..${p.box.max.toArray().map((v) => v.toFixed(3))}]`;

/** The turret's nationalLamp assemblies, found from their lenses in the factory's part order: foot, plate, body, lens (and
 * a square pane's four bezel bars), the two guard posts and the top bar. */
function lampsOf(parts) {
  const lamps = [];
  parts.forEach((lens, i) => {
    if (lens.lens !== 'headlight' || owner(lens) !== 'turret') return;
    const [foot, plate, body] = [parts[i - 3], parts[i - 2], parts[i - 1]];
    let k = i + 1; const bezel = []; while (parts[k]?.bezel) bezel.push(parts[k++]);
    const [postA, postB, bar] = [parts[k], parts[k + 1], parts[k + 2]];
    if (!(foot?.bucket === 'turretDetail' && near(size(foot).x, .13) && near(size(foot).y, .11) && near(size(foot).z, .13)
      && plate?.bucket === 'turretDetail' && near(size(plate).y, .035) && near(size(plate).z, .16) && body?.bucket === 'turretDetail'
      && [postA, postB, bar].every((p) => p?.bucket === 'turretDark') && near(size(bar).y, .018) && near(size(bar).z, .020))) return;
    const assembly = [foot, plate, body, lens, ...bezel, postA, postB, bar];
    for (const p of assembly) p.role = 'lamp';
    lamps.push({ assembly, plate, posts: [postA, postB], bar, bezel });
  });
  return lamps;
}
/** A copy of a census part narrowed about its centre in X to `width` (the plate as it was). */
function narrowed(p, width) {
  const c = (p.box.min.x + p.box.max.x) / 2, f = width / size(p).x, tri = Float64Array.from(p.tri);
  for (let i = 0; i < tri.length; i += 3) tri[i] = c + (tri[i] - c) * f;
  const box = p.box.clone(); box.min.x = c - width / 2; box.max.x = c + width / 2;
  return { ...p, tri, box, dense: undefined, samples: undefined };
}

for (const quality of ['high', 'low']) {
  // NATIONAL_LAMP_IDS=<ids> limits a local run (the suite runs all eleven)
  for (const id of (process.env.NATIONAL_LAMP_IDS ?? IDS.join(',')).split(',')) {
    const parts = [];
    const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242,
      partCensus(bucket, g) { parts.push({ ...censusPart(bucket, g), lens: g.userData?.vehicleNightLens?.kind ?? null, bezel: Boolean(g.userData?.glassSurround) }); } });
    try {
      const lamps = lampsOf(parts), shape = NATIONAL_ROOF_LOADOUTS[id].lamp, w = shape === 'slit' ? .26 : .20;
      assert.equal(lamps.length, 2, `${id}/${quality}: two turret lamps built by nationalLamp`);
      for (const L of lamps) {
        const at = `${id}/${quality}: lamp at x ${((L.plate.box.min.x + L.plate.box.max.x) / 2).toFixed(3)}`;
        assert.ok(near(size(L.plate).x, w + .062 + 2 * NATIONAL_LAMP_GUARD_INSET_M), `${at}: its ${shape} plate ${size(L.plate).x.toFixed(4)} m long`);
        assert.ok(near(size(L.bar).x, w + .062), `${at}: its top bar as before`);
        assert.equal(L.bezel.length, shape === 'square' ? 4 : 0, `${at}: a square pane's four bezel bars`);
        const [inner, outer] = [Math.min(...L.posts.map((p) => p.box.min.x)), Math.max(...L.posts.map((p) => p.box.max.x))];
        for (const gap of [inner - L.plate.box.min.x, L.plate.box.max.x - outer])
          assert.ok(gap > NATIONAL_LAMP_GUARD_INSET_M - 5e-4, `${at}: the plate runs ${(gap * 1000).toFixed(1)} mm past a post's outer face`);
      }
      // the lamps and every turret part within 50 mm of them
      const T = parts.filter((p) => owner(p) === 'turret');
      const envelopes = lamps.map((L) => L.assembly.reduce((b, p) => b.union(p.box), new THREE.Box3()).expandByScalar(.05));
      const scope = T.filter((p) => p.role || envelopes.some((e) => e.intersectsBox(p.box)));
      const census = seatingCensus(scope, { allowance: () => .016 });
      const seated = census.filter((s) => /^(FLOAT|ON-ERA|ERA-OVERLAP) /.test(s));
      assert.deepEqual(seated, [], `${id}/${quality}: every lamp part on permanent stock:\n  ${seated.join('\n  ')}`);
      const zfights = zFightCensus(scope, { minArea: MIN_ZFIGHT_M2 })
        .map((z) => `ZFIGHT ${(z.visible * 1e4).toFixed(2)} cm2 ${label(z.A)} | ${label(z.B)}`);
      assert.deepEqual(zfights, [], `${id}/${quality}: no lamp part z-fights:\n  ${zfights.join('\n  ')}`);
      // negative control: the flush plate as it was z-fights with both its posts
      if (quality === 'high' && CONTROLS.has(id)) {
        const L = lamps[0], flush = narrowed(L.plate, size(L.plate).x - 2 * NATIONAL_LAMP_GUARD_INSET_M);
        const withFlush = scope.map((p) => (p === L.plate ? flush : p));
        const hits = zFightCensus(withFlush, { minArea: MIN_ZFIGHT_M2 }).filter((z) => [z.A, z.B].includes(flush) && L.posts.some((p) => [z.A, z.B].includes(p)));
        const areas = hits.map((z) => (z.visible * 1e4).toFixed(2)).join(', ');
        assert.equal(hits.length, 2, `negative control ${id}: the flush ${shape} plate z-fights with both posts (${areas} cm2)`);
        console.log(`negative control ${id}: the flush ${shape} plate z-fights with both posts (${areas} cm2 visible) PASS`);
      }
      const crosses = census.filter((s) => s.startsWith('CROSS'));
      console.log(`${id}/${quality}: two ${shape} lamps guarded ${(NATIONAL_LAMP_GUARD_INSET_M * 1000).toFixed(0)} mm, seated, no z-fight`
        + ` (${scope.length} parts; authored burials over 16 mm: ${crosses.length}) PASS`);
    } finally {
      tank.dispose();
    }
  }
}
