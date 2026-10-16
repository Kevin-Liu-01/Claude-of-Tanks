// smokeBlocks' footprint early-out is exact (2026-10-13, the MP stream: the authority's tick). Every sight test against a
// smoke screen used to build every bank's full volume — two ground lookups for a canister bank — before testing the line;
// on a 28-bot match the roof guns' target scans made those analytic terrain samples the largest single cost of the host's
// tick. A bank too thin to block, or whose radius the line's horizontal path never comes within, is now skipped before its
// ground is read. This receipt proves the answers are unchanged: the reference below is the pre-change test (every bank's
// volume, then the ellipsoid / walled-reach test) over thousands of random lines through real launched screens, open and
// walled, at every age — and counts the ground lookups saved.
import assert from 'node:assert/strict';
import { requestAuxiliary } from './auxiliarySystems.ts';
import { SMOKE_DURATION_S, smokeBankCount, smokeBlocks, smokeReach, smokeVolume } from './smokeScreen.ts';

let seed = 1234567;
const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const between = (lo, hi) => lo + (hi - lo) * random();
let lookups = 0;
const ground = (x, z) => { lookups++; return Math.sin(x * 0.05) * 3 + Math.cos(z * 0.07) * 2 + Math.sin((x + z) * 0.013) * 6; };

/** The pre-2026-10-13 smokeBlocks, verbatim in its logic: every bank's volume first, then the line test. */
function referenceBlocks(screens, a, b, now, groundAt) {
  const volume = { x: 0, y: 0, z: 0, radius: 0, height: 0, density: 0 };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (const screen of screens) {
    if (now < screen.born || now - screen.born > SMOKE_DURATION_S) continue;
    for (let bank = -2; bank < smokeBankCount(screen) - 2; bank++) {
      smokeVolume(screen, now, bank, volume, groundAt);
      if (volume.density < 0.22) continue;
      const ax = (a.x - volume.x) / volume.radius, ay = (a.y - volume.y) / volume.height, az = (a.z - volume.z) / volume.radius;
      const dx = (b.x - a.x) / volume.radius, dy = (b.y - a.y) / volume.height, dz = (b.z - a.z) / volume.radius;
      const length = dx * dx + dy * dy + dz * dz;
      if (!screen.clip?.[screen.banks?.[bank + 2] ?? -1]) {
        const t = clamp(-(ax * dx + ay * dy + az * dz) / (length || 1));
        if ((ax + t * dx) ** 2 + (ay + t * dy) ** 2 + (az + t * dz) ** 2 < 1) return true;
        continue;
      }
      const bq = ax * dx + ay * dy + az * dz, cq = ax * ax + ay * ay + az * az - 1, disc = bq * bq - length * cq;
      if (!(length > 0) || disc <= 0) continue;
      const root = Math.sqrt(disc), t0 = Math.max(0, (-bq - root) / length), t1 = Math.min(1, (-bq + root) / length);
      for (let s = 0; s <= 8 && t0 <= t1; s++) {
        const t = t0 + (t1 - t0) * s / 8;
        const px = a.x + (b.x - a.x) * t - volume.x, pz = a.z + (b.z - a.z) * t - volume.z, eta = (a.y + (b.y - a.y) * t - volume.y) / volume.height;
        if (eta * eta >= 1) continue;
        const rho = Math.hypot(px, pz);
        if (rho < 1e-6 || rho < smokeReach(screen, bank, volume, px / rho, pz / rho) * Math.sqrt(1 - eta * eta)) return true;
      }
    }
  }
  return false;
}

// real screens: tanks launch their smoke at various places and headings; half the banks walled (decimetres per bearing)
const screens = [];
for (let i = 0; i < 12; i++) {
  const tank = { id: `t${i}`, team: 'alpha', spec: { id: 'm1a1_abrams_hc', dims: { heightM: 2.8 }, armor: { turretPivot: [0, 1.4, 0] } },
    state: { pos: { x: between(-300, 300), y: 0, z: between(-300, 300) }, yaw: between(0, Math.PI * 2), turretYaw: between(-1, 1), visualPitch: 0, visualRoll: 0 },
    combat: { destroyed: false, reload: { t: 4 }, ammo: [7, 8, 9] } };
  tank.state.pos.y = ground(tank.state.pos.x, tank.state.pos.z);
  assert.equal(requestAuxiliary(tank, 'smoke', i * 0.7, ground), true, `tank ${i} launches its smoke`);
  const screen = tank.combat.auxiliary.smoke;
  if (i % 2) screen.clip = screen.canisters.map((_, index) => (screen.banks.includes(index) ? Array.from({ length: 12 }, () => Math.round(between(8, 160))) : 0));
  screens.push(screen);
}
assert.ok(screens.some((screen) => screen.clip) && screens.some((screen) => !screen.clip), 'open and walled banks both covered');

let blocked = 0, lines = 0, fastLookups = 0, referenceLookups = 0;
for (const now of [0.3, 1.5, 3, 6, 10, 14, 17.5, 19]) {
  for (let n = 0; n < 1500; n++) {
    // lines near a screen (most), and long ones across the field
    const near = screens[Math.floor(random() * screens.length)];
    const centre = n % 3 ? { x: near.x, z: near.z } : { x: between(-300, 300), z: between(-300, 300) };
    const span = n % 5 === 0 ? 400 : 40;
    const a = { x: centre.x + between(-span, span), y: ground(centre.x, centre.z) + between(-2, 8), z: centre.z + between(-span, span) };
    const b = { x: centre.x + between(-span, span), y: ground(centre.x, centre.z) + between(-2, 8), z: centre.z + between(-span, span) };
    lookups = 0;
    const expected = referenceBlocks(screens, a, b, now, ground);
    referenceLookups += lookups;
    lookups = 0;
    const got = smokeBlocks(screens, a, b, now, ground);
    fastLookups += lookups;
    assert.equal(got, expected, `the same answer at ${now} s for ${JSON.stringify({ a, b })}`);
    // without a ground function too (the presentation's call)
    assert.equal(smokeBlocks(screens, a, b, now), referenceBlocks(screens, a, b, now), 'the same answer without a ground');
    lines++;
    if (expected) blocked++;
  }
}
assert.ok(blocked > lines * 0.05 && blocked < lines * 0.95, `both answers well represented (${blocked} of ${lines} blocked)`);
assert.ok(fastLookups < referenceLookups * 0.5, `ground lookups ${fastLookups} against ${referenceLookups} before`);
console.log(`smokeBlocksExact.selftest: ${lines} lines over ${screens.length} launched screens (open and walled) at 8 ages: identical answers (${blocked} blocked), ground lookups ${fastLookups} vs ${referenceLookups} (${(100 * fastLookups / referenceLookups).toFixed(1)} %)`);
