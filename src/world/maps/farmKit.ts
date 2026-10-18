// src/world/maps/farmKit.ts — the farmyard's bales and troughs of each place and year (props lane A, family #18,
// 2026-10-14; WORKLIST.md #18: "hay and straw by year and place: loose hay cocks ... on the pre-1950 maps; twine-tied
// rectangular bales and ricklets on longleaf 1941, railyard 1962, cliffbridge 1972; round bales (net wrap,
// film-wrapped silage) on frontier, desert, saltwind, coastal ... Troughs: hollowed-log on legs, carved stone,
// galvanised riveted stock tanks, concrete with float valve, wooden tub").
//
// clutterKit.ts's clutterTypes resolves these kinds too: each keeps its name, record, placement and pool; the hay wears
// the hay print on the straw material and a silage bale its film on the vertex-colour material, one form at every
// distance (a bale casts its shadow: the depth pass runs no fold); every trough's far form folds past 45 m.
import type * as THREE from 'three';
import type { DestructiblePropType } from './inhabitKit.ts';
import { hexLin, type Rgb } from './craftMesh.ts';
import { baleBroken, baleNear, silageNear, troughBroken, troughFar, troughNear, type BaleForm, type TroughForm } from './farmForms.ts';

type Hex = number;
type Build = (rng: () => number) => THREE.BufferGeometry;
/** clutterKit.ts's entry, its material named (the hay's 'straw', else 'baked'). */
export type FarmEntry = (kind: string, mapId: string, near: Build, far: (() => THREE.BufferGeometry) | null, broken: Build | null,
  mat: DestructiblePropType['mat']) => DestructiblePropType;
const lin = (hex: Hex): Rgb => hexLin(hex);

interface BaleSpec { form: string; kind: BaleForm['kind']; cock?: BaleForm['cock']; film?: Hex; tape?: Hex }
const COCK: BaleSpec = { form: 'hay-cock', kind: 'cock' };
const SQUARE: BaleSpec = { form: 'square-ricklet', kind: 'square' };
const ROUND: BaleSpec = { form: 'round-bale', kind: 'round' };
export const BALE_FORMS: Readonly<Record<string, BaleSpec>> = Object.freeze({
  // Prokhorovka's kopna; the Podhale's hay hung up its ostrewki; the rice straw of Kohima's terraces and the Jamuna's chars
  verdant: { ...COCK, form: 'kopna', cock: 'kopna' }, winter: { ...COCK, form: 'ostrewka', cock: 'ostrewka' },
  autumn: COCK, polders: COCK, reservoir: COCK, alpine: COCK,
  monsoon: { ...COCK, form: 'rice-straw-stack', cock: 'rice' }, delta: { ...COCK, form: 'rice-straw-stack', cock: 'rice' }, mangrove: { ...COCK, form: 'rice-straw-stack', cock: 'rice' },
  longleaf: SQUARE, railyard: SQUARE, cliffbridge: SQUARE, steppe: SQUARE,
  frontier: ROUND, desert: ROUND, saltwind: ROUND,
  coastal: { form: 'silage-wrapped', kind: 'silage', film: 0x1c1e1c, tape: 0xd8d8d0 },
});

interface TroughSpec { form: string; kind: TroughForm['kind']; body: Hex; trim: Hex }
const LOG: TroughSpec = { form: 'hollowed-log', kind: 'log', body: 0x6a5440, trim: 0x5a4a38 };
const STONE: TroughSpec = { form: 'carved-stone', kind: 'stone', body: 0x9a948a, trim: 0x8a8478 };
const TANK: TroughSpec = { form: 'stock-tank', kind: 'tank', body: 0x9aa0a0, trim: 0x7a8080 };
const CONCRETE: TroughSpec = { form: 'concrete-float-valve', kind: 'concrete', body: 0xa8a49a, trim: 0x5a5a56 };
export const TROUGH_FORMS: Readonly<Record<string, TroughSpec>> = Object.freeze({
  alpine: LOG, winter: LOG, fjord: LOG, verdant: LOG, steppe: LOG,
  saltwind: { ...STONE, body: 0xc8c0b0 }, orchard: { ...STONE, body: 0xc8b8a0 }, cliffbridge: { ...STONE, body: 0xb8a890 }, desert: { ...STONE, body: 0xb89a78 },
  oasis: { ...STONE, body: 0xb8a080 }, badlands: { ...STONE, body: 0xa87a5a }, autumn: { ...STONE, body: 0x9a9488 },
  longleaf: TANK, skybridge: TANK, titan_gorge: TANK, copper_mesa: TANK, airfield: TANK, whiteout: TANK,
  // (2026-10-17, the maps lane; the Polders village blind 227's follow-ups, pose 2: "a white rectangular slab/trough on
  // the grass reads as an untextured placeholder") the Zeeland farm's trough is a block of Belgian bluestone (hardsteen),
  // dark and weathered, not the pale cast concrete that read as a white slab in the sun
  polders: { ...STONE, form: 'bluestone', body: 0x666a6a, trim: 0x545858 },
  railyard: CONCRETE, frontier: CONCRETE, reservoir: CONCRETE, coastal: CONCRETE, foundry: CONCRETE, monsoon: CONCRETE, mangrove: CONCRETE, delta: CONCRETE,
  caldera: { form: 'wooden-tub', kind: 'tub', body: 0x9a7a52, trim: 0x8a9a5a },
});
const WATER = 0x1e2a26;

/** The forms a map's farm kinds take (null: the legacy form). */
export function farmFormOf(kind: string, mapId: string): string | null {
  if (kind === 'bale') return BALE_FORMS[mapId]?.form ?? null;
  if (kind === 'trough') return TROUGH_FORMS[mapId]?.form ?? null;
  return null;
}

/** The farm kinds' forms on a map (clutterKit.ts clutterTypes merges them). */
export function farmTypes(mapId: string, entry: FarmEntry): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  const bale = BALE_FORMS[mapId];
  if (bale) {
    const f: BaleForm = { kind: bale.kind, cock: bale.cock, film: bale.film ? lin(bale.film) : undefined, tape: bale.tape ? lin(bale.tape) : undefined };
    out.bale = f.kind === 'silage'
      ? entry('bale', mapId, (r) => silageNear(f, r), null, (r) => baleBroken(f, r), 'baked')
      : entry('bale', mapId, (r) => baleNear(f, r), null, (r) => baleBroken(f, r), 'straw');
  }
  const trough = TROUGH_FORMS[mapId];
  if (trough) {
    const f: TroughForm = { kind: trough.kind, body: lin(trough.body), trim: lin(trough.trim), water: lin(WATER) };
    out.trough = entry('trough', mapId, (r) => troughNear(f, r), () => troughFar(f), (r) => troughBroken(f, r), 'baked');
  }
  return out;
}
