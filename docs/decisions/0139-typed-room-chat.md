# 0139: Room chat has one typed input and DOM owner

## Status

Accepted — 2026-08-28

## Decision

`src/ui/roomChat.ts` owns private/LAN battle-chat parsing, keyboard capture,
pointer-lock restoration, bounded message history, and DOM lifetime. Network
messages enter as unknown data and are normalized before any class, dataset,
or text node is written.

The feature remains a multiplayer-only dynamic chunk. It shares no state with
solo battle and never enters pristine Garage boot.

## Consequences

- Invalid message identities and team names cannot pollute UI state.
- The room coordinator consumes the exported controller/options contract.
- Chat stays bounded at 48 rows and retains identical desktop/touch visuals.
