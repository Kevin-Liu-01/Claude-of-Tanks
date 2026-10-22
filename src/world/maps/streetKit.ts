// src/world/maps/streetKit.ts — the street furniture of each place and period (props lane A, family #14, 2026-10-14;
// WORKLIST.md #14: benches, lamps, cones, barriers, road signs by national standard and year, bins, rug frames).
//
// clutterKit.ts's clutterTypes resolves these kinds too (props.ts LOCAL_TYPES, after the period forms): each kind keeps
// its name, record, placement and pool; its build is the map's own form, the legacy builder's draws spent first (the
// entry clutterKit hands in). The kinds that cast their own shadow (the lamp, the road sign, the barrier, the rug frame)
// draw one form at every distance; the bench, the bin and the cone fold to a far form past 45 m.
import * as THREE from 'three';
import type { DestructiblePropType } from './inhabitKit.ts';
import { hexLin, type Rgb } from './craftMesh.ts';
import { MAP_SETTING_YEAR, MODERN_KIND_INTRODUCED } from './periodClutterKit.ts';
import { setNightEmissionMask } from '../../engine/nightEmissionMaterial.ts';
import {
  barrierBroken, barrierNear, benchBroken, benchFar, benchNear, binFar, binNear, coneFar, coneNear, lampNear, rugFrameBroken, rugFrameNear, signNear,
  type BarrierForm, type BenchForm, type BinForm, type ConeForm, type LampForm, type RugFrameForm, type SignForm,
} from './streetForms.ts';

type Hex = number;
type Build = (rng: () => number) => THREE.BufferGeometry;
/** clutterKit.ts's entry: the legacy builders' draws spent, then the map's form near and far (far null: one form). */
export type StreetEntry = (kind: string, mapId: string, near: Build, far: (() => THREE.BufferGeometry) | null, broken: Build | null) => DestructiblePropType;
const lin = (hex: Hex): Rgb => hexLin(hex);
const year = (mapId: string): number => MAP_SETTING_YEAR[mapId] ?? 2000;
const period = (kind: keyof typeof MODERN_KIND_INTRODUCED, mapId: string): boolean => year(mapId) < MODERN_KIND_INTRODUCED[kind];

// ---------------------------------------------------------------------------------------------------- benches
interface BenchSpec { form: string; kind: BenchForm['kind']; wood: Hex; frame: Hex }
const CAST: BenchSpec = { form: 'cast-iron-park', kind: 'castiron', wood: 0x8a6a48, frame: 0x2a3a2e };
const EAST: BenchSpec = { form: 'concrete-ends', kind: 'concrete', wood: 0x4a6a3a, frame: 0x9a9890 };
const MASTABA: BenchSpec = { form: 'mastaba', kind: 'mastaba', wood: 0x8a3a2a, frame: 0xc8b490 };
const BAMBOO: BenchSpec = { form: 'bamboo', kind: 'bamboo', wood: 0xc8b070, frame: 0x9a8450 };
const WPA: BenchSpec = { form: 'wpa-plank', kind: 'wpa', wood: 0x8a7050, frame: 0x6a5440 };
const STONE: BenchSpec = { form: 'stone-and-timber', kind: 'stone', wood: 0x8a6a48, frame: 0xb8ac98 };
const TIMBER: BenchSpec = { form: 'timber', kind: 'timber', wood: 0x9a7a52, frame: 0x6a5440 };
const MUNI: BenchSpec = { form: 'municipal', kind: 'municipal', wood: 0x9a7a52, frame: 0x3a4a3a };
const STEEL: BenchSpec = { form: 'steel', kind: 'steel', wood: 0x7a8088, frame: 0x4a5058 };
export const BENCH_FORMS: Readonly<Record<string, BenchSpec>> = Object.freeze({
  autumn: CAST, railyard: CAST, foundry: CAST, frontier: CAST, urban: CAST, polders: { ...CAST, frame: 0x1e2a3a }, reservoir: CAST, blackglass: { ...CAST, frame: 0x2a2c2a },
  verdant: EAST, winter: EAST, steppe: EAST, airfield: { ...EAST, wood: 0x6a5a3a }, ruinspires: { ...EAST, wood: 0x7a5a3a },
  oasis: MASTABA, badlands: { ...MASTABA, frame: 0xb89a78 }, desert: { ...MASTABA, frame: 0xc8a882 }, orchard: { ...MASTABA, frame: 0xd8ccb8, wood: 0x3a5a8a },
  monsoon: BAMBOO, delta: BAMBOO, mangrove: BAMBOO, longleaf: WPA, titan_gorge: WPA, skybridge: WPA, saltwind: STONE, cliffbridge: STONE,
  fjord: TIMBER, alpine: TIMBER, caldera: MUNI, coastal: { ...MUNI, frame: 0x2a4a6a }, copper_mesa: { ...MUNI, frame: 0x3a5a3a }, whiteout: STEEL, mars: STEEL, moon: STEEL,
});

