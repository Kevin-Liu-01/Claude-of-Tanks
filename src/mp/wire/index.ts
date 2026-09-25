/**
 * Multiplayer v2 wire: the one schema the browser client (src/mp) and the
 * match server (server/match) share. Pure TypeScript, no DOM, no three.
 * See README.md for the byte layouts and the contract the client must keep.
 */
export * from './constants.ts';
export * from './messages.ts';
export * from './quantize.ts';
export { ByteReader, ByteWriter, WireError, toUint8Array } from './bytes.ts';
export type { WireErrorCode } from './bytes.ts';
export {
  applyEntityRowPatch, cloneEntityRow, diffEntityRow, packStatus, readEntityRowPatch, readIndexList,
  writeEntityRowPatch, writeIndexList, zeroEntityRow,
} from './rows.ts';
export {
  applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage, peekMessageType,
  shellTypeIndex, shellTypeName,
} from './codec.ts';
export type { DecodeOptions, DecodeResult } from './codec.ts';
export { eraPlateIndices, eraPlateNames } from './era.ts';
