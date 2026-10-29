// The 2A4-era Leopard 2s on the release's construction (the owner, 2026-10-28: "update and cleanup our old designs for
// leopard 2a4 otco, 2a4v, 2a4m, 2a4, 2a4m can, and leopard 2 improved off of thhast good hull and redesingn the turrets off
// of our leopard 2a6 and have them be the before variants basically. annd also carry over the unique additions and
// decorations annd eqquipment and props each of those have onto those new details"): the release-262 Leopard 2-pattern
// hull and seven-wheel gear (leopard2Hull.ts), the 2A4 turret derived from our Leopard 2A6 (leopard2A4Turret.ts), and
// each vehicle's own kit re-seated on them. Docs: docs/references/tanks/leo2a4-family.md; datums and the combat envelope:
// leopard2A4FamilyArmor.ts; the specs: leopard2A4FamilySpecs.ts.
import { buildLeopard2Hull } from './leopard2Hull.ts';
import { buildLeopard2A4Turret, type Leopard2A4TurretOptions } from './leopard2A4Turret.ts';
import { addLeo2A4Kit, type Leopard2A4KitContext } from './leopard2A4Kit.ts';
import { addLeo2A4VKit } from './leopard2A4VKit.ts';
import { addLeo2A4MKit } from './leopard2A4A5nlKit.ts';
import { addLeo2A4MCanKit } from './leopard2A4CanKit.ts';
import { addLeo2A4OtcoKit } from './leopard2A4OtcoKit.ts';
import { addLeo2ImprovedKit } from './leopard2ImprovedKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M, EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z } from '../leopard2a3B4Armor.ts';
import { LEOPARD2A4_FAMILY_FRONT, LEOPARD2A4_FAMILY_GUN, type Leopard2A4FamilyId } from '../leopard2A4FamilyArmor.ts';

/** What sets one vehicle apart on the shared construction. */
interface Leopard2A4Variant {
  /** The rear mudguard flaps' articulation name (one per vehicle). */
  readonly flapName: string;
  readonly seed: number;
  /** Hull parts its kit replaces (the CAN's and the Improved's own skirts). */
  readonly hull?: { readonly skirts?: 'none' };
  /** What its turret leaves off or swaps (its kit brings the replacement). */
  readonly turret: Omit<Leopard2A4TurretOptions, 'gun' | 'front' | 'seed'>;
  readonly kit: (P: TankBuilderPort, ctx: Leopard2A4KitContext) => void;
}

const VARIANTS: Readonly<Record<Leopard2A4FamilyId, Leopard2A4Variant>> = Object.freeze({
  leo2a4: { flapName: 'leo2a4-rear-flap', seed: 26400, kit: addLeo2A4Kit,
    turret: { whips: false, rearBox: false, numberOffsetM: null } },
  leo2a4_v: { flapName: 'leo2a4v-rear-flap', seed: 26410, kit: addLeo2A4VKit,
    turret: { loaderMG: { cls: 'mag58', name: 'leo2a4vLoaderMag' }, rearBox: false, numberOffsetM: null } },
  leo2a4m: { flapName: 'leo2a4m-rear-flap', seed: 26420, kit: (P, ctx) => { addLeo2A4VKit(P, ctx); addLeo2A4MKit(P, ctx); },
    turret: { loaderMG: { cls: 'mag58', name: 'leo2a4mRemoteMag', remote: true }, rearBox: false, numberOffsetM: null } },
  leo2a4m_can: { flapName: 'leo2a4m-can-rear-flap', seed: 26430, kit: addLeo2A4MCanKit, hull: { skirts: 'none' },
    turret: { loaderMG: { cls: 'mag', name: 'leo2a4mCanLoaderC6' }, smoke: false, faceRails: false, faceLug: false,
      wallRails: false, sideBins: false, rearBox: false, whips: false, numberOffsetM: null } },
  leo2a4_otco: { flapName: 'leo2a4-otco-rear-flap', seed: 26440, kit: addLeo2A4OtcoKit,
    turret: { loaderMG: false, faceRails: false, wallRails: false, sideBins: false, rearBox: false, whips: false,
      numberOffsetM: null } },
  leo2_improved: { flapName: 'leo2-improved-rear-flap', seed: 26450, kit: addLeo2ImprovedKit, hull: { skirts: 'none' },
    turret: { loaderMG: { cls: 'mg3', name: 'leo2LoaderMg3' }, faceRails: false, wallRails: false, sideBins: false,
      rearBox: false, whips: false, numberOffsetM: null } },
});

function leopard2A4(id: Leopard2A4FamilyId): (P: TankBuilderPort) => void {
  const v = VARIANTS[id];
  return (P) => {
    // the forward lifting eyes forward on the upper glacis, clear of the turrets' sweep (as on the 262 early Leopards)
    buildLeopard2Hull(P, { flapName: v.flapName, exhaust: 'rods', foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M,
      fuelFillers: true, forwardLiftEyeZ: EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z, ...v.hull });
    buildLeopard2A4Turret(P, { ...v.turret, gun: LEOPARD2A4_FAMILY_GUN[id], front: LEOPARD2A4_FAMILY_FRONT[id], seed: v.seed });
    v.kit(P, { id, seed: v.seed });
    P.topY = 1.22;
  };
}

export const LEOPARD2A4_FAMILY_PROFILES = {
  leo2a4: { build: leopard2A4('leo2a4') },
  leo2a4_v: { build: leopard2A4('leo2a4_v') },
  leo2a4m: { build: leopard2A4('leo2a4m') },
  leo2a4m_can: { build: leopard2A4('leo2a4m_can') },
  leo2a4_otco: { build: leopard2A4('leo2a4_otco') },
  leo2_improved: { build: leopard2A4('leo2_improved') },
} satisfies VehicleProfileRecord;
