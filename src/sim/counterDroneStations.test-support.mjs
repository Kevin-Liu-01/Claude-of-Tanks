// VH.15 counter-drone, the station half (guards 229): each roof station's counter-drone numbers, class and world
// elevation reach, the owner's 226 rule per class as literals, the class bands and the named id sets. Plain data and
// arithmetic over the auxiliary inventory and weapon profiles: no authority, no world, no game state, so a receipt that
// needs only these (src/sim/counterDroneEngagement.selftest.mjs) keeps a small module graph its proof can be keyed on.
// The engagements on the authority (pilot runs, hovers, the release check's pins) are counterDroneEngagement.test-support.
import { Quaternion, Vector3 } from 'three';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { roofStationCount } from './auxiliarySystems.ts';

/** The yaw-wise lowest world elevation a station's barrel reaches at its profile's elevationRad: aimAndFire limits the
 * mount's own pitch, and a mount scaled unevenly (gun.scale y against z) carries that pitch to a different world angle. */
const reachDirection = new Vector3(), reachScale = new Vector3(), reachRotation = new Quaternion(), UP = new Vector3(0, 1, 0);
function elevationReachDeg(gun, elevationRad) {
  reachScale.fromArray(gun.scale); reachRotation.fromArray(gun.rotation);
  let reach = Infinity;
  for (let k = 0; k < 72; k++) {
    reachDirection.set(0, Math.sin(elevationRad), Math.cos(elevationRad)).multiply(reachScale)
      .applyAxisAngle(UP, k * Math.PI / 36).applyQuaternion(reachRotation).normalize();
    reach = Math.min(reach, Math.asin(reachDirection.y));
  }
  return reach * 180 / Math.PI;
}

/** The profile numbers that set what a station does to a drone: its reach, its share per round, its cadence, its slew. */
const COUNTER_DRONE_FIELDS = Object.freeze(['counterDroneRangeM', 'droneHitAt100', 'droneHitMax', 'burstRounds', 'shotIntervalS',
  'burstPauseS', 'elevationRad', 'yawRateRadS', 'pitchRateRadS']);
const numbers = (counterDroneRangeM, droneHitAt100, droneHitMax, burstRounds, shotIntervalS, burstPauseS, elevationRad, yawRateRadS,
  pitchRateRadS) => Object.freeze({ counterDroneRangeM, droneHitAt100, droneHitMax, burstRounds, shotIntervalS, burstPauseS, elevationRad,
  yawRateRadS, pitchRateRadS });
/**
 * The owner's rule per profile class, as literals (owner 2026-10-16 on the 226 preview: "i think machine guns targeting
 * drones is a lil too punishinng"; 226: AERIAL_RULES.drone.hitsToDown 1 -> 1.1). `numbers`: the counter-drone numbers
 * every roof station of the class carries at 226 (vehicles/auxiliaryWeapons.ts: the generic profile and each vehicle's
 * cartridge copy of it). `capped`: the rounds a lone station of the class lands before a drone hovering about 33 m off
 * its bow falls (every round at droneHitMax); `survivesBurst`: that drone outlives the station's first capped burst
 * (the owner's rule for a lone 12.7 or 30 mm); `downsInsideBurst`: it falls inside that burst (the owner's rule for a
 * lone 7.62: still lethal at point blank; the Rh 202 does too, measured, unruled).
 * `at100`: the rounds before a drone hovering about 102 m off the bow falls (every round below the cap, droneHitAt100
 * over the range squared), on the class's anchor (another hull of the class reads it or one more: its mount sits
 * nearer or further). At the 226 defect (hitsToDown 1): capped 7 / 5 / 3 / 3, at100 42 / 36 / 17 / 18. They are literals,
 * not the profile's arithmetic: a rule derived from the profile only tests the profile.
 */
