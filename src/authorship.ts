export const PROJECT_CREATOR = 'Kevin B. Liu';
const PROJECT_CREATOR_URL = 'https://github.com/Kevin-Liu-01';
export const PROJECT_COPYRIGHT = 'Copyright © 2026 Kevin B. Liu';
export const PROJECT_PACKAGE_LICENSE = 'SEE LICENSE IN LICENSE-POLICY.md';
export const FIRST_PARTY_LICENSE = 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0';

interface FirstPartyVehicleAuthorship {
  creator: string;
  creatorUrl: string;
  copyright: string;
  license: string;
  geometry: 'first-party-procedural';
  runtimeExternalGeometry: false;
}

export const FIRST_PARTY_VEHICLE_AUTHORSHIP: Readonly<FirstPartyVehicleAuthorship> = Object.freeze({
  creator: PROJECT_CREATOR,
  creatorUrl: PROJECT_CREATOR_URL,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  geometry: 'first-party-procedural',
  runtimeExternalGeometry: false,
});

/** Inspectable model credit. No geometry, shaders, hidden instructions or tracking. */
export function vehicleProvenance(vehicleId: string) {
  return {
    ...FIRST_PARTY_VEHICLE_AUTHORSHIP,
    schema: 'cot-vehicle-provenance-v1',
    assetId: `urn:claude-of-tanks:vehicle:${encodeURIComponent(vehicleId)}`,
    policy: 'LICENSE-POLICY.md',
    attribution: 'docs/ATTRIBUTION.md',
    receipt: 'asset-provenance.json',
  };
}
