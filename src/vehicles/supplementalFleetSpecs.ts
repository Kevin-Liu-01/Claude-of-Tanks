// Supplemental first-party combat rows. Stats inherit the nearest researched
// donor and apply explicit published/balance deltas. Historical third-party
// inputs are attribution and offline comparison evidence, never playable
// geometry; retained candidate metadata is procedural-only.
import { TANK_SPECS, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { shell, type ArmorEnvelope } from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  FleetVisualSpec,
} from './specContracts.ts';

type VariantPatch = Omit<Partial<FleetTankSpec>, 'armor' | 'dims' | 'gun' | 'visual'> & {
  armor?: ArmorEnvelope;
  dims?: Partial<FleetDimensions>;
  gun?: Partial<FleetGunSpec>;
  visual?: Partial<FleetVisualSpec>;
};

interface SourceCredit {
  readonly author: string;
  readonly source: string;
  readonly license: string;
  readonly quarantine?: boolean;
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tankSpecs: typeof TANK_SPECS & Record<string, unknown> = TANK_SPECS;

function isFleetSpecRecord(value: unknown): value is FleetTankSpec {
  return value !== null && typeof value === 'object';
}

function requireFleetSpec(id: string): FleetTankSpec {
  const spec = tankSpecs[id];
  if (!isFleetSpecRecord(spec)) throw new Error(`Supplemental fleet donor missing or incomplete: ${id}`);
  return spec;
}

// credit rows (author/source/license verified in candidates-gen2 PROVENANCE)
const BERGMAN = {
  author: 'm_bergman', source: 'https://www.thingiverse.com/thing:4718232',
  license: 'CC BY-NC-SA 4.0 — LOCAL-ONLY QUARANTINE', quarantine: true,
};
const T84_REMIX = {
  author: 'LastTriarius (remix of ThudOne thing:4885197 + m_bergman parts)',
  source: 'https://www.thingiverse.com/thing:6178654',
  // labeled CC BY 4.0, but both remix parents are CC BY-NC-SA — the NC-SA
  // terms govern the combined work (see ATTRIBUTION license-chain note)
  license: 'effective CC BY-NC-SA 4.0 — LOCAL-ONLY QUARANTINE', quarantine: true,
};
const FOXY = {
  author: 'Foxygamer142', source: 'https://www.thingiverse.com/thing:6799441',
  license: 'CC BY-SA 4.0',
};
const ATMODELER = {
  author: 'ATModeler', source: 'https://www.thingiverse.com/thing:5964554',
  license: 'CC BY 4.0',
};
const AHAB_AMX30 = {
  author: 'Captain_Ahab_62 (Richard Honeycutt)',
  source: 'https://www.thingiverse.com/thing:3602722', license: 'CC BY 4.0',
};
const AHAB_M60A2 = {
  author: 'Captain_Ahab_62 (Richard Honeycutt)',
  source: 'https://www.thingiverse.com/thing:3063170', license: 'CC BY 4.0',
};
const TRIARIUS_T69 = {
  author: 'LastTriarius', source: 'https://www.thingiverse.com/thing:6192142',
  license: 'CC BY 4.0',
};
const JACK = {
  author: 'JackTheTinkerer', source: 'https://www.thingiverse.com/thing:5523615',
  license: 'CC BY 4.0',
};

function make(
  baseId: string,
  id: string,
  name: string,
  nation: string,
  patch: VariantPatch = {},
  credit: SourceCredit | null = null,
): FleetTankSpec {
  const s = copy(requireFleetSpec(baseId));
  s.id = id; s.name = name; s.nation = nation; s.variantOf = baseId;
  if (credit && !credit.quarantine) {
    // shippable class: the credit line renders on the nation-tab/garage card
    // in every build (CC BY attribution) and the GLB itself is distributed,
    // so no public visual fallback is needed.
    s.community = { author: credit.author, source: credit.source, license: credit.license };
    s.publicVisualFallback = null;
  } else {
    s.publicVisualFallback = baseId;
    delete s.community;
  }
  const gun = s.gun, dims = s.dims, visual = s.visual;
  Object.assign(s, patch);
  if (patch.gun) s.gun = { ...gun, ...patch.gun };
  if (patch.dims) s.dims = { ...dims, ...patch.dims };
  if (patch.visual) s.visual = { ...visual, ...patch.visual };
  // patched armor arrives as a shared-reference spread over a donor's armor —
  // deep-copy before the dims refit below may mutate it (userdrops6 lesson)
  if (patch.armor) s.armor = copy(patch.armor);
  // MODULE HITBOXES: the visual renders at spec.dims while the copied armor
  // stayed donor-sized — refit so hits resolve against the rendered vehicle.
  if (patch.dims) fitArmorToDims(s.armor, dims, s.dims);
  return s;
}

// Published dims from the scout packets (docs/references/tanks/scout-gen2-*).
// heightM uses the over-mounted-MG convention ONLY where the mesh actually
// mounts one (t54/t44 carry a printed DShK — m26/m45 precedent, userdrops6);
// every other row keeps the published roof datum.
const SPECS: FleetTankSpec[] = [
  // -- Soviet mediums: T-34-85 -> T-44 -> T-54 lineage ----------------------
  make('t34_85', 't44', 'T-44', 'USSR',
    { hp: 900, weightTons: 31.8, topSpeedKmh: 60, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 6.07, overallLengthM: 7.65, widthM: 3.18, heightM: 2.72 },
      visual: { number: '32' } }, FOXY),
  make('t62mv1', 't54', 'T-54', 'USSR/Russia',
    { hp: 1600, enginePowerHp: 520, weightTons: 36, topSpeedKmh: 50,
      gun: { caliberMm: 100, reloadS: 8.6 },
      dims: { hullLengthM: 6.45, overallLengthM: 9.00, widthM: 3.27, heightM: 2.65 },
      visual: { marking: 'number', number: '324' } }, BERGMAN),
  make('t62mv1', 'type59', 'Type 59', 'China',
    // §5.304 REDESIGN (owner order verbatim 2026-08-17: "update our t62 obr
    // 1975 10% wider and then redeisgn our type 59 to be based off of
    // that"): the visual is profiles/china.ts buildType59 — the WZ-120
    // (T-54A-family) dome + 100 mm kit on the WIDENED obr-1975 chassis.
    // Stats stay the Type 59's; dims RE-DERIVE from the widened base
    // (hull/width = the t62mv1 rows, height = the authored cupola crown,
    // overall = the authored 100 mm gun-forward total). silhouette* rows
    // are type59's OWN gate-measured envelope (they also override the
    // donor-inherited t62mv1 print rows — the §5.259 leak class, which
    // zeroed this id's dims row until this landing). The LastTriarius
    // Type 69 print remains the registered measurement oracle; its gate
    // deltas vs this owner-decreed redesign are documented divergence
    // (docs/references/tanks/type59.md §5.304), never chased back.
    { hp: 1580, enginePowerHp: 520, weightTons: 36, topSpeedKmh: 50,
      gun: { caliberMm: 100, reloadS: 8.8 },
      dims: { hullLengthM: 5.67, overallLengthM: 8.14, widthM: 3.11, heightM: 2.23,
        // gate-measured authored envelope (§5.304 run receipts: 12%-band
        // body trace includes the base's drum/fender tail like t62mv1's;
        // height p95 = the cupola crown band)
        silhouetteHullLengthM: 6.09, silhouetteOverallLengthM: 8.14,
        silhouetteHeightM: 2.24 },
      // china-palette hooks (PLA green family, ztz85_iii grammar — values
      // distinct per §H.4 family separation)
      visual: { marking: 'number', number: '406', base: '#374836',
        weather: '#49573f', patches: ['#2a3629', '#5c6349', '#6f684e'],
        camoScale: 0.52 } }, TRIARIUS_T69),
  // -- T-80 turbine family ---------------------------------------------------
  make('t80u', 't80', 'T-80', 'USSR/Russia',
    { hp: 1780, enginePowerHp: 1000, weightTons: 42, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '117' } }, BERGMAN),
  make('t80u', 't80b', 'T-80B', 'USSR/Russia',
    { hp: 2100, enginePowerHp: 1100, weightTons: 42.5, gun: { reloadS: 7.4 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '225' } }, BERGMAN),
  // full-ERA T-80BV — the scout round's closest silhouette proxy for the
  // roster-listed T-80BVM (Kontakt-1 vs Relikt; PROVENANCE note)
  make('t80u', 't80bv', 'T-80BV', 'USSR/Russia',
    { hp: 2200, enginePowerHp: 1100, weightTons: 43.7, gun: { reloadS: 7.1 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '319' } }, BERGMAN),
  // -- NATO cold-war ---------------------------------------------------------
  make('leo1a5', 'amx30', 'AMX-30B', 'France',
    { hp: 1600, enginePowerHp: 720, weightTons: 36, reverseSpeedKmh: 11,
      gun: { reloadS: 7.0 },
      // §5.309 REBUILD (owner order 2026-08-17: stripped-down amx40 base):
      // dims RE-DERIVE from the rebuilt misc.ts build, authored to the
      // PUBLISHED figures (hull 6.59 / overall 9.48 / width 3.10 over
      // tracks / 2.29 turret-roof datum) — the prior 6.85/9.55/2.87 rows
      // were the retired 08-15 donor-GLB envelope. silhouetteHeightM is
      // the gate-measured p95 through the mounted TOP-cupola/MG station
      // (t62mv1 DShK-height convention; roof datum keeps heightM).
      // §5.328 cupola round: 2.64 -> 2.82 — the ordered full-read TOP-7
      // (raised collar, episcope drum, domed lid ~2.70) carries the CLAMS
      // 7.62 receiver/drum band at ~2.82-2.85; p95 re-measured 2.82 ×2.
      dims: { hullLengthM: 6.59, overallLengthM: 9.48, widthM: 3.10,
        heightM: 2.29, silhouetteHeightM: 2.82 },
      visual: { marking: 'number', number: '53' } }, AHAB_AMX30),
  make('leo1a5', 'amx30b2', 'AMX-30B2', 'France',
    { hp: 1950, enginePowerHp: 750, weightTons: 37, reverseSpeedKmh: 15,
      gun: {
        reloadS: 6.0, baseAccuracy: 0.29, aimTimeS: 1.7,
        shells: requireFleetSpec('leo1a5').gun.shells.map((round, index) => ({
          ...round,
          ...(index === 0 ? { pen100Mm: 550, pen1000Mm: 510, pen2000Mm: 460, dmg: 430 }
            : index === 1 ? { pen100Mm: 520, pen1000Mm: 520, dmg: 430 }
              : { dmg: 510 }),
        })),
      },
      // §5.309: same rebuilt base as amx30 (published rows shared); the
      // B2's outboard kit no longer carries a wider silhouette row — the
      // old 3.34 measured the retired donor envelope.
      // §5.328: 2.63 -> 2.82 — shared TOP-7/CLAMS station (see amx30 note);
      // the Brénus brick fields stay inside the width/length envelope
      // (widthM anchor ±1.5495 untouched, gate width row 3.13 held).
      dims: { hullLengthM: 6.59, overallLengthM: 9.48, widthM: 3.10,
        heightM: 2.29, silhouetteHeightM: 2.82 },
      visual: { marking: 'number', number: '68' } }, AHAB_AMX30),
  make('m60a1', 'm48', 'M48A5 Patton', 'USA',
    // hullLengthM 6.42 -> 6.87 (m48 build round 2026-08-08): the 6.42 row
    // is an inetres A5-line defect — its own M48A3 row reads 6.882 m on the
    // SAME hull (the A5 is a rebuilt A3), and the Hunnicutt-class table
    // gives 687.1 cm "length without gun, with fenders" for A2/A3/A5
    // (docs/references/tanks/m48.md, two-source rule).
    { hp: 1950, enginePowerHp: 750, weightTons: 49.6, topSpeedKmh: 48,
      gun: {
        reloadS: 7.2, baseAccuracy: 0.31, aimTimeS: 1.9,
        shells: requireFleetSpec('m60a1').gun.shells.map((round, index) => ({
          ...round,
          ...(index === 0
            ? { pen100Mm: 540, pen1000Mm: 500, pen2000Mm: 450, dmg: 430 }
            : index === 1
              ? { pen100Mm: 520, pen1000Mm: 520, dmg: 430 }
              : { dmg: 510 }),
        })),
      },
      dims: { hullLengthM: 6.87, overallLengthM: 9.31, widthM: 3.63, heightM: 3.09 },
      visual: { marking: 'star', number: 'A31' } }, ATMODELER),
  make('m60a1', 'm60a2', 'M60A2 Starship', 'USA',
    { hp: 2250, enginePowerHp: 750, weightTons: 52, reverseSpeedKmh: 18,
      turretTraverseDegS: 38,
      // 152 mm M162 gun/launcher: conventional ammunition stays the default,
      // while E selects the MGM-51C slot exactly like its numbered shell key.
      // Per-round counts keep the Starship's compact mixed stowage explicit.
      gun: { caliberMm: 152, reloadS: 9.6, baseAccuracy: 0.32, aimTimeS: 1.8, shells: [
        shell('M409A1 HEAT-MP', 'HEAT', 152, 560, 560, 650, 689,
          { reloadS: 9.6, count: 33 }),
        shell('MGM-51C Shillelagh ATGM', 'HEAT', 152, 900, 900, 780, 208, {
          guided: true,
          guidanceTurnRateRadS: 0.72,
          reloadS: 3.0,
          count: 13,
          soundProfile: 'shillelagh-launch',
        }),
        shell('M657A2 HE-T', 'HE', 152, 45, 45, 760, 683,
          { reloadS: 9.6, count: 12 }),
      ] },
      dims: { hullLengthM: 6.95, overallLengthM: 7.27, widthM: 3.63, heightM: 3.11 },
      visual: { marking: 'star', number: 'S12' } }, AHAB_M60A2),
  // donor is chieftain_mk10, NOT centurion5: this module is chain-imported
  // from userdrops6.js, so ES hoisting evaluates it BEFORE the userdrops6
  // rows exist — only specs.ts/modern*/variants/userdrops1-5 ids are legal
  // donors here. The L7 caliber is patched in over the Chieftain's 120.
  make('chieftain_mk10', 'vickers_mk1', 'Vickers MBT Mk.1', 'UK',
    { hp: 1500, enginePowerHp: 650, weightTons: 38.6, topSpeedKmh: 48,
      gun: { caliberMm: 105, reloadS: 6.8 },
      dims: { hullLengthM: 7.92, overallLengthM: 9.79, widthM: 3.17, heightM: 2.71 },
      visual: { number: 'V1' } }, JACK),
  // -- Ukraine ---------------------------------------------------------------
  make('t80u', 't84', 'T-84 Oplot', 'Ukraine',
    { hp: 2250, enginePowerHp: 1200, weightTons: 46, topSpeedKmh: 65,
      gun: { reloadS: 6.6 },
      dims: { hullLengthM: 7.08, overallLengthM: 9.72, widthM: 3.56, heightM: 2.22 },
      visual: { number: '240' } }, T84_REMIX),
  // -- §5.38 T-90 family (owner priority wave 2026-08-08) ---------------------
  // Three new marks off the typed t90a combat-spec donor — legal here, the
  // userdrops5 t72bu precedent). The KojfDiscord AW-series prints are
  // LOCAL-ONLY QUARANTINE measurement references (docs/ATTRIBUTION.md series
  // entry): NO MODEL_SOURCE rows and no credit cards — every playable renders
  // its OWN procedural build (profiles/russia.ts, RUSSIA_PROFILES).
  // t90: base 1992 obr. — V-84MS 840 hp, cast turret, K-5 clamshell, NSVT.
  make('t90a', 't90', 'T-90', 'USSR/Russia',
    { hp: 2150, enginePowerHp: 840, weightTons: 46.5,
      gun: { reloadS: 7.5 },
      visual: { number: '417' } }),
  // t90ms: Tagil export demonstrator — V-92S2F 1130 hp, welded turret with
  // the big bustle + rear cage + UDP T05BV-1 RWS; desert-sand factory paint
  // (the export-demo look; also the garage tell vs the green t90sm).
  make('t90a', 't90ms', 'T-90MS Tagil', 'USSR/Russia',
    { hp: 2300, enginePowerHp: 1130, weightTons: 48, topSpeedKmh: 65,
      gun: { reloadS: 6.8 },
      visual: { scheme: 'solid', base: '#6a6047', weather: '#75694e', patches: [], number: '340' } }),
  // t90a_burlak: experimental Burlak bustle-autoloader turret on the T-90A
  // hull (t90a stats; height to the taller bustle roof; the rear-rack
  // autoloader feeds a touch faster than the carousel). overallLengthM:
  // the Burlak bustle overhangs the hull rear ~0.24 past the T-90A datum
  // (print -3.66 corroborates) — 9.76 is the variant's honest gun-forward
  // total (ASK-OWNER note in the packet; §5.38 named only heightM 2.30).
  make('t90a', 't90a_burlak', 'T-90A Burlak', 'USSR/Russia',
    { hp: 2250, gun: { reloadS: 6.7 },
      dims: { heightM: 2.30, overallLengthM: 9.76 },
      visual: { number: '059' } }),
];

for (const spec of SPECS) {
  tankSpecs[spec.id] ||= spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

// ---------------------------------------------------------------------------
export const SUPPLEMENTAL_FLEET_TANK_IDS = SPECS.map((spec) => spec.id);