export const COUNTER_DRONE_CLASSES = Object.freeze({
  rifle: Object.freeze({ calibreMm: [0, 10], anchor: 'm1a1', numbers: numbers(150, .025, .15, 8, .09, 1.25, .75, 1.7, 1),
    capped: 8, survivesBurst: false, downsInsideBurst: true, at100: 46 }),
  heavy: Object.freeze({ calibreMm: [10, 20], anchor: 't90a_2004', numbers: numbers(200, .03, .2, 5, .12, 1.4, .75, 1.7, 1),
    capped: 6, survivesBurst: true, at100: 38 }), // 39 until 266: the anchor's Kord now rides the source-X T-90A turret
  rh202: Object.freeze({ calibreMm: [20, 20.5], anchor: 'mbt70', numbers: numbers(280, .045, .3, 5, .1, 1.6, .9, 1.4, .9),
    capped: 4, survivesBurst: false, at100: 26 }),
  cannon: Object.freeze({ calibreMm: [20, 100], anchor: 't72b3m_hetman', numbers: numbers(300, .06, .35, 3, .2, 1.8, .75, 1.2, .8),
    capped: 4, survivesBurst: true, at100: 20 }),
});
/** The class the owner's rule holds a station to: its calibre alone (the first class whose range takes it), whatever
 * numbers its profile carries, so a re-tuned profile is still judged by the rule and never by its own arithmetic. */
function counterDroneRuleClass(caliberMm) {
  for (const [name, c] of Object.entries(COUNTER_DRONE_CLASSES)) if (caliberMm >= c.calibreMm[0] && caliberMm < c.calibreMm[1]) return name;
  return null;
}
/** The class whose calibres and numbers a station carries, or null (a station off every class). */
function counterDroneClassOf(caliberMm, profile) {
  for (const [name, c] of Object.entries(COUNTER_DRONE_CLASSES)) {
    if (caliberMm >= c.calibreMm[0] && caliberMm < c.calibreMm[1] && COUNTER_DRONE_FIELDS.every((f) => profile[f] === c.numbers[f])) return name;
  }
  return null;
}

/** A vehicle's roof stations, as the authority steps them (guns[0] first): calibre, counter-drone numbers and class,
 * and the world elevation the barrel reaches against the profile's. */
export function roofStations(specId) {
  const guns = AUXILIARY_INVENTORY[specId]?.guns ?? [];
  return guns.slice(0, roofStationCount({ id: specId })).map((gun) => {
    const p = auxiliaryWeaponProfile(gun.caliberMm, specId);
    return { name: gun.name, caliberMm: gun.caliberMm, ...Object.fromEntries(COUNTER_DRONE_FIELDS.map((f) => [f, p[f]])),
      droneClass: counterDroneClassOf(gun.caliberMm, p), ruleClass: counterDroneRuleClass(gun.caliberMm), profileElevationDeg: p.elevationRad * 180 / Math.PI,
      elevationReachDeg: elevationReachDeg(gun, p.elevationRad) };
  });
}

/** A vehicle's counter-drone class: its station count and, for one station, a machine gun (to 14.5 mm) or a cannon. */
export function stationClass(stations) {
  if (!stations.length) return 'none';
  if (stations.length === 1) return stations[0].caliberMm < 20 ? 'lone-mg' : 'lone-cannon';
  return stations.length === 2 ? 'two-station' : 'multi-station';
}

/**
 * The owner's band per class (2026-10-16 on the 226 preview: "i think machine guns targeting drones is a lil too
 * punishinng"; AERIAL_RULES.drone.hitsToDown 1 -> 1.1): the share of level pilot runs (LEVEL_APPROACHES, flat open
 * ground) whose drone the stations bring down. Anchors at 1.1, seeds 1-20 per approach (60 runs), and at 1 for the
 * defect it closed: lone 7.62 (m1a1) 25.0 % (1: 36.7), lone 12.7 (t90a_2004 18.3, t72b3_qilin 16.7; 1: 26.7), lone 30 mm
 * (t72b3m_hetman, the Zubrs, the Kunlun) 36.7 % (1: 43.3; release 230: the Zubrs' WKM-B emplacements are lone 12.7, 18.3 %), the 30 mm + 7.62 roof (leo2a7v 88.3, leo2a5 90.0,
 * leo2_revolution 93.3, leclerc_xlr 93.3), the 12.7 + 7.62 roof (m1a1_abrams_hc) 95.0 %. A class's band is wide enough
 * for a new station of the class and narrow enough that a station which cannot answer a drone, or answers it as a
 * different class does, falls out; the selftest's narrower band on its own seeds is the one that separates 1.1 from 1.
 */
