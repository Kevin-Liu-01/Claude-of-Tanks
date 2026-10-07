import { t } from './i18n.ts';

export interface KillContext {
  cause?: string | null;
  drone?: boolean;
  killerId?: string | null;
  victimId: string;
  killerTeam?: string;
  victimTeam?: string;
  playerId?: string | null;
}

function killRelationship(context: KillContext): 'self' | 'friendly' | 'you' | 'victim' | null {
  if (context.killerId === context.victimId) return 'self';
  if (context.killerId && context.killerTeam != null && context.killerTeam === context.victimTeam) return 'friendly';
  if (context.playerId == null) return null;
  if (context.killerId === context.playerId) return 'you';
  return context.victimId === context.playerId ? 'victim' : null;
}

/** Physical cause and relationship are separate: a friendly drone can rack a tank. */
export function killPresentation(context: KillContext) {
  const cause = context.cause === 'ammorack' ? 'ammorack' : context.drone ? 'drone' : context.cause || 'shot';
  const icon = ({ ammorack: 'ammoRack', drone: 'modeDrone', ram: 'killRam', fire: 'statusFire', impact: 'damage', fall: 'killFall' } as Record<string, string>)[cause] || 'skull';
  const label = t(`hud.kill.${['ammorack','drone','ram','fire','impact','fall'].includes(cause) ? cause : 'shot'}`);
  const relation = killRelationship(context);
  return { cause, icon, label, relation, relationIcon: relation === 'self' ? 'killSelf' : relation === 'friendly' ? 'killFriendly' : 'player', relationLabel: relation ? t(`hud.kill.${relation}`) : '' };
}

export function isDroneStrike(event: { shellName?: string | null }): boolean {
  return event.shellName === 'FPV shaped charge';
}
