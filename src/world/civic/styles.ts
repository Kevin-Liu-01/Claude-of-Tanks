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
    /** (229) the run's sample step along its street (m; absent 1.0) and its courses at most across (absent: as the width
     *  takes them): a city's cast slabs drawn as a few long courses, not 40 cm flags */
    readonly step?: number; readonly maxCourses?: number;
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
    // (228 r3, the blind critics: the pale grey flags "look modern concrete-slab, not Franconian sandstone or granite")
    // the flags a warm granite of the Fichtelgebirge, the joints sanded
    pavement: { course: 0.5, length: [0.75, 1.0], hex: 0xa69a86, tone: 0.07, joint: 0x625a4e },
    gutter: { rows: 3, width: 0.45, dish: 0.02, hex: 0x6e6c66 },
    bands: { granite: 0x8f8c85, basalt: 0x4a4946, sett: 0x8e8a82, bay: 0x9b978f },
    edging: {
      kerb: { width: 0.25, face: 0.15, hex: 0xa7a59e },
      // (228 r3: the plinth "reads as a bright painted yellow line" in the sun) a weathered Burgsandstein
      wall: { width: 0.3, height: 0.25, hex: 0xa69680, coping: 0.03 },
      pier: { size: 0.4, height: 0.9, hex: 0xa08c70 },
      railing: { kind: 'fenceiron', pitch: 2.4, scale: 0.96 },
    },
    path: { hex: 0xb8a888, edgeHex: 0x8a867e, worn: 0x9a8a68 },
    lawn: { bare: 0x7a6a4a, greens: [0x4f6a32, 0x5d7838, 0x667a3c, 0x55703a] },
    flowers: [0xb82a2a, 0xe8e4dc, 0xc8303a, 0xf2efe6],
    hedge: 0x2c4a24,
    grate: { iron: 0x2a2a28, frame: 0x7f7c75 },
    steps: 0xb8a07c,
  }),
  // (229 b1) Sarajevo's Yugoslav precast (Ruinspires, 1992-96): concrete kerbs, 40 cm cast slabs, a concrete channel, the
  // planter beds' cast walls (no railing), worn lawns
  sarajevo: Object.freeze<RegionalCivicStyle>({
    id: 'sarajevo',
    kerb: { width: 0.18, face: 0.15, unit: [1.0, 1.0], hex: 0x9c9a94 },
    pavement: { course: 0.4, length: [0.4, 0.4], hex: 0x8e8b84, tone: 0.08, joint: 0x55524c, step: 2.0, maxCourses: 2 },
    gutter: { rows: 1, width: 0.30, dish: 0.015, hex: 0x6f6d68 },
    bands: { granite: 0x8a8780, basalt: 0x4c4a47, sett: 0x7e7a72, bay: 0x9a968e },
    edging: {
      kerb: { width: 0.15, face: 0.25, hex: 0x9c9a94 },
      wall: { width: 0.25, height: 0.45, hex: 0x8a8780, coping: 0.02 },
      pier: { size: 0.35, height: 0.6, hex: 0x8a8780 },
      railing: null,
    },
    path: { hex: 0x7c7a74, edgeHex: 0x8e8b84, worn: 0x6e6a60 },
    lawn: { bare: 0x6e6248, greens: [0x4f6230, 0x58683a, 0x5e6e3c, 0x55663a] },
    flowers: [0xb84a3a, 0x9a3a32, 0xc8a040, 0xe0d8c8],
    hedge: 0x34482a,
    grate: { iron: 0x2c2c2a, frame: 0x8a8780 },
    steps: 0x9a978f,
  }),
  // (229 b1) Ronda's plazas (Aegis Crossing, 1972): granite bordillos, small pressed tiles, albero sand paths, whitewashed
  // bed walls under a low wrought-iron rail
  andalusian: Object.freeze<RegionalCivicStyle>({
    id: 'andalusian',
    kerb: { width: 0.20, face: 0.12, unit: [0.8, 1.2], hex: 0xa8a49a },
    pavement: { course: 0.2, length: [0.2, 0.2], hex: 0x9a958a, tone: 0.06, joint: 0x6a665e, step: 1.5, maxCourses: 2 },
    gutter: { rows: 2, width: 0.30, dish: 0.03, hex: 0x8a8270 },
    bands: { granite: 0x9a968c, basalt: 0x5a554c, sett: 0xb5a98f, bay: 0xc8bca2 },
    edging: {
      kerb: { width: 0.20, face: 0.18, hex: 0xb0a48a },
      wall: { width: 0.35, height: 0.45, hex: 0xe8e2d4, coping: 0.04 },
      pier: { size: 0.45, height: 0.9, hex: 0xe8e2d4 },
      // (229 b1 r1, the gameplay critic's D2: 320 iron rail modules put the plazas over both triangle budgets) the whitewashed
      // walls alone
      railing: null,
    },
    path: { hex: 0xc8b48c, edgeHex: 0xa8a090, worn: 0xb09a70 },
    lawn: { bare: 0x9a8460, greens: [0x5e6a34, 0x66703a, 0x707a40, 0x627038] },
    flowers: [0xc83050, 0xe86a2a, 0xf2efe6, 0xa0306a],
    hedge: 0x2e4a26,
    grate: { iron: 0x262624, frame: 0xa8a49a },
    steps: 0xc8bca2,
  }),
  // (229 b2) the International Settlement, 1937 (Suzhou Creek): granite kerbstones, concrete flags, red-brick garden walls
  shanghai: Object.freeze<RegionalCivicStyle>({
    id: 'shanghai',
    // (229 b2 r2, the blind critics: the kerb's top "near-white in low sun, like a painted edge line"; the flags "one flat
    // grey tone", lines on the aerials against a road of the same value) a weathered granite, the flags a warmer concrete
    // in more varied tones with darker joints
    kerb: { width: 0.30, face: 0.15, unit: [1.0, 1.5], hex: 0x8a877f },
    pavement: { course: 0.6, length: [0.6, 0.9], hex: 0x9a9388, tone: 0.11, joint: 0x4a4640, step: 2.0, maxCourses: 2 },
    gutter: { rows: 1, width: 0.35, dish: 0.02, hex: 0x6a6862 },
    bands: { granite: 0x8f8c85, basalt: 0x4a4946, sett: 0x7a766e, bay: 0x8e8a82 },
    edging: {
      kerb: { width: 0.25, face: 0.15, hex: 0x9a978f },
      wall: { width: 0.30, height: 0.35, hex: 0x8a5a48, coping: 0.03 },
      pier: { size: 0.40, height: 1.0, hex: 0x8a5a48 },
      railing: { kind: 'fenceiron', pitch: 2.4, scale: 0.9 },
    },
    path: { hex: 0xa89878, edgeHex: 0x8a867e, worn: 0x8e7e60 },
    lawn: { bare: 0x6a5e44, greens: [0x4a6230, 0x52683a, 0x5a6e3a, 0x50663a] },
    flowers: [0xd8c040, 0xe8e4dc, 0xc8303a, 0xf2efe6],
    hedge: 0x2a4422,
    grate: { iron: 0x2a2a28, frame: 0x8f8c85 },
    steps: 0x9a968e,
  }),
  // (229 b2) a Zeeland village, autumn 1944 (Tidegate Polders): a klinker stoep on a brick-on-edge kerb, a brick goot,
  // blue hardstone edging round the brink's green, shell paths
  polder: Object.freeze<RegionalCivicStyle>({
    id: 'polder',
    // (229 b2 r2, the blind critics: the brick-on-edge kerb read as a painted orange-red stripe, glowing at night) the
    // kerb and the stoep in a weathered, sooted klinker darker than the houses' brick, the goot darker still
    kerb: { width: 0.12, face: 0.05, unit: [0.21, 0.21], hex: 0x5a3a30 },
    pavement: { course: 0.30, length: [0.40, 0.60], hex: 0x6e4638, tone: 0.12, joint: 0x3e3029, step: 1.0, maxCourses: 3 },
    gutter: { rows: 2, width: 0.25, dish: 0.02, hex: 0x4a362e },
    bands: { granite: 0x6a6c6e, basalt: 0x3e3e3c, sett: 0x704838, bay: 0x8a5e48 },
    edging: {
      kerb: { width: 0.12, face: 0.08, hex: 0x5e6062 },
      wall: { width: 0.22, height: 0.30, hex: 0x6e4436, coping: 0.02 },
      pier: { size: 0.35, height: 0.8, hex: 0x6e4436 },
      railing: null,
    },
    // (r2: the shell paths read as plain concrete) klinker walks, their edges a darker brick
    path: { hex: 0x7a5242, edgeHex: 0x553a2e, worn: 0x6a4a3c },
    // (r2: the lawns' green clashed with the grazed green round them) an autumn sward, muted toward the olive
    lawn: { bare: 0x6a5a40, greens: [0x55633a, 0x5b693d, 0x617040, 0x58663b] },
    // (r2: tulips in October) asters and chrysanthemums: purple, rust, gold and a dull white
    flowers: [0x6e4a82, 0xa04e2c, 0xc49a34, 0xd6cdbc],
    hedge: 0x2c4a24,
    grate: { iron: 0x2a2a28, frame: 0x6a6c6e },
    steps: 0x6a6c6e,
  }),
});

/** A plan's style row (throws on an unknown key: a plan must name a row that exists). */
export function civicStyle(id: string): RegionalCivicStyle {
  const style = CIVIC_STYLES[id];
  if (!style) throw new Error(`civic: no regional style '${id}'`);
  return style;
}
