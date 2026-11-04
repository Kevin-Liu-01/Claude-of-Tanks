/**
 * The phone's buzzes (docs/PHONE-CONTROLLER.md "Haptics"), pure and Node-runnable: which of the battle's events a paired
 * phone feels (the desktop's side: padReceiver.ts listens to the bus and sends each cue the moment it happens), and the
 * buzz each one plays (the phone's side, padPage.ts). Every cue is the tank's own: its gun, its hits, its hull.
 */
import type { PadCue } from './padProtocol.ts';

/** The battle's bus events a receiver listens to for its tank's cues. */
export const PAD_CUE_EVENTS = [
  'shell:fired', 'shell:hit', 'module:state', 'tank:fire', 'tank:impact', 'tank:destroyed', 'player:spotted',
  'ui:consumableDenied', 'ui:ammoSelectionDenied', 'ui:autoAimState',
] as const;

/** Whose cues: the tank's id, and whether it is the page's player (the events that name no tank, the sixth sense, the
 *  refusals and the sight's lock, are the player's; a couch seat other than the player's has none of them). */
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
    case 'ui:autoAimState':
      return owner.player ? { c: field(payload, 'on') === true ? 'lock' : 'unlock' } : null;
    default:
      return null;
  }
}

/** The phone's own buzzes besides the battle's cues: a control under the thumb, the gun loaded, a trigger pulled
 *  while it loads. */
export type PadBuzz = PadCue | 'press' | 'ready' | 'unready';

/** Each buzz as the Vibration API plays it (on, off, on… in ms); `m` (0..1) scales the strong ones. */
export function padBuzzPattern(buzz: PadBuzz, m = 0.5): number[] {
  const k = clamp01(m);
  switch (buzz) {
    case 'press': return [8];
    case 'ready': return [10, 60, 10];
    case 'unready': return [6, 40, 6];
    case 'shot': return [Math.round(24 + 36 * k)];
    case 'hit': return [14, 50, 22];
    case 'deflect': return [6];
    case 'hurt': return [Math.round(30 + 90 * k)];
    case 'glance': return [10, 40, 10];
    case 'module': return [24, 40, 24, 40, 24];
    case 'burning': return [12, 90, 12, 90, 12, 90, 12];
    case 'impact': return [Math.round(16 + 54 * k)];
    case 'kill': return [20, 60, 20, 60, 60];
    case 'dead': return [200, 80, 300];
    case 'spotted': return [8, 120, 8];
    case 'denied': return [8, 40, 8, 40, 8];
    case 'lock': return [12, 30, 24];
    case 'unlock': return [8];
    default: return [];
  }
}

/** The longest gap between ticks a long buzz keeps on a phone that can only tick (iOS: one system tick per toggled
 *  switch), and the most ticks one buzz plays. */
const TICK_EVERY_MS = 50;
const MAX_TICKS = 6;

/** A pattern as ticks, for a phone with no Vibration API: each pulse starts a tick, and a long pulse ticks on through
 *  its length. The times are ms from the buzz's start. */
export function padBuzzTicks(pattern: readonly number[]): number[] {
  const ticks: number[] = [];
  let at = 0;
  for (let i = 0; i < pattern.length && ticks.length < MAX_TICKS; i++) {
    const length = Math.max(0, pattern[i] || 0);
    if (i % 2 === 0) for (let t = 0; t < Math.max(1, length - 20) && ticks.length < MAX_TICKS; t += TICK_EVERY_MS) ticks.push(at + t);
    at += length;
  }
  return ticks;
}
