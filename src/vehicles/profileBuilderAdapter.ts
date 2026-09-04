import type { RuntimeValue } from '../runtimeTypes.ts';

export type ProfileBuilderPort = RuntimeValue;

export type AuthoredProfileBuilder = (
  builder: ProfileBuilderPort,
  profile: VehicleProfile,
) => void;

export interface VehicleProfile extends Record<string, RuntimeValue> {
  readonly build?: RuntimeValue;
  readonly base?: RuntimeValue;
}

export type VehicleProfileRecord = Record<string, VehicleProfile>;
export type ProfileBuilder = (builder: ProfileBuilderPort) => void;

export interface ProfileBuildFunctions {
  buildDonorVariant(builder: ProfileBuilderPort, profile: VehicleProfile): void;
  buildProfile(builder: ProfileBuilderPort, profile: VehicleProfile): void;
}

/** Convert authored profile records into the factory's one-argument builder
 * ports. Custom construction wins over donor variants, which win over the
 * generic profile builder. */
export function createProfileBuilders(
  profiles: VehicleProfileRecord,
  functions: ProfileBuildFunctions,
): Record<string, ProfileBuilder> {
  const { buildDonorVariant, buildProfile } = functions;
  return Object.fromEntries(Object.entries(profiles).map(([id, profile]) => {
    if (profile.build !== undefined && typeof profile.build !== 'function') {
      throw new TypeError(`Profile builder ${id} must be a function`);
    }
    const custom = profile.build as AuthoredProfileBuilder | undefined;
    return [
      id,
      (builder: ProfileBuilderPort) => (
        custom
          ? custom(builder, profile)
          : profile.base
            ? buildDonorVariant(builder, profile)
            : buildProfile(builder, profile)
      ),
    ];
  }));
}
