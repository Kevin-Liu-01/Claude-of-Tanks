/**
 * The lobby's equipment sends (fire-fx-debounce-272 audit follow-up, release 273): a Garage pick or an in-lobby vehicle
 * change sends `select_equipment` only when the seat's equipment or consumables would change, and an identical pick
 * while one is in flight sends nothing more. Plan 020's rule for the room commands: send only what changed. The room
 * still takes a repeat from an older client (roomPolicy.ts applies it as before). Node-runnable.
 */
import { cleanConsumables, cleanEquipment } from './protocol.ts';

/** A `select_equipment` command as the Play menu writes it. */
export interface SelectEquipmentCommand {
  type: 'select_equipment';
  equipment: string[];
  consumables: string[];
}

/** A seat's equipment as the lobby shows it (`LobbyPlayer`); an older room may name no consumables. */
interface SeatEquipment {
  equipment: readonly string[];
  consumables?: readonly string[];
}

/** One comparable key for an equipment and consumables pick, as the room cleans and keeps them (slot order). */
function selectionKey(equipment: unknown, consumables: unknown): string {
  return `${cleanEquipment(equipment).join(',')}|${cleanConsumables(consumables).join(',')}`;
}

export interface EquipmentSelectionGate {
  /** Sends `command` unless the seat already holds that pick or the same pick is in flight; true when it sent. */
  send(seat: SeatEquipment | null | undefined, command: SelectEquipmentCommand): boolean;
  /** Forget the pick in flight (the seat left its room). */
  reset(): void;
}

/**
 * `deliver(command, failed)` sends the command and calls `failed` when the room refused it, so the same pick may go again.
 * The pick in flight ends when the seat shows it, or another pick replaces it.
 */
export function createEquipmentSelectionGate(deliver: (command: SelectEquipmentCommand, failed: () => void) => void): EquipmentSelectionGate {
  let inFlight: string | null = null;
  return {
    send(seat, command) {
      const wanted = selectionKey(command.equipment, command.consumables);
      if (seat && wanted === selectionKey(seat.equipment, seat.consumables ?? [])) { inFlight = null; return false; }
      if (wanted === inFlight) return false;
      inFlight = wanted;
      deliver(command, () => { if (inFlight === wanted) inFlight = null; });
      return true;
    },
    reset() { inFlight = null; },
  };
}
