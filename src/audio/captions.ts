/**
 * captions.ts — the caption stream for crew radio, alarms and key sound effects (brand-ui SPEC 10, 14; PLAN BUI-F9).
 * Copyright © 2026 Kevin B. Liu.
 *
 * Every caption says what was heard, who said it and where it came from, as one 'audio:caption' event on the game bus:
 *  - radio: a crew transmission the net actually keyed (crewRadio.ts), with the line id, the take spoken (captions show
 *    take n of captionScript.generated.ts in the player's language, whatever language the crew speaks) and the speaking
 *    role (captionSpeakers.generated.ts); it comes over the intercom, so it has no direction;
 *  - alarm and sound: the CAPTION_SOUNDS cues the engine raises, with a bearing from the listener (0 ahead, 90 right,
 *    -90 left, 180 behind), one of eight sectors and the distance, or none when the cue is inside our own tank.
 * Each cue has its own cooldown, so a burst of gunfire is one caption, not twenty. The stream is DOM-free and
 * allocation-light; the renderer (the HUD packages) subscribes, honours the Captions setting, and reads text from the
 * caption script and the catalog's caption keys.
 */
import { CAPTION_SPEAKERS, type CaptionSpeaker } from './captionSpeakers.generated.ts';

export const CAPTION_EVENT = 'audio:caption';

type CaptionKind = 'radio' | 'alarm' | 'sound';
type CaptionSector = 'front' | 'frontRight' | 'right' | 'rearRight' | 'rear' | 'rearLeft' | 'left' | 'frontLeft';
const SECTORS: readonly CaptionSector[] = ['front', 'frontRight', 'right', 'rearRight', 'rear', 'rearLeft', 'left', 'frontLeft'];

/** The cues besides the radio that get a caption, with their kind, priority (0-4, as the radio's ladder), cooldown and
 *  suggested time on screen. Alarms are inside our own tank; sounds come from somewhere around it. */
export const CAPTION_SOUNDS = Object.freeze({
  fire: { kind: 'alarm', priority: 4, cooldownS: 4, holdS: 3 },
  ammoRack: { kind: 'alarm', priority: 4, cooldownS: 4, holdS: 3 },
  criticalDamage: { kind: 'alarm', priority: 3, cooldownS: 6, holdS: 2.5 },
  missileWarning: { kind: 'alarm', priority: 4, cooldownS: 2, holdS: 2 },
  hullHit: { kind: 'sound', priority: 3, cooldownS: 0.8, holdS: 2 },
  hullBounce: { kind: 'sound', priority: 2, cooldownS: 0.8, holdS: 1.8 },
  nearMiss: { kind: 'sound', priority: 2, cooldownS: 1.5, holdS: 1.6 },
  gunfire: { kind: 'sound', priority: 1, cooldownS: 2.5, holdS: 1.6 },
  explosion: { kind: 'sound', priority: 2, cooldownS: 1.5, holdS: 2 },
  collapse: { kind: 'sound', priority: 1, cooldownS: 4, holdS: 2 },
  aircraft: { kind: 'sound', priority: 0, cooldownS: 8, holdS: 2.5 },
} as const satisfies Readonly<Record<string, { kind: Exclude<CaptionKind, 'radio'>; priority: number; cooldownS: number; holdS: number }>>);
export type CaptionSoundId = keyof typeof CAPTION_SOUNDS;

interface CaptionDirection {
  /** Degrees from the listener's facing: 0 ahead, 90 right, -90 left, 180 behind. */
  readonly bearingDeg: number;
  readonly sector: CaptionSector;
  readonly distanceM: number;
}

interface CaptionEvent {
  readonly kind: CaptionKind;
  /** radio: the voice line id; alarm and sound: a CAPTION_SOUNDS id. */
  readonly id: string;
  /** radio: the crew role that spoke; null for the other kinds. */
  readonly speaker: CaptionSpeaker | null;
  /** radio: the take spoken (its index in the script); null for the other kinds. */
  readonly take: number | null;
  /** radio: the crew pack's language; null for the other kinds. */
  readonly lang: string | null;
  /** Where it came from; null inside our tank or over the intercom. */
  readonly direction: CaptionDirection | null;
  readonly priority: number;
  /** Suggested time on screen, seconds (a radio caption lasts its transmission plus a beat to read it). */
  readonly holdS: number;
  /** The audio clock, seconds. */
  readonly atS: number;
}

/** A listener-relative position (audioMath.ts toListenerFrame): metres right of and ahead of the listener. */
interface CaptionSource {
  readonly right: number;
  readonly ahead: number;
  readonly distance: number;
}

/** The bearing and sector of a listener-relative position. */
export function captionDirection(source: CaptionSource): CaptionDirection {
  const bearing = Math.atan2(source.right, source.ahead) * 180 / Math.PI;
  const index = ((Math.round(bearing / 45) % 8) + 8) % 8;
  return {
    bearingDeg: Math.round(bearing),
    sector: SECTORS[index],
    distanceM: Math.round(source.distance),
  };
}

/** The speaking role of a radio line (every scripted line has one; an unknown id is the commander's). */
export function captionSpeaker(lineId: string): CaptionSpeaker {
  return CAPTION_SPEAKERS[lineId] ?? 'commander';
}

interface CaptionStream {
  /** A transmission the crew radio keyed: its line, the take spoken, the crew language, its length and priority. */
  radio(lineId: string, take: number | null, lang: string, durationS: number, priority: number): CaptionEvent;
  /** A cue (alarm or sound); `source` null when it is inside our tank. Null when its cooldown swallowed it. */
  sound(id: CaptionSoundId, source: CaptionSource | null): CaptionEvent | null;
  /** The last captions, newest last (bounded): the audio debug surface. */
  readonly log: readonly CaptionEvent[];
  /** Forget cooldowns and the log (a new battle). */
  reset(): void;
}

interface CaptionStreamOptions {
  /** Publish one caption (the engine emits it on the bus as CAPTION_EVENT). */
  emit(event: CaptionEvent): void;
  /** The audio clock, seconds. */
  now(): number;
}

const LOG_MAX = 48;

export function createCaptionStream({ emit, now }: CaptionStreamOptions): CaptionStream {
  const last = new Map<string, number>();
  const log: CaptionEvent[] = [];
  const publish = (event: CaptionEvent): CaptionEvent => {
    log.push(event);
    if (log.length > LOG_MAX) log.shift();
    emit(event);
    return event;
  };
  return {
    radio(lineId, take, lang, durationS, priority) {
      return publish({
        kind: 'radio', id: lineId, speaker: captionSpeaker(lineId), take, lang, direction: null, priority,
        holdS: Math.max(1.6, Math.round((durationS + 1.2) * 10) / 10), atS: now(),
      });
    },
    sound(id, source) {
      const cue = CAPTION_SOUNDS[id];
      const t = now();
      const prior = last.get(id);
      if (prior !== undefined && t - prior < cue.cooldownS) return null;
      last.set(id, t);
      return publish({
        kind: cue.kind, id, speaker: null, take: null, lang: null,
        direction: source ? captionDirection(source) : null, priority: cue.priority, holdS: cue.holdS, atS: t,
      });
    },
    log,
    reset() {
      last.clear();
      log.length = 0;
    },
  };
}
