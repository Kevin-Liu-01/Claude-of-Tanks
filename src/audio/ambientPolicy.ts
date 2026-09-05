import { isMapId, type MapId } from '../world/maps/catalog.ts';

export type AmbientBiome = 'field' | 'forest' | 'coastal' | 'wetland'
  | 'desert' | 'alpine' | 'polar' | 'industrial';
export type AmbientCueKind = 'bird' | 'gull' | 'insect' | 'metal' | 'none';

export interface AmbientProfile {
  readonly biome: AmbientBiome;
  readonly wind: {
    readonly lowpassHz: number;
    readonly gain: number;
    readonly swellHz: number;
    readonly swellGain: number;
    readonly gustHz: number;
    readonly gustQ: number;
    readonly gustGain: number;
    readonly gustCycleHz: number;
    readonly gustSwellGain: number;
    readonly gustPlaybackRate: number;
  };
  readonly cue: {
    readonly kind: AmbientCueKind;
    readonly probability: number;
    readonly minGapS: number;
    readonly notes: number;
    readonly frequencyHz: number;
    readonly frequencySpreadHz: number;
    readonly sweepHz: number;
    readonly durationS: number;
    readonly spacingS: number;
    readonly gain: number;
    readonly waveform: 'sine' | 'triangle';
  };
}

// Existing wind rig: two buffers, two filters, four gains and two LFOs.
// Existing one-shot allocator: at most five source/envelope pairs per call.
export const AMBIENT_BUDGET = Object.freeze({ timerMs: 700, loopNodes: 10, cueSources: 5, simultaneousCues: 1 });

function profile(value: AmbientProfile): AmbientProfile {
  Object.freeze(value.wind);
  Object.freeze(value.cue);
  return Object.freeze(value);
}

