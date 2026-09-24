// Browser-safe, local-QA source certificates. These files never enter gameplay.
// Original exports remain available; assembly recipes preserve the source frame.
// 2026-09-24 (round 46c): the five 20260918 recipe hashes re-pinned after the research notes moved to docs/history/research —
// each recipe's `ownerDecision` and review `path` strings were re-rooted; no geometry, source hash or frame value changed.
export const SUPPLIED_SOURCE_ASSEMBLIES = Object.freeze({
  "fv510_milan_x": {
    "originalSha256": "e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04",
    "rawSha256": "5bb512734139e4beaeaa3775bdc68913431a555a2d1d46f395a47a8fa0a5ea45",
    "sha256": "f9eeb72db9039d2355912ecb85471be2d5559493400eff3d6d211ad9fc366045",
    "path": "/models/community-candidates/fv510_milan_x_assembled_20260918.glb",
    "recipePath": "docs/references/source-assemblies/20260918/fv510_milan_x.json",
    "recipeSha256": "d1a09c7e27ec4e627ea4923d09399e3286a7cbd305e396e30defee2b1d3e501a",
    "originalFrame": {
      "sha256": "e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04",
      "fused": true,
      "turret": [
        0.175,
        1.965,
        -0.42
      ],
      "gun": [
        0.114,
        2.23,
        0.7
      ]
    }
  },
  "griffin50_x": {
    "originalSha256": "62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34",
    "rawSha256": "ab4daa4ba8eed3eff25c77c35bd7082a2de7d188bd0c87e6fc73c57e7076bfca",
    "sha256": "1aef6401c01b5d9a6adfc65838c94d350f4aa39afa039709241c426371ca2003",
    "path": "/models/community-candidates/griffin50_x_assembled_20260918.glb",
    "recipePath": "docs/references/source-assemblies/20260918/griffin50_x.json",
    "recipeSha256": "40e8486eb48d5bbf0b2a50e0676942747d58eea2cc758a5884acbe845575507c",
    "originalFrame": {
      "sha256": "62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34",
      "fused": true,
      "turret": [
        0,
        2.07,
        -0.36
      ],
      "gun": [
        0,
        2.6,
        0.74
      ]
    }
  },
  "kurganets25_x": {
    "originalSha256": "a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0",
    "rawSha256": "0af5ccde32d66d5f56cbf7b543e000f64fa28e18cc0eb560d92ed7b05e7f7fd2",
    "sha256": "417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793",
    "path": "/models/community-candidates/kurganets25_x_assembled_20260918.glb",
    "recipePath": "docs/references/source-assemblies/20260918/kurganets25_x.json",
    "recipeSha256": "f1f97a7fea0f12a5a0d8156c0421340d5fddc2fc76d20f8c1d326b964328570c",
    "originalFrame": {
      "sha256": "a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0",
      "fused": true,
      "turret": [
        0,
        2.21,
        -1.27
      ],
      "gun": [
        -0.004,
        2.917,
        -0.68
      ]
    }
  },
  "bmp3m_dragun125_x": {
    "originalSha256": "4fd69d170bf494b8a795bf5d6618e94db10c7cdb562b9f37210bc613f402af16",
    "rawSha256": "1c5d3241266a698550f281e715b0b96d9b1360fef07aa8ccb1cd70044fc0aae3",
    "sha256": "d79a8383dd79d8dfefc98ae47b9b12d6c60bac55df3eb1671266fef6029fc8e8",
    "path": "/models/community-candidates/bmp3m_dragun125_x_assembled_20260918.glb",
    "recipePath": "docs/references/source-assemblies/20260918/bmp3m_dragun125_x.json",
    "recipeSha256": "37d7115cb1166675c88c7d85d25a756cf4edf2bcdff8634c0bcb2f814de50d2d",
    "originalFrame": {
      "sha256": "4fd69d170bf494b8a795bf5d6618e94db10c7cdb562b9f37210bc613f402af16",
      "fused": true,
      "turret": [
        0,
        2,
        -1.2
      ],
      "gun": [
        0,
        2.2585,
        0.43
      ]
    }
  },
  "k21_x": {
    "originalSha256": "ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8",
    "rawSha256": "bacb27e883dfddb929d8de820bbebb31dec4d161ba2b25ac0afdc539b35883a1",
    "sha256": "e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b",
    "path": "/models/community-candidates/k21_x_assembled_20260918.glb",
    "recipePath": "docs/references/source-assemblies/20260918/k21_x.json",
    "recipeSha256": "3266271ed32941ea9647def0565faa8cb2366ab145a26b0da6bc28f04eb1c573",
    "originalFrame": {
      "sha256": "ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8",
      "fused": true,
      "turret": [
        0,
        1.96,
        -0.55
      ],
      "gun": [
        0,
        2.3362,
        0.3
      ]
    }
  }
});

const frameSignature = frame => JSON.stringify(Object.entries(frame).sort(([a], [b]) => a.localeCompare(b)));

/** Change only reviewed source bytes; preserve every original pose datum. */
export function withAssembledSourceFrames(frames, assemblies = SUPPLIED_SOURCE_ASSEMBLIES) {
  const result = { ...frames };
  for (const [id, assembly] of Object.entries(assemblies)) {
    const original = frames[id];
    if (!original || original.sha256 !== assembly.originalSha256
      || frameSignature(original) !== frameSignature(assembly.originalFrame)) {
      throw new Error(id + ': original source certificate changed before assembly registration');
    }
    result[id] = { ...original, sha256: assembly.sha256 };
  }
  return result;
}

export function assembledSourcePath(id, originalPath) {
  const assembly = SUPPLIED_SOURCE_ASSEMBLIES[id];
  if (!assembly) return originalPath;
  if (originalPath !== '/models/community-candidates/' + id + '_source.glb') {
    throw new Error(id + ': original source path changed before assembly registration');
  }
  return assembly.path;
}
