import type { StudioTimeOfDay } from './studioLight.ts';
import { normalizeStoryboard } from './studioTimeline.ts';
import type { Storyboard } from './studioTimeline.ts';
import { t } from '../ui/i18n.ts';

/** Original, in-engine editorial recipes. No competing game's media or models. */
export type ProductionFormat = 'landscape' | 'portrait' | 'square' | 'card';
export type ProductionRigId = 'hero' | 'track' | 'rear' | 'overhead' | 'detail';
/** What a sequence is for: the template browser's chips (studioTemplates.ts). */
export type ProductionCategory = 'showcase' | 'combat' | 'environment';
type Vec3 = [number, number, number];
type Vec2 = [number, number];
type EffectParams = Readonly<Record<string, number | string | boolean>>;

/** One vehicle of a recipe: where it stands at the take's start and how far it drives along the sequence's axis. */
interface ProductionCast {
  /** 'lead' is the featured tank (ProductionOptions.vehicleId replaces its vehicle). */
  readonly name: string;
  readonly vehicle: string;
  readonly at: Vec2;
  /** The hull's heading in the world (0 = +z). */
  readonly facingDeg: number;
  /** Metres along the sequence's axis over the take; negative drives against it (an opponent closing in). */
  readonly travel: number;
  readonly turretDeg?: number;
  readonly camo?: string;
}
/** An authored effect: on an actor (by name) or at a world point, at a time of the take. */
interface ProductionCue {
  readonly id: string; readonly type: string; readonly actor?: string; readonly at?: Vec2; readonly tMs: number;
  readonly params: EffectParams;
}
/**
 * A sequence: three acts of a few seconds each, every act one camera rig on one subject, the last act moving to a closing
 * rig. The starts, the axes and the opponents' places come from the site's filmed takes on each battlefield
 * (public/media/site50-r14/scenes), so every column drives on ground the takes proved on camera.
 */
interface ProductionPreset {
  id: string; title: string; description: string; map: string;
  timeOfDay: StudioTimeOfDay; durationMs: number; category: ProductionCategory;
  /** The three acts' names (the shot list's and the timeline's). */
  shots: readonly [string, string, string];
  /** The way the column drives (0 = +z). */
  headingDeg: number;
  cast: readonly ProductionCast[];
  /** The rig of each act, then the closing rig the last act moves to. */
  rigs: readonly [ProductionRigId, ProductionRigId, ProductionRigId, ProductionRigId];
  /** Whom each act frames, by cast name. */
  subjects: readonly [string, string, string];
  /** The rigs stand on the subject's right instead of its left (a street's open side). */
  mirror?: boolean;
  camo: string;
  /** Track dust under every vehicle (0.3 a road, 0.6 a dry field). */
  dust: number;
  effects?: readonly ProductionCue[];
}

const fire = (id: string, actor: string, tMs: number): ProductionCue => ({ id, type: 'fire', actor, tMs, params: { slot: 0, recoil: true, tracer: true } });
const flare = (at: Vec2, heightM = 95): ProductionCue => ({ id: 'flare', type: 'flare', at, tMs: 0,
  params: { heightM, burnS: 40, intensity: 1.4, driftMps: 1, fallMps: 2.6, color: 'white', launch: false } });
const barrage = (id: string, at: Vec2, tMs: number, count = 5): ProductionCue => ({ id, type: 'barrage', at, tMs,
  params: { count, radiusM: 14, size: 'mixed', durationS: 3.5 } });
const knockout = (actor: string, hitMs: number): ProductionCue[] => [
  { id: 'armor-hit', type: 'impact', actor, tMs: hitMs, params: { kind: 'pen', caliberMm: 120 } },
  { id: 'knockout', type: 'tank_kill', actor, tMs: hitMs + 133.333, params: { cause: 'ammorack', pop: true } },
];
const cast = (name: string, vehicle: string, at: Vec2, facingDeg: number, travel: number, extra: Partial<ProductionCast> = {}): ProductionCast =>
  ({ name, vehicle, at, facingDeg, travel, ...extra });

