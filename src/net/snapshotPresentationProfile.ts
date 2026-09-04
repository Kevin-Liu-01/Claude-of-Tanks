export interface SnapshotPresentationProfile {
  readonly interpolationDelayMs: number;
  readonly maxInterpolationDelayMs: number;
  readonly maxExtrapolationMs: number;
}

const LOOPBACK_PROFILE = Object.freeze({
  interpolationDelayMs: 50,
  maxInterpolationDelayMs: 120,
  maxExtrapolationMs: 250,
});

const LAN_PROFILE = Object.freeze({
  interpolationDelayMs: 65,
  maxInterpolationDelayMs: 180,
  maxExtrapolationMs: 250,
});

const PRIVATE_PROFILE = Object.freeze({
  interpolationDelayMs: 85,
  maxInterpolationDelayMs: 220,
  maxExtrapolationMs: 250,
});

/**
 * Direct peer rooms can present closer to authority than a relay/server path.
 * The adaptive buffer still grows under real jitter, while a stable same-LAN
 * connection carries only a little more than one 20 Hz snapshot interval.
 */
export function snapshotPresentationProfile(
  roomMode: string | null | undefined,
  { loopback = false }: { loopback?: boolean } = {},
): SnapshotPresentationProfile {
  if (loopback) return LOOPBACK_PROFILE;
  return roomMode === 'lan' ? LAN_PROFILE : PRIVATE_PROFILE;
}
