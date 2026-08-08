# Leopard RCWS restore — independent re-cert verdict

Date: 2026-08-08

Scope: §5.73-3 / §5.76, `leo2a4` + `leopard2_proto`

Evidence: `shots/critic-leo-rcws/` (fresh 35-sheet batteries per changed
tank; unchanged-family garage controls for leo2a5/leo2a6)

Authoritative clean-HEAD hashes: `leo2a4 41587e99`,
`leopard2_proto a9aba192`; guards `leo2a5 e215a738`, `leo2a6 09912270`,
`kf51 9ac547ac`, `leo2_revolution db70c929`.

## Verdict

| id | front | fl | left | rl | rear | rr | right | fr | top | hero-fl | hero-rr | hero-top | close-front | close-roof | floor | mean |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| leo2a4 | 9.2 | 9.3 | 9.1 | 9.1 | 9.1 | 9.1 | 9.2 | 9.3 | 9.2 | 9.3 | 9.1 | 9.2 | 9.2 | 9.3 | **9.1** | **9.21** |
| leopard2_proto | 9.1 | 9.2 | 9.1 | 9.0 | 9.0 | 9.0 | 9.1 | 9.2 | 9.1 | 9.2 | 9.0 | 9.1 | 9.1 | 9.0 | **9.0** | **9.09** |

**PASS x2.** Both tanks remain at or above the 9.0 bar in every fresh
view. The §5.55 source-fidelity identities survive, while the restored
stations satisfy the newer owner override.

## Changed-read adjudication

- `leo2a4`: the FLW-200 has a powered slew base, pedestal, armored gun
  trough and shields, forward M2, gun-left ammo, optics/LRF pod, and
  connected cable/conduit. It is large at garage range without hiding the
  blunt-brick turret or EMES-15. The 3.03 height datum is honest: the wide
  station band, not a single mast spike, owns the P95 envelope.
- `leopard2_proto`: the squat receiver station and proud panoramic tower
  are deliberately separated pieces of one roof system. The new flange
  reads as the mount, closes the former coplanar seat, and stays visible
  around the base. The PT remains low, unskirted, and rangefinder-led.
- §B5/CROWS checks: forward aim is explicit at rest; yaw-90 close, plan,
  side, and hero sheets show the full assemblies moving with the turret.
  No unsupported island or collision appears at either seat.
- Family non-regression: leo2a5/leo2a6 garage controls and their frozen
  hashes remain unchanged; the restored stations do not leak through the
  shared helper into any sibling.

## Hash-record correction

The §5.76 prose recorded builder candidates `8fb73bdd` / `d900c8e2`.
Those were not the hashes of the final coupled landing. A detached worktree
at acc0a48 reproduced `41587e99` / `a9aba192`; the current live tree gives
the same pair. This verdict binds the reproducible landed hashes and retires
the stale candidates. No geometry was changed by the correction.