// ---------------------------------------------------------------------------------------------------- bins
interface BinSpec { form: string; kind: BinForm['kind']; body: Hex; trim: Hex }
const DUSTBIN: BinSpec = { form: 'galvanised-dustbin', kind: 'dustbin', body: 0x9aa0a0, trim: 0x7a8080 };
const DRUM_BIN: BinSpec = { form: 'drum-bin', kind: 'drum', body: 0x2d5ea8, trim: 0x2a2a2a };
const PLASTIC_BIN = (body: Hex): BinSpec => ({ form: 'plastic-bin', kind: 'plastic', body, trim: body });
export const BIN_FORMS: Readonly<Record<string, BinSpec>> = Object.freeze({
  desert: { ...DRUM_BIN, body: 0x6a6a64 }, oasis: DRUM_BIN, badlands: DRUM_BIN, delta: { ...DRUM_BIN, body: 0x5f5a50 }, mangrove: DRUM_BIN, orchard: { ...DRUM_BIN, body: 0x3d5f7a },
  blackglass: { form: 'wicker-basket', kind: 'basket', body: 0xa08a5a, trim: 0x6a5a3a }, monsoon: { form: 'wicker-basket', kind: 'basket', body: 0x9a8454, trim: 0x6a5a3a },
  caldera: PLASTIC_BIN(0x3a6a5a), coastal: PLASTIC_BIN(0x3a6a3a), airfield: PLASTIC_BIN(0x2a4a6a), mars: PLASTIC_BIN(0xd8d6d0), moon: PLASTIC_BIN(0xd8d6d0),
  fjord: DUSTBIN, winter: DUSTBIN, foundry: DUSTBIN, alpine: DUSTBIN, reservoir: DUSTBIN, autumn: DUSTBIN, polders: DUSTBIN, longleaf: DUSTBIN, verdant: DUSTBIN,
  steppe: DUSTBIN, railyard: DUSTBIN, skybridge: DUSTBIN, titan_gorge: DUSTBIN, cliffbridge: DUSTBIN, copper_mesa: DUSTBIN, urban: DUSTBIN, frontier: DUSTBIN,
  whiteout: DUSTBIN, ruinspires: DUSTBIN, saltwind: DUSTBIN,
});

// ---------------------------------------------------------------------------------------------------- cones
const CONE = { kind: 'cone' as const, body: 0xe0601a, band: 0xe8e8e0, base: 0x2a2a2a };
function coneSpec(mapId: string): { form: string; spec: { kind: ConeForm['kind']; body: Hex; band: Hex; base: Hex } } {
  if (period('cone', mapId)) return { form: 'road-trestle', spec: { kind: 'trestle', body: 0xb8302a, band: 0xe8e4d8, base: 0x9a8458 } };
  if (mapId === 'caldera') return { form: 'cone-jp', spec: { ...CONE, body: 0xc8302a } };
  return { form: 'traffic-cone', spec: CONE };
}

// ---------------------------------------------------------------------------------------------------- barriers
interface BarrierSpec { form: string; kind: BarrierForm['kind']; body: Hex; trim: Hex; mark?: Hex }
const JERSEY: BarrierSpec = { form: 'new-jersey', kind: 'jersey', body: 0xa8a49a, trim: 0x5a5a56, mark: 0xe8c030 };
const BLOCKS: BarrierSpec = { form: 'blocks-and-drum', kind: 'blocks', body: 0x9a968c, trim: 0x2d5ea8 };
const BARRIERS: Readonly<Record<string, BarrierSpec>> = Object.freeze({
  urban: { ...JERSEY, form: 'betonschutzwand' }, frontier: { ...JERSEY, form: 'betonschutzwand' }, railyard: JERSEY, skybridge: JERSEY, titan_gorge: JERSEY,
  copper_mesa: JERSEY, whiteout: { ...JERSEY, mark: 0xd8702a }, cliffbridge: JERSEY, saltwind: JERSEY, mars: { ...JERSEY, body: 0xd8d6d0, mark: 0xd97d2e },
  moon: { ...JERSEY, body: 0xd8d6d0, mark: 0xd8702a },
  orchard: BLOCKS, ruinspires: { ...BLOCKS, trim: 0x5f5a50 }, steppe: { ...BLOCKS, trim: 0x4a5a3a }, delta: { ...BLOCKS, trim: 0x5f5a50 }, mangrove: BLOCKS,
  coastal: { form: 'water-filled', kind: 'water', body: 0xc83a2a, trim: 0xe8e8e0 }, caldera: { form: 'water-filled', kind: 'water', body: 0xd8a020, trim: 0x2a2a2a },
  oasis: { form: 'hesco', kind: 'hesco', body: 0xc8b088, trim: 0x7a7a70, mark: 0xa89870 }, desert: { form: 'hesco', kind: 'hesco', body: 0xc8a882, trim: 0x7a7a70, mark: 0x9a8a68 },
  badlands: { form: 'hesco', kind: 'hesco', body: 0xb89a78, trim: 0x7a7a70, mark: 0x9a8a68 }, airfield: { form: 'blocks-and-tyres', kind: 'tyres', body: 0x8a8880, trim: 0x232323 },
});
function barrierSpec(mapId: string): BarrierSpec {
  if (period('barrier', mapId)) return { form: 'log-barricade', kind: 'logs', body: 0x6a5a48, trim: 0x7a6a50 };
  return BARRIERS[mapId] ?? JERSEY;
}

