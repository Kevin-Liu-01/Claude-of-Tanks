// Published/internal-layout metadata for every playable vehicle. This is the
// presentation and topology source of truth shared by combat anatomy, Gallery
// diagnostics and the kill cam. Exact armour envelopes remain geometry-derived
// in combatAnatomyCalibrations.ts; classified dimensions are never invented.

export interface InternalLayoutSource {
  readonly title: string;
  readonly url: string;
  readonly kind: string;
}

export interface InternalCrewStation {
  readonly role: string;
  readonly frame: 'hull' | 'turret';
  readonly station: string;
}

export interface InternalSystemPlacement {
  readonly placement: string;
  readonly form: string;
}

export interface InternalSystems {
  readonly engine: InternalSystemPlacement;
  readonly transmission: InternalSystemPlacement;
  readonly optics: InternalSystemPlacement;
  readonly ammoRack: InternalSystemPlacement;
  readonly autoloader: InternalSystemPlacement | null;
  readonly feedSystem: InternalSystemPlacement | null;
  readonly missileRack: InternalSystemPlacement | null;
}

type InternalCrewTuple = readonly [
  role: string,
  frame: InternalCrewStation['frame'],
  station: string,
];

export const INTERNAL_LAYOUT_SOURCES = Object.freeze({
  bundeswehrLeopard: Object.freeze({
    title: 'Bundeswehr — Leopard 2 anatomy and equipment',
    url: 'https://www.bundeswehr.de/de/meldungen/64-tonnen-kampfkraft-leopard-2-bundeswehr-5569556',
    kind: 'operator',
  }),
  bundeswehrLeopardVersions: Object.freeze({
    title: 'Bundeswehr — Leopard variants',
    url: 'https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/kampfpanzer-leopard-versionen-bundeswehr',
    kind: 'operator',
  }),
  usArmySystems: Object.freeze({
    title: 'U.S. Army Weapon Systems Handbook 2020–2021',
    url: 'https://www.army.mil/e2/downloads/rv7/2020-2021_Weapon_Systems_Handbook.pdf',
    kind: 'operator',
  }),
  usArmyAbramsAmmo: Object.freeze({
    title: 'U.S. Army Armor — Abrams ammunition stowage',
    url: 'https://www.benning.army.mil/Armor/eARMOR/content/issues/2005/SEP_OCT/ArmorSeptemberOctober2005web.pdf',
    kind: 'operator-journal',
  }),
  usArmyBradleyManual: Object.freeze({
    title: 'TM 9-2350-252-10-2 — M2/M3 turret operator manual',
    url: 'https://www.scribd.com/document/647553432/M2-Bradley-M3-Turret-Operators-Manual-TM-9-2350-252-10-2-1984',
    kind: 'technical-manual-scan',
  }),
  usArmySheridan: Object.freeze({
    title: 'U.S. Army — M551 Sheridan historical vehicle record',
    url: 'https://home.army.mil/mccoy/download_file/view/e92c872e-9f06-4f7f-9c44-d78560690da3/576',
    kind: 'operator-history',
  }),
  t72Manual: Object.freeze({
    title: 'T-72B technical description and operating instructions',
    url: 'https://djvu.online/file/9mQtcIE6pVd0Q',
    kind: 'technical-manual-scan',
  }),
  t72T90Carousel: Object.freeze({
    title: 'Indian Ministry of Defence — T-72/T-90 autoloader cell',
    url: 'https://www.ddpmod.gov.in/en/resources/products/cell-t-72-t90-tanks',
    kind: 'operator-industry',
  }),
  roeT90: Object.freeze({
    title: 'Rosoboronexport — T-90S',
    url: 'https://roe.ru/pdfs/pdf_6184.pdf',
    kind: 'manufacturer',
  }),
  rostecArmataOptics: Object.freeze({
    title: 'Rostec — T-14 electro-optical observation and aiming systems',
    url: 'https://elements.rostec.ru/media/news/uralvagonzavod-pokazhet-na-armii-2023-vozmozhnosti-modernizatsii-bronetekhniki-/',
    kind: 'manufacturer',
  }),
  bumarPt91: Object.freeze({
    title: 'Bumar Labedy — PT-91 family',
    url: 'https://bumar.gliwice.pl/en/strefa-militarna/o/czolg-pt-91a-twardy',
    kind: 'manufacturer',
  }),
  rheinmetallKf51: Object.freeze({
    title: 'Rheinmetall — Panther KF51 product brochure',
    url: 'https://www.rheinmetall.com/Rheinmetall%20Group/brochure-download/Vehicle-Systems/B405e0524-Panther-KF51-main-battle-tank.pdf',
    kind: 'manufacturer',
  }),
  hyundaiK2: Object.freeze({
    title: 'Hyundai Rotem — K2 Main Battle Tank',
    url: 'https://www.hyundai-rotem.co.kr/en/business/defense/details.do?productNm=K2+Main+Battle+Tank',
    kind: 'manufacturer',
  }),
  japanType10: Object.freeze({
    title: 'Japan Ministry of Defense — Type 10 systems evaluation',
    url: 'https://www.mod.go.jp/j/approach/hyouka/yosan_shikko/2018/04.pdf',
    kind: 'operator',
  }),
  britishChallenger: Object.freeze({
    title: 'British Army — Challenger 2',
    url: 'https://www.army.mod.uk/learn-and-explore/equipment/combat-vehicles/challenger-2/',
    kind: 'operator',
  }),
  idfMerkava: Object.freeze({
    title: 'Israel Defense Forces — Merkava crew and front engine',
    url: 'https://www.idf.il/en/mini-sites/training-and-preparation/the-merkava-celebrates-35-years-of-service-in-the-idf/',
    kind: 'operator',
  }),
  bundeswehrPuma: Object.freeze({
    title: 'Bundeswehr — Puma crew and unmanned turret',
    url: 'https://www.bundeswehr.de/de/organisation/heer/aktuelles/schuetzenpanzer-puma-technischer-quantensprung-5037928',
    kind: 'operator',
  }),
  bundeswehrMarder: Object.freeze({
    title: 'Bundeswehr — Marder crew and front powerpack',
    url: 'https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/landsysteme-bundeswehr/schuetzenpanzer-marder',
    kind: 'operator',
  }),
  britishWarrior: Object.freeze({
    title: 'British Army — Warrior infantry fighting vehicle',
    url: 'https://www.army.mod.uk/learn-and-explore/equipment/combat-vehicles/warrior/',
    kind: 'operator',
  }),
  kndsLeclerc: Object.freeze({
    title: 'KNDS — Leclerc XLR',
    url: 'https://knds.com/en/products/systems/leclerc-xlr',
    kind: 'manufacturer',
  }),
  italianAriete: Object.freeze({
    title: 'Italian Army — Ariete',
    url: 'https://www.esercito.difesa.it/equipaggiamenti/veicoli-blindati-e-corazzati-da-combattimento/veicoli-da-combattimento/carro-armato-ariete/81543.html',
    kind: 'operator',
  }),
  roeBmp3: Object.freeze({
    title: 'Rosoboronexport — BMP-3 armament and stowage',
    url: 'https://roe.ru/pdfs/pdf_4442.pdf',
    kind: 'manufacturer',
  }),
  roeBmp2: Object.freeze({
    title: 'Rosoboronexport — BMP-2M',
    url: 'https://roe.ru/pdfs/pdf_2130.pdf',
    kind: 'manufacturer',
  }),
  jgsdfType89: Object.freeze({
    title: 'Japan Ground Self-Defense Force — Type 89 IFV',
    url: 'https://www.mod.go.jp/gsdf/equipment/ve/?modal-index=3%2F',
    kind: 'operator',
  }),
  saabStrv103: Object.freeze({
    title: 'Saab — Stridsvagn 103 history and fixed-gun layout',
    url: 'https://www.saab.com/newsroom/stories/2019/may/artillery-pieces-and-combat-vehicles',
    kind: 'manufacturer-history',
  }),
  gdAbramsX: Object.freeze({
    title: 'General Dynamics — AbramsX technology demonstrator',
    url: 'https://www.gd.com/Articles/2022/10/04/general-dynamics-business-units-to-participate-in-ausa-2022',
    kind: 'manufacturer',
  }),
  armyNgmbt: Object.freeze({
    title: 'U.S. Army Armor — Manning the next generation MBT',
    url: 'https://www.lineofdeparture.army.mil/Journals/Armor/Fall-2023-Edition/Manning-NGMBT/',
    kind: 'operator-journal',
  }),
  tigerManual: Object.freeze({
    title: 'Tiger I manual — 1945 French Army translation',
    url: 'https://www.fichier-pdf.fr/2017/05/01/manuel-tiger-i/',
    kind: 'technical-manual-scan',
  }),
  pantherManual: Object.freeze({
    title: 'Panther D655/3 load plan and manuals',
    url: 'https://www.panther1944.de/index.php/en/?id=23&view=category',
    kind: 'technical-manual-index',
  }),
  roeBmpt: Object.freeze({
    title: 'Rosoboronexport — BMPT',
    url: 'https://roe.ru/production/land-forces/boevye-bronirovannye-mashiny/boevaya-mashina-podderzhki-tankov-bmpt/',
    kind: 'manufacturer',
  }),
} satisfies Record<string, InternalLayoutSource>);

