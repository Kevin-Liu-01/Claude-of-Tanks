// Independent source-sized flank equipment. The left rear carrier is open;
// the starboard forward housing is closed and substantially wider.
import * as THREE from 'three';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Pivot = readonly [number, number, number];
const { box } = KIT;

function part(P: TankBuilderPort, pivot: Pivot, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, yaw = 0): void {
  // Welded stowage cases carry the turret camouflage; only straps/latches
  // stay in the flat detail tone.
  P.addEquipment('turretPaintedDetail', markFixedPaintedPanel(geometry, 'chieftain10-x-stowage', 'turretDetail'),
    x - pivot[0], y - pivot[1], z - pivot[2], 0, yaw);
}

function rearBody(P: TankBuilderPort, pivot: Pivot): void {
  // Source bone_turret_39.002's 3.11 m total width includes separate
  // carriers. The actual closed central body is only 1.559 m wide.
  const ring: [number, number][] = [[-.75623, 1.872005], [.702827, 1.872005],
    [.752827, 1.922005], [.752827, 2.255645], [.702827, 2.305645],
    [-.756234, 2.305645], [-.806234, 2.255645], [-.806234, 1.922005]];
  part(P, pivot, sectionSolid([-2.090355, -1.622933].map(z => ({ z, ring }))), 0, 0, 0);
  part(P, pivot, box(1.580701, .447394, .049032), -.0267035, 2.088782, -2.105929);
  part(P, pivot, box(1.82935, .481904, .048762), -.000008, 2.100627, -1.598554);
  part(P, pivot, box(.41379, .36295, .091781), -.538979, 2.112461, -2.1763335);
  for (const y of [1.946, 2.229]) {
    part(P, pivot, box(.43242, .04329, .11525), .631906, y, -2.10803);
  }
}

function closedHousings(P: TankBuilderPort, pivot: Pivot): void {
  // Ex_armor_turret_02 large planes: vertical outer wall, transverse roof
  // bevel and a separately chamfered underside, not a broad level slab.
  const right: [number, number][] = [[.941348, 2.20], [1.34, 1.826807],
    [1.70132, 1.826807], [1.869747, 1.87880], [1.869747, 2.32846],
    [1.707075, 2.433726], [.941348, 2.433726]];
  part(P, pivot, sectionSolid([-.157288, .492022].map(z => ({ z, ring: right }))), 0, 0, 0);
  const left: [number, number][] = [[-1.552345, 1.903290], [-1.15, 1.903290],
    [-1.114535, 2.24], [-1.143805, 2.399861], [-1.554655, 2.30050]];
  part(P, pivot, sectionSolid([-.478207, .300744].map(z => ({ z, ring: left }))), 0, 0, 0);
  // Measured thin rear return of the starboard housing. Keep it separate
  // from the narrower sloping stowage case behind it.
  const returnRing: [number, number][] = [[1.80, 1.964396], [1.846, 1.964396],
    [1.846, 2.284956], [1.80, 2.284956]];
  part(P, pivot, sectionSolid([-.458164, -.057514].map(z => ({ z,
    ring: returnRing.map(([x, y]) => [x + (z + .458164) * .135, y]),
  }))), 0, 0, 0);
}

function rightCases(P: TankBuilderPort, pivot: Pivot): void {
  // Source ex_decor_06 main case is an oblique rectangular body. Its
  // repeated outer normal is [.93301,~0,-.35985], not a Z-parallel wall.
  const angle = Math.atan2(.3598466, .9330107);
  part(P, pivot, box(.354, .408261, .837), 1.462898, 2.1476045, -.829497, angle);
  part(P, pivot, box(.365, .011, .846), 1.462898, 2.351425, -.829497, angle);
  // Independent aft can and restrained upper handle; the central void
  // above the long case is left open rather than filled to its highest lid.
  part(P, pivot, box(.218, .407, .275), 1.31506, 2.14727, -1.44543, .588);
  part(P, pivot, box(.205, .040, .225), 1.3293, 2.384, -1.42545, .588);
  part(P, pivot, box(.51, .277, .105), 1.56166, 2.237, -.29086, .035);
}

function leftOpenCarrier(P: TankBuilderPort, pivot: Pivot): void {
  part(P, pivot, box(.56965, .022, 1.09354), -1.26423, 1.931164, -1.081883);
  // Source bone_turret_39.008 has separate thin upper/lower carrier
  // surfaces around this empty bay. Native rails are closed solids.
  for (const x of [-1.539, -.989]) {
    part(P, pivot, box(.019, .022, 1.09354), x, 2.279, -1.081883);
    for (const z of [-1.617, -.546]) part(P, pivot, box(.019, .348, .020), x, 2.105, z);
  }
  for (const z of [-1.617, -.546]) part(P, pivot, box(.550, .022, .020), -1.264, 2.279, z);
  // The source retains an aft can and two narrower forward stores. Their
  // local boxes do not fill the held-out empty center at X-1.3/Z-1.2.
  part(P, pivot, box(.215, .490, .183), -1.2933, 2.200, -1.4562, -.78);
  for (const [x, z] of [[-1.3214, -.7717], [-1.1511, -.8334]]) {
    part(P, pivot, box(.145, .396, .225), x, 2.154, z, -.348);
  }
}

export function addChieftain10XStowage(P: TankBuilderPort, pivot: Pivot): void {
  rearBody(P, pivot);
  closedHousings(P, pivot);
  rightCases(P, pivot);
  leftOpenCarrier(P, pivot);
}
