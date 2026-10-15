import type { AerialView } from '../sim/matchModes.ts';
import { t } from './i18n.ts';

/**
 * The drone control as the HUD shows it: the tank's control row (launch, the cooldown) and the flight console's return
 * button. The authority decides every transition (sim/aerialCombat.ts, timed by sim/droneRecall.ts) and sends the view;
 * this only reads it. Owner 2026-10-14: no recall before the pilot is in the drone's feed (`locked`), a recalled drone
 * flies home and lands (`returning`), then the shorter recall cooldown runs.
 */
type DronePhase = 'ready' | 'locked' | 'flying' | 'returning' | 'cooldown';
type DroneFlight = Pick<AerialView, 'active' | 'cooldownS' | 'recallS' | 'returnS'>;

export function dronePhase(flight: DroneFlight | null | undefined): DronePhase {
  if (!flight) return 'ready';
  if (flight.active) return (flight.recallS ?? 0) > 0 ? 'locked' : 'flying';
  if ((flight.returnS ?? 0) > 0) return 'returning';
  return flight.cooldownS > 0 ? 'cooldown' : 'ready';
}

interface DroneControl { phase: DronePhase; disabled: boolean; label: string }
const scratch: DroneControl = { phase: 'ready', disabled: false, label: '' };
/** The tank row's drone control: whether a press can act, and its label (written into `out`; the HUD reads it per frame). */
export function droneControl(flight: DroneFlight | null | undefined, canControl: boolean, out: DroneControl = scratch): DroneControl {
  const phase = dronePhase(flight);
  out.phase = phase;
  out.disabled = !canControl || (phase !== 'ready' && phase !== 'flying');
  out.label = phase === 'flying' || phase === 'locked' ? t('systems.drone.return')
    : phase === 'returning' ? t('systems.drone.returning')
      : phase === 'cooldown' ? `${Math.ceil(flight!.cooldownS)}s` : t('systems.drone');
  return out;
}
