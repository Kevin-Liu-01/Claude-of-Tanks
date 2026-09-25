/**
 * Multiplayer v2 rooms: the protocol every host speaks, the pure policy, the
 * transport-independent actor (hosted by cloudflare/rooms and server/rooms)
 * and the browser/headless RoomClient. See src/mp/README.md "Rooms and sessions".
 */
export * from './protocol.ts';
export {
  activePlayers, applyRoomCommand, assignAdmin, canStart, countTeam, createRoom, defaultRoomSettings, finishMatch, isCoopGameMode,
  joinRoom, markMatchPlaying, migrateAdminIfAbsent, planStart, recordMatch, removePlayer, roomToLobby, seniorPlayer, serializeRoom,
  setPlayerConnected, abortStart, assertStartable, autoTeam, requirePlayer,
} from './roomPolicy.ts';
export type { CreateRoomOptions, JoinRoomOptions, RoomCommand, RoomPolicyGuards, RoomStartPlan } from './roomPolicy.ts';
export { RoomActor } from './roomActor.ts';
export type { MatchHost, MatchHostStartConfig, MatchHostStatus, RoomActorPorts, RoomActorState, RoomSocketRecord } from './roomActor.ts';
export { RoomClient, resolveRoomRelativeUrl } from './roomClient.ts';
export type { RoomClientOptions, RoomClientPhase, RoomCreateRequest, RoomJoinRequest, StorageLike } from './roomClient.ts';
