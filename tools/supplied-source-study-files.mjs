// The comparison files behind src/vehicles/*SourceStudyData.ts: each study's outside model file, its raw sha256 and
// its canonical (registered) sha256. Tank-generation tooling only (owner, 2026-11-12): the shipped study data hold
// the measured scalars alone, and this table lives in tools/ so no model file name or hash reaches the game bundle.
// tools/source-world-registration.mjs pins each certified source to its oracleSha256.
export const SUPPLIED_SOURCE_STUDY_FILES = Object.freeze({
  aft10: Object.freeze({ sourceFile: 'aft-10_armored_warfare.glb', rawSha256: '45fdbb3efdc173cfc09a6293673534afc83f86ba20a1cd7ebc05f688ac85d1f0',
    oracleSha256: '95212acdcac7ef46744dde58888f675fa65284dfd4b008b2f7fda717b4e18d79' }),
  ajax: Object.freeze({ sourceFile: 'ajax_armored_warfare.glb', rawSha256: '5b2759b557a9d02af059dcf0e03eb6b41bdc6e7ecb62da17c4a8f224e48581f1',
    oracleSha256: '506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0' }),
  bmp3m_dragun125: Object.freeze({ sourceFile: 'bmp-3m_dragun_125_armored_warfare.glb', rawSha256: '1c5d3241266a698550f281e715b0b96d9b1360fef07aa8ccb1cd70044fc0aae3',
    oracleSha256: '4fd69d170bf494b8a795bf5d6618e94db10c7cdb562b9f37210bc613f402af16' }),
  cv90105_tml: Object.freeze({ sourceFile: 'cv90105-tml-armored-warfare.zip!source/CV90105_TML.zip!CV90105_TML.obj', rawSha256: '9b6f83b3ac4cc93d18fa46e3e3fdf51dd6930ad1adce1f3c5a462e769f255536',
    oracleSha256: '6e5770019f47d2c3de157e4eee77257e0f7ad1680b18b0655a1197362070efcc' }),
  cv90_mk4: Object.freeze({ sourceFile: 'cv90_mk.iv_armored_warfare.glb', rawSha256: 'd310fed791778e966ca70454df5e02614fdef95fe1768920fd140e369baeec0c',
    oracleSha256: '29160cf92e8e2221cf8b441626f871104dafde6b3ef5a80d3ec91d1fe3c8649a' }),
  griffin50mm: Object.freeze({ sourceFile: 'griffin_50mm_armored_warfare.glb', rawSha256: 'ab4daa4ba8eed3eff25c77c35bd7082a2de7d188bd0c87e6fc73c57e7076bfca',
    oracleSha256: '62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34' }),
  k21: Object.freeze({ sourceFile: 'k21_armored_warfare.glb', rawSha256: 'bacb27e883dfddb929d8de820bbebb31dec4d161ba2b25ac0afdc539b35883a1',
    oracleSha256: 'ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8' }),
  kf41_lynx: Object.freeze({ sourceFile: 'kf41_lynx_prototype_armored_warfare.glb', rawSha256: 'ff6b3b4555c703fad655b961c137befcdd6e204e3c0c46c20dccf8dc59813324',
    oracleSha256: '999a4238c86319612a94b5b1204b477304c46b4e8ea9899097f4a9a7a3377b9f' }),
  sabra_mk2: Object.freeze({ sourceFile: 'sabra_mk.2_armored_warfare.glb', rawSha256: '4c6f13e1a94e9ab4d136d6b6229f0425ed9245f127c6d93811a2bf00f9cab968',
    oracleSha256: '5ea261fb70f728d3547159a6a6cf1519af2403e05e57c02d87d394ec9f573a2b' }),
  type96b: Object.freeze({ sourceFile: 'type_96b_armored_warfare.glb', rawSha256: '4abe3113a6919c78d56f9dfb8f8841bd22cc40a33283925c768bbcd3ee5fc8f0',
    oracleSha256: 'ac66370796b83d2d63755390ffdbcaa503d9dbc15726630205c4e44a2765b1ed' }),
  warrior_tes_h: Object.freeze({ sourceFile: 'fv510_warrior_milan_war_thunder.glb', rawSha256: '5bb512734139e4beaeaa3775bdc68913431a555a2d1d46f395a47a8fa0a5ea45',
    oracleSha256: 'e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04' }),
});
