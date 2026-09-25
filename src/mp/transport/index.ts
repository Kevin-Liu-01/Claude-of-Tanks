/**
 * Multiplayer v2 transport layer: the contract, the WebSocket implementation
 * and the deterministic loopback pair. See src/mp/README.md.
 */
export * from './transport.ts';
export { WebSocketTransport, resumeUrl } from './webSocketTransport.ts';
export type { SocketEvent, SocketFactory, SocketLike, WebSocketTransportOptions } from './webSocketTransport.ts';
export { LoopbackTransport, createLoopbackPair } from './loopbackTransport.ts';
export type { LinkImpairment, LinkStats, LoopbackPair, LoopbackPairOptions, LoopbackRole } from './loopbackTransport.ts';
