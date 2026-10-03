// Owner-approved original concepts, not claims of historical service variants.
// Recess the bearing while retaining 25–35 mm of visible running clearance
// above the three native hull roof courses. Hulls and fenders stay unchanged.
export const NATIONAL_TURRET_DROPS = [.075, .085, .085] as const;
export const NATIONAL_MODERNIZATION_CONFIG = [
  {
    "id": "ua_t80u_modern",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t80u_x",
    "model": 0,
    "name": "T-80U Zoria (Concept)",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "ua_t72b3m_modern",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t72b3m_x",
    "model": 1,
    "name": "T-72B3M Hetman (Concept)",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "ua_t72b3_modern",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t72b3_x",
    "model": 2,
    "name": "T-72B3 Sich (Concept)",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "pl_t80u_modern",
    "nation": "Poland",
    "package": "pl",
    "donor": "t80u_x",
    "model": 0,
    "name": "T-80U Husarz (Concept)",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "pl_t72b3m_modern",
    "nation": "Poland",
    "package": "pl",
    "donor": "t72b3m_x",
    "model": 1,
    "name": "T-72B3M Wilk (Concept)",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "pl_t72b3_modern",
    "nation": "Poland",
    "package": "pl",
    "donor": "t72b3_x",
    "model": 2,
    "name": "T-72B3 Zubr (Concept)",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "cn_t80u_modern",
    "nation": "China",
    "package": "cn",
    "donor": "t80u_x",
    "model": 0,
    "name": "T-80U Yun (Concept)",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "cn_t72b3m_modern",
    "nation": "China",
    "package": "cn",
    "donor": "t72b3m_x",
    "model": 1,
    "name": "T-72B3M Kunlun (Concept)",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "cn_t72b3_modern",
    "nation": "China",
    "package": "cn",
    "donor": "t72b3_x",
    "model": 2,
    "name": "T-72B3 Qilin (Concept)",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "ru_t80u_modern",
    "nation": "Russia",
    "package": "ru",
    "donor": "t80u_x",
    "model": 0,
    "name": "T-80U Bars-M (Concept)",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "ru_t72b3m_modern",
    "nation": "Russia",
    "package": "ru",
    "donor": "t72b3m_x",
    "model": 1,
    "name": "T-72B3M Bulat-M (Concept)",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "ru_t72b3_modern",
    "nation": "Russia",
    "package": "ru",
    "donor": "t72b3_x",
    "model": 2,
    "name": "T-72B3 Bastion-M (Concept)",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  }
] as const;
export const NATIONAL_MODERNIZATION_IDS=NATIONAL_MODERNIZATION_CONFIG.map(row=>row.id);
export type NationalModernizationConfig=typeof NATIONAL_MODERNIZATION_CONFIG[number];
