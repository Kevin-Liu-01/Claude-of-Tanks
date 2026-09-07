interface AmmoSelectionTank {
  isPlayer?: boolean;
  /** Last slot received from authority; absent in solo play. */
  _networkShellSlot?: number;
  /** Covers a pending cancellation even when it returns to the old slot. */
  _networkAmmoSelectionPending?: boolean;
  input?: { shellSlot?: number } | null;
  combat?: { destroyed?: boolean; ammo?: readonly number[] } | null;
}

function isAmmoSlot(slot: number | undefined): slot is number {
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot <= 2;
}

/** Stateless presentation only: never change selected ammo, reload or input. */
export function pendingAmmoSelectionSlot(player: AmmoSelectionTank | null): number | null {
  if (!player || player.isPlayer === false || !player.combat || player.combat.destroyed) return null;
  const requested = player.input?.shellSlot;
  const authoritative = player._networkShellSlot;
  if (!isAmmoSlot(requested) || !isAmmoSlot(authoritative)) return null;
  if (requested === authoritative && player._networkAmmoSelectionPending !== true) return null;
  const ammo = player.combat.ammo?.[requested];
  // Rejected/depleted channels must not leave an indefinite SWITCHING label.
  return typeof ammo === 'number' && Number.isFinite(ammo) && ammo > 0 ? requested : null;
}
