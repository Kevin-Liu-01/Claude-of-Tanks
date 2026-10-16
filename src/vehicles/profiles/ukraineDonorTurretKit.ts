// Owner 2026-10-15 (VEH-21): the T-72B3M Hetman, the Hetman II and the T-72B3 Sich carry the T-72B3M (2016) and
// T-72B3 turrets themselves (nationalDonorTurret.ts), up-armoured with the Ukrainian field fit: the modern remote
// autocannon on the commander's cupola, added ERA, open cages and nets with leaves, lamps, sensors and stowage.
// The hulls keep their Ukrainian packages unchanged (nationalUkraine.ts ukrainianDonorHull, hetmanII.ts).
import {ukrainianDonorHull} from './nationalUkraine.ts';
import {hetmanIIHullPackage} from './hetmanII.ts';
import {addNationalUkraineProtection,NATIONAL_UKRAINE_GHILLIE} from './nationalUkraineProtection.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type UkraineDonorId='t72b3m_hetman'|'t72b3_sich'|'t72b3m_hetman_ii';

/** The national up-armour on the donor turret (P.turretG already carries it). */
function turretUpArmour(_P:TankBuilderPort,_id:UkraineDonorId):void {
  // Filled per vehicle: ERA courses seated on the donor casting, bustle cages, lamps, sensors, stowage.
}

/** Hetman and Sich: their unchanged Ukrainian hull package, then the turret fit. */
export function buildUkraineDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  ukrainianDonorHull(P,c);
  fitUkraineDonorTurret(P,c.id as UkraineDonorId);
}

/** Hetman II: its own heavy hull package, then the turret fit. */
export function buildHetmanIIDonorKit(P:TankBuilderPort):void {
  hetmanIIHullPackage(P);
  fitUkraineDonorTurret(P,'t72b3m_hetman_ii');
}

function fitUkraineDonorTurret(P:TankBuilderPort,id:UkraineDonorId):void {
  turretUpArmour(P,id);
  addNationalUkraineProtection(P,id,{turretScreens:false});
  addVehicleGhillieSuit(P,{...NATIONAL_UKRAINE_GHILLIE[id],turret:undefined});
}
