// The two Marksmen (release 269, builder M; the owner 2026-11-03: "UK Marksman", the Finnish ItPsv 90, then the Leopard 2
// Marksman, "produced in 2014 and 15 and started its service in 2016 under the designation ItPsv Leopard 2"): one Marconi
// Marksman turret (profiles/marksmanTurret.ts, its datums profiles/marksmanFrame.ts) on each hull's own ring.
//   - marksman_t55, Finland's ItPsv 90 (photo 01, Helsinki, "Ps465-22"): the fleet's T-55A hull and running gear as the
//     T-55A builds them (profiles/t54Family.ts buildT55AHull: five road wheels, the T-55's deck, the fender tanks and the
//     two drums across the stern) with the photograph's two hull options, the light flexible skirts over the top run and
//     the smooth front mudguards (fix round 1), the turret on the T-55 ring's adapter, its pods in the turret's paint;
//   - itpsv_leopard2, the ItPsv Leopard 2 (photos 02-08): the Leopard 2A4's hull and running gear with the 2A4's own
//     options (profiles/leopard2Hull.ts, as profiles/leopard2A4Family.ts builds the leo2a4: seven road wheels, the skirts,
//     the round-rod exhaust grilles, the fuel fillers, the forward lift eyes on the glacis) and the 2A4's hull kit without
//     its German rear number (profiles/leopard2A4Kit.ts), the turret on the Leopard 2 race's wider adapter, its pods dark
//     as in the 2015 photographs.
// docs/references/tanks/marksman_t55.md, itpsv_leopard2.md. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M, EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z } from '../leopard2a3B4Armor.ts';
import { buildT55AHull } from './t54Family.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { buildLeopard2Hull } from './leopard2Hull.ts';
import { addLeo2A4HullKit } from './leopard2A4Kit.ts';
import { buildMarksmanTurret } from './marksmanTurret.ts';

function* buildMarksmanT55Steps(P: TankBuilderPort): TankProfileBuild {
  const hull = buildT55AHull(P, { flexibleSkirts: true, smoothMudguards: true });
  yield 'buildMarksmanT55Hull';
  buildMarksmanTurret(P, { adapter: 't55', ring: hull.ringPivot, darkPods: false });
}

function* buildItpsvLeopard2Steps(P: TankBuilderPort): TankProfileBuild {
  buildLeopard2Hull(P, { flapName: 'itpsv-leopard2-rear-flap', exhaust: 'rods', foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M,
    fuelFillers: true, forwardLiftEyeZ: EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z });
  addLeo2A4HullKit(P, { rearNumber: false });
  yield 'buildItpsvLeopard2Hull';
  buildMarksmanTurret(P, { adapter: 'leopard2', ring: LEOPARD2_HULL.ring, darkPods: true });
}

export const MARKSMAN_PROFILES = {
  marksman_t55: { build: steppedBuilder(buildMarksmanT55Steps) },
  itpsv_leopard2: { build: steppedBuilder(buildItpsvLeopard2Steps) },
} satisfies VehicleProfileRecord;
