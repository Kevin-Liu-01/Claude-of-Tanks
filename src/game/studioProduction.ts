import type { BattleTimeOfDay } from '../engine/battleWeatherPolicy.ts';
import { normalizeStoryboard } from './studioTimeline.ts';
import type { Storyboard } from './studioTimeline.ts';

/** Original, in-engine editorial recipes. No competing game's media or models. */
export type ProductionFormat = 'landscape' | 'portrait' | 'square';
export type ProductionRigId = 'hero' | 'track' | 'rear' | 'overhead' | 'detail';
type Vec3 = [number, number, number];
type Vec2 = [number, number];
export interface ProductionPreset {
  id: string; title: string; description: string; map: string;
  timeOfDay: BattleTimeOfDay; durationMs: number; category: string; shots: readonly string[];
}
export const PRODUCTION_PRESETS: readonly ProductionPreset[] = [
  { id: 'steel-pursuit', title: 'Steel pursuit', description: 'Track-level escort, a forward gun pass, then a rising battlefield reveal.',
    map: 'verdant', timeOfDay: 'day', durationMs: 8000, category: 'Tank showcase',
    shots: ['Track-level escort', 'Gunline portrait', 'Formation reveal'] },
  { id: 'desert-crossfire', title: 'Desert crossfire', description: 'A sunset engagement: approach, recoil and tracer, then the impact aftermath.',
    map: 'desert', timeOfDay: 'sunset', durationMs: 8000, category: 'Combat sequence',
    shots: ['Armored approach', 'Return fire', 'Impact and pullback'] },
  { id: 'coast-recon', title: 'Coastal reconnaissance', description: 'A moving coastal patrol with a rear follow, side portrait and sea-facing reveal.',
    map: 'coastal', timeOfDay: 'day', durationMs: 8000, category: 'Environment story',
    shots: ['Patrol follow', 'Low side portrait', 'Bay reveal'] },
];
export interface ProductionOptions { presetId: string; format?: ProductionFormat; vehicleId?: string }
export interface ProductionActor { id: string; name: string; pos: Vec2; facingDeg: number; turretDeg: number; camo: string; camoSeed: number }
export interface ProductionEffect {
  id: string; type: string; actor?: string; at?: Vec2; tMs: number;
  params: { count?: number; intensity?: number; slot?: number; tracer?: boolean; recoil?: boolean; kind?: string; caliberMm?: number; cause?: string; pop?: boolean };
}
export interface ProductionScene {
  map: string; timeOfDay: BattleTimeOfDay; productionFormat: ProductionFormat; seed: number; actors: ProductionActor[];
  effects: ProductionEffect[]; storyboard: Storyboard; fxTime: number; timeScale: number;
  camera: { pos: Vec3; lookAt: Vec3; fov: number };
}
export type ProductionHeight = (x: number, z: number) => number;

export function productionPreset(id: string): ProductionPreset {
  const preset = PRODUCTION_PRESETS.find(item => item.id === id);
  if (!preset) throw new RangeError('Unknown production sequence');
  return preset;
}
export function productionAspect(format: ProductionFormat): number {
  if (format === 'portrait') return 9 / 16;
  if (format === 'square') return 1;
  if (format !== 'landscape') throw new RangeError('Unknown production format');
  return 16 / 9;
}

/** Reframe existing authored positions, preserving aim, lens, cuts and timings. */
export function reframeProductionPoint(pos: Vec3, target: Vec3, from: ProductionFormat,
  to: ProductionFormat, height: ProductionHeight): Vec3 {
  const ratio = productionDistanceScale(to) / productionDistanceScale(from);
  const next = pos.map((value, i) => target[i] + (value - target[i]) * ratio) as Vec3;
  next[1] = Math.max(next[1], height(next[0], next[2]) + 1.3);
  if (!next.every(Number.isFinite)) throw new RangeError('Invalid camera ground or target');
  return next;
}

function productionDistanceScale(format: ProductionFormat): number {
  return Math.min(16 / 9, (16 / 9) / productionAspect(format));
}

export function reframeProductionFov(fov: number, from: ProductionFormat, to: ProductionFormat): number {
  const lensScale = (format: ProductionFormat) => Math.max(1, 1 / productionAspect(format));
  return 2 * Math.atan(Math.tan(fov * Math.PI / 360) * lensScale(to) / lensScale(from)) * 180 / Math.PI;
}

/** Match horizontal subject coverage across native export ratios, without cropping a master. */
export function productionCamera(rig: ProductionRigId, target: Vec3, headingDeg: number,
  height: ProductionHeight, format: ProductionFormat = 'landscape'): { pos: Vec3; lookAt: Vec3; fov: number } {
  const rigs: Record<ProductionRigId, [number, number, number, number]> = {
    hero: [-12, 17, 4.3, 40], track: [-13, -2, 1.9, 46], rear: [-10, -19, 5, 46],
    overhead: [-20, -23, 26, 52], detail: [-8, 9, 3.1, 34],
  };
  if (!(rig in rigs)) throw new RangeError('Unknown camera rig');
  const [side, forward, lift, fov] = rigs[rig];
  // A vertical frame widens the lens after a modest dolly back, instead of
  // pushing the camera deep into trees behind the reviewed square position.
  const scale = productionDistanceScale(format);
  const yaw = headingDeg * Math.PI / 180, sin = Math.sin(yaw), cos = Math.cos(yaw);
  const x = target[0] + (side * cos + forward * sin) * scale;
  const z = target[2] + (forward * cos - side * sin) * scale;
  const ground = height(x, z);
  if (![...target, headingDeg, ground].every(Number.isFinite)) throw new RangeError('Invalid camera ground or target');
  return { pos: [x, Math.max(ground + 1.3, target[1] + (lift - 1.7) * scale), z], lookAt: [...target], fov: reframeProductionFov(fov, 'landscape', format) };
}

