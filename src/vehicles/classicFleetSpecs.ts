// Additional first-party classic tank and assault-gun combat rows. Visual
// geometry remains in the demand-loaded procedural family builders.
import { TANK_SPECS, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import { LEOPARD2_PROTO_ARMOR } from './leopard2ProtoArmor.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type {
  FleetDimensions,
  FleetGunSpec,
  FleetTankSpec,
  FleetVisualSpec,
} from './specContracts.ts';

type VariantPatch = Omit<Partial<FleetTankSpec>, 'armor' | 'dims' | 'gun' | 'visual'> & {
  armor?: ArmorEnvelope & Partial<Record<'barrelLenM' | 'tHalfW' | 'tFrontZ' | 'tRearZ', number>>;
  dims?: Partial<FleetDimensions>;
  gun?: Partial<FleetGunSpec>;
  visual?: Partial<FleetVisualSpec>;
};

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tankSpecs: Record<string, FleetTankSpec> = TANK_SPECS;

function requireFleetSpec(id: string): FleetTankSpec {
  const spec = tankSpecs[id];
  if (!spec) throw new Error(`Classic fleet donor missing or incomplete: ${id}`);
  return spec;
}

function make(
  baseId: string,
  id: string,
  name: string,
  nation: string,
  patch: VariantPatch = {},
): FleetTankSpec {
  const s = copy(requireFleetSpec(baseId));
  s.id = id; s.name = name; s.nation = nation; s.variantOf = baseId;
  s.publicVisualFallback = baseId;
  delete s.community;
  const gun = s.gun, dims = s.dims, visual = s.visual;
  Object.assign(s, patch);
  if (patch.gun) s.gun = { ...gun, ...patch.gun };
  if (patch.dims) s.dims = { ...dims, ...patch.dims };
  if (patch.visual) s.visual = { ...visual, ...patch.visual };
  // A patched armor arrives as a top-level spread over a DONOR's armor — its
  // plate/box arrays are shared references. Deep-copy before the dims fit
  // below may mutate them (a patched variant would otherwise rescale its donor).
  if (patch.armor) s.armor = copy(patch.armor);
  // MODULE HITBOXES (module_hitbox r1): visuals render at spec.dims (geometry
  // gate) while copied armor stayed donor-sized — refit the copy so hit
  // resolution agrees with the rendered vehicle (see specs.fitArmorToDims).
  if (patch.dims) fitArmorToDims(s.armor, dims, s.dims);
  return s;
}

