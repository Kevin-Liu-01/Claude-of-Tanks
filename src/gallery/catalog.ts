import { tankDisplayName, tankLabelRecord } from '../vehicles/tankLabels.js';
import { tankTier, tierNumeral } from '../vehicles/tier.ts';
import { vehicleEraLabel } from '../vehicles/taxonomy.ts';

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
  era?: unknown;
  physicalMm?: number;
  keMm?: number;
  ceMm?: number;
}

interface GalleryAutoloaderSpec {
  magazineSize?: number;
  intraClipS?: number;
  fullReloadS?: number;
}

interface GalleryVehicleSpec {
  id: string;
  name?: string;
  authorship?: unknown;
  nation?: string;
  era?: string;
  hp?: number;
  enginePowerHp?: number;
  weightTons?: number;
  topSpeedKmh?: number;
  reverseSpeedKmh?: number;
  hullTraverseDegS?: number;
  turretTraverseDegS?: number;
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
    modules?: unknown[];
    crew?: unknown[];
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

function titleCase(value: unknown): string {
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
  if (plates.some((plate) => plate.kind === 'era' || plate.era)) features.push('explosive reactive armor');
  if (plates.some((plate) => plate.kind === 'spaced')) features.push('spaced armor');
  if (plates.some((plate) => plate.kind === 'composite')) features.push('composite arrays');
  return features;
}

function joinTechnicalList(items: readonly string[]): string {
  if (items.length < 2) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function mobilityAssessment(powerToWeight: number, topSpeed: number): string {
  if (powerToWeight >= 25 && topSpeed >= 60) return 'a high power-to-weight ratio and high maximum road speed';
  if (powerToWeight >= 18 || topSpeed >= 55) return 'mobility appropriate to its weight class';
  if (powerToWeight >= 13) return 'moderate mobility that favors deliberate positioning';
  return 'low maximum speed and high inertia that require careful route planning';
}

function protectionAssessment(bestKe: number): string {
  if (bestKe >= 700) return 'very high maximum kinetic protection';
  if (bestKe >= 400) return 'high maximum kinetic protection';
  if (bestKe >= 180) return 'moderate local kinetic protection';
  return 'limited kinetic protection, which increases the importance of positioning';
}

export function technicalLabel(value: unknown): string {
  return titleCase(value || 'unspecified');
}

export function createGalleryRecord(spec: GalleryVehicleSpec) {
  const label = tankLabelRecord(spec);
  const shell = primaryShell(spec);
  const best = bestShell(spec);
  const keValues = plateValues(spec, 'keMm');
  const ceValues = plateValues(spec, 'ceMm');
  const powerToWeight = Number(spec.weightTons) > 0
    ? Number(spec.enginePowerHp || 0) / Number(spec.weightTons)
    : 0;
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
  const bestKeMm = Math.max(0, ...keValues);
  const bestCeMm = Math.max(0, ...ceValues);
  const features = protectionFeatures(spec);
  const shellTypes = [...new Set((spec.gun?.shells || []).map((item) => item.type)
    .filter((value): value is string => Boolean(value)))];
  const modules = spec.armor?.modules || [];
  const crew = spec.armor?.crew || [];
  const tier = tankTier(spec.id);
  const nation = String(spec.nation || 'Unknown nation');
  const era = vehicleEraLabel(spec.era);

  const ratings = {
    firepower: rounded(
      normalized(best?.penetration || 0, 60, 900) * 0.58
      + normalized(dpm, 700, 5600) * 0.32
      + normalized(Number(spec.gun?.caliberMm || 0), 20, 155) * 0.10,
      0,
    ),
    protection: rounded(
      normalized(bestKeMm, 20, 900) * 0.72
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
      + normalized(modules.length + crew.length, 3, 15) * 0.4,
      0,
    ),
  };

  const armamentSentence = autoloader
    ? `Its ${Number(spec.gun?.caliberMm || 0)} mm primary armament uses a ${magazineSize}-round magazine autoloader with a ${rounded(intraClipS)}-second intra-magazine cycle and a complete reload time of ${rounded(fullReloadS)} seconds; the modeled ammunition suite comprises ${shellTypes.length || 1} ${shellTypes.length === 1 ? 'family' : 'families'}.`
    : `Its ${Number(spec.gun?.caliberMm || 0)} mm primary armament is modeled with ${shellTypes.length || 1} ammunition ${shellTypes.length === 1 ? 'family' : 'families'}.`;
  const firstParagraph = `In Claude of Tanks, ${label.displayName} is a Tier ${tierNumeral(spec.id) || tier} ${nation} vehicle representing the ${era} era. ${armamentSentence} Its drivetrain provides ${rounded(powerToWeight)} horsepower per tonne and a maximum forward speed of ${rounded(Number(spec.topSpeedKmh || 0), 0)} km/h.`;
  const featureSentence = features.length
    ? ` The authored plate set also includes ${joinTechnicalList(features)}.`
    : '';
  const secondParagraph = `The current balance model gives this vehicle ${mobilityAssessment(powerToWeight, Number(spec.topSpeedKmh || 0))}. Its armor model provides ${protectionAssessment(bestKeMm)}. Post-penetration damage can affect ${modules.length} modeled module volumes and ${crew.length} crew stations.${featureSentence}`;

  const highlights = [
    ...(autoloader ? [`${magazineSize}-round magazine: ${burstDamage.toLocaleString('en-US')} burst damage with a ${rounded(intraClipS)} s intra-magazine cycle`] : []),
    best ? `${best.shell.name || best.shell.type}: ${rounded(best.penetration, 0)} mm penetration at 1,000 m` : 'Ammunition performance is not specified',
    `${rounded(powerToWeight)} hp/t and ${rounded(Number(spec.hullTraverseDegS || 0), 0)}°/s hull traverse`,
    `${(spec.armor?.hullPlates || []).length + (spec.armor?.turretPlates || []).length} authored armor plates; ${modules.length + crew.length} internal volumes`,
  ];

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
    rosterReason: spec.roster?.reason || 'production',
    tier,
    tierNumeral: tierNumeral(spec.id) || String(tier),
    image: `/icons/${spec.id}_angle.webp`,
    searchText: [
      label.searchAliases.join(' '), nation, era, tier,
      autoloader ? 'magazine autoloader' : '',
      spec.roster?.developmentOnly ? `dev development ${spec.roster.reason || ''}` : 'production',
    ].join(' ').toLocaleLowerCase('en-US'),
    ratings: Object.freeze(ratings),
    metrics: Object.freeze({
      hp: Number(spec.hp || 0),
      enginePowerHp: Number(spec.enginePowerHp || 0),
      weightTons: Number(spec.weightTons || 0),
      powerToWeight: rounded(powerToWeight),
      topSpeedKmh: Number(spec.topSpeedKmh || 0),
      reverseSpeedKmh: Number(spec.reverseSpeedKmh || 0),
      hullTraverseDegS: Number(spec.hullTraverseDegS || 0),
      turretTraverseDegS: Number(spec.turretTraverseDegS || 0),
      caliberMm: Number(spec.gun?.caliberMm || 0),
      reloadS: rounded(fullReloadS),
      autoloader: Boolean(autoloader),
      magazineSize,
      intraClipS: rounded(intraClipS),
      burstDamage,
      aimTimeS: Number(spec.gun?.aimTimeS || 0),
      dpm: rounded(dpm, 0),
      bestPenetrationMm: rounded(best?.penetration || 0, 0),
      bestKeMm: rounded(bestKeMm, 0),
      bestCeMm: rounded(bestCeMm, 0),
      armorPlateCount: (spec.armor?.hullPlates || []).length + (spec.armor?.turretPlates || []).length,
      moduleCount: modules.length,
      crewCount: crew.length,
    }),
    dimensions: Object.freeze({
      hullLengthM: Number(spec.dims?.hullLengthM || 0),
      overallLengthM: Number(spec.dims?.overallLengthM || 0),
      widthM: Number(spec.dims?.widthM || 0),
      heightM: Number(spec.dims?.heightM || 0),
    }),
    brief: Object.freeze([firstParagraph, secondParagraph]),
    highlights: Object.freeze(highlights),
    shells: Object.freeze((spec.gun?.shells || []).map((item) => Object.freeze({
      name: item.name || item.type,
      type: item.type || 'Unknown',
      penetrationMm: Number(item.pen1000Mm ?? item.pen100Mm ?? 0),
      damage: Number(item.dmg || 0),
      velocityMps: Number(item.velocityMps || 0),
    }))),
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
