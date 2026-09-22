// Owner-directed SEPv3 side-protection package. The stock TUSK and SEPv2
// cassettes retain their own geometry; these deeper chamfered modules use
// the existing SEPv3 reactive banks and leave the wheel corridor untouched.
import { BoxGeometry } from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { closedSectionLoft, type XY } from './abramsSourceXGeometry.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';

const { box, cylX, cylZ } = KIT;

export function buildSepv3HeavySkirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? '_skirt_era_L' : '_skirt_era_R';
    const names = [...new Set(P.spec.armor.hullPlates
      .filter(p => p.kind === 'era' && p.name.endsWith(suffix)).map(p => p.name))];
    if (names.length !== 1) throw new Error(`${P.spec.id}: missing unique heavy skirt bank ${suffix}`);
    for (let i = 0; i < 8; i++) {
      const z = 2.655755 - i * .666455;
      // Permanent carrier penetrates the original receiving sheet. A spent
      // reactive bank exposes a continuous backed skirt, never an open hull.
      P.addExternalArmor('hull', new BoxGeometry(.09, .72, .625), side * 1.87, 1.035, z);
      for (const y of [.74, 1.35]) {
        P.addEquipment('hullDetail', box(.18, .055, .58), side * 1.92, y, z);
      }
      // Deep hinge shoulders and a cylindrical pivot belong to the carrier.
      for (const dz of [-.25, .25]) {
        P.addEquipment('hull', new BoxGeometry(.27, .10, .065), side * 1.97, 1.44, z + dz);
        P.addEquipment('hullDetail', cylZ(.035, .10, P.q ? 12 : 8), side * 2.075, 1.44, z + dz);
      }
    }
    P.destructibleCluster(names[0], () => {
      for (let i = 0; i < 8; i++) {
        const z = 2.655755 - i * .666455;
        // Raked upper/lower shoulders make each module read as thick armor,
        // rather than TUSK's flat rectangular sheet with extra surface boxes.
        const ring: XY[] = [[side * 1.91, .625], [side * 2.13, .625],
          [side * 2.215, .73], [side * 2.215, 1.32],
          [side * 2.11, 1.485], [side * 1.91, 1.485]];
        if (side < 0) ring.reverse();
        const shell = closedSectionLoft([{z:z-.314,ring},{z:z+.314,ring}]);
        shell.name = `sepv3HeavySkirt_${side}_${i}`;
        markEraHitFaces(shell, [side, 0, 0], .05);
        P.addExternalArmor('hull', shell);
        // Recessed-looking face course, fasteners and raised lifting grip.
        P.addEquipment('hullDetail', markEraFurniture(box(.012, .018, .51)), side * 2.223, 1.05, z);
        for (const dz of [-.245, .245]) for (const y of [.79, 1.26]) {
          P.addEquipment('hullDetail', markEraFurniture(cylX(.017, .018, 6)), side * 2.226, y, z + dz);
        }
        for (const dz of [-.08, .08]) P.addEquipment('hullDetail',
          markEraFurniture(box(.036, .035, .027)), side * 2.20, 1.28, z + dz);
        P.addEquipment('hullDetail', markEraFurniture(cylZ(.012, .19, 8)), side * 2.225, 1.28, z);
      }
    });
    // A continuous top load rail joins the heavy package back to the fender;
    // short replaceable lower lips stop above the road-wheel axle line.
    P.addExternalArmor('hull', new BoxGeometry(.29, .07, 5.42), side * 1.96, 1.435, .323);
    for (let i = 0; i < 8; i++) P.addEquipment('hullRubber', box(.035, .09, .55),
      side * 1.96, .625, 2.655755 - i * .666455);
  }
  P.hullG.userData.sepv3HeavySkirts = { panelsPerSide:8, outerFaceM:2.215,
    receiverFaceM:1.82915, permanentBacking:true, retainedWheelStations:true };
}
