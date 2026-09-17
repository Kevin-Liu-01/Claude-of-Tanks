# Turbo Ball physics — 2026-09-16

Owner: "make turbo ball much more fun. make an f button that just adds an upward vector so you go
flying. and in the whole game, ram damage in the whole game should scale with speed, and shells should
have more physics effects that knock you, but the implications in turbo ball are that you can aim behind
you and launch yourself and use it as a speed boost".

## What changed

- `sim/matchRuleset.ts`: `jumpMps` (Turbo Ball 9, else null), `recoilLaunchScale` (12 / 1),
  `shellKnockScale` (2.5 / 1); rule lines `jump`, `recoilLaunch`, `shellKnock` after
  `noCriticalDamage`. `sim/matchModes.ts` stamps `modeJumpMps` / `modeRecoilLaunchScale` /
  `modeShellKnockScale` on every entity with the gravity scale.
- `sim/movement.ts`: `requestTankJump(state, mps)` (grounded, upright, not already airborne → the ride
  gets the vertical velocity the way assisted self-righting launches it); `fireRecoil(..., launch)`
  turns the recoil into a real launch opposite the muzzle when the scale exceeds 1 (along-hull part
  → run speed, lateral → decaying translation, downward muzzle → lift); `shellKnockMps` and
  `applyShellKnock` for impact shoves — a decaying translation impulse (gain 2.2), an attitude rock and a lift
  for heavy shoves; the drivetrain speed is untouched (a first draft that added to the run speed collapsed the
  `tier9-rifled-peers` balance band to 0.08). Run speed is capped at 45 m/s by launches.
- `vehicles/balanceSimulation.ts`: the range duels set `modeShellKnockScale = 0` on both hulls so the reviewed
  balance bands keep measuring gunnery and armour.
- `game/state.ts` (solo) and `sim/authoritativeMatch.ts` (authority): shots pass the fired direction
  and the shooter's launch scale to `fireRecoil`; every tank hit (AP and HE) knocks the target;
  the SELF_RIGHT action bit jumps an upright hull when self-righting is not possible.
- `game/playerBattleActions.ts`: the F action tries self-right first, then the jump (`tank:jump`),
  through `requestTankJump` exported by the battle client runtime; `main.ts` wires the rule.
- `sim/damage.ts`: `RAM_MAX_TOTAL` 900 → 2400 so ram damage keeps scaling with closing speed.
- HUD: `.cot-jump` keycap ("Jump · F") toggled by `setPreBattleRules`; i18n `hud.jump` and the three
  rule lines in both catalogs.

## Receipts

`matchRuleset.selftest` (fields, rule-line order), `movement.selftest` (jump, launch, knock cases),
`playerBattleActions.selftest` (jump branch), `hudAmmunitionPresentation.selftest` (keycap pin),
`combat.selftest` (ram cap 2400, speed doubling quadruples the pool), plus the unchanged
authoritative, state, net and HUD receipts.