export const AMBIENT_PROFILES: Readonly<Record<AmbientBiome, AmbientProfile>> = Object.freeze({
  field: profile({
    biome: 'field',
    wind: { lowpassHz: 430, gain: 0.36, swellHz: 0.070, swellGain: 0.12, gustHz: 720, gustQ: 0.6, gustGain: 0.07, gustCycleHz: 0.043, gustSwellGain: 0.035, gustPlaybackRate: 0.55 },
    cue: { kind: 'bird', probability: 0.25, minGapS: 4.2, notes: 3, frequencyHz: 2650, frequencySpreadHz: 1500, sweepHz: 540, durationS: 0.08, spacingS: 0.13, gain: 0.062, waveform: 'sine' },
  }),
  forest: profile({
    biome: 'forest',
    wind: { lowpassHz: 300, gain: 0.30, swellHz: 0.055, swellGain: 0.10, gustHz: 1300, gustQ: 0.5, gustGain: 0.055, gustCycleHz: 0.035, gustSwellGain: 0.028, gustPlaybackRate: 0.65 },
    cue: { kind: 'bird', probability: 0.30, minGapS: 3.8, notes: 5, frequencyHz: 1850, frequencySpreadHz: 1250, sweepHz: 780, durationS: 0.10, spacingS: 0.16, gain: 0.058, waveform: 'sine' },
  }),
  coastal: profile({
    biome: 'coastal',
    wind: { lowpassHz: 570, gain: 0.38, swellHz: 0.095, swellGain: 0.15, gustHz: 1080, gustQ: 0.48, gustGain: 0.08, gustCycleHz: 0.072, gustSwellGain: 0.045, gustPlaybackRate: 0.42 },
    cue: { kind: 'gull', probability: 0.22, minGapS: 5.2, notes: 2, frequencyHz: 920, frequencySpreadHz: 420, sweepHz: -430, durationS: 0.28, spacingS: 0.34, gain: 0.054, waveform: 'triangle' },
  }),
  wetland: profile({
    biome: 'wetland',
    wind: { lowpassHz: 280, gain: 0.29, swellHz: 0.062, swellGain: 0.09, gustHz: 2200, gustQ: 0.45, gustGain: 0.045, gustCycleHz: 0.048, gustSwellGain: 0.024, gustPlaybackRate: 0.72 },
    cue: { kind: 'insect', probability: 0.30, minGapS: 3.4, notes: 5, frequencyHz: 5150, frequencySpreadHz: 550, sweepHz: 140, durationS: 0.045, spacingS: 0.072, gain: 0.027, waveform: 'sine' },
  }),
  desert: profile({
    biome: 'desert',
    wind: { lowpassHz: 370, gain: 0.36, swellHz: 0.048, swellGain: 0.14, gustHz: 1180, gustQ: 0.7, gustGain: 0.075, gustCycleHz: 0.029, gustSwellGain: 0.04, gustPlaybackRate: 0.48 },
    cue: { kind: 'bird', probability: 0.10, minGapS: 9.0, notes: 2, frequencyHz: 1550, frequencySpreadHz: 750, sweepHz: -280, durationS: 0.12, spacingS: 0.22, gain: 0.042, waveform: 'sine' },
  }),
  alpine: profile({
    biome: 'alpine',
    wind: { lowpassHz: 610, gain: 0.38, swellHz: 0.041, swellGain: 0.14, gustHz: 940, gustQ: 0.76, gustGain: 0.08, gustCycleHz: 0.024, gustSwellGain: 0.042, gustPlaybackRate: 0.50 },
    cue: { kind: 'bird', probability: 0.12, minGapS: 8.0, notes: 2, frequencyHz: 1450, frequencySpreadHz: 600, sweepHz: 300, durationS: 0.15, spacingS: 0.26, gain: 0.043, waveform: 'sine' },
  }),
  polar: profile({
    biome: 'polar',
    wind: { lowpassHz: 680, gain: 0.40, swellHz: 0.033, swellGain: 0.15, gustHz: 1500, gustQ: 0.62, gustGain: 0.085, gustCycleHz: 0.022, gustSwellGain: 0.045, gustPlaybackRate: 0.44 },
    cue: { kind: 'none', probability: 0, minGapS: 10, notes: 0, frequencyHz: 1000, frequencySpreadHz: 0, sweepHz: 0, durationS: 0.1, spacingS: 0.2, gain: 0, waveform: 'sine' },
  }),
  industrial: profile({
    biome: 'industrial',
    wind: { lowpassHz: 210, gain: 0.28, swellHz: 0.046, swellGain: 0.09, gustHz: 470, gustQ: 0.82, gustGain: 0.055, gustCycleHz: 0.027, gustSwellGain: 0.025, gustPlaybackRate: 0.36 },
    cue: { kind: 'metal', probability: 0.16, minGapS: 7.0, notes: 3, frequencyHz: 330, frequencySpreadHz: 170, sweepHz: -16, durationS: 0.58, spacingS: 0.016, gain: 0.038, waveform: 'triangle' },
  }),
});

export const MAP_AMBIENT_BIOMES = Object.freeze({
  verdant: 'field', desert: 'desert', winter: 'alpine', urban: 'industrial',
  coastal: 'coastal', autumn: 'forest', steppe: 'field', railyard: 'industrial',
  frontier: 'field', fjord: 'coastal', delta: 'wetland', badlands: 'desert',
  monsoon: 'wetland', alpine: 'alpine', caldera: 'industrial', foundry: 'industrial',
  ruinspires: 'industrial', blackglass: 'industrial', titan_gorge: 'desert', skybridge: 'industrial',
  polders: 'wetland', copper_mesa: 'industrial', airfield: 'field', oasis: 'desert',
  whiteout: 'polar', orchard: 'forest', longleaf: 'forest', mangrove: 'wetland',
  saltwind: 'coastal', reservoir: 'forest',
} satisfies Record<MapId, AmbientBiome>);

export function resolveAmbientProfile(mapId: string | null | undefined): AmbientProfile {
  return AMBIENT_PROFILES[mapId && isMapId(mapId) ? MAP_AMBIENT_BIOMES[mapId] : 'field'];
}

/** Pure scheduler gate; no ambient call can displace a combat voice. */
export function canScheduleAmbientCue(
  profile: AmbientProfile,
  nowS: number,
  nextCueS: number,
  sample: number,
  activeVoices: number,
  maxVoices: number,
): boolean {
  return profile.cue.kind !== 'none' && Number.isFinite(nowS) && nowS >= nextCueS
    && Number.isFinite(sample) && sample >= 0 && sample < profile.cue.probability
    && activeVoices < maxVoices;
}
