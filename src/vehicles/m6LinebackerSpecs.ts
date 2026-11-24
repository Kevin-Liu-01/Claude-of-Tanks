// Kevin B. Liu — game modernization concept using the historical M6 weapon layout.
import {TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries, cloneFleetVariant, registerFleetSpecs} from './fleetSpecRegistry.ts';
import {modernArmor, crewBox, shell, plate} from './specHelpers.ts';
import {applyAirDefenseFirepower} from './airDefenseFirepower.ts';
import {LINEBACKER_TURRET_SCALE as T, LINEBACKER_RING, LINEBACKER_GUN, LINEBACKER_MUZZLE, LINEBACKER_MOUTHS, LINEBACKER_ROTARY,
  LINEBACKER_SKIRT_STATIONS, LINEBACKER_SKIRT_OUTER} from './m6LinebackerLayout.ts';

const spec = cloneFleetVariant(TANK_SPECS, 'm6_linebacker', 'm3a3_bradley', {
  name: 'M6 Linebacker', nation: 'USA', era: 'modern', role: 'ifv',
});
delete spec.label; delete spec.roster; delete spec.publicVisualFallback; delete spec.variantOf;
delete spec.balancePeerOf;
Object.assign(spec, {hp: 2400, enginePowerHp: 800, weightTons: 39.5,
  topSpeedKmh: 60, reverseSpeedKmh: 22, hullTraverseDegS: 42,
  turretTraverseDegS: 65, gunPitchDegS: 50, gunElevationDeg: 45, gunDepressionDeg: 9});
// The cannon clears the rear stowage at these traverse-dependent stops. Keep
// full depression over the front; use the shared simulation/gallery policy so
// rearward aiming cannot drive the recoiling barrel through the deck equipment.
// 2026-10-20 follow-up (tools/gun-depression-sweep.mjs, nationalGunClearance.selftest.mjs): the stowage at 123-163 held
// the M242's long tube higher than these stations did (-4.5 at 141-144).
// 276: re-swept for the GAU-12 (gun-depression-sweep.mjs --ids=m6_linebacker, keep 26 mm): the rotor's 1.85 m reach clears
// the 123-153 stowage at full depression, while its clamps (0.17 m across, the M242's tube 0.07) meet the rear deck from
// 156 degrees, held at -5.8 there.
spec.gunPitchByYawDeg = Object.freeze([
  [0, -9], [144, -9], [147, -8.9], [148, -9], [153, -9], [156, -8], [158, -6.4], [159, -6], [160, -5.8], [174, -5.8],
  [180, -5.9],
] as const);
spec.dims = {hullLengthM: 6.71, overallLengthM: 6.71, widthM: 4.12, heightM: LINEBACKER_RING[1] + (3.75-LINEBACKER_RING[1])*T};
// Penetration and damage are game balance, not claims about Stinger armor performance.
// The blast-fragmentation missile is deliberately not the donor's HEAT/TOW round.
// 276 (Kevin 2026-11-23: "make the m6 linebackers gun a minigun so its an evolution from the m163"): the 25 mm GAU-12/U
// Equalizer, the Vulcan family's five-barrel successor, on the M163's rotary path (sim/fireCycleFloor.ts). As authored, the
// LAV-AD's 1,800 rounds a minute in 40-round bursts and a 4 s burst-limiter reset; the air-defence rule below runs it at
// one round a tick in 200-round bursts (3.3 s of fire) with a 2 s reset. Each round outweighs the M163's 20 mm (PGU-20/U
// API 9.2 a round against the M53's 7.4; pen 125/108/90 against 90/72/55), while the shorter bursts hold the sustained
// output where the M242 had it (~20,800 a minute against 20,400) and the API, not the M242's M919 APFSDS (190/175/160),
// keeps it an air-defence gun rather than a tank killer. Each round flies 3 s (~3.3 km), as the Vulcan's do, so a burst
// into the sky keeps a bounded number in flight (m163Specs.ts ROUND_FLIGHT_S).
const ROUND_FLIGHT_S = 3;
spec.gun = {...spec.gun, caliberMm: 25, reloadS: 4.0, baseAccuracy: .24, aimTimeS: 1,
  soundProfile: 'gau-12', muzzleBoreSegments: 24,
  autoloader: {magazineSize: 40, intraClipS: 1 / 30, fullReloadS: 4.0, rotary: true},
  launcherMuzzles: LINEBACKER_MOUTHS.map(m => ({x:m.x*T,y:m.y*T,z:m.z*T})), shells: [
    shell('PGU-20/U API', 'AP', 25, 125, 108, 23, 1100, {pen2000Mm: 90, reloadS: 1 / 30, count: 600, maxLifetimeS: ROUND_FLIGHT_S}),
    shell('FIM-92 Stinger', 'HE', 70, 18, 18, 340, 750,
      {pen2000Mm: 18, reloadS: 3.0, count: 12, guided: true, launcherTubes: 4, soundProfile: 'tow-launch'}),
    shell('PGU-25/U HEI', 'HE', 25, 8, 8, 25, 1100, {pen2000Mm: 8, reloadS: 1 / 30, count: 1200, maxLifetimeS: ROUND_FLIGHT_S}),
  ]};
