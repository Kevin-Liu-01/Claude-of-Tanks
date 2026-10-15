import type { DamageShellSpec } from '../sim/damage.ts';

/** Game-balanced roof weapons. These are not real-world armor performance tables. */
export interface AuxiliaryWeaponProfile {
  shell: DamageShellSpec;
  rangeM: number;
  shotIntervalS: number;
  burstRounds: number;
  burstPauseS: number;
  yawRateRadS: number;
  pitchRateRadS: number;
  depressionRad: number;
  elevationRad: number;
  /**
   * VH.14 balance (2026-10-15, the coordinator's check on ~110 vehicles gaining working roof guns): the station engages
   * a vehicle only when its round's penetration at that range is at least this multiple of the thinnest line-of-sight
   * main armour the vehicle turns towards the station (src/sim/auxiliarySystems.ts exposedArmourMm: a defeatable flank
   * or rear counts, a front it cannot defeat does not). A gun that cannot hurt the vehicle where it can strike it holds
   * its fire instead of revealing its own vehicle by its flash.
   */
  engagePenRatio: number;
}

const heavy: AuxiliaryWeaponProfile = {
  shell: {type:'AP', name:'12.7×99 mm M2 AP', caliberMm:12.7, velocityMps:850,
    pen100Mm:26, pen1000Mm:12, pen2000Mm:5, dmg:8, moduleDmg:3},
  rangeM:240, shotIntervalS:.12, burstRounds:5, burstPauseS:1.4,
  yawRateRadS:1.7, pitchRateRadS:1, depressionRad:.18, elevationRad:.75, engagePenRatio:1,
};
const rifle: AuxiliaryWeaponProfile = {
  ...heavy,
  shell:{type:'AP',name:'7.62×51 mm M61 AP',caliberMm:7.62,velocityMps:830,
    pen100Mm:10,pen1000Mm:4,pen2000Mm:2,dmg:4,moduleDmg:1},
  rangeM:180,shotIntervalS:.09,burstRounds:8,burstPauseS:1.25,
};
const cannon: AuxiliaryWeaponProfile = {
  ...heavy,
  shell:{type:'AP',name:'30×113 mm M789 HEDP',caliberMm:30,velocityMps:900,
    pen100Mm:65,pen1000Mm:40,pen2000Mm:20,dmg:22,moduleDmg:10},
  rangeM:360,shotIntervalS:.20,burstRounds:3,burstPauseS:1.8,
  yawRateRadS:1.2,pitchRateRadS:.8,
};

// Cartridge designations describe the fitted ammunition. Existing game damage
// classes and tuning are retained, including the simplified M789 impact model.
// Construct variants once: the fixed-step firing path never allocates or renames
// a shared shell, which would leak one vehicle's label into another's shots.
function ammunition(profile:AuxiliaryWeaponProfile,name:string): AuxiliaryWeaponProfile {
  return {...profile,shell:{...profile.shell,name}};
}
const b32Heavy=ammunition(heavy,'12.7×108 mm B-32 API');
const b32Rifle=ammunition(rifle,'7.62×54R mm B-32 API');
const type54=ammunition(heavy,'12.7×108 mm Type 54 API');
// VH.14 (calibre-true roof weapons): the NSVT, Kord and DShK the Soviet-family hulls now fire, and the QJC-88 and Type 54
// the Chinese hulls fire, take their own 12.7×108 mm cartridge's name (game numbers unchanged)
const b32Nsvt=ammunition(heavy,'12.7×108 mm B-32 API');
const ubr6=ammunition(cannon,'30×165 mm 3UBR6 AP-T');
// 2026-10-09 (owner order: the Griffin 50 mm's old roof M2 is back, now its working roof gun): the 1.28-scale gun's
// 1.5 m barrel sweeps low over the roof's raised service plates from its elevated cradle, so it depresses 4.6 degrees,
// not the heavy mount's 10.3 (fieldEquipment.selftest's 360-degree sweep: at 6.9 degrees and 320 degrees of traverse
// the muzzle entered a plate by 32 mm; 4.6 degrees keeps the 8 mm clearance everywhere).
const griffinRoofM2:AuxiliaryWeaponProfile={...heavy,depressionRad:.08};
// 2026-10-14 (owner markup on the MBT-70's M2; coordinator ruling: the KPz 70's calibre-true 20 mm Rh 202 station):
// a 20 mm between the heavy MG and the 30 mm cannon in every game number. The Rh 202 fires about 1,000 rounds a
// minute (0.10 s here, 5-round bursts) and its high mount elevates further than a roof MG.
const rh202:AuxiliaryWeaponProfile={
  shell:{type:'AP',name:'20×139 mm DM63 APDS-T',caliberMm:20,velocityMps:1100,
    pen100Mm:45,pen1000Mm:28,pen2000Mm:12,dmg:14,moduleDmg:6},
  rangeM:320,shotIntervalS:.10,burstRounds:5,burstPauseS:1.6,
  yawRateRadS:1.4,pitchRateRadS:.9,depressionRad:.14,elevationRad:.9,engagePenRatio:1,
};