// ---------------------------------------------------------------------------------------------------- road signs
interface SignSpec { form: string; kind: SignForm['kind']; plate: Hex; legend: Hex; border: Hex; post: Hex; pointed?: boolean }
const GALV = 0x9aa0a0, TIMBER_POST = 0x6a5440, BLACK = 0x1a1a1a, WHITE = 0xf0f0e8;
const WEGWEISER: SignSpec = { form: 'wegweiser', kind: 'direction', plate: 0xe8c020, legend: BLACK, border: BLACK, post: GALV, pointed: true };
const TACTICAL: SignSpec = { form: 'tactical-boards', kind: 'tactical', plate: 0xe8e4d8, legend: BLACK, border: 0x4a4c48, post: TIMBER_POST };
const SOVIET: SignSpec = { form: 'soviet-board', kind: 'board', plate: WHITE, legend: BLACK, border: BLACK, post: TIMBER_POST };
export const SIGN_FORMS: Readonly<Record<string, SignSpec>> = Object.freeze({
  // the period's (before the retroreflective sign of 1960)
  blackglass: { form: 'enamel-street-plate', kind: 'board', plate: 0x2a4a8a, legend: WHITE, border: WHITE, post: TIMBER_POST },
  fjord: TACTICAL, alpine: TACTICAL, foundry: TACTICAL, reservoir: { ...TACTICAL, plate: 0xd8d0b0 },
  longleaf: { form: 'us-route-1941', kind: 'shield', plate: WHITE, legend: BLACK, border: BLACK, post: TIMBER_POST },
  verdant: SOVIET, steppe: { ...SOVIET, plate: 0x3a5a3a, legend: WHITE, border: WHITE }, winter: { form: 'drogowskaz', kind: 'fingerpost', plate: 0xe8e4d8, legend: BLACK, border: 0x2a2a2a, post: TIMBER_POST },
  autumn: { form: 'borne-michelin', kind: 'michelin', plate: 0xe8e4d8, legend: BLACK, border: 0x2a4a8a, post: 0xb8b4a8 },
  monsoon: { form: 'pwd-milestone', kind: 'milestone', plate: 0xe8c020, legend: BLACK, border: BLACK, post: 0xd8d0c0 },
  polders: { form: 'anwb-paddenstoel', kind: 'paddenstoel', plate: WHITE, legend: 0x2a4a8a, border: BLACK, post: WHITE },
  // the modern standards
  railyard: WEGWEISER, urban: WEGWEISER, frontier: WEGWEISER,
  skybridge: { form: 'us-route-shield', kind: 'shield', plate: WHITE, legend: BLACK, border: BLACK, post: GALV },
  titan_gorge: { form: 'us-guide', kind: 'direction', plate: 0x2a6a3a, legend: WHITE, border: WHITE, post: GALV },
  cliffbridge: { form: 'senal-espana', kind: 'direction', plate: WHITE, legend: 0x2a4a8a, border: 0x2a4a8a, post: GALV, pointed: true },
  copper_mesa: { form: 'au-guide', kind: 'direction', plate: 0x2a6a3a, legend: WHITE, border: WHITE, post: GALV },
  orchard: { form: 'bilingual-lb', kind: 'bilingual', plate: 0x2a5aa0, legend: WHITE, border: WHITE, post: GALV },
  desert: { form: 'bilingual-ly', kind: 'bilingual', plate: 0x2a6a3a, legend: WHITE, border: WHITE, post: GALV },
  oasis: { form: 'bilingual-eg', kind: 'bilingual', plate: 0x2a5aa0, legend: WHITE, border: WHITE, post: GALV },
  badlands: { form: 'bilingual-jo', kind: 'bilingual', plate: 0x6a4a2a, legend: WHITE, border: WHITE, post: GALV },
  delta: { form: 'bilingual-bd', kind: 'bilingual', plate: 0x2a6a3a, legend: WHITE, border: WHITE, post: GALV },
  whiteout: { form: 'usaf-station', kind: 'board', plate: WHITE, legend: 0xc8302a, border: BLACK, post: GALV },
  ruinspires: { form: 'jugoslav-warning', kind: 'warning', plate: WHITE, legend: BLACK, border: 0xc8302a, post: GALV },
  saltwind: { form: 'jugoslav-direction', kind: 'direction', plate: 0x2a5aa0, legend: WHITE, border: WHITE, post: GALV, pointed: true },
  mangrove: { form: 'bien-chi-dan', kind: 'direction', plate: 0x2a5aa0, legend: WHITE, border: WHITE, post: GALV },
  caldera: { form: 'annai-hyoshiki', kind: 'direction', plate: 0x2a4a9a, legend: WHITE, border: WHITE, post: GALV },
  airfield: { form: 'ua-direction', kind: 'direction', plate: 0x2a5aa0, legend: WHITE, border: WHITE, post: GALV },
  coastal: { form: 'panneau-directionnel', kind: 'direction', plate: WHITE, legend: BLACK, border: 0xc8302a, post: GALV, pointed: true },
  mars: { form: 'station-board', kind: 'board', plate: WHITE, legend: 0xd97d2e, border: 0x9ea4aa, post: 0x9ea4aa },
  moon: { form: 'station-board', kind: 'board', plate: WHITE, legend: 0xd8702a, border: 0x9a9a96, post: 0x9a9a96 },
});

