import { buildK2, type Modern3BuilderPort } from '../modern3.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, convexSlab } from './kit.ts';
import { buildK1A1XTurret } from './k1a1X.ts';
import { XK2_FRAME } from './xk2Frame.ts';

function buildXk2(P: TankBuilderPort & Modern3BuilderPort): void {
  buildK2(P, { hullOnly: true });
  // A fixed collar joins the deck to the donor's rotating bearing. The donor shell clears the deck fittings through a
  // full yaw. 267: it stands on the 1.56 m ring-well deck (1.55..1.69) instead of hovering 9 cm over its front half
  // (it was a 4 cm disc at 1.65..1.69, seated only on the 1.66 sponson roof behind the ring).
  P.add('hull', KIT.cylY(1.34, 1.34, .14, P.q ? 64 : 40), 0, 1.62, -.30);
  // The collar's front walls the slot under the glacis crest (deck 1.56, crest plate 1.63..1.66 at z 1.12..1.30); a
  // ramp from the deck up under the crest closes that well. It stays under the glacis top, clear of the gun's sweep.
  P.add('hull', convexSlab(
    [-1.66, 1.555, 1.02], [1.66, 1.555, 1.02], [1.66, 1.555, 1.29], [-1.66, 1.555, 1.29],
    [-1.66, 1.565, 1.02], [1.66, 1.565, 1.02], [1.66, 1.645, 1.29], [-1.66, 1.645, 1.29]));
  buildK1A1XTurret(P);
  P.turretG.position.set(...XK2_FRAME.turretPivot);
}

export const XK2_PROFILES = { xk2_black_panther: { build: buildXk2 } } as const;
