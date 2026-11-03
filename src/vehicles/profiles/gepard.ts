// Release 268 REGISTRAR PLACEHOLDER (R0): the Flakpanzer Gepard 1A2 on the shared Leopard 1 hull and running gear
// (profiles/leopard1Hull.ts, its real chassis) under a box turret with one 35 mm barrel on each side, so the id is a
// complete playable vehicle while builder G authors the measured Gepard turret in this file. Every firing datum is read
// from the spec (gepardSpecs.ts): the ring, the trunnion and the twin fire axes.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { KIT } from './kit.ts';
import { buildLeo1HullSteps } from './leopard1Hull.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** The placeholder turret body, as the spec's turret plates (gepardSpecs.ts BODY). */
const BODY = Object.freeze({ halfWidth: 1.10, floorY: .04, roofY: 1.04, rearZ: -1.65, frontZ: 1.15 });

function* buildGepard1A2Steps(P: TankBuilderPort): TankProfileBuild {
  // the Leopard 1 hull without the A5's glacis grousers and deck tools: the Gepard's turret sweeps that deck
  yield* buildLeo1HullSteps(P, { grouserRack: false, deckTools: false });
  yield 'buildGepardHull';
  const spec = P.spec;
  const [tx, ty, tz] = spec.armor.turretPivot;
  const [gx, gy, gz] = spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  const n = P.q ? 20 : 12;
  // the ring collar, sunk 2 cm into the deck and 2 cm into the body's floor, and the closed body on it
  P.add('turret', cylY(1.00, 1.04, BODY.floorY + .06, P.q ? 32 : 20), 0, (BODY.floorY + .06) / 2 - .04, 0);
  P.add('turret', box(BODY.halfWidth * 2, BODY.roofY - BODY.floorY, BODY.frontZ - BODY.rearZ), 0,
    (BODY.roofY + BODY.floorY) / 2, (BODY.frontZ + BODY.rearZ) / 2);
  P.add('turretDetail', box(.44, .26, .36), .52, BODY.roofY + .12, .80);
  P.add('turretGlass', box(.30, .12, .012), .52, BODY.roofY + .13, .985);
  const muzzleZ = spec.armor.gunBarrel.lengthM;
  (spec.gun.muzzles ?? []).forEach((axis, index) => {
    const x = axis.x ?? 0, y = axis.y ?? 0;
    const side = Math.sign(x) || 1;
    // the trunnion from inside the body out into the gun's cradle: a body of revolution about the pitch axis
    const inner = BODY.halfWidth - .10, outer = Math.abs(x) + .04;
    P.addGunExtra(cylX(.14, outer - inner, n), side * (inner + outer) / 2, y, 0);
    P.addGunExtra(box(.30, .36, .95), x, y, .05);
    P.add(`gunBarrel${index}`, cylZ(.065, muzzleZ - .48, n), x, y, (muzzleZ + .48) / 2);
    P.add(`gunBarrel${index}Dark`, cylZ(.085, .22, n), x, y, muzzleZ - .11);
    P.add(`gunBarrel${index}Dark`, cylZ(.03, .02, n), x, y, muzzleZ - .005);
  });
  P.muzzleZ = muzzleZ;
  P.topY = BODY.roofY + .25;
}

export const buildGepard1A2 = steppedBuilder(buildGepard1A2Steps);

export const GEPARD_PROFILES = {
  gepard_1a2: { build: buildGepard1A2 },
} as const;
