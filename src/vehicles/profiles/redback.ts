// The AS21 Redback (release 269): STUB, replaced by the full build. First-party procedural geometry: Kevin B. Liu
// (NOTICE.md).
import { KIT } from './kit.ts';
import { REDBACK } from '../redbackDatums.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildRedback(P: TankBuilderPort): void {
  const { box } = KIT;
  P.add('hull', box(2 * REDBACK.halfWidthM, REDBACK.roofY - 0.5, REDBACK.noseZ - REDBACK.sternZ), 0, (REDBACK.roofY + 0.5) / 2, 0);
  P.turretG.position.set(REDBACK.ring[0], REDBACK.ring[1], REDBACK.ring[2]);
  P.add('turret', box(2.2, 0.8, 2.6), 0, 0.4, 0);
  P.gunG.position.set(REDBACK.trunnion[0], REDBACK.trunnion[1], REDBACK.trunnion[2]);
  KIT.buildGun(P, { len: REDBACK.barrelM, r: 0.05, evac: null, baseR: 0.08, collar: false });
  P.topY = REDBACK.roofY;
}
