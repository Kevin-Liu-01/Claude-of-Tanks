// The Strv 103 family's running gear (274): four 0.38 m road wheels on hydropneumatic arms, the front drive sprocket,
// the raised rear idler, two return rollers over an exposed top run (the fender and its lip: strv103Equipment.ts). One
// native course, every mark.
// (The fleet-wide hydropneumatic arm and strut part, lane hydro-arms-274, lands through KIT.buildRunningGear.)
// First-party: Kevin B. Liu (NOTICE.md).

import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Four 0.38 m road wheels on hydropneumatic arms, the front drive sprocket, the raised rear idler, two return rollers
 * over an exposed top run (one native course; every mark). Owner 2026-11-20 ("fix the weird sideskirts and like square
 * rings on the hulls"): the seven dark-inset skirt panels under the bins went; the S-tank shows its top run under a plain
 * fender edge (the reference prints and the period photographs), so one continuous lip closes the fender's outer edge. */
export function runningGear(P: TankBuilderPort, plateZ = -3.52): void {
  const { frustum } = KIT;
  KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, wheelR: 0.38, wheelW: 0.24,
    wheelY: 0.45, xc: 1.29,
    wheelZs: [1.40, 0.50, -0.33, -1.28],
    sprocket: { z: 2.16, y: 0.89, r: 0.32 },
    idler: { z: -2.01, y: 0.83, r: 0.26 },
    rollers: [{ z: 0.77, y: 1.06, r: 0.10 }, { z: -0.63, y: 1.06, r: 0.10 }],
    trackW: 0.65, trackTh: 0.075, topY: 1.20, botY: 0.04,
    arms: true, coveredTop: false, deadSag: 0.028,
  });
  P.add('hull', frustum(1.16, -2.55, plateZ + 0.02, 1.18, -2.53, plateZ, 1.10, 1.24));   // the tail wedge to the plate
}
