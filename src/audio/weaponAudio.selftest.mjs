import assert from 'node:assert/strict';
import {
  FLEET_ROWS, LAUNCH_ASSET, WEAPON_CLASSES, WEAPON_ROWS, brakeGainDb, eventMount, isLaunchProfile, loaderFor, missileLaunchFor,
  mountForRound, readyRackDoor, reloadAssets, resolveReloadCuePlan, resolveWeaponReport, stationMount, weaponKeyFor, weaponMounts,
  weaponReportAssets,
} from './weaponAudio.ts';

// The fleet's guns as their specs write them (names, calibres and groups are the specs' own).
const T90 = { caliberMm: 125, shells: [{ name: '3BM60 Svinets-2', type: 'APFSDS', caliberMm: 125 }, { name: '3OF82 HE-Frag', type: 'HE', caliberMm: 125 }] };
const LEO2 = { caliberMm: 120, shells: [{ name: 'DM53 APFSDS', type: 'APFSDS', caliberMm: 120 }, { name: 'DM11 HE-ABM', type: 'HE', caliberMm: 120 }] };
const CR2 = { caliberMm: 120, shells: [{ name: 'L27A1 CHARM-3', type: 'APFSDS', caliberMm: 120 }, { name: 'L31A7 HESH', type: 'HE', caliberMm: 120 }] };
const CENTURION3 = { caliberMm: 84, shells: [{ name: 'L23A1 APFSDS', type: 'APFSDS', caliberMm: 120 }, { name: 'L31A7 HESH', type: 'HE', caliberMm: 120 }] };
const AVRE = { caliberMm: 165, shells: [{ name: 'L37 HESH', type: 'HE', caliberMm: 165 }] };
const KV2 = { caliberMm: 152, shells: [{ name: 'OF-530 HE', type: 'HE', caliberMm: 152 }, { name: 'BR-540 APHE', type: 'AP', caliberMm: 152 }] };
const M551A1 = { caliberMm: 152, shells: [{ name: 'MGM-51E TTS Shillelagh ATGM', type: 'HEAT', caliberMm: 152, guided: true, soundProfile: 'shillelagh-launch' },
  { name: 'M409A1 TTS HEAT-MP', type: 'HEAT', caliberMm: 152 }] };
const BMP3 = { caliberMm: 30, soundProfile: '2a72', shells: [{ name: '3UBR11 APFSDS-T', type: 'APFSDS', caliberMm: 30 },
  { name: '9M117M1 Arkan', type: 'HEAT', caliberMm: 100, guided: true, soundProfile: 'arkan-launch', reloadGroup: '2a70' },
  { name: '3UOF19 HE-FRAG', type: 'HE', caliberMm: 100, soundProfile: 'bmp3-100mm', reloadGroup: '2a70' }] };
const BRADLEY = { caliberMm: 25, soundProfile: 'm242-bushmaster', shells: [{ name: 'M919 APFSDS-T', type: 'APFSDS', caliberMm: 25 },
  { name: 'BGM-71 TOW-2A', type: 'HEAT', caliberMm: 152, guided: true, soundProfile: 'tow-launch' }, { name: 'M792 HEI-T', type: 'HE', caliberMm: 25 }] };
const TOS = { caliberMm: 220, soundProfile: 'konkurs-launch', shells: [{ name: '220 mm Salvo HE', type: 'HE', caliberMm: 220, soundProfile: 'konkurs-launch' }] };
const M1A3 = { caliberMm: 120, shells: [{ name: 'M829A4 APFSDS', type: 'APFSDS', caliberMm: 120 },
  { name: 'XM1210 MRM-H Hypersonic GATGM', type: 'HEAT', caliberMm: 120, guided: true, soundProfile: 'spike-launch' }] };

