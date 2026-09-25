/**
 * Multiplayer v2 match layer: the MatchClient and the parts it composes.
 * Node-runnable throughout (no DOM, no renderer). See src/mp/README.md.
 */
export { MatchClient } from './matchClient.ts';
export type {
  MatchClientOptions, MatchClientStats, MatchFrame, OwnShotEvent, PredictionProvider, ViewerFrame,
} from './matchClient.ts';
export { ServerClock, TickClock, TimeUnwrapper, filteredOffsetMs } from './clock.ts';
export type { ClockSample, ServerClockOptions } from './clock.ts';
export { InputStream, NEUTRAL_CONTROL, seqNewer, seqNewerOrEqual } from './inputStream.ts';
export type { ControlSample, InputStreamOptions, InputStreamStats, PredictionControl } from './inputStream.ts';
export { SnapshotStream } from './snapshotStream.ts';
export type { SnapshotAccept, SnapshotStreamOptions, SnapshotStreamStats } from './snapshotStream.ts';
export { RemoteInterpolator, createEntitySample, decodeRow, hermite, lerpAngle, monotoneHermite } from './interpolation.ts';
export type {
  EntitySample, FrameMetaSample, FrameSample, InterpolatorOptions, InterpolatorStats, ShellSample,
} from './interpolation.ts';
export { DEFAULT_CORRECTION_POLICY, LocalPredictor } from './prediction.ts';
export type { CorrectionPolicy, PredictionAuthority, PredictionStats, PredictionWorld } from './prediction.ts';
export {
  MOVEMENT_CHECKPOINT_VALUES, MOVEMENT_CHECKPOINT_VERSION, applyMovementCheckpoint, captureMovementCheckpoint,
} from './movementCheckpoint.ts';
export type { MovementCheckpoint } from './movementCheckpoint.ts';
export { HEAVY_EVENT_KINDS, MAX_SHOT_AUTHORITY_AGE_MS, OwnShotPredictor, ReliableEventQueue } from './events.ts';
export type { PredictedShot, ReliableEventQueueStats, ShotAuthority } from './events.ts';
export { ConnectionRecovery } from './recovery.ts';
export type { ConnectionPhase, RecoveryInput, RecoveryOptions, RecoveryStep } from './recovery.ts';
export { HeadlessMatchClientDriver } from './headlessDriver.ts';
export type { GateMetrics, HeadlessDriverOptions } from './headlessDriver.ts';
