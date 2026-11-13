// Boot-light source study metadata. Registry ownership stays with the integrator;
// profile files independently author all visible geometry from scalar measurements.
// silhouetteHeightM is the source-only fixed-frame body p95 (geometry-r3 receipt),
// excluding thin antenna columns; full antenna heights remain in source bounds.
export const EUROPE_SOURCE_STUDIES = [
  {
    id:'kf41_lynx',name:'KF41 Lynx',donor:'spz_puma',nation:'Germany',role:'ifv',tier:10,
    dimensions:{hullLengthM:7.7873,overallLengthM:8.65339,widthM:3.60334,heightM:3.4808,
      silhouetteHullLengthM:7.7873,silhouetteOverallLengthM:8.65339,silhouetteWidthM:3.60334,silhouetteHeightM:3.4681165287},
    turret:[0,2.29,-.15],gun:[-.01164,2.60336,.70],muzzleZ:4.73149,trackWidthM:.590,
    groundTranslationY:.004199999850244136,
  },
  {
    id:'cv90_mk4',name:'CV90 Mk 4',donor:'cv90_mk4_concept',nation:'Sweden',role:'ifv',tier:10,
    dimensions:{hullLengthM:6.6220,overallLengthM:6.83241,widthM:3.30470,heightM:2.8202,
      silhouetteHullLengthM:6.6220,silhouetteOverallLengthM:6.83241,silhouetteWidthM:3.30470,silhouetteHeightM:2.7022714773},
    turret:[-.035,1.55,-.60],gun:[.172,1.844,.70],muzzleZ:3.60581,trackWidthM:.55,
    groundTranslationY:.0031999999191619413,
  },
  {
    id:'cv90105_tml',name:'CV90105 TML',donor:'leo1a5',nation:'Sweden',role:'light',tier:9,
    dimensions:{hullLengthM:6.6605,overallLengthM:8.09049,widthM:3.11810,heightM:2.7302,
      silhouetteHullLengthM:6.6605,silhouetteOverallLengthM:8.09049,silhouetteWidthM:3.11810,silhouetteHeightM:2.7305404097},
    turret:[.016,1.595,-.62],gun:[.016,1.878,.70],muzzleZ:4.77999,trackWidthM:.523,
    groundTranslationY:.0012000000569969416,
  },
  {
    id:'sabra_mk2',name:'Sabra Mk 2',donor:'m60a3',nation:'Israel',role:'mbt',tier:9,
    dimensions:{hullLengthM:7.0100,overallLengthM:9.03789,widthM:3.748,heightM:3.1033,
      silhouetteHullLengthM:7.0100,silhouetteOverallLengthM:9.03789,silhouetteWidthM:3.748,silhouetteHeightM:3.0598200102},
    turret:[0,1.57,.05],gun:[0,2.014,1.20],muzzleZ:5.49689,trackWidthM:.586,
    groundTranslationY:-.0027000000700347286,
  },
] as const;