// The key is the bore and the construction its rounds imply, from the spec alone.
const mainKey = (gun) => weaponMounts(gun).at(-1).key;
assert.equal(mainKey(T90), '125/two_piece', 'the 2A46 fires two-piece rounds');
assert.equal(mainKey(LEO2), '120/combustible', 'the Rh-120 fires combustible cases');
assert.equal(mainKey(CR2), '120/separate_bag', 'the L30 is a BL gun: projectile, bag charge, vent tube');
assert.equal(mainKey(CENTURION3), '84/unitary_brass', 'the 20-pounder is heard as its own gun, not by the 120 mm its rounds are sized at');
assert.equal(mainKey(AVRE), '165/separate_bag', 'the L9 demolition gun');
assert.equal(mainKey(KV2), '152/separate_case', 'the KV-2 howitzer: projectile, then a cased charge');
assert.equal(mainKey(M551A1), '152/caseless', 'a gun that fires a gun-launched missile is a gun-launcher with caseless rounds');
assert.equal(mainKey(TOS), '220/rocket');
assert.equal(weaponKeyFor(null, [{ caliberMm: 140, name: 'x' }], 140), '140/combustible', 'a new bore yields a key the table has no row for');
assert.equal(stationMount(7.92).key, '7.62/belt', 'a rifle-calibre roof gun');
assert.equal(stationMount(12.7).key, '12.7/belt');
assert.equal(stationMount(30).key, '30/belt', 'a roof 30 mm is an autocannon');

// Mounts: a secondary group, a gun-launched missile through it, a launcher beside the gun.
const bmp3 = weaponMounts(BMP3);
assert.deepEqual(bmp3.map((m) => m.key).sort(), ['100lp/unitary_brass', '30/belt', 'guided/missile'].sort());
const arkan = mountForRound(bmp3, '9M117M1 Arkan');
assert.ok(arkan.throughGun && arkan.loadRow.key === '100lp/unitary_brass', 'the Arkan leaves through the 2A70 and loads as its rounds');
assert.equal(mountForRound(bmp3, '3UOF19 HE-FRAG').key, '100lp/unitary_brass', "the 2A70's own low-pressure report");
assert.equal(mountForRound(bmp3, '3UBR11 APFSDS-T').key, '30/belt');
const tow = mountForRound(weaponMounts(BRADLEY), 'BGM-71 TOW-2A');
assert.ok(tow.key === 'guided/missile' && !tow.throughGun && loaderFor('m2a2_bradley', tow) === 'launcher', 'a TOW is reloaded on its launcher');
assert.equal(loaderFor('m2a2_bradley', mountForRound(weaponMounts(BRADLEY), 'M919 APFSDS-T')), 'autocannon');
const mrm = mountForRound(weaponMounts(M1A3), 'XM1210 MRM-H Hypersonic GATGM');
assert.ok(mrm.throughGun && loaderFor('m1a3', mrm) === 'bustle', 'the MRM goes in through the M1A3 bustle loader');

// Loaders by make, from the layout (the census's projection).
const main = (gun) => weaponMounts(gun).at(-1);
assert.equal(loaderFor('t90am', main(T90)), 'carousel_az');
assert.equal(loaderFor('t80u', main(T90)), 'basket_mz');
assert.equal(loaderFor('t14_armata', main(T90)), 'carousel_unmanned');
assert.equal(loaderFor('leclerc_s2', main(LEO2)), 'bustle');
assert.equal(loaderFor('leo2a4', main(LEO2)), 'manual');
assert.equal(loaderFor('strv103b', main({ caliberMm: 105, shells: [{ name: '10,5 cm kan Strv 103 L/74B APDS', caliberMm: 105 }] })), 'fixed_ram');
assert.ok(readyRackDoor('m1a1') && readyRackDoor('leo2a4') && !readyRackDoor('t55a') && !readyRackDoor('challenger2'), 'bustle racks open behind a door; hull bins do not');

