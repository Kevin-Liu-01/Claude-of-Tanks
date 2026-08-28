import type { ArmorEnvelope, ShellSpec } from './specHelpers.ts';

export interface AimBloom {
  readonly move: number;
  readonly hullRot: number;
  readonly turret: number;
  readonly afterShot: number;
}

export interface TerrainResistance {
  readonly hard: number;
  readonly medium: number;
  readonly soft: number;
}

export interface HydropneumaticAim {
  readonly noseDownDeg: number;
  readonly noseUpDeg: number;
  readonly rateDegS: number;
  readonly compressionM: number;
  readonly droopM: number;
}

export interface FleetGunSpec extends Record<string, unknown> {
  readonly caliberMm: number;
  readonly reloadS: number;
  readonly baseAccuracy: number;
  readonly aimTimeS: number;
  readonly bloom: AimBloom;
  readonly shells: ShellSpec[];
}

export interface FleetDimensions extends Record<string, unknown> {
  readonly hullLengthM: number;
  readonly overallLengthM: number;
  readonly widthM: number;
  readonly heightM: number;
}

export interface FleetVisualSpec extends Record<string, unknown> {
  readonly scheme: string;
  readonly base: string;
  readonly weather: string;
  readonly patches: string[];
  readonly marking: string;
  readonly number: string;
  readonly trackWidthM: number;
  readonly camoScale: number;
}

/** Combat-authoritative fields shared by every registered fleet row. Family
 * packs may append identity-specific metadata through the extension record. */
export interface FleetTankSpec extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly nation: string;
  readonly era: string;
  readonly role: string;
  readonly hp: number;
  readonly enginePowerHp: number;
  readonly weightTons: number;
  readonly topSpeedKmh: number;
  readonly reverseSpeedKmh: number;
  readonly hullTraverseDegS: number;
  readonly terrainResistance: TerrainResistance;
  readonly pivotStyle: string;
  readonly turretTraverseDegS: number;
  readonly gunPitchDegS: number;
  readonly gunElevationDeg: number;
  readonly gunDepressionDeg: number;
  readonly hydropneumaticAim?: HydropneumaticAim;
  readonly gun: FleetGunSpec;
  readonly dims: FleetDimensions;
  readonly armor: ArmorEnvelope;
  readonly visual: FleetVisualSpec;
}

export interface ModelSourceRecord extends Record<string, unknown> {
  readonly source: string;
}

export type TankSpecRegistry = Record<string, FleetTankSpec>;
export type ModelSourceRegistry = Record<string, ModelSourceRecord>;
