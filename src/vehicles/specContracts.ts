import type { ArmorEnvelope, ShellSpec } from './specHelpers.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

export interface AimBloom {
  move: number;
  hullRot: number;
  turret: number;
  afterShot: number;
}

export interface TerrainResistance extends Record<string, number> {
  hard: number;
  medium: number;
  soft: number;
}

export interface HydropneumaticAim {
  noseDownDeg: number;
  noseUpDeg: number;
  rateDegS: number;
  compressionM: number;
  droopM: number;
}

export interface AutoloaderSpec {
  magazineSize: number;
  intraClipS: number;
  fullReloadS?: number;
}

export interface FleetGunSpec extends Record<string, RuntimeValue> {
  autoloader?: AutoloaderSpec;
  /** Visual-only radial tessellation for unusually small cannon mouths. */
  muzzleBoreSegments?: number;
  caliberMm: number;
  reloadS: number;
  baseAccuracy: number;
  aimTimeS: number;
  bloom: AimBloom;
  shells: ShellSpec[];
}

export interface FleetDimensions extends Record<string, RuntimeValue> {
  hullLengthM: number;
  overallLengthM: number;
  widthM: number;
  heightM: number;
}

export interface FleetVisualSpec extends Record<string, RuntimeValue> {
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  marking: string;
  number: string;
  trackWidthM: number;
  /** Optional authoring override; painters retain their established family
   * default when omitted. */
  camoScale?: number;
}

/** Combat-authoritative fields shared by every registered fleet row. Family
 * packs may append identity-specific metadata through the extension record. */
export interface FleetTankSpec extends Record<string, RuntimeValue> {
  id: string;
  name: string;
  nation: string;
  era: string;
  role: string;
  /** A separately modeled but combat-equivalent row must not give its donor
   * a second vote in peer medians. The audit verifies equality, not this hint. */
  balancePeerOf?: string;
  hp: number;
  enginePowerHp: number;
  weightTons: number;
  topSpeedKmh: number;
  reverseSpeedKmh: number;
  hullTraverseDegS: number;
  terrainResistance: TerrainResistance;
  pivotStyle: string;
  turretTraverseDegS: number;
  gunPitchDegS: number;
  gunElevationDeg: number;
  gunDepressionDeg: number;
  hydropneumaticAim?: HydropneumaticAim;
  gun: FleetGunSpec;
  dims: FleetDimensions;
  armor: ArmorEnvelope;
  visual: FleetVisualSpec;
}

export interface ModelSourceRecord extends Record<string, RuntimeValue> {
  readonly source: string;
}

export type TankSpecRegistry = Record<string, FleetTankSpec>;
export type ModelSourceRegistry = Record<string, ModelSourceRecord>;
