// Boot-light source study metadata. Registry ownership stays with the integrator;
// profile files independently author all visible geometry from scalar measurements.
// silhouetteHeightM is the source-only fixed-frame body p95 (geometry-r3 receipt),
// excluding thin antenna columns; full antenna heights remain in source bounds.
export const EUROPE_SOURCE_STUDIES = [
  {
    id:'kf41_lynx_x',name:'KF41 Lynx X',donor:'spz_puma',nation:'Germany',role:'ifv',tier:10,
    dimensions:{hullLengthM:7.7873,overallLengthM:8.65339,widthM:3.60334,heightM:3.4808,
      silhouetteHullLengthM:7.7873,silhouetteOverallLengthM:8.65339,silhouetteWidthM:3.60334,silhouetteHeightM:3.4681165287},
    turret:[0,2.29,-.15],gun:[-.01164,2.60336,.70],muzzleZ:4.73149,trackWidthM:.590,
    rawSha256:'ff6b3b4555c703fad655b961c137befcdd6e204e3c0c46c20dccf8dc59813324',
    oracleSha256:'999a4238c86319612a94b5b1204b477304c46b4e8ea9899097f4a9a7a3377b9f',
    groundTranslationY:.004199999850244136,sourceFile:'kf41_lynx_prototype_armored_warfare.glb',
  },
  {
    id:'cv90_mkiv_x',name:'CV90 Mk 4 X',donor:'cv90_mkiv',nation:'Sweden',role:'ifv',tier:10,
    dimensions:{hullLengthM:6.6220,overallLengthM:6.83241,widthM:3.30470,heightM:2.8202,
      silhouetteHullLengthM:6.6220,silhouetteOverallLengthM:6.83241,silhouetteWidthM:3.30470,silhouetteHeightM:2.7022714773},
    turret:[-.035,1.55,-.60],gun:[.172,1.844,.70],muzzleZ:3.60581,trackWidthM:.55,
    rawSha256:'d310fed791778e966ca70454df5e02614fdef95fe1768920fd140e369baeec0c',
    oracleSha256:'29160cf92e8e2221cf8b441626f871104dafde6b3ef5a80d3ec91d1fe3c8649a',
    groundTranslationY:.0031999999191619413,sourceFile:'cv90_mk.iv_armored_warfare.glb',
  },
  {
    id:'cv90105_tml_x',name:'CV90105 TML X',donor:'leo1a5',nation:'Sweden',role:'light',tier:9,
    dimensions:{hullLengthM:6.6605,overallLengthM:8.09049,widthM:3.11810,heightM:2.7302,
      silhouetteHullLengthM:6.6605,silhouetteOverallLengthM:8.09049,silhouetteWidthM:3.11810,silhouetteHeightM:2.7305404097},
    turret:[.016,1.595,-.62],gun:[.016,1.878,.70],muzzleZ:4.77999,trackWidthM:.523,
    rawSha256:'9b6f83b3ac4cc93d18fa46e3e3fdf51dd6930ad1adce1f3c5a462e769f255536',
    oracleSha256:'6e5770019f47d2c3de157e4eee77257e0f7ad1680b18b0655a1197362070efcc',
    groundTranslationY:.0012000000569969416,sourceFile:'cv90105-tml-armored-warfare.zip!source/CV90105_TML.zip!CV90105_TML.obj',
  },
  {
    id:'sabra_mk2_x',name:'Sabra Mk 2 X',donor:'m60a3',nation:'Israel',role:'mbt',tier:9,
    dimensions:{hullLengthM:7.0100,overallLengthM:9.03789,widthM:3.748,heightM:3.1033,
      silhouetteHullLengthM:7.0100,silhouetteOverallLengthM:9.03789,silhouetteWidthM:3.748,silhouetteHeightM:3.0598200102},
    turret:[0,1.57,.05],gun:[0,2.014,1.20],muzzleZ:5.49689,trackWidthM:.586,
    rawSha256:'4c6f13e1a94e9ab4d136d6b6229f0425ed9245f127c6d93811a2bf00f9cab968',
    oracleSha256:'5ea261fb70f728d3547159a6a6cf1519af2403e05e57c02d87d394ec9f573a2b',
    groundTranslationY:-.0027000000700347286,sourceFile:'sabra_mk.2_armored_warfare.glb',
  },
] as const;
