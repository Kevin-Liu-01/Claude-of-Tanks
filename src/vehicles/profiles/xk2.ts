import { buildK2, type Modern3BuilderPort } from '../modern3.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { buildK1A1XTurret } from './k1a1X.ts';
import { XK2_FRAME } from './xk2Frame.ts';

function buildXk2(P: TankBuilderPort & Modern3BuilderPort): void {
  buildK2(P, { hullOnly: true });
  // A shallow fixed collar joins the 1.66 m deck to the donor's rotating
  // bearing. The donor shell clears the deck fittings through a full yaw.
  P.add('hull', KIT.cylY(1.34, 1.34, .04, P.q ? 64 : 40), 0, 1.67, -.30);
  buildK1A1XTurret(P);
  P.turretG.position.set(...XK2_FRAME.turretPivot);
}

export const XK2_PROFILES = { k2: { build: buildXk2 } } as const;