// ---------------------------------------------------------------------------------------------------- lamps
/** `candela`: the lamp's pooled light where its form's differs from the street lamp's (worldNightLighting.ts) */
interface LampSpec { form: string; kind: LampForm['kind']; metal: Hex; broken?: boolean; candela?: number }
export const LAMP_FORMS: Readonly<Record<string, LampSpec>> = Object.freeze({
  blackglass: { form: 'bund-column', kind: 'victorian', metal: 0x2a3a2e }, foundry: { form: 'gaslaterne', kind: 'gas', metal: 0x3a3a38 },
  railyard: { form: 'yard-floods', kind: 'yard', metal: 0x7a7a76 }, urban: { form: 'gaslaterne', kind: 'gas', metal: 0x2e302e, candela: 75 },
  ruinspires: { form: 'cobra-head-shot-out', kind: 'cobra', metal: 0x8a8c8a, broken: true },
  // (229 b1) Ronda's plazas: the cast-iron column lamp (the farola fernandina's line), black iron
  cliffbridge: { form: 'bund-column', kind: 'victorian', metal: 0x1c1c1c },
});
const LAMP_DEFAULT: LampSpec = { form: 'peitschenmast', kind: 'whip', metal: 0x9aa0a0 };
/** The map's lamp as a form (props.ts's toppled posts lie in it: streetForms.ts toppledLamp). */
export function streetLampFormOf(mapId: string): LampForm {
  const lamp = LAMP_FORMS[mapId] ?? LAMP_DEFAULT;
  return { kind: lamp.kind, metal: lin(lamp.metal), glass: lin(0xf0e2b0), broken: lamp.broken };
}

// ---------------------------------------------------------------------------------------------------- rug frames
const RUGS: Readonly<Record<string, ReadonlyArray<readonly [Hex, Hex]>>> = Object.freeze({
  sahara: [[0x8a2a24, 0x2a3a6a], [0x2a4a6a, 0xc8a040]], navajo: [[0x8a2a24, 0x1a1a1a], [0xe8e2d0, 0x8a2a24]],
  bengal: [[0xc83a2a, 0xe8a030], [0x2a7a5a, 0xe8d8a0]], levant: [[0x6a2a2a, 0xd8c8a0], [0x2a3a5a, 0xa8784a]],
});
const RUG_REGION: Readonly<Record<string, string>> = Object.freeze({
  desert: 'sahara', oasis: 'sahara', badlands: 'sahara', titan_gorge: 'navajo', delta: 'bengal', mangrove: 'bengal', monsoon: 'bengal', orchard: 'levant', saltwind: 'levant',
});

