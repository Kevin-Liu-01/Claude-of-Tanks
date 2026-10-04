import assert from 'node:assert/strict';
import { WEAPON_CLASSES, resolveReloadCuePlan, resolveWeaponReport, weaponClassForCaliber } from './weaponAudio.ts';

// Bore classes across the fleet's calibres.
const bores = [
  [7.62, 'mg_rifle'], [12.7, 'mg_heavy'], [20, 'ac_20'], [25, 'ac_25'], [30, 'ac_30'], [35, 'ac_40'], [40, 'ac_40'],
  [50, 'ac_50'], [57, 'ac_50'], [84, 'gun_90'], [90, 'gun_90'], [100, 'gun_105'], [105, 'gun_105'], [120, 'gun_120'],
  [125, 'gun_125'], [130, 'gun_130'], [140, 'gun_130'], [152, 'gun_152'], [170, 'gun_152'], [220, 'rocket_heavy'],
];
for (const [mm, id] of bores) assert.equal(weaponClassForCaliber(mm), id, `${mm} mm → ${id}`);

// Loudness grows with the bore inside each family; reports reach further.
const order = ['ac_20', 'ac_25', 'ac_30', 'ac_40', 'ac_50', 'gun_90', 'gun_105', 'gun_120', 'gun_125', 'gun_130', 'gun_152'];
for (let i = 1; i < order.length; i++) {
  const a = WEAPON_CLASSES[order[i - 1]], b = WEAPON_CLASSES[order[i]];
  assert.ok(b.loudDb >= a.loudDb, `${b.id} at least as loud as ${a.id}`);
  assert.ok(b.farFadeM[1] >= a.farFadeM[1], `${b.id} carries at least as far`);
  assert.ok(b.tailRate <= a.tailRate, `${b.id} tail no higher than ${a.id}`);
}
for (const cls of Object.values(WEAPON_CLASSES)) {
  assert.ok(cls.closeFadeM[0] < cls.closeFadeM[1] && cls.farFadeM[0] < cls.farFadeM[1], `${cls.id} fades ordered`);
  assert.ok(cls.farFadeM[0] <= cls.closeFadeM[1], `${cls.id}: the distant report arrives before the close one leaves`);
}

// A report id trims but never overrides the bore (the 57 mm row carries an older 30 mm id).
const kurganets = resolveWeaponReport(57, 'mk30-2');
assert.equal(kurganets.cls.id, 'ac_50');
assert.ok(kurganets.rate < 1);
assert.equal(resolveWeaponReport(30, 'twin-2a42').twin, true);
assert.equal(resolveWeaponReport(140, 'konkurs-launch').cls.id, 'atgm', 'launchers are their own class');
assert.equal(resolveWeaponReport(220, 'konkurs-launch').cls.id, 'rocket_heavy', 'TOS-1A salvo');
assert.equal(resolveWeaponReport(120, null).cls.id, 'gun_120');
assert.equal(resolveWeaponReport(100, 'bmp3-100mm').gainDb < 0, true, 'the low-pressure 2A70 is softer');

// Reload choreography.
assert.equal(resolveReloadCuePlan(0.3, 'shell', 30).profile, 'rapid', 'per-shot autocannon cycles have no cues');
const manual = resolveReloadCuePlan(6, 'shell', 120, 'manual');
assert.deepEqual(manual.cues.map((c) => c.type), ['breechOpen', 'caseEject', 'ammoDoorOpen', 'shellGrab', 'ammoDoorClose', 'ram', 'breechClose'],
  'the loader opens the ready-rack door, takes a round, shuts it and rams');
const heavy = resolveReloadCuePlan(20, 'shell', 152, 'manual');
assert.ok(heavy.cues.some((c) => c.type === 'chargeRam'), 'separate-loading rounds ram a charge');
const carousel = resolveReloadCuePlan(7, 'shell', 125, 'carousel');
assert.deepEqual(carousel.cues.map((c) => c.type), ['stubEject', 'carouselTurn', 'cassetteLift', 'chainRam', 'chainRam', 'breechClose']);
const bustle = resolveReloadCuePlan(5, 'shell', 120, 'bustle');
assert.ok(bustle.cues.some((c) => c.type === 'bustleIndex'));
const drum = resolveReloadCuePlan(6, 'magazine', 120);
assert.equal(drum.profile, 'magazine');
assert.equal(drum.cues.filter((c) => c.type === 'drumLoad').length, 4, 'a drum refill feeds its rounds in one by one');
assert.deepEqual([drum.cues[0].type, drum.cues.at(-1).type], ['drumRotate', 'breechClose']);
assert.equal(resolveReloadCuePlan(2.5, 'intraClip', 120).profile, 'intraClip');
assert.equal(resolveReloadCuePlan(4, 'shell', 30, 'autocannon').profile, 'autocannon');
const missile = resolveReloadCuePlan(14, 'shell', 140, 'missile');
assert.equal(missile.profile, 'missile');
assert.ok(missile.cues.some((c) => c.type === 'launcherRaise'), 'the launcher arm comes up before the latch');
for (const plan of [manual, heavy, carousel, bustle, drum]) {
  for (let i = 1; i < plan.cues.length; i++) assert.ok(plan.cues[i].at >= plan.cues[i - 1].at, `${plan.profile} cues are ordered`);
  assert.ok(plan.cues.every((c) => c.at >= 0 && c.at <= 1), `${plan.profile} cues lie inside the cycle`);
  assert.equal(plan.cues.at(-1).type, 'breechClose', `${plan.profile} ends on the breech`);
}
// The breech closes ~0.22 s before "loaded" however long the cycle is.
for (const total of [4, 8, 16]) {
  const close = resolveReloadCuePlan(total, 'shell', 120, 'manual').cues.at(-1).at;
  assert.ok(Math.abs((1 - close) * total - 0.22) < 0.05 || close === 0.86, `breech timing at ${total} s`);
}

console.log(`weaponAudio.selftest: ${bores.length} bores, class ordering, report trims and reload choreography passed`);
