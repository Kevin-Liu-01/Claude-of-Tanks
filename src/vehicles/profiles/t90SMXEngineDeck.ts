// Independent SM-specific closed cover construction. Only scalar local-source
// dimensions and ray witnesses are retained; no source vertices or topology.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Course = readonly [z: number, left: number, right: number, leftY: number, rightY: number];
const BASE_Y = 1.480;

function course(P: TankBuilderPort, rows: readonly Course[], dark = false): void {
  P.addEquipment(dark ? 'hullDark' : 'hullDetail', sectionSolid(rows.map(([z, left, right, leftY, rightY]) => ({
    z, ring: [[left, BASE_Y], [right, BASE_Y], [right, rightY], [left, leftY]],
  }))));
}

/** Only the SM rear carrier is recessed; all other hull stations are intact. */
export function smEngineDeckSupportRoof(z: number, currentTop: number): number {
  return z >= -3.43001 && z <= -1.44715 ? Math.min(currentTop, 1.485) : currentTop;
}

function steppedCoolingCover(P: TankBuilderPort): void {
  // Actual SM cover is a shallow four-facet roof, not the M's open louvre
  // assembly or the old generic fifteen proud crossbars. Separate ramps
  // leave the lower transverse channel ahead of this raised cover exposed.
  const rows = [
    [-3.0532176, .974868, .977804, 1.5030174, 1.5030174, 1.5030174, 1.5030174, 1.5030174],
    [-3.0237505, .948428, .951853, 1.5319264, 1.5319264, 1.530190, 1.5319264, 1.5030174],
    [-2.9879661, .936676, .936184, 1.5708065, 1.5708065, 1.529880, 1.535820, 1.5030174],
    [-2.3164887, .936676, .936184, 1.5568494, 1.5558521, 1.525110, 1.525070, 1.5000271],
    [-2.2954397, .978295, .978783, 1.5000271, 1.5000271, 1.5000271, 1.5000271, 1.5000271],
  ];
  for (const side of [-1, 1]) {
    const center = .00041666;
    course(P, rows.map(([z, leftWidth, rightWidth, centerY, edgeY]): Course => side < 0
      ? [z, -leftWidth, center, edgeY, centerY] : [z, center, rightWidth, centerY, edgeY]));
    // Narrow side bevels carry the crest down to the low perimeter sheet.
    for (const outer of [false, true]) course(P, rows.map(([z, lw, rw, , edgeY, ly, ry, floor]): Course => {
      const crest = side < 0 ? lw : rw, knee = Math.max(.950, crest + .001);
      const a = outer ? knee : crest, b = outer ? 1.017 : knee;
      const y0 = outer ? (side < 0 ? ly : ry) : edgeY, y1 = outer ? floor : (side < 0 ? ly : ry);
      return side < 0 ? [z, -b, -a, y1, y0] : [z, a, b, y0, y1];
    }));
  }
}

function deckChannels(P: TankBuilderPort): void {
  course(P, [[-3.1416261, -1.016487, 1.0213815, 1.5030174, 1.5030174],
    [-2.7543180, -1.016487, 1.0213815, 1.5030174, 1.5030174]]);
  course(P, [[-2.2954397, -.9782954, .9787834, 1.5000271, 1.5000271],
    [-2.1796689, -.9332488, .9787834, 1.4990298, 1.4990298]]);
  // Measured shallow approach ramp before the separate rectangular cover.
  course(P, [[-2.1922975, -.9332488, .9430392, 1.4990298, 1.4990298],
    [-2.1438844, -.9332488, .9430392, 1.5309306, 1.5309306]]);
}

function accessCover(P: TankBuilderPort): void {
  P.addEquipment('hullDetail', KIT.box(1.839565, .0707786, .7030495),
    .00856736, 1.54139757, -1.8007794);
  // Small hidden bearing feet are mechanical support inference, below the
  // source cover's underside; they do not enlarge its exterior envelope.
  for (const x of [-.75, .75]) for (const z of [-2.10, -1.50]) {
    P.addEquipment('hullDetail', KIT.box(.045, .035, .06), x, 1.494, z);
  }
}

function recessedLatch(P: TankBuilderPort, side: number): void {
  const shift = side < 0 ? .0078323 : 0;
  const mapX = (x: number) => side * x + shift;
  // The two unequal raised cheeks enclose an actual 39 mm-deep center,
  // rather than a single solid handle box across the aperture.
  const rows = [
    [-2.2764971, 1.5080021, 1.5080021, 1.5080021],
    [-2.2659709, 1.5470, 1.5440, 1.5468798],
    [-2.2554464, 1.5867565, 1.5817716, 1.5468798],
    [-2.2259777, 1.5858843, 1.5887501, 1.5468798],
    [-2.2217679, 1.5857592, 1.579445, 1.5468798],
    [-2.2070327, 1.5468798, 1.5468798, 1.5468798],
    [-2.1986139, 1.5080021, 1.5080021, 1.5080021],
  ];
  for (const [x0, x1, field] of [[.8823243, .9087653, 1], [.9087653, .9596875, 3], [.9596875, .9851487, 2]]) {
    course(P, rows.map(row => {
      const a = mapX(x0), b = mapX(x1), y = row[field];
      return [row[0], Math.min(a, b), Math.max(a, b), y, y];
    }));
  }
}

export function addT90SMEngineDeck(P: TankBuilderPort): void {
  steppedCoolingCover(P);
  deckChannels(P);
  accessCover(P);
  recessedLatch(P, -1);
  recessedLatch(P, 1);
}