const SPECS: FleetTankSpec[] = [
  make('chieftain_mk9', 'centurion3', 'Centurion Mk.3', 'UK',
    { hp: 1500, weightTons: 51, topSpeedKmh: 35, gun: { caliberMm: 84, reloadS: 7.0 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 } }),
  // release 262: the L7 stands 2.06 m past the front guards (the 9.83 m was the 20-pdr's; profiles/centurionFamily.ts)
  make('chieftain_mk9', 'centurion5_2', 'Centurion Mk.5/2', 'UK',
    { hp: 1650, weightTons: 52, topSpeedKmh: 35, gun: { caliberMm: 105, reloadS: 7.4 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.62, widthM: 3.38, heightM: 2.94 } }),
  make('leo2a2', 'leopard2_proto', 'Leopard 2 Prototype', 'Germany',
    {
      hp: 2050, weightTons: 55, topSpeedKmh: 68, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 7.72, overallLengthM: 10.67, widthM: 3.70, heightM: 2.48 },
    }),
  // m1a1_aim REMOVED BY OWNER 2026-08-06 ('also remove the AIM abrams') —
  // builder code dormant in abrams.js; packet historical.
  make('m60a1', 'm46_patton', 'M46 Patton', 'USA',
    // release 262: the M73 mount's +20 / -10 deg (Hunnicutt via docs/references/tanks/m46_patton.md)
    { hp: 1450, weightTons: 44, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 7.0 },
      gunElevationDeg: 20, gunDepressionDeg: 10,
      // measured by tools/gun-depression-sweep.mjs (26 mm from the hull) on the release-262 build: the full -10 deg ahead
      // and abeam (-9 at 24-32 deg off the bow), the engine deck's grilles over the rear
      gunPitchByYawDeg: [[0, -10], [22, -10], [24, -9.5], [28, -9], [31, -9], [32, -9.1], [35, -10], [106, -10],
        [107, -9], [108, -8.5], [109, -8.2], [117, -8.1], [119, -6.6], [124, -5.3], [129, -5.2], [154, -5.1],
        [156, -4.8], [160, -4.5], [161, -3.7], [162, -3.4], [163, -3.2], [180, -3.5]],
      dims: { hullLengthM: 6.33, overallLengthM: 8.48, widthM: 3.51, heightM: 3.18 },
      // bakeDirt deck equalizer (f243966): the Bergman refs paint from the
      // shared canvas with NO deck penalty — knob-on is ref-parity for this
      // print class (m47-top census gap 1029 -> 401 measured).
      visual: { bakeDirtDeckEq: true } }),
  make('m60a1', 'm47_patton', 'M47 Patton', 'USA',
    // release 262: the M78 mount's +19 / -10 deg (TM 9-2350-200-12 and Hunnicutt; the 1952 TM 9-718A gives -5, see
    // docs/references/tanks/m47_patton.md)
    { hp: 1550, weightTons: 46, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 6.8 },
      gunElevationDeg: 19, gunDepressionDeg: 10,
      // measured by tools/gun-depression-sweep.mjs (26 mm from the hull) on the release-262 build: the full -10 deg over
      // the front 113 deg either side, the engine deck's grilles over the rear
      gunPitchByYawDeg: [[0, -10], [113, -10], [114, -8.8], [115, -8.4], [120, -8.3], [123, -7.9], [124, -6.9],
        [125, -6.4], [127, -5.6], [128, -5.4], [161, -5.2], [162, -4.9], [163, -4.7], [169, -4.7], [180, -5]],
      dims: { hullLengthM: 6.33, overallLengthM: 8.51, widthM: 3.51, heightM: 3.35 },
      visual: { bakeDirtDeckEq: true } }),
  make('m60a1', 'm60a3', 'M60A3', 'USA',
    { hp: 2200, weightTons: 52.6, topSpeedKmh: 50,
      hullTraverseDegS: 42, turretTraverseDegS: 40,
      gun: {
        reloadS: 6.4, baseAccuracy: 0.28, aimTimeS: 1.6,
        shells: requireFleetSpec('m60a1').gun.shells.map((round, index) => ({
          ...round,
          ...(index === 0 ? { pen100Mm: 610, pen1000Mm: 570, pen2000Mm: 520, dmg: 450 }
            : index === 1 ? { pen100Mm: 560, pen1000Mm: 560, dmg: 450 }
              : { dmg: 530 }),
        })),
      },
      // release 265 (Main, 2026-10-28): the owner's M60A3 model carries no reactive armour and US M60A3s never fielded
      // it, so the 233 cassettes are gone; the A3 keeps the A1's casting armour
      dims: { hullLengthM: 6.946, overallLengthM: 9.436, widthM: 3.631, heightM: 3.27 } }),
];

// The prototype owns its elongated visual rig and its own envelope (leopard2ProtoArmor.ts, pinned in release 262 when
// leo2a2 moved to the new Leopard construction): make() fits leo2a2's copy to the prototype's dims, and that copy is
// replaced whole, so the prototype no longer depends on when leo2a2's spec is re-enveloped.
const leopardPrototype = SPECS.find(spec => spec.id === 'leopard2_proto')!;
leopardPrototype.armor = copy(LEOPARD2_PROTO_ARMOR);

// Register only first-party procedural gameplay rows. Historical source assets
// remain offline comparison inputs and have no runtime registration path.
for (const spec of SPECS) {
  tankSpecs[spec.id] ||= spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

// Owner 2026-09-22 ("the muzzle marker is the tube end"), round-46 follow-up
// 2026-09-23: the M60A1's authority barrel fired 14.9 cm ahead of its visible
// mouth. make('leo1a5', 'm60a1') copies the Leopard 1A5 gunBarrel.lengthM
// (5.0944 after the dims refit) while usKit's M68 tube seats rig_muzzle at
// world z 5.3865 — the fleet lip finishes the mouth ON that marker (ring
// 5.3873, flat cap 20 mm behind it) — and the authority fires from
// turretPivot.z + gunPivot.z = 0.44086 along the gun axis: 0.44086 + 5.0944 =
// 5.5352. The barrel is the marker minus the pivots (4.94564 m). Written HERE,
// after the M46/M47/M60A3 donor copies above (and after the hoisted
// supplemental chain-load that makes the M60A2 from the same donor), so the
// fix does not rescale the other Pattons' barrels: m46/m47 carry their own
// guns and their own 69-80 cm donor gaps and need their own measured ends.
const M60_TUBE_END_MARKER_Z = 5.3865;
for (const id of ['m60a1']) {
  const patton = requireFleetSpec(id);
  patton.armor.gunBarrel.lengthM = M60_TUBE_END_MARKER_Z
    - (patton.armor.turretPivot[2] + patton.armor.gunPivot[2]);
}

// Chain-load the following supplemental rows for every fleet facade.
import './supplementalFleetSpecs.ts';