// Every row's report assets, and the rows the census lists are the table's.
for (const row of Object.values(WEAPON_ROWS)) {
  assert.ok(row.close && row.far, `${row.key} has close and distant reports`);
  assert.ok(row.closeFadeM[0] < row.closeFadeM[1] && row.farFadeM[0] < row.farFadeM[1], `${row.key} fades ordered`);
  assert.ok(row.farFadeM[0] <= row.closeFadeM[1], `${row.key}: the distant report arrives before the close one leaves`);
  if (row.family === 'cannon' && !row.key.startsWith('ac130')) assert.ok(row.own && row.interior, `${row.key}: our own and the closed turret's reports`);
}
assert.equal(Object.keys(FLEET_ROWS).length >= 25, true, 'the census keys every weapon the fleet fires');

// Loudness and reach grow with the high-velocity guns' bore; the low-pressure and short guns sit under their peers.
const ladder = ['20/belt', '25/belt', '30/belt', '35/belt', '40/belt', '50/belt', '76/unitary_brass', '84/unitary_brass', '90/unitary_brass',
  '100/unitary_brass', '105/unitary_brass', '120/combustible', '125/two_piece', '130/combustible', '170/separate_case'];
for (let i = 1; i < ladder.length; i++) {
  const a = WEAPON_ROWS[ladder[i - 1]], b = WEAPON_ROWS[ladder[i]];
  assert.ok(b.loudDb >= a.loudDb, `${b.key} at least as loud as ${a.key}`);
  assert.ok(b.farFadeM[1] >= a.farFadeM[1], `${b.key} carries at least as far as ${a.key}`);
  assert.ok(b.tailRate <= a.tailRate, `${b.key} tail no higher than ${a.key}`);
}
assert.ok(WEAPON_ROWS['100lp/unitary_brass'].loudDb < WEAPON_ROWS['100/unitary_brass'].loudDb, 'the low-pressure 2A70 is softer than a 100 mm tank gun');
assert.ok(WEAPON_ROWS['152/caseless'].loudDb < WEAPON_ROWS['170/separate_case'].loudDb, 'a short gun-launcher under the long 17 cm gun');

// Reports: the row's banks, a launch by its family, trims by weapon.
assert.equal(weaponReportAssets(main(LEO2), null).close, 'gun_120_close');
assert.equal(weaponReportAssets(main(CR2), null).close, 'gun_120r_close', 'the rifled 120 mm has its own report');
assert.equal(weaponReportAssets(main(CENTURION3), null).own, 'gun_84_own');
assert.equal(weaponReportAssets(main(T90), null).interior, 'gun_125_interior');
assert.equal(weaponReportAssets(tow, 'tow-launch', 'BGM-71 TOW-2A').close, LAUNCH_ASSET.tube);
assert.equal(weaponReportAssets(eventMount(152, 'spike-launch', 'Spike ER2'), 'spike-launch', 'Spike ER2').close, LAUNCH_ASSET.soft);
assert.equal(eventMount(140, 'konkurs-launch').key, 'guided/missile', 'a launch profile is a launcher');
assert.equal(eventMount(220, 'konkurs-launch').key, '220/rocket', 'the TOS-1A salvo');
assert.equal(eventMount(30, 'gunship-autocannon').key, 'ac130-30/belt', "the AC-130's guns are their own rows");
assert.equal(eventMount(152, 'gunship-howitzer').key, 'ac130-105/unitary_brass');
assert.equal(resolveWeaponReport(eventMount(30, 'twin-2a42'), 'twin-2a42').twin, true);
assert.equal(resolveWeaponReport(eventMount(57, null), null), null, 'a key with no row is silent, never another bank');
assert.equal(missileLaunchFor('Spike LR2', 'spike-launch'), 'soft');
assert.equal(missileLaunchFor('MGM-51C Shillelagh ATGM', null), 'gun');
assert.ok(isLaunchProfile('tow-launch') && !isLaunchProfile('2a42'));
assert.ok(WEAPON_CLASSES.gun_84 && WEAPON_CLASSES.gun_120 && WEAPON_CLASSES.atgm, 'the field manual draws a bar per bore');

