import * as THREE from 'three';
import type { TankBuilderPort, TrackShoeBuildParameters } from '../tankFactoryCore.ts';
import type { KIT } from './kit.ts';
import { mergeAll } from '../factoryGeometry.ts';
import { turnedGearStock, returnRollerStock } from '../runningGearPrimitives.ts';

export const TYPE100_ROAD_STATIONS = [2.32, 1.40, .48, -.44, -1.36, -2.28] as const;
type GearKit = Pick<typeof KIT, 'buildRunningGear'>;

function mergeOwned(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  try { return mergeAll(parts); }
  finally { for (const geometry of parts) if (geometry.index) geometry.dispose(); }
}

function tagged(geometry: THREE.BufferGeometry, part: string): THREE.BufferGeometry {
  geometry.userData.type100Gear = part;
  return geometry;
}

function pressedRib(high: boolean, side: number): THREE.BufferGeometry {
  if (high) return new THREE.BoxGeometry(.018, .028, .165).translate(side * .108, 0, .205);
  const section = new THREE.Shape([new THREE.Vector2(side * .098, -.016),
    new THREE.Vector2(side * .118, 0), new THREE.Vector2(side * .098, .016)]);
  return new THREE.ExtrudeGeometry(section, { depth: .165, steps: 1, bevelEnabled: false }).translate(0, 0, .1225);
}

/** Two pressed six-rib dishes and two tires around a real guide channel — the China IFV wheel construction (2026-09-22). */
export function type100RoadWheelStock(high: boolean) {
  const segments = high ? 16 : 8, tire: THREE.BufferGeometry[] = [], metal: THREE.BufferGeometry[] = [];
  // Two tires and two pressed dishes leave the real central guide channel.
  // The shared axle owner still supplies all wheel motion and suspension.
  for (const side of [-1, 1]) {
    tire.push(turnedGearStock([[.310, .05], [.36, .05], [.36, .125], [.310, .125], [.310, .05]], high ? 20 : 12, side));
    metal.push(turnedGearStock([[.095, .05], [.317, .05], [.317, .127], [.29, .127],
      [.29, .098], [.12, .098], [.095, .155], [.095, .05]], segments, side));
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3;
      metal.push(pressedRib(high, side).rotateX(angle));
    }
  }
  metal.push(turnedGearStock([[0, -.163], [.082, -.163], [.105, -.135], [.105, .135],
    [.082, .163], [0, .163], [0, -.163]], high ? 12 : 8));
  return { tire: tagged(mergeOwned(tire), 'paired-tires'), disc: tagged(mergeOwned(metal), 'pressed-six-disc'), dark: null };
}

function shoeBox(w: number, h: number, d: number, omitFace: number | null = null): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (omitFace !== null) {
    const indices = Array.from(geometry.index!.array);
    geometry.setIndex(indices.filter((_, index) => Math.floor(index / 6) !== omitFace));
    geometry.clearGroups();
  }
  return geometry;
}

function shoePad(p: TrackShoeBuildParameters): THREE.BufferGeometry[] {
  const { trackW: w, pitch, pattern: { padHeight: h, grouserHeight: rise, padCoverage } } = p;
  if (p.high || p.far) {
    const parts = [shoeBox(w * .97, h, pitch * padCoverage)];
    for (const z of p.far ? [0] : [-pitch * .25, 0, pitch * .25])
      parts.push(shoeBox(w * .86, rise, pitch * .08, 3).translate(0, (h + rise) / 2, z));
    return parts;
  }
  // LOW retains the same peak and axial contact envelope with one closed
  // six-station outsole instead of three independently tessellated ribs.
  const half = pitch * padCoverage / 2, peakZ = pitch * .29;
  const shape = new THREE.Shape([[-half, -h / 2], [half, -h / 2], [half, h / 2],
    [peakZ, h / 2 + rise], [-peakZ, h / 2 + rise], [-half, h / 2]]
    .map(([z, y]) => new THREE.Vector2(z, y)));
  return [new THREE.ExtrudeGeometry(shape, { depth: w * .97, steps: 1, bevelEnabled: false })
    .translate(0, 0, -w * .485).rotateY(-Math.PI / 2)];
}

