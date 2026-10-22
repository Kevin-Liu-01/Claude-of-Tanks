// Owner-approved original concepts, not claims of historical service variants.
// Recess the bearing while retaining 25–35 mm of visible running clearance
// above the three native hull roof courses. Hulls and fenders stay unchanged.
export const NATIONAL_TURRET_DROPS = [.075, .085, .085] as const;
export const NATIONAL_MODERNIZATION_CONFIG = [
  {
    "id": "t80u_zoria",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t80u",
    "model": 0,
    "name": "T-80U Zoria",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "t72b3m_hetman",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t72b3m_2016",
    "model": 1,
    "name": "T-72B3M Hetman",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "t72b3_sich",
    "nation": "Ukraine",
    "package": "ua",
    "donor": "t72b3",
    "model": 2,
    "name": "T-72B3 Sich",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "t80u_husarz",
    "nation": "Poland",
    "package": "pl",
    "donor": "t80u",
    "model": 0,
    "name": "T-80U Husarz",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "t72b3m_wilk",
    "nation": "Poland",
    "package": "pl",
    "donor": "t72b3m_2016",
    "model": 1,
    "name": "T-72B3M Wilk",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "t72b3_zubr",
    "nation": "Poland",
    "package": "pl",
    "donor": "t72b3",
    "model": 2,
    "name": "T-72B3 Zubr",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "t80u_yun",
    "nation": "China",
    "package": "cn",
    "donor": "t80u",
    "model": 0,
    "name": "T-80U Yun",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "t72b3m_kunlun",
    "nation": "China",
    "package": "cn",
    "donor": "t72b3m_2016",
    "model": 1,
    "name": "T-72B3M Kunlun",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "t72b3_qilin",
    "nation": "China",
    "package": "cn",
    "donor": "t72b3",
    "model": 2,
    "name": "T-72B3 Qilin",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  },
  {
    "id": "t80u_bars_m",
    "nation": "Russia",
    "package": "ru",
    "donor": "t80u",
    "model": 0,
    "name": "T-80U Bars-M",
    "y": 1.565 - NATIONAL_TURRET_DROPS[0],
    "z": 0.07187
  },
  {
    "id": "t72b3m_bulat_m",
    "nation": "Russia",
    "package": "ru",
    "donor": "t72b3m_2016",
    "model": 1,
    "name": "T-72B3M Bulat-M",
    "y": 1.545 - NATIONAL_TURRET_DROPS[1],
    "z": 0.114315
  },
  {
    "id": "t72b3_bastion_m",
    "nation": "Russia",
    "package": "ru",
    "donor": "t72b3",
    "model": 2,
    "name": "T-72B3 Bastion-M",
    "y": 1.475 - NATIONAL_TURRET_DROPS[2],
    "z": 0.065591
  }
] as const;
export const NATIONAL_MODERNIZATION_IDS=NATIONAL_MODERNIZATION_CONFIG.map(row=>row.id);
export type NationalModernizationConfig=typeof NATIONAL_MODERNIZATION_CONFIG[number];
