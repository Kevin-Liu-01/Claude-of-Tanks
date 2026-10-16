// Owner 2026-10-15 (VEH-22): the T-72B3 Zubr and Zubr II carry the T-72B3M (2016) turret itself
// (nationalDonorTurret.ts) on their T-72B3 hulls, up-armoured with the Polish field fit: the modern remote autocannon
// on the commander's cupola, ERAWA courses, slat screens and nets with leaves, lamps, sensors and stowage.
// The hulls keep their Polish packages unchanged (nationalPoland.ts hullEquipment, zubrII.ts).
import type * as THREE from 'three';
import {hullEquipment} from './nationalPoland.ts';
import {addPolishProtection} from './nationalPolandProtection.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type PolandDonorId='t72b3_zubr'|'t72b3_zubr_ii';
/** Rows of POLISH_PROTECTION_LAYOUTS. */
const PROTECTION_MODEL:Readonly<Record<PolandDonorId,number>>={t72b3_zubr:2,t72b3_zubr_ii:3};

/** The national up-armour on the donor turret (P.turretG already carries it). Returns the permanent turret stock the
 * screens may fasten to. */
function turretUpArmour(P:TankBuilderPort,_id:PolandDonorId):THREE.BufferGeometry[] {
  const stock:THREE.BufferGeometry[]=[];
  P.forEachBucketPart(['turret','turretExternalArmor'],g=>{if(!Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))stock.push(g);});
  return stock;
}

/** Zubr: its unchanged Polish hull package, then the turret fit. */
export function buildPolandDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  hullEquipment(P,c);
  fitPolandDonorTurret(P,'t72b3_zubr');
}

/** Zubr II: the hull is built by zubrII.ts buildZubrIIHull; the turret fit follows. */
export function buildZubrIIDonorKit(P:TankBuilderPort):void {
  fitPolandDonorTurret(P,'t72b3_zubr_ii');
}

function fitPolandDonorTurret(P:TankBuilderPort,id:PolandDonorId):void {
  const stock=turretUpArmour(P,id);
  addPolishProtection(P,PROTECTION_MODEL[id],stock,{turretScreens:false});
}
