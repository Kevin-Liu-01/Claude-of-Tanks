/**
 * Multiplayer v2 sessions: the owner that composes a RoomClient, a seat token,
 * a MatchClient and a presentation for one round after another, plus the
 * headless composition the receipts and tools/mp-rooms-e2e.mjs drive.
 */
export { MatchSession } from './matchSession.ts';
export type { MatchSessionOptions, MatchSessionStats, SessionPhase, SessionPresentation, SessionRound } from './matchSession.ts';
export { createHeadlessSession, scriptedControls } from './headlessSession.ts';
export type { HeadlessSession, HeadlessSessionOptions } from './headlessSession.ts';