type InternalLayoutSourceId = keyof typeof INTERNAL_LAYOUT_SOURCES;

export interface InternalLayoutDefinition {
  readonly confidence: string;
  readonly sources: readonly InternalLayoutSourceId[];
  readonly crew: readonly InternalCrewStation[];
  readonly systems: InternalSystems;
}

export interface InternalLayoutRecord extends InternalLayoutDefinition {
  readonly id: string;
  readonly layoutKey: string;
}

const crew = (...stations: InternalCrewTuple[]): InternalCrewStation[] => (
  stations.map(([role, frame, station]) => ({ role, frame, station }))
);
const systems = (overrides: Partial<InternalSystems> = {}): InternalSystems => ({
  engine: { placement: 'rear', form: 'dieselPowerpack' },
  transmission: { placement: 'rear', form: 'integratedFinalDrive' },
  optics: { placement: 'visibleSightStations', form: 'sightAndVisionBlocks' },
  ammoRack: { placement: 'hull', form: 'hullBins' },
  autoloader: null,
  feedSystem: null,
  missileRack: null,
  ...overrides,
});

const FOUR_MAN_TURRET = crew(
  ['driver', 'hull', 'frontCenter'],
  ['gunner', 'turret', 'frontRight'],
  ['commander', 'turret', 'rearRight'],
  ['loader', 'turret', 'frontLeft'],
);
const THREE_MAN_AUTO = crew(
  ['driver', 'hull', 'frontCenter'],
  ['gunner', 'turret', 'frontLeft'],
  ['commander', 'turret', 'rearRight'],
);
const IFV_TWO_MAN_TURRET = crew(
  ['driver', 'hull', 'frontLeft'],
  ['gunner', 'turret', 'frontRight'],
  ['commander', 'turret', 'rearRight'],
);

