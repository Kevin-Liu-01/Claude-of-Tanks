/**
 * Which of the battle's events a paired phone feels (docs/PHONE-CONTROLLER.md "Haptics"), pure and Node-runnable: the
 * desktop's side, which padReceiver.ts runs on the bus to send each cue the moment it happens. Every cue is the tank's
 * own: its gun, its hits, its hull. The buzz each cue plays is the phone's (padBuzz.ts), so none of this rides to a phone.
 */
import type { PadCue } from './padProtocol.ts';

/** The battle's bus events a receiver listens to for its tank's cues. `ammo_selection_denied` is the core's input stage's
 *  refusal of a seat's shell pick (sim/playerInputStage.ts), which names its tank: the couch runtime's emit puts it on the
 *  page bus for every seat (round 8 merge review r1). */
export const PAD_CUE_EVENTS = [
  'shell:fired', 'shell:hit', 'module:state', 'tank:fire', 'tank:impact', 'tank:destroyed', 'player:spotted',
  'ui:consumableDenied', 'ui:ammoSelectionDenied', 'ammo_selection_denied', 'ui:autoAimState',
] as const;

/** Whose cues: the tank's id, and whether it is the page's player (the events that name no tank, the sixth sense, the
 *  page's refusals and the sight's lock, are the player's; a couch seat other than the player's has none of them, but
 *  its own refused shell pick names its tank). */
export interface PadCueOwner {
  id: string | null;
  player: boolean;
}

export interface PadCueEvent {
  c: PadCue;
  m?: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const field = (payload: unknown, name: string): unknown =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined;
const num = (payload: unknown, name: string): number => Number(field(payload, name)) || 0;

/** The cue one bus event means to this owner's phone, or null (another tank's business, or nothing to feel). */
export function padCueOf(type: string, payload: unknown, owner: PadCueOwner): PadCueEvent | null {
  const me = owner.id;
  switch (type) {
    case 'shell:fired':
      // a heavier gun kicks harder: 20 mm is a flick, 150 mm and up the full thump
      return me && field(payload, 'shooterId') === me ? { c: 'shot', m: clamp01((num(payload, 'caliberMm') - 20) / 130) } : null;
    case 'shell:hit': {
      if (!me || field(payload, 'kind') === 'heal') return null;
      const target = field(payload, 'targetId');
      const damage = num(payload, 'damage');
      if (target === me) return damage > 0 ? { c: 'hurt', m: clamp01(0.2 + damage / 600) } : { c: 'glance' };
      if (field(payload, 'attackerId') === me && typeof target === 'string' && target) return { c: damage > 0 ? 'hit' : 'deflect' };
      return null;
    }
    case 'module:state': {
      // knocked out, not strained or mended: a repair kit's and an auto-repair's reports feel like nothing
      const state = field(payload, 'state');
      return me && field(payload, 'id') === me && (state === 'red' || state === 'destroyed') && !field(payload, 'repaired')
        && field(payload, 'source') !== 'repair-kit' ? { c: 'module' } : null;
    }
    case 'tank:fire':
      return me && field(payload, 'id') === me && field(payload, 'burning') === true ? { c: 'burning' } : null;
    case 'tank:impact':
      // a crash, a ram, a hard landing: the closing speed is how hard (12 m/s, 43 km/h, is the full jolt)
      return me && field(payload, 'id') === me ? { c: 'impact', m: clamp01(0.15 + num(payload, 'speedMps') / 12) } : null;
    case 'tank:destroyed':
      if (!me) return null;
      if (field(payload, 'id') === me) return { c: 'dead' };
      return field(payload, 'killerId') === me ? { c: 'kill' } : null;
    case 'player:spotted':
      return owner.player ? { c: 'spotted' } : null;
    case 'ui:consumableDenied':
    case 'ui:ammoSelectionDenied':
      return owner.player ? { c: 'denied' } : null;
    case 'ammo_selection_denied':
      // the input stage refused this tank's shell pick (a couch seat's: no page key or HUD raised it)
      return me && field(payload, 'id') === me ? { c: 'denied' } : null;
    case 'ui:autoAimState':
      return owner.player ? { c: field(payload, 'on') === true ? 'lock' : 'unlock' } : null;
    default:
      return null;
  }
}