export const PRODUCTION_PRESETS: readonly ProductionPreset[] = [
  { id: 'steel-pursuit', title: 'Steel pursuit', description: 'Track-level escort, a forward gun pass, then a rising battlefield reveal.',
    map: 'verdant', timeOfDay: 'day', durationMs: 8000, category: 'showcase',
    shots: ['Track-level escort', 'Gunline portrait', 'Formation reveal'], headingDeg: 0,
    cast: [cast('lead', 'm1a1_abrams_fep', [2, -95], 0, 24), cast('wing', 'xk2_black_panther', [2, -112], 0, 24)],
    rigs: ['track', 'hero', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'summer', dust: 0.3 },
  { id: 'desert-crossfire', title: 'Desert crossfire', description: 'A sunset engagement: approach, recoil and tracer, then the impact aftermath.',
    map: 'desert', timeOfDay: 'sunset', durationMs: 8000, category: 'combat',
    shots: ['Armored approach', 'Return fire', 'Impact and pullback'], headingDeg: 0,
    cast: [cast('lead', 'm1a1_abrams_fep', [68, -82], 0, 12, { turretDeg: 32 }), cast('wing', 't90am', [90, -39], 180, -3, { turretDeg: 24 })],
    rigs: ['track', 'hero', 'hero', 'overhead'], subjects: ['lead', 'wing', 'wing'], camo: 'desert', dust: 0.58,
    effects: [fire('lead-fire', 'lead', 1866.667), fire('wing-fire', 'wing', 3966.667), fire('lead-fire-two', 'lead', 5600),
      { id: 'armor-hit', type: 'impact', actor: 'wing', tMs: 6066.667, params: { kind: 'pen', caliberMm: 120 } },
      { id: 'knockout', type: 'tank_kill', actor: 'wing', tMs: 6200, params: { cause: 'ammorack', pop: true } }] },
  { id: 'coast-recon', title: 'Coastal reconnaissance', description: 'A moving coastal patrol with a rear follow, side portrait and sea-facing reveal.',
    map: 'coastal', timeOfDay: 'day', durationMs: 8000, category: 'environment',
    shots: ['Patrol follow', 'Low side portrait', 'Bay reveal'], headingDeg: 0,
    cast: [cast('lead', 'leo2_improved', [232, -352], 0, 24), cast('wing', 'xk2_black_panther', [232, -369], 0, 24)],
    rigs: ['rear', 'track', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'summer', dust: 0.3 },
  // 261: the library grows from the site's filmed takes, each battlefield's proven road (owner 2026-10-27: "make template
  // presentation a lotttt more and better")
  { id: 'golden-advance', title: 'Golden-hour advance', description: 'Two Leopards cross the farm fields in low gold light: a head-on portrait, a track-level pass, a reveal over the barns.',
    map: 'verdant', timeOfDay: 'golden', durationMs: 8000, category: 'showcase',
    shots: ['Head-on portrait', 'Track-level pass', 'Farmland reveal'], headingDeg: 81.6,
    cast: [cast('lead', 'leo2a4', [-34.6, 66.7], 81.6, 24), cast('wing', 'leo2a4_v', [-52, 62], 81.6, 24)],
    rigs: ['hero', 'track', 'rear', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'flecktarn', dust: 0.42 },
  { id: 'winter-column', title: 'Winter column', description: 'A column grinds up the snow road at first light: a rear follow, a close look at the running gear, a high reveal.',
    map: 'winter', timeOfDay: 'morning', durationMs: 8000, category: 'environment',
    shots: ['Column follow', 'Running gear', 'Snowfield reveal'], headingDeg: 0,
    cast: [cast('lead', 't80u_kursk', [-81.2, -130], 0, 22), cast('wing', 't72bu_1989', [-81, -148], 0, 22)],
    rigs: ['rear', 'detail', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'winterbands', dust: 0.45 },
  { id: 'fields-assault', title: 'Fields assault', description: 'Four tanks advance under their own barrage: a column from behind, the second gun firing, the line opening up from above.',
    map: 'verdant', timeOfDay: 'day', durationMs: 8000, category: 'combat',
    shots: ['Column advance', 'Second gun', 'Assault line'], headingDeg: -11.9,
    cast: [cast('lead', 'object148_proto', [-109.8, 4.9], -11.9, 20), cast('wing', 't90ms_2011', [-111, -12], -11.9, 20),
      cast('third', 't80u_kursk', [-106, -29], -11.9, 20), cast('fourth', 't72b3', [-109, -46], -11.9, 20)],
    rigs: ['hero', 'rear', 'rear', 'overhead'], subjects: ['lead', 'wing', 'lead'], camo: 'summer', dust: 0.55,
    effects: [barrage('barrage-far', [-48, 80], 900, 6), fire('lead-fire', 'lead', 2300), fire('wing-fire', 'wing', 3500),
      fire('third-fire', 'third', 4500), barrage('barrage-near', [-60, 70], 5000), fire('lead-fire-two', 'lead', 6300)] },
  { id: 'night-knockout', title: 'Night knockout', description: 'Under a parachute flare a T-90 meets a Leopard at the church crossroads: the approach, the exchange, the kill.',
    map: 'winter', timeOfDay: 'night', durationMs: 8000, category: 'combat',
    shots: ['Flarelit approach', 'The exchange', 'Knockout'], headingDeg: 4.1,
    cast: [cast('lead', 't90_1992', [-79.9, -23.2], 4.1, 12, { turretDeg: 0 }), cast('wing', 'leo2a4', [-75, 59], 182, -4, { camo: 'winter' })],
    rigs: ['track', 'rear', 'hero', 'overhead'], subjects: ['lead', 'lead', 'wing'], camo: 'winterbands', dust: 0.35,
    effects: [flare([-70, 31]), fire('lead-fire', 'lead', 3000), fire('wing-fire', 'wing', 4200), fire('lead-fire-two', 'lead', 5600),
      ...knockout('wing', 6066.667)] },
  { id: 'furnace-night', title: 'Furnace night', description: 'Two heavies roll under the ironworks gantries by flarelight, guns trained down the yard.',
    map: 'foundry', timeOfDay: 'night', durationMs: 8000, category: 'showcase',
    shots: ['Gantry pass', 'Gun portrait', 'Ironworks reveal'], headingDeg: 180,
    cast: [cast('lead', 't90ms_2011', [-1.2, 112.1], 180, 20), cast('wing', 'object695', [1, 130], 180, 20)],
    rigs: ['track', 'hero', 'detail', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'midnight', dust: 0.25,
    effects: [flare([-1, 60], 90), { id: 'yard-fire', type: 'fire_field', at: [6, 96], tMs: 0, params: { radiusM: 3, durationS: 30, intensity: 1, smoke: true } }] },
  { id: 'railyard-salvo', title: 'Railyard salvo', description: 'Three Abrams fire down the rails at golden hour while the far yard takes a barrage.',
    map: 'railyard', timeOfDay: 'golden', durationMs: 8000, category: 'combat',
    shots: ['Rail-side approach', 'Salvo', 'Yard reveal'], headingDeg: 87.8,
    cast: [cast('lead', 'm1a2_abrams', [7.8, 65.1], 87.8, 16, { turretDeg: 4 }), cast('wing', 'm1a1_abrams_sa', [-10, 67], 87.8, 16, { turretDeg: 3 }),
      cast('third', 'm1a1ha', [-28, 63], 87.8, 16, { turretDeg: -3 })],
    rigs: ['track', 'hero', 'rear', 'overhead'], subjects: ['lead', 'wing', 'lead'], camo: 'merdc', dust: 0.4,
    effects: [fire('lead-fire', 'lead', 1900), fire('wing-fire', 'wing', 3300), fire('third-fire', 'third', 4400), barrage('yard-barrage', [150, 72], 5200)] },
  { id: 'lakeside-duel', title: 'Lakeside duel', description: 'A Swedish pair meets a T-80 across the alpine lake: rear follow, the first round, the kill from above.',
    map: 'alpine', timeOfDay: 'day', durationMs: 8000, category: 'combat',
    shots: ['Shoreline follow', 'First round', 'Across the lake'], headingDeg: -98.8,
    cast: [cast('lead', 'strv121', [150, -44], -98.8, 14), cast('wing', 'cv90', [167, -46], -98.8, 14), cast('foe', 't80', [24, -52], 80, -3, { camo: 'summer' })],
    rigs: ['rear', 'hero', 'hero', 'overhead'], subjects: ['lead', 'lead', 'foe'], camo: 'm90', dust: 0.35,
    effects: [fire('lead-fire', 'lead', 2000), { id: 'wing-mg', type: 'mg_burst', actor: 'wing', tMs: 3200, params: { count: 9 } },
      fire('foe-fire', 'foe', 4100), fire('lead-fire-two', 'lead', 5500), ...knockout('foe', 6000)] },
  { id: 'dawn-patrol', title: 'Dawn patrol', description: 'Japanese armor moves out of the frontier farms at dawn: the tracks close up, a low pass, the basin from above.',
    map: 'frontier', timeOfDay: 'dawn', durationMs: 8000, category: 'showcase',
    shots: ['Tracks up close', 'Low pass', 'Basin reveal'], headingDeg: 68,
    cast: [cast('lead', 'type10b', [-38.3, 2.6], 68, 22), cast('wing', 'type90a', [-52, 13], 68, 22)],
    rigs: ['detail', 'track', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'oakleaf', dust: 0.4 },
  { id: 'fjord-road', title: 'Fjord road', description: 'Challengers follow the shore road through the fjord village, the water beside them all the way.',
    map: 'fjord', timeOfDay: 'day', durationMs: 8000, category: 'environment',
    shots: ['Shore road follow', 'Village pass', 'Fjord reveal'], headingDeg: -107.8,
    cast: [cast('lead', 'challenger3', [-15.3, -84.1], -107.8, 22), cast('wing', 'challenger2', [3, -81], -107.8, 22)],
    rigs: ['rear', 'track', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'dpm', dust: 0.3 },
  // up the quay by the middle arm's head, the water behind the column from every camera; from behind on the last
  // vehicle, so none stands between the rear rig and its tank (the inland road showed no water, stills261 f)
  { id: 'harbor-golden', title: 'Harbor at golden hour', description: 'A British column leaves the harbor as the light goes gold: head-on, from behind, then the whole bay.',
    map: 'fjord', timeOfDay: 'golden', durationMs: 8000, category: 'environment',
    shots: ['Harbor exit', 'Column from behind', 'Bay reveal'], headingDeg: 0,
    cast: [cast('lead', 'ajax', [276, 32], 0, 22), cast('wing', 'ares_apc', [264, 19.7], 0, 22), cast('third', 'challenger3', [283.6, 16.7], 0, 22)],
    rigs: ['hero', 'rear', 'track', 'overhead'], subjects: ['lead', 'third', 'third'], camo: 'dpm', dust: 0.3 },
  // the north-east dunes, the low sun (azimuth 104) behind the eastern palms from the portrait's camera; the souk's
  // route drove under its shade roof, out of every camera's sight from its third second (stills261 e)
  { id: 'oasis-sunset', title: 'Oasis sunset', description: 'Merkavas cross the oasis as the sun sets behind the palms.',
    map: 'oasis', timeOfDay: 'sunset', durationMs: 8000, category: 'environment',
    shots: ['Dune follow', 'Palm-line portrait', 'Oasis reveal'], headingDeg: -120,
    cast: [cast('lead', 'merkava4_barak', [224, 320], -120, 22), cast('wing', 'merkava3_baz', [236, 331.5], -120, 22)],
    rigs: ['rear', 'hero', 'track', 'overhead'], subjects: ['lead', 'lead', 'lead'], mirror: true, camo: 'desert', dust: 0.6 },
  // along the lower east olive groves' rows (maps/orchard.ts east-lower-orchard-1/2): the valley road showed no tree
  // (stills261 f)
  { id: 'orchard-column', title: 'Orchard column', description: 'Three Italian vehicles thread the orchard rows: from above, at track level, then the valley.',
    map: 'orchard', timeOfDay: 'day', durationMs: 8000, category: 'environment',
    shots: ['Over the rows', 'Between the trees', 'Valley reveal'], headingDeg: -40,
    cast: [cast('lead', 'c2_ariete', [208, -212], -40, 20), cast('wing', 'c1_ariete_preserie', [214.9, -227.1], -40, 20), cast('third', 'dardo', [227.4, -239.9], -40, 20)],
    rigs: ['overhead', 'track', 'hero', 'overhead'], subjects: ['wing', 'lead', 'lead'], camo: 'autumn', dust: 0.4 },
  { id: 'river-village', title: 'River village', description: 'Chinese armor follows the delta road through a waking river village.',
    map: 'delta', timeOfDay: 'morning', durationMs: 8000, category: 'environment',
    shots: ['Riverside pass', 'Rear follow', 'Delta reveal'], headingDeg: 19.1,
    cast: [cast('lead', 'vt4a1', [-16.6, -8.8], 19.1, 22), cast('wing', 'ztz99a2', [-26, -23], 19.1, 22)],
    rigs: ['track', 'rear', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'digital', dust: 0.35 },
  { id: 'temple-road', title: 'Temple road', description: 'A lone K2 climbs the monsoon road past the temple: its tracks, a low pass, the ridge from above.',
    map: 'monsoon', timeOfDay: 'morning', durationMs: 8000, category: 'showcase',
    shots: ['Tracks in the mud', 'Low pass', 'Ridge reveal'], headingDeg: -0.8,
    cast: [cast('lead', 'k2b', [17, -19.5], -0.8, 22)],
    rigs: ['detail', 'track', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'tropic', dust: 0.5 },
  { id: 'reservoir-dusk', title: 'Reservoir at blue hour', description: 'Chieftains skirt the reservoir after sunset, the lake still holding the light.',
    map: 'reservoir', timeOfDay: 'dusk', durationMs: 8000, category: 'environment',
    shots: ['Lakeside follow', 'Low portrait', 'Reservoir reveal'], headingDeg: -152.8,
    cast: [cast('lead', 'chieftain_mk9', [-52.6, -1.5], -152.8, 20), cast('wing', 'challenger1_mk2', [-41, 11], -152.8, 20)],
    rigs: ['rear', 'track', 'hero', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'dpm', dust: 0.3 },
  { id: 'walking-barrage', title: 'Walking barrage', description: 'A night assault behind a walking barrage, lit by a flare: the guns, the column, the fire ahead.',
    map: 'verdant', timeOfDay: 'night', durationMs: 8000, category: 'combat',
    shots: ['Under the flare', 'The column', 'Into the barrage'], headingDeg: 144.1,
    cast: [cast('lead', 'challenger2', [-111.5, 107.9], 144.1, 18), cast('wing', 'leo2a4', [-117, 124], 144.1, 18), cast('third', 't72b3m_hetman', [-129, 137], 144.1, 18)],
    rigs: ['rear', 'overhead', 'hero', 'overhead'], subjects: ['lead', 'wing', 'lead'], camo: 'digital', dust: 0.45,
    effects: [flare([-108, 86], 100), barrage('barrage-one', [-130, 66], 800, 6), fire('lead-fire', 'lead', 2500), fire('wing-fire', 'wing', 3600),
      barrage('barrage-two', [-100, 70], 4300), fire('third-fire', 'third', 5700)] },
  { id: 'alpine-village', title: 'Alpine village', description: 'A Leopard and a CV90 roll through the mountain village under the peaks.',
    map: 'alpine', timeOfDay: 'day', durationMs: 8000, category: 'environment',
    shots: ['Village follow', 'Street portrait', 'Valley reveal'], headingDeg: 179.1,
    cast: [cast('lead', 'leo2a4m', [-99.1, 180.7], 179.1, 20), cast('wing', 'cv90105_tml', [-95, 197], 179.1, 20)],
    rigs: ['rear', 'hero', 'track', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'm90', dust: 0.3 },
  { id: 'sunset-sprint', title: 'Sunset sprint', description: 'A KF51 at full speed across the frontier at sunset: the gun from the front, the tracks, the dust trail from above.',
    map: 'frontier', timeOfDay: 'sunset', durationMs: 8000, category: 'showcase',
    shots: ['Gun-first', 'Tracks at speed', 'Dust trail'], headingDeg: 2.2,
    cast: [cast('lead', 'kf51_evo', [26.5, 56.2], 2.2, 26)],
    rigs: ['rear', 'track', 'detail', 'overhead'], subjects: ['lead', 'lead', 'lead'], camo: 'flecktarn', dust: 0.7 },
];
export interface ProductionOptions { presetId: string; format?: ProductionFormat; vehicleId?: string }
interface ProductionActor { id: string; name: string; pos: Vec2; facingDeg: number; turretDeg: number; camo: string; camoSeed: number }
interface ProductionEffect {
  id: string; type: string; actor?: string; at?: Vec2; tMs: number;
  params: EffectParams;
}
interface ProductionScene {
  map: string; timeOfDay: StudioTimeOfDay; productionFormat: ProductionFormat; seed: number; actors: ProductionActor[];
  effects: ProductionEffect[]; storyboard: Storyboard; fxTime: number; timeScale: number;
  camera: { pos: Vec3; lookAt: Vec3; fov: number };
}
type ProductionHeight = (x: number, z: number) => number;
/** Whether a camera at `from` sees `to` (no building, roof or bank between them, and not inside one): the Studio's world
 *  raycast. Without it every rig counts as clear. */
type ProductionSight = (from: Vec3, to: Vec3) => boolean;
/** The rigs an act tries after its own when its own is blocked, each on the authored side and then the other. */
const RIG_FALLBACKS: readonly ProductionRigId[] = ['hero', 'rear', 'track', 'detail', 'overhead'];

export function productionPreset(id: string): ProductionPreset {
  const preset = PRODUCTION_PRESETS.find(item => item.id === id);
  if (!preset) throw new RangeError(t('studio.error.productionSequence'));
  return preset;
}
export function productionAspect(format: ProductionFormat): number {
  if (format === 'portrait') return 9 / 16;
  if (format === 'square') return 1;
  if (format === 'card') return 1.91;
  if (format !== 'landscape') throw new RangeError(t('studio.error.productionFormat'));
  return 16 / 9;
}

/** Reframe existing authored positions, preserving aim, lens, cuts and timings. */
export function reframeProductionPoint(pos: Vec3, target: Vec3, from: ProductionFormat,
  to: ProductionFormat, height: ProductionHeight): Vec3 {
  const ratio = productionDistanceScale(to) / productionDistanceScale(from);
  const next = pos.map((value, i) => target[i] + (value - target[i]) * ratio) as Vec3;
  next[1] = Math.max(next[1], height(next[0], next[2]) + 1.3);
  if (!next.every(Number.isFinite)) throw new RangeError(t('studio.error.cameraTarget'));
  return next;
}

function productionDistanceScale(format: ProductionFormat): number {
  return Math.min(16 / 9, (16 / 9) / productionAspect(format));
}

export function reframeProductionFov(fov: number, from: ProductionFormat, to: ProductionFormat): number {
  const lensScale = (format: ProductionFormat) => Math.max(1, 1 / productionAspect(format));
  return 2 * Math.atan(Math.tan(fov * Math.PI / 360) * lensScale(to) / lensScale(from)) * 180 / Math.PI;
}

/** Match horizontal subject coverage across native export ratios, without cropping a master. `mirror` stands the rig on
 *  the subject's right. */
export function productionCamera(rig: ProductionRigId, target: Vec3, headingDeg: number,
  height: ProductionHeight, format: ProductionFormat = 'landscape', mirror = false): { pos: Vec3; lookAt: Vec3; fov: number } {
  const rigs: Record<ProductionRigId, [number, number, number, number]> = {
    hero: [-12, 17, 4.3, 40], track: [-13, -2, 1.9, 46], rear: [-10, -19, 5, 46],
    overhead: [-20, -23, 26, 52], detail: [-8, 9, 3.1, 34],
  };
  if (!(rig in rigs)) throw new RangeError(t('studio.error.cameraRig'));
  const [left, forward, lift, fov] = rigs[rig];
  const side = mirror ? -left : left;
  // A vertical frame widens the lens after a modest dolly back, instead of
  // pushing the camera deep into trees behind the reviewed square position.
  const scale = productionDistanceScale(format);
  const yaw = headingDeg * Math.PI / 180, sin = Math.sin(yaw), cos = Math.cos(yaw);
  const x = target[0] + (side * cos + forward * sin) * scale;
  const z = target[2] + (forward * cos - side * sin) * scale;
  const ground = height(x, z);
  if (![...target, headingDeg, ground].every(Number.isFinite)) throw new RangeError(t('studio.error.cameraTarget'));
  return { pos: [x, Math.max(ground + 1.3, target[1] + (lift - 1.7) * scale), z], lookAt: [...target], fov: reframeProductionFov(fov, 'landscape', format) };
}

/** A sequence's act names in the reader's language (the recipe's own English when the catalog has none). */
export function productionShotNames(preset: ProductionPreset): [string, string, string] {
  return preset.shots.map((fallback, index) => {
    const key = `studio.director.ui.preset.${preset.id}.shot${index + 1}`;
    const text = t(key);
    return text === key ? fallback : text;
  }) as [string, string, string];
}

/** Terrain-relative authored locations keep recipes portable across renderer captures and the UI. */
export function createProductionScene(options: ProductionOptions, height: ProductionHeight, sees?: ProductionSight): ProductionScene {
  const preset = productionPreset(options.presetId), format = options.format ?? 'landscape';
  productionAspect(format);
  const names = productionShotNames(preset);
  const axisX = Math.sin(preset.headingDeg * Math.PI / 180), axisZ = Math.cos(preset.headingDeg * Math.PI / 180);
  const actors: ProductionActor[] = preset.cast.map((member) => ({
    id: member.name === 'lead' && options.vehicleId ? options.vehicleId : member.vehicle, name: member.name, pos: [...member.at],
    facingDeg: member.facingDeg, turretDeg: 0, camo: member.camo ?? preset.camo, camoSeed: 29101,
  }));
  const member = (name: string): ProductionCast => {
    const found = preset.cast.find((item) => item.name === name);
    if (!found) throw new RangeError(t('studio.error.productionSequence'));
    return found;
  };
  /** Where a vehicle is at a time of the take, along the sequence's axis. */
  const placeAt = (who: ProductionCast, tMs: number): Vec2 => {
    const along = who.travel * tMs / 8000;
    return [who.at[0] + axisX * along, who.at[1] + axisZ * along];
  };
  const shot = (tMs: number, act: 0 | 1 | 2, rig: ProductionRigId, mirror: boolean, cut = false) => {
    const subject = member(preset.subjects[act]);
    const [x, z] = placeAt(subject, tMs);
    const target: Vec3 = [x, height(x, z) + 1.7, z];
    return { id: `production-${tMs}`, label: names[act], tMs,
      ...productionCamera(rig, target, subject.facingDeg, height, format, mirror),
      transition: cut ? 'cut' : 'linear' };
  };
  const mirror = !!preset.mirror;
  /** An act's two keys on the first rig pair that sees its subject at both: the authored rigs on their side, then on the
   *  other, then the fallbacks; the authored pair when none is clear (on a battlefield the takes proved, rarely). */
  const act = (act: 0 | 1 | 2, start: number, end: number, rigs: readonly [ProductionRigId, ProductionRigId], cut: boolean) => {
    const tries: [ProductionRigId, ProductionRigId, boolean][] = [[rigs[0], rigs[1], mirror], [rigs[0], rigs[1], !mirror]];
    if (sees) for (const rig of RIG_FALLBACKS) for (const side of [mirror, !mirror]) tries.push([rig, rigs[1] === rigs[0] ? rig : rigs[1], side]);
    for (const [from, to, side] of tries) {
      const keys = [shot(start, act, from, side, cut), shot(end, act, to, side)];
      if (!sees || keys.every((key) => sees(key.pos, key.lookAt))) return keys;
    }
    return [shot(start, act, rigs[0], mirror, cut), shot(end, act, rigs[1], mirror)];
  };
  const [first, second, third, closing] = preset.rigs;
  const shots = [
    ...act(0, 0, 2633.333, [first, first], false),
    ...act(1, 2666.667, 5300, [second, second], true),
    ...act(2, 5333.333, 8000, [third, closing], true),
  ];
  const keys = (who: ProductionCast) => [0, 8000].map(tMs => ({
    id: `${who.name}-${tMs}`, tMs, pos: placeAt(who, tMs),
    facingDeg: who.facingDeg, turretDeg: who.turretDeg ?? 0, gunDeg: 0,
    transition: 'drive',
  }));
  const effects: ProductionEffect[] = [0, 1000, 2200, 3600, 4700, 6500].flatMap((tMs, i) =>
    actors.map(a => ({ id: `dust-${a.name}-${i}`, type: 'dust', actor: a.name, tMs,
      params: { count: 5, intensity: preset.dust } })));
  for (const cue of preset.effects ?? []) effects.push({ ...cue, ...(cue.at ? { at: [...cue.at] as Vec2 } : {}), params: { ...cue.params } });
  // a gun's report and a knockout shake the camera
  const reports = effects.filter((effect) => effect.type === 'fire' || effect.type === 'tank_kill').map((effect) => effect.tMs);
  const storyboard = normalizeStoryboard({ durationMs: 8000, shots,
    actorTracks: preset.cast.map(who => ({ actor: who.name, keys: keys(who) })),
    cameraCues: reports.map((tMs, i) => ({
      id: `report-${i}`, label: 'Recoil impulse', tMs, durationMs: 320, amplitudeM: 0.06,
      rollDeg: 0.22, fovKickDeg: 0.35, frequencyHz: 11, seed: 29100 + i,
    })),
  });
  const opening = shots[0];
  return { map: preset.map, timeOfDay: preset.timeOfDay, productionFormat: format, seed: 29101, actors, effects, storyboard,
    fxTime: 0, timeScale: 0, camera: { pos: opening.pos, lookAt: opening.lookAt, fov: opening.fov } };
}
