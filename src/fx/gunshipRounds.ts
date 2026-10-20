/**
 * gunshipRounds.ts — which of the AC-130's three guns a round or a shot belongs to (lane ac130-fx-228, 2026-10-19; the
 * owner: "make our ac 130 use our new tracers and rocket effects and so on, get rid of the old ones").
 *
 * Pure (no three, no DOM): one resolver the tracers, the missile looks and the muzzle all read, so the gunship's rounds
 * draw through the October effects (projectileTracers.ts, missileLooks.ts and its trails, bodies and launch recipes) by
 * one rule:
 *   - a local round carries its reload group (sim/matchRuleset.ts GUNSHIP_WEAPONS) and its sound profile;
 *   - a networked round carries only its type and guidance (mp/presentation/battlePresentation.ts MatchShell), so its
 *     firing aircraft decides: guided is the missile, HE the howitzer, anything else the autocannon.
 */
import { GUNSHIP_WEAPONS } from '../sim/matchRuleset.ts';

export type GunshipRound = 'cannon' | 'howitzer' | 'missile';

const BY_GROUP: Readonly<Record<string, GunshipRound>> = Object.freeze({
  'gunship-cannon': 'cannon', 'gunship-howitzer': 'howitzer', 'gunship-missile': 'missile',
});
const BY_SOUND: Readonly<Record<string, GunshipRound>> = Object.freeze({
  'gunship-autocannon': 'cannon', 'gunship-howitzer': 'howitzer', 'gunship-missile': 'missile',
});
const GROUP_OF: Readonly<Record<GunshipRound, string>> = Object.freeze({
  cannon: 'gunship-cannon', howitzer: 'gunship-howitzer', missile: 'gunship-missile',
});

interface GunshipRoundSpec {
  reloadGroup?: string | null;
  soundProfile?: string | null;
  type?: string | null;
  guided?: boolean | null;
}

/** The gun a round in flight came from, or null when it is not the gunship's. */
export function gunshipRoundOf(spec: GunshipRoundSpec | null | undefined, shooterIsGunship: boolean): GunshipRound | null {
  const group = spec?.reloadGroup;
  if (group && BY_GROUP[group]) return BY_GROUP[group];
  const sound = spec?.soundProfile;
  if (sound && BY_SOUND[sound]) return BY_SOUND[sound];
  if (!shooterIsGunship) return null;
  if (spec?.guided === true) return 'missile';
  return spec?.type === 'HE' ? 'howitzer' : 'cannon';
}

/** The gun a shot event came from (its launch sound first, else its firing aircraft and the round's type and guidance). */
export function gunshipShotOf(weaponSound: string | null | undefined, shooterIsGunship: boolean, shellType?: string | null,
  guided?: boolean | null): GunshipRound | null {
  if (weaponSound && BY_SOUND[weaponSound]) return BY_SOUND[weaponSound];
  if (!shooterIsGunship) return null;
  return gunshipRoundOf({ type: shellType, guided }, true);
}

/** The gun's calibre (mm) as the ruleset names it (a networked round carries none). */
export function gunshipCaliberMm(round: GunshipRound): number {
  const group = GROUP_OF[round];
  return GUNSHIP_WEAPONS.find((w) => w.reloadGroup === group)?.caliberMm ?? (round === 'cannon' ? 30 : 152);
}
