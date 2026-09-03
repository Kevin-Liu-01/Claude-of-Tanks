# Deterministic balance range

`npm run balance:simulate` runs curated peer and progression matchups through
the same fixed-step authoritative combat path as a live battle. Each seed is
run from both ends of a flat, obstacle-free range so team order and terrain do
not decide the result. Gun laying, dispersion, shell flight, armor, modules,
fire, ammunition, reloads, and destruction remain active.

- `npm run balance:simulate` prints the current receipt.
- `npm run balance:update` deliberately records an approved tuning pass.
- `npm run balance:check` fails when canonical stats and the recorded receipt
  disagree.

Run any two saved vehicles against each other with the same authoritative
range model:

```sh
node tools/balance-matchups.mjs --a=challenger1 --b=t90a --seeds=101,211
node tools/balance-matchups.mjs --a=spz_puma_s1 --b=bmpt_t90 \
  --a-shell=2 --b-shell=2 --advance-to=60
```

Shell slots are one-based. `--distance`, `--duration`, and `--advance-to` tune
the range setup; every seed is still run from both ends. The JSON output can be
redirected to a file for an ad hoc receipt. Use `--help` for the complete CLI.

The suite is a regression instrument, not a promise that every tank should win
exactly half its fights. Its reviewed score bands catch gross peer mismatch;
the receipt preserves the more useful win, duration, surviving-HP, and damage
signals for human balance review.