for (const key of ['launcherSalvo','muzzles','fixedLaunchCanisters','primaryGuided'] as const) delete spec.gun[key];
// 268: the shared hull measured from the owner's source (modern3.ts BRADLEY_HULL): hw 1.64 -> 1.70, trkTop .95 -> 1.16,
// roofY 1.90 -> 2.06; the ring follows LINEBACKER_RING (m6LinebackerLayout.ts).
const armor = modernArmor({hl: 3.27, hw: 1.70, inW: .95, floor: .45, trkTop: 1.16, roofY: 2.06,
  turretPivot: LINEBACKER_RING, gunPivot: LINEBACKER_GUN, barrelLenM: LINEBACKER_MUZZLE, barrelRadM: LINEBACKER_ROTARY.muzzleClampR,
  glacis: [45,70,80], lower: [45,60,60], side: [35,40,45], skirt: null, rear: 25, roof: 20,
  tw: 1.10, tFrontZ: 1.06, tRearZ: -1.48, tH: .90,
  cheek: [65,105,140], tSide: [45,65,90], tRear: 30, tRoof: 25, mantlet: [70,110,150], loader: false});
// Keep the Bradley chassis armor; this build has passive skirts/cages, not
// the M3A3's reactive glacis and side arrays. Do not inherit their damage zones.
armor.hullPlates = structuredClone(spec.armor.hullPlates.filter(p => p.kind !== 'era'));
armor.crew = [crewBox('driver',[-1.15,.75,1.23],[-.50,1.70,2.25]),
  crewBox('gunner',[.20,.08,-.32],[.87,.73,.38],true),
  crewBox('commander',[-.86,.08,-1.03],[-.17,.78,-.32],true)];
for (const side of [-1, 1]) for (let i = 0; i < LINEBACKER_SKIRT_STATIONS.length - 1; i++) {
  const [a, loA, hiA] = LINEBACKER_SKIRT_STATIONS[i];
  const [b, loB, hiB] = LINEBACKER_SKIRT_STATIONS[i + 1];
  const x = side * LINEBACKER_SKIRT_OUTER;
  const points: [number,number,number][] = [[x,loA,a],[x,loB,b],[x,hiB,b],[x,hiA,a]];
  if (side > 0) points.reverse();
  const p = plate(`linebacker_skirt_${side}_${i}`, 22, points[0], points[1], points[3], {kind:'spaced', keMm:40, ceMm:80});
  p.verts = points; p.convexPolygon = true;
  armor.hullPlates.push(p);
}
// Keep the chassis, armor thickness and weapon capabilities unchanged; only
// turret-local geometry, firing datums and contained boxes follow the resize.
armor.gunPivot = LINEBACKER_GUN.map(v => v*T) as [number,number,number];
armor.gunBarrel.lengthM *= T;
armor.gunBarrel.radiusM *= T;
for (const p of armor.turretPlates) p.verts = p.verts.map(v => v.map(n => n*T) as [number,number,number]);
for (const b of [...armor.modules,...armor.crew]) if (b.turretLocal) {
  b.min = b.min.map(n => n*T) as [number,number,number];
  b.max = b.max.map(n => n*T) as [number,number,number];
}
spec.armor = armor;
spec.visual = {...spec.visual, scheme:'nato', base:'#82734f', weather:'#9e8a60',
  patches:['#3f4a35','#3b3830'], number:'LB-06', trackWidthM:.53, camoScale:.62};
// The owner's air-defence firepower (2026-11-06, airDefenseFirepower.ts): the GAU-12 at the rotary floor (one round a tick) in
// bursts five times the authored, twice its output and six times its rounds; three loads of Stingers, the four-tube rack
// firing all four a launch, 0.15 s apart, reloading in 6 s.
applyAirDefenseFirepower(spec, {rounds: 4, intervalS: .15});
registerFleetSpecs(bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS), ['m6_linebacker'], {m6_linebacker:spec});
