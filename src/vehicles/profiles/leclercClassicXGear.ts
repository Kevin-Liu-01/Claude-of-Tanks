// Independent June-file wheels and physically supported native track course.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TrackShoeBuildParameters } from '../tankFactoryCore.ts';

type Radial = readonly [axial: number, radius: number];
function turned(rows: readonly Radial[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x, r]) => new THREE.Vector2(r, x)),
    segments).rotateZ(-Math.PI / 2);
}

function wheelFace(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // Independent source195 outward rays, lower half of the exposed face.
  // The unseen return closure is3mm inward; no broad capped rubber disk.
  const front: readonly Radial[] = [[.184, 0], [.184, .041], [.2205013, .041],
    [.2205013, .068], [.184, .11559], [.13677655, .11559],
    [.13677655, .186871], [.1110594, .186871], [.1110594, .2729045],
    [.14610038, .2729045], [.14610038, .2873172]];
  const rear: Radial[] = [...front].reverse().map(([x, r]) => [x - .003, r]);
  const g = turned([...front, ...rear, front[0]].reverse(), segments);
  if (side < 0) g.rotateY(Math.PI);
  return g;
}

function wheelCore(segments: number): THREE.BufferGeometry {
  return turned([[-.023, .283], [-.023, .2873172], [.023, .2873172],
    [.023, .283], [-.023, .283]], segments);
}

function groove(segments: number): THREE.BufferGeometry {
  return turned([[-.043, .2873172], [-.043, .3451203], [-.021, .29177824],
    [.028, .29177824], [.048, .3451203], [.048, .2873172], [-.043, .2873172]], segments);
}

export function addLeclercClassicXGear(P: TankBuilderPort): void {
  const segments = P.q ? 40 : 24;
  const rollers = [-1.6, -.12, 1.40].map(z => ({ z, y: 1.009 + .0022 * z, r: .095 }));
  const idler = { z: 2.9929035, y: .824805, r: .353969, trackR: .3295,
    axleOutsetLeftM: .01889604, axleOutsetRightM: -.02123453,
    axialScaleLeft: .90, axialScaleRight: .90 };
  const sprocket = { z: -2.6857465, y: .803689, r: .3347, trackR: .3107,
    toothTipRadiusM: .4062785, axleOutsetLeftM: .0202, axleOutsetRightM: -.0227,
    axialScaleLeft: .75, axialScaleRight: .75 };
  const botY = .056, topY = 1.139;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: D.wheelRadiusM, wheelW: .522462, wheelY: D.wheelY,
    wheelZs: [...D.wheelZsLeft], wheelZsLeftM: D.wheelZsLeft, wheelZsRightM: D.wheelZsRight,
    xc: 1.283948956, xcLeft: -D.trackCenters[0], xcRight: D.trackCenters[1],
    roadWheelOutsetLeftM: .01889603993, roadWheelOutsetRightM: -.02123452759,
    wheelTireBands: [-.151616, .151616].map(centerM => ({ centerM,
      widthM: .21923, innerRadiusM: .2873172 })),
    wheelCoreGeometry: { disc: wheelCore(segments) },
    wheelFaceLayers: ([-1, 1] as const).flatMap(side => [
      { geometry: wheelFace(side, segments), material: P.mats.wheels, side,
        name: `leclercClassicSourceWheelFace${side}` },
      { geometry: groove(segments), material: P.mats.rubber, side,
        name: `leclercClassicSourceWheelGroove${side}` },
    ]),
    trackW: .6309749205, trackCarrierWidthM: .521112, trackTh: .028,
    trackShoeDimensions: { padHeight: .030, grouserHeight: .015,
      webHeight: .026, hornHeight: .080, pinRadius: .0232085, pinCentreY: -.00225 },
    pinCapOuter: .31548746025,
    // Independent old-file ground islands: .040081m round cap, .051749m
    // planar connector and .102729m longitudinal stock. The <.1° source
    // ground pitch and .68mm pad lateral asymmetry are bounded estimates.
    // Polygon budget 2026-09-12: the near link keeps its measured pins and
    // connectors (276 triangles); the far course uses the fleet shoe with the
    // same measured cross-section instead of the 174-triangle native link.
    trackShoeBuilder: (p: TrackShoeBuildParameters) => p.far ? buildFleetTrackShoe(p)
      : KIT.trackShoeGeometry(p.trackW, p.pitch, p.pattern, p.pinCapOuter, p.radialScale, p.widthScale, p.section),
    trackLinkCrossSection: { padWidthM: .521112, pinCapLengthM: .040081,
      pinHalfSpacingM: .040487, connectorInnerM: .255445, connectorOuterM: .307194,
      connectorHeightM: .037258, connectorDepthM: .102729, connectorCentreYDeltaM: -.000692 },
    sprocket, idler, rollers, rollerR: .095, returnRollerWidthM: .22,
    returnRollerInsetM: .09, botY, topY,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { ...idler, r: idler.trackR }, sprocket: { ...sprocket, r: sprocket.trackR }, botY, topY,
      sag: .008, contact: KIT.runningGearContactPatch(D.wheelZsLeft, D.wheelRadiusM),
      supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .014 })),
    }), botY, .35),
    rigidLinkChords: true, arms: true, paintedEnds: true, coveredTop: true,
  });
}