/** The forms a map's street furniture takes (null: the kind's legacy form there). */
export function streetFormOf(kind: string, mapId: string): string | null {
  switch (kind) {
    case 'bench': return BENCH_FORMS[mapId]?.form ?? null;
    case 'trashcan': return BIN_FORMS[mapId]?.form ?? null;
    case 'cone': return MAP_SETTING_YEAR[mapId] === undefined ? null : coneSpec(mapId).form;
    case 'barrier': return MAP_SETTING_YEAR[mapId] === undefined ? null : barrierSpec(mapId).form;
    case 'roadsign': return SIGN_FORMS[mapId]?.form ?? null;
    case 'lamp': return MAP_SETTING_YEAR[mapId] === undefined ? null : (LAMP_FORMS[mapId] ?? LAMP_DEFAULT).form;
    case 'rugframe': return MAP_SETTING_YEAR[mapId] === undefined ? null : `rugs-${RUG_REGION[mapId] ?? 'sahara'}`;
    default: return null;
  }
}

/** The street kinds' forms on a map (clutterKit.ts clutterTypes merges them). */
export function streetTypes(mapId: string, entry: StreetEntry): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  if (MAP_SETTING_YEAR[mapId] === undefined) return out;
  const bench = BENCH_FORMS[mapId];
  if (bench) {
    const f: BenchForm = { kind: bench.kind, wood: lin(bench.wood), frame: lin(bench.frame) };
    out.bench = entry('bench', mapId, (r) => benchNear(f, r), () => benchFar(f), (r) => benchBroken(f, r));
  }
  const bin = BIN_FORMS[mapId];
  if (bin) {
    const f: BinForm = { kind: bin.kind, body: lin(bin.body), trim: lin(bin.trim) };
    out.trashcan = entry('trashcan', mapId, (r) => binNear(f, r), () => binFar(f), null);
  }
  const cone = coneSpec(mapId).spec, cf: ConeForm = { kind: cone.kind, body: lin(cone.body), band: lin(cone.band), base: lin(cone.base) };
  out.cone = entry('cone', mapId, (r) => coneNear(cf, r), () => coneFar(cf), null);
  const barrier = barrierSpec(mapId), bf: BarrierForm = { kind: barrier.kind, body: lin(barrier.body), trim: lin(barrier.trim), mark: barrier.mark ? lin(barrier.mark) : undefined };
  out.barrier = entry('barrier', mapId, (r) => barrierNear(bf, r), null, (r) => barrierBroken(bf, r));
  const sign = SIGN_FORMS[mapId];
  if (sign) {
    const f: SignForm = { kind: sign.kind, plate: lin(sign.plate), legend: lin(sign.legend), border: lin(sign.border), post: lin(sign.post), pointed: sign.pointed };
    out.roadsign = entry('roadsign', mapId, (r) => signNear(f, r), null, null);
  }
  const lamp = LAMP_FORMS[mapId] ?? LAMP_DEFAULT, lf: LampForm = { kind: lamp.kind, metal: lin(lamp.metal), glass: lin(0xf0e2b0), broken: lamp.broken };
  out.lamp = entry('lamp', mapId, (r) => {
    // the glass carries the night mask (its lantern lights at dusk: worldNightLighting.ts reads the lens's seat)
    const { geometry, glass } = lampNear(lf, r);
    const vertices: number[] = [];
    for (const [a, b] of glass) for (let v = a; v < b; v++) vertices.push(v);
    setNightEmissionMask(geometry, 1, vertices);
    geometry.userData.lampLens = glass.length ? lensOf(geometry, glass) : null;
    // (228 r2: Steinburg's thirty gas lanterns at the street lamp's 150 cd blew the square's pale setts to white in their
    // pools) a gas lantern's own, dimmer light where its map's form names one
    if (lamp.candela !== undefined) geometry.userData.lampCandela = lamp.candela;
    return geometry;
  }, null, null);
  const rugs = RUGS[RUG_REGION[mapId] ?? 'sahara'], rf: RugFrameForm = { wood: lin(0x6a5040), rugs: rugs.map(([a, b]) => [lin(a), lin(b)] as const) };
  out.rugframe = entry('rugframe', mapId, (r) => rugFrameNear(rf, r), null, (r) => rugFrameBroken(rf, r));
  return out;
}

/** The middle of a lamp's glass (its light's seat, in the lamp's own frame). */
function lensOf(g: THREE.BufferGeometry, glass: ReadonlyArray<readonly [number, number]>): [number, number, number] {
  const p = g.getAttribute('position');
  let x = 0, y = 0, z = 0, n = 0;
  for (const [a, b] of glass) for (let v = a; v < b; v++) { x += p.getX(v); y += p.getY(v); z += p.getZ(v); n++; }
  return [x / n, y / n, z / n];
}
