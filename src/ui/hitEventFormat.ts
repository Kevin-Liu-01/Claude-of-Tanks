// Shared presentation rules for resolved shell-hit events. Keep these rules
// out of individual panels so the kill-cam and shot report cannot drift.

import { penAtDistanceMm } from '../sim/ballistics.ts';
import { RUNTIME_TANK_IDS, getSpec } from '../vehicles/specs.js';

export interface HitEventPresentation {
  readonly kind?: string;
  readonly damage?: number;
  readonly modulesHit?: readonly unknown[];
  readonly crewHit?: readonly unknown[];
  readonly zone?: string;
  readonly shellType?: string;
  readonly shellName?: string;
  readonly attackerSpecId?: string | null;
  readonly flightDistM?: number;
}

export type HitOutcomeId =
  | 'penetration'
  | 'ricochet'
  | 'blocked'
  | 'era_absorbed'
  | 'spaced_absorbed'
  | 'passed_through'
  | 'splash'
  | 'no_damage'
  | 'module_hit';

export interface HitOutcomePresentation {
  readonly id: HitOutcomeId;
  readonly label: string;
  readonly color: string;
  readonly icon: 'damage' | 'penetration' | 'shield';
  readonly penetrated: boolean;
  readonly blocked: boolean;
  readonly confirmTone: 'damage' | 'deflect';
}

const HIT_OUTCOMES = {
  penetration: {
    id: 'penetration', label: 'PENETRATION', color: '#f0a030', icon: 'penetration',
    penetrated: true, blocked: false, confirmTone: 'damage',
  },
  ricochet: {
    id: 'ricochet', label: 'RICOCHET', color: '#bcc8d2', icon: 'shield',
    penetrated: false, blocked: true, confirmTone: 'deflect',
  },
  blocked: {
    id: 'blocked', label: 'BLOCKED', color: '#8fa3b4', icon: 'shield',
    penetrated: false, blocked: true, confirmTone: 'deflect',
  },
  era_absorbed: {
    id: 'era_absorbed', label: 'ERA ABSORBED', color: '#9fabb5', icon: 'shield',
    penetrated: false, blocked: true, confirmTone: 'deflect',
  },
  spaced_absorbed: {
    id: 'spaced_absorbed', label: 'SPACED ABSORBED', color: '#9fabb5', icon: 'shield',
    penetrated: false, blocked: true, confirmTone: 'deflect',
  },
  passed_through: {
    id: 'passed_through', label: 'PASSED THROUGH', color: '#9fb0bf', icon: 'penetration',
    penetrated: false, blocked: false, confirmTone: 'deflect',
  },
  splash: {
    id: 'splash', label: 'SPLASH', color: '#ffb02e', icon: 'damage',
    penetrated: false, blocked: false, confirmTone: 'damage',
  },
  no_damage: {
    id: 'no_damage', label: 'NO DAMAGE', color: '#8fa3b4', icon: 'shield',
    penetrated: false, blocked: false, confirmTone: 'deflect',
  },
  module_hit: {
    id: 'module_hit', label: 'MODULE HIT', color: '#f0b04a', icon: 'damage',
    penetrated: false, blocked: false, confirmTone: 'damage',
  },
} as const satisfies Readonly<Record<HitOutcomeId, HitOutcomePresentation>>;

/**
 * Canonical presentation for a resolved shell-hit event. HUD, shot reports,
 * incoming-fire cards, and the kill cam all consume this one vocabulary so a
 * ricochet cannot become RICOCHET in one surface and NO PENETRATION in another.
 */
export function hitOutcomeFor(ev: HitEventPresentation): HitOutcomePresentation {
  if (ev.kind === 'pen' || ev.kind === 'he_pen') return HIT_OUTCOMES.penetration;
  if (ev.kind === 'ricochet') return HIT_OUTCOMES.ricochet;
  if (ev.kind === 'he_splash') {
    return (ev.damage || 0) > 0 ? HIT_OUTCOMES.splash : HIT_OUTCOMES.no_damage;
  }
  const componentHits = (ev.modulesHit?.length || 0) + (ev.crewHit?.length || 0);
  if ((ev.damage || 0) <= 0 && componentHits > 0) return HIT_OUTCOMES.module_hit;
  if (ev.kind === 'era') return HIT_OUTCOMES.era_absorbed;
  if (ev.kind === 'spaced_absorb') return HIT_OUTCOMES.spaced_absorbed;
  if (ev.kind === 'screen_pierce') return HIT_OUTCOMES.passed_through;
  return HIT_OUTCOMES.blocked;
}

interface PresentationShell {
  readonly name?: string;
  readonly type?: string;
  readonly pen100Mm: number;
  readonly pen1000Mm: number;
  readonly pen2000Mm?: number;
  readonly penetrationMm?: number;
  readonly pen0m?: number;
  readonly pen500m?: number;
}

function shellsForSpec(id: string): readonly PresentationShell[] | undefined {
  const spec = getSpec(id) as { readonly gun?: { readonly shells?: readonly PresentationShell[] } };
  return spec.gun?.shells;
}

/** Convert a simulation zone id into its player-facing label. */
export function zoneLabel(zone: string | null | undefined): string {
  if (!zone) return '—';
  return zone
    .replace(/_(R|L)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ (r|l)$/, (match) => match.toUpperCase());
}

/** Remove a shell-type token already displayed by the surrounding panel. */
export function shellDisplayName(ev: HitEventPresentation): string {
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
export function nominalPenFor(ev: HitEventPresentation): number {
  try {
    const shells = ev.attackerSpecId ? shellsForSpec(ev.attackerSpecId) : undefined;
    let shell = shells
      ? (shells.find((candidate) => (
        candidate.name === ev.shellName && candidate.type === ev.shellType
      )) || shells.find((candidate) => candidate.type === ev.shellType))
      : null;

    if (!shell && ev.shellName) {
      let resolvedPen = -1;
      for (const id of RUNTIME_TANK_IDS) {
        const candidates = shellsForSpec(id);
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
