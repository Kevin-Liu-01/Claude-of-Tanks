// Original turned bearing, separate optical belt, hatch and MG supports.
// Measurements are fixed scalar witnesses of the local Mk10 source. No
// source mesh arrays or materials participate in these runtime primitives.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { libraryStationGun } from './libraryRoofMg.ts';
import { stationFromDrawnGun } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const { box, cylX, cylY } = KIT;
const X = -.4880325, Z = -.2796505;

function turned(rows: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([r, y]) => new THREE.Vector2(r, y)), 48);
}

function part(P: TankBuilderPort, pivot: Point, bucket: string,
  g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): void {
  P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], 0, yaw);
}

function bearing(P: TankBuilderPort, pivot: Point): void {
  // Source bone_mg_aa_h: its broad annular crown is 2.6205 m, not the
  // 2.824 m maximum of its separate local mounts. The chamfered underside
  // rises from 2.5653 to 2.6108 at the outer edge.
  const profile: readonly (readonly [number, number])[] = [[.270, 2.565348], [.422, 2.565348], [.460, 2.597543],
    [.500, 2.610839], [.517715, 2.613], [.517715, 2.6162],
    [.510, 2.619578], [.358, 2.620518], [.270, 2.620518], [.270, 2.565348]];
  part(P, pivot, 'turretDetail', turned(profile), X, 0, Z);
  P.addCupola('turretDetail', cylY(.427, .438, .082, 40), X - pivot[0],
    2.447 - pivot[1], Z - pivot[2]);
  // Independent opaque periscopes below the bearing. These are glazing
  // backed by a narrow inner body, not invented through-holes or a tall drum.
  part(P, pivot, 'turretDetail', cylY(.394, .410, .085, 40), X, 2.529, Z);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    // each block runs back into the inner body (a 17 mm pane at r 0.452 stood 3 cm off it; owner 2026-10-19 sweep)
    part(P, pivot, 'turretGlass', box(.214, .070, .052),
      X + Math.sin(a) * .426, 2.524, Z + Math.cos(a) * .426, a);
    part(P, pivot, 'turretDetail', box(.043, .090, .095),
      X + Math.sin(a + Math.PI / 10) * .447, 2.529,
      Z + Math.cos(a + Math.PI / 10) * .447, a + Math.PI / 10);
  }
}

function hatch(P: TankBuilderPort, pivot: Point): void {
  // Source hatch_04 has a domed skin: the highest ~2.774 m point is local
  // hinge/handle hardware, not a 540 mm diameter flat plate at that height.
  const dome = turned([[0, 2.619], [.239, 2.619], [.26999, 2.645],
    [.252, 2.674], [.200, 2.70965], [.120, 2.733], [0, 2.73832]]);
  P.addHatch('turretDetail', dome, -.4872885 - pivot[0], -pivot[1], -.4119 - pivot[2]);
  part(P, pivot, 'turretDetail', cylX(.030, .410, 24), -.4873, 2.666, -.642);
  for (const x of [-.665, -.31]) part(P, pivot, 'turretDetail',
    box(.055, .079, .108), x, 2.673, -.610);
  // Supported transverse handle retains air beneath its raised bridge.
  for (const x of [-.61, -.37]) part(P, pivot, 'turretDetail',
    box(.025, .041, .026), x, 2.7385, -.315);
  part(P, pivot, 'turretDetail', cylX(.013, .265, 20), -.49, 2.760, -.315);
}

function mount(P: TankBuilderPort, pivot: Point): void {
  // Source mg_mount_v has two separate inclined supports beside the gun,
  // not a solid pedestal under the complete 428 mm furniture envelope.
  for (const x of [-.415, -.296]) {
    const g = sectionSolid([[.006, 2.620, 2.644], [.200, 2.681, 2.712],
      [.272, 2.704, 2.736]].map(([z, low, high]) => ({ z,
      ring: [[x - .012, low], [x + .012, low], [x + .012, high], [x - .012, high]],
    })));
    part(P, pivot, 'turretDetail', g, 0, 0, 0);
  }
  part(P, pivot, 'turretDetail', box(.142, .025, .055), -.3555, 2.708, .202);
  part(P, pivot, 'turretDetail', cylX(.030, .155, 24), -.3555, 2.731, .247);
}

function machineGun(P: TankBuilderPort, pivot: Point): void {
  const mg = sourceMachineGun(P, pivot);
  // Independent source barrel sections fix X−.35805/Y2.7961. The earlier
  // generic MG was 102 mm left and 54 mm high, detached from this mount.
  // Owner 2026-10-28 ("... show actual machine guns that need to be actual machine guns of current dimensions"): the
  // cupola's L37 is the fleet's 7.62 mm construction at true length (libraryRoofMg.ts libraryStationGun, remote: the
  // commander fires it from inside the No. 15 cupola) on the source barrel's axis, in place of the drawn sections
  libraryStationGun(mg, { cls: 'mag', x: -.35805, boreY: 2.7961, pivotZ: .184 });
  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the exact gun is a working station (auxiliaryStation.ts)
  stationFromDrawnGun(mg.finish(), { name: 'chieftain10XCupolaGpmg', caliberMm: 7.62 });
}

export function addChieftain10XCupola(P: TankBuilderPort, pivot: Point): void {
  bearing(P, pivot);
  hatch(P, pivot);
  mount(P, pivot);
  machineGun(P, pivot);
}
