import { tankDisplayName, tankLabelRecord } from '../vehicles/tankLabels.ts';
import { tankTier, tierNumeral } from '../vehicles/tier.ts';
import { vehicleEraLabel } from '../vehicles/taxonomy.ts';
import { t } from '../ui/i18n.ts';

interface GalleryShellSpec {
  name?: string;
  type?: string;
  pen1000Mm?: number;
  pen100Mm?: number;
  dmg?: number;
  velocityMps?: number;
}

interface GalleryArmorPlate {
  kind?: string;
  era?: boolean | object;
  physicalMm?: number;
  keMm?: number;
  ceMm?: number;
}

interface GalleryAutoloaderSpec {
  magazineSize?: number;
  intraClipS?: number;
  fullReloadS?: number;
}

export interface GalleryVehicleSpec {
  id: string;
  name?: string;
  label?: { displayName?: string };
  authorship?: {
    creator?: string;
    creatorUrl?: string;
    copyright?: string;
    license?: string;
  };
  nation?: string;
  era?: string;
  hp?: number;
  enginePowerHp?: number;
  weightTons?: number;
  topSpeedKmh?: number;
  reverseSpeedKmh?: number;
  hullTraverseDegS?: number;
  turretTraverseDegS?: number;
  role?: string;
  gunTraverseDeg?: number;
  gunDepressionDeg?: number;
  gunElevationDeg?: number;
  roster?: { developmentOnly?: boolean; tag?: string; reason?: string };
  dims?: {
    hullLengthM?: number;
    overallLengthM?: number;
    widthM?: number;
    heightM?: number;
  };
  gun?: {
    shells?: GalleryShellSpec[];
    reloadS?: number;
    aimTimeS?: number;
    caliberMm?: number;
    autoloader?: GalleryAutoloaderSpec;
  };
  armor?: {
    hullPlates?: GalleryArmorPlate[];
    turretPlates?: GalleryArmorPlate[];
    modules?: object[];
    crew?: object[];
  };
}

interface GalleryFilters {
  query?: string;
  nation?: string;
  era?: string;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, digits = 1): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function normalized(value: number, low: number, high: number): number {
  if (!Number.isFinite(value) || high <= low) return 0;
  return clamp(((value - low) / (high - low)) * 100);
}

