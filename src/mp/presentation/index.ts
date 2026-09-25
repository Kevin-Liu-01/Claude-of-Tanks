/**
 * Multiplayer v2 presentation: the adapter contract, the binding to a
 * MatchClient, the recording adapter for headless runs, and the battle
 * presentation that drives the existing renderer, HUD, FX and audio.
 */
export { RecordingPresentation, bindMatchPresentation } from './adapter.ts';
export type { EventContext, PresentationAdapter, RecordedFrame, RecordedPose, RosterContext } from './adapter.ts';
export { createBattlePresentation } from './battlePresentation.ts';
export type {
  BattlePresentation, BattlePresentationOptions, EngineContext, EventBus, MatchActor, MatchShell, PresentationGameState, TankVisual,
} from './battlePresentation.ts';
export { createPredictionWorld } from './predictionWorld.ts';
export type { CollidableTank, PredictionObstacle, PredictionWorldOptions, WorldCollisionLike } from './predictionWorld.ts';
