// Historical first-party preservation is deliberately distinct from source
// fidelity. This narrow allowlist cannot opt another rebuilt model out of its
// published-dimension or source comparison requirements.
export const REVOLUTION_PROTO_BASELINE = Object.freeze({
  sourceCommit: 'da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b',
  sourceId: 'leo2_revolution',
  glbSha256: 'ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7',
  geometrySha256: '305ff0250dea38d45a53738d775686727300440890467023e5fb7e8e94711f38',
});

export interface PreservationSource {
  readonly comparisonPurpose?: string;
  readonly qualityBar?: string;
  readonly preservation?: typeof REVOLUTION_PROTO_BASELINE;
}

export function validatedPreservationOracle(source: PreservationSource | null | undefined, id: string) {
  if (source?.comparisonPurpose !== 'preservation') {
    if (source?.qualityBar === 'preservation') throw new Error('Preservation quality bar requires an immutable baseline');
    return null;
  }
  if (id !== 'leo2_revolution_proto' || source.qualityBar !== 'preservation'
    || !source.preservation || Object.entries(REVOLUTION_PROTO_BASELINE)
      .some(([key, value]) => source.preservation?.[key as keyof typeof REVOLUTION_PROTO_BASELINE] !== value)) {
    throw new Error(`${id}: invalid or unpinned historical preservation baseline`);
  }
  return REVOLUTION_PROTO_BASELINE;
}

export function preservationDimensionTargets<T>(source: PreservationSource | null | undefined,
  id: string, frozenReferenceMeasurements: T, publishedDimensions: T): T {
  return validatedPreservationOracle(source, id) ? frozenReferenceMeasurements : publishedDimensions;
}

export async function verifyPreservationBytes(bytes: ArrayBuffer, expected: typeof REVOLUTION_PROTO_BASELINE) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected.glbSha256) throw new Error('Historical preservation GLB hash mismatch; baseline must not be regenerated from the candidate');
}
