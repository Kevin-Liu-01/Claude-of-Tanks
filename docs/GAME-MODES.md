# Battle modes

Claude of Tanks composes multiple battle rules over the same fixed-step tank,
gunnery, armor, damage, spotting, bot, terrain, and network authority. A mode
does not replace combat: every objective keeps the complete vehicle simulation.

## Shipped rules

| Mode | Objective | Respawn | End condition |
| --- | --- | --- | --- |
| Standard Battle | Destroy the opposing force | No | Elimination or the battle clock |
| Capture the Flag | Carry the enemy flag to a home flag that has not been stolen | Yes, after 6 seconds | First team to 3 captures |
| Zone Control | Capture and hold three battlefield sectors | Yes, after 6 seconds | First team to 1,000 points |
| Turbo Ball | Drive or shoot the physical ball into the opposing goal with 1.85× mobility | Yes, after 6 seconds | First team to 5 goals |
| Endless Horde | A cooperative team survives increasingly numerous, durable, and mobile bot waves | No | The final human-controlled tank is destroyed |

Horde begins with three active enemies and adds one every second wave until it
reaches the room's enemy roster. Enemy hit points increase by 16% per wave and
mobility increases by 4.5% per wave, capped at 55%. Clearing a wave starts a
six-second intermission and places one deterministic floating cache. Repair
cache probability begins at 62%, falls by 5.5 percentage points per wave, and
never falls below 8%; the remaining caches replenish ammunition. At most 12
uncollected caches remain active, preventing an endless session from growing
scene or state cost without bound.

## Authority and determinism

`src/sim/matchModes.ts` is the renderer-free rules owner. It receives live
entities, a seed, terrain height, and explicit hooks for revival, visibility,
and events. It advances only from the caller's fixed 1/60-second step and does
not import the DOM, Three.js, transport code, wall clock, or `Math.random()`.

Solo composes the controller in `src/game/state.js`. Private and LAN authority
compose the same controller through `src/sim/authoritativeMatch.ts`. The room's
canonical `gameMode` is selected by the host, serialized with lobby state, and
handed into every rematch. Clients receive viewer-specific mode presentation
state alongside the ordinary authoritative snapshot.

The controller owns scores, capture progress, flags, the ball, goals, waves,
caches, respawn timers, mode-specific speed and ammunition, deterministic bot
objective points, and objective completion. Movement, shells, penetration,
damage, and tank contacts remain in the shared simulation. Turbo Ball therefore
accepts both hull impulse and shell impulse without introducing second physics.

## Presentation and performance

`src/game/matchModeWorldPresentation.ts` turns presentation state into retained,
shadow-free battlefield markers. It lazily creates only the geometry needed by
the current mode and reuses a fixed pool of 12 Horde cache markers. Standard
battles and the Garage hide the root and add no marker traversal or geometry.

The HUD presents one compact objective line beneath the score plate. Reliable
mode events drive capture, goal, wave, cache, and empty-ammunition feedback.
The lobby and Garage use the same dedicated icon vocabulary as the battle HUD.

## Verification

    node src/sim/matchModes.selftest.mjs
    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/sim/authoritativeMatch.selftest.mjs
    npm run typecheck
    npm test

The focused mode test covers standard-rule compatibility, flag captures,
respawns, the 1,000-point sector limit, armed ball impulse and scoring, Horde
wave growth, decreasing repair-cache probability, and finite ammunition.
