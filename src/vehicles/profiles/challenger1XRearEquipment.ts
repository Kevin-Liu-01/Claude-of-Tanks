// Original exterior fittings informed by MoD AESP 2350-P-100-201 Fig.20.
// These drawing-led dimensions are construction estimates, not AI or scan
// measurements. The existing hull and handbook envelope remain unchanged.
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ, torus } = KIT;

export function addChallenger1XRearEquipment(P: TankBuilderPort): void {
  // A visible beam has an actual permanent-root overlap; the former beam
  // ended 18 mm inside the armor and was absent from a rearward view.
  P.addEquipment('hullDetail', box(2.17, .13, .080), 0, 1.154, -4.153);
  P.addEquipment('hullDetail', box(.24, .205, .066), 0, 1.472, -4.131);
  P.addEquipment('hullDetail', cylZ(.088, .066, 24), 0, 1.472, -4.159);

  for (const side of [-1, 1]) {
    // Separate A-frame legs leave the rear plate visible between them.
    // Their stock joins the swivel above and the beam below, without a
    // filled triangular substitute or a detached roof/turret attachment.
    const dx = side * .93, dy = -.346;
    const leg = box(Math.hypot(dx, dy), .067, .050)
      .rotateZ(Math.atan2(dy, dx));
    P.addEquipment('hullDetail', leg, dx / 2, 1.50 + dy / 2, -4.167);
    P.addEquipment('hullDetail', box(.13, .13, .095), dx, 1.176, -4.125);

    // KIT's torus starts horizontal; turn it to retain the rear-visible
    // XY opening shown by the drawing, with permanent armor behind it.
    P.addEquipment('hullDetail', torus(.060, .018, 24, 8), dx, 1.285, -4.170, Math.PI / 2);
    P.addEquipment('hullDetail', box(.34, .21, .12), side * 1.20, 1.483, -4.130);
  }
}
