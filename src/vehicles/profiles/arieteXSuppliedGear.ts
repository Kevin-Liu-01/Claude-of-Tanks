// Native, moving running gear measured in the owner-approved Ariete frame.
// The source is a continuous belt. This model uses articulated native shoes;
// that construction difference is deliberately not called source topology.
import { KIT } from './kit.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D } from './arieteXSuppliedFrame.ts';
import { arieteC2Shoe } from './arieteC2XShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { ARIETE_TIRE_BANDS, arieteRoadWheelCore, arieteRoadWheelFace } from '../nationWheelConstructions.ts';

export function addArieteXSuppliedGear(P: TankBuilderPort, modern = false): void {
  const wheelZs = [-2.055227, -1.376039, -.696431, -.016822, .662787, 1.342395, 2.021583];
  const segments = modern ? (P.q ? 32 : 12) : (P.q ? 40 : 24);
  // C2's internal drum is enclosed by the tire and recessed face stock.
  // Keep the visible 32-sided dish; avoid spending those facets on the core.
  const coreSegments = modern && P.q ? 16 : segments;
  const idler = { z: 2.773106, y: .6741414, r: .28975886, trackR: .2744 };
  const sprocket = { z: -2.621708, y: .7246074, r: .285, trackR: .2752,
    toothTipRadiusM: .340225 };
  // Native articulated shoes require5mm more loaded-course center clearance
  // than the first continuous-source-belt estimate. Axles remain unchanged.
  const shoeDims = { padHeight: .022, grouserHeight: .010,
      webHeight: .019, hornHeight: .066, pinRadius: .018, pinCentreY: -.002 };
  // 2026-09-17 ground datum (KIT.groundSeatBotY): soles on hull y = 0 for the fleet-standard band
  const botY = KIT.groundSeatBotY(P.spec, { trackTh: .024, trackShoeDimensions: shoeDims }), topY = 1.020;
  const rollers = (modern ? [-1.86, -.69, .48, 1.65] : [-1.675, -.348636, .976])
    .map(z => ({ z, y: .852034, r: .111866 }));
  const trackWidth = modern ? .6497973 : .6097973;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: D.wheelRadiusM, wheelY: D.wheelY,
    wheelW: .377654, wheelZs, xc: D.trackX,
    roadWheelOutsetLeftM: .00336448, roadWheelOutsetRightM: .00336448,
    // the recessed dish is the Italy wheel construction (nationWheelConstructions.ts, owner 2026-09-22)
    wheelCoreGeometry: { disc: arieteRoadWheelCore(coreSegments) },
    wheelTireBands: ARIETE_TIRE_BANDS,
    wheelFaceLayers: ([-1, 1] as const).map(side => ({
      geometry: arieteRoadWheelFace(side, segments), material: P.mats.wheels, side,
      name: `arieteSuppliedRecessedWheelFace${side}`,
    })),
    trackW: trackWidth, trackCarrierWidthM: modern ? .561 : .521, trackTh: .024,
    ...(modern ? { trackShoeBuilder: arieteC2Shoe } : {}),
    trackShoeDimensions: shoeDims,
    pinCapOuter: trackWidth / 2, rigidLinkChords: true,
    sprocket, idler, rollers, rollerR: .111866, returnRollerWidthM: .109343,
    returnRollerInsetM: 0, returnRollerOutsetM: .090418,
    botY, topY, loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { ...idler, r: idler.trackR }, sprocket: { ...sprocket, r: sprocket.trackR },
      botY, topY, sag: .006,
      contact: KIT.runningGearContactPatch(wheelZs, D.wheelRadiusM),
      endWheels: KIT.endRoadWheels(wheelZs, KIT.seatedWheelY(botY, .024, D.wheelRadiusM), D.wheelRadiusM),
      supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .012 })),
    }), botY, .29),
    arms: true, paintedEnds: true, coveredTop: true,
  });
}
