// Four independently authored screen plates per side. The raised clips are
// separate fittings; their outer extent must not widen the complete plate.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Row = readonly [z: number, lowerY: number, upperY: number];

function plate(P: TankBuilderPort, side: number, rows: readonly Row[],
  outer = 1.752016, inner = 1.737026): void {
  const left = side < 0 ? -outer : inner, right = side < 0 ? -inner : outer;
  P.addExternalArmor('hull', sectionSolid(rows.map(([z, low, top]) => ({ z,
    ring: [[left, low], [right, low], [right, top], [left, top]],
  }))));
}

function sheets(P: TankBuilderPort, side: number): void {
  plate(P, side, [[-3.189454, 1.151706, 1.236271], [-2.94, 1.045117, 1.239523],
    [-1.9172, .60810, 1.25262], [-1.735, .60810, 1.2550]]);
  plate(P, side, [[-1.735, .60805, 1.25498], [.1595, .607885, 1.27969]]);
  plate(P, side, [[.1620, .607882, 1.27968], [2.150599, .608102, 1.305622]]);
  plate(P, side, [[2.154645, .608069, 1.305696], [3.0825, .608069, 1.31805],
    [3.37, .903934, 1.322], [3.595, 1.135485, 1.301335],
    [3.596035, 1.2930, 1.301239]]);
}

function upperTabs(P: TankBuilderPort, side: number): void {
  // Eight raised sheet ears, each about 105 mm long with chamfered corners.
  // The shallow source baseline follows the lower carrier pitch.
  for (const [center, crown] of [[-3.05730, 1.32064], [-1.90697, 1.33570],
    [-1.45937, 1.34156], [-.15572, 1.35863], [.35571, 1.36532],
    [1.88092, 1.38529], [2.21772, 1.38967], [3.21892, 1.40278]]) {
    const bottom = 1.2760 + .01305 * center;
    plate(P, side, [[center - .0525, bottom, crown - .012],
      [center - .0425, bottom, crown - .0011],
      [center + .0425, bottom, crown],
      [center + .0525, bottom, crown - .010]], 1.749976, 1.737026);
  }
}

function clips(P: TankBuilderPort, side: number): void {
  // Twenty measured horizontal fittings, not a broadened structural skin.
  const stations = [[3.496080, 1.207739], [2.886725, 1.208494], [2.284705, 1.207239],
    [2.576110, .687819], [1.684504, 1.215612], [1.990094, .687827],
    [1.384924, .687827], [1.075149, 1.217397], [.470124, 1.213022],
    [.778364, .687827], [-1.203377, .687834], [.066323, .687835],
    [-.240937, 1.214644], [-.840867, 1.209734], [-1.370247, 1.210514],
    [-.562937, .687834], [-1.808279, .687826], [-1.965994, 1.205986],
    [-2.574304, 1.194746], [-3.106199, 1.187771]];
  for (const [z, y] of stations) P.addEquipment('hullDetail',
    KIT.box(.02146, y < 1 ? .01374 : .01482, .08033), side * 1.762216, y, z);
}

export function addChieftain10XSkirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    sheets(P, side);
    upperTabs(P, side);
    clips(P, side);
  }
}
