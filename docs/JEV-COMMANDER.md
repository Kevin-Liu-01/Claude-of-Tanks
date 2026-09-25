# Jev commander — bots ordered by TypeSafe's System One model

Owner 2026-09-25: *"enable playing with tanks controlled by jev, a system one awesome model … basically
we can have an option to play jev controlled models."*

Jev is TypeSafe's System One model. It does not write text: it answers typed questions — a **Choice**
over options, a yes/no **Noul**, a **Score** over ordered levels — about a JSON state, with calibrated
probabilities, in a few hundred milliseconds. That shape fits a tank commander exactly: the game keeps
every rule, every gun lay and every metre of driving in code (the classic controller in `src/game/ai.ts`),
and asks Jev the judgement calls a commander makes — *what posture, which enemy, fire or hold, how much
danger, which objective* — a few times a minute per team. The answers become **standing orders** the
classic controller executes and that expire on their own, so the battle never waits on the network.

| Piece | File | Receipt |
| --- | --- | --- |
| Wire protocol: the team document, its validation, the question builder, the answer parser | `src/game/jevProtocol.ts` | both below |
| Proxy: the Vercel function that holds the key and builds the questions | `api/jev.ts` | `server/jev.selftest.mjs` |
| Commander: document per team, fan-out request, gating, orders, fallback, budget, order log | `src/game/jevCommander.ts` | `src/game/jevCommander.selftest.mjs` |
| Orders in the classic brain: `setOrder()`, every read gated on a live order | `src/game/ai.ts` | `src/game/ai.selftest.mjs` (unchanged, green) |
| Setting, solo wiring, HUD tag, after-action line | `src/game/teamArrangement.ts`, `src/game/state.ts`, `src/ui/playMenu.ts`, `src/ui/hud.ts`, `src/ui/endScreen.ts`, `src/ui/shotInfo.ts` | `src/game/teamArrangement.selftest.mjs` |
| Local dev proxy | `server/jev/main.ts` (`npm run jev:dev`) | — |

`npm run test:jev` runs the two Jev receipts; both are registered in `tools/selftest-suites.mjs`.

## The option

Play menu → below the team arrangement → **Opponent brain: Classic / Jev (System One)**, with **Allies too**
for the allied bots. One solo setting for every mode with bots, the campaign included
(`cot.game.brain.v1`, `game/teamArrangement.ts readBrainSettings / writeBrainSettings`; Classic by default).
Rooms keep the classic brain on the host for now (the section is hidden in a lobby).

