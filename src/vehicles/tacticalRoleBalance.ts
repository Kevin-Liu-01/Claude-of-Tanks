import { markFleetBalanceFinalized } from './fleetBalanceState.ts';
import { VEHICLE_ROLE_PROFILES, type TacticalDoctrine } from './roleProfiles.ts';
import type { TankSpecRegistry } from './specContracts.ts';

// Role tradeoffs layer on authored vehicle mobility and weapon identities. They do
// not replace calibers, loading mechanisms, armor or damage with class templates.
const HANDLING: Record<TacticalDoctrine, { hull: number; turret: number; aim: number; accuracy: number; move: number; turn: number }> = {
  assault: { hull: .95, turret: 1.04, aim: .96, accuracy: 1.02, move: 1.08, turn: .96 },
  flanker: { hull: 1.10, turret: 1.06, aim: 1, accuracy: 1.02, move: .85, turn: .88 },
  flexible: { hull: 1.02, turret: 1.02, aim: .98, accuracy: 1, move: .94, turn: .96 },
  precision: { hull: .94, turret: .95, aim: .98, accuracy: .94, move: 1.12, turn: 1.08 },
  siege: { hull: .90, turret: .92, aim: 1.05, accuracy: 1, move: 1.16, turn: 1.14 },
  scout: { hull: 1.16, turret: 1.12, aim: .95, accuracy: 1.08, move: .78, turn: .80 },
  recon: { hull: 1.12, turret: 1.10, aim: .94, accuracy: 1, move: .80, turn: .82 },
  support: { hull: 1.06, turret: 1.12, aim: .94, accuracy: 1, move: .88, turn: .86 },
  'armored-support': { hull: .94, turret: 1.06, aim: 1, accuracy: 1.03, move: 1.04, turn: 1 },
  'missile-support': { hull: 1.02, turret: .96, aim: .96, accuracy: .94, move: 1.12, turn: 1.10 },
};
const applied = new WeakSet<object>();
const rounded = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** Run after donor synchronization in BOTH browser and dedicated fleet assembly. */
export function applyTacticalRoleBalance(registry: TankSpecRegistry): void {
  if (applied.has(registry)) return;
  applied.add(registry);
  for (const [id, profile] of Object.entries(VEHICLE_ROLE_PROFILES)) {
    const spec = registry[id];
    if (!spec) throw new Error(`Missing tactical role vehicle: ${id}`);
    const tuning = HANDLING[profile.doctrine];
    spec.hullTraverseDegS = rounded(spec.hullTraverseDegS * tuning.hull, 1);
    spec.turretTraverseDegS = rounded(spec.turretTraverseDegS * tuning.turret, 1);
    // Clone nested tuning: replicas may have borrowed the donor's gun record.
    spec.gun = { ...spec.gun, aimTimeS: rounded(spec.gun.aimTimeS * tuning.aim),
      baseAccuracy: rounded(spec.gun.baseAccuracy * tuning.accuracy, 3),
      bloom: { ...spec.gun.bloom,
        move: rounded(spec.gun.bloom.move * tuning.move, 4),
        hullRot: rounded(spec.gun.bloom.hullRot * tuning.turn, 4),
        turret: rounded(spec.gun.bloom.turret * tuning.turn, 4),
      },
    };
  }
  // Barak keeps advanced tracking and protection, with a longer stationary
  // settle than the lighter precision platforms rather than dominating both.
  registry.merkava4_barak.gun.baseAccuracy = .26;
  registry.merkava4_barak.gun.aimTimeS = 1.35;
  markFleetBalanceFinalized(registry);
}
