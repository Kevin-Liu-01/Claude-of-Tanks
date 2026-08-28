# 0189 — Private-room entry and lobby presentation are strict TypeScript

Status: accepted

## Decision

Solo/private/LAN/ranked mode selection, room create/join, named invite state,
ICE acquisition, lobby rendering, ready/team/map controls, retained-room
reattachment, and ranked queue presentation are owned by
`src/ui/playMenu.ts` behind explicit menu, lobby, session, and active-room
contracts.

Every required DOM node is resolved once during construction. The menu keeps
one typed acquisition session until it hands transport ownership to the active
network-room coordinator.

## Why

This boundary receives untrusted URL state, persisted browser identity,
signaling responses, ICE configuration, lobby snapshots, dynamic ranked
service results, and callbacks into battle startup. In JavaScript, a missing
node, malformed active-room adapter, stale nullable session, or unexpected
service field could fail only after a player had already begun joining.

## Consequences

- Existing layout, copy, icons, animation, room flow, endpoints, and gameplay
  behavior remain unchanged.
- Required markup fails at menu construction rather than during a later room
  state update.
- Host and client command channels are narrowed before use, and a missing
  handoff session cannot open a battle with partial state.
- Invite, room mode, game mode, team, map, player, ICE, queue, and retained-room
  states no longer collapse into implicit nullable values.
- Ranked response fields are converted to presentation text at one boundary.
- Strict typecheck, battle-module retry, play-surface, cold host/join,
  invitation, responsive-layout, production-build, and import-integrity gates
  certify the migration.
