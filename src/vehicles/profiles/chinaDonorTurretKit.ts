// Owner 2026-10-15 (VEH-19, VEH-20): the T-72B3 Qilin carries the production ZTZ-99A2 turret and the T-72B3M Kunlun
// the Type 96B turret, each emitted by its own builder (nationalDonorTurret.ts). The Kunlun keeps its special ERA,
// its 30 mm autocannon and its Shtora eyes on the Type 96B; the Qilin keeps its compact remote station and field fit.
// The hulls keep their Chinese packages unchanged (nationalChina.ts chinaDonorHull).
import {chinaDonorHull} from './nationalChina.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type ChinaDonorId='t72b3m_kunlun'|'t72b3_qilin';

/** The national fit on the donor turret (P.turretG already carries it). */
function turretFit(_P:TankBuilderPort,_id:ChinaDonorId):void {
  // Filled per vehicle: Kunlun's special ERA and Shtora eyes; both vehicles' lamps, sensors, cages and stowage.
}

export function buildChinaDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  chinaDonorHull(P,c);
  turretFit(P,c.id as ChinaDonorId);
}
