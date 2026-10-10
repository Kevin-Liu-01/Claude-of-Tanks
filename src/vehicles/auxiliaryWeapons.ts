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
}

const heavy: AuxiliaryWeaponProfile = {
  shell: {type:'AP', name:'12.7×99 mm M2 AP', caliberMm:12.7, velocityMps:850,
    pen100Mm:26, pen1000Mm:12, pen2000Mm:5, dmg:8, moduleDmg:3},
  rangeM:240, shotIntervalS:.12, burstRounds:5, burstPauseS:1.4,
  yawRateRadS:1.7, pitchRateRadS:1, depressionRad:.18, elevationRad:.75,
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
const ubr6=ammunition(cannon,'30×165 mm 3UBR6 AP-T');
// 2026-10-09 (owner order: the Griffin 50 mm's old roof M2 is back, now its working roof gun): the 1.28-scale gun's
// 1.5 m barrel sweeps low over the roof's raised service plates from its elevated cradle, so it depresses 4.6 degrees,
// not the heavy mount's 10.3 (fieldEquipment.selftest's 360-degree sweep: at 6.9 degrees and 320 degrees of traverse
// the muzzle entered a plate by 32 mm; 4.6 degrees keeps the 8 mm clearance everywhere).
const griffinRoofM2:AuxiliaryWeaponProfile={...heavy,depressionRad:.08};

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
};

export function auxiliaryWeaponProfile(caliberMm:number,vehicleId=''): AuxiliaryWeaponProfile {
  const specific=vehicleAmmunition[vehicleId];
  if(specific?.shell.caliberMm===caliberMm)return specific;
  return caliberMm >= 20 ? cannon : caliberMm < 10 ? rifle : heavy;
}
