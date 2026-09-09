// Resolved source policy oracle copied from parent9dac657de, not reconstructed
// from today's palette. No production import consumes this test-only fixture.
export const parentPalettes = {
  urban: { plaster: { tint: [0.94, 0.86, 0.74], desat: 0.16 } },
  ruinspires: { plaster: { tint: [0.72, 0.62, 0.52], desat: 0.22 }, wood: { tint: [0.62, 0.54, 0.44], desat: 0.24 } },
  blackglass: {
    plaster: { tint: [0.67, 0.59, 0.50], desat: 0.24 }, roof: { tint: [0.56, 0.50, 0.47], desat: 0.36 },
    wood: { tint: [0.57, 0.50, 0.42], desat: 0.24 }, stone: { tint: [0.72, 0.58, 0.47], desat: 0.16 },
  },
  skybridge: {
    plaster: { tint: [0.91, 0.75, 0.59], desat: 0.12 }, roof: { tint: [0.72, 0.58, 0.50], desat: 0.22 },
    wood: [0.73, 0.61, 0.46], stone: [0.94, 0.73, 0.54],
  },
  desert: { plaster: [1.08, 0.92, 0.70], wood: [1.05, 0.95, 0.80] },
  winter: { roof: { tint: [0.96, 1.02, 1.14], desat: 0.62, lift: 0.10 } },
  coastal: { plaster: [1.04, 1.02, 0.96], wood: { tint: [0.82, 0.83, 0.84], desat: 0.30 } },
  autumn: { plaster: [1.02, 0.97, 0.88], wood: [0.94, 0.86, 0.74] },
  orchard: { plaster: [1.02, 0.97, 0.88], wood: [0.94, 0.86, 0.74], roof: { tint: [0.48, 0.53, 0.57], desat: 0.90, lift: 0.015 } },
  steppe: { plaster: [1.06, 1.0, 0.86], wood: [1.0, 0.92, 0.78] },
  railyard: {
    plaster: { tint: [0.84, 0.83, 0.80], desat: 0.25 }, roof: { tint: [0.88, 0.90, 0.94], desat: 0.60, lift: 0.05 },
    wood: { tint: [0.78, 0.76, 0.72], desat: 0.20 }, stone: { tint: [1.10, 0.98, 0.88], desat: 0.10 },
  },
  frontier: { plaster: [1.0, 0.96, 0.86], wood: [0.92, 0.84, 0.70] },
  fjord: {
    plaster: [1.03, 1.04, 1.02], roof: { tint: [0.77, 0.84, 0.91], desat: 0.48, lift: 0.02 },
    wood: { tint: [0.72, 0.76, 0.78], desat: 0.38 },
  },
  delta: { plaster: [1.04, 0.96, 0.78], wood: [0.80, 0.70, 0.53] },
  badlands: { plaster: [1.08, 0.79, 0.58], wood: [0.83, 0.69, 0.52] },
  monsoon: { plaster: [0.78, 0.81, 0.72], wood: [0.67, 0.66, 0.54] },
  alpine: { roof: { tint: [0.94, 1.01, 1.14], desat: 0.68, lift: 0.11 } },
  caldera: {
    plaster: { tint: [0.65, 0.53, 0.42], desat: 0.26 }, roof: { tint: [0.52, 0.43, 0.40], desat: 0.42 },
    wood: [0.57, 0.47, 0.36], stone: [0.71, 0.55, 0.42],
  },
  foundry: {
    plaster: { tint: [0.82, 0.71, 0.59], desat: 0.20 }, roof: { tint: [0.62, 0.55, 0.52], desat: 0.44, lift: 0.018 },
    wood: { tint: [0.64, 0.54, 0.43], desat: 0.18 }, stone: { tint: [0.94, 0.76, 0.62], desat: 0.18 },
  },
};

export const parentRoutes = {
  verdant: 'verdant', desert: 'desert', winter: 'winter', urban: 'urban', coastal: 'coastal',
  autumn: 'autumn', steppe: 'steppe', railyard: 'railyard', frontier: 'frontier', fjord: 'fjord',
  delta: 'delta', badlands: 'badlands', monsoon: 'monsoon', alpine: 'alpine', caldera: 'caldera',
  foundry: 'foundry', ruinspires: 'ruinspires', blackglass: 'blackglass', titan_gorge: 'titan_gorge', skybridge: 'skybridge',
  polders: 'coastal', copper_mesa: 'foundry', airfield: 'railyard', oasis: 'desert', whiteout: 'winter',
  orchard: 'orchard', longleaf: 'frontier', mangrove: 'delta', saltwind: 'coastal', reservoir: 'frontier',
};