// The remaining authored stations use NATO M2/M61 or lightweight 30×113 mm
// cannon ammunition. Keep this boot-light: no fleet builders or registry import.
const vehicleAmmunition: Readonly<Record<string,AuxiliaryWeaponProfile>> = {
  t72b3m:b32Heavy,
  ua_t84_oplot_m:b32Heavy,
  ua_t72b3m_hetman_ii:ubr6,
  pl_t72b3_zubr_ii:cannon,
  ua_t80u_modern:b32Heavy,
  ua_t72b3m_modern:ubr6,
  ua_t72b3_modern:b32Heavy,
  pl_t80u_modern:heavy,
  pl_t72b3m_modern:cannon,
  pl_t72b3_modern:heavy,
  cn_t80u_modern:type54,
  cn_t72b3m_modern:ubr6,
  cn_t72b3_modern:type54,
  ru_t80u_modern:b32Heavy,
  ru_t72b3m_modern:ubr6,
  ru_t72b3_modern:b32Heavy,
  t90:b32Heavy,t90ms:b32Heavy,t90m_proryv:b32Heavy,
  t90a_x:b32Heavy,t90a_vladimir_x:b32Heavy,t90m_x:b32Heavy,
  t90sm_x:b32Heavy,t90ms_x:b32Heavy,
  t14_x:b32Rifle,t14:ubr6,
  vt4a1:type54,ztz100_x:type54,
  griffin50_x:griffinRoofM2,
  mbt70:rh202,
  t62mv1:b32Nsvt,t62mv1_x:b32Nsvt,t64bv1:b32Nsvt,ua_t64bv:b32Nsvt,t72bu:b32Nsvt,t72bu_x:b32Nsvt,t72b3_x:b32Nsvt,
  t72b3m_x:b32Nsvt,t72b_1987_x:b32Nsvt,t72m1_jaguar:b32Nsvt,t72_rys:b32Nsvt,pt91_twardy:b32Nsvt,pt91m:b32Nsvt,
  t80:b32Nsvt,t80b:b32Nsvt,t80bv:b32Nsvt,t80u:b32Nsvt,t80u_x:b32Nsvt,ua_t80bv:b32Nsvt,ua_t80u_kursk:b32Nsvt,
  t84:b32Nsvt,t90_x:b32Nsvt,t90a:b32Nsvt,t90a_burlak:b32Nsvt,t90a_burlak_x:b32Nsvt,t90a_vladimir:b32Nsvt,
  t90m:b32Nsvt,t90sm:b32Nsvt,
  type59:type54,type99a:type54,ztz85_iii:type54,ztz99a2:type54,ztz99a2_prototype:type54,
};

export function auxiliaryWeaponProfile(caliberMm:number,vehicleId=''): AuxiliaryWeaponProfile {
  const specific=vehicleAmmunition[vehicleId];
  if(specific?.shell.caliberMm===caliberMm)return specific;
  return caliberMm >= 20 ? cannon : caliberMm < 10 ? rifle : heavy;
}
