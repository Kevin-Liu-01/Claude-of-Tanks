# South Africa line (269): batch record

Owner 2026-11-02: "lets make a new session to flesh out south african and australian tank trees" ("no senntinnel
please" for Australia). Main's ruling the same day: ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md approved with
conditions (each Olifant reads as itself, blind A/B of all four; tiers by capability score and duels before READY;
land South Africa and Australia as two heads). Research: ~/cot-lanes/sa-aus-trees-269-evidence/RESEARCH.md.

| id | name | tier | route | packet |
|---|---|---|---|---|
| olifant_mk1 | Olifant Mk 1 | II (root) | Centurion family mark | [olifant_mk1.md](../../references/tanks/olifant_mk1.md) |
| semel | Semel | II (twin on the Mk 1) | Centurion family mark | [semel.md](../../references/tanks/semel.md) |
| olifant_mk1a | Olifant Mk 1A | III | Centurion family mark | [olifant_mk1a.md](../../references/tanks/olifant_mk1a.md) |
| olifant_mk1b | Olifant Mk 1B | III | Centurion family mark (the Olifant kit) | [olifant_mk1b.md](../../references/tanks/olifant_mk1b.md) |
| olifant_mk2 | Olifant Mk 2 | III (moved from the UK special lane) | unchanged (262) | [olifant_mk2.md](../../references/tanks/olifant_mk2.md) |
| ttd | Olifant TTD | III (special; IV ruled, III by its duels) | on the fleet's Leopard 2 (the owner, 2026-11-02: "the ttd needs to properly be based on an actual leopard 2"), `profiles/ttd.ts` | [ttd.md](../../references/tanks/ttd.md) |

Out (Main): the wheeled Ratel, Rooikat, Eland and Badger (no wheeled drivetrain); the Sherman Firefly and Comet (the
Denmark M24 ruling: stock, no national kit; a possible second batch); the Mk 1A ARV and Mk 1B bridgelayer (non-combat);
the Mk 1B Optimum and LIW's 120 mm Olifant 2 turret (never built or adopted).

The shared builder: `profiles/centurionFamily.ts` gained one optional `sa` field and four marks, purely additively (an
unknown mark throws). `tools/fleet-geometry-ledger.mjs --check` on the 47 ids the edit marks input-changed (the uk,
sweden, denmark and israel groups): PASS, byte-identical, before and after (evidence: family47-before.log,
family47-after-r1.log). Main's ruling: the 47 re-key in the 269 integrator's whole-fleet regen.
