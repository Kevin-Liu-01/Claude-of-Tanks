/**
 * finalBlow.ts — the report's final-blow line (battle endings, owner 2026-09-25): who fired the shot that
 * ended the battle, whom it destroyed and with what, from the resolved events shotInfo.ts already ledgers —
 * the last lethal `shell:hit` and the last `tank:destroyed`. Nothing is recomputed: a ram or a burn-out has no
 * lethal shell and reads from the destruction's cause and killer alone.
 */
import { t } from './i18n.ts';

export interface FinalBlowLethal {
  attackerId: string | null;
  attackerName: string | null;
  targetId: string | null;
  targetName: string | null;
  shellName: string | null;
  shellType: string | null;
}

export interface FinalBlowDestroyed {
  id: string;
  killerId: string | null;
  cause: string | null;
}

export type FinalBlowCause = 'shot' | 'ammorack' | 'ram' | 'fire';

export interface FinalBlow {
  cause: FinalBlowCause;
  attacker: string | null;
  target: string;
  /** The shell's display name for a shot; null for a ram or a burn-out. */
  shell: string | null;
  attackerIsPlayer: boolean;
  targetIsPlayer: boolean;
}

const asCause = (value: string | null | undefined): FinalBlowCause =>
  (value === 'ammorack' || value === 'ram' || value === 'fire' ? value : 'shot');

/**
 * @param lethal the last lethal shell hit on any pair (null when the battle saw none)
 * @param destroyed the last destruction the bus announced
 * @param playerId the viewer's entity id (null: no player perspective)
 * @param nameOf the ledger's display name for an entity id
 */
export function resolveFinalBlow(
  lethal: FinalBlowLethal | null,
  destroyed: FinalBlowDestroyed | null,
  playerId: string | null,
  nameOf: (id: string) => string | null,
): FinalBlow | null {
  if (!destroyed) return null;
  const cause = asCause(destroyed.cause);
  const lethalMatches = !!(lethal && lethal.targetId === destroyed.id);
  const target = nameOf(destroyed.id) || (lethalMatches && lethal ? lethal.targetName : null) || destroyed.id;
  let attackerId: string | null = destroyed.killerId;
  let attacker: string | null = attackerId ? nameOf(attackerId) : null;
  let shell: string | null = null;
  if ((cause === 'shot' || cause === 'ammorack') && lethalMatches && lethal) {
    attackerId = lethal.attackerId ?? attackerId;
    attacker = lethal.attackerName || attacker || (attackerId ? nameOf(attackerId) : null);
    shell = lethal.shellName || lethal.shellType || null;
  }
  return {
    cause,
    attacker,
    target,
    shell,
    attackerIsPlayer: !!(playerId && attackerId === playerId),
    targetIsPlayer: !!(playerId && destroyed.id === playerId),
  };
}

/** The hero line under the verdict: "Final blow — A destroyed B with X" and its ram / fire / you variants. */
export function finalBlowLine(blow: FinalBlow): string {
  const attacker = blow.attacker || t('killcam.enemy');
  if (blow.cause === 'ram') return t('endScreen.finalBlow.ram', { attacker, target: blow.target });
  if (blow.cause === 'fire') return t('endScreen.finalBlow.fire', { target: blow.target });
  const shell = blow.shell || t('killcam.enemyFire');
  if (blow.attackerIsPlayer) return t('endScreen.finalBlow.byYou', { target: blow.target, shell });
  if (blow.targetIsPlayer) return t('endScreen.finalBlow.onYou', { attacker, shell });
  return t('endScreen.finalBlow.shot', { attacker, target: blow.target, shell });
}
