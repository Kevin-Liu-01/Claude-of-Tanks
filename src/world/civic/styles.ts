// src/world/civic/styles.ts — the civic kit's regional styles (the maps lane, 228): what a place lays its kerbs, its
// pavements, its gutters, its square's bands and its green's edging in, by the map's architecture key. A plan names its
// row; the kit builders read only the row. Colours are sRGB hex (the builders take them to linear).
//
// The first row is the Franconian town's (Kronach, Pappenheim): grey granite kerbs on the main streets, granite flags
// on the pavements in courses, a three-row Rinne at the kerb's foot, Burgsandstein dwarf walls round the greens under
// a cast-iron railing in RAL 6009, gravel (wassergebundene Decke) paths edged with a row of setts, oaks.
//
// Leaf module: no three.js.

export interface RegionalCivicStyle {
  readonly id: string;
  readonly kerb: {
    /** the kerb's top width and its face over the carriageway (m) */
    readonly width: number; readonly face: number;
    /** the units' lengths (m) */
    readonly unit: readonly [number, number];
    readonly hex: number;
  };
  readonly pavement: {
    /** flag courses: across (m) and the run of lengths along (m) */
    readonly course: number; readonly length: readonly [number, number];
    readonly hex: number;
    /** each flag's tone spread (±) */
    readonly tone: number;
    readonly joint: number;
  };
  readonly gutter: { readonly rows: number; readonly width: number; readonly dish: number; readonly hex: number };
  readonly bands: { readonly granite: number; readonly basalt: number; readonly sett: number; readonly bay: number };
  readonly edging: {
    /** the bed's kerb (granite): width, face, unit lengths */
    readonly kerb: { readonly width: number; readonly face: number; readonly hex: number };
    /** the dwarf wall inside it: width, height, the stone, the coping's overhang */
    readonly wall: { readonly width: number; readonly height: number; readonly hex: number; readonly coping: number };
    /** the gate piers at a bed's mouths */
    readonly pier: { readonly size: number; readonly height: number; readonly hex: number };
    /** the railing module kind on the wall (a props destructible) and its pitch */
    readonly railing: { readonly kind: string; readonly pitch: number; readonly scale: number } | null;
  };
  readonly path: { readonly hex: number; readonly edgeHex: number; readonly worn: number };
  readonly lawn: { readonly bare: number; readonly greens: readonly number[] };
  readonly flowers: readonly number[];
  readonly hedge: number;
  readonly grate: { readonly iron: number; readonly frame: number };
  readonly steps: number;
}

/** Each place's civic style, by its map's architecture key. */
export const CIVIC_STYLES: Readonly<Record<string, RegionalCivicStyle>> = Object.freeze({
  franconian: Object.freeze<RegionalCivicStyle>({
    id: 'franconian',
    kerb: { width: 0.25, face: 0.12, unit: [1.0, 1.4], hex: 0xa7a59e },
    pavement: { course: 0.5, length: [0.75, 1.0], hex: 0x9a958c, tone: 0.06, joint: 0x5e5b55 },
    gutter: { rows: 3, width: 0.45, dish: 0.02, hex: 0x6e6c66 },
    bands: { granite: 0x8f8c85, basalt: 0x4a4946, sett: 0x8e8a82, bay: 0x9b978f },
    edging: {
      kerb: { width: 0.25, face: 0.15, hex: 0xa7a59e },
      wall: { width: 0.3, height: 0.25, hex: 0xb89e7a, coping: 0.03 },
      pier: { size: 0.4, height: 0.9, hex: 0xb4996f },
      railing: { kind: 'fenceiron', pitch: 2.4, scale: 0.96 },
    },
    path: { hex: 0xb8a888, edgeHex: 0x8a867e, worn: 0x9a8a68 },
    lawn: { bare: 0x7a6a4a, greens: [0x4f6a32, 0x5d7838, 0x667a3c, 0x55703a] },
    flowers: [0xb82a2a, 0xe8e4dc, 0xc8303a, 0xf2efe6],
    hedge: 0x2c4a24,
    grate: { iron: 0x2a2a28, frame: 0x7f7c75 },
    steps: 0xb8a07c,
  }),
});

/** A plan's style row (throws on an unknown key: a plan must name a row that exists). */
export function civicStyle(id: string): RegionalCivicStyle {
  const style = CIVIC_STYLES[id];
  if (!style) throw new Error(`civic: no regional style '${id}'`);
  return style;
}
