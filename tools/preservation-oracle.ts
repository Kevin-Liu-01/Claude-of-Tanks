// Historical first-party preservation is deliberately distinct from source
// fidelity. This narrow allowlist cannot opt another rebuilt model out of its
// published-dimension or source comparison requirements.
export const REVOLUTION_PROTO_BASELINE = Object.freeze({
  sourceCommit: 'da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b',
  sourceId: 'leo2_revolution',
  glbSha256: 'ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7',
  geometrySha256: '305ff0250dea38d45a53738d775686727300440890467023e5fb7e8e94711f38',
});

// Retired historical record: the later owner missile-concept request supersedes this turret target.
// Owner 2026-09-19 initially requested the pre-547457932 ZTZ-100 as a separate model.
// Exported by export-first-party-preservation.mjs from a clean detached 31d08
// checkout, not from the restored prototype candidate or the newer source GLB.
export const ZTZ100_PROTOTYPE_BASELINE = Object.freeze({
  sourceCommit: '31d08f67378cd2bc5b883de3e0eba10513784612',
  sourceId: 'ztz100_x',
  glbSha256: 'ffbc0a0709328f693597054cfe048fcc0d7e289f720d9c777ffaf585722e86b6',
  geometrySha256: '50d6b799d51ab196f9991dba5ba390daae3849fc2de72205f027583cd1dd0f7a',
});

interface PreservationBaseline {
  readonly sourceCommit: string;
  readonly sourceId: string;
  readonly glbSha256: string;
  readonly geometrySha256: string;
}
const PRESERVATION_BASELINES: Readonly<Record<string, PreservationBaseline>> = Object.freeze({
  leo2_revolution_proto: REVOLUTION_PROTO_BASELINE,
});

export interface PreservationSource {
  readonly comparisonPurpose?: string;
  readonly qualityBar?: string;
  readonly preservation?: PreservationBaseline;
}

export function validatedPreservationOracle(source: PreservationSource | null | undefined, id: string) {
  if (source?.comparisonPurpose !== 'preservation') {
    if (source?.qualityBar === 'preservation') throw new Error('Preservation quality bar requires an immutable baseline');
    return null;
  }
  const baseline = Object.hasOwn(PRESERVATION_BASELINES, id) ? PRESERVATION_BASELINES[id] : null;
  if (!baseline || source.qualityBar !== 'preservation'
    || !source.preservation || Object.entries(baseline)
      .some(([key, value]) => source.preservation?.[key as keyof PreservationBaseline] !== value)) {
    throw new Error(`${id}: invalid or unpinned historical preservation baseline`);
  }
  return baseline;
}

export function preservationDimensionTargets<T>(source: PreservationSource | null | undefined,
  id: string, frozenReferenceMeasurements: T, publishedDimensions: T): T {
  return validatedPreservationOracle(source, id) ? frozenReferenceMeasurements : publishedDimensions;
}

export async function verifyPreservationBytes(bytes: ArrayBuffer, expected: PreservationBaseline) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected.glbSha256) throw new Error('Historical preservation GLB hash mismatch; baseline must not be regenerated from the candidate');
}
