// Photo-led original external bins and receiving fittings. The 2018 Army
// loading/repair views establish the side assemblies, not surveyed dimensions.
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function addStrv122XBustle(P: TankBuilderPort, pivot: readonly [number, number, number]): void {
  const add = (g: ReturnType<typeof KIT.box>, x: number, y: number, z: number) =>
    P.addEquipment('turretDetail', g, x - pivot[0], y - pivot[1], z - pivot[2]);
  for (const side of [-1, 1]) {
    // A closed outboard bin has an inboard root inside the tapered permanent
    // bustle at both ends. The original rear undercut remains completely open.
    add(KIT.box(.38, .32, .69), side * 1.33, 2.275, -1.785);
    add(KIT.box(.39, .023, .705), side * 1.335, 2.443, -1.785);
    for (const z of [-2.01, -1.57]) {
      add(KIT.cylZ(.022, .092, 12), side * 1.518, 2.430, z);
      add(KIT.box(.033, .17, .033), side * 1.533, 2.282, z);
      add(KIT.box(.052, .045, .074), side * 1.538, 2.220, z);
    }
    // Two shallow folded handles are open laterally, not dark rectangles.
    for (const y of [2.190, 2.355]) {
      for (const z of [-1.88, -1.72]) add(KIT.box(.10, .021, .022), side * 1.558, y, z);
      add(KIT.box(.022, .021, .182), side * 1.602, y, -1.80);
    }
  }
}