// The muzzle brake: an open muzzle is loudest ahead of the gun, a brake beside and behind it.
assert.ok(brakeGainDb('none', 0) > brakeGainDb('none', Math.PI), 'no brake: the blast goes forward');
assert.ok(brakeGainDb('double_baffle', Math.PI / 2) > brakeGainDb('none', Math.PI / 2) + 2, 'a double-baffle brake throws its blast sideways');
assert.ok(brakeGainDb('deflector', Math.PI) > brakeGainDb('none', Math.PI), 'and back towards the crew');

// Reload choreography by construction and loader.
const types = (plan) => plan.cues.map((c) => c.type);
const assets = (plan) => plan.cues.map((c) => c.asset);
assert.equal(resolveReloadCuePlan(0.3, 'shell', eventMount(30, '2a42'), 'autocannon').profile, 'rapid', 'an autocannon cycle is its own action');
assert.equal(resolveReloadCuePlan(0.75, 'shell', eventMount(30, 'rarden-l21a1'), 'autocannon').profile, 'rapid', 'even a slow Rarden');
const leoPlan = resolveReloadCuePlan(6, 'shell', main(LEO2), 'manual', { rackDoor: true });
assert.deepEqual(types(leoPlan), ['breechOpen', 'stubEject', 'ammoDoorOpen', 'shellGrab', 'ammoDoorClose', 'ram', 'breechClose'],
  `a combustible case leaves only its stub; the loader opens the bustle door (${types(leoPlan)})`);
const m60Plan = resolveReloadCuePlan(6.8, 'shell', main({ caliberMm: 105, shells: [{ name: 'DM63 (105) APFSDS', caliberMm: 105 }] }), 'manual');
assert.ok(assets(m60Plan).includes('case_eject_brass') && !types(m60Plan).includes('ammoDoorOpen'), 'a 105 mm brass case clangs out; hull racks have no door');
assert.ok(assets(resolveReloadCuePlan(4.6, 'shell', main({ caliberMm: 76, shells: [{ name: 'M352 HE-T', caliberMm: 76 }] }), 'manual')).includes('case_eject_brass_light'),
  'a 76 mm case is lighter');
const cr2Plan = resolveReloadCuePlan(6.8, 'shell', main(CR2), 'manual');
assert.deepEqual(types(cr2Plan), ['breechOpen', 'ventEject', 'shellGrab', 'ram', 'bagCharge', 'breechClose', 'ventLoad'],
  `the L30: vent tube out, projectile, bag charge, breech, a fresh vent tube (${types(cr2Plan)})`);
assert.ok(!types(resolveReloadCuePlan(20, 'shell', main(AVRE), 'manual')).includes('bagCharge'), "the L9's charge rides in the projectile's base");
const kvPlan = resolveReloadCuePlan(20.5, 'shell', main(KV2), 'manual');
assert.ok(['caseEject', 'shellGrab', 'ram', 'caseCharge'].every((t) => types(kvPlan).includes(t)), `the howitzer: projectile then cased charge (${types(kvPlan)})`);
assert.ok(assets(kvPlan).includes('case_eject_brass_heavy') && assets(kvPlan).includes('shell_grab_superheavy') && assets(kvPlan).includes('breech_close_heavy'),
  `the 152 mm handled as the superheavy it is (${assets(kvPlan)})`);
assert.equal(types(resolveReloadCuePlan(8.6, 'shell', main(M551A1), 'manual'))[0], 'scavenge', 'the gun-launcher purges its bore');
const az = resolveReloadCuePlan(7, 'shell', main(T90), 'carousel_az');
assert.deepEqual(types(az), ['stubPort', 'carouselTurn', 'cassetteLift', 'chainRam', 'chargeChainRam', 'breechClose'],
  `the AZ carousel: the stub out through its hatch, projectile then charge (${types(az)})`);