export const COUNTER_DRONE_BANDS = Object.freeze({
  'lone-mg': Object.freeze({ downedPct: Object.freeze([8, 32]), why: 'a lone machine gun lets most level runs through (owner 2026-10-16)' }),
  'lone-cannon': Object.freeze({ downedPct: Object.freeze([20, 45]), why: 'a lone 30 mm reaches further but still lets most runs through' }),
  'two-station': Object.freeze({ downedPct: Object.freeze([75, 100]), why: 'two stations on one roof add their shares and down most level runs' }),
  'multi-station': Object.freeze({ downedPct: Object.freeze([85, 100]), why: 'three or more stations down nearly every level run' }),
});
/** Named id sets for the entry point: the band anchors, the 30 mm + 7.62 one-roof pair, and the 227 station work. */
export const COUNTER_DRONE_SETS = Object.freeze({
  reference: Object.freeze(['m1a1', 't90a_2004', 't72b3m_hetman', 'leo2a7v', 'm1a1_abrams_hc']),
  pair: Object.freeze(['leo2a7v', 'leo2a5', 'leo2_revolution', 'leclerc_xlr']),
  watch227: Object.freeze(['t72b3_zubr', 't72b3_zubr_ii', 't72b3_qilin', 't72b3m_kunlun']),
});

/**
 * The release check's exact pins (guards 229; critic round 1: a 12.7-only lethality change past about 110 m passed the
 * receipt, since the lone anchors' level runs were judged only by their combined band). Every level pilot run the lone
 * anchors fly on seeds 1-8 and each 30 mm + 7.62 roof flies on its own seed, as `outcome:rounds@ticks from launch`
 * (d downed, s strike, o other; rounds per station joined by /), approach-major (front, side, rear) then seed, and each
 * roof's bow hover about 33 m out ([rounds per station], ticks from the first round to the fall). The lone anchors' 48
 * runs down 9 (m1a1 5, t90a_2004 4): the owner's band is 4-11 of 48 (hitsToDown 1 downs 14).
 * src/sim/counterDroneRuns.selftest.mjs flies them in npm test; tools/counter-drone-engage.mjs --check compares them too
 * (tank:release:check runs it for a release that names one of these ids).
 * Measured on integ/229 93cfe22c21; re-pin only after re-ruling a change with the owner. Re-pinned 2026-10-24 (249) on
 * the turret-seat rollout's seated hulls and hitboxes (m1a1, t90a_2004, leo2a7v, leo2_revolution, leclerc_xlr runs, the
 * leo2a5 hover): every run's outcome as before, a tick or a round apart; the lone band still 9 of 48, so no lethality moved.
 */
export const COUNTER_DRONE_PINS = Object.freeze({
  runs: Object.freeze({
    m1a1: Object.freeze({ seed0: 1, runs: 8, rows: 's:8@715 s:15@701 d:12@569 s:13@657 s:8@677 s:11@591 s:6@608 s:11@671 d:10@643 d:15@657 d:15@640 s:7@659 s:7@669 s:12@606 s:15@634 s:11@706 s:8@657 d:9@683 s:6@693 s:10@726 s:8@696 s:11@657 s:11@633 s:8@690' }),
    t90a_2004: Object.freeze({ seed0: 1, runs: 8, rows: 's:6@716 d:15@696 s:9@588 s:13@659 s:9@678 s:12@592 s:9@609 s:12@672 s:7@652 s:13@688 s:12@668 s:7@660 s:7@668 s:11@606 d:14@618 s:9@707 s:7@658 s:6@689 s:9@694 s:11@726 s:6@696 d:12@650 d:12@621 s:9@691' }),
    leo2a7v: Object.freeze({ seed0: 1, runs: 1, rows: 'd:6/7@694 d:7/6@604 d:8/12@614' }),
    leo2a5: Object.freeze({ seed0: 2, runs: 1, rows: 'd:9/12@653 d:9/9@627 d:6/4@667' }),
    leo2_revolution: Object.freeze({ seed0: 3, runs: 1, rows: 'd:8/5@555 d:8/7@652 d:9/14@656' }),
    leclerc_xlr: Object.freeze({ seed0: 4, runs: 1, rows: 'd:8/5@609 d:7/12@617 d:7/6@677' }),
  }),
  hovers: Object.freeze({
    leo2a7v: Object.freeze([[4, 0], 135]), leo2a5: Object.freeze([[2, 3], 21]),
    leo2_revolution: Object.freeze([[2, 4], 19]), leclerc_xlr: Object.freeze([[2, 4], 18]),
  }),
  loneBand: Object.freeze({ ids: Object.freeze(['m1a1', 't90a_2004']), downed: Object.freeze([4, 11]), of: 48 }),
});