/** Terrain-relative authored locations keep recipes portable across renderer captures and the UI. */
export function createProductionScene(options: ProductionOptions, height: ProductionHeight): ProductionScene {
  const preset = productionPreset(options.presetId), format = options.format ?? 'landscape';
  productionAspect(format);
  const combat = preset.id === 'desert-crossfire', coast = preset.id === 'coast-recon';
  const start: Vec2 = combat ? [68, -82] : coast ? [232, -352] : [2, -95];
  const travel = combat ? 12 : 24;
  const actor = (id: string, name: string, x: number, z: number, facingDeg = 0): ProductionActor => ({
    id, name, pos: [x, z], facingDeg, turretDeg: 0, camo: combat ? 'desert' : 'summer', camoSeed: 29101,
  });
  const actors = [actor(options.vehicleId || (coast ? 'leo2a7v' : 'm1a2_sepv3'), 'lead', ...start),
    actor(combat ? 't90m' : 'k2', 'wing', start[0] + (combat ? 22 : 0), start[1] + (combat ? 43 : -17), combat ? 180 : 0)];
  const leadAt = (t: number): Vec3 => {
    const z = start[1] + travel * t / 8000;
    return [start[0], height(start[0], z) + 1.7, z];
  };
  const shot = (tMs: number, rig: ProductionRigId, label: string, cut = false) => {
    const followWing = combat && tMs >= 2666;
    const x = actors[1].pos[0], z = actors[1].pos[1] - 3 * tMs / 8000;
    const target: Vec3 = followWing ? [x, height(x, z) + 1.7, z] : leadAt(tMs);
    return { id: `production-${tMs}`, label, tMs,
      ...productionCamera(rig, target, followWing ? 180 : 0, height, format),
      transition: cut ? 'cut' : 'linear' };
  };
  const shots = [
    shot(0, coast ? 'rear' : 'track', preset.shots[0]),
    shot(2633.333, coast ? 'rear' : 'track', preset.shots[0]),
    shot(2666.667, coast ? 'track' : 'hero', preset.shots[1], true),
    shot(5300, coast ? 'track' : 'hero', preset.shots[1]),
    shot(5333.333, 'hero', preset.shots[2], true),
    shot(8000, 'overhead', preset.shots[2]),
  ];
  const keys = (a: ProductionActor, distance: number) => [0, 8000].map(tMs => ({
    id: `${a.name}-${tMs}`, tMs, pos: [a.pos[0], a.pos[1] + distance * tMs / 8000],
    facingDeg: a.facingDeg, turretDeg: combat ? (a.name === 'lead' ? 32 : 24) : 0, gunDeg: 0,
    transition: 'drive',
  }));
  const effects: ProductionEffect[] = [0, 1000, 2200, 3600, 4700, 6500].flatMap((tMs, i) =>
    actors.map(a => ({ id: `dust-${a.name}-${i}`, type: 'dust', actor: a.name, tMs,
      params: { count: 5, intensity: combat ? 0.58 : 0.3 } })));
  if (combat) effects.push(
    { id: 'lead-fire', type: 'fire', actor: 'lead', tMs: 1866.667, params: { slot: 0, recoil: true, tracer: true } },
    { id: 'wing-fire', type: 'fire', actor: 'wing', tMs: 3966.667, params: { slot: 0, recoil: true, tracer: true } },
    { id: 'lead-fire-two', type: 'fire', actor: 'lead', tMs: 5600, params: { slot: 0, recoil: true, tracer: true } },
    { id: 'armor-hit', type: 'impact', actor: 'wing', tMs: 6066.667, params: { kind: 'pen', caliberMm: 120 } },
    { id: 'knockout', type: 'tank_kill', actor: 'wing', tMs: 6200, params: { cause: 'ammorack', pop: true } },
  );
  const storyboard = normalizeStoryboard({ durationMs: 8000, shots,
    actorTracks: actors.map(a => ({ actor: a.name, keys: keys(a, a.name === 'wing' && combat ? -3 : travel) })),
    cameraCues: combat ? [1866.667, 3966.667, 5600, 6200].map((tMs, i) => ({
      id: `report-${i}`, label: 'Recoil impulse', tMs, durationMs: 320, amplitudeM: 0.06,
      rollDeg: 0.22, fovKickDeg: 0.35, frequencyHz: 11, seed: 29100 + i,
    })) : [],
  });
  const first = shots[0];
  return { map: preset.map, timeOfDay: preset.timeOfDay, productionFormat: format, seed: 29101, actors, effects, storyboard,
    fxTime: 0, timeScale: 0, camera: { pos: first.pos, lookAt: first.lookAt, fov: first.fov } };
}
