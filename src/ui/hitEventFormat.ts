import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared presentation rules for resolved shell-hit events. Keep these rules
// out of individual panels so the kill-cam and shot report cannot drift.

import { penAtDistanceMm } from '../sim/ballistics.ts';
import { RUNTIME_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { t } from './i18n.ts';

export interface HitEventPresentation {
  readonly kind?: string;
  readonly damage?: number;
  readonly modulesHit?: readonly { readonly newState?: string }[];
  readonly crewHit?: readonly RuntimeValue[];
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

export type IncomingHitArcKind = 'pen' | 'bounce' | 'he';

export interface IncomingHitFeedbackPresentation {
  readonly kind: IncomingHitArcKind;
  readonly outcomeId: HitOutcomeId;
  readonly label: string;
  readonly color: string;
  readonly numeric: boolean;
  readonly critical: boolean;
  readonly mergeKey: string;
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

// Translated label cache per outcome id. The canonical English strings remain
// the fallback when the catalog lookup misses (i18n.selftest verifies parity).
const HIT_OUTCOME_LABEL_KEYS: Readonly<Record<HitOutcomeId, string>> = Object.freeze({
  penetration: 'hud.hitOutcome.penetration',
  ricochet: 'hud.hitOutcome.ricochet',
  blocked: 'hud.hitOutcome.blocked',
  era_absorbed: 'hud.hitOutcome.era_absorbed',
  spaced_absorbed: 'hud.hitOutcome.spaced_absorbed',
  passed_through: 'hud.hitOutcome.passed_through',
  splash: 'hud.hitOutcome.splash',
  no_damage: 'hud.hitOutcome.no_damage',
  module_hit: 'hud.hitOutcome.module_hit',
});

/** Resolve the localized label for one outcome id. */
export function hitOutcomeLabel(id: HitOutcomeId): string {
  return t(HIT_OUTCOME_LABEL_KEYS[id] || 'hud.hitOutcome.no_damage');
}

/**
 * Canonical presentation for a resolved shell-hit event. HUD, shot reports,
 * incoming-fire cards, and the kill cam all consume this one vocabulary so a
 * ricochet cannot become RICOCHET in one surface and NO PENETRATION in another.
 * The `label` field is localized at this boundary so every consumer inherits
 * the translation without each panel re-resolving the key.
 */
export function hitOutcomeFor(ev: HitEventPresentation): HitOutcomePresentation & { label: string } {
  const damage = Number.isFinite(ev.damage) ? Math.max(0, ev.damage || 0) : 0;
  const componentHits = (ev.modulesHit?.length || 0) + (ev.crewHit?.length || 0);
  // A shell can destroy a track, optic, gun, or crew member without removing
  // hull HP. Preserve that tactically important result instead of flattening
  // it into PENETRATION or NO DAMAGE.
  const base = resolveHitOutcome(ev, damage, componentHits);
  return { ...base, label: hitOutcomeLabel(base.id) };
}

function resolveHitOutcome(
  ev: HitEventPresentation,
  damage: number,
  componentHits: number,
): HitOutcomePresentation {
  if (damage <= 0 && componentHits > 0) return HIT_OUTCOMES.module_hit;
  if (ev.kind === 'pen' || ev.kind === 'he_pen') return HIT_OUTCOMES.penetration;
  if (ev.kind === 'ricochet') return HIT_OUTCOMES.ricochet;
  if (ev.kind === 'he_splash') {
    return damage > 0 ? HIT_OUTCOMES.splash : HIT_OUTCOMES.no_damage;
  }
  if (ev.kind === 'era') return HIT_OUTCOMES.era_absorbed;
  if (ev.kind === 'spaced_absorb') return HIT_OUTCOMES.spaced_absorbed;
  if (ev.kind === 'screen_pierce') return HIT_OUTCOMES.passed_through;
  return HIT_OUTCOMES.blocked;
}

/**
 * One canonical, always-readable label for the camera-relative incoming-hit
 * indicator. Positive HP damage uses the historical signed number while every
 * zero-damage resolution keeps the shared combat-outcome vocabulary.
 */
export function incomingHitFeedbackFor(
  ev: HitEventPresentation,
): IncomingHitFeedbackPresentation {
  const damage = Number.isFinite(ev.damage) ? Math.max(0, Math.round(ev.damage || 0)) : 0;
  const outcome = hitOutcomeFor(ev);
  const kind: IncomingHitArcKind = ev.kind === 'he_splash'
    ? 'he'
    : (outcome.penetrated || damage > 0 || outcome.id === 'module_hit')
      ? 'pen'
      : 'bounce';
  const numeric = damage > 0;
  const critical = (ev.modulesHit?.length || 0) > 0 || (ev.crewHit?.length || 0) > 0;
  const label = numeric ? `-${damage}` : outcome.label;
  // Splash damage is deliberately amber: it is the distinct "yellow one"
  // from the original HUD. Direct damage stays salmon-red; outcome words use
  // the registry color consumed by the cards and kill cam.
  const color = numeric
    ? kind === 'he' ? '#ffd166' : '#ff8a72'
    : outcome.color;
  return {
    kind,
    outcomeId: outcome.id,
    label,
    color,
    numeric,
    critical,
    mergeKey: numeric ? `damage:${kind}` : `outcome:${outcome.id}`,
  };
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

function matchingPresentationShell(
  shells: readonly PresentationShell[] | undefined,
  event: HitEventPresentation,
): PresentationShell | null {
  if (!shells) return null;
  return shells.find((candidate) => (
    candidate.name === event.shellName && candidate.type === event.shellType
  )) || shells.find((candidate) => candidate.type === event.shellType) || null;
}

function globallyUnambiguousShell(event: HitEventPresentation): PresentationShell | null {
  if (!event.shellName) return null;
  let resolvedPen = -1;
  let resolvedShell: PresentationShell | null = null;
  for (const id of RUNTIME_TANK_IDS) {
    const candidates = shellsForSpec(id);
    if (!candidates) continue;
    for (const candidate of candidates) {
      if (candidate.name !== event.shellName || candidate.type !== event.shellType) continue;
      const pen = Math.round(penAtDistanceMm(candidate, event.flightDistM || 0));
      if (resolvedPen !== -1 && pen !== resolvedPen) return null;
      resolvedPen = pen;
      resolvedShell = candidate;
    }
  }
  return resolvedShell;
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
    const shell = matchingPresentationShell(shells, ev) || globallyUnambiguousShell(ev);
    return shell ? Math.round(penAtDistanceMm(shell, ev.flightDistM || 0)) : 0;
  } catch {
    return 0;
  }
}
