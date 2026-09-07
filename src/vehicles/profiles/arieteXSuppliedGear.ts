// Native, moving running gear measured in the owner-approved Ariete frame.
// The source is a continuous belt. This model uses articulated native shoes;
// that construction difference is deliberately not called source topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D } from './arieteXSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Radial = readonly [axial: number, radius: number];
function turned(rows: readonly Radial[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x, r]) => new THREE.Vector2(r, x)),
    segments).rotateZ(-Math.PI / 2);
}

function face(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // Recessed dish and proud axle cap. Its measured outer face is X1.369310;
  // the planar dish behind it is X1.286041. The narrow concealed return is
  // independently authored stock, not a cap across the wheel's tire channel.
  const rows: readonly Radial[] = [[.209717, 0], [.19991, .030], [.18746, .045],
    [.13432, .065], [.105558, .073], [.105558, .21406], [.188827, .237],
    [.188827, .261], [.179827, .261], [.096558, .21406],
    [.096558, .073], [.200717, 0], [.209717, 0]];
  const geometry = turned(rows, segments);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

export function addArieteXSuppliedGear(P: TankBuilderPort): void {
  const wheelZs = [-2.055227, -1.376039, -.696431, -.016822, .662787, 1.342395, 2.021583];
  const segments = P.q ? 40 : 24;
  const idler = { z: 2.773106, y: .6741414, r: .28975886, trackR: .2744 };
  const sprocket = { z: -2.621708, y: .7246074, r: .285, trackR: .2752,
    toothTipRadiusM: .340225 };
  // Native articulated shoes require5mm more loaded-course center clearance
  // than the first continuous-source-belt estimate. Axles remain unchanged.
  const botY = .045, topY = 1.020;
  const rollers = [-1.675, -.348636, .976].map(z => ({ z, y: .852034, r: .111866 }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: D.wheelRadiusM, wheelY: D.wheelY,
    wheelW: .377654, wheelZs, xc: D.trackX,
    roadWheelOutsetLeftM: .00336448, roadWheelOutsetRightM: .00336448,
    wheelCoreGeometry: { disc: turned([[-.111, 0], [-.111, .241],
      [.106, .241], [.106, 0], [-.111, 0]], segments) },
    wheelTireBands: [-.116491, .116491].map(centerM => ({
      centerM, widthM: .14467, innerRadiusM: .260,
    })),
    wheelFaceLayers: ([-1, 1] as const).map(side => ({
      geometry: face(side, segments), material: P.mats.wheels, side,
      name: `arieteSuppliedRecessedWheelFace${side}`,
    })),
    trackW: .6097973, trackCarrierWidthM: .521, trackTh: .024,
    trackShoeDimensions: { padHeight: .022, grouserHeight: .010,
      webHeight: .019, hornHeight: .066, pinRadius: .018, pinCentreY: -.002 },
    pinCapOuter: .30489865, rigidLinkChords: true,
    sprocket, idler, rollers, rollerR: .111866, returnRollerWidthM: .109343,
    returnRollerInsetM: 0, returnRollerOutsetM: .090418,
    botY, topY, loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { ...idler, r: idler.trackR }, sprocket: { ...sprocket, r: sprocket.trackR },
      botY, topY, sag: .006,
      contact: KIT.runningGearContactPatch(wheelZs, D.wheelRadiusM),
      supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .012 })),
    }), botY, .29),
    arms: true, paintedEnds: true, coveredTop: true,
  });
}
