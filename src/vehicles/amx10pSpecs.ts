// French AMX-10P family. Shape/equipment follow the photographic packet;
// protection, damage and penetration below are tiered gameplay values.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { modernArmor, plate } from './specHelpers.ts';
import { AMX10P25_SKIRT_CONTOUR, AMX10P25_SKIRT_STATIONS, amx10p25SkirtPoint } from './amx10pSkirtLayout.ts';
import type { FleetTankSpec } from './specContracts.ts';

export const AMX10P_IDS = ['amx10p', 'amx10p_25'] as const;
const registry = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const specs: Record<string, FleetTankSpec> = {};
for (const id of AMX10P_IDS) {
  const upgraded = id === 'amx10p_25';
  const caliber = upgraded ? 25 : 20;
  const reload = upgraded ? .30 : .22;
  const damage = upgraded ? 70 : 44;
  const penetration = upgraded ? 225 : 190;
  const s = cloneFleetVariant(registry.tankSpecs, id, 'm2a2_bradley', {
    name: upgraded ? 'AMX-10P 25' : 'AMX-10P', nation: 'France', era: 'cold-war', role: 'ifv',
  });
  if (upgraded) s.variantOf = 'amx10p'; else delete s.variantOf;
  delete s.label; delete s.roster; delete s.publicVisualFallback; delete s.balancePeerOf;
  s.hp = upgraded ? 2300 : 2000;
  s.weightTons = upgraded ? 15 : 14.5;
  s.enginePowerHp = 260; s.topSpeedKmh = 65; s.reverseSpeedKmh = 22;
  s.hullTraverseDegS = 48; s.turretTraverseDegS = upgraded ? 52 : 45;
  s.gunElevationDeg = 45; s.gunDepressionDeg = 8; s.gunPitchDegS = 42;
  // Chassis remains 2.83 m wide; the owner's tier-X standoff kit defines a
  // wider fitted envelope, without scaling its hull or running gear.
  s.dims = { hullLengthM: 5.90, overallLengthM: 5.98, widthM: upgraded ? 3.50 : 2.83, heightM: upgraded ? 2.80 : 2.73 };
  s.gun = { ...s.gun, caliberMm: caliber, reloadS: reload, soundProfile: upgraded ? 'm242-bushmaster' : 'rh202',
    baseAccuracy: upgraded ? .24 : .29, aimTimeS: upgraded ? 1.05 : 1.25, muzzleBoreSegments: 24,
    shells: s.gun.shells.filter(round => !round.guided).map(round => ({
      ...round, soundProfile: upgraded ? 'm242-bushmaster' : 'rh202', name: `${upgraded ? 'M811' : 'M693'} ${round.type}`, caliberMm: caliber,
      reloadS: reload, count: round.type === 'HE' ? 180 : 300,
      dmg: round.type === 'HE' ? Math.round(damage * 1.15) : damage,
      velocityMps: round.type === 'HE' ? 1050 : 1350,
      pen100Mm: round.type === 'HE' ? 38 : penetration,
      pen1000Mm: round.type === 'HE' ? 38 : penetration - 20,
      pen2000Mm: round.type === 'HE' ? 38 : penetration - 40,
    })),
  };
  delete s.gun.launcherMuzzles; delete s.gun.launcherSalvo; delete s.gun.autoloader;
  delete s.gun.muzzles; delete s.gun.fixedLaunchCanisters;
  s.armor = modernArmor({
    hl: 2.95, hw: 1.415, inW: .90, floor: .40, trkTop: 1.09, roofY: 1.89,
    turretPivot: [upgraded ? 0 : -.28, 1.91, -.05],
    gunPivot: upgraded ? [.18, .48, .72] : [.22, .48, .45],
    barrelLenM: upgraded ? 2.10 : 2.37, barrelRadM: upgraded ? .043 : .034,
    glacis: [upgraded ? 40 : 30, 120, 160], lower: [25, 80, 100],
    side: [25, 70, 90], skirt: upgraded ? null : [8, 15, 30], rear: 20, roof: 20,
    tw: upgraded ? .80 : .65, tFrontZ: upgraded ? .87 : .57,
    tRearZ: upgraded ? -.89 : -.65, tH: upgraded ? .72 : .64,
    cheek: [upgraded ? 55 : 35, 150, 180], tSide: [30, 85, 110], tRear: 25, tRoof: 25,
    mantlet: [upgraded ? 60 : 40, 160, 195], loader: false,
  });
  if (upgraded) {
    // Match the corrugations and tapered ends exactly, leaving the lower
    // slat openings open instead of adding an invisible solid skirt there.
    for (const side of [-1, 1]) for (let station = 0; station < AMX10P25_SKIRT_STATIONS.length - 1; station++) {
      for (let corner = 0; corner < AMX10P25_SKIRT_CONTOUR.length - 1; corner++) {
        const vertices = [amx10p25SkirtPoint(side, station, corner),
          amx10p25SkirtPoint(side, station, corner + 1),
          amx10p25SkirtPoint(side, station + 1, corner + 1),
          amx10p25SkirtPoint(side, station + 1, corner)];
        if (side < 0) vertices.reverse();
        // Tapered corrugations need the same two triangles as the visual
        // loft: a four-point plane would bridge its non-planar end facets.
        for (const [triangle, indices] of [[0, [0, 1, 2]], [1, [0, 2, 3]]] as const) {
          const surface = plate(`skirt_${side < 0 ? 'L' : 'R'}_${station}_${corner}_${triangle}`,
            8, vertices[0], vertices[1], vertices[3], { kind: 'spaced', keMm: 15, ceMm: 30 });
          surface.verts = indices.map(index => vertices[index]);
          surface.convexPolygon = true;
          surface.surfaceGroup = `amx10p25:skirt:${side}`;
          s.armor.hullPlates.push(surface);
        }
      }
    }
  }
  s.visual = { ...s.visual, scheme: 'nato', base: '#46543b', weather: '#70725a',
    patches: ['#624d38', '#222822'], number: upgraded ? '225' : '110', trackWidthM: .40 };
  specs[id] = s;
}
registerFleetSpecs(registry, AMX10P_IDS, specs);
