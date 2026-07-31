# Handoff — SOUND overhaul (2026-07-31)

The comprehensive sound system landed in `src/audio/audio.js` +
`src/audio/voices.js` (see ARCHITECTURE.md §3.9 for the full contract, and
`node tools/audio-probe.mjs` for the auditable verification gate — recordings
under `shots/audio-probe/`). Everything hooks existing bus events; no
emitter-side changes were made to in-flight files. Two OPTIONAL 1-line
emitter patches would unlock deferred polish, for whoever owns those files:

1. **Garage tank-switch servo/clunk** (owner asked for "tank-switch
   servo/clunk"): `src/ui/garage.js` selection handler currently emits only
   the generic `ui:click`. Add alongside it:
   `emit('ui:tankSelect', { specId });`
   — then `src/audio/audio.js` `bindBus` can hook `ui:tankSelect` for a
   dedicated hydraulic clunk (audio-side handler is a 5-minute add; ping the
   SOUND agent or copy the `battleHorn()` wiring pattern).

2. **Sniper-view fire mix variant**: the player's shots already get a
   distinct mechanical layer (breech clank + brass). A per-mode mix (drier
   crack in sniper view) needs one extra field on the frame call in
   `src/main.js` step 8: `audio.update(dtR, _listenerPose, game.tanks)` →
   pass `rig.mode === 'SNIPER'` as a 4th arg (audio.update signature is
   backward-compatible; unknown args ignored today).

Also noted while probing (NOT audio, pre-existing on this tree): unhandled
`TypeError ... reading '_x'` in `src/vehicles/tankFactory.js:3875
syncFromState` (wheel-spin quaternion on a mid-swap rigid gear) spams the
console during battles — it is quarantined in tools/audio-probe.mjs's console
gate so the audio assertions stay meaningful; the tank-model owner should
clear it, after which the quarantine regex can be deleted.

Countdown ticks were in the original sound spec but the game has no
pre-battle countdown mechanic — N/A until such a mechanic exists.
