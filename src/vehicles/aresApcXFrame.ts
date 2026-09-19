// Pure scalar source-study frame shared by the gameplay registry and the
// lazy procedural builder. Keep this file free of Three.js/browser imports.
export const ARES_APC_X_DATUMS = Object.freeze({
  dims: Object.freeze({
    hullLengthM: 7.2119999,
    overallLengthM: 7.2119999,
    widthM: 3.9099001,
    heightM: 2.5453,
    silhouetteHeightM: 3.2387004,
  }),
  turretPivot: Object.freeze([-0.3835, 2.2502, 0.5027] as const),
  trunnion: Object.freeze([-0.4265, 3.078, 0.397] as const),
  muzzleZ: 1.6374,
  wheelStations: Object.freeze([-1.3674, -0.7256, -0.0753, 0.5901, 1.2225, 1.8513, 2.4879] as const),
  wheelR: 0.3053,
  wheelY: 0.3754,
  trackX: 1.2694,
  trackW: 0.5391,
  sprocket: Object.freeze({ z: 3.0285, y: 0.7952, r: 0.3054 }),
  idler: Object.freeze({ z: -2.2596, y: 0.7243, r: 0.3053 }),
});
