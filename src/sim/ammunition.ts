/**
 * Canonical per-shell ammunition inventory shared by solo and network authority.
 * Counts represent shots remaining, including any round currently ready to fire.
 */

export interface AmmunitionShellSpec {
  type?: string;
  count?: number | null;
}

export interface AmmunitionState {
  ammo: number[];
  ammoCapacity: number[];
}

export interface AmmunitionPickupResult {
  added: number[];
  totalAdded: number;
}

function normalizedCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export const DEFAULT_AMMUNITION_BY_TYPE: Readonly<Record<string, number>> = Object.freeze({
  AP: 24,
  APCR: 20,
  APFSDS: 24,
  HEAT: 16,
  HE: 12,
});

/** Resolve one authored capacity, preserving the former loadout defaults. */
export function shellAmmunitionCapacity(
  shell: AmmunitionShellSpec | null | undefined,
): number {
  const authored = Number(shell?.count);
  if (shell?.count != null && Number.isFinite(authored) && authored >= 0) {
    return Math.floor(authored);
  }
  return DEFAULT_AMMUNITION_BY_TYPE[String(shell?.type || '')] ?? 20;
}

export function createAmmunitionState(
  shells: readonly AmmunitionShellSpec[] | null | undefined,
): AmmunitionState {
  const ammoCapacity = Array.isArray(shells)
    ? shells.map(shellAmmunitionCapacity)
    : [];
  return { ammo: ammoCapacity.slice(), ammoCapacity };
}

export function hasAmmunition(
  state: Partial<AmmunitionState> | null | undefined,
  slot: number,
): boolean {
  if (!Number.isInteger(slot)) return false;
  const index = slot;
  return index >= 0 && index < (state?.ammo?.length || 0) &&
    normalizedCount(state!.ammo![index]) > 0;
}

/** Return the first stocked shell slot, or -1 when every channel is empty. */
export function firstAvailableAmmunitionSlot(
  state: Partial<AmmunitionState> | null | undefined,
): number {
  if (!Array.isArray(state?.ammo)) return -1;
  return state!.ammo!.findIndex((count) => normalizedCount(count) > 0);
}

/** Consume exactly one shot. Authorities call this immediately before spawn. */
export function consumeAmmunition(
  state: Partial<AmmunitionState> | null | undefined,
  slot: number,
): boolean {
  if (!hasAmmunition(state, slot)) return false;
  const index = slot;
  state!.ammo![index] = normalizedCount(state!.ammo![index]) - 1;
  return true;
}

/**
 * Replenish every authored ammunition channel by a fraction of its original
 * capacity. A non-full channel always receives at least one round, so rare
 * missiles benefit from the same field cache as cannon ammunition.
 */
export function replenishAmmunition(
  state: Partial<AmmunitionState> | null | undefined,
  capacityFraction = 0.2,
): AmmunitionPickupResult {
  const ammo = state?.ammo;
  const capacity = state?.ammoCapacity;
  const added = new Array(Math.max(ammo?.length || 0, capacity?.length || 0)).fill(0);
  let totalAdded = 0;
  if (!Array.isArray(ammo) || !Array.isArray(capacity)) return { added, totalAdded };
  const fraction = Number.isFinite(capacityFraction)
    ? Math.max(0, capacityFraction) : 0.2;
  for (let slot = 0; slot < Math.min(ammo.length, capacity.length); slot++) {
    const cap = Math.max(0, Math.floor(Number(capacity[slot]) || 0));
    const current = Math.max(0, Math.min(cap, Math.floor(Number(ammo[slot]) || 0)));
    const grant = current < cap ? Math.max(1, Math.ceil(cap * fraction)) : 0;
    const next = Math.min(cap, current + grant);
    added[slot] = next - current;
    ammo[slot] = next;
    totalAdded += added[slot];
  }
  return { added, totalAdded };
}

export function totalAmmunition(
  state: Partial<AmmunitionState> | null | undefined,
): number {
  return Array.isArray(state?.ammo)
    ? state!.ammo!.reduce((sum, count) => sum + normalizedCount(count), 0)
    : 0;
}

export function totalAmmunitionCapacity(
  state: Partial<AmmunitionState> | null | undefined,
): number {
  return Array.isArray(state?.ammoCapacity)
    ? state!.ammoCapacity!.reduce(
      (sum, count) => sum + normalizedCount(count), 0,
    )
    : 0;
}