assert.equal(types(resolveReloadCuePlan(7, 'shell', main(T90), 'basket_mz'))[0], 'stubCatch', 'the MZ basket keeps its stub');
assert.equal(types(resolveReloadCuePlan(6.5, 'shell', main(T90), 'basket_mz'))[1], 'basketTurn');
const bustle = resolveReloadCuePlan(5.2, 'shell', main(LEO2), 'bustle');
assert.deepEqual(types(bustle), ['stubEject', 'bustleIndex', 'bustleRam', 'breechClose']);
assert.equal(types(resolveReloadCuePlan(5.4, 'shell', main({ caliberMm: 105, shells: [{ name: 'x', caliberMm: 105 }] }), 'fixed_ram'))[0], 'caseOutside',
  "the Strv 103 throws its case out of the hull's rear");
const magazine = resolveReloadCuePlan(9, 'magazine', main(LEO2), 'bustle', { magazineRounds: 3 });
assert.equal(types(magazine).filter((t) => t === 'shellGrab').length, 3, 'a bustle magazine is refilled round by round');
assert.equal(resolveReloadCuePlan(2.2, 'intraClip', main(LEO2), 'bustle').profile, 'intraClip');
const towPlan = resolveReloadCuePlan(10, 'shell', tow, 'launcher');
assert.deepEqual(types(towPlan), ['hatchOpen', 'canisterLift', 'tubeLoad', 'launcherRaise', 'latch'], 'a roof launcher is reloaded through the hatch');
assert.deepEqual(types(resolveReloadCuePlan(8, 'shell', arkan, 'ifv_autoloader')), ['breechOpen', 'missileRound', 'breechClose'], 'a 9M117 is loaded by hand');
assert.deepEqual(types(resolveReloadCuePlan(48, 'magazine', mountForRound(weaponMounts(TOS), '220 mm Salvo HE'), 'rocket_rack')).filter((t) => t === 'rocketLoad').length, 3);
const gunshipPlan = resolveReloadCuePlan(3.5, 'shell', eventMount(152, 'gunship-howitzer'), loaderFor(null, eventMount(152, 'gunship-howitzer')));
assert.deepEqual(types(gunshipPlan), ['breechOpen', 'gunshipLoad', 'breechClose'], 'the AC-130 howitzer is loaded by hand');
for (const plan of [leoPlan, m60Plan, cr2Plan, kvPlan, az, bustle, magazine, towPlan]) {
  for (let i = 1; i < plan.cues.length; i++) assert.ok(plan.cues[i].at > plan.cues[i - 1].at, `cues in order (${types(plan)})`);
  assert.ok(plan.cues.every((c) => c.at >= 0 && c.at < 0.99), 'inside the cycle');
}

// The reload lines up with the real reload time: the breech closes a fixed time before the cycle ends, the case is thrown
// a fixed time after it starts, a heavier round's work takes longer.
for (const total of [4, 6, 9, 14]) {
  const plan = resolveReloadCuePlan(total, 'shell', main(LEO2), 'manual');
  const close = plan.cues.find((c) => c.type === 'breechClose').at;
  assert.ok(Math.abs((1 - close) * total - 0.22 * 1.1) < 0.05, `the breech closes ~0.24 s before ready on a ${total} s cycle`);
  const stub = plan.cues.find((c) => c.type === 'stubEject').at;
  assert.ok(Math.abs(stub * total - 0.35 * 1.1) < 0.05, `the stub drops ~0.39 s after the shot on a ${total} s cycle`);
}
const before = (plan, type) => (1 - plan.cues.find((c) => c.type === type).at) * 20;
assert.ok(before(resolveReloadCuePlan(20, 'shell', main(KV2), 'manual'), 'ram') > before(resolveReloadCuePlan(20, 'shell', main(LEO2), 'manual'), 'ram'),
  'a 152 mm projectile is rammed earlier: its charge follows');

// Every asset a plan can play is in the hull's warm.
assert.ok(reloadAssets(main(CR2), 'manual').includes('bag_charge_load') && reloadAssets(main(CR2), 'manual').includes('latch_ready'));

console.log(`weaponAudio.selftest: ${Object.keys(WEAPON_ROWS).length} rows (bore/construction), keys from the specs, the brake, `
  + `and the choreography of every construction and loader make passed`);
