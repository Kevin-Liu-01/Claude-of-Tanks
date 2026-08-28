import type { ArmorEnvelope, ShellSpec } from './specHelpers.ts';

export interface AimBloom {
  move: number;
  hullRot: number;
  turret: number;
  afterShot: number;
}

export interface TerrainResistance {
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

export interface FleetGunSpec extends Record<string, unknown> {
  caliberMm: number;
  reloadS: number;
  baseAccuracy: number;
  aimTimeS: number;
  bloom: AimBloom;
  shells: ShellSpec[];
}

export interface FleetDimensions extends Record<string, unknown> {
  hullLengthM: number;
  overallLengthM: number;
  widthM: number;
  heightM: number;
}

export interface FleetVisualSpec extends Record<string, unknown> {
  scheme: string;
  base: string;
  weather: string;
  patches: string[];
  marking: string;
  number: string;
  trackWidthM: number;
  camoScale: number;
}

/** Combat-authoritative fields shared by every registered fleet row. Family
 * packs may append identity-specific metadata through the extension record. */
export interface FleetTankSpec extends Record<string, unknown> {
  id: string;
  name: string;
  nation: string;
  era: string;
  role: string;
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

export interface ModelSourceRecord extends Record<string, unknown> {
  readonly source: string;
}

export type TankSpecRegistry = Record<string, FleetTankSpec>;
export type ModelSourceRegistry = Record<string, ModelSourceRecord>;
