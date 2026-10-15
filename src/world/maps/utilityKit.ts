// src/world/maps/utilityKit.ts — the transformer of each place and year (props lane A, family #21, 2026-10-14;
// WORKLIST.md #21: "Transformers: pad-mount cabinets (coastal, caldera, airfield, oasis, badlands, mangrove, delta),
// pole-mount cans on H-frames (titan_gorge, skybridge, copper_mesa), brick or concrete kiosk substations (ruinspires,
// saltwind, urban, frontier, orchard), steel switchgear housing (whiteout); period forms from periodClutterKit").
//
// clutterKit.ts's clutterTypes resolves the kind through its entry (its legacy draws spent, its seat footprint the
// pre-form kind's: the period's crate stack where the map has one). A transformer casts its shadow: one form at every
// distance, on the baked material. The maps before the pad-mount's year (1960) keep their supply crates on skids, now
// the map's own crates (clutterKit's crate form).
import type * as THREE from 'three';
import type { DestructiblePropType } from './inhabitKit.ts';
import { hexLin } from './craftMesh.ts';
import type { CrateForm } from './clutterForms.ts';
import { MAP_SETTING_YEAR, MODERN_KIND_INTRODUCED } from './periodClutterKit.ts';
import { transformerBroken, transformerNear, type TransformerForm } from './utilityForms.ts';

type Hex = number;
type Build = (rng: () => number) => THREE.BufferGeometry;
/** clutterKit.ts's entry. */
export type UtilityEntry = (kind: string, mapId: string, near: Build, far: (() => THREE.BufferGeometry) | null, broken: Build | null) => DestructiblePropType;

interface TransformerSpec { form: string; kind: TransformerForm['kind']; body: Hex; trim: Hex; roof?: Hex; hip?: boolean }
const PAD: TransformerSpec = { form: 'pad-mount', kind: 'pad', body: 0xb8bcb0, trim: 0x5a5e58 };
const KIOSK_DE: TransformerSpec = { form: 'kompaktstation', kind: 'kiosk', body: 0xc8c2b0, trim: 0x6a7068, roof: 0x8e8a82 };
const KIOSK_YU: TransformerSpec = { form: 'trafostanica', kind: 'kiosk', body: 0xd8d0be, trim: 0x5a6a62, roof: 0x9a4a32, hip: true };
const HFRAME: TransformerSpec = { form: 'h-frame-cans', kind: 'hframe', body: 0x9aa0a0, trim: 0x4a3a2a };
const SWITCHGEAR: TransformerSpec = { form: 'switchgear', kind: 'switchgear', body: 0xb8bcb8, trim: 0x4a4e4c };
export const TRANSFORMER_FORMS: Readonly<Record<string, TransformerSpec>> = Object.freeze({
  // the pad-mounts: the Léon's (Enedis grey-beige), Aso's, Hostomel's (a KTP's grey-green), the desert maps' sand-beige,
  // the Bengal and Mekong deltas' grey
  coastal: { ...PAD, body: 0xc8c0a8 }, caldera: PAD, airfield: { ...PAD, body: 0x9aa098 }, oasis: { ...PAD, body: 0xd0c4a8 },
  badlands: { ...PAD, body: 0xd0c4a8 }, desert: { ...PAD, body: 0xd0c4a8 }, mangrove: { ...PAD, body: 0x9aa4a0 }, delta: { ...PAD, body: 0x9aa4a0 },
  // the kiosks: West Germany's concrete Kompaktstation, Yugoslavia's rendered trafostanica under its tiles, the Chouf's
  // stone one under its slab, Andalusia's whitewashed one under its tiles
  urban: KIOSK_DE, frontier: KIOSK_DE, railyard: KIOSK_DE, ruinspires: KIOSK_YU, saltwind: KIOSK_YU,
  orchard: { form: 'stone-kiosk', kind: 'kiosk', body: 0xc8b8a0, trim: 0x4a5a52, roof: 0xa8a090 },
  cliffbridge: { form: 'casilla', kind: 'kiosk', body: 0xe8e4dc, trim: 0x3a5a4a, roof: 0xa85a3a, hip: true },
  // the American West's cans on a timber H-frame (copper_mesa: Queenstown's the same make)
  titan_gorge: HFRAME, skybridge: HFRAME, copper_mesa: HFRAME,
  // the steel housings: DYE-M's, the lunar base's, Olympus Basin's
  whiteout: SWITCHGEAR, moon: { ...SWITCHGEAR, form: 'switchgear-lunar', body: 0xd8d8d0, trim: 0xb08a30 },
  mars: { ...SWITCHGEAR, form: 'switchgear-mars', body: 0xd8d4cc, trim: 0xc05a28 },
});
const lin = hexLin;

/** Whether the map's year is before the pad-mount's (its transformer is the period's crate stack). */
const period = (mapId: string): boolean => (MAP_SETTING_YEAR[mapId] ?? 9999) < MODERN_KIND_INTRODUCED.transformer;

/** The form a map's transformer takes (null: the legacy form). */
export function utilityFormOf(kind: string, mapId: string): string | null {
  if (kind !== 'transformer' || MAP_SETTING_YEAR[mapId] === undefined) return null;
  return period(mapId) ? 'supply-crates' : TRANSFORMER_FORMS[mapId]?.form ?? null;
}

/** The utility kinds' forms on a map (clutterKit.ts clutterTypes merges them); `crate` the map's crate form. */
export function utilityTypes(mapId: string, entry: UtilityEntry, crate: CrateForm | null): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  if (MAP_SETTING_YEAR[mapId] === undefined) return out;
  let f: TransformerForm | null = null;
  if (period(mapId)) { if (crate) f = { kind: 'crates', body: crate.wood, trim: crate.frame, crate }; }
  else {
    const s = TRANSFORMER_FORMS[mapId];
    if (s) f = { kind: s.kind, body: lin(s.body), trim: lin(s.trim), roof: s.roof ? lin(s.roof) : undefined, hip: s.hip };
  }
  if (f) {
    const form = f;
    out.transformer = entry('transformer', mapId, (r) => transformerNear(form, r), null, (r) => transformerBroken(form, r));
  }
  return out;
}
