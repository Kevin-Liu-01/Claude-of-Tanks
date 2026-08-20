// Shared presentation rules for resolved shell-hit events. Keep these rules
// out of individual panels so the kill-cam and shot report cannot drift.

import { penAtDistanceMm } from '../sim/ballistics.js';
import { RUNTIME_TANK_IDS, getSpec } from '../vehicles/specs.js';

/** Convert a simulation zone id into its player-facing label. */
export function zoneLabel(zone) {
  if (!zone) return '—';
  return zone
    .replace(/_(R|L)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ (r|l)$/, (match) => match.toUpperCase());
}

/** Remove a shell-type token already displayed by the surrounding panel. */
export function shellDisplayName(ev) {
  const type = (ev.shellType || '').trim();
  let name = (ev.shellName || '').trim();
  if (!type) return name;

  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  name = name.replace(new RegExp(`^${escapedType}\\s+|\\s+${escapedType}$`, 'i'), '');
  return name.toUpperCase() === type.toUpperCase() ? '' : name;
}

/**
 * Resolve the unrolled penetration baseline for a hit event. Legacy events
 * without an attacker spec are accepted only when their shell identity maps
 * to one penetration value across the entire roster.
 */
export function nominalPenFor(ev) {
  try {
    const spec = ev.attackerSpecId ? getSpec(ev.attackerSpecId) : null;
    const shells = spec?.gun?.shells;
    let shell = shells
      ? (shells.find((candidate) => (
        candidate.name === ev.shellName && candidate.type === ev.shellType
      )) || shells.find((candidate) => candidate.type === ev.shellType))
      : null;

    if (!shell && ev.shellName) {
      let resolvedPen = -1;
      for (const id of RUNTIME_TANK_IDS) {
        const candidates = getSpec(id).gun?.shells;
        if (!candidates) continue;
        for (const candidate of candidates) {
          if (candidate.name !== ev.shellName || candidate.type !== ev.shellType) continue;
          const pen = Math.round(penAtDistanceMm(candidate, ev.flightDistM || 0));
          if (resolvedPen === -1) {
            resolvedPen = pen;
            shell = candidate;
          } else if (pen !== resolvedPen) {
            return 0;
          }
        }
      }
    }

    return shell ? Math.round(penAtDistanceMm(shell, ev.flightDistM || 0)) : 0;
  } catch {
    return 0;
  }
}
