// src/world/hinterland/drafts/whiteout.ts — Whiteout Station's Hinterland (HOR-05 / HZ.19, the horizons stream,
// 2026-10-14), from the generated draft (`node tools/hinterland-draft.mjs --map=whiteout`) edited to the real place.
// The owner on the ring: "so empty". The brief (C-map-briefs §1): sea ice on one side, the glaciated peninsula on the
// other, the station's masts between. DYE-M's Upper Camp stood on a bare plateau some 700 m over Davis Strait at Baffin
// Island's most easterly point: east the plateau falls in rock steps to the strait's pack ice, out to a horizon with no
// land on it; west and north-west the Cumberland Peninsula's peaks and their ice stand over the plateau, nearer peaks
// 3–6 km off, the high ranges behind; south the plateau runs on in tors and frozen tarns. A lab draft (lab: true) until
// the map file carries `hinterland: true`.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'DYE-M (Dye Main), the Distant Early Warning Line\'s eastern main station at Cape Dyer, Baffin Island (Nunavut), in the 1980s, as the North Warning System took the line over: the Upper Camp on a bare plateau some 700 m above Davis Strait at the island\'s most easterly point, among the Cumberland Peninsula\'s mountains, the strait\'s pack ice below. Rock and snow on permafrost, frost-shattered tors, the gravel ridges the ice left and frozen tarns, no tree for hundreds of kilometres. Nothing the station built stands on the ground: its modules ride on steel piles so their heat cannot thaw it (map revival lane 2\'s reference, rounds 1-5; folded in by the map-content lane)',
  region: 'polarStation',
  lab: true,
  outland: { woods: 0, hedges: 0, fields: 0, settle: { villages: 0, hamlets: 0, farms: 0, works: 1 } },
  landforms: [
    // east: the plateau's edge falls ~700 m to Davis Strait in rock steps over ~1.5 km, from ~1 km past the edge; the
    // strait's pack ice from its foot (the water below) out to the horizon
    { kind: 'escarpment', at: { azDeg: 90, distM: 2950 }, heightM: -700, lengthM: 20000, widthM: 7600, strikeDeg: 4, name: 'the fall to Davis Strait' },
    // west and north-west: the Cumberland Peninsula's nearer peaks, glaciated, their rock faces dark over the snow
    { kind: 'massif', at: { azDeg: 292, distM: 3400 }, heightM: 640, lengthM: 3800, widthM: 2600, strikeDeg: 30, name: 'the Sunneshine peaks',
      geology: { snow: { lineM: 0 }, erosion: 0.95, gullies: 0.9 }, cover: { bare: true }, peak: { along: 0.1, share: 0.5 } },
    { kind: 'massif', at: { azDeg: 330, distM: 4300 }, heightM: 760, lengthM: 4400, widthM: 3000, strikeDeg: 70, name: 'the Cape Dyer massif',
      geology: { snow: { lineM: 0 }, erosion: 0.95, gullies: 0.9 }, cover: { bare: true } },
    { kind: 'massif', at: { azDeg: 250, distM: 4600 }, heightM: 560, lengthM: 4200, widthM: 2800, strikeDeg: 160, name: 'the Okoa Bay wall',
      geology: { snow: { lineM: 0 }, erosion: 0.9, gullies: 0.8 }, cover: { bare: true } },
    { kind: 'massif', at: { azDeg: 8, distM: 3900 }, heightM: 420, lengthM: 3400, widthM: 2400, strikeDeg: 100, name: 'the north headland',
      geology: { snow: { lineM: 0 }, erosion: 0.85 }, cover: { bare: true } },
    // the plateau's own relief: frost-shattered tors and the ice's gravel ridges, low (they keep the near frame)
    { kind: 'ridge', at: { azDeg: 205, distM: 1500 }, heightM: 45, lengthM: 1400, widthM: 420, strikeDeg: 120, name: 'a moraine ridge' },
    { kind: 'ridge', at: { azDeg: 160, distM: 1700 }, heightM: 35, lengthM: 1200, widthM: 380, strikeDeg: 60, name: 'a moraine ridge' },
    { kind: 'inselberg', at: { azDeg: 228, distM: 1300 }, heightM: 38, lengthM: 260, widthM: 200, name: 'a tor' },
    { kind: 'inselberg', at: { azDeg: 312, distM: 1450 }, heightM: 30, lengthM: 220, widthM: 180, name: 'a tor' },
  ],
  water: [
    // Davis Strait's pack in winter: snow-covered floes, grey new ice and a few dark leads, 700 m below the plateau
    { kind: 'sea', arc: { azDeg: [20, 160] }, coastM: 4200, coastWanderM: 500, level: -700, ice: 0.9, name: 'Davis Strait' },
  ],
  far: [
    { azDeg: [210, 20], distKm: [8, 30], reliefM: 1200, form: 'alpine', layers: 2, name: 'the Cumberland Peninsula: Penny Ice Cap\'s ranges' },
    { azDeg: [160, 210], distKm: [6, 18], reliefM: 420, form: 'iceSheet', layers: 1, name: 'the plateau running on south' },
  ],
  landmarks: [
    // the Lower Camp's masts at the plateau's edge over the strait, the DEW line's link south
    { kind: 'mast', at: { azDeg: 96, distM: 1800 }, heightM: 70, name: 'the Lower Camp mast' },
    { kind: 'radome', at: { azDeg: 118, distM: 2100 }, name: 'the North Warning radome' },
  ],
  exceptions: {
    C6: 'Cape Dyer: east of the station the eye falls 700 m to the strait\'s pack ice and runs to a horizon with no land on it; the far layer stands west and north-west only',
  },
};

export default DRAFT;