function guideHorn(p: TrackShoeBuildParameters): THREE.BufferGeometry {
  const { padHeight, webHeight, hornHeight } = p.pattern;
  const root = -(padHeight / 2 + webHeight - .006), tip = root - hornHeight;
  const shape = new THREE.Shape([[-.041, root], [.041, root], [.023, tip], [-.023, tip]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: p.pitch * .25, steps: 1, bevelEnabled: false })
    .translate(0, 0, -p.pitch * .125);
}

/** Profile-local compact IFV links: circular hinge pins are never squashed. */
export function type100TrackShoe(p: TrackShoeBuildParameters): THREE.BufferGeometry {
  if (p.pattern.id !== 'compact-ifv' || p.radialScale !== 1 || p.section || p.guideProfile || p.outsole)
    throw new Error('Type 100 requires its unscaled compact IFV shoe contract');
  const parts = shoePad(p), { padHeight, webHeight, pinRadius } = p.pattern;
  if (!p.far) {
    parts.push(shoeBox(p.trackW * .78, webHeight, p.pitch * .60, 2)
      .translate(0, -(padHeight + webHeight) / 2 + .004, 0), guideHorn(p));
    // Two whole transverse hexagonal cylinders supply four round end faces
    // and a physical hinge shaft; there are no duplicated cap overlays.
    const pinY = -(padHeight / 2 + webHeight * .38), halfWidth = p.pinCapOuter ?? p.trackW * .48;
    const circle = new THREE.Shape(Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3;
      return new THREE.Vector2(Math.cos(angle) * pinRadius, Math.sin(angle) * pinRadius);
    }));
    for (const z of [-p.pitch * .30, p.pitch * .30])
      parts.push(new THREE.ExtrudeGeometry(circle, { depth: halfWidth * 2, steps: 1, bevelEnabled: false })
        .translate(0, 0, -halfWidth).rotateY(Math.PI / 2).translate(0, pinY, z));
  }
  const geometry = tagged(mergeOwned(parts), p.far ? 'shoe-far' : `shoe-${p.high ? 'high' : 'low'}`);
  geometry.scale(p.widthScale, 1, 1);
  geometry.userData.type100Pin = { radiusM: pinRadius, segments: 6, count: p.far ? 0 : 2,
    centerY: -(padHeight / 2 + webHeight * .38), halfSpacingM: p.pitch * .30 };
  return geometry;
}

/** First-party front-engine IFV course. Road stations and shared seating law
 * are retained; the front drive and rear idler are deliberate design datums. */
export function buildType100RunningGear(P: TankBuilderPort, kit: GearKit) {
  const gear = kit.buildRunningGear(P, {
    style: 'rubber', dishR: .74, wheelR: .36, wheelW: .25, wheelY: .42, xc: 1.40,
    wheelZs: [...TYPE100_ROAD_STATIONS],
    sprocket: { z: 3.02, y: .86, r: .34 }, idler: { z: -3.02, y: .70, r: .28 },
    rollerR: .085, rollers: [{ z: 1.44, y: 1.05 }, { z: .02, y: 1.06 }, { z: -1.40, y: 1.05 }],
    trackW: .58, trackTh: .09, topY: 1.20, botY: .06,
    wheelPattern: 'pressed-six', trackPattern: 'compact-ifv',
    linkPitchM: .150, shoeWidthScale: .99, roadWheelGeometry: type100RoadWheelStock(P.q),
    trackShoeBuilder: type100TrackShoe,
    returnRollerStockGeometry: returnRollerStock(.085, .58 * .63, P.q),
    paintedEnds: true, arms: true, coveredTop: true, contactZF: 2.50, contactZR: -2.48,
  });
  P.hullG.userData.type100GearContract = { design: 'front-drive-ifv', wheelRadiusM: .36,
    roadStationsM: [...TYPE100_ROAD_STATIONS], trackCenterM: 1.40, trackWidthM: .58,
    sprocket: [3.02, .86, .34], idler: [-3.02, .70, .28], wheelPattern: 'pressed-six' };
  return gear;
}