When Jev is on, every bot it commands carries a small **JEV** tag beside its vehicle name in the HUD
roster ears (`entity.brain === 'jev'`), and the after-action report's meta strip says *Enemy brain: Jev
(System One)* (and *Allied brain* when the allies were Jev's too). The `battle:ended` payload carries
`brains` and the commander's tallies (`jev`).

## Flow

```
game/state.ts simStep                       api/jev.ts (Vercel)              api.typesafe.ai
  every step: jev.step(view) ───────┐
    due? build team document ───────┼──> POST /api/jev {v, sid, kind, state}
                                    │       validate (bounds, references, no PII)
                                    │       questions = buildJevQuestions(state)   ← server-side
                                    │       POST /v1/systemone {state, model: jev-latest, questions}
                                    │         Authorization: Bearer TYPESAFE_API_KEY (never leaves the function)
                                    │     <─ {answers, usage}
    arrived? gate + apply orders <──┘     {v, model, answers, usage, latencyMs}
    controllers update (orders or classic)
```

One request per **team** every `cadenceS` = 2 s while the team has contact, every 8 s while it sees no
enemy and nothing on the objectives changed (`quietCadenceS`). All of a team's bots ride one request
(speculative fan-out): the commander consumes only the answers the battle still needs.

## The team document (`JevBattleState`, v1)

Text only, from the team's own point of view, never a coordinate, an entity id, a nickname or a room code
(the proxy refuses any field named like one). Bots are labelled `b1…` in id order, enemies `e1…`; only
enemies the team has **spotted** are in it (`spotting.isSpotted(id, team)`), so the commander never learns
what the spotting sim hides.

```json
{
  "v": 1,
  "battle": {
    "mode": "zone_control", "goal": "capture and hold the three zones; first team to 750 points wins",
    "elapsed_s": 245, "remaining_s": 655, "score": { "ours": 120, "theirs": 90, "target": 750 },
    "alive": { "ours": 4, "theirs": 3 },
    "human_ally": { "vehicle": "M1A1 Abrams HC", "hp": 1, "distance_m": 20, "bearing": "N" }
  },
  "our_tanks": {
    "b1": { "vehicle": "Leopard 2A4", "class": "main battle tank", "role": "flanker", "hp": 0.62, "ammo": 0.4,
            "gun": "ready", "moving": true, "under_fire": true, "modules_damaged": ["engine"],
            "sees": [{ "id": "e2", "m": 300 }, { "id": "e1", "m": 330 }], "nearest_ally_m": 30,
            "objective": { "bearing": "N", "distance_m": 150 }, "current_target": "e2", "current_stance": "engage" }
  },
  "enemies": {
    "e1": { "vehicle": "KV-2", "class": "heavy tank", "human_player": false, "hp": 0.8, "distance_m": 330,
            "bearing": "N", "facing": "side-on", "moving": false, "on_objective": false,
            "seen_by": ["b1", "b2", "b3"], "engaged_by": ["b1"] }
  },
  "objectives": {
    "zone_a": { "kind": "zone", "owner": "theirs", "contested": true, "distance_m": 160, "bearing": "N" }
  }
}
```

`gun` is `ready`, `reloading N s` or `empty`; `under_fire` is a hull that lost hit points since the previous
document; `sees` is the four nearest spotted enemies within 650 m of that bot; distances are rounded to
10 m, bearings are compass words from the bot (its own rows) or from the team centroid (enemies,
objectives, the human ally). The allied view names the human player as `human_ally` (it takes no orders);
the enemy view lists it under `enemies` with `human_player: true`. Objectives: `zone_a…` / `sector_1…`
(zones and Frontline sectors with their holder and contest), `flag_ours` / `flag_theirs`, `ball`,
`goal_theirs`. Bounds (`JEV_LIMITS`): 20 bots, 24 enemies, 8 objectives, 32 KB body.

## The questions (built by the proxy, `buildJevQuestions`)

Per bot `bN`:

- `posture_bN` — **Choice** over `hold | push | flank_left | flank_right | retreat | capture | support`, each
  with a one-line rubric ("Close on its target or the nearest enemy at full throttle: the enemy is weak,
  isolated, reloading, or outnumbered there").
- `threat_bN` — **Score** over four levels: safe / pressured / in danger / about to die.
- `target_bN` — **Choice** over exactly the enemies that bot `sees` plus `none` (only when it sees one).
- `fire_bN` — **Noul**: fire as soon as the gun is laid, or hold the round (only when it sees one).

Per team, when the mode has objectives: `focus` — **Choice** over the objective ids plus
`fight_where_we_stand`.

Questions reference state rows by backticked path (`` `our_tanks.b1` ``, `` `enemies.e1` ``) as the
TypeSafe guide asks; ids are for code and are never sent to the model in a meaningful form.

## Orders and gating (`jevCommander.ts` → `ai.ts setOrder`)

An answer set is applied when it arrives (the next sim step), per bot, only if:

- it is not **stale** (issued more than `staleAfterS` = 6 s of sim time ago → the whole set is discarded);
- the bot is still **alive** and commanded;
- the hull did not lose more than 35 % of its hit points since the request (**changed**);
- the posture is a known one with **confidence ≥ 0.45**; a `capture` with no objective anywhere or a
  `support` with no living teammate is **unmapped** and keeps the classic decision.

The order is `{ posture, targetId, fire, threat, point, untilS }`:

| Order part | From | Effect in the classic brain (all gated on a live order; nothing changes without one) |
| --- | --- | --- |
| `targetId` | `target_bN` choice ≥ 0.4, not `none`, the enemy alive and still spotted | claimed right after the return-fire lock on the player, before the classic ranking; no line of sight → the vantage search moves the hull |
| `hold` | posture | hold band × 1.35, cover discipline × 1.25 |
| `push` | posture | hold band × 0.55, `pressUntilS` (the stalemate-push machinery: no reload cover, the outnumbered guard yields), closes at full throttle beyond the band |
| `flank_left` / `flank_right` | posture | `startFlank` on the named side (left = the bot's left while facing the target) |
| `retreat` | posture | the low-health fallback's own machinery toward the nearest support (or away from the target) |
| `capture` | posture + the `focus` objective (or the bot's own mode objective) | routes to the point; with a target beyond the hold band it drives to the point and fights from there |
| `support` | posture | routes to the weakest living teammate the same way |
| `fire` | `fire_bN` ≥ 0.7 → `press`, ≤ 0.3 → `hold` | `press` takes every ready lay; `hold` wants an expected hit chance of at least 0.7 |
| `threat` | `threat_bN` score | ≥ 2.5 raises the cover discipline × 1.3 |

Every order expires at `untilS` = issue + `orderTtlS` (5 s); the classic brain resumes by itself. That is
the fallback for everything: a slow proxy, a failed request (the commander backs off, doubling from one
cadence to 30 s, or what the proxy's `retryAfterMs` asks), an exhausted budget (`requestsPerTeam` = 450 per
battle), a low-confidence answer. The commander keeps a bounded **order log** (64 entries: bot, posture,
target, fire, threat, confidence, applied / reason) and per-team **stats** (requests, answered, failed,
orders applied, discards by reason, tokens, latency, back-off) — `window.__DEBUG.game.jev` in a QA boot.

## The proxy (`api/jev.ts`)

- `POST /api/jev` only; origin allow-list (the official origins + `COT_ALLOWED_ORIGINS`; the dev wrapper
  also accepts `http://localhost:*`); CORS headers only for an allowed origin.
- `TYPESAFE_API_KEY` from the environment (production: the server-only Vercel variable; never `VITE_`);
  missing → `503 not_configured` and the commander falls back.
- Body ≤ 32 KB, strict validation (`validateJevRequest`: bounds, resolved references, `pii_field:*`
  refusals for names, addresses, room codes, `x`/`z`/`pos`); unknown fields are dropped.
- Guards, in process memory like the telemetry sink: a per-address token bucket (120 burst, 3/s), a
  per-session bucket (40 burst, 1.5/s), a per-session budget of 12,000 requests (one page load's battle
  series), a global ceiling of 900 requests per minute (TypeSafe publishes 1,200 per key).
- Upstream call with a 2.5 s timeout. Mapping: 401 → `502 upstream_auth`, 422 → `502 upstream_invalid`,
  429 → `429 upstream_rate_limited`, 529 → `503 upstream_overloaded`, timeout → `504 upstream_timeout`,
  network → `502 upstream_unreachable`. A 429/529 starts a **cool-down** (1 s doubling to 30 s) during which
  the proxy answers `503 cooling_down` without calling upstream; a success resets it.
- Reply: `{ v, model, answers, usage: { input_tokens, output_tokens }, latencyMs }`; malformed upstream
  answers are dropped, never forwarded.
- One structured log line per call (`tag: cot-jev`: counts, status, upstream status, latency, tokens,
  the session's request ordinal) — never the key, the session id, an address or the document.

## Cost and latency (measured 2026-09-25, `jev-1.13.0`, `.qa-dev/jev-measure.mjs`)

| Team document | Questions | Input tokens | Output tokens | Latency |
| --- | --- | --- | --- | --- |
| 7 bots, 6 spotted enemies, 3 zones (7 v 7) | 27 | 8,004 | 1,075 | 143–585 ms (typ. ~200) |
| 14 bots, 13 spotted enemies, 3 zones (14 v 14) | 57 | 16,817 | 2,334 | 170–225 ms |

TypeSafe prices Jev at $0.042 per million **input** tokens; output tokens are free. Per request that is
$0.00034 (7 v 7) and $0.00071 (14 v 14). A 15-minute battle at the full cadence (one request per team per
2 s, both teams Jev's, contact the whole time — the worst case; the quiet cadence and the end of the battle
cut it) is 900 requests: **≈ $0.30 for 7 v 7, ≈ $0.64 for 14 v 14**; enemy-only halves it. The
per-battle budget caps a team at 450 requests. The end-to-end production path (real `api/jev.ts` handler
against the live upstream) answered in 126–200 ms with the key nowhere in the reply or the log.

## Dev path

The Vite dev server has no function runtime. `npm run jev:dev` starts `server/jev/main.ts` on
`http://127.0.0.1:8794/api/jev` with the key from the environment (`set -a; source …/typesafe.env; set +a`
in that shell — never a file in the repository); `vite.config.ts` forwards the same-origin `/api/jev` route
to it (`COT_JEV_DEV_URL` to point elsewhere), and `VITE_JEV_URL` overrides the route entirely. With the
proxy down a battle simply plays on the classic brain. `.qa-dev/jev-battle-probe.mjs` (untracked) plays a
real-time headless battle with Jev on or off and records the commander's tallies.

## Privacy

The document never carries a player name, a room code, an address, an entity id or a raw coordinate; the
human player is "the human player"; the session id is an opaque per-page token used only for the proxy's
budget. The proxy logs counts, never content. Nothing about the battle is retained server-side.

## What is left

- **Multiplayer v2**: the commander is transport-independent and `JevBattleView` is an interface — the
  authoritative match (`src/sim/authoritativeMatch.ts`, `server/match`) can step one per team with a
  server-side transport that calls TypeSafe directly; rooms keep the classic brain until then.
- **Tuning**: cadence, thresholds (`minPostureConfidence` 0.45, `minTargetConfidence` 0.4, fire 0.7 / 0.3,
  threat 2.5), the hold-band factors and the question rubrics are all first drafts; evaluate them on
  played battles (the order log tells which postures Jev picks and how often they are refused).
- **Tokens**: the state is now most of the request; a per-bot `sees` of four enemies and 20-bot teams
  are the bounds; a further trim would drop the repeated posture rubric into the state.