function titleCase<T>(value: T): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function plateValues(spec: GalleryVehicleSpec, key: 'keMm' | 'ceMm'): number[] {
  const armor = spec.armor || {};
  return [...(armor.hullPlates || []), ...(armor.turretPlates || [])]
    .filter((plate) => plate.kind !== 'external')
    .map((plate) => Number(plate[key] ?? plate.physicalMm ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function bestShell(spec: GalleryVehicleSpec): { shell: GalleryShellSpec; penetration: number } | null {
  const shells = spec.gun?.shells || [];
  return shells.reduce<{ shell: GalleryShellSpec; penetration: number } | null>((best, shell) => {
    const penetration = Number(shell.pen1000Mm ?? shell.pen100Mm ?? 0);
    return !best || penetration > best.penetration ? { shell, penetration } : best;
  }, null);
}

function primaryShell(spec: GalleryVehicleSpec): GalleryShellSpec | null {
  return spec.gun?.shells?.[0] || null;
}

function protectionFeatures(spec: GalleryVehicleSpec): string[] {
  const plates = [...(spec.armor?.hullPlates || []), ...(spec.armor?.turretPlates || [])];
  const features: string[] = [];
  if (plates.some((plate) => plate.kind === 'era' || plate.era)) features.push(t('gallery.brief.feature.era'));
  if (plates.some((plate) => plate.kind === 'spaced')) features.push(t('gallery.brief.feature.spaced'));
  if (plates.some((plate) => plate.kind === 'composite')) features.push(t('gallery.brief.feature.composite'));
  return features;
}

function joinTechnicalList(items: readonly string[]): string {
  if (items.length < 2) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function mobilityAssessment(powerToWeight: number, topSpeed: number): string {
  if (powerToWeight >= 25 && topSpeed >= 60) return t('gallery.brief.mobility.veryHigh').length > 0 ? t('gallery.brief.mobility.high') : t('gallery.brief.mobility.high');
  if (powerToWeight >= 18 || topSpeed >= 55) return t('gallery.brief.mobility.high');
  if (powerToWeight >= 13) return t('gallery.brief.mobility.moderate');
  return t('gallery.brief.mobility.low');
}

function protectionAssessment(bestKe: number): string {
  if (bestKe >= 700) return t('gallery.brief.protection.veryHigh');
  if (bestKe >= 400) return t('gallery.brief.protection.high');
  if (bestKe >= 180) return t('gallery.brief.protection.moderate');
  return t('gallery.brief.protection.moderate');
}

export function technicalLabel<T>(value: T): string {
  return titleCase(value || t('gallery.tier.unknown'));
}

interface GalleryGunSummary {
  shell: GalleryShellSpec | null;
  best: ReturnType<typeof bestShell>;
  autoloader: GalleryAutoloaderSpec | null;
  magazineSize: number;
  intraClipS: number;
  fullReloadS: number;
  burstDamage: number;
  dpm: number;
  shellTypes: string[];
}

interface GalleryProtectionSummary {
  bestKeMm: number;
  bestCeMm: number;
  features: string[];
  modules: object[];
  crew: object[];
}

function summarizeGalleryGun(spec: GalleryVehicleSpec): GalleryGunSummary {
  const shell = primaryShell(spec);
  const best = bestShell(spec);
  const damage = Number(shell?.dmg || 0);
  const autoloader = spec.gun?.autoloader || null;
  const magazineSize = autoloader
    ? Math.max(1, Math.floor(Number(autoloader.magazineSize) || 1))
    : 1;
  const intraClipS = autoloader
    ? Math.max(0.05, Number(autoloader.intraClipS) || Number(spec.gun?.reloadS) || 0.1)
    : 0;
  const fullReloadS = Math.max(
    0.1,
    Number(autoloader?.fullReloadS) || Number(spec.gun?.reloadS) || 0.1,
  );
  // Sustained magazine DPM is measured from one first shot to the next:
  // every round in the magazine, the intervening intra-magazine cycles, and
  // one complete magazine reload. This avoids presenting fullReloadS as a
  // conventional per-shot reload and materially understating autoloader DPM.
  const sustainedCycleS = fullReloadS + Math.max(0, magazineSize - 1) * intraClipS;
  const burstDamage = damage * magazineSize;
  const dpm = burstDamage * (60 / sustainedCycleS);
  const shellTypes = [...new Set((spec.gun?.shells || []).map((item) => item.type)
    .filter((value): value is string => Boolean(value)))];
  return {
    shell, best, autoloader, magazineSize, intraClipS, fullReloadS,
    burstDamage, dpm, shellTypes,
  };
}

function summarizeGalleryProtection(spec: GalleryVehicleSpec): GalleryProtectionSummary {
  return {
    bestKeMm: Math.max(0, ...plateValues(spec, 'keMm')),
    bestCeMm: Math.max(0, ...plateValues(spec, 'ceMm')),
    features: protectionFeatures(spec),
    modules: spec.armor?.modules || [],
    crew: spec.armor?.crew || [],
  };
}

function galleryRatings(
  spec: GalleryVehicleSpec,
  powerToWeight: number,
  gun: GalleryGunSummary,
  protection: GalleryProtectionSummary,
) {
  return {
    firepower: rounded(
      normalized(gun.best?.penetration || 0, 60, 900) * 0.58
      + normalized(gun.dpm, 700, 5600) * 0.32
      + normalized(Number(spec.gun?.caliberMm || 0), 20, 155) * 0.10,
      0,
    ),
    protection: rounded(
      normalized(protection.bestKeMm, 20, 900) * 0.72
      + normalized(Number(spec.hp || 0), 400, 3000) * 0.28,
      0,
    ),
    mobility: rounded(
      normalized(Number(spec.topSpeedKmh || 0), 10, 80) * 0.45
      + normalized(powerToWeight, 6, 32) * 0.38
      + normalized(Number(spec.hullTraverseDegS || 0), 12, 58) * 0.17,
      0,
    ),
    survivability: rounded(
      normalized(Number(spec.hp || 0), 400, 3000) * 0.6
      + normalized(protection.modules.length + protection.crew.length, 3, 15) * 0.4,
      0,
    ),
  };
}

function galleryArmamentSentence(spec: GalleryVehicleSpec, gun: GalleryGunSummary): string {
  const familyCount = gun.shellTypes.length || 1;
  const familyKey = gun.shellTypes.length === 1 ? 'gallery.brief.family.one' : 'gallery.brief.family.other';
  const familyLabel = t(familyKey);
  if (!gun.autoloader) {
    return t('gallery.brief.armedFamily', {
      caliber: Number(spec.gun?.caliberMm || 0),
      count: familyCount,
      family: familyLabel,
    });
  }
  return t('gallery.brief.armedAuto', {
    caliber: Number(spec.gun?.caliberMm || 0),
    size: gun.magazineSize,
    cycle: rounded(gun.intraClipS),
    reload: rounded(gun.fullReloadS),
    count: familyCount,
    family: familyLabel,
  });
}

function galleryBrief(
  spec: GalleryVehicleSpec,
  displayName: string,
  tier: number,
  nation: string,
  era: string,
  powerToWeight: number,
  gun: GalleryGunSummary,
  protection: GalleryProtectionSummary,
): string[] {
  const armamentSentence = galleryArmamentSentence(spec, gun);
  const firstParagraph = t('gallery.brief.firstParagraph', {
    name: displayName,
    tier: tierNumeral(spec.id) || String(tier),
    nation,
    era,
    armament: armamentSentence,
    power: rounded(powerToWeight),
    top: rounded(Number(spec.topSpeedKmh || 0), 0),
  });
  const featureSentence = protection.features.length
    ? t('gallery.brief.featureSentence', { features: joinTechnicalList(protection.features) })
    : '';
  const secondParagraph = t('gallery.brief.secondParagraph', {
    mobility: mobilityAssessment(powerToWeight, Number(spec.topSpeedKmh || 0)),
    protection: protectionAssessment(protection.bestKeMm),
    modules: protection.modules.length,
    crew: protection.crew.length,
  });
  return [firstParagraph, secondParagraph + featureSentence];
}

function galleryHighlights(
  spec: GalleryVehicleSpec,
  powerToWeight: number,
  gun: GalleryGunSummary,
  protection: GalleryProtectionSummary,
): string[] {
  return [
    ...(gun.autoloader ? [t('gallery.highlight.magazine', {
      size: gun.magazineSize,
      damage: gun.burstDamage.toLocaleString('en-US'),
      cycle: rounded(gun.intraClipS),
    })] : []),
    gun.best
      ? t('gallery.highlight.shell', {
          name: String(gun.best.shell.name || gun.best.shell.type),
          penetration: rounded(gun.best.penetration, 0),
        })
      : t('gallery.highlight.shellFallback'),
    t('gallery.highlight.power', {
      power: rounded(powerToWeight),
      traverse: rounded(Number(spec.hullTraverseDegS || 0), 0),
    }),
    t('gallery.highlight.plates', {
      plates: (spec.armor?.hullPlates || []).length + (spec.armor?.turretPlates || []).length,
      volumes: protection.modules.length + protection.crew.length,
    }),
  ];
}

function galleryMetrics(
  spec: GalleryVehicleSpec,
  powerToWeight: number,
  gun: GalleryGunSummary,
  protection: GalleryProtectionSummary,
) {
  return Object.freeze({
    hp: Number(spec.hp || 0),
    enginePowerHp: Number(spec.enginePowerHp || 0),
    weightTons: Number(spec.weightTons || 0),
    powerToWeight: rounded(powerToWeight),
    topSpeedKmh: Number(spec.topSpeedKmh || 0),
    reverseSpeedKmh: Number(spec.reverseSpeedKmh || 0),
    hullTraverseDegS: Number(spec.hullTraverseDegS || 0),
    turretTraverseDegS: Number(spec.turretTraverseDegS || 0),
    caliberMm: Number(spec.gun?.caliberMm || 0),
    reloadS: rounded(gun.fullReloadS),
    autoloader: Boolean(gun.autoloader),
    magazineSize: gun.magazineSize,
    intraClipS: rounded(gun.intraClipS),
    burstDamage: gun.burstDamage,
    aimTimeS: Number(spec.gun?.aimTimeS || 0),
    dpm: rounded(gun.dpm, 0),
    bestPenetrationMm: rounded(gun.best?.penetration || 0, 0),
    bestKeMm: rounded(protection.bestKeMm, 0),
    bestCeMm: rounded(protection.bestCeMm, 0),
    armorPlateCount: (spec.armor?.hullPlates || []).length + (spec.armor?.turretPlates || []).length,
    moduleCount: protection.modules.length,
    crewCount: protection.crew.length,
  });
}

function galleryDimensions(spec: GalleryVehicleSpec) {
  return Object.freeze({
    hullLengthM: Number(spec.dims?.hullLengthM || 0),
    overallLengthM: Number(spec.dims?.overallLengthM || 0),
    widthM: Number(spec.dims?.widthM || 0),
    heightM: Number(spec.dims?.heightM || 0),
  });
}

function galleryShellRecords(spec: GalleryVehicleSpec) {
  return Object.freeze((spec.gun?.shells || []).map((item) => Object.freeze({
    name: item.name || item.type,
    type: item.type || t('gallery.shellType.unknown'),
    penetrationMm: Number(item.pen1000Mm ?? item.pen100Mm ?? 0),
    damage: Number(item.dmg || 0),
    velocityMps: Number(item.velocityMps || 0),
  })));
}

export function createGalleryRecord(spec: GalleryVehicleSpec) {
  const label = tankLabelRecord(spec);
  const gun = summarizeGalleryGun(spec);
  const protection = summarizeGalleryProtection(spec);
  const powerToWeight = Number(spec.weightTons) > 0
    ? Number(spec.enginePowerHp || 0) / Number(spec.weightTons)
    : 0;
  const tier = tankTier(spec.id);
  const nation = String(spec.nation || t('gallery.nation.unknown'));
  const era = vehicleEraLabel(spec.era);

  return Object.freeze({
    id: spec.id,
    displayName: tankDisplayName(spec),
    authorship: spec.authorship,
    shortName: label.shortName,
    aliases: label.searchAliases,
    nation,
    era,
    eraKey: spec.era,
    developmentOnly: Boolean(spec.roster?.developmentOnly),
    rosterTag: spec.roster?.tag || '',
    rosterReason: spec.roster?.reason || t('gallery.roster.production'),
    tier,
    tierNumeral: tierNumeral(spec.id) || String(tier),
    image: `/icons/${spec.id}_angle.webp`,
    searchText: [
      label.searchAliases.join(' '), nation, era, tier,
      gun.autoloader ? t('gallery.shell.family') : '',
      spec.roster?.developmentOnly ? t('gallery.roster.dev', { reason: spec.roster.reason || '' }) : t('gallery.roster.production'),
    ].join(' ').toLocaleLowerCase('en-US'),
    ratings: Object.freeze(galleryRatings(spec, powerToWeight, gun, protection)),
    metrics: galleryMetrics(spec, powerToWeight, gun, protection),
    dimensions: galleryDimensions(spec),
    brief: Object.freeze(galleryBrief(spec, label.displayName, tier, nation, era, powerToWeight, gun, protection)),
    highlights: Object.freeze(galleryHighlights(spec, powerToWeight, gun, protection)),
    shells: galleryShellRecords(spec),
  });
}

export type GalleryRecord = ReturnType<typeof createGalleryRecord>;

export function buildGalleryRecords(specs: readonly GalleryVehicleSpec[]): GalleryRecord[] {
  return specs.map(createGalleryRecord).sort((a, b) =>
    b.tier - a.tier || a.nation.localeCompare(b.nation) || a.displayName.localeCompare(b.displayName));
}

export function filterGalleryRecords(
  records: readonly GalleryRecord[],
  filters: GalleryFilters = {},
): GalleryRecord[] {
  const query = String(filters.query || '').trim().toLocaleLowerCase('en-US');
  return records.filter((record) => {
    if (filters.nation && filters.nation !== 'all' && record.nation !== filters.nation) return false;
    if (filters.era && filters.era !== 'all' && record.eraKey !== filters.era) return false;
    if (query && !record.searchText.includes(query)) return false;
    return true;
  });
}

export function serializeGallerySpec(spec: GalleryVehicleSpec) {
  const record = createGalleryRecord(spec);
  return {
    schema: 'claude-of-tanks/gallery-spec@2',
    id: record.id,
    name: record.displayName,
    authorship: record.authorship,
    nation: record.nation,
    era: { id: record.eraKey, label: record.era },
    tier: record.tier,
    dimensionsM: record.dimensions,
    mobility: {
      enginePowerHp: record.metrics.enginePowerHp,
      weightTons: record.metrics.weightTons,
      powerToWeightHpT: record.metrics.powerToWeight,
      topSpeedKmh: record.metrics.topSpeedKmh,
      reverseSpeedKmh: record.metrics.reverseSpeedKmh,
      hullTraverseDegS: record.metrics.hullTraverseDegS,
    },
    gun: {
      caliberMm: record.metrics.caliberMm,
      reloadS: record.metrics.reloadS,
      autoloader: record.metrics.autoloader ? {
        magazineSize: record.metrics.magazineSize,
        intraMagazineCycleS: record.metrics.intraClipS,
        fullReloadS: record.metrics.reloadS,
        burstDamage: record.metrics.burstDamage,
        sustainedDamagePerMinute: record.metrics.dpm,
      } : null,
      aimTimeS: record.metrics.aimTimeS,
      shells: record.shells,
    },
    protection: {
      hitPoints: record.metrics.hp,
      peakKeMm: record.metrics.bestKeMm,
      peakCeMm: record.metrics.bestCeMm,
      armorPlateCount: record.metrics.armorPlateCount,
      moduleVolumeCount: record.metrics.moduleCount,
      crewVolumeCount: record.metrics.crewCount,
    },
  };
}