const LAYOUTS = Object.freeze({
  tigerI: { confidence: 'documented', sources: ['tigerManual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['radioOperator', 'hull', 'frontRight'],
    ['gunner', 'turret', 'frontLeft'], ['commander', 'turret', 'rearLeft'],
    ['loader', 'turret', 'frontRight'],
  ), systems: systems({ transmission: { placement: 'front', form: 'frontFinalDrive' }, ammoRack: { placement: 'hull', form: 'sponsonBins' } }) },
  panther: { confidence: 'documented', sources: ['pantherManual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['radioOperator', 'hull', 'frontRight'],
    ['gunner', 'turret', 'frontLeft'], ['commander', 'turret', 'rearLeft'],
    ['loader', 'turret', 'frontRight'],
  ), systems: systems({ transmission: { placement: 'front', form: 'frontFinalDrive' }, ammoRack: { placement: 'hull', form: 'sponsonBins' } }) },
  heavyWw2Six: { confidence: 'platform-inferred', sources: ['tigerManual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['radioOperator', 'hull', 'frontRight'],
    ['gunner', 'turret', 'frontLeft'], ['commander', 'turret', 'rearLeft'],
    ['loader', 'turret', 'frontRight'], ['assistantLoader', 'turret', 'rearRight'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'twoPartStowage' } }) },
  casemateFour: { confidence: 'platform-inferred', sources: ['tigerManual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'hull', 'frontRight'],
    ['commander', 'hull', 'midLeft'], ['loader', 'hull', 'midRight'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'twoPartStowage' } }) },
  casemateFive: { confidence: 'platform-inferred', sources: ['pantherManual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'hull', 'frontRight'],
    ['commander', 'hull', 'midLeft'], ['loader', 'hull', 'midRight'],
    ['assistantLoader', 'hull', 'rearRight'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'twoPartStowage' } }) },
  pershingFive: { confidence: 'platform-inferred', sources: ['usArmySystems'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['assistantDriver', 'hull', 'frontRight'],
    ['gunner', 'turret', 'frontLeft'], ['commander', 'turret', 'rearLeft'],
    ['loader', 'turret', 'frontRight'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'wetHullRacks' } }) },
  westernManualHullAmmo: { confidence: 'platform-inferred', sources: ['britishChallenger'], crew: FOUR_MAN_TURRET, systems: systems({ ammoRack: { placement: 'hull', form: 'hullBins' } }) },
  starship: { confidence: 'platform-inferred', sources: ['usArmySheridan'], crew: FOUR_MAN_TURRET, systems: systems({
    ammoRack: { placement: 'hull', form: 'mixed152mmStowage' },
    missileRack: { placement: 'hull', form: 'gunLaunchedRounds' },
  }) },
  westernTwoPart: { confidence: 'documented', sources: ['britishChallenger'], crew: FOUR_MAN_TURRET, systems: systems({ ammoRack: { placement: 'hull', form: 'twoPartStowage' } }) },
  leopard: { confidence: 'documented', sources: ['bundeswehrLeopard', 'bundeswehrLeopardVersions'], crew: crew(
    ['driver', 'hull', 'frontRight'], ['gunner', 'turret', 'frontRight'],
    ['commander', 'turret', 'rearRight'], ['loader', 'turret', 'frontLeft'],
  ), systems: systems({ ammoRack: { placement: 'split', form: 'hullAndBustleRacks' } }) },
  abrams: { confidence: 'documented', sources: ['usArmySystems', 'usArmyAbramsAmmo'], crew: FOUR_MAN_TURRET, systems: systems({ engine: { placement: 'rear', form: 'gasTurbinePowerpack' }, ammoRack: { placement: 'turret', form: 'blowOffBustleRack' } }) },
  merkava: { confidence: 'documented', sources: ['idfMerkava'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'turret', 'frontRight'],
    ['commander', 'turret', 'rearRight'], ['loader', 'turret', 'frontLeft'],
  ), systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'rear', form: 'individualCanisters' } }) },
  sovietManual: { confidence: 'platform-inferred', sources: ['t72Manual'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'turret', 'frontLeft'],
    ['commander', 'turret', 'rearLeft'], ['loader', 'turret', 'frontRight'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'distributedHullRacks' } }) },
  arieteManual: { confidence: 'documented', sources: ['italianAriete'], crew: crew(
    ['driver', 'hull', 'frontRight'], ['gunner', 'turret', 'frontRight'],
    ['commander', 'turret', 'rearRight'], ['loader', 'turret', 'frontLeft'],
  ), systems: systems({ ammoRack: { placement: 'hull', form: 'hullBins' } }) },
  sovietAz: { confidence: 'documented', sources: ['t72Manual', 't72T90Carousel', 'roeT90'], crew: THREE_MAN_AUTO, systems: systems({ ammoRack: { placement: 'hull', form: 'azCarouselCassette' }, autoloader: { placement: 'hull', form: 'azCarousel' } }) },
  sovietMz: { confidence: 'platform-inferred', sources: ['t72Manual'], crew: THREE_MAN_AUTO, systems: systems({ ammoRack: { placement: 'hull', form: 'mzCarouselCassette' }, autoloader: { placement: 'hull', form: 'mzBasket' } }) },
  bustleAuto: { confidence: 'documented', sources: ['kndsLeclerc', 'hyundaiK2', 'japanType10'], crew: THREE_MAN_AUTO, systems: systems({ ammoRack: { placement: 'turret', form: 'bustleMagazine' }, autoloader: { placement: 'turret', form: 'bustleConveyor' } }) },
  fixedAuto: { confidence: 'platform-inferred', sources: ['saabStrv103'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'hull', 'frontRight'], ['commander', 'hull', 'midRight'],
  ), systems: systems({ engine: { placement: 'front', form: 'twinFrontPowerpack' }, transmission: { placement: 'front', form: 'frontFinalDrive' }, ammoRack: { placement: 'hull', form: 'fixedGunMagazine' }, autoloader: { placement: 'hull', form: 'fixedGunRamLoader' } }) },
  mbt70: { confidence: 'platform-inferred', sources: ['usArmySystems'], crew: crew(
    ['driver', 'turret', 'frontLeft'], ['gunner', 'turret', 'frontRight'], ['commander', 'turret', 'rearRight'],
  ), systems: systems({ ammoRack: { placement: 'turret', form: 'bustleMagazine' }, autoloader: { placement: 'turret', form: 'bustleConveyor' }, missileRack: { placement: 'turret', form: 'gunLaunchedRounds' } }) },
  sheridan: { confidence: 'documented', sources: ['usArmySheridan'], crew: FOUR_MAN_TURRET, systems: systems({
    ammoRack: { placement: 'hull', form: 'mixed152mmStowage' },
    missileRack: { placement: 'hull', form: 'gunLaunchedRounds' },
  }) },
  armata: { confidence: 'platform-inferred', sources: ['rostecArmataOptics'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['gunner', 'hull', 'frontCenter'], ['commander', 'hull', 'frontRight'],
  ), systems: systems({ optics: { placement: 'turretPerimeter', form: 'distributedElectroOpticalSuite' }, ammoRack: { placement: 'hull', form: 'isolatedCarousel' }, autoloader: { placement: 'hull', form: 'unmannedTurretCarousel' } }) },
  kf51: { confidence: 'documented', sources: ['rheinmetallKf51'], crew: THREE_MAN_AUTO, systems: systems({ ammoRack: { placement: 'turret', form: 'bustleMagazine' }, autoloader: { placement: 'turret', form: 'bustleConveyor' } }) },
  abramsX: { confidence: 'published-demonstrator', sources: ['gdAbramsX', 'armyNgmbt'], crew: crew(
    ['gunner', 'hull', 'frontLeft'], ['driver', 'hull', 'frontCenter'], ['commander', 'hull', 'frontRight'],
  ), systems: systems({ engine: { placement: 'rear', form: 'hybridDieselPowerpack' }, ammoRack: { placement: 'turret', form: 'blowOffBustleRack' }, autoloader: { placement: 'turret', form: 'bustleConveyor' } }) },
  m1a3: { confidence: 'owner-directed', sources: ['gdAbramsX', 'armyNgmbt'], crew: crew(
    ['commander', 'hull', 'frontLeft'], ['driver', 'hull', 'frontCenter'], ['gunner', 'hull', 'frontRight'],
  ), systems: systems({
    engine: { placement: 'rear', form: 'hybridElectricPowerpack' },
    transmission: { placement: 'rear', form: 'electricCrossDrive' },
    optics: { placement: 'turretPerimeter', form: 'distributedSensorFusionSuite' },
    ammoRack: { placement: 'turret', form: 'isolatedBlowOffBustleRack' },
    autoloader: { placement: 'turret', form: 'fourRoundBustleConveyor' },
    missileRack: { placement: 'turret', form: 'gunLaunchedHypersonicRounds' },
  }) },
  ifvFrontTwoMan: { confidence: 'platform-inferred', sources: ['roeBmp2', 'bundeswehrMarder', 'britishWarrior', 'jgsdfType89'], crew: IFV_TWO_MAN_TURRET, systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'mixed', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' } }) },
  bmp1: { confidence: 'platform-inferred', sources: ['roeBmp2'], crew: crew(
    ['driver', 'hull', 'frontLeft'], ['commander', 'hull', 'midLeft'], ['gunner', 'turret', 'frontCenter'],
  ), systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'mixed', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'clipFeed' }, missileRack: { placement: 'hull', form: 'gunLaunchedRounds' } }) },
  bradley: { confidence: 'documented', sources: ['usArmySystems', 'usArmyBradleyManual'], crew: IFV_TWO_MAN_TURRET, systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'mixed', form: 'bradleyAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' }, missileRack: { placement: 'hull', form: 'verticalTowStowage' } }) },
  puma: { confidence: 'documented', sources: ['bundeswehrPuma'], crew: crew(
    ['driver', 'hull', 'frontRight'], ['gunner', 'hull', 'midRight'], ['commander', 'hull', 'midLeft'],
  ), systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'turret', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' }, missileRack: { placement: 'turret', form: 'launcherReadyRounds' } }) },
  bmp3: { confidence: 'documented', sources: ['roeBmp3'], crew: IFV_TWO_MAN_TURRET, systems: systems({ ammoRack: { placement: 'mixed', form: 'bmp3ConveyorAndRacks' }, feedSystem: { placement: 'turret', form: 'dualCaliberFeed' }, missileRack: { placement: 'hull', form: 'gunLaunchedRounds' } }) },
  bmptFive: { confidence: 'documented', sources: ['roeBmpt'], crew: crew(
    ['driver', 'hull', 'frontCenter'], ['weaponOperatorLeft', 'hull', 'frontLeft'], ['weaponOperatorRight', 'hull', 'frontRight'],
    ['gunner', 'turret', 'frontLeft'], ['commander', 'turret', 'frontRight'],
  ), systems: systems({ ammoRack: { placement: 'turret', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' }, missileRack: { placement: 'turret', form: 'launcherReadyRounds' } }) },
  bmptThree: { confidence: 'platform-inferred', sources: ['roeBmpt'], crew: IFV_TWO_MAN_TURRET, systems: systems({ ammoRack: { placement: 'turret', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' }, missileRack: { placement: 'turret', form: 'launcherReadyRounds' } }) },
  fictionalAuto: { confidence: 'owner-directed', sources: [], crew: THREE_MAN_AUTO, systems: systems({ ammoRack: { placement: 'turret', form: 'bustleMagazine' }, autoloader: { placement: 'turret', form: 'bustleConveyor' } }) },
  fictionalIfv: { confidence: 'owner-directed', sources: [], crew: IFV_TWO_MAN_TURRET, systems: systems({ engine: { placement: 'front', form: 'frontDieselPowerpack' }, transmission: { placement: 'front', form: 'integratedFinalDrive' }, ammoRack: { placement: 'mixed', form: 'ifvAmmoBoxes' }, feedSystem: { placement: 'turret', form: 'dualBeltFeed' }, missileRack: { placement: 'turret', form: 'launcherReadyRounds' } }) },
} satisfies Record<string, InternalLayoutDefinition>);

const IDS_BY_LAYOUT = Object.freeze({
  tigerI: ['tiger1'],
  panther: ['panther_g'],
  heavyWw2Six: ['kv2'],
  casemateFour: ['jpz_e100', 't95'],
  casemateFive: ['sturmtiger', 'isu152', 'isu122s'],
  pershingFive: ['m26_pershing', 'm45_patton', 'm46_patton', 'm47_patton'],
  westernManualHullAmmo: ['strv81', 'chieftain5', 'chieftain_mk10', 'k1a1', 'stb1', 'type74', 'amx40', 'type59', 'ztz85_iii', 'm60a1', 'amx30', 'amx30b2', 'm48', 'vickers_mk1', 'centurion3', 'centurion5', 'm60a3'],
  starship: ['m60a2'],
  arieteManual: ['ariete', 'ariete_c1', 'ariete_c2'],
  westernTwoPart: ['challenger1', 'fv4034', 'challenger2', 'challenger2e', 'ua_challenger2', 'challenger_3', 'challenger_3x'],
  leopard: ['leo1a5', 'leopard2_proto', 'leo2a4', 'leo2a4_otco', 'leo2a4m', 'leo2a5', 'leo2a5_a5nl', 'leo2a6', 'leo2a6m', 'leo2_revolution_proto', 'leo2_revolution', 'leo2a7v', 'strv122', 'leo2a6_ua', 'leo2a7v_x', 'leo2a6m_x', 'leo2a4m_x', 'leo2a5_x'],
  abrams: ['m1a1', 'm1a2', 'm1a2_tusk', 'm1a2_legacy', 'm1a1ha', 'm1a2_sepv2', 'm1a2_sepv3', 'ua_m1a1'],
  merkava: ['merkava1b', 'merkava2b', 'merkava2d', 'merkava3c', 'merkava3d', 'merkava4b', 'merkava4_x', 'merkava3d_x'],
  sovietManual: ['t62mv1'],
  sovietAz: ['t72b3m', 't72bu', 'pt91m', 't90', 't90a', 't90a_vladimir', 't90a_burlak', 't90sm', 't90ms', 't90m', 't90m_proryv', 'type99a', 'ztz99a2_prototype', 'ztz99a2', 't72m1_jaguar', 'pt91_twardy', 't90a_x', 't90a_vladimir_x', 't90m_x', 't90sm_x'],
  sovietMz: ['t64bv1', 't80', 't80b', 't80bv', 't80u', 't84', 'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m'],
  bustleAuto: ['k2', 'k2b', 'type90', 'type90a', 'type10', 'type10b', 'leclerc', 'leclerc_xlr', 'amx56', 'vt4a1', 'k2_x'],
  fixedAuto: ['udes03', 'strv103a', 'strv103'],
  mbt70: ['mbt70'],
  sheridan: ['m551_sheridan', 'm551a1_tts'],
  armata: ['t14', 't14_x'],
  kf51: ['kf51', 'kf51b', 'kf51_x'],
  abramsX: ['abramsx'],
  m1a3: ['m1a3'],
  bradley: ['m2a2_bradley', 'ua_m2a3_bradley', 'm3a3_bradley'],
  ifvFrontTwoMan: ['bmp2', 'type89', 'fv510', 'fv510_milan', 'marder1a3', 'cv90'],
  bmp1: ['bwp1'],
  puma: ['spz_puma', 'spz_puma_s1', 'type89_light_tiger', 'cv90_mkiv'],
  bmp3: ['bmp3', 'bmp3_rok'],
  bmptFive: ['bmpt_t90'],
  bmptThree: ['bmpt_terminator2'],
  fictionalAuto: ['carro45t', 'pl01', 'pl01_105'],
  fictionalIfv: ['upior'],
} satisfies Record<keyof typeof LAYOUTS, readonly string[]>);

const entries: Record<string, InternalLayoutRecord> = {};
for (const [layoutKey, ids] of Object.entries(IDS_BY_LAYOUT) as Array<[
  keyof typeof IDS_BY_LAYOUT,
  readonly string[],
]>) {
  const layout = LAYOUTS[layoutKey];
  for (const id of ids) {
    if (entries[id]) throw new Error(`duplicate internal layout for ${id}`);
    entries[id] = Object.freeze({ id, layoutKey, ...layout });
  }
}

export const INTERNAL_LAYOUT_BY_TANK: Readonly<Record<string, InternalLayoutRecord>> = (
  Object.freeze(entries)
);

export function internalLayoutFor(id: string): InternalLayoutRecord | null {
  return INTERNAL_LAYOUT_BY_TANK[id] || null;
}
