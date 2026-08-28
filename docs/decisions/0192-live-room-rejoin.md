# 0192 — Live private-room rejoin preserves the match protocol epoch

Status: accepted

## Decision

A private/LAN guest that reloads while a room is already `playing` immediately
re-enters the covered battle handoff. Match presentation accepts the durable
playing-room receipt for deterministic map and roster reconstruction, while
host start and rematch creation continue to require a `starting` receipt.

The returning browser keeps its stable player ID but establishes a new
page-session/RTC generation. If match authority has already welcomed that new
transport, `MatchClientRuntime.beginMatchHandshake()` preserves the established
protocol epoch instead of clearing connection state and sending a duplicate
HELLO. A normal waiting-to-start lobby remains unwelcomed and performs the
existing explicit lobby-to-match handshake.

## Why

Reload recovery previously restored signaling membership and the authoritative
seat, but the menu ignored `playing` receipts. After admitting that state, a
second race appeared: authority could welcome the returning peer before the
world handoff consumed the client. Resetting that valid epoch left the UI
offline even though the host retained an open, welcomed, ready peer and kept
streaming snapshots.

## Consequences

- Reloading during a live round restores the same room, identity, map, roster,
  and authority without exposing the garage or requiring a pasted code.
- Map/roster reconstruction cannot accidentally start a second authority;
  host creation still rejects any phase other than `starting`.
- The real-browser entry gate uses pristine profiles, enters an actual match,
  reloads the guest during `playing`, and requires connected battle recovery.
- The same gate retains covered cancellation: closing authority during a
  subsequent cold handoff unwinds to Garage and cannot publish late resources.

