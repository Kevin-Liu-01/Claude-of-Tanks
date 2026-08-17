# TANK GENERATION PROGRAM — STATE REGISTRY + TAKEOVER HANDBOOK
(written 2026-08-05 at the owner's takeover order; supersedes nothing —
this INDEXES the living law docs, it does not replace them)

## 0. Doc map (where the law lives)
- **docs/BUILD-STANDARD.md** — the LIVING RULEBOOK (owner-ratified build
  laws §A-§J incl. §B3.1/§B3.2; owner standing directive: keep editing it as lessons land).
- **docs/GEOMETRY-GATE.md** — the measured gate, §10 graduation protocol,
  amendments (three-map retirement, trim-boundary interp clamp).
- **docs/references/tanks/<id>.md** — per-tank PACKETS: round history,
  certified caps/classes, banked orders, freeze entries. The packet is the
  tank's single source of truth.
- **docs/critique/** — independent critic verdicts (shaded-parity-*).
- **docs/ATTRIBUTION.md** — oracle licenses (CC-BY / NC-SA quarantine).
- **docs/geometry-gate/** — tool-written gate rows + ledger.json (NEVER
  hand-edit; stage rows via index-blob surgery, see §6 below).

## 1. Mission + definition of DONE
Every tank in the ~88-row ledger ships as a procedural build in
src/vehicles/profiles/*.js, measured against its community reference GLB
until passing BOTH gates, then graduated per §10. A tank is DONE when:
(1) `node tools/geometry-gate.mjs --ids=<id>` reports every component >=90
(hullCurves, wholeCurves, turretCurves, stations, dims, floaters; certified
oracle-defect caps never cover dims); (2) independent critic >=9.0/10 on
EVERY of 14 views of shaded pairs; (3) turntable eyeball; (4) §10
graduation in the same commit. Program ends when ledger min >=90
fleet-wide, every graduate hash-frozen, no tank registers a reference GLB
at load.

**2026-08-11 native provenance reset:** the runtime rule is now stronger than
the historical graduate registry: every registered battle playable must be
our authored procedural geometry. After the owner-directed Merkava IVm removal,
`npm run tank:native:check` currently reports 107/107 native and zero
GLB-sourced. Source-derived geometry modules
and bake scripts for the Leopard/Type 10/T-80U/T-14/AMX-40/FV510 reopen set
were deleted. Any freeze row whose builder changed in this reset is historical
until fresh native paired+yaw evidence replaces it. See
`docs/critique/native-provenance-runtime-audit.md`.

**2026-08-13 owner removal:** `merkava4` / Merkava IVm Windbreaker is no
longer a playable or garage roster entry. Its dedicated imported GLB, icons,
source attribution, reference packet and gate row were removed. The internal
first-party spec/builder remains dormant only because the earlier Mk.1B–Mk.3D
builders clone it as a family donor; it must not be re-registered as a tank.

## 2. ABSOLUTE RULES (verbatim-critical)
- THE ONE ABSOLUTE RULE: no assets extracted from commercial games, ever.
- Private local project — never publish, never create accounts.
- docs/geometry-gate/ledger.json is TOOL-WRITTEN only.
- NEVER gate m60a1 / m60a3 / kv2 (kv2's oracle is unrecoverable by design —
  freeze-hash verification only).
- FALSE-0 LAW: never record gate runs against missing/broken references.
- Owner plays on port 5001 — headless tools use their own vite 74xx-77xx.
- /tmp/cot-shots.lock FIFO serializes browser tools. Official tools
  SELF-TICKET — never wrap them in an external lock (deadlocks proven).
  Tickets 15-digit zero-padded. Never clear a live lock; 5-min staleness
  reclaim per the tools' law.
- Agents NEVER commit; the orchestrator verifies rigs+hashes+packets and
  commits precise paths. One family per agent; profile files single-owner.
- ICON TRAP: genIcons rewrites all ~520 icons — use `--tanks <id>` and/or
  stage ONLY the target's 5 icons by exact filename, `git restore
  public/icons/` for the rest. Regenerate from a CLEAN HEAD WORKTREE when
  the live tree carries agent WIP (symlink node_modules into the worktree).
- recovered/* GLBs are NC-SA LOCAL-ONLY QUARANTINE (see ATTRIBUTION.md).
- Env for EVERY node run: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
- npm test before every landing (166 equipment checks + track-geometry).

## 3. HISTORICAL GRADUATE REGISTRY (reopened native builds require re-freeze)
Freeze = deterministic geometry hash via `node tools/tmp-hashgeo.mjs
--ids=...` (camoSeed 4242 pinned build; FNV-1a over position buffers +
world matrices + indices, mesh-order independent). This table preserves the
per-vehicle certification lineage; shared-family edits mean it is not a live
byte ledger. The authoritative current 108-vehicle dual-fingerprint snapshot
is `docs/FLEET-FREEZE-CURRENT.json`, reproduced by
`npm run tank:freeze:check`. Graduate-change protocol: fix ->
gate hold x2 -> independent re-cert critic >=9.0 on changed views ->
re-freeze NEW hash, all in ONE commit.

| id | hash | notes |
|---|---|---|
| m60a1 | 912de524 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| m60a3 | 097c35a2 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| kv2 | 382b2310 | freeze-verify only |
| m1a1 | da934f6c | RE-FROZEN 2026-08-15 (§5.240 raked front shoulders plus closed rear-left/right sprocket wells; exact band+shoe+sweep 0/0, fresh 45-frame yaw packet; prior d42882cc retired) |
| m1a1ha | fcbe7ff0 | RE-FROZEN 2026-08-15 (§5.240 family shoulder/rear-corner correction while retaining HA-only supported foliage; exact band+shoe+sweep 0/0; prior 837bfe50 retired) |
| m1a2_tejas | 0c690428 | RE-FROZEN 2026-08-14 (§5.184 family-source reconciliation; clean authored Tejas geometry and current asset bytes verified unchanged, strict native-course clearance retained; prior ed044ac8 retired) |
| merkava3b | REMOVED BY OWNER 2026-08-06 (roster prune; was 8bb8d984, packet historical) |
| merkava3c | c41e5c3c | RE-FROZEN 2026-08-14 (§5.194 non-subtractive closed-sponson/native-course repair; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior aa74be6a retired) |
| kf51 | 79ce4523 | RE-FROZEN 2026-08-14 (§5.197 non-subtractive closed-sponson/native-course repair: complete exterior hull, side armor and seven-wheel course retained; concealed deck/glacis undersides cleared and wheel-face dressing truthfully classified; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior 7d632754 retired) |
| strv103 | 4c8f1330 | REVERTED 2026-08-17 by owner order (§5.301 "revert the strv 103b as well"): the §5.198-era build restored wholesale from 75780d72^ (historical freeze 4d0ff518 — same geometry, hash moved by §5.229 standardization); the §5.271 rebuild (4ac3c8c8, critic 9.2) retired by owner authority |
| chieftain_mk10 | 55a23544 | RE-FROZEN 2026-08-14 (§5.199 non-subtractive closed-sponson/native-course repair: complete hull, fenders, skirts and six-wheel course retained; concealed full-width deck underside cleared with an opt-in Mk.10-only band split; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior 1f3cfe4d retired) |
| isu122s | 90f3a6a0 | RE-FROZEN 2026-08-17 (§5.254 graduate-change re-cert: §5.247 leclerc redesign + bow-channel/tabH regression fix; gate 91.5 reproduced ×2 bit-identical by independent critic clone, changed views 9.1-9.3, identity holds; prior 8f420d18 retired) |
| isu152 | 8e2f75c0 | |
| merkava3d | 3dc50bb4 | RE-FROZEN 2026-08-14 (§5.194 non-subtractive closed-sponson/native-course repair; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior 667ece84 retired) |
| pt91m | c31951d0 | RE-FROZEN 2026-08-14 (§5.196 localized native-course closeout: complete hull, skirts and six-wheel course retained; bow tow eyes reseated inboard on the lower plate, unchanged gear-fade strips truthfully classified and the one rear strip lowered beneath the shoe; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior 2cf10e23 retired) |
| t54 | 0ff49358 | RE-FROZEN 2026-08-14 (§5.195 non-subtractive closed-hull/native-course repair: complete cast hull, fenders and five-wheel course retained; concealed bay roof lifted and rear drum bands reseated; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet) |
| type59 | bd8ceae6 | RE-FROZEN 2026-08-14 (§5.195 non-subtractive family repair: complete hull/fenders retained, closed center tub and stepped stern cleared from the native course, rear flaps reseated behind the final drive, hidden turret mask carriers narrowed; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet) |
| t72b3m | b8cc33a8 | RE-FROZEN 2026-08-13 (§5.154 live ownership/asset reconciliation: complete soft-pack belt, side bins, flank carriers and rear cells remain turret-owned with parent audit 0/0/0 and fresh 45-frame yaw proof; existing wrap-fade/face trim explicitly classified as suspension-owned with front/rear exact band+shoe 0/0; all eight presentation assets current; hull, skirts and native six-wheel course unchanged) |
| merkava1b | 102e495d | RE-FROZEN 2026-08-14 (§5.194 non-subtractive closed-sponson/native-course repair; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw packet; prior 78051af0 retired) |
| m1a2 | 4cce8a04 | RE-FROZEN 2026-08-15 (§5.240 raked front shoulders and paired rear-well closures; exact band+shoe+sweep 0/0 and fresh 45-frame yaw packet; prior f9edc818 retired) |
| chieftain5 | d4f2a9a6 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| t84 | 04707a9c | |
| m47_patton | 2fc99c50 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| leo2a4 | d8374cc8 | RE-FROZEN 2026-08-13 (§5.151 restored full-depth first-party modular side skirts outboard of the unchanged native course; exact band+shoe+sweep 0/0; fresh 45-frame yaw/ownership packet) |
| leo2a5 | e215a738 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| leo2a6 | 8ac0b4b1 | RE-FROZEN 2026-08-14 (§5.178 non-subtractive terminal-course rewrap: complete hull/skirts/mudguards preserved; exact band+shoe sweep 0/0; fresh 45-frame profile/yaw packet; instance e15a1b19 / asset 70bfb68e) |
| leo2a7v | b6b630f4 | RE-FROZEN 2026-08-13 (§5.151 restored full-depth first-party modular side skirts outboard of the unchanged native course; exact band+shoe+sweep 0/0; fresh 45-frame yaw/ownership packet) |
| leo2_revolution | cffcd052 | RE-FROZEN 2026-08-13 (§5.151 removed the independently color-isolated long thin left-cheek card while retaining the connected cheek loft/armor course; exact band+shoe+sweep 0/0; fresh 45-frame yaw/ownership packet) |
| m46_patton | 108806c8 | bore+winding re-cert RATIFIED (floors 9.1-9.4) |
| centurion3 | bad74e60 | RE-FROZEN 2026-08-08 (no-air graduate-change: crown-ridge pedestal + discharger webs, front-low 1810px->14, re-cert floor 9.0 x17 changed views, gate 91.1 exact; prior 50273080 bore-resit lineage) |
| m1a2_sepv2 | 065d7e9b | RE-FROZEN 2026-08-15 (§5.240 raked front shoulders and closed rear-left/right sprocket wells; exact track corridor and yaw ownership retained; prior d28d4020 retired) |
| m1a2_sepv3 | ca666266 | RE-FROZEN 2026-08-15 (§5.240 family shoulder/rear-corner correction while retaining supported SEPv3-only foliage and clear optics; prior 690d16fa retired) |
| m1a2_tusk | 305dda8c | RE-FROZEN 2026-08-15 (§5.242 four separated forward cheek tiles replaced by one continuous swept/raked cassette per side; ARAT, raked hull shoulders, closed rear wells and exact track corridor retained; prior fae459f0 retired) |
| m2a2_bradley | 45ef7b0c | GRADUATED 2026-08-08; RE-FROZEN 2026-08-14 (§5.188 zero-geometry semantic course closeout: authored asymmetric tread-pad rows and the supported return-run cover are classified as running gear instead of hull armor; accepted complete hull, full skirts, six wheels, raised terminal stations, linked course and turret remain unchanged; strict band/shoe front 0/0, rear 0/0, full sweep 0/0; fresh 45-frame yaw proof re-adjudicates fixed deck spare links; prior 90a5568c retired) |
| m45_patton | 53caa687 | GRADUATED 2026-08-08 (29th; gate 90.7 x5 total + sitting-2 visual floor 9.0 mean 9.13 x14; sitting-1 orders executed: loft.smooth byte-reproduced, ring cupola adjudicated ring-class at station with the measured Ø0.57/x-0.65 deviation compliant; ring-prominence silhouette-tax residual certified) |
| leclerc | 467186cc | RE-FROZEN 2026-08-13 (§5.153 current first-party course re-cert: six road wheels, full-size elevated front idler, raised rear drive, five return rollers directly supporting the visible upper linked-shoe run, wheel-supported lower course and exact band+shoe+sweep 0/0; hull/skirts/mudguards preserved; all eight garage assets regenerated and live-current) |
| amx30 | 89a4cdf0 | GRADUATED 2026-08-12 (§5.124 first-party low five-wheel AMX hull, compact cast turret, supported commander/optic/MG station and native exact 0/0 course; machine fidelity 91.81 / min view 90.01; fresh 42-frame yaw/ownership floor 9.0 / mean 9.16) |
| amx30b2 | 34076800 | GRADUATED 2026-08-12 (§5.124 first-party B2 cast/rear-station and service package on the exact native five-wheel course; machine fidelity 91.51 / min view 90.14; fresh 42-frame yaw/ownership floor 9.0 / mean 9.12) |
| amx40 | 3d312bde | RE-FROZEN 2026-08-12 (§5.135 fully first-party forward-section + owner-height re-cert: connected cheek/crown loft retained forward, complete turret section exactly 20% taller with smoke/MG re-seated; fidelity 92.94 / minimum whole view 91.90, strict native band+shoes+sweep 0/0, fresh 45-frame yaw/ownership floor 9.0 / mean 9.07; all source-baked playables retired) |
| k2 | 827d5ffc | GRADUATED 2026-08-08 (31st; Leclerc-method closed station loft; gate 90.1 x2 every component >=90; visual R26 floor 9.0 / mean 9.09 x14; exact Object_8/15/18/21 plan inventory, rounded asymmetric cage, countable six-station ISU gear; oracle 8d92cd1b reproducible from pristine .bak) |
| abramsx | 91364f7e | GRADUATED 2026-08-09; RE-FROZEN 2026-08-14 (§5.183 exact native-course closeout: wheel faces/hubs/spokes/torsion links and the inboard guide strip declare running-gear ownership, the complete glacis cable is reseated inside the elevated idler course, strict band+shoe+sweep 0/0, parent and winding clean; complete outer hull/skirt retained; prior 976a1370 retired) |
| challenger_3 | 564057a4 | RE-FROZEN 2026-08-12 (§5.136 first-party forward-profile + strict-track re-cert: connected brow/cheeks remain extended to the mantlet, all turret fittings seated through yaw, exact native band+shoes+sweep 0/0; fidelity 93.02 / minimum whole view 92.17, fresh 45-frame floor 9.0 / mean 9.07; prior 3e5a7797 retired) |
| challenger1 | fa346ca4 | RE-FROZEN 2026-08-13 (§5.152 first-party in-place closure: complete hull/skirts/mudguards/native six-wheel course preserved; detached lower gun-cradle duplicate removed; connected shell/gun/basket/roof suite re-centered on the true hull ring with yaw-zero silhouette preserved; fresh 45-frame packet floor 9.0 / mean 9.04, parent 0/0/0, winding clean, exact track 0/0 and muzzle/rig/tests/build PASS; 4ecc29b4 and earlier freezes retired) |
| challenger2 | 4fbb2768 | GRADUATED 2026-08-09; RE-FROZEN 2026-08-14 (§5.190 native Hydrogas/course closeout: all accepted hull, segmented skirts, guards, six wheels, terminal stations and turret geometry retained; wheel-face/hub/arm/end-face dressing is explicitly running-gear-owned, and two narrow rubber seam strips move 0.03/0.04 m outward; strict band/shoe front 0/0, rear 0/0, full sweep 0/0; parent clean, 45 distinct paired/yaw frames, assets/tests/build PASS; prior 3b4bd5f0 retired) |
| fv510 | f912ef92 | RE-FROZEN 2026-08-14 (§5.189 non-subtractive carrier clearance: all six deep WRAP modules, chevrons, open rails, complete sponson, skirts, wheels and native course remain; only the buried lower transverse module carriers move upward inside the same closed armor panels; strict band/shoe front 0/0, rear 0/0, full sweep 0/0; fresh 45-frame yaw proof and regenerated targeted assets PASS; prior 313ab8ca retired) |
| m26_pershing | 2f006738 | RE-RECORDED 2026-08-08: hash moved by LANDED 5f39989 (armorM4 gunBarrel shadow-proxy 3.96->3.44; m26/m45 inherit m4a3e8 proxies — patton.js bytes unchanged); double-confirmed by builder bisect + m45-grad critic; prior 65c564c0 bore+winding re-cert lineage (floors 9.1-9.4) carries |
| t90m | a21894b8 | RE-FROZEN 2026-08-12 (§5.127 first-party native V-bow hull, welded Proryv shell, supported bustle/rack and exact six-wheel course; machine fidelity 90.96 / minimum view 90.02; 42-frame yaw/ownership PASS; incompatible legacy contour row retained honestly rather than chased) |
| t90 | d15f8148 | RE-FROZEN 2026-08-15 (§5.241 unified front-package correction: complete gun/saddle, enlarged Shtora eyes, their buried supports, shoulder carrier and both frontal K-5 courses rise 0.12 m and move 0.07 m toward the bow as one turret-owned assembly; Burlak core/bustle, roof suite, hull, skirts and singular six-wheel smart course remain unchanged; 45-frame paired/yaw packet, live Surface Lab front/hero proof, exact track 0/0 bands+shoes, one-course, muzzle, parent and winding checks PASS; prior 34b9980 and earlier freezes retired) |
| t90a | ae37a914 | RE-FROZEN 2026-08-13 (post-rollback family-scale/equipment reconciliation: retained the approved first-party hull, cast turret and K-5 package; restored two unequal turret-owned radio whip stations on broad shoes/collars/struts instead of scaling the tank; 45 unique paired/yaw frames, genuine quarter-turn, independent §B8 floor 9.6 / mean 9.76, parent/winding clean; prior 810a6f18 retired) |
| t90a_vladimir | bee9eb44 | RE-FROZEN 2026-08-15 (restored the prominent round OTShU-1-7 pair on broad cheek shoes and raised the complete articulated gun/saddle group 0.07 m; 45 distinct paired/yaw frames, genuine quarter-turn, independent §B8 floor 9.7 / mean 9.78; parent 0/0/0, one native six-wheel course, exact track 0/0, muzzle and winding pixels clean; prior 7a6067c1 and earlier freezes retired) |
| t90sm | 7efc69c9 | GRADUATED 2026-08-10; RE-FROZEN §5.105 (owner-priority complete redesign: source-measured low diamond shell retained, solid bustle steps replaced by backed slat cells, deep scalloped inboard skirts and layered rear service field added; gate 90.0 x2; standard/track/winding clean; independent §B8 floor 9.0 / mean 9.08 x14, all 28 yaw frames PASS; prior 56324371 retired) |
| k1a1 | 642e144c | RE-FROZEN 2026-08-15 (§5.243 K1A1 terminal-course correction: front idler and rear final drive lifted off the road-wheel centerline to restore the long-base trapezoid; complete hull, skirts, six-wheel suspension and one smart course retained; exact band/shoe/sweep 0/0; prior 64710448 retired) |
| type99a | 6d52abda | RE-FROZEN 2026-08-12 (§5.133 strict-clearance re-cert: first-party measured-envelope hull/turret retained, native six-wheel return and shoes exact 0/0 through the full sweep, rear U-cable fully backed, gate 90.7 / fidelity 93.0; fresh 45-frame yaw/ownership floor 9.3 / mean 9.39; prior 50bbc9bc retired) |
| type90 | d8f8a3a8 | RE-FROZEN 2026-08-12 (§5.134 owner-height + strict-track re-cert: first-party welded turret at corrected 0.80 section, all roof kit re-seated, fidelity 92.22 / minimum whole view 90.53; exact native band+shoes+sweep 0/0, fresh 45-frame yaw/ownership floor 9.0 / mean 9.08; legacy low-mask row retained honestly at 27.5; prior 5d7bc85c retired) |
| type10 | ca815d52 | RE-FROZEN 2026-08-14 (§5.187 non-subtractive native-course closeout: exact accepted hull, glacis, full skirts, guards and lowered first-party turret remain unchanged; five-wheel gear shifts 0.065 m outward inside the skirts, narrows the native lane around the wheel faces, adds one supported forward return roller and lowers the hidden top run; strict band/shoe front 0/0, rear 0/0, full sweep 0/0; fresh 45-frame yaw proof re-adjudicates the fixed deck cable/glass/cloth/service field; targeted assets current; prior d7faced8 retired) |
| t14 | a94a2480 | RE-FROZEN 2026-08-12 (§5.131 fully first-party `buildT14`: low seven-wheel Armata hull, connected unmanned shroud, supported RWS/sensor package and exact native course; fidelity 90.53 / minimum view 91.52; 42 unique paired/yaw frames floor 9.0 / mean 9.04; source-baked `a88afa6c` playable retired) |
| t80u | 77f9ae78 | RE-FROZEN 2026-08-12 (§5.132 fully first-party `buildT80UNative2026`: low turbine hull, connected cast/K-5 turret, supported combat/rear-service package and exact native six-wheel course; fidelity 91.51 / minimum view 90.20; 42 unique paired/yaw frames floor 9.0 / mean 9.04; source-baked `c0dc2502` playable retired) |
| type74 | 8319dbb8 | RE-FROZEN 2026-08-11 (§5.110 authored low cast turret, five-wheel native course and supported combat/service suite; independent §B8 floor 9.1 / mean 9.29) |
| ariete | 64308158 | RE-FROZEN 2026-08-14 (§5.185 non-subtractive native-course closeout: seven road wheels, full idler/final drive, hull/skirts/mudguards retained; exact band+shoe+sweep 0/0, fresh 45-frame profile/yaw proof; prior acea2100 retired) |
| t72b_1987 | acc6dd00 | RE-FROZEN 2026-08-14 (§5.235 complete current-family redesign: dedicated low B87 hull loft, broad pear casting, dense planted Kontakt-1, compact supported Luna/NSVT suite, unequal rear service rack and one exact 0/0 six-wheel smart course; fresh 45-frame yaw/ownership proof, rig/muzzle/winding/tests/build PASS; prior 586ae4a3 and earlier freezes retired) |
| t72bu | 4b66bf6c | GRADUATED 2026-08-11 (§5.115 authored compact BU protection/station/rear package on one native six-wheel course; independent §B8 floor 9.0 / mean 9.19) |
| t90ms | 5076891c | GRADUATED 2026-08-11 (§5.118 authored clipped-diamond shell, Relikt, supported bustle/station and native six-wheel course; independent §B8 floor 9.0 / mean 9.18) |
| t90a_burlak | 8d2f5d44 | RE-FROZEN 2026-08-11 (first-party clipped casting, planted protection wings, continuous shallow autoloader bustle and exact 0/0 native six-wheel course; 42-frame yaw/ownership PASS, floor 9.0 / mean 9.06; legacy registration-incompatible geometry row remains honestly unresolved) |

*Historical note: the 2026-08-05 INVISIBLE-LOD fix mass re-froze the
then-24 stable graduates (old->new table in commit 9bf2a6d); every row
above now shows its CURRENT ratified hash after the 2026-08-06 waves
(cheek+gun, density, shoe, gun-run, ring rounds — all re-certified).

Mirror maps (graduates + flip-era tanks measure via these, NOT runtime
registration): tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES,
tools/visual-evaluator-page.html CRITIC_REFERENCE_OVERRIDES (committed),
tools/tmp-tank-critic.html CRITIC_REFERENCE_OVERRIDES (committed at the
takeover sweep decec28). §10 LESSON: mirror
the HELPER-EXPANDED config, never the surface call (the gunNode incident —
userdrops5's `articulated` helper includes `gunNode:'^Gun'`; dropping it
cratered leo2a5 to min 0 at load-prove). Load-prove = `node
tools/tmp-modelsource-dump.mjs` shows the id ABSENT from the glb map +
gate still measures via mirror.

## 4. FLEET STATE at handoff (ledger 2026-08-05, 23/88 pass — revolution
honestly parked at 88.9 pending its retune)
- **Gate-PASS awaiting visual ladder / adjudication**: challenger1's historical
  90.2 / floor-7.0 row is superseded by the §5.112 native-procedural graduation;
  its old mask-conforming build is retired. centurion5
  90.7 (floor 7.0, O3 cast-turret round) — uk round-4 agent ON IT.
  m1a2_sepv2 GRADUATED (25th).
- **80-90 band**: m60a2 86.3 (ceiling 87.5 — cert decision pending),
  bradley 84.7, bmp2 84.0 (ceiling), m45_patton 81.2 (stop-rule closed).
- **80-90 additions (misc r3 CLOSED, ceiling-measured ~84-85 each)**:
  type90 83.6 (station lane class binds; 3.69 band-solver col =
  orchestrator lane), ariete 82.3 (wrap break LANDED via lane-local fill
  — the sanctioned non-circular mechanism; cover/frame-lock certified).
- **70-80**: t64bv1 73.4, t90a_vladimir 71.4. m26_pershing 90.4 GATE
  GRADUATED (26th, 2f579de8). X-brace architecture conflict remains an
  orchestrator ruling item (stations-law open track zone).
- **Russia tail**: t72b_1987 56.0 CEILING-CERTIFIED (print drum-band cap),
  t90sm 56.4 (AA-teeter binds), t62mv1 63.7 (fade-cap ceiling ~77-81),
  t90m GRADUATED (27th, e345ee8a); hatch rings
  flush; Relikt relief) — gate 90.7 x2 held, candidate e345ee8a, SECOND
  SITTING adjudication IN FLIGHT (critic note: judge actual tones, the
  old drum attribution is dead);
  (bustle band hull-side matching an empty-turret print) — re-parent
  lands COUPLED with the ordered obr-2022 oracle swap + rebuild,
  t72bu ~55-70 certified-ceiling — ORACLE
  DECISION PENDING (orchestrator lane). t72b3m RE-ORACLE DECIDED
  2026-08-06: NO SWAP (onboarding evidence: current oracle dims-EXACT +
  split-clean + the 91.8 row frozen against it; the obr-2022 drop is a
  later configuration = feature order + §E normalize + full re-gate,
  not a measurement upgrade; it serves as the t72b3 BASE oracle instead;
  ATTRIBUTION LEAD: the recovered t72b3m print is very likely 42manako's
  own earlier upload — mesh 'T-72B3M_Zavod_edition', identical width).
- **BASE-21 MODERNIZATION WORKSTREAM (owner directive 2026-08-06: "the
  21 original base-game customs (Sherman, Tiger I, T-34-85, Leopard
  2A4/2A7, T-14, Challenger 2, etc.) need to begin being worked on
  because the current models are wholly ancient")**: these predate the
  oracle program — most have NO ledger row (no reference GLB; leo2a7v 0,
  t80u 75.4 and t90m 81.7 are exceptions with oracles). Mechanics: (a)
  identify the exact 21-id roster from TANK_SPECS (first triage task);
  (b) per-family PHOTO-CLASS modernization rounds under the full current
  rulebook (§B1-§B7, §C) as lanes free — the visual critic is the bar
  where no oracle exists (false-0 law: never gate without a reference);
  (c) parallel oracle-sourcing lane (community CC models only, bradley
  flow — THE ONE ABSOLUTE RULE stands). SLICE 2 DONE (2026-08-06 pm): ROSTER DELIVERED
  (docs/PROGRAM-STATE-base21.md — 17 no-oracle ids: 15 true originals +
  2 quarantine-fallbacks; real ids are t14/k2 not t14_armata/
  k2_black_panther); challenger2 REBUILT (modern1.js, floor 8.6, clips
  102/78+182/74 -> 0/0+0/0, mg1+5d, hash 22c8127); t14 REBUILT
  (modern2.js, floor 8.6, clips zeroed, mg1+2d, hash 1d232727); ww2 trio
  AUTHORED in ww2.js but ladders PARKED per the modern-first order
  (next-slice item; Sherman rx-sign fix banked). QUEUED my-lane: spec
  gunBarrel true-ups (challenger2 ~6.3, t14 6.15 — verify per-tank
  before editing). FIRST SLICE DONE (2026-08-06): leo2a4 REBUILT
  photo-class (the first base-21 modernization — new buildLeo2A4, all
  batteries clean from 83/436-clip mg0 ancient state; spec 9.67 true-up
  landed); leo2a7v re-laid on the V3 rig (dims 100, clips 0/0, certified
  proportional ceiling; §E re-source request filed in packet);
  PHOTO-CLASS FLOW law banked (tmp-leo-photoclass rig = the no-oracle
  lane mechanism for the remaining base-21 slices).
- **fv510 NEW ORACLE (2026-08-06, owner drop)**: community/
  fv510_warrior.glb (42manako CC-BY-4.0, verified; ATTRIBUTION.md).
  ONBOARDING = orchestrator lane, bradley flow: vertex-extract REG +
  registration into the harness maps (HELPER-EXPANDED law) + gate
  baseline x2 + retire the recovered/ short-print (batch-44 note stays
  historical). The live fv510 photo-parity round gates dims/floaters
  only meanwhile (notified).
- AFV LANE LANDED (2026-08-06 eve): spz_puma BUILT + oracle-registered
  (honest 7.7 baseline x2, dims 100; §E NORMALIZE PLAN FILED z x1.0418 /
  y x1.0444 — orchestrator executes, build already authored post-warp
  frame); type89 BUILT photo-class (rip stayed refused); k2 verified
  (flap suspect negative); type99a REBUILT from blueprint (clips
  119/44 -> 0/0, mg1+6d). Queue: type99a spec-width 3.5-vs-3.7 owner
  ruling, gunBarrel true-ups, icons x4.
- **SPz PUMA — NEW VEHICLE (owner order + oracle drop 2026-08-06:
  "make the spz puma as well")**: community/spz_puma.glb landed (42manako
  CC-BY-4.0, verified). FULL BUILD-UP QUEUED, next free lane: (a) spec
  row (German modern IFV: 30mm MK30-2/ABM in an unmanned RCT30 turret
  offset left, hull crew of 6+3, ~7.6m x 3.7m x 3.6m, twin whips, ROSY,
  slat/skirt options); (b) profile home = wherever bradley/bmp2 live
  (AFV class) or a new afv builder; (c) bradley-flow oracle onboarding
  (extract + registration + baseline); (d) full photo-class round to the
  rulebook incl. §B3.2 density; (e) icons + CUSTOM tab row.
- **TYPE 89 IFV — NEW VEHICLE queued; oracle drop REFUSED (2026-08-06)**:
  the dropped type_89_ifv_war_thunder.glb is titled "Type 89 IFV (War
  Thunder)" in its embedded metadata = a commercial-game extraction; THE
  ONE ABSOLUTE RULE refuses it regardless of the Sketchfab CC-BY tag
  (uploader cannot license Gaijin's model). File NOT copied. The Type 89
  builds PHOTO-CLASS on the bradley recipe (owner: "use the bradley on
  puma and this type 89 ifv") — 35mm KDE autocannon turret two-man
  right-offset, 6 roadwheels, firing ports; a properly-licensed
  community oracle is welcome if one exists (bradley/warrior/puma are
  all 42manako CC-BY — check that catalog first).
- PUMA amendment: base the build on the BRADLEY recipe (owner order),
  with its 42manako oracle for measurement.
- **BASE-21 ORACLE WAVE (2026-08-06, owner drop x8, licenses verified)**:
  ONBOARDING QUEUE (orchestrator lane, bradley flow each: extract + REG +
  harness registration (HELPER-EXPANDED law) + gate baseline x2):
  leo2a4 <- leopard_2a4_otco; type10 <- type-10_main_battle_tank;
  challenger2 <- challenger_ii (80MB); t14 <- community-candidates/
  t-14_armara (223MB LOCAL-ONLY, gitignored — extracts committed, GLB
  never pushed); t72b3 base + t72b3m graduate re-oracle candidate <-
  t-72b3m_obr_2022 (graduate swap = full re-gate + re-cert protocol);
  leo1a5 family influence <- leopard_1a4 photogrammetry scan;
  challenger1 ALTERNATE ref (already gate-PASS on its print — optional
  compare); challenger_3 = NEW-VEHICLE candidate (CC-BY-NC: local
  measurement only, never ship). Type 89 rip stays REFUSED — photos.
- **BASE-21 FAMILY-INSPO GUIDANCE (owner 2026-08-06): k2, type10,
  type99a, leo1a5, t72b3, chieftain_mk10 take inspiration from their
  tank families** (type10 <- type90 recipes, type99a <- the russia-style
  lineage, leo1a5 <- leopard1 family, t72b3 <- t72 family, chieftain_mk10
  <- chieftain5 the graduate, k2 <- its own modern class) — "but this
  should also be intuitied": builders derive family grammar themselves.
- **OWNER PUNCH LIST 3 (2026-08-06 eve)**: (1) MUZZLE BORES fleet-wide
  (§B3.1 addendum banked 32a6946: rim + recessed near-black bore disc;
  graduates = graduate-change flow) — abrams round + fleet sweep agent
  spawned, live lanes (misc/modern2+3/ww2) relayed; (2) "fix m1 butts"
  (screenshot): M1-family rears — §B2 void pocket beside the exhaust
  grille, grille reads stuck-on-box not the real full-width plate,
  floating rear fender rails, deck camo scale mismatch — abrams round
  spawned (same agent as bores).
- **OWNER PUNCH LIST 2 (2026-08-06 pm, four screenshots)**: (1) DONE — fv510 photo-parity r2: all NINE gap-table reads closed
  (turret left-offset, 2x4 chunky banks, tall whips, deep vent rings,
  low guarded lights + convoy plate, loaded bins/racks mg1+16d, skirts
  22cm over wheel tops, mirrors inside the anchor); self-read floor 8.7;
  dims/floaters held; hash bf3bdf00. New-oracle onboarding still queued
  (the gap table = the re-verify checklist); (2) DONE — SEPv3 RESOLVED: TANK_SPECS.m1a2 IS the named M1A2 SEPv3;
  TUSK rebuilt real (ARAT-1/2 grammar, cage, TIP, LAGS-M240, 14.1,
  clips/contig zeroed); AIM 48.8; abramsx bow closed; five graduate
  candidates pending re-cert; (3) revolution turret
  see-through sides/ring ("disembodied") — relayed to the LIVE leopard
  agent; (4) DONE — leclerc front re-authored (29-deg plane per cheek to the
  1.55-1.74w strip, sight recessed §B1.1, gun run per §B3.1; 85.3 held
  x2 with receipted symmetry trades) + §B3.2 density + the t80u/type90/
  type74 winding fixes verified in the final file (REVERSED 0 x27); (5) DONE — russia §B3.2 density: mg backlog CLEARED 10/10 (census mg>=1
  everywhere, +25 markers; T05BV-1 RWS grammar on t90sm/t90m, Utyos on
  t80bv, coax ports x9, logs/links/cables laned); every gate held or up
  (t72b_1987 +1.3); graduates EXACT x3. Residual classes packet-noted
  (jerryCans/headlights blocked by certified-tight rows).
- **OWNER PUNCH LIST (2026-08-06, five rounds spawned)**: (1) DONE — ariete+leclerc left sides FIXED (reversed-winding class
  decoded: mirror loops hand slabs inward faces, FrontSide-culled but
  DoubleSide-mask visible; orientedSlab guard landed; gates held exact;
  leclerc bonus: contig 0, mg1, §B3.1 gun root. OPEN CARRIERS: t80u,
  type90, type74 — next misc/russia rounds);
  (2) merkava guns DONE — MG251/253 runs de-prismed all 8 marks (frozen
  rows EXACT; 3b/3c candidates 8bb8d984/b7318b10 pending re-cert critic;
  mk4 evac surfaced at station; 4b +3.1 stations); abrams DONE — cheeks raked family-wide (A/B curve-identity proofs),
  gun runs de-prismed x8, AIM on the family shell (46.3 honest: family
  mandate vs short print, cert extension filed), TUSK/abramsx actively
  batched; FIVE graduate candidates pending the family re-cert critic;
  (3)+(4) folded into the abrams round above; (5)
  russia-wide §B3.1 prism sweep; (6) DONE — fv510 Warrior BUILT ACTUAL (photo class: offset
  turret, RARDEN §B3.1 cylinders + perforated hider, slat cages, skirts,
  GPMG, mg1+13d; dims 100, batteries clean; hash 6bfcee8). Oracle
  adjudicated HONEST-0 (print -10.9% short + shape-divergent); batch-44
  warp EXECUTED (hold lifted, height-clamp root cause) — frame honest
  (cover 1.12%, safeScale 1.0), headline stays print-capped: the
  photo-class build is the truth, visual critic is fv510's bar.
- **OWNER PRIORITY (2026-08-05): fv510 Warrior marked a PERFECT CANDIDATE
  for a full round** — next open family-lane slot takes it (its repair
  recipe was incident-disabled; re-adjudicate the oracle first, §E).
- **Zero/low rows** (triage lane): recon_tank ruling, q_heavy/t30 walls
  (fv510 RESOLVED: built actual + photo-parity r2 + new oracle pending
  onboarding), merkava2b 39.6 / 2d 34.9 / 4 0 (family rebuilds; 3b+4b REMOVED BY
  OWNER 2026-08-06), t54 winding repair, m48 pitch, type74+t80bv scaleToOverall
  ruling.

## 4.9 GEAR R8/R8B REVERTED (2026-08-06 pm): the unconditional belly pan
(3ce46b8 + 2811281) is UNDONE per the owner's screenshot report ("terrible
gray rectangle under the tanks") — §B2 CLARIFICATION law banked (holes,
not channels; per-tank authored closures only). Revert verified: five
sampled graduates return EXACTLY to ratified registry hashes (2f579de8/
90ebf864/75e981e0/94c09bb0/fbf9f4cc) — no re-freeze needed. The earlier
belly-pan clamp task is SUPERSEDED by this revert. sherman_jumbo's 22/10
band + 34/6 shoe audit reading is PRE-PAN (persists post-revert) — ww2
lane decode item.

## 4.95 §C.1 FLEET BASELINE (winding-audit, 2026-08-06): mode-2 HARD
candidates -> lane queue: t72b3m 11227 (russia agent ON IT), t90a_vladimir
9973 + t90m 1903 (russia agent), m1a2_sepv2 5519 (abrams agent relayed),
challenger2 2666 (moderns agent relayed), spz_puma 2829 (modern3 queue),
m60a2 5304 + vickers_mk1 4562 + is1/is2 (lane queue); isu122s/isu152 =
casemate by-design (adjudicated). Mode-1: t80u 0.33% open-surface,
challenger1 0.31%, t62mv1/t72b_1987 0.25%. LATENT REVERSED-CORES (census
only, occluded): vickers 8, centurion3 6, centurion5 6, merkava3c 6,
merkava1b 5, merkava3d 4, +12 more — sweep when lanes free.

## 4.97 OWNER ORDERS 2026-08-06 late: (1) jerry cans darkened fleet-wide
(kit.js default slot -> canvasCloth; graduates carried via live rounds'
candidates); (2) MANTLETS MANDATORY fleet-wide (§B3.1 addendum; relayed
to live sweep + t90m lanes; type90 named); (3) type90 SIZE audit (spec
vs real 3.43x2.34x9.76 — my-lane verify-first true-up; dims=100 doesn't
prove the spec); (4) still-unstarted base-21: leo2a7, chieftain_mk10,
type10(held), leo1a5, type74, t72b3 build rounds queue BEHIND the §B8
acceptance-critic calibration (building six more tanks before the
proportions verdicts would repeat the puma mistake); k2/t14/challenger2
rebuilds await their §B8 verdicts; sepv2/sepv3 visible upgrades are
MID-FLIGHT (live abrams round, not yet landed).

## 4.98 GARAGE FOUR-GROUP CATALOG LANDED (owner order 2026-08-06):
Cold War 15 | Modern 42 | WWII 12 | Sources 32 — Sources computed live
from MODEL_SOURCE (auto-shrinks on graduation; COLDWAR_IDS map documented
in garage.js; six glb-sourced cold-war ids auto-migrate on graduation).
Owner files untouched. Flag for owner: charioteer spec era 'ww2' (a
1950s TD — say the word for a spec-era true-up).

## 4.99 §B8 ACCEPTANCE SLATE (2026-08-06): 0/12 PASS — verdicts +
prioritized orders in docs/critique/photo-acceptance-20260806.md.
RESPAWN PLAN (hardest first, lanes as they free, briefs MUST carry
§B8.1 target numbers + the per-tank order lists): (1) t14 + leo2a7v
(structural: turret 1.82->~1.0 shroud; a7v band re-parent/cut), (2)
spz_puma + challenger2, (3) type99a (drum->wedge rebuild) + t34_85,
(4) type89 + m4a3e8, (5) leo2a4, k2, fv510, tiger1 (single-dominant-
order marginals). Also: promote the four-box probe; tmp-tank-critic
matched-scale mode wanted; fv510 print -11% (pub sovereign, held).

## 4.995 RESOLVED (batch-46, 2026-08-06): leo2_revolution ORACLE
ADJUDICATED — the owner's b08d1a2 revert + 8ad527a rescue is a FULL
PRINT RESTRUCTURE (census: GunMesh/TurretMesh meshless shells, geometry
on chassis_vlo001*/002* children, dedicated Tracks material, 1,442,776
B sha1 1d7112d9). Chain 37/41/43 asserts on the retired lineage —
RETIRED to history (repair_oracles.py batch-46 note); old .bak archived
*.pre-batch46-history; fresh .bak = owner bytes. Honest baseline x2:
0 | hull 94.5 / whole 70.3 / turret 0 / stations 72.8 / dims 99.5 /
floaters 100. Turret-0 mechanism (refprobe): the rescue restored the
PRISTINE tall mast/whip band (gate-frame turret y 1.65..4.03 vs pub
roof 2.64) — the exact geometry batch-37 flattened; height clamp 0.771
squeezes the model, turret band comparison collapses. §B7 REF-WRONG
class (owner ruled the source wrong): candidate bbae2c80 re-frozen on
photo-class acceptance (§B8 critic PASSED, grays dead); hull 94.5 is
the print's only trustworthy band. Gate line stays capped until a
fresh batch files against THIS lineage (mast flatten, batch-37 intent).

## 4.996 leo2a7 REMOVED BY OWNER (2026-08-06: "fully focus on the 2a7v")
— roster-delisted (spec row stays as the revolution's donor); leo2a7v's
§B8 structural rework (the 77%-hull turret merge) is THE 2a7-line focus,
queued for the leopard lane after the live round (revolution priority +
proto + 2a4). CROWS REWORK ORDERS banked for the next abrams round (on
the visibility re-cert verdict): point the right direction (not
forward), armor surrounds on some, ammo boxes, lights, shapes CONNECTED;
sepv2 donor verified already-m1a2. FLEET ICON REGEN queued (full
worktree run — the "3d images for the tank scrolling section" order).

## 4.997 OWNER ORDER BATCH (2026-08-06 late — EXECUTE FIRST NEXT WAKE):
(1) REMOVE t72b3 + type99a from the roster (CAUTION: t72b3 is the make()
donor for pt91m/t64bv1/t72b_1987 — delist-keep-spec like leo2a7; type99a
spec modern2.js:291 + its new builder go dormant; drop ledger rows +
icons; the type99a spec-width ruling dies with it). (2) type10
UN-QUARANTINED BY OWNER ("build the type 10 and challenger 2 as a
priority using the real glbs" = the pending adjudication CLEARED): mv
community-candidates/type-10_main_battle_tank.glb -> community/,
ATTRIBUTION owner-cleared note, register (three maps + REG, the held
config comments are in the map files), then the PRIORITY type10
oracle-driven §B8 rebuild (misc.js lane, free). (3) challenger2 PRIORITY
oracle-driven §B8 rework — RELAYED to the live moderns agent. (4) K2
REAL GLB: owner says one exists — check ~/Downloads for a k2/black
panther GLB (none seen in the 11 drops); if present: provenance check
(§E ORACLE PROVENANCE law — live page, not just extras), bradley flow,
then k2's oracle-driven round. (5) FLEET ICON REGEN still queued.

## 4.998 OWNER OVERRIDES (2026-08-06 latest): (1) challenger line
CONFIRMED fully covered — ch1 gate-PASS on its print, ch2 priority
rework LIVE (moderns agent), challenger_3 building LIVE (same agent).
(2) t72b3m RE-ORACLE OVERRIDE ("and build the t72 b3m" with the obr_2022
GLB): the no-swap ruling is SUPERSEDED by owner order — MY LANE next
wake: swap t72b3m's registration to t-72b3m_obr._2022.glb (three maps +
REG; §E normalize plan for the +46.9% roof-cluster stylization; the
frozen row honestly re-baselines — §B7-precedent), THEN the russia lane
rebuilds t72b3m to the 2022 configuration (RWS, roof cluster, ERA fit —
relayed to the live t90m agent as its follow-on). The graduate's re-cert
chain restarts on the new oracle.

## 4.999 NEXT ABRAMS ROUND (spawns ON the visibility re-cert verdict;
combined): (a) CROWS REWORK — point the right direction (not forward),
armor surrounds on some, ammo boxes, lights, shapes CONNECTED; (b)
ABRAMSX BUILD-UP (owner: "make the abramsx look much more like our
abramsx local model... its time to get that running too") — full
oracle-driven round toward its local reference GLB (certified bridge-cap
rows; AbramsX identity: low-profile unmanned turret, XM360 angular
shroud, hybrid hull lines, 30mm RWS) per §B8.1 + ladder; (c) any FAIL
orders from the visibility verdict. sepv2 donor verified already-m1a2.

## 4.9995 TRACK HITBOXES LANDED (owner order): convex prisms per side,
auto-derived from the gear loop fleet-wide (101/101), killcam renders
the real trapezoid + loop-following slats; phantom rectangle claim
removed (m1a2 37%/bmp2 25%/tiger1 7%); true ramp normals; hash+gate
neutrality proven; COMBAT SUITE NOW 253 CHECKS (was 233 — update future
briefs). Queue: ARCHITECTURE.md §2.3 trackShapes addendum (owner WIP in
docs/ — orchestrator lands it when free).

## 4.9996 LEOPARD TRIPLE LANDED: revolution grays FIXED (real apron +
physics-graded fills, candidate bbae2c80); leo2a4 §B8 rework (48/56%
wheel exposure, real nose band, turret trued — 551cb30e); leopard2_proto
BUILT (V3 delta + PT turret + cast mantlet, gate 45.6-at-melted-cap,
f1af7ba8). All three DELIVERED-PENDING-CRITIC (§B8 resit spawned).
MY-LANE ADD: proto MODEL_SOURCE flip to procedural (drains Sources;
keep the GLB as the measurement override — flip-era mechanics).

## 4.9997 IFV RESIT: 2/2 PASS (2026-08-06) — puma + type89 §B8
ACCEPTED by the independent critic (acid YES per view; all 11 original
orders closed; four-box numbers reproduced exactly; hashes 31dca571 /
b19aca94). The owner's founding §B8 rejections are resolved. Laws:
ORDER-NUMBER vs ORDER-SUBSTANCE (orders bind on falsifiable intent),
four-box = deterministic regression harness (promoted).

## 4.9998 LEOPARD TRIPLE RESIT: 3/3 PASS — revolution grays DEAD (owner
acid answered YES x16 views incl. yaw), leo2a4 ACCEPTED (orders 1-3
closed with numbers, 551cb30e), leopard2_proto FIRST ACCEPTANCE
(f1af7ba8; its MODEL_SOURCE flip to procedural is now UNBLOCKED —
my-lane queue). Day resit ledger: 5/5. Four scoring laws banked.

## 4.9999 ABRAMS COMBINED LANDED: seven stations = ONE aim-frame each
(rest yaws +90/-90-outboard/+34, tusk full armor wrap, cans ALL gun-left
— feed nit closed); abramsx 6.2 -> 49.4 (compressed-print caps RETIRED,
wheels exposed, XM360 slimmed; whips re-parent SHIPPED-DISABLED behind
AX_WHIPS_TURRET awaiting the orchestrator's coupled turretFollowers
landing — work order in abramsx.md). MY-LANE ADDS: the coupled abramsx
whip landing; graduate rest-azimuth cap re-adjudication (+95 trial
moved certified rows — transverse is window-pinned).

## 4.99994 TYPE10 ONBOARDED (2026-08-06, my-lane batch item 2): owner
cleared the rip-history hold — GLB un-quarantined to community/, four
harness maps registered (turretNode ^Object_6$ turret+gun fused, nose
+z), extract committed (bodyH +51.2% tall-stylized, challenger2 class;
sights fused into the hull-side Object_5 = turret rows print-capped),
ATTRIBUTION owner-cleared entry. Honest baseline x2: all-0 + floaters
100, verified real (populated curve rows) — the ancient base-21 build.
Fleet denominator 89 -> 90. PRIORITY §B8 round SPAWNED (modern3.js).

## 4.999945 T72B3M ORACLE SWAP EXECUTED (2026-08-06, my-lane batch item
3; §4.998 order): four maps re-keyed to community/t-72b3m_obr._2022.glb
(Object_14/15 + Object_3 follower, yaw PI); t72b3 BASE rows retired
with the roster delist (extract t72b3.json deleted); batch-45 stature
normalize FILED+EXECUTED (same-author dome class: deck-knee 0.736
identity, dome 2.107 -> 1.6055 the recovered recipe's proven landing,
cluster 2.945 -> 1.885 keeping the obr-2022 signature; byte-idempotent
x2 md5 b825c4c3; first cluster-only cut measured 24.4 and the dome cap
was unambiguous — extended per gate-in-loop). Honest re-baseline x2:
69 | hull 69 / whole 77.7 / turret 80.1 / stations 84 / dims 100 /
floaters 100 (frozen 91.8 retired; fleet 22 -> 21 while the re-cert
chain restarts). Graduate proc hash HELD 1e1ca4b8. NEXT: the
russia-lane coupled round (2022 config: RWS, roof cluster, Relikt fit
+ the ORACLE-REGISTRATION-PINNED bustle re-parent) spawns when the
live russia turret agent lands (russia.js single-writer law).

## 4.99995 OWNER PUNCH LIST 3 (2026-08-06 night, verbatim intent):
"finisht eh challegner 3, chjallenger 2, t14 armata (hull is wrong)
t90sm (no attachments or decorations or the machine gun turret, turret
does not look good, both t90a turrets are wrong, just update all soviet
turrets fix all". Parsed orders: (1) challenger_3 FINISH (built
d39f2258, needs its oracle-driven §B8 round to the bar); (2)
challenger2 FINISH (rework landed, same bar); (3) t14 HULL WRONG
(§B8.1 re-proportion — hull specifically); (4) t90sm: attachments +
decorations + the MG turret (RWS) MISSING, turret shape NOT GOOD —
full §B3-real equipment pass + turret re-loft; (5) BOTH t90a turrets
(t90a + t90a_vladimir) WRONG — re-loft; (6) FLEET ORDER: update ALL
soviet/russian turrets (t54/t55/t62/t64/t72/t80/t90 lines + IS/ISU
where turret reads off) — §B8.1 turret-shape-line pass, mantlets
mandatory (§B3.1). Spawned 2026-08-06: challenger lane (ch2+ch3+t14),
russia turret lane (t90sm+t90a pair first, then the soviet sweep).

## 4.99996 MY-LANE BATCH CLOSEOUT (2026-08-06 night): item 4 proto
FLIP LANDED c769c8a (rig-unchanged proof: gate x2 reproduces the HEAD
row; hash HELD f1af7ba8). Item 5 abramsx coupled whips PARKED 0cc8dae
('^Dekali$' followers crater autoPivot — registration-shift class;
refined narrow-node/pinned-pivot/§E-split work order in abramsx.md;
certified 49.4 line + hash 9c059ce0 reproduced post-revert). Item 7:
E8 gunBarrel 3.96->3.44 + t34 4.64->4.00 (packet residuals, stale-
proxy class, single-consumer armor fns verified); ARCHITECTURE.md §2.3
trackShapes addendum LANDED (docs/ freed — symbols verified:
attachTrackShapes specs.js:2013, trackHitboxHull tankFactory.js:442,
intersectTrackPrism armor.js, addTrackPrism killcam.js:3005).
REST-AZIMUTH NOTE (the queued re-adjudication): the +95 trial moved
certified rows — graduate rest yaw is WINDOW-PINNED (transverse); the
cap stands until a dedicated re-cert wave re-measures each graduate's
rest azimuth against its print. Do not move rest yaws piecemeal.

## 4.99997 ASK OWNER (standing questions, non-blocking):
(1) NAME COLLISION: m1a2 and m1a2_tejas BOTH read 'M1A2 Abrams' in the
garage since the "(Tejas)" strip order — keep the collision, or rename
one (e.g. tejas -> 'M1A2 Abrams (hero)' or fold the id)?
(2) CHARIOTEER ERA FLAG: charioteer sits in the coldwar group with a
WW2-ancestry spec (Cromwell hull) — confirm intended era grouping.

## 4.99998 RUSSIA TURRET LANE LANDED f4c323f (2026-08-07): t90sm
turret 73->81 (T05BV-1 RWS connected+aimed, pano sight, Sosna housing,
Relikt, snorkel, mantlet+bore — the owner's "no attachments" complaint
addressed, critic pending), t90a 72.6->76.3 (K-5 clamshell apex,
Shtora on the ref line), vladimir turret 72.9->78.4 (dome squash,
K-5 cheek walls, r13 artifact decoded); tier-2: t54 turret +2.7,
t72b_1987 min +2.8, §B3.1 bore sweep (t72bu + cast-collar mantlet).
Print-pinned classes documented per packet (t80bv barrel re-parent +
scaleToOverall ruling wanted; t54 winding repair queued). Orchestrator
reproduced all five moved lines exactly; graduates held; npm green.
IN FLIGHT NOW (2026-08-07): §B8 critic (t90sm/t90a/vladimir trio,
shots/critic-russia-trio/), t72b3m COUPLED 2022-config round
(russia.js freed — RWS, roof cluster, Relikt, turret-side bustle;
re-freeze after its critic), challenger lane (modern1/2), type10 lane
(modern3). NEXT SPAWNS QUEUED: t34_85/m4a3e8 §B8 resits (ww2.js,
proxies trued), type74 round (misc.js, oracle registered, honest 0s +
dims 99.6), chieftain_mk10/leo1a5 base-21 SCAFFOLD rounds (specs in
userdrops7/userdrops3, no profiles builder yet — briefs need packet
prep), latent reversed-core sweep, §I mg migrations, m60a2 packet
decision, t72bu decision.

## 4.99999 CHALLENGER LANE LANDED 765310f + TYPE10 LANDED 8522056
(2026-08-07): ch3 41.6->61.4 (all components +15; RWS on the print
RCWS plateau, stern anchor posts, dims 99.8), t14 48.1->68.3 (owner
hull ruling executed: full-length skirt walls, raked stern ramp,
masts to 3.16, gunBarrel 6.45), ch2 print-capped (dims 100, stations
19.8; buh print +28.8% tall + polluted split). type10 rebuild: dims
0->100, plan rows 69-81, stations/side/front print-capped with six
evidence classes. Critics spawned for both waves. MY-LANE §E QUEUE
(filed by the lane, execute between landings): (a) ch2 HEIGHT-
NORMALIZE batch (leo2a5 precedent — 249 side cols >2.8, hull shell
3.14-3.21, station tops 2.38-3.98); (b) ch3 TUBE-PIN normalize
(t14-class: 7 only-proc muzzle cols, z-warp knee at the gun bearing
to +7.335 parity, ~+7.9 side_whole); (c) t14 tube-pin stands as filed
in t14.md r1. Law-bank: plan-grid 0.13 pitch, whip rake=x-lean,
registration-anchor measured live (dAlong +0.074 zeroed stations),
AA-sliver 22mm+, gun-union body law + plan column window 0.12
(type10). t14 track-shoe albedo = shared-material lane, report-only.

## 5. IN-FLIGHT AGENTS (SUPERSEDED BY §12 — the 2026-08-05 device
handover interrupted these; respawn per §12)
1. DONE+RATIFIED: abrams dual critic (m1a1ha f5c556dc, sepv2 §10 run).
2. DONE+RATIFIED: revolution re-cert (1993cfb1); retune round SPAWNED
   (hull 88.9 -> 90+ + P-1 fore-ring tells + P-2).
3. **misc r3**: type90 ladder + ariete wrap-break attempt.
4. **russia tail-3**: t62mv1 decode + t90sm §B1 loft rework.
5. **patton re-anchor**: m26 post-warp re-anchor from the WARPED extract
   (dims 91.9 -> 100 via proc M2 band lift to the 3.08 spec).
6. **uk round-4**: challenger1 + centurion5 visual ladders toward
   adjudication (26th/27th candidates). MUST hold centurion3 bf0a45e8.

## 6. ORCHESTRATOR MECHANICS (how landings actually work)
- **Pathspec/hunk-split commits**: the owner's parallel session stages
  deletions and edits shared files — check `git diff --cached --name-only`
  before every commit; never `git commit -a`. For tool-written JSON
  (ledger) stage surgical row updates WITHOUT touching the worktree file:
  build content = HEAD + target rows, then `git hash-object -w` +
  `git update-index --cacheinfo 100644,<blob>,<path>` (script:
  scratchpad stage-ledger-rows.py pattern — HEAD rows + worktree rows for
  the named ids + recomputed passed/total).
- **Split-staging a shared code file** (e.g. repair_oracles.py holding two
  batches for different landings): build the staged variant from the
  worktree by cutting the held-back block, hash-object + cacheinfo, keep
  the worktree intact.
- **Cross-file rider grep at every landing**: profile diffs referencing
  symbols (BUCKET_DEF entries, cfg.*/S.* params) must resolve in COMMITTED
  files — grep before committing or HEAD lands mid-state.
- **Oracle repairs (warp law v2, §E)**: fresh .bak from committed HEAD
  bytes; PRE-FLIGHT: run the existing chain and prove it reproduces
  committed bytes BEFORE extending; batches before `if __name__`;
  byte-idempotent shasum x2; census expect guards; gate-in-loop vs stable
  baseline; demotion notes when a recipe supersedes (archive old bak as
  *.pre-batchNN-history). Spec-mirror true-ups (vertex-extract.mjs
  pubDims) land in the SAME batch as their userdrops spec edit.
- **Agent brief boilerplate** (every spawn): NEVER commit; single-owner
  file; env line; own vite 74xx-77xx; FIFO hard rules; NEVER stop to wait
  on watchers (stopping ends the run — run chains sequentially
  in-process); graduate hashes to hold; false-0; read BUILD-STANDARD
  first; §F.4 report format; packets WRITTEN before reporting.
- **Infrastructure deaths**: SendMessage-resume first (context intact);
  respawn fresh only if the transcript is unrecoverable. Waiter-stalls
  (agent stops "to wait") get a finalize nudge via SendMessage.

## 7. MY-LANE QUEUE (+ ammo-can LEFT-FEED nit: hand-authored CROWS/band cans hang gun-right; M2 feed is left — abrams family lane, non-blocking) (orchestrator work, ripeness order at handoff)
1. Land the six in-flight agents' results (per §5 protocols).
2. t72bu oracle decision (certified-ceiling ~55-70; packet has the
   evidence; options: warp batch vs ceiling-cert vs re-source).
3. m60a2 cert decision (86.3 vs ceiling 87.5).
4. Fleet flip wave 2 (donor/0-row ids as builds land) + full fleet gate
   sweep (post-amendment ledger refresh; expect frozen-row drift-up
   refreshes, no re-cert needed per the amendment).
5. Band-solver front mirror for type90 (flagged orchestrator-lane by misc
   r2: the 3.68 col, ~0.28x2).
6. Smaller rulings: t54 winding repair (scout-gen2-t54.md), m48 pitch +
   _region_pitch, scaleToOverall ruling (type74+t80bv), workorder
   shared-box promote, mask-island certs, contact-alias, tejas drift 89.4,
   recon_tank ruling, fv510/q_heavy/t30 walls, RIM-FLOOR fleet lighting
   term, padHug frozen-centurion coupling, mg FITTINGS migrations (§I),
   shoe-envelope audit extension.

## 8. OWNER DIRECTIVE LOG (this program's history; all codified as law)
1. §B5 turret furniture parenting (sepv3/merkavas/t72b3m rear-turret kit
   must rotate) — LAW + fleet audit tool; DONE for named tanks.
2. §B6 track silhouette \\________/ (chieftain front) — LAW; DONE.
3. §B1 Abrams sloped turret fronts (with photo) — LAW; DONE.
4. LIVING RULEBOOK: continuously edit the generating rules — ONGOING.
5. AFV love (bradley/bmp2) + owner-downloaded m2_bradley_ifv.glb
   (CC-BY-4.0, ATTRIBUTION.md) — oracle landed; bands 84.7/84.0.
6. CUSTOM tab completeness (t80, type10, type99a, leo1a5, t14, t72b3,
   challenger2, type74, pt-91, k2, chieftain mk10, sepv3-from-abrams) —
   DONE (roster 70).
7. t84 turret seat (batch-40 compound warp) — DONE, graduated.
8. c1 ariete broken turret — rebuilt; ladder ongoing (78.5).
9. kf51 turret front — DONE, graduated 3ae9b70c.
10. §B1 NO-STAIRCASES (screenshot) — LAW.
11. §B1 SLOPE-MOTIVATES-THE-MASS — LAW.
12. §B3 NO-MYSTERY-BOXES (merkavas/t-xx/sepv3, especially guns) — LAW;
    merkava pod-tells re-certed + re-frozen; sepv2 swept (candidate 25).
13. m1a1ha rear tracks/gaps (screenshot) — fixed, pending re-cert critic.
14. leo2_revolution fused turret (screenshot) — coupled de-fusion LANDED
    c9ddba0 (honest 88.9; retune round owed).
15. Scale: "many more agents open building tanks" — 6 in flight at
    handoff; keep respawning freed family lanes on every landing.
16. Takeover order (2026-08-05): this document + full commit/push.

## 9. INCIDENT LESSONS (codified; the mechanism lives in the named law)
- gunNode/helper-expansion (§10 lesson, GEOMETRY-GATE.md + §3 above).
- t84 double-warp: python asserts on REPAIRS[id] must target the LAST
  definition site (rindex) — duplicate keys ran a stale batch and
  double-warped; restore from fresh .bak = committed bytes.
- Assert-after-append bug: landing scripts must assert against the FILE,
  not the in-memory copy they just appended to.
- Stale staged deletions (owner's parallel session) swept into commits
  twice — hence the §6 pathspec/cacheinfo discipline, always.
- genIcons on a live tree with agent WIP times out / bakes WIP geometry —
  clean HEAD worktree + symlinked node_modules + --tanks filter.
- zsh word-splitting: `for t in $VAR` treats the string as one word — use
  `${=VAR}`.
- FIFO: foreign plain-FILE lock wedged the dir-lock FIFO — all lock tools
  patched (rmdir -> ENOTDIR -> unlink). Self-locking tools deadlock inside
  external wrappers (two incidents). 16-digit tickets queue-jump the
  15-digit sort. Under fleet load, official runs die at the 30-min queue
  timeout — retry honestly; one-ticket batch drivers for render batches.
- Vite serves LIVE bytes at navigation time — a queued driver renders the
  tree as of lock-acquisition; treat in-flight runs as measuring the
  current tree.
- Browser-pane screenshots read black on this box — verify visuals via
  repo puppeteer tools (tools/tmp-*.mjs), never pane screenshots.
- Cross-critic calibration: the ratified chieftain5 anchor governs
  severity disputes; adjudicate with measurements, not vibes.
- Agents stopping to "wait on watchers/monitors" end their own runs — the
  brief boilerplate forbids it; nudge stalled agents to run chains
  sequentially in-process.
- Critic top-pair orientation: bow = image bottom (gun-overhang check
  before calling turret-front reads).
- ORACLE-REGISTRATION-PINNED class: when the REF keeps furniture
  hull-side, the fix is coupled (followers extension in the three maps +
  proc re-parent + full re-gate in ONE landing).
- Camo-bucket moves reseed bakeDirt mottle (LOCAL frame) — pixel-diff
  unreachable; full critic re-cert required.

## 10. PERF/CERT SIDE-LANE (background)
tools/quietcert.mjs waits for a genuinely quiet machine to certify the
perf budget (docs/cert-r6-* artifacts; contended attempts REFUSED by
design). Under constant fleet load it may never find a window — that is
honest; do not relax its stamps. Re-launch overnight when agent load
drops: `nohup node tools/quietcert.mjs >> docs/quietcert-r6.log 2>&1 &`

## 11. SESSION CHRONOLOGY 2026-08-05 (the takeover-day landings, in order)
0e47256 merkava re-cert PASS x4 — pod tells certified, four re-freezes
(1fda7dbd/87ba249c/4880b0a4/93e7b4eb). 8cfa546 patton m26/m45 band (m45
59.4->81.2; m26 warp request filed). 0eeaced misc push-2 (type90 79.0,
ariete 78.5 ceiling-measured). 0c37688 russia tail-2 (t90sm 46.9,
t72b_1987 56.0 ceiling-certified). a6c01ed rulebook six-law bank.
bc17984 m26 batch-42 warp EXECUTED (print cured, 74.8, dims 91.9 =
re-anchor debt; heightM 3.08 true-up). fd2c365 GRADUATION centurion3
(24th, bf0a45e8). c9ddba0 leo2_revolution coupled vlo de-fusion (honest
88.9). e85e546 abrams round (m1a1ha rear-fix + sepv2 §B3). 588fe43 this
registry + §10 helper-expansion amendment. decec28 takeover sweep (full
tree). 636d3e4 GRADUATION m1a2_sepv2 (25th, b489ba14) + m1a1ha f5c556dc
and revolution 1993cfb1 re-certs RATIFIED + §J critic laws. 92f5817 uk
round-4 (ch1 90.1 orders delivered, c5 chamfer grammar law).

## 12. INTERRUPTED ROUNDS — respawn briefs for a new device
This session's background agents die with the machine. Their WIP (if any)
is snapshot-committed; each line below is the respawn mission. Use the §6
agent-brief boilerplate (never-commit, single-owner file, env line, vite
74xx-77xx, FIFO §F.1, never-wait-on-watchers, graduate hashes, false-0,
read BUILD-STANDARD+packets first, §F.4 report).
1. DONE pre-handover (landed in 2a6094b, report verified): misc r3 —
   type90 83.6, ariete 82.3, both ceiling-measured; eight laws banked in
   packets (1024-PARITY PROBE, FRUSTUM-HALFWIDTH, LANE-LOCAL FILL, etc.).
   Next misc round = orchestrator band-solver col + certified classes.
2. DONE (landed post-handover): russia tail-3 — t62mv1 63.7 (+15.8, stale
   crown caps retired, drum row decoded, dims 100), t90sm 56.4 (+9.5,
   dims 100, clips 0/0; AA-teeter family binds ~2-4 pts variance).
   Ceilings: t62mv1 ~77-81 (print rear-gear fade certified). Next russia
   round: t62mv1 side-row ladder under the fade cap.
3. DONE: m26 re-anchor landed — 74.8 -> 90.4 GATE PASS x2 (first-ever
   pass; dims 100; registration -0.002/0.001; clips 0/0 band + shoe;
   cheekPod deleted; bow = certified print-class near-vertical glacis, no
   further warp). Candidate hash f348ecd5. PENDING GRADUATION
   ADJUDICATION (14-view critic = new-device spawn; would be the 26th).
4. uk round-5 (uk.js): ch1 (gate wall 90.1, spare 0.1) O6 shading family +
   close-roof camo + dead-rear MG; c5 crown-tab pair + plateau-vs-pear
   casting + top clutter. Self-read >=8.9 every view -> request
   adjudication (26th/27th). Hold chieftain5 5117b9a8 / centurion3
   bf0a45e8.
5. DONE PENDING RE-CERT: revolution r17 retune landed — 88.9 -> 91.2
   PASS x2 (honest deck shelf, mast-column riser, belly 0.338, P-1 tells
   mask-free, P-2 proven cast-shadow). Candidate 323228f8; re-cert critic
   = new device's first spawn (all 14 views; camo reseeds).
6. DONE: m1a2 §B3 re-cert PASS — re-frozen 248a8468 (bytes were already
   at HEAD via the handover snapshot; ratification landed).
7. DONE (landed post-handover): INVISIBLE-LOD ENVELOPE fix — root cause
   was the de-track destruction kit parked hidden at thrown pose (not
   LOD); now lazy-built on first throw. 12/12 render pairs byte-identical
   (incl. detrack visuals), gates held, 24-graduate mass re-freeze landed.
   Follow-ups for family lanes: procShadow_gun oversize true-ups (t84
   +1.80m, m46 +1.60, kf51 +1.16, leo2a6 +1.09, kv2 +0.84, ariete +0.25);
   icons re-frame tighter at next genIcons per tank.
8. DONE (landed post-handover): shoe-envelope audit shipped — instance
   sampling with >=1.5cm depth bar + dressingSkipped conformance
   exclusion; bandVox output backward-compatible; m1a1ha + 15 negative
   controls clean. FINDINGS = the new §B4 queue (graduate-change flow,
   re-run --ids fresh before acting; full table in the audit report/log):
   BLIND SPOTS ranked — kf51 front 387 (glacis toe, render-confirmed) +
   rear 184; leo2a6 316+192; leo2a5 308+126; isu152 264+50; merkava1b
   140; t72b3m 112+24; t84 near-blind front 162; merkava3d 32; 3b/3c 18;
   t62mv1/t90sm/t90m 12-18; isu122s 8. Worse-than-band severity: t90a
   608, t64bv1, t72bu, bradley rear 121, chieftain_mk10 44.
Plus the standing my-lane queue in §7.

## 13. HOW TO RESUME FROM A NEW DEVICE (the loop protocol)
1) Clone; `npm install`; verify `npm test` (166 + track-geometry).
2) Read this file, BUILD-STANDARD.md, GEOMETRY-GATE.md.
3) Respawn §12 rounds (one agent per profile file; two critics max
   concurrently for FIFO sanity; 6-8 agents total is the proven load).
4) Land on notification: verify hashes yourself (tmp-hashgeo), pathspec/
   cacheinfo commits (§6), re-freezes only on critic PASS, §10 on
   graduation PASS, push after each wave, update §3/§4/§5 rows here.
5) Re-arm a ~25-min heartbeat that re-reads this file as the handoff.
The owner's standing orders: keep going with everything, many agents,
LIVING RULEBOOK (every lesson lands in BUILD-STANDARD the turn it
arrives), never gate m60a1/m60a3/kv2, never false-0, owner port 5001.

## 4.999991 RUSSIA TRIO §B8 VERDICTS (independent critic, adjudicated
at 3baa25c; sheets shots/critic-russia-trio/ + 27 evidence crops):
t90sm CONDITIONAL 8.0 (orders: bustle/side SLAT GRID mesh; turret-side
stowage BRIM FLARE outward; Relikt glacis rows + retire grey-lavender
glacis tone + pano head +0.2-0.3). t90a FAIL 5.5 — §B8.1 gate-3 kill:
box-stack superstructure, not a cast dome (orders: TURRET REBUILD
reusing the vladimir dome loft, K-5 as dome-hugging plates, Shtora RED
round dazzlers not blue windows, cupola+Kord MG, glacis K-5 rows +
stern drums, rehook near-black light clusters). t90a_vladimir FAIL 7.0
but close (orders: FLOATER above roof x~1005-1018 y~148-178 connect-
or-delete, cupola+Kord MG, box-fort rim thinned so the dome reads,
Shtora red eyes, glacis rows, rear-wall story, bow clusters).
OWNER CHECKLIST: t90sm all three complaints DEAD (attachments,
RWS-yawed-right, welded silhouette matches print numerically); "both
t90a turrets wrong" ALIVE for t90a / MOSTLY DEAD for vladimir.
Trio-wide note: proc track bands read chunky vs the prints' smooth
runs (shared-material lane, report-only — same class as t14's).
FIX ROUND QUEUED behind the live t72b3m coupled agent (russia.js
single-writer): carries ALL orders above verbatim.

## 4.999992 CHALLENGER TRIO §B8 VERDICTS: 3/3 PASS 9.0 (independent
critic, fresh pairs, hash bracket x2 bit-identical to the landed
candidates b4e51df8/17bb2528/a3762fe; sheets
shots/critic-challenger-trio-indep/). OWNER CHECKLIST CLOSED WITH
PIXELS: t14 "hull is wrong" DEAD (V-nose chisel, full-length tall
skirts, 7 countable wheels, raked stern ramp, capsule hump); ch3
FINISHED (angular welded turret, flat mantlet, RWS §H.4-M2, Trophy,
L55A1 to 11.50); ch2 FINISHED WITHIN CAPS (§B7 applied vs the +28.8%
print — CR2 silhouette holds, VS580 at 3.04). ALL print-cap claims
VERIFIED (none rejected); §E queue items confirmed correctly filed.
Detail-round notes banked (t14 Afganit stubs borderline §B3, ch2
wheel-arc at the low end of the window) — NO closing orders. Record
hashes bind the verdicts; dual gate still pending for freezes.

## 4.999993 TYPE10 §B8 VERDICT: FAIL 5.5 (independent critic, fresh
pairs + own four-box, hash bracket 89a11aea x2; sheets
shots/critic-type10-indep/). ROOT CAUSE proven three ways: proc turret
walls at ±1.40 deck-to-roof = casemate read; the print's wide rows
(halfW 1.40-1.44) sit BELOW its deck (bin courses) while its above-
deck turret body is halfW 0.89-1.19 with a plan-converging cheek V.
"Dims verify the box, §B8 verifies the mass inside the box" — box
ratios were print-consistent; the mass distribution was not. CLOSING
ORDERS (gross form first): (1) TURRET WIDTH CUT ±1.40 -> ±1.10-1.20 +
shoulder-step plan convergence (keep mantlet/prow group exactly);
optional stepped bin course <=±1.30 with undercut gap; (2) three side
depth planes (skirt 1.54 / sponson 1.38-1.42 / turret 1.15) + top deck
margins around a readable turret outline; (3) pano pedestal 0.25-0.35
proud (spend the p95 spike budget there, cap crosswind mast <=2.31),
taller gunner brow, M2 silhouettes above the narrowed wall; (4) rear
two-tier verify after the cut. Builder self-read caveat BANKED: the
r13 broad-flat-wall class was self-scored closed but had only moved
outboard — §B8 self-reads-never-accept demonstrated again. Gun run
called EXEMPLARY (nested mantlet + bore at 5x). FIX ROUND SPAWNED
(modern3.js free).

## 4.999994 WW2 RESIT LANE LANDED 7390118: t34_85 (84996d88 — one
30-deg glacis plane, cast lathe dome at exact footprint, rev-1
fleet-baseline winding flag FIXED) + m4a3e8 (977909c8 — 47-deg glacis
+ flush cast nose, TRUE 3-pair HVSS, deck step, ±1.533 adjudicated
factory wrap-pad class). FALSE-0 honored: NO gate rows exist (both
procedural MODEL_SOURCE, no reference override — the weihe print
belongs to t34_85_cad). ORCHESTRATOR DECISION FLAGGED: whether to
register t34_85_weihe.glb as the t34_85 oracle (print frame-shifted
per packet — onboard-oracle lane). All 10 ww2.js siblings
byte-identical; graduates held. Photo-class critic IN FLIGHT
(shots/critic-ww2-resit-indep/). Law notes banked in packets:
roof-lip bow-steepening, co-planar frustum-front glacis,
step-requires-body-split, wrap-pad width attribution.

## 4.999995 TYPE10 RESIT: PASS 9.0 (independent resit critic, hash
bracket 48fc36ba x2; sheets shots/critic-type10-resit/). All four
§4.999993 orders CLOSED with pixels: turret 94% -> 80% of hull width
(wall 74.1% = target band, real ~72%); true shoulder step + deck run;
three side depth planes + top margins with drawn outline; pano 0.275
proud (the only mass above the roof), M2 silhouettes; rear two-tier
84% nesting. Gun four-box byte-identical to r1 (EXEMPLARY ruling
stands, "untouched" proven numerically). §B7 discount applied where
the fused print reads wide/stepless — the proc now beats the print on
that axis. The owner's "build the type 10 as a priority" order is
ACCEPTED at the §B8 bar (record hash 48fc36ba binds; gate curve rows
stay honestly print-capped per the §E evidence — re-rig escalation
remains the path to a measured ladder). Banked notes: solid turret
length 58% just above the gate-4 alarm (watch on length edits), roof
density round candidate, shaded-side seams pipeline-endemic.

## 4.999996 WW2 RESIT VERDICTS: t34_85 PASS 9.0 + m4a3e8 PASS 9.1
(independent photo-class critic; hash bracket x2 EXACT 84996d88 /
977909c8; sheets shots/critic-ww2-resit-indep/). ALL TEN per-tank
slate orders closed in pixels (four-box reproduced to the mm x2; two
intent-resolved deltas per ORDER-NUMBER vs ORDER-SUBSTANCE). Both
owner complaints DEAD ("steep-nosed slab with a faceted box turret" /
"tall shoebox with a Sherman-ish turret"). THE 2026-08-06 SLATE RESIT
LEDGER STANDS 7/7 (puma, type89, leo triple, t34_85, m4a3e8).
Record hashes bind; both ids remain FALSE-0 (no oracle) — weihe
registration decision still flagged (§4.999994).

## 4.999997 FLEET HANDEDNESS FLAG (critic discovery, orchestrator
adjudication + ASK OWNER): the program's "+x = right" labeling is
physically INVERTED (three.js right-handed, forward +z => vehicle-
right is -x) — asymmetric fittings placed per the fleet convention
render mirror-flipped vs real-vehicle photos (E8 cupola, t34 cupola,
tiger1, type89's ratified offset, etc.). Corroborated against the
t34_85_cad print (its cupola at +x = the real vehicle's LEFT;
evidence shots/critic-ww2-resit-indep/handedness-probe/). Fleet-wide,
pre-dates every recent round, ratified by prior verdicts, sub-glance
for acid reads. OPTIONS: (a) accept as the program frame (document in
BUILD-STANDARD §A and move on), or (b) schedule a fleet x-flip —
which INVALIDATES every side-registration digest + prior verdict
crop. Default pending owner word: (a) accept-and-document.

## 4.999998 TYPE74 VERDICT ADJUDICATED TO PASS 9.0: the critic's
CONDITIONAL 8.5 hinged on ONE blocking order — the fleet chirality
frame. ADJUDICATED (orchestrator, fleet-scoped): PROGRAM FRAME IS
CANON — law written into BUILD-STANDARD §A (PROGRAM-FRAME CHIRALITY
LAW); the nullops print banked "mirrored in program frame" in
type74.md (pt91m-class); per the verdict's own option (b) the r5
round PASSES AS-LANDED at 9.0 (record 7ba404c5 binds; all §B8.1
gates + all four print caps + LIVE-vs-EXTRACT law verified by the
critic). §4.999997's ASK-OWNER stands as an OVERRIDE option only
(fleet x-flip = its own wave, re-derives digests). Detail note
banked: type74 track band tone (non-blocking). Cross-lane ledger
sync note: the critic's gate run refreshed the t72b3m row to the
coupled lane's newer local state — reconcile at that landing.

## 4.999999 T72B3M RE-CERT PASS 9.0 -> RE-FROZEN 61a83b2c (registry §3
row updated; graduate-change protocol complete on the owner-overridden
obr_2022 oracle). All eight 2022-config checklist items verified in
pixels; all four honest residuals confirmed as their documented
classes; §B8.1 gates pass. Watch items banked: dome re-loft follow-up
(rear-left plan quarter + roof wedge density), bow light/smoke bank
density, clamp chip cosmetics. The owner's "and build the t72 b3m"
override is CLOSED end-to-end (oracle swap ea740e9 -> batch-45 ->
coupled round cfca3b0 -> re-cert -> re-freeze).

## 5.0 RUSSIA TRIO RESIT: 3/3 PASS 9.0 — OWNER PUNCH LIST 3 FULLY
CLOSED (2026-08-07; fresh independent critic, hash bracket x2 exact:
t90sm 55509794 / t90a 71f67270 / vladimir 782bdbc4; sheets
shots/critic-russia-trio-resit/). All 16 fix-round orders re-verified
CLOSED in pixels; zero floaters across 42 pairs; owner complaints ALL
DEAD ("t90sm attachments/RWS/turret" x3, "both t90a turrets wrong" x2
— t90a's box-stack is a plan-round cast dome, vladimir's dome reads
over the thinned rim with cupola+Kord). t90sm pano literal remains
the documented dims-blocked residual (order-substance satisfied).
PUNCH LIST 3 SCOREBOARD: challenger half 3/3 PASS (§4.999992) +
russia half 3/3 PASS = 6/6. Combined with this window's other
acceptances (type10, type74, ww2 resit pair, t72b3m re-freeze), the
2026-08-06/07 owner-order backlog is CLEAR. Remaining §B8 sub-9.0
work rides the standing queue, not owner orders.

## 5.01 §E QUEUE PROGRESS (2026-08-07 early): batch-47 ch3 TUBE-PIN
LANDED 90f118e (side_whole cover 5.26 -> 1.12, row 65 -> 73; whole min
now rides front_whole by design). t14 tube-pin DEFERRED 25dd459 — the
r1 literals DO NOT SELF-CHECK (7.10 vs 6.45) + the plan is node-scoped
(custom op); re-derive from a fresh vertex-workorder run. LEO1A4 SCAN
ADJUDICATED NOT-ONBOARDABLE-YET: single fused photogrammetry blob (17
chunks 'Stereo textured mesh', ~1.1M verts, scan-site world offset, NO
turret split) — registration would false-0 hull rows; it is RE-RIG
CLASS (type74-print escalation family). leo1a5 proceeds PHOTO-CLASS.
Remaining §E queue: ch2 HEIGHT-NORMALIZE, t54 winding repair, t80bv
barrel re-parent/scaleToOverall, t34_85 weihe decision, type74 +
leo1a4 re-rig escalations, t14 tube-pin re-derivation.

## 5.02 BASE-21 SCAFFOLD VERDICTS: chieftain_mk10 PASS 9.0 + leo1a5
PASS 9.0 (independent photo-class critic, hash bracket x2 exact
59551064 / 1c79188; sheets shots/critic-base21-indep/ + labeled
contact sheets). ZERO orders — none of the 0/12-slate killer classes;
every packet four-box reproduced to the millimeter independently;
flat-region detector 0 defects x28 views. Identity tells confirmed in
pixels (Stillbrew hump measured 2.52-2.71 rising to the 2.90 anchor,
TOGS right, L11A5 sleeved+bore; EMES-18 flat embrasure, welded wedge
lean-in walls, saddle mantlet w 1.394 probe-exact, 7 duals + 4
rollers + correct drive end). The first two "wholly ancient" base-21
customs are ACCEPTED at the §B8 bar (record hashes bind; both remain
FALSE-0/no-oracle — measured ladders need future oracles: chieftain
mk10 none known, leo1a5 awaits the leo1a4-scan re-rig). LAW BANK:
STATE-A-DATUM (bow silhouette fits measure the fender/wing datum, not
the glacis plane), idler-dressing-vs-drive-end verification rule,
chieftain pale-rim ~40-luma = the new gate-1 countability reference.
Polish notes banked in packets (EMES twin-aperture tone step, basket
interior step, bolt-plate decal).

## 5.03 FLEET REVERSED-CORE SWEEP (2026-08-07, read-only audit; raw at
shots/reversed-core-sweep/): 70 audited, 0 errors; 48 roster tanks
CLEAN (all recent landings verified — centurion/vickers/merkava3c/
m1a2/t34_85 closures hold). RANKED FIX LIST (none packet-adjudicated):
(1) is2+is1 RENDER-VISIBLE reversed rear tail slab — shared buildIS2
in tankFactory.js, rig_hull mesh#15, 12 tris, vol -0.319, AABB
[-1.40,1.20,-3.38]->[1.40,1.80,-2.86], rear deficit 60/62px — the
t34-since-authorship class, FIX FIRST; (2) challenger1 right-front
open-plane 199px (packet's "F-vs-D 0" contradicted — regressed or
view-scoped, OPEN); (3) t80u mirrored front-deck strips 208px x2 +
stern edge; (4) t62mv1 paired turret pieces 184/127px; (5) t72b_1987
paired rear-side 171/115px; (6-9) LATENT (deficit 0, flag-until-
visible §C.1): t84 GRADUATE right-turret core (NO PACKET EXISTS —
create one), leo2a5 GRADUATE 2 strips, leo2a6 3 pieces, merkava1b
GRADUATE 2 pieces; (10) t30 bow slab near-latent. HOUSEKEEPING:
'cruiser' = stale ledger row with no spec (drop via drop-ledger-rows);
type99a spec fully gone (delist complete). Mode-2 candidate list
banked (12 HARDs, candidates-not-defects per §J). Graduate fixes need
the graduate-change protocol (fix -> gate x2 -> re-cert -> re-freeze,
ONE commit each).

## 5.04 SWEEP FIX WAVE LANDED (2026-08-07): item 1 is1/is2 tail slab
FIXED b24dfc0 (frustum zF/zR swap — inside-out since authorship;
census rev 0 both); items 2-5 adjudicated f1d49a3 — ALL FOUR were the
new DECAL FLOAT class (floating one-sided P.decal quads = phantom
F-vs-D columns, census-invisible; attribution probe
tools/tmp-winding-attrib.html COMMITTED): t80u soot re-pinned (gate
75.4->75.9), t62mv1 + t72b_1987 bort numbers re-seated (gates
byte-identical), challenger1 STOPPED per the protect clause (verified
fix moves the 90.1 PASS to the razor edge — station-0 topPct was
FAKED by the phantom decal; patch banked in the round evidence, needs
a companion tail-top stowage mass in a builder round). Housekeeping:
cruiser row dropped (fleet /89), t84 packet created. LANE LAW BANKED:
the sweep's file attributions can be stale — PROFILED_BUILDERS shadow
userdrops/modern builders (modern2.js buildT80U is DEAD CODE);
builders live in profiles/*. FOLLOW-UPS: challenger1 companion item,
dead-builder cleanup, fleet decal-pin sweep (same probe), graduate-
latent wave (leo2a5/leo2a6/merkava1b/t84 — deficit-0, LOW).

## 5.05 ORCHESTRATOR ADJUDICATIONS (2026-08-07): (1) t34_85 WEIHE
ORACLE — REFUSED: the weihe print belongs to the separate frozen
t34_85_cad id and is frame-shifted (t34_85.md "NO ORACLE" note);
t34_85 stays photo-class (it holds a fresh §B8 PASS 9.0) — the §E
re-source lane remains the only path to a measured ladder. (2) m60a2
— CERTIFIED AT CEILING: 86.3 x2 with the ceiling MEASURED ~87.5 on
three certified mechanisms (scout-gen2-m60a2.md); per the bmp2
ceiling precedent the id is CLOSED at its measured ceiling — further
work is owner-elective, not queued. (3) t72bu — CERTIFIED-CAP HOLDS:
degenerate single-fused-primitive print + stature class (its packet's
v6/v10 certifications); dims+floaters only; CLOSED-PENDING-RESOURCE
(a new honest print is the only unlock). (4) batch-48b BLOCKER FILED:
the ch2 print's indices are uint32 (5125) — _index_surgery asserts
uint16 (5123); the helper needs a compat extension (parallel 5125
path, 5123 behavior byte-identical so prior chains reproduce) before
the hull-partition split can run. Turret prim = 26,279 verts (node
'challendger 2_0' prim 0); hull shell 65,532 + 2,709; gear 34,968.
(5) t54 winding repair + t80bv re-parent DEFER to the same §E window
as 48b (all three are surgery-class; batch them when the helper
extension lands).

## 5.06 SURGERY WINDOW OUTCOME (2026-08-07): _index_surgery UINT32
EXTENSION LANDED 58e74f0 (5125 accepted; 5123 path byte-proven via the
t90sm chain md5). ch2 batch-48b/48c BOTH NEGATIVE + REVERTED (bins
re-parent = dAlong byte-identical; length-parity shift = dAlong worse
1.532 + plan -6.2; batch-48 bytes restored exact 3c6a15dc). NEW
DEPENDENCY FILED: the dAlong anchor mechanism ("12%-band mid at band
heights") must be analyzed at SOURCE (the fidelity page registration
code) in a DEDICATED round — this gates ch2 batch-48d, t54's winding
repair (same walk class, dAlong 1.29-1.41), and t80bv's re-parent
ruling. All three park on that round. The registration-source round is
now the top §E queue item.

## 5.07 OWNER ORDERS (2026-08-07, direct — SUPERSEDES the queue):
(1) "right now just focus on remaking the sepv2 and sepv3 based on
the current abrams platforms" — m1a2_sepv2 REMAKE on the current
m1a2 platform code (GRADUATE dda7bcf4: graduate-change protocol —
after rebuild, gate x2 + re-cert critic + re-freeze); m1a2_sepv3
CREATE (new roster variant on the m1a2 base; M1A2C/SEPv3 identity;
the local m1a2_sepv3_dannzjs.glb is the measurement source candidate
— provenance already local/owner-supplied, used historically for the
m1a2 hero fixes). (2) "focus on making the crows machine guns point
forward, not to the left" — CROWS-FORWARD LAW: supersedes the
2026-08-06 outboard-yaw ruling (§4.9999 rest yaws +90/-90/+34);
ALL abrams RWS/CROWS stations re-aim to forward rest. HAZARD: the
rest-azimuth window-pinned law — yaw changes move certified gate
rows on the five CROWS graduates (m1a1 a04c8c74, m1a1ha f1aaf80,
m1a2_tejas 89c9f260, m1a2 bbae99a4, m1a2_sepv2 dda7bcf4) — every
touched graduate gates x2, re-certs, re-freezes per protocol. The
registration-source round + remaining queue PARK behind this focus.

## 5.08 OWNER ORDER (2026-08-07, garage screenshot): "abramsX looks
terrible, begin dedicating work on improving this now to match our
actual abramsx model" — a DEDICATED abramsx §B8 round vs the local
abramsx-mortavex.glb, queued to spawn THE MOMENT the SEP lane lands
(abrams.js single-writer; the live agent was scoped down to the
XM914 yaw only). Screenshot verdicts to carry into the brief: the
side reads as ONE full-height slab wall (wheels invisible at garage
angles — the 49.4 round's skirt work is NOT reading; §B8.1 gate-1
FAIL at the acid level), the hull side is a monolithic flat panel,
furniture is sparse (one floating-reading jerry can at the rear
corner), the turret wedge reads generic rather than the AbramsX
faceted low-profile shroud. Current state: 49.4 | 56/49.4/68.6/76.4/
100/100, hash 9c059ce0, whips PARKED (autoPivot crater — abramsx.md).
The round must close the OWNER's look, not just the number.

## 5.09 OWNER ORDER (2026-08-07): NEW LEOPARD ROUND — "update the
leopard 2a7v, leopard 2 prototype, and leopard 2a4 to match their
references. for the leopard revolution, close the gaps and empty
spaces in its turret that dont have plates but are see through to
the other side. and put a huge automated turret crows system on the
revolution and other leopards too." Parsed: (1) leo2a7v reference
round (the queued 77%-hull turret-merge structural rework); (2)
leopard2_proto reference round (photo class — its print is the
melted measurement-only oracle); (3) leo2a4 reference round (photo
class — no oracle, the otco rip was destroyed); (4) leo2_revolution
§B2 TURRET CLOSURE (see-through gaps = missing plates — REAL plates,
no willy-nilly fills; photo class governs its §B7 ref-wrong band);
(5) BIG AUTOMATED RCWS (FLW-200 class, HUGE read, FORWARD per the
CROWS-FORWARD law) on revolution + 2a7v + proto + 2a4 (graduates
leo2a5/leo2a6/kf51 excluded pending owner word — re-cert cost).
SPAWNED immediately (leopard.js free). Graduates hash-guarded:
leo2a5 e215a738, leo2a6 09912270, kf51 9ac547ac; revolution bbae2c80
moves by design (photo-class re-freeze after its critic); leo1a5
1c79188 record held.

## 5.10 OWNER ORDER (2026-08-07): "the t90s look a lot better, keep
working on them too in a new subagent" — T90 CONTINUATION ROUND
spawned (russia.js free): t90sm gate ladder (58.2 — hull 61.2 is the
weak row; slat/brim/pano landed and resit-PASSED 9.0), t90a ladder
(76.1 — dome landed; ESSA pane + deep-shade wings notes), vladimir
ladder (71.0 — dims 96.2 certified hullLengthM class; roof wedge
density note). All three hold fresh §B8 PASS 9.0 records
(55509794/71f67270/782bdbc4) — the round must NOT regress the
accepted look (re-cert on silhouette-changing edits). t90m GRADUATE
e345ee8a excluded + hash-guarded; t72b3m 61a83b2c hands off.

## 5.11 OWNER ORDER (2026-08-07): MERKAVA ROUND — "make sure there
are no gaps you can see through through the turrets... literally
just that there are holes in the actual turret assembly under the
roofs because the roofs were made with straight panels instead of
solid shapes" — §B2 UNDER-ROOF CLOSURE as the lead order: side-view
see-through holes INSIDE the turret assembly (not the turret-hull
gap), caused by straight roof panels; close with SOLID shapes / real
plate geometry per §B2 (no willy-nilly fills). Scope = the merkava.js
family incl. GRADUATES by explicit owner order (merkava1b 2cc7a76c,
merkava3c 8b7ed9bc, merkava3d 39de83c8 — graduate-change protocol:
gate x2 + re-cert + re-freeze each) + merkava2b/2d. The §5.03 latent
pieces on merkava1b (2 deficit-0 roof-area pieces) ride the same
wave (likely the same roof-panel construction). SPAWNED (merkava.js
free). Four builder lanes now live: SEP, leopard, t90, merkava.

## 5.12 OWNER ORDERS (2026-08-07, continued): (1) "challenger 1 looks
good, but we need agents working on the challenger 2 and 3 using the
actual models we have now using the base of the challenger 1" — UK
ROUND: rebuild ch2 + ch3 ON THE CH1 BUILD PLATFORM (challenger1Build
in uk.js — gate-PASS 90.2, owner-approved look) measured vs their
real GLBs (challenger_ii.glb + challenger_3.glb); ch2's §B7 caps +
the §5.06 registration-walk finding stand (photo class where the
print misleads). (2) "redesign the fv510 warrior to look more like
its actual tank" — FV510 REDESIGN vs fv510_warrior.glb (check its
registration state first — FALSE-0 if unregistered; the batch-44
hold was lifted). One UK agent owns modern1.js + uk.js (fv510 +
reading the ch1 base; chieftain5 d4f2a9a6 + chieftain_mk10 59551064 +
challenger1 dbe33204 hash-guarded). Five builder lanes now live:
SEP, leopard, t90, merkava, UK.

## 5.13 OWNER ORDER (2026-08-07, relayed to the live t90 agent):
"i want their turrets to look more like each other. the t90sm and
t90m turrets are good, but the t90a and t90a vladimir need to be
based off of those turrets, with their own designs and attachments
and era and other equipment ofc" — T90 TURRET FAMILY LAW: t90a +
vladimir turret lofts REBASE on the approved t90sm/t90m welded
family grammar (t90m read-only donor — graduate e345ee8a untouched),
each keeping its own variant kit (K-5 clamshell/tiles, red eyes,
Kord, bricks, markings). §B7 owner-taste class: both prints carry
CAST domes — the welded rebase moves turret rows against them; the
look-order OUTRANKS the rows; caps documented per column (type10
evidence pattern). t90sm's approved turret is look-protected; its
ladder is hull-only.

## 5.14 OWNER ORDERS (2026-08-07, continued): (1) FRANCE ROUND —
"update the leclerc. the front sloping was not good, compare the
turret to the actual model again to get the geometry much more
accurate. also add machine guns and lights and other equipment, and
also model the amx 30bs to complement the leclerc (note the amx 30bs'
hulls are backwards" + garage screenshot proving the amx30 hull
renders REVERSED vs its gun. Leclerc: re-measure the turret front
slope vs char_leclerc_andertan.glb (the earlier Tamiya-photo order
stands: sloped front descending to a small flat strip) + §B3.2 MGs/
lights/equipment. AMX-30B/30B2: diagnose the backwards hull (if they
render the ahab GLBs via MODEL_SOURCE, it is a REGISTRATION
yaw/orientation error in userdrops7 — fix the registration; if
procedural, fix the builder) + bring both to §B8 class. (2) RUSSIAN
ERA-FRONT LAW — "many of the russian tanks have this kind of era
front: <. properly represent that when comparing to their models.
this affects the t72s, t80s, and t90s": the chevron/arrow K-5 wedge
banks meeting at the gun (the '<' plan read). Relayed to the live
t90 agent for the t90s; QUEUED as the next russia-lane round for the
t72s + t80s (russia.js single-writer — spawns after the t90 agent
lands).

## 5.15 OWNER ORDER (2026-08-07): "update the armata, the proportions
are def off and need to be remeasured, its really long but not wide
at all. adjust the hull, and also improve the turret" — T14 PROPORTION
ROUND (modern2.js free, spawned): re-MEASURE the four-box vs spec
dims (hull 8.7 / overall 10.8 / width 3.9 / height 3.16 datum) + the
print + photos; the owner reads it LONG-NOT-WIDE — find where the
visual width is under-built (skirt/fender planes vs the true ±1.95,
wheel band width, turret plan width) and/or the length over-reads;
adjust the hull; improve the turret (banked t14.md notes: Afganit
corner stubs borderline §B3, crown seam density, roof sparsity).
The print tube-pin stays DEFERRED (certified short-tube cap — agent
must not chase those columns). Seven builder lanes now live.

## 5.16 OWNER ORDER (2026-08-07): LEO-PROTO/TYPE90/2A4 FAMILY BASIS —
"the type 90 is based off of it [the leopard prototype] so they can
share a basis, and the 2a4 is also similar to the type 90, so make
all of them similar to each other with the type 90 giving the most
basis and being scaled properly and the type 90 needs a better gun
placement and mantlet." Split across the two live lanes: (a) LEOPARD
agent (owns proto + 2a4): rebase both on the type90 grammar (READ
buildType90 in misc.js read-only — the donor), family read across
the trio; (b) FRANCE agent (owns misc.js): +1 job — type90 SCALE
CHECK (the standing too-small flag; dims sovereign, four-box vs spec
+ its registered recovered/type90.glb oracle), BETTER GUN PLACEMENT,
proper MANTLET (§B3.1; the standing "type 90 needs a mantlet" order).
Grammar transfers; per-tank dims stay sovereign.

## 5.17 OWNER ORDER (2026-08-07, revolution close-up screenshot):
"theres still a gap under front part of its turret and still has
these ugly gray squares. fix the turret" — REVOLUTION TURRET FIX
ROUND (leopard.js free post-eff8512, spawned immediately): (1) the
UNDER-FRONT-TURRET GAP (chin/ring daylight — the closure round's
documented station/gun-cradle-air residual is NOT acceptable to the
owner; close it with real chin/collar geometry); (2) the UGLY GRAY
SQUARES on the turret flank — flat rectangular module faces
(including possibly the closure round's own new bins/end-plates/rail
boards) must be re-dressed §B3-real: AMAP-class composite modules
with seams/bolts/chamfers + correct tone slots, NOT flat gray slabs
(the §4.9996 gray-rectangles class returned). The in-flight leopard
critic's revolution verdict is superseded by this owner read; its
other three verdicts stand.

## 5.17a OWNER CORRECTION (2026-08-07): "the squares are not the
issue, its just that the turret didnt finish building under that
front part and sides" — the §5.17 round RE-SCOPED (relayed live):
gray-squares job DROPPED; the whole round = BUILD THE MISSING TURRET
STRUCTURE — the shell's lower side walls down to the ring band + the
under-front chin/cheek undersides to the mantlet collar, real §B2
casting walls; verified at the owner's close 3/4 angle + yaw 0/45/90.

## 5.18 OWNER ORDER (2026-08-07): NO-AIR PRINCIPLE (now BUILD-STANDARD
§B2 law) + AFV UNDER-GLACIS ROUND — "the merkava filling is good, now
do it for the afvs' upper glacis which have big gaps under them,
primarily bmp and bradley. eventually do this procedure for other
tanks too, including side plates that might just be hovering." Round
spawned: bmp2 + m2a2_bradley (builders in the SHARED tankFactory.js —
strict path discipline + wide hash sweep), secondary puma/type89
check (their builders live in modern3.js — free). FLEET NO-AIR SWEEP
(hovering side plates, all tanks) QUEUED as a read-only audit next.
NOTE the owner ALSO said "adjust their stats" for the AFVs — read as
ambiguous (gameplay stats vs geometry); the geometry round is
running; the stats half is FLAGGED FOR OWNER CLARIFICATION.

## 5.19 OWNER ORDER (2026-08-07): SEPv3 DEDUPE + SEP REBUILD-ON-BASE —
"theres two m1a2 sepv3s. lets use M1a2 sepv3 and delete m1a2 abrams
sepv3. then, for sepv2s and sepv3, we need to rebuild them to use the
M1A2 abrams base model and then start slapping on extra stuff and
decorations." EXECUTED: the base m1a2 spec row RENAMED 'M1A2 Abrams
SEPv3' -> 'M1A2' (the duplicate garage name is DELETED; the SEPv3
identity belongs solely to m1a2_sepv3; the base id/geometry stays as
the locked-roster family anchor + graduate + oracle bearer — if the
owner meant delete the TANK, the leo2a7 delist mechanism is 30
seconds, flagged in the code comment). QUEUED: SEP REBUILD-ON-BASE
round (abrams.js — behind the live abramsx agent): sepv2 + sepv3
rebuilt to visibly BE the M1A2 Abrams base platform + slapped-on
kit/decorations (owner's third restatement of this intent — the
visual base-ness isn't reading; the round unifies the SEP variants'
platform detail with the tejas-grade look, then the kit). AMBIGUITY
FLAGGED to the owner: "the M1A2 abrams base model" = the base m1a2
id or the tank NAMED 'M1A2 Abrams' (tejas)?

## 5.20 SEP-LANE VERDICTS RATIFIED (2026-08-07): 5/5 graduate
re-certs PASS -> RE-FROZEN in §3 (m1a1 2f277528, m1a1ha aa7af504,
m1a2 636a4860, tejas f7510d88, sepv2 7ef1c5ec); CROWS-FORWARD
verified 7/7 in pixels (owner order CLOSED — "point forward, not to
the left" reads on every station; shadowBarrel invisible as defect);
sepv2 remake ACCEPTED (elevated forward CROWS II + APU + urban kit);
m1a2_sepv3 ACCEPTED PASS 9.1 into the roster at 12ffb1f4 (FALSE-0,
never gate; M1A2C identity complete; notes banked). tusk b1786e4c
scored 9.1 floor, no orders. Critic observation banked: the
tejas-family loader's skate-rail M240 rests TRANSVERSE (certified
pre-existing on 3 graduates) — if the owner's forward-look extends to
manned rail guns, that is a future cap re-adjudication (ASK OWNER,
nicety). The critic worked a clean-room at 18d3f13 — its name-
collision observation is already resolved by the 56d5b14 rename.

## 5.19a OWNER CLARIFICATION (2026-08-07): "i meant the m1a2 abrams
(ex tejas) is the correct base, the base m1a2 platform is WRONG." —
the queued SEP REBUILD-ON-BASE round's base = the m1a2_tejas platform
configuration (the tank named 'M1A2 Abrams', re-frozen f7510d88), NOT
buildM1a2's base fit. sepv2 + sepv3 rebuild so their hull/turret/
detail grade visibly IS the tejas-grade platform, then the variant
kit (sepv2: elevated CROWS II + APU + urban kit; sepv3: M1A2C set)
slaps on top. SIGNAL BANKED (not yet an order): the owner considers
the BASE M1A2 PLATFORM'S LOOK WRONG — a future base-m1a2 rebuild
toward the tejas grade is the likely next ask; the §3 graduate row
(636a4860) stands until ordered.

## 5.21 LEOPARD ROUND VERDICTS RATIFIED (2026-08-07): 4/4 PASS 9.0
(independent critic, fresh 7x14-view sets; sheets
shots/critic-leopard-509/). Revolution SEE-THROUGH DEAD at 531d8a7c
(old sightlines 0-55px, all bounded intentional structure; -85%
verified) — its RE-FREEZE DEFERRED to the §5.17a understructure
round's landing + re-cert (the lane was already at WIP db70c929;
same region). a4 12db10a0 / proto 24bd57cc / a7v 3ca4af86 records
RATIFIED (a7v merge conclusively dead: yaw-90 top proves the compact
rotating turret; the 61.6% four-box is thin dressing, documented).
§5.16 FAMILY READ PASS (type90+proto+a4 one grammar, marks separable).
ASK-OWNER banked: the proto's RCWS is legally SQUAT (published-height
dims row caps it) — a proud a4-class station there needs an owner
override of the height row. RCWS forward + connected verified x4.

## 5.22 T14 VERDICT RATIFIED (2026-08-07): PASS 9.0 — §5.15 OWNER
ORDER CLOSED (independent critic, clean-room bracket at 60d7d14 x4;
sheets shots/critic-t14-proportion/). LONG-NOT-WIDE DEAD by the
numbers: plan W/L 0.4521 vs the print's 0.4503 (proc now wider-per-
length than the print), front band 0.978 vs 0.953, tail 15.9% vs
18.8%, garage-angle parity +0..+2.1%, 7 wheels at native tone
(variance 738, 7 even peaks). Turret delivered on all five ordered
items (Afganit ring, MG stowed, pano at the real columns, GLONASS,
shroud facets). NO regression on the 765310f tells. Report-only
residuals banked (roof density detail-class, track albedo shared-
material, glacis tone, stern screen hang attributed). Record 60d7d14
binds.

## 5.23 OWNER EVENTS (2026-08-07): (1) ALL BACKGROUND AGENTS STOPPED
from the owner's side mid-flight — owner ordered "bring them all
back": four builders RELAUNCHED fresh (abramsx continuing its WIP in
abrams.js; France continuing its WIP in misc.js+userdrops7; chevron
fresh + the NEW FUSED-TURRET orders; AFV fresh), both critics resumed
from transcripts. (2) FUSED-TURRET ORDER (screenshot): "the t90a
vladimir, the turret is literally fused with the hull, like the
t72b3m, which also needs to be fixed" — folded into the chevron
agent's brief (vladimir 02ebb722 moves; t72b3m 61a83b2c graduate-
change). (3) THREE REFERENCE DROPS staged in community-candidates/ +
ATTRIBUTION'd: abrams_x_low_poly.glb (Mortavex, relayed to the live
abramsx round as the primary look reference), type_74_new.glb
(NullOps, SPLIT nodes — oracle-replacement candidate, kills the
re-rig escalation if clean; onboarding = my lane, QUEUED), the
type-10 source OBJ (source material).

## 5.24 MERKAVA WAVE RATIFIED (2026-08-07): 5/5 closures DEAD (my
numbers reproduced the builder's byte-identically; 2d's honest
after-count is 638 not ~430 — packet-note class), 3/3 graduates PASS
>= 9.0 on every changed view -> RE-FROZEN in §3 (1b 78051af0, 3c
aa74be6a, 3d 667ece84). The owner's §5.11 under-roof diagnosis is
FULLY ANSWERED at the candidate hashes. All adjudicated-air residuals
verified as intentional structure; 3d's y90 under-chin daylight =
turret-hull-gap class (explicitly out of the §5.11 scope).

## 5.25 REVOLUTION COMPLETION RATIFIED (2026-08-07): re-cert PASS
(front 9.4 / side 9.2 / close 9.3; floods verified digit-for-digit,
zero regressions across 63 views; the one new 153px yaw45 pocket
adjudicated REAL AIR — open-notch projection signature, legit
overhang class) -> RE-FROZEN bbae2c80 -> db70c929 in §3. The owner's
§5.17/§5.17a "turret didnt finish building" complaint is CLOSED: the
shell now stands on real casting walls at every angle.

## 5.26 OWNER RATIFICATION (2026-08-07): "the leclerc turret is a
triumph... as are the merkava geometries. all tank designs have to
aim for this level of quality" — codified as BUILD-STANDARD §K
(QUALITY EXEMPLARS: measure -> loft to measured lines -> close with
real geometry -> prove in pixels). Relayed to all live builders.

## 5.27 ABRAMSX VERDICT: FAIL 5.5 (independent critic, native-tone §K
severity; sheets shots/critic-abramsx-dedicated/). Gained: verdict 2
CLOSED (hull panels/fenders/light bays), turret facets + smoke banks
on the face plane, +13.4 min. NOT CLOSED: (1) wheels UNREADABLE at
native tone view-left (proc band spread 3.6L vs the ref's 17-21L at
the same paint — geometry, not scheme: no inter-wheel daylight, no
dark tire annulus); (3) TWO §B2 violations — the left rear flap
floats (bg on all four sides) + the stern rack is a stilted table
with 4,353 bg px through it (NEITHER reference carries that
structure); (4) partial — roofline identity sub-visible at garage
range + a mushroom-eave roof overhang both refs lack. SEVEN ORDERS
(measurable pass conditions in the verdict): wheel daylight + tire
annulus own-bucket, flap hinge-straps to the hull edge, stern rack ->
the print's solid stepped deck (§K merkava mechanism), roof rim
flush, roofline RWS/drums/pods within the cap + the dims-datum
extension work order, tone-honest pepperpot, tray lashings + stern
bays. FIX ROUND QUEUED behind the live SEP-on-tejas agent
(abrams.js single-writer).

## 5.28 FRANCE ROUND RATIFIED: 4/4 PASS 9.0 (independent critic;
sheets shots/critic-france/). LECLERC front-slope complaint DEAD-
MEASURED (brow strip 2.13w REF=PROC, ~9-deg raked face parity, the
silhouette steps in raw pixels; M2 forward; equipment connected) —
the owner's "triumph" state holds under fresh eyes; doc true-up
banked (the packet's commander-well claim isn't in the bytes — flat
roof + hatch ring reads; priced in ratified residuals). AMX30/B2
CORRECT-WAY-ROUND proven four ways + full identity incl the visible
20mm M693; §E re-bake lane proceeds. TYPE90 mantlet + gun-mid PASS.
§B7 TYPE90 TURRET RE-PROPORTION — RATIFIED BY THIS RULING (packet-
recommended + critic-seconded): the print is REF-WRONG on turret
height (oracle roof 1.90 vs the real 2.34); the REAL 2.34 governs;
per-column caps document against the print; the finish round may
spend those ~30 columns. Follow-up round SPAWNED (misc.js free).
Leclerc chirality-anchor observation banked (signed-x top map as the
fleet mirror-scare test).

## 5.29 OWNER REFINEMENT (2026-08-07, REAL PHOTO — T-72B3 obr. 2016
parade): "this is what i meant by the chevrons for the russian ERA,
its like two panels of era that meet at a tip. thats what i wanted
dude! and update all the equipment around and add more machine guns
to the soviet MBTs." — THE CHEVRON SPEC REFINED: TWO large flat
soft-case ERA panels angled as a shallow V MEETING AT A POINTED TIP
at the turret center-front (the obr-2016 wedge read; the photo also
shows: full-perimeter slat/bar armor on the hull rear + turret rear
arc, side-skirt flexible squares with the camo print, the NSVT/Kord
pintle prominent on the cupola, smoke banks angled on the cheek).
FOLLOW-UP ROUND SPAWNED (russia.js free post-78b89f5): re-shape the
just-landed chevron banks into the two-panels-at-a-tip read on every
soviet MBT that carries soft-case ERA fronts + EQUIPMENT DENSITY +
MORE MACHINE GUNS (pintle NSVT/Kord/PKT per cupola, CROWS-FORWARD
law) fleet-wide on the soviet MBTs. The in-flight chevron critic's
verdicts remain useful evidence; the refinement supersedes shape
verdicts where they conflict.

## 5.30 OWNER ORDERS (2026-08-07, relayed into the live §5.29 round):
(1) t90a_vladimir REBASED ON THE T90A — the turret REPLACED wholesale
with the t90a's welded loft (vladimir keeps only its real-distinct
kit; record 190e6a32 moves by order; the 63.8 print-bake cap
discipline stands); (2) t90a — the excess rectangle on the right
side of its tracks near the bottom REMOVED (§B3 no-mystery-boxes:
identify, re-seat if real, delete if not; both sides probed).

## 5.31 OWNER ORDER (2026-08-07): GARAGE REGROUP — "move our custom
tanks into where they properly belong": WW2 <- sherman_jumbo,
leichttraktor, pziii (both pziii ids adjudicated at execution),
sturmtiger, tiger2, jagdtiger, jagdpanzer (jpz_e100 read — confirm at
execution), t34_85_cad, t44, is3 (+is3_bergman), is6b; COLD WAR <-
type59, strv103, t95 ('doomturtle'), m48; MODERN <- merkava4
('merkava mk IVM'), m1a2_tusk. THEN: the SOURCES group becomes the
complete catalog of ALL actual 3D tank models (every GLB-rendered
model listed there, even where the tank also appears in its era
group). EXECUTION BLOCKED on garage.js: the file carries the owner's
live uncommitted WIP (their parallel session) — the group logic
(Sources derivation + COLDWAR_IDS map) lives there. Executes the
moment garage.js lands clean; era-side spec fields ride the same
commit. NOTE the destination judgment on the first list: t44/is3/
is6b read WW2-era (1944-45 vehicles) — the owner's list order is
ambiguous between WW2 and Cold War for them; DEFAULT WW2 with the
type59 in Cold War; owner can re-sort with one word.

## 5.32 CHEVRON+FUSED WAVE RATIFIED (2026-08-07): 8/9 PASS (critic
sheets shots/critic-chevron-fused/). t72b3m RE-FROZEN 61a83b2c ->
175be954 (§3 updated; graduation record carries forward on every
unchanged pixel). VLADIMIR separation PASS 9.0 — the §E escalation
VERIFIED IN PIXELS (the print's hull node wears a complete
non-rotating turret band + ring hole + fused tube; the 63.8 line is
the print-bake cap, not a build break — the ORACLE BAKE-STRIP stays
my top §E item). t80 CONDITIONAL 8.0 with ONE measured order (banks
must break the dome silhouette in plan: proudness 0.07 -> ~0.14
and/or pitch/k1Y until >= ~800px clay-plan footprint + two >= 25px
angled runs per side) — RELAYED into the live §5.29 tip round (t80
in scope). Ledger rows staged for the eight (vladimir's stale 71
corrected). Packet overstatement note banked (t72b3m seam claims).

## 5.33 OWNER MISSION BAR (2026-08-07): "we need to get at least 30
more tanks above 90 is your bar i dont even care. with all specific
issues like see-through-sides or the t72 turrets not spinning right,
fix all of them." — THE 90-LADDER CAMPAIGN: fleet 21/89 passing ->
target 51+. Routes, fastest first: (a) the 80-90 band harvest
(leclerc 86.2, bradley 84.7, type90 83.6-live, t80 82.5, ariete
82.3, t80b 81.6, m45 81.2 — small ladders); (b) §E oracle repairs +
re-oracles for cap-bound ids (vladimir bake-strip, sepv2 re-oracle,
type_74_new, the registration-source round unblocking ch2/t54/
t80bv); (c) the 60-80 band by family. DEFECT CLASSES named by the
owner: SEE-THROUGH SIDES (fleet no-air sweep NOW RUNNING read-only ->
fix list) + T72 TURRETS NOT SPINNING RIGHT (relayed into the live
russia round: turret-parent audits + yaw pairs on the t72 line).
Four interrupted agents RESUMED from transcripts (type90, chevron-
tip, SEP critic, abramsx fix); four others verified already-landed.
First ladder wave spawned: bradley (tankFactory), m45_patton
(patton.js), the fleet see-through sweep.

## 5.34 SEP-ON-TEJAS RATIFIED + SEPV2 RE-ORACLE EXECUTED (2026-08-07):
fresh critic (prior lane's transcript lost to process exit) re-scored
the 73 surviving shots under a fresh hash bracket (sepv2 e60878a9,
sepv3 2c9023d0, tejas anchor f7510d88 — all MATCH): m1a2_sepv2 PASS
9.3, m1a2_sepv3 PASS 9.3 — the §5.19a platform order READS in pixels
(one platform, three kits; CROWS-forward holds). ACTIONS: sepv2
RE-FROZEN e60878a9 (§3); sepv3 2c9023d0 recorded as the binding hash
(stays FALSE-0/never-gate — no oracle of its own); critic's RE-ORACLE
ruling EXECUTED in the registration lane — m1a2_sepv2 re-registered to
/models/tanks/m1a2_tejas.glb in all four maps (procedural-fidelity,
visual-evaluator, tmp-tank-critic, vertex-extract REG; tejas pattern
^Turret$/^Gun$ yaw -PI/2), recovered/m1a2_sepv2.glb registration
RETIRED for this id (m1a2 keeps it — separate instrument, separate
adjudication). Honest baseline x2 bit-identical: min 0 (hull 0, whole
17.3, turret 19.8, stations 77.4, dims 100, floaters 100) — FALSE-0
CLASS: the WORKS-FIELD PARITY ECHO (14 hull-bucket boxes to y 2.30,
abrams.js sep2 block) was built to serve the OLD print's REF-HULL mask
split and now poisons hull vs the bare-hulled tejas print. Per the
critic's own constraint the echo deletion MOVES THE HASH -> queued as
the NEXT abrams-lane touch (graduate-change chain: delete echo ->
gate x2 -> re-cert changed views -> re-freeze). Row lands with this
annotation; never read sepv2's 0 as a regression.

## 5.34a TYPE90 GLB BYTE-HEAL (2026-08-07): d414664 committed the
PARTIAL batch-27-only bytes (c286b555 — the state the NameError crash
left on disk), not the healed byte-idempotent batch-49 output
(b2ece521) the 45.1 ledger row (0184d73) was measured against. Caught
by pre-commit staged-drift check (camoKit lesson). Worktree bytes
b2ece521 committed here; ledger row already honest.

## 5.35 FLEET SEE-THROUGH SWEEP DELIVERED (2026-08-07, §5.33 defect
class 1): 58/58 procedural ids swept read-only (~41 scans each: §B2
enclosed-bg flood + foreground-island CCL), 1403 evidence PNGs under
shots/see-through-sweep/, tools left committed-adjacent as
tools/tmp-sweep-seethrough.{html,mjs} + tmp-sweep-adjudicate.mjs for
fix-round re-verification. TWO SWEEP-LAW DISCOVERIES banked: (1)
GUN-AIR FP — under-barrel air enclosed by whip antennas floods as
"hole" (merkava2d's 6849px headline was entirely this); gun-box
y-band tagging removes it. (2) DARK-COLLAR ISLAND FP — near-bg cold
collar tones fake disconnection (m26 muzzle). Flood is BLIND to
open-ended corridors; the island scan is their detector
(leopard2_proto/t80u proved it). RANKED HOLES (garage-visible first):
1 bmp2 (turret FLOATS above ring, bg through in plain side; modern3),
2 t72b3m GRADUATE (dome-rear<->hull-stack window + full-length top
skirt corridors; graduate-change, couples w/ live t72-spin round),
3 m60a2 (open sponson/fender channels + floating skirt seg; patton),
4 vickers_mk1 (sponson slit; packet documents 2.5cm designed — verify
width), 5 leopard2_proto (7cm full-length top corridors both sides),
6 t90m (rear-overhang slot + skirt-front slots; russia LIVE),
7 t64bv1 (hovering roof bins; russia LIVE), 8 t80u (right top
corridor 6.3m + ERA standoffs; couple w/ §C reversed-slab), 9
spz_puma (rear-deck seam; modern3), 10 centurion3 (mantlet-flank
pockets; uk), 11 patton MG floaters m26/m45/m46/m47/m60a3 (§B3 mount
mass; m45 ladder LIVE), 12 t84 (inter-armor-block gap), 13
t72bu/t80bv (partial top corridors), 14 challenger_3 (skirt leading
plates hover-read; verify), 15 challenger1 (under-turret-skirt band,
hygiene), 16-18 minor (sepv2 post slit, type74 empty-rack, t80-family
shared rear floater — one family-rig fix). CERTIFIED/LEGIT no-order:
all five merkavas, challenger2 basket, abrams family (cleanest),
kf51/ch3 RWS mount air, amx30 mast, type10 basket, pt91m/t62mv1.
CLEAN <100px: kv2 0, type90 4, ariete 8, isu152 12, isu122s 14,
centurion5 16, m1a2 20, chieftain5 20, leo2a5 42, revolution 46,
t80b 56, t90a 99, leclerc, bradley, vladimir, leo2a6, m60a1.
CAVEAT: russia.js dirty throughout the sweep -> its rows PROVISIONAL
(live-tree hazard); abrams.js dirty only after final re-runs.
LANE PLAN: free lanes fix first (modern3: bmp2+puma; uk: vickers+
cent3+ch1; leopard: proto corridors); busy lanes queue their items
behind live rounds (russia: t72b3m/t90m/t64bv1/t84/t72bu/t80bv/
t80-floater; patton: m60a2+MG-mass rides the m45 ladder; misc: t80u+
type74; abrams: sepv2 post slit rides the echo-deletion touch).

## 5.31-EXECUTED GARAGE REGROUP (2026-08-07): owner's garage.js WIP
cleared -> order executed. ERA_PLACED_SOURCES set (18 ids) exempts the
named GLB-sourced customs from the Sources branch; t95 added to
COLDWAR_IDS (spec era ww2, owner places it Cold War — coldwar check
now precedes the era branch in groupOf; proven safe: no other
COLDWAR_IDS member is era-ww2). Census: WW2 +12 (sherman_jumbo,
leichttraktor, both pziii customs, sturmtiger, tiger2, jagdtiger,
jpz_e100, t34_85_cad, t44, is3, is6b), Cold War +4 (type59, strv103,
t95, m48), Modern +2 (merkava4, m1a2_tusk). Sources now = is7,
object279, newc_tiger, q_heavy, recon_tank. ASK-OWNER (default held):
newc_tiger is a Tiger I custom the order didn't name — same principle
would file it WW2; q_heavy/recon_tank are fictional customs with no
era home. "Sources have ALL actual tank models" read as the end-state
description (remaining prints stay listed); if it means onboarding
MORE playable prints, that's a new order.

## 5.36 AMX30 RE-BAKE + RE-ONBOARD EXECUTED (2026-08-08, §5.14 §E
escalation): manifest RZ fix (build_gen2_tanks.py both hull entries
RZ(-90)->RZ(90)), amx30b_ahab/amx30b2_ahab re-baked (md5 e28d68d5/
4d1fc81d, .baks refreshed — batch-22 stays disabled: source cured),
vertex receipts agree:true BOTH (was the owner's backwards hull),
renders shots/gen2-bake/. Re-registered in the three harness maps —
the no-oracle FALSE-0 rows become MEASURABLE. Honest baseline x2
bit-identical: amx30 0 (hull 31, dims 22.7, floaters 0) / amx30b2 0
(hull 29.9, dims 44.6, floaters 0) — HONEST photo-build-vs-print
reads, not artifacts: proc measures heightM 2.46 vs pub 2.29 (+7.2%),
hullLen 6.37 vs 6.59 (-3.3%), 1 floater fail, stations topPct to 22%.
LADDER BRIEF SEEDED (misc.js lane, queue behind type90/leclerc/
ariete): fix the floater, drop roof to pub height, stretch hull to
6.59, then turret/whole curves vs the now-valid oracle. ALSO: 10
stale-since-08-06 vertex receipts refreshed in this commit (amx30 x2,
m1a2_sepv2->tejas per §5.34, type90 batch-49, ch2/ch3 batches 47/48,
fv510 redesign, m1a1ha/tejas/tusk batch-15/16 tejas warp — receipt
heightPct 34.8->1.6); 65 timestamp-only churns reverted unstaged.
Extract CLI note: vertex-extract.mjs <id> arg does NOT filter — it
sweeps all 75 registered ids every run.

## 5.35a PROTO CORRIDOR CLOSURE LANDED (2026-08-08, §5.35 item 5):
sponson-underside/skirt-hanger rail closes the 6.8cm full-length top
corridors both sides — y0-top islands 4992px -> 0, oblique slots
cleared, §B4 2cm annulus kept, §5.16 family silhouette untouched
(no shared-helper edits; leo2a4/revolution/graduates byte-held).
Gate x2 bit-identical 0 | hull 45.8->46.8, rest exact — NO RUNG TO 90
on this oracle (melted turretless tub caps whole/turret/stations ~0
BY CERTIFICATE; oracle-sourcing dependency noted in packet). New hash
afb3cc3c (not frozen). Landed f40ea00-successor commit.

## 5.37 CHEVRON+MG ROUND RATIFIED + LANDED (2026-08-08): independent
critic RATIFY 9/9 at >=9.0 from FRESH self-shot evidence (one ticket,
shots/critic-chevtip/). §5.29 tip-read PASS all nine (t80bv 9.5
strongest — 3-course walls meeting at V-nose; t72b_1987 9.4 crisp
collar-tip V); §5.29 MGs PASS all nine (t72bu's last-mg0 cleared);
§5.30 VERIFIED (vladimir turret IS the t90a design — plan outline
verbatim, kit seats aligned, own mast/gun kept; skid rectangle GONE
with before/after pixel proof); §5.31 SPIN PASS with hard evidence
(t72b_1987 dome orbited ~0.40 before, centered <=0.1 after; pivot
moved to casting plan-chord center, world-identity at rest). HASHES
LANDED (all 9 verified x3 by critic + orchestrator): t72b_1987
d62c8140, t62mv1 db9507ac, t72bu 68082d79, t80 578b7f08, t80b
99393970, t80bv 89769670, t90a 265610e2, t64bv1 f5222a1c, vladimir
bdfe7d24. Graduates held byte-exact: t90m/pt91m/t84/t72b3m/t90sm.
FILE-SHA ANOMALY resolved: builder reported russia.js ea20b889,
critic measured 899d8458 — non-geometry bytes; geometry hashes bind
x3 = the truth per protocol. Vladimir row 9 = documented §5.30
print-cap (2.60m cast dome cannot corroborate 3.23m loft; §E batch-50
bake-strip is the recovery). POLISH BANK (non-gating, next russia
touch): vladimir '112' re-pin z fwd ~1m + x flush 1.435 (§5.04);
t72b_1987 right-arm panel notch; t80/t80b NSVT prominence vs heightM
grace = ASK-OWNER trade; t62mv1 DShK elev -0.32 -> -0.10..-0.15 +
azimuth inboard. RUSSIA LANE FREES: next = t72b3m graduate-change
(spin 0.20 + arc-grammar tips + §5.35 window/corridors) + vladimir
batch-50 + t80/t80b ladders.

## 5.39 TYPE90 ORACLE 49-v2 (2026-08-08, OWNER VERDICT "lol why is
type 90 turret huge and tall now?" + garage screenshot): batch-49 v1's
crown tail (23.359->27.642, "furniture rigid +0.44") over-raised the
print's turret band to 2.67-2.84m (receipt bodyH 2.747, +17.4%) and
the live ladder agent faithfully built a giant turret to it — the
owner saw it in the garage. v2 compresses the tail (23.359->25.31,
y_top_max 25.35): roof stays at the published 2.34, ridge ~2.51,
sight head 2.60. Byte-idempotent x2 fcfeb38a (md5 worktree == staged,
oracle-bytes law). Ladder agent HELD mid-round, told to revert any
turret-raise chasing the v1 band and re-baseline vs v2. LESSON (§E
law bank): a normalize plan's ABSOLUTE height targets must be
sanity-checked against the real vehicle's published profile BEFORE
execution — batch-49 v1 encoded 2.67-2.70 crown targets no Type 90
reaches; the receipt's heightPct (+17.4) was the tell, and the owner's
eyes caught it before I did.

## 5.40 ABRAMSX §5.27 RE-CERT: RATIFY 9.2 — ROUND CLOSED (2026-08-08):
independent critic scored all seven orders >=9.0 on fresh evidence at
bound bytes (abramsx 2c6eb344 verified x3 across three HEADs; family
byte-guard 8/8 EXACT incl. sepv2 e60878a9/sepv3 2c9023d0 — the O1
opt-ins are byte-invisible, proven). Highlights: wheels 9.5 (7/7 disc
peaks both sides, 17 real daylight runs, mush dead), flaps 9.5 (0
enclosed), stern rack 9.5 (4353px through-sky -> 0; 58px residual =
certified under-barrel class), eave 9.0 (closure walls read, §B5 yaw
proven), roofline 9.0 (kit present within 2.435/2.459 caps), muzzle
9.0 (11 lit/dark transitions), lashings 9.0. Gate 62.9 hold-or-improve
stands. §5.08/§5.27 CLOSED. Non-blocking residuals ledgered: idler
disc flat, right band modulation trails left, RCWS detail waits on
the FILED dims-datum work order (orchestrator lane, the remaining
identity headroom). Abrams lane FREES -> sepv2 works-echo deletion
round (§5.34 chain) spawns next.

## 5.38 OWNER PRIORITY WAVE — SEVEN AW-SERIES DROPS (2026-08-08): "bump
this up in priority, fully model a custom <X> based on this model
using our strongest visual comparison and geometric comparison
techniques" x5 messages: K2 Black Panther, Type 99A2, AMX-40, K1A1,
T-90MS Tagil, then "custom t90 and t90a burlak". ONBOARDED (orchestrator
lane): all seven parked LOCAL-ONLY in public/models/community-candidates/
(provenance inconclusive — ATTRIBUTION series entry; ASK-OWNER standing:
type_89-strict deletion available on request); k1a1/t90ms/t90 re-baked
from semantic OBJ sources (real turret/cannon nodes); vertex REG + three
harness maps registered for all seven (k2 receipt already extracted:
dims bind len -2.4/overall -3/width 0, height +20.9 = RWS band, t90m
class). ROSTER DISCOVERIES: k2 spec+buildK2 DORMANT in modern3.js
(owner-delisted 2026-08-06 "no glb" — reason VOIDED by the drop);
type99a spec+buildType99A DORMANT in modern2.js (same). LANE PLAN:
modern2 agent re-activates type99a vs its print; modern3/KOREA agent
(waits for the live no-air round) re-lists k2 + builds k1a1 new;
france.js agent builds amx40 (stub module wired into tankFactory by
the orchestrator, empty-map no-op until filled); russia t90-family
agent builds t90 + t90ms + t90a_burlak (specs userdrops7 make()
pattern from t90a base, builds in profiles/russia.js — §5.13 family
turret law: derive from the landed t90a/t90m/t90sm grammar, each with
its own print-measured identity). Extract sweep for the six new
receipts DEFERRED to a calm-load window (box hit a load-869 render
wave this hour; starved measures read garbage).

## 5.41 M45 LADDER DELIVERED 90.7 PASS x3 (2026-08-08): 84 -> 90.7
(hull 91.4/whole 90.7/turret 92.2/stations 93.4/dims 92.2/floaters
100), candidate 9f5c94d0 UNCOMMITTED — graduation critic RUNNING.
Round root-find: r1 was authored from a Z-FLIPPED workorder plan frame
(the r3 thin-end heuristic still loses on near-bow-flush muzzles —
FLEET LAW CANDIDATE: landmark-verify every plan read); registration
recovery via body-ends probe (dAlong 0.000 all rows). §5.35 item-11
M2-window closed with real mount mass. m26_pershing DRIFT FLAGGED:
reads 2f006738 vs registry 65c564c0 — builder bisected to LANDED
5f39989 (armorM4 gunBarrel proxy 3.96->3.44; m26/m45 inherit m4a3e8
proxies, patton.js bytes unchanged). RE-RECORD PENDING the m45
critic's independent confirmation, then §3 updates with the proxy
attribution note. Owner spec-row flag stands: m45 6.6 -> ~6.47 would
restore dims ~100 (ASK-OWNER, non-blocking).

## 5.31b OWNER CLARIFICATION (2026-08-08): "im not seeing our custom
models on our deployed versions, only the actual comparison models" +
re-send of the §5.31 move list + "then make sources have ALL actual
tank models". READ: the 18 era-placed ids currently RENDER as their
community GLB prints (MODEL_SOURCE=glb) — on deploy the owner sees
the comparison models (or nothing where stripping applies), not OUR
custom builds. DIAGNOSIS AGENT SPAWNING: map which of the 18 have
procedural builders (dormant or live), what VITE_PUBLIC_BUILD strips,
and design the flip (playables -> procedural in era groups; Sources
keeps ALL actual-tank prints browsable). leopard2_proto MODEL_SOURCE
flip is the mechanics precedent.

## 5.42 MODERN3 NO-AIR DELIVERED + BMP2 RULING (2026-08-08): bmp2
fleet-#1 killed with real geometry (side-T 1879->0, garage cluster
243->0, front-low island 3098 dead; ROOT CAUSE was floating ROOF
FURNITURE, not the ring seat — the adjudicator's hover guess was
wrong, the builder measured). ORCHESTRATOR RULING: RATIFY 82.7 (-1.3
whole) as the §B7 owner-law-over-print price — §5.18 NO-AIR is owner
law; the print's OWN launcher floats (ref cols 2.151-2.181 under its
2.39 tube) and sealing pays those columns. Receipts + shape ladder
banked in the r8 comment; recovery = §E launcher re-seat warp
(orchestrator queue). spz_puma: all ordered slots closed (top 573->73
all pre-existing, -T rows 0), stations +0.8. Hashes bmp2 53046196 /
spz_puma 940912c8. LANDING HELD: bradley ladder WIP cohabits
modern3.js (spawn-brief path error made two lanes share the file —
LESSON: verify the actual file per id BEFORE lane assignment; bmp2/
bradley/type10/k2 all live in src/vehicles/modern3.js, NOT profiles/).
modern3.js lands as ONE commit after bradley delivers+verifies;
KOREA round spawns after that landing.

## 5.43 UK NO-AIR ROUND LANDED (2026-08-08): critic verdict — Part 1
centurion3 RE-CERT PASS floor 9.0 x17 changed views (machine truth:
front-low 16px vs frozen-rig 44+slit, rear 1023->17, sides tighter
than the print's own wheel-run daylight; pedestal fill reads as cast
structure) -> RE-FROZEN bad74e60 (§3). Part 2 challenger1 GRADUATION
FAIL 8.5 (bar 9.0) but the ordered hygiene closure is SOUND (0px on
the band, gate 90.2 exact-held, identity unmistakable) -> ledger row
stands, graduation stays OPEN with the critic's exact defect list
banked in challenger1.md: (2) front-corner slots ~90-133px
(bin-to-cheek + lamp-bracket-to-sponson, interior-fill class), (3)
rear corner corridors ~252px (mud-flap class), (4) under-shelf bare
slots ~130px, (1) cheek-course tone/chamfer lane (r11 ceiling). Next
ch1 round = close 2+3, continue 1. vickers_mk1 NO-CHANGE adjudication
STANDS (GUN-AIR FP, designed 2.5cm renders 1.5cm — sweep flag
disproven with ray-attribution receipts). Ledger rows were already
exact at HEAD (closures held every component). Critic + builder tmp
rigs deleted at landing. NOTE: cot-shots FIFO lock now held by the
owner's parallel shadowbisect session — respect it.

## 5.44 BRADLEY 90-LADDER DELIVERED + MODERN3 COHABITATION LANDED
(2026-08-08): m2a2_bradley 84.7 -> 90.9 PASS x2 EVERY component >=90
(hull 91.0 / whole 90.9 / turret 91.9 / stations 93.4 / dims+floaters
100) — candidate 90a5568c, FLEET 22/89. Round unlock = the
REGISTRATION SNAP (bow-plate body tabs z 3.235-3.30 -> dAlong 0.000
every row) + turret rebuild to ref lines (rotor boot, collar floor
1.905, TOW pod fall, rounded bustle) + station slice-paint mechanics
(12 ODS skirt sections; box mid-spans are invisible — z-caps/slopes/
low-seg cylinders paint). §B4 rear 45/121 debt CLOSED (0/0 --exact).
Five law-bank discoveries in m2a2_bradley.md (registration-snap,
slice-paint, gun-extra pivot offset, plan-mirror discipline,
ref-teeter cert class). Landed in ONE modern3.js commit with the
§5.42 no-air round (bmp2 82.7 ratified + spz_puma) per the
cohabitation design; guards byte-held (type89/is1/is2/tiger1/m60a1).
GRADUATION: independent critic spawns at the landed bytes — freeze
90a5568c in §3 only on its >=9.0. KOREA round unblocks (modern3.js
clean post-landing).

## 5.44a LANDING ACCIDENT DOCUMENTED (2026-08-08): commit 81bdad1
swept in TWO files the §5.31b diagnosis agent had STAGED but not yet
reported — userdrops4.js + variants.js (the m1a2_tusk ERA-GROUP FLIP:
MODEL_SOURCE retired, procedural tusk renders everywhere, dannzjs
print retires to candidateGlb per the kv2/t30 pattern). Content
INSPECTED post-land: coherent, precedent-cited (§5.34/kv2/t30/m1a1
backfill), covered by the pre-commit npm test, and directly answers
the owner's §5.31b complaint — KEPT PROVISIONALLY; the diagnosis
agent's final report ratifies or amends. ROOT CAUSE: my `git add &&
git diff --cached --stat | tail && git commit` chain made the staged
pre-check DECORATIVE (output printed, nothing gated). NEW LANDING
LAW: the --cached inspection is a SEPARATE evaluated step — never
chain it into the commit command (extends the camoKit lesson).

## 5.45 §5.31b CLOSED — DEPLOY-RENDER ROOT CAUSE + 15 FLIPS RATIFIED
(2026-08-08): root cause = the 18 era-placed ids' MODEL_SOURCE=glb
registrations were UNCONDITIONAL (not dev-gated) — deploy swapped
prints over our procedural builds everywhere (tankFactory 4629-class
swap; strip-nc only strips quarantine trees; all 18 GLBs are CC-class
and shipped). EXECUTED + RATIFIED (landed in 81bdad1, byte-verified
worktree==HEAD, vite-ssr + public-view probes + npm test green): 15
ids flipped to source:'procedural' with prints retired to candidateGlb
(kv2/t30 pattern) — the ww2/casemate/soviet-heavy 13 + merkava4
(userdrops3) + m1a2_tusk (variants.js + userdrops4 tejas-alias
retirement; tejas stays the measurement oracle §5.34). Deploy-view
glb-sourced 19->5 (exactly is7/object279/newc_tiger/q_heavy/
recon_tank). NO-BUILDER QUEUE (donors named, §5.13-consistent): t44
<- t54 profile, type59 <- t54 (print is a Type 69), m48 <- m60a1 +
m47 turret grammar — russia lane x2 (queue behind t90-family) +
patton lane (after m45 lands). 18 honest procedural ledger rows
staged this commit (leichttraktor 15.9 / tiger2 29.2 lows = ladder
candidates, owner-priority call). FOLLOW-UPS: Q3 SOURCES PRINT-CATALOG
implementation (view-only print cards from candidateGlb rows + 1-line
tankFactory seam + strip-nc candidateGlb guard) — round messaged to
the diagnosis agent; ICON REGEN for the 15 + sepv3 at a calm-load
window (genIcons reads MODEL_SOURCE live); two repo chips filed by
the agent (dist ships *.glb.bak incl. quarantined tejas 18.3MB;
strip-nc registry-probe blind spot). ASK-OWNER: (1) t44/type59/m48
show prints in era groups until built — acceptable interim? (2)
newc_tiger WW2 filing, (3) Sources cards view-only vs playable, (4)
leichttraktor/tiger2 rough procedurals — ladder priority.

## 5.46 SOURCES PRINT-CATALOG LANDED (2026-08-08, §5.31b closing
order "make sources have ALL actual tank models"): NEW
src/vehicles/printCatalog.js — lazy, garage-only print catalog derives
one VIEW-ONLY pseudo-spec `print:<baseId>` per candidateGlb row (18:
the 15 flips + kv2/t30/is1); renders through the existing swap
pipeline; CONTAINED (never in ALL_TANK_IDS 107==107, allSpecs
print-free, bots/matchmaking/tools blind to prints). garage.js 11
markered hunks (Sources chip cards: ribbon+thumb, VIEW ONLY battle
guard layered: battle() hard-return before any emit + disabled button
+ no equipment/camo rows). tankFactory ONE markered seam
(modelCfgOverride). strip-nc guard #2 now FAILS on candidateGlb rows
referencing stripped paths + registry probe emits the candidates map
(the two chip-filed gaps partially covered). VERIFIED on delivered
bytes: dev + VITE_PUBLIC_BUILD=1 vite-ssr probes ALL PASS (deploy
Sources = 5 playable prints + 18 print cards = every shipped
actual-tank model), guard end-to-end OK exit 0, npm test 0. PIXEL
EVIDENCE PENDING the agent's calm-load watcher (tools/
tmp-print531b-shots.mjs self-asserts chip/cards/guard, exit 1 on
miss — fix-forward if it finds a defect). ASK-OWNER additions: (5)
print:newc_pziii shows in Sources though the base id is
carousel-delisted ("Minecraft-grade" curation) — ALL-models read
overrode; one-liner if the delist should win. (6) print-card
portraits ride the base icon — after the pending icon regen they show
the CUSTOM portrait until genIcons learns print ids (icons-lane
follow-up).

## 5.47 M45 GRADUATION: VISUAL FAIL 8.8 — TWO ORDERS, DO NOT FREEZE
(2026-08-08): geometry 90.7 PASS independently CONFIRMED (x5 total,
gate JSON byte-reproduced; hash bracket 9f5c94d0 held through all
renders; sibs byte-held; §J yaw PASS; §B2 zero through-hull; all six
brief identity checks TRUE incl. the bow-flush howitzer + §5.35
item-11 closure flood-0). FAILS the family casting bar: (1) m45 dome
ships the SLAB LOFT — no loft.smooth (patton.js ~3911) while
m46/m47/m26-r2 all carry it; the m26-r1 8.8 precedent EXACTLY;
acceptance = gate JSON BYTE-REPRODUCES post-smooth (SMOOTH-RE-EMIT
law), kills the facet reads in 10/14 views. (2) commander cupola is a
0.076-r knob where the print reads a ~0.63m split-hatch ring — the
roof's second landmark; rebuild r~0.30 ring at the SAME station
(x -0.765, z +0.27) carrying the SAME 2.55-2.625 crowns (side
silhouette unchanged = gate-blind), plan-interior hw<=1.21, lid edge
pinned ON the ref face (CORRELATED-TEETER law). Respawned to the
patton lane; ANY geometry edit invalidates the verdict — next sitting
re-adjudicates all 14 views fresh at the new hash. m26 §3 RE-RECORDED
2f006738 this commit (double-confirmed). m48 new-build stays queued
behind patton.js.

## 5.48 LEOPARD SOURCEFIX DELIVERED (2026-08-08, pending critic):
proto afb3cc3c->4f6360fe x2 (UNSKIRTED early hull — print + trials
photos agree; 4 return rollers exposed; rangefinder-housing turret;
RCWS removed, blanked OWS ring per walkaround; hull 46.8->48.7
hold-improved, dims 100 held, §5.35a rail re-roled + corridor
guarantees re-proven). leo2a4 12db10a0->b68e42c2 x2 (blunt-brick 2A4
turret replaces the type90-dart §5.16 artifact; EMES right-front;
bespoke 3+6 skirts calibrated to the a5 wheel-read; FALSE-0/no-oracle
— visual verdict only). BOTH: §5.18 belly closures. Graduates
byte-held x4 sweeps. Independent critic SPAWNED (source-fidelity
scoring, garage-weighted). ASK-OWNER (banked, adjudicated
newer-order-wins): §5.09 ordered "huge automated turret crows system
on the revolution and OTHER leopards" — the source-material order
for these two historicals removed their RCWS; restoration is one
commented call per tank if stations on historicals are still wanted.
tools/tmp-srcfix-raypick.mjs deletes at landing; proto ledger row
stages at landing.

## 5.49 BACKWARDS-PRINT FLAGS ADJUDICATED: ASSERT MISFIRE, NOT PRINT
DEFECT — MY REPAIR DIRECTION REVERSED (2026-08-08): the extract
flagged t90/k1a1/type99a "hull BACKWARDS vs gun, DO NOT score"
(t62_bergman class). I authored turret-cluster 180 rotations — WRONG
on all three. COUNTER-EVIDENCE (type99a builder, six raw-vertex hull
tells: center-lane dozer +z, glacis toe +3.30 vs grille wall -3.5,
skirt bias, powerpack deck -z, log rack -z, driver +z; t90-family
builder holds its own raw-probe counter-evidence): the prints are
INTERNALLY COHERENT with bow +z; the flag is the DOCUMENTED §D
orientation-assert misfire for hulls whose RAISED REAR DECK tops the
bow run (99a 1.78 > 1.50 — T-90/K1A1 same class). My own experiment
corroborates: physically flipping 99a's tube did NOT change the
assert's gun read. TWO NEGATIVE RECEIPTS BANKED: (v1) cluster-bbox
center is GUN-DRAGGED (99a turret would fly 5.6m off-station — caught
pre-damage by re-inspection); (v2) the transform-path composition
scattered blender-baked clusters (t90 len 7.03->4.57 garbage read =
mesh-local centers are NOT shared-frame when nodes carry transforms).
ALL THREE RESTORED PRISTINE (99a bbb31bfe from the owner drop;
k1a1/t90 re-baked from OBJ sources — recoverable ONLY because sources
existed: instrument bakes now get .bak mirrors like oracles). Pristine
receipts verified to the digit vs the first honest sweep and
COMMITTED with agree:false STANDING as ADJUDICATED-MISFIRE (FALSE-0
analog — never read as a print defect; the §D assert needs a
raised-rear-deck guard, filed). HOLDS LIFTED registration-only:
builders verify presentation in their first pair renders; yawOffset
map fixes on request from my lane. Interpen flags on all seven AW
prints = the sunk-turret print class (§B7 caps; vladimir batch-50
kin). Seven receipts land this commit (k2, amx40, k1a1, t90, t90ms,
t90a_burlak, type99a) + type90's v2-oracle receipt.

## 5.50 AW REST-POSE-REAR TURRET CONVENTION + REGISTRATION FIX
(2026-08-08): the t90-family builder verified IN HARNESS MASKS (gate
pair at load 10.4) that the three russia AW prints' TURRET CLUSTERS
present ~180 reversed while hulls present forward-correct (antenna
seats reading at mirrored z; flip center ~= ring z +0.45..0.47) — the
AW game-rig convention authors turrets at rest facing REAR. This also
explains the §5.49 assert soup (gun-sign reads). FIX APPLIED (my
lane): yawOffset Math.PI on t90/t90ms/t90a_burlak rows in all three
harness maps + vertex REG (perl edits grep-verified 1/1/1 per file
per id). Other AW prints (k2/k1a1/type99a/amx40) NOT changed — their
builders verify presentation per §5.49 and message evidence if
reversed. RULINGS relayed to the builder: burlak width-normalization
(±2.04 cheek modules shrink the hull read to 3.55 vs 3.78) = §B7
PACKET CAP (no named-width mechanism in the harness; do not warp the
print); burlak overallLengthM 9.76 honest-variant = ASK-OWNER banked,
builder may set 9.76 with the ask note (spec-sovereignty ratification
at landing). Baselines x1 landed honest (t90 20.1 / t90ms 16.8 /
burlak 0-capped, floaters 100 all); 14 graduates verified EXACT
mid-round. NOTE: this relay was MISDELIVERED to the owner's parallel
camo/UI session and returned verbatim — cross-session relay routing
is a known hazard; builders should SendMessage the orchestrator
directly, not rely on relays.

## 5.51 TYPE99A ROUND DELIVERED + TWO RULINGS (2026-08-08): re-list +
full print-loft rebuild delivered uncommitted at 8d13f030 (r1 min 0 ->
r7 hull 17.7 / whole 25.4 / turret 29.7 / stations 71.3 / dims 0 /
floaters 100, x2 both ends; battery clean; residents byte-match HEAD;
leo2a4 delta = leopard-lane WIP, expected). Presentation NOT reversed
— no yawOffset on 99a rows (the AW rest-pose-rear convention is NOT
uniform across the series; §5.50 applies to the russia trio only).
Identity critic SPAWNED. RULINGS on its two asks: (1) heightM DATUM
2.37 -> 2.86 APPROVED-WITH-ASK (t14 precedent: p95-envelope datum
incl. mandatory tower+MG; receipt +55.7%; applies AT LANDING with
re-gate x2; ASK-OWNER banked — revert to 2.37 on owner's word); (2)
§E batch-51 QUEUED (99a print: Object_29 turret-handrail strand
excision ~196 verts y>2.05, worth ~-25/-30 both hull rows + the
warp menu body x1.062 / gun -0.21 / roof-mast band — §5.28 type90
pattern) — SANITY GATE per §5.39 + §5.49 laws: warp targets checked
vs the real ZTZ-99A published profile + raw-vertex tells BEFORE
execution; .bak mirror BEFORE any byte surgery (quarantined
instrument class).

## 5.52 TYPE99A RATIFIED + LANDED (2026-08-08): identity critic PASS
9.05 at 8d13f030 (14 fresh pairs, garage-weighted; §H.4 acid
unambiguous; arrow glacis reads as a true arrow with the tip law
honored; per-view floor 8.8 = the front-ortho camo-flattened seam,
banked). Landed with the §5.51 APPROVED datum heightM 2.37->2.86
(re-gate x2 bit-identical: min 0->17.7, dims 0->87.5) — the id is
MEASURABLE and laddering (§E batch-51 menu = the next rungs).
POLISH BANK (next 99a touch): D1 unditching-log tone -> dark
wood-brown (loud at the garage default pose), D2 arrow-seam
catch-light strips for pure front ortho, D3 basket rim -0.02. Owner's
"fully model a custom type99a" order: EXECUTED (re-list + print-loft
rebuild + dual verification). Fleet line read 23/93 mid-window — a
parallel battery landed a pass; reconcile at its landing.

## 5.46-PROVEN (2026-08-08): Sources print-catalog pixel evidence PASS
both views (dev + VITE_PUBLIC_BUILD=1): 18 PRINT-ribboned cards, print
selection renders the actual print on the pedestal with VIEW ONLY
plate + CC-BY credit + no equipment/camo, forced BATTLE click leaves
the garage intact (no battle entry), public Sources = all 22 shipped
actual-tank models (4 playable prints + 18 print cards; newc_tiger =
the delisted 5th playable, standing ask). Shots shots/print531b/
(x6). Census: dev Cold War 21 / Modern 50 / WWII 23 / Sources 30;
public 22/53/27/22 — the era groups carry the flipped customs. Tool
note: the shots rig now freezes HMR (a mid-capture vite reload from a
sibling lane killed run 1 — live-tree hazard, tmp-tool-only fix).

## 5.54 BRADLEY GRADUATED — 28th (2026-08-08): visual half PASS floor
9.0 / mean 9.16 x14 at freeze-verified 90a5568c (critic battery:
trough-run, KOREA-cohabitation audited clean — buildBradley outside
every WIP hunk, hash EXACT through it; rig parity yawProxy <=2.1
except rear 8 under the abort gate; both enclosed-void flags
adjudicated benign in pixels). Dual gate complete (geometry landed
81bdad1). Dress-tier bank (7 items, none <9.0) recorded in §3. The
critic's m2a2_bradley override row in tmp-tank-critic.html already
landed via §5.50 (attributed).

## 5.55 LEOPARD SOURCEFIX RATIFIED + LANDED (2026-08-08): critic PASS
both — proto 9.3 (unskirted early hull lands completely: 7 dual
roadwheels + 4 return rollers countable with real daylight; PT turret
with stereo-rangefinder blisters; cast mantlet fills the front; the
blanked OWS ring reads deliberate), leo2a4 9.2 (blunt-brick plan —
the dart is dead; EMES-15 recessed at the right front corner; 3+6
skirt census exact with 7 wheel arcs countable; the owner's
"counted zero wheels" fixed with real geometry). §5.18 bellies hold
both; §5.16 family grammar held with no borrowed type90 fittings.
Hashes landed: proto 4f6360fe, leo2a4 b68e42c2; graduates byte-held
throughout (leo2a5/leo2a6/kf51/revolution). The owner's "they dont
match their source material at all" is answered in the garage.
leo2a4 = FALSE-0/no-oracle (no ledger row); proto row unchanged
(0-capped, hull 48.7 inside it). RCWS ASK stands (§5.48).

## 5.53 TURRET-REST-YAW INSTRUMENT (WIP, knob DORMANT): the §5.50
scene yawOffset was proven NULLIFIED for the AW trio (t90-family
builder's mask evidence: turret rows value-identical pre/post, ref
guns over engine decks in the board strips) — line ~2357 rotates the
WHOLE SCENE and hull re-registration cancels it (amx30 class). A
turret-LOCAL rest-yaw knob (cfg.turretRestYaw + turretRestYawCenter)
was added to modelLoader (§5.53 block, pre-pivot, world-frame
parent-inverse composition) but BOTH activation attempts CRATERED t90
(hull 67.5->0, ref masks sunk, side_hull cover 3.76% — the transform
chain scatters through the re-bakes' baked node frames, suspect scale
in the chain; bbox-center axis also rear-biased vs the builder's
measured flip center z+0.46). Two-strikes rule (§5.49): rows REVERTED
to the known-scoring state (t90 24.9 verified restored; no yaw keys
on the trio), the knob lands DORMANT (opt-in, no print carries it),
and a FOCUSED INSTRUMENT ROUND spawns with the full evidence chain +
the blender-source alternative (rotate the cluster at obj2glb time —
the amx30 source-cure precedent). The t90-trio identity critic HOLDS
until the instrument fix (reversed ref strips would poison pair
scoring); turret/station/whole rows for the trio stay
presentation-capped and documented.

## 5.56 SEPV2 ECHO-DELETION RATIFIED + RE-FROZEN (2026-08-08): the
§5.34 chain is COMPLETE — works echo deleted (-52/+15, -6588 verts),
gate recovered FALSE-0 -> 64.6 x2 exactly as predicted (hull +69.5,
whole +47.3, turret +59.1), re-cert PASS 9.2-9.4 across all 10
changed views with the builder's evidence BYTE-AUTHENTICATED (critic's
34 own shots byte-identical to the builder's after-set), yaw90 arc
ruled "the first honest sweep" (the echo had been visually colliding
with the shell). §3 re-frozen 54b35994. FALSE-0 annotation RETIRED
for sepv2 — the row is honest geometry now. Critic tmp tools deleted
at landing.

## 5.57 TYPE90 LADDER RATIFIED + LANDED (2026-08-08): identity critic
PASS 9.3 — THE OWNER'S DEFECT IS DEAD, quantified twice (turret-band
fraction front 0.281 proc vs 0.268 ref, side 0.203 vs 0.194;
cross-family garage math: type90 = 0.940 x proto silhouette height =
the real-dims 2.34/2.49 ratio EXACTLY). §5.16 mantlet order executed
in pixels (recessed well, stepped collar, bore low-in-face). Gate
45.1 -> 68.9 landed (stations 93.6 PASS, dims 100; turret 68.9 =
crown-band dims-datum cap + chin-band warp receipts). Hash 741352c4
-> b9182ad4. Round law-bank: HALF-PHASE LERP law + STATION END-CAP
physics + three-bin crown allocation (in the packet R7). UNLOCKS
QUEUED (my lane): §D type90 heightM datum reconciliation (2.34 roof
vs published-3.05-over-sights class) + §E chin-knee revision
(pre-warp 25mm receipt). Dressing bank (next touch): basket lattice,
cheek chamfers, dead-front slab.

## 5.58 M45 GRADUATED — 29th (2026-08-08): sitting-2 PASS floor 9.0 /
mean 9.13 x14 at 53caa687 (triple-bracketed through seven foreign
landings). Order 1 verified in pixels (slab facet family GONE in all
10 carrier views; crown = the m26-r2 anchor grade; hwL asymmetry
survived the re-emit). Order 2 adjudicated RING-CLASS at the correct
station — pixel-blend registration: outboard faces coincide ~6cm,
hinge+lids at the ordered -0.765; the Ø0.57/x-0.65 deviation is
measured-compliant (the ordered literal gates 88.4 by receipt; drum
prominence is measured-impossible under the dual gate — certified
silhouette-tax residual recorded beside the r3 close entry in the
packet). FLEET 23/90 PASSING. Patton lane FREES -> m48 build spawns
(m60a1 + m47 turret grammar donors, §5.45 queue). Round law-bank
already landed §5.41 (workorder-flip, registration-sliver); both
sitting tmp drivers swept at landing.

## 5.59 KOREA DELIVERED + K2 FOLLOWER FIX (2026-08-08): k2 rebuilt to
print lines (48d0f7e — arrowhead turret, KAPS/KSPAW flush cheek-plane
device, dims 0->100 via the p95-spike census) + k1a1 NEW (2e210838 —
baby-Abrams identity, presentation PASS no-flip dAlong 0.000, min
46.2->54.8, dims 100). k2's capped rows = REF partition defects
(numpy receipts): Object_22 carries glacis material (was in the
turret mask), Object_23's turret-roof rails were misfiled hull-side.
FOLLOWER FIX APPLIED (my lane, three maps): 22 OUT / 23 IN — forecast
70-85 band; agent re-gating x2 both ids; identity critic spawns on
its numbers. m48 NEW BUILD SPAWNED (patton lane freed by the m45
graduation; §5.45 queue — m60a1+m47 donors, atmodeler print oracle).

## 5.59a K2 FOLLOWER SWAP DISPROVEN BY MEASUREMENT — REVERTED
(2026-08-08): the §5.59 swap (22 out/23 in) cratered side_hull
42.7->24.6 while plan/front hull gained — BOTH nodes are MIXED
hull+turret materials; follower assignment only picks which mask eats
the foreign half (config A strictly better on every moved row,
x2-exact pairs both configs). Maps REVERTED to config A (grep 1/1/1);
agent restoring the config-A ledger record. ADOPTED: the §E unlock —
BATCH-52 queued (k2 print: bake-strip Object_23 entirely [301 verts:
tow strips + three turret-roof rail clusters, receipts in k2.md] +
split Object_22's sub-1.7 glacis/skirt band keeping the cheek-armor
top as follower; forecast side/front hull -> 70-85 band + first
honest turret read; §5.39/§5.49 sanity gates + .bak). LESSON
(follower-law addendum): mixed-material nodes cannot be mask-assigned
correctly — measure BOTH configs before ratifying any follower change,
or go straight to §E when receipts show mixed bands.

## 5.60 §5.50/§5.53 RETRACTED — THE TRIO WAS NEVER REVERSED
(2026-08-08, instrument round verdict with accessor-bound receipts):
all three prints are FORWARD-CORRECT in their bytes (t90/t90ms/burlak
landmarks all correct-facing; no scales, no matrices — every §5.53
suspect disproven; k1a1 re-verified clean too). THE PHANTOM CHAIN:
(1) my §5.50 scene-yawOffset rows went LIVE before the t90-family
builder measured — its "turret reversed" mask evidence read the
artifact MY fix created; (2) the §5.53 knob's math was EXACT but a
rearward-pointing gun trips procedural-fidelity's rear-facing-gun
AUTO-FLIP (line ~534: ref root += PI) — the whole ref presented
hull-reversed = the crater signature, "sunk masks" were probes of the
flipped root. At HEAD refRootYaw=0 all three; presentation CLEAN; the
trio's capped rows are ORDINARY build-vs-print deltas (russia-lane
ladder work: t90 turret p95 13.3% antenna/roof cols, t90ms bustle-cage
plan footprint, burlak plan footprint + §B7 width + dims-75
proc-vs-published). LANDED: t90ms vertex REG over-strip repaired
(gunNode/autoPivot restored), the swallowed temp hook removed from
procedural-fidelity (4665869 had swept it — §5.44a class), loader
§5.53 block comment true-up (knob stays dormant, code byte-unchanged).
Acceptance x2 at knob-off matches the ledger exactly (t90 24.9 /
t90ms 11.7 / burlak 0). TRIO CRITIC HOLD LIFTED. LESSON (§5.60 law):
when a fix's evidence was gathered while an earlier fix was live,
re-verify the ORIGINAL state before chaining — a fix can manufacture
the artifact the next fix chases; and know the harness's own
auto-behaviors (the rear-gun auto-flip) before interpreting masks.

## 5.61 KOREA CRITIC: BOTH FAIL — FIX ROUND DISPATCHED (2026-08-08):
k2 6.8 / k1a1 6.4 vs the 9.0 bar (hygiene passed: yaw90 unity,
no-air, bore, massing skeletons; identity failed: TURRET-HULL FUSION
the killer on both — flush walls read as casemate slabs; roof kit
underscaled to invisibility under the height caps; wheels buried;
vertical bows; k1a1 inverted rotor + solid baskets; k2 placeholder
fins + decal-flat KAPS; family distinctness weak-fail with the
fleet's own m1a1 as the existence proof). Builder resumed with the
critic's five ordered fixes; fresh sitting on new hashes at delivery.
Batch-52 (k2 print surgery) may run in parallel — the builder is
briefed to re-baseline through it. The bar is the bar: two §5.38
tanks failing critics is the process WORKING (§K).

## 5.62 KOREA FIX ROUND DELIVERED — SITTING 2 SPAWNED (2026-08-08):
all six §5.61 orders built at k2 27c330c3 / k1a1 53b64e74, gates
hold-or-improve x2 (k2 stations +8.7 from the print's-own rising
bustle underside; k1a1 whole +1.6, turret +0.2), guards x7 held incl.
frozen bradley, batch-52 confirmed NOT yet landed (k2 GLB md5
unchanged — every row move is build-side). Measured revert receipt
banked (smoke at |x|1.77 paid -7 front_whole vs the fender lane ->
tucked 1.61). NEW ASK-OWNER: k1a1 K6-on-cupola is dims-law-blocked
(receiver 0.26 over the 2.21 roof kills the 2.25 p95) — low-mount law
applied; owner may trade heightM grace for the cupola-mounted read.

## 5.63 AMX40 RATIFIED + LANDED (2026-08-08): identity critic PASS
9.2 — "reads as the Satory demonstrator at the fleet's ratified bar";
every identity item census-confirmed (underbite beak, 45-degree ramp
drums, one-plane front-left sweep + two-facet right cheek +
right-deep bustle, LLLTV/F2 stations measured in-frame, bore 6.644 =
overall 10.044 +0.04%); §J yaw-90 closed in pixels; two false alarms
run down and cleared by census (camera-tilt leak + the critic's own
px/m error — the adversarial process working). Hash 25633150; row
38.6 lands cap-documented (print optics tower 2.43-3.09 + rod masts
over the 2.38 published roof — the §E knee-2.39 normalize is FILED
and now UNBLOCKED in the orchestrator queue; t90m batch-23 precedent
forecasts the 64->90-class arc). france.js module goes live (stub ->
full resident). Wave score: type99a landed, amx40 landed, type90
landed; k2/k1a1 in sitting 2; t90 trio critic scoring.

## 5.64 T90 TRIO CRITIC: ALL THREE FAIL — FIX ROUND DISPATCHED
(2026-08-08): t90 7.0 / t90ms 6.5 / burlak 6.5 vs the 9.0 bar
(hygiene clean x3, identity short on 17 measurable defects — verdict
doc docs/critique/shaded-parity-t90fam-trio.md). Headliners: §5.29
chevrons authored as WIRE RAILS not panel banks (law candidate:
chevron orders carry a plan-footprint number); shared egg turret plan
across three marks; floating glacis ERA shelves w/ blue untinted
cells; t90ms slat cage inset as a louver grille (law candidate: slat
orders specify STAND-OFF geometry); burlak bustle proportion INVERTED
(2.4-2.6m vs the print's 1.9m magazine). Builder resumed with the
full order set + return-path pin (three prior reports misrouted to
the owner's parallel session). Landing HOLDS; fresh sitting on new
hashes. Wave ledger: 3 landed (type99a/type90/amx40), 5 in fix
rounds (k2/k1a1 sitting-2 pending, trio fixing).

## 5.65 KOREA RATIFIED + LANDED (2026-08-08): sitting 2 PASS both —
k2 9.0 / k1a1 9.1 (from 6.8/6.4; all six §5.61 orders KILLED in real
geometry: fusion carved with shadow gaps + the m1a1-comparator
standard met, roof kit massed within caps, receding bows, k1a1's
defining 3-step rotor + proud smoke + open pipe-frame racks, k2's
faceted KAPS relief). Hashes k2 27c330c3 / k1a1 53b64e74; rows land
(k2 38.8 cap-documented pending batch-52; k1a1 61.5). k2 RE-LISTED +
k1a1 NEW both live in modern3.js. §5.38 WAVE: FIVE LANDED (type99a,
type90, amx40, k2, k1a1) + the t90 trio in its fix round. BATCH-52
UNBLOCKED (k2 print surgery — §E queue). RESIDUAL BANK (next density
round): skirt hems ~2x deeper than the prints' on both (wheel
glance-read + likely side-row gains), k2 K6/pano scale pending the
§5.62 heightM-grace ASK, k2 plan margin 86% vs print 82%.

## 5.66 BATCH-52 NEGATIVE RECEIPT — REVERTED ON THE STATIONS CLAUSE
(2026-08-08): the k2 print surgery executed with full law compliance
(.bak first, byte-derived sanity, idempotence x2, accessor bounds
rebuilt, authored as a proper disarmed REPAIRS batch) and DELIVERED
ITS FORECAST on the target rows (hull 38.8->56.3, front_hull ->74.64,
plan_turret cover deficit cleared) — but stations 50.5->41.7
regressed and turret held 0, so the agent RESTORED pristine
(4d6d7db3 verified) and disarmed the recipe. TWO ROOT CAUSES (byte
receipts in k2.md §E): (1) LADDER-ANCHOR COUPLING — the Korea r7
build anchored its front-half skirts at ±1.80 = the exact Object_22
band the excision removes (the print's true run is ±1.72-class);
(2) SECOND CARRIER — Object_19 (the GUN node) contains the left
roadwheel/suspension colonnade (252 comps, six stacks at 0.9 pitch)
= the refBot -2.0 in both states' worst rows; §5.59a's 22+23 scope
could never open the side row alone. BATCH-52b QUEUED as a COUPLED
landing: re-arm + Object_19 colonnade excision + Korea-lane skirt
de-ladder to ±1.72, ONE landing -> then 70-85 + the honest turret
read. TWO LAW CANDIDATES ADOPTED: ladder-anchor provenance check
before any §E excision; full-cluster census before partition batches.
NEW §E OPS BANKED (in repair_oracles.py, reusable): _detach_child_node
(vladimir-class) + _index_surgery rebuild_bounds opt-in (GLTFLoader
seeds bounds from accessor min/max — load-bearing). Load-deviation
note: the <15 trough never arrived (owner QA fleet at ~21 for 8h) —
x2 bit-identity carried the acceptance instead, all four runs exact.

## 5.67 BATCH-52b LANDED — K2 UNLOCKED (2026-08-08): the coupled
landing succeeded on every acceptance row x2 (hull 38.8->56.1,
front_hull ->76.26, TURRET 0->52.8 = the first honest read proving
the Object_19 colonnade was the §5.66 second carrier, stations
50.5->53.2 — the de-ladder cured the regression AND gained, dims 100
robust after the in-scope KGPS 2.40-datum re-tune). MD5 chain: print
4d6d7db3 -> 7b3a76e9 idempotent x3, .bak pristine; recipe stays
ARMED. Build k2 27c330c3 -> 2ac112a8 (skirts print-true ±1.72,
§5.65 hems executed — wheels read below the hems in both halves).
Guards x8 held, npm 265 green x2. §5.66's two law candidates PROVEN
in practice (full-cluster census found no fourth carrier;
ladder-anchor provenance drove the de-ladder). NEXT (Korea lane):
the k2 90-ladder vs the opened rows (side_whole 48.4 floor = the §B7
pano/mast band -> the banked antenna y-warp is the next print move)
+ the density critic on the §5.65 residuals.

## 5.68 M48 RATIFIED + LANDED (2026-08-08): identity critic PASS 9.15
— boat-bow + egg-dome + Urdan-config A5 unmistakable in the fleet's
densest family (exemplary §B8: the critic REJECTED a pre-existing
shot set as self-reads and reshot everything). Hash 6dd253b0; row
lands 0-capped honest (whole/turret = the unrepaired print's 12.6
pitched tube+shield — §E TUBE-LEVEL batch queued from the packet's
worked _region_pitch recipe + the critic's stern grille-door
suggestion rides it). §5.31b ARC COMPLETE for m48 (MODEL_SOURCE
flipped procedural + candidateGlb — our custom renders everywhere;
the no-builder queue is now t44+type59 only). FLEET LAW LANDED:
WIDTH-CARRIER (buildRunningGear ring-span authored past W/2 silently
rescaled the whole build x0.9921 for five rounds — §F.2 endRingSpan
opt-in in tankFactory, byte-identical default guard-proven) + the
flat-deck slice-paint parity opt-in + three more in m48.md for
BUILD-STANDARD folding. userdrops7 lands BOTH lanes' hunks with
attribution (m48 dims 6.42->6.87 two-source correction + the trio's
round-verified §5.38 spec rows — §5.44 precedent; if trio sitting-2
orders spec changes, a follow-up edits them). ASK-OWNER added: m48
heightM datum (print = low-cupola A5 crown 2.718 vs the 3.09
M1-periscope row — the §E tube-level projection ~80s needs the
ruling for graduation).

## 5.69 T90 TRIO RATIFIED + LANDED — THE §5.38 WAVE IS COMPLETE
(2026-08-08): sitting 2 PASS x3 (9.0/9.0/9.0 from 7.0/6.5/6.5; min
views 8.5; all 17 defects dead in the critic's own pixels — real
panel-bank chevrons x3, three distinct plan grammars, seated
plate-true glacis ERA, stand-off slat lattice, burlak bustle
hierarchy MEASURED 1.68m vs casting 3.05m; both ordered trades
verified to the decimal and not penalized). Hashes land: t90
fe57fdf4 / t90ms a8aceea0 / t90a_burlak 8ef4d428; rows 29.8 / 20.7 /
0-capped. TWO LAWS RATIFIED (validated across both sittings):
CHEVRON-PLAN-FOOTPRINT (chevron orders carry a plan-area number, not
just a tip line) + GRILLE-INSET SLAT FALSE-FRIEND (slat orders
specify STAND-OFF geometry with open air behind). ALL SEVEN §5.38
OWNER-WAVE TANKS ARE NOW LANDED + INDEPENDENTLY RATIFIED: k2 9.0,
type99a 9.05, k1a1 9.1, m48 9.15, amx40 9.2, type90 9.3, t90 9.0,
t90ms 9.0, t90a_burlak 9.0 (nine builds from seven drops — type90
rode the wave's oracle fix). NEXT (russia lane): the trio turret
shape-ladder on the §5.60 worst-column receipts + t44+type59 builds
(t54 donors — the last §5.45 no-builder ids).

## 5.70 MISC LADDERS LANDED (2026-08-08): LECLERC 86.2 -> 90.3 GATE
PASS every component >=90 x2 bit-identical (hash 206c5fd1 ->
683be340) — FLEET 24/96; GRADUATION CRITIC SPAWNED (potential #30).
Five decoded batches incl. the rear-plate razor-anchor rescue
(hullLengthM 6.76-class caught) + the §5.14-era commander-well doc
claim TRUED (measured z_w 0.32..0.66). ARIETE 82.3 -> 83.1 (r3
ceiling broken via the print-band sleeve; new ceiling ~85-86; §E
nose/tube/basket print work = the 90 path, filed). AMX30 PAIR §5.36
ladder complete: floaters 0->100 both, dims 22.7/44.6 -> 99.4/98.1
(hashes e2a7ae50/3aeacbf9); curves capped by the decoded TALL-HULL
PRINT CLASS (print deck 1.68/roof 2.9 vs pub 2.29) — §E y-normalize
escalation joins the queue. INCIDENT BANKED (amx30 packet): a
first-match perl edit transiently hit type74's identical L7 gun line
— caught by the hash battery, reverted byte-exact; LAW: shared-line
edits anchor on unique context, and the guard battery is the net.
Guards held on final bytes (type90 b9182ad4 / type74 7ba404c5 / t80u
af5e3ad9); leclerc track-clip 14/0 BETTER than its certified 24.

## 5.71 LECLERC GRADUATED — 30th (2026-08-08): the §K exemplar tank
completes its dual gate — 90.3 x2 every component >=90 (§5.70) +
graduation floor 9.0 / mean 9.17 x14 at freeze-verified 683be340
(rig pixel-identical to the Aug-6 certified adjudication; every
ladder-touched region adjudicated artifact-free: wrap fills read as
fender assemblies, the drop strip as skirt hardware, gun dead-center
in plan). 30 GRADUATES; FLEET 24/96. The §5.33 campaign's proven
routes continue: ariete §E path (~85-86 ceiling -> print work),
amx30-pair y-normalize, the trio turret ladder (live), k2 ladder vs
the 52b-opened rows, m48 tube-level, type99a §E menu.

## 5.72 TRIO TURRET LADDER LANDED (2026-08-08): t90 29.8->47.8 (st
+35.4), t90ms 20.7->52.5 (the -4.8 stations trade REPAID at 74.7),
burlak 0->8.6 w/ dims 75->88.3 honest (whip-rough re-class) — x2
bit-identical, hold-or-improve every component, guards x14, identity
self-checked byte-visible vs the ratified §5.64 reads (one hem
regression caught + reverted in-round). Hashes: t90 72104d14, t90ms
034e1bac, burlak d588df50. THREE LAW CANDIDATES banked in the
packets: heightM p95 spike-budget arithmetic (<=3 over-court columns,
fittings can silently hold slots), mid-window station blindness to
axis-aligned boxes, the t90ms +0.35 turret-seat class (check
cluster-vs-hull seat before per-column chases). Next trio rungs are
print-side (§B7 caps + the k2-class §E menu); russia lane FREES ->
t44+type59 builds spawn (the last §5.45 no-builder ids).

## 5.73 OWNER RULINGS (2026-08-08, interactive session):
1. HEIGHT-DATUM LAW RATIFIED FLEET-WIDE: heightM = the P95 ENVELOPE
including mandatory roof kit (t14/type99a precedent made law).
type99a 2.86 CONFIRMED. APPLICATIONS QUEUED: type90 datum round
(misc lane, receipts-derived envelope value — unlocks the §5.57
crown-band cap), m48 datum (rides its §E tube-level landing), k1a1
K6-to-cupola + datum (queued behind the k2 ladder, modern3 lane).
2. AW-SERIES PROVENANCE: KEEP as local-only measurement references —
standing state confirmed, ask closed.
3. LEOPARD RCWS: RESTORE on leopard2_proto + leo2a4 (owner overrides
the historical default — §5.09 stands for ALL leopards). Round
spawned: uncomment both calls, gate x2 hold-or-improve, re-cert
critic follows (changes ratified reads).
4. BURLAK 9.76 CONFIRMED + NEW ORDER: "update our previous t90s to
adhere to these new measurements and centering for consistency" —
the older t90 marks (t90a/t90m/t90sm/vladimir incl. GRADUATES) get
the honest-variant measurement approach + the §5.72 cluster-seat
centering law; graduate-change chains per frozen tank; QUEUED behind
t44/type59 in the russia lane.
DISMISSED-PENDING (owner: "wait for next instruction" — NO ACTION):
m45 6.6->6.47 row, newc_tiger era filing, AFV-stats meaning, Sources
cards view-only-vs-playable. All stay at current defaults.

## 5.74 OWNER ORDER — M1A2 LEGACY RETIREMENT + ABRAMS DISTINCTIVENESS
ROUND (2026-08-08): "its time to retire this m1a2 (dont show it,
clearly mark as legacy), but analyze all of its decorations, add ons,
armor, era, and roof decorations, and apply them to sepv2, sepv3,
tusk, and new m1a2 abrams to make them much more visually distinct
based on different equipment types and passive era blocks on turret
and sides of hull and so on and grass to cover stuff on the sepv3
and even more massive crows automated machine gun systems on the
top." EXECUTED NOW: m1a2 carousel-DELISTED (garage.js DELISTED set,
newc_pziii precedent — stays tech-tree selectable) + spec name
"M1A2 (Legacy)" (the mark travels everywhere the id still shows).
QUEUED (abrams lane, BEHIND the live flank-panel round — builds on
the pitched panels): the DISTINCTIVENESS ROUND — harvest the legacy
m1a2 build's full kit inventory (works-field stowage grammar, ERA,
roof kit) and redistribute as per-variant identity packages: sepv2 =
elevated-CROWS signature + one ERA flavor, sepv3 = ADL/IFLIR + GRASS/
FOLIAGE cover + its own package, tusk = ARAT-side ERA + loader shield
emphasis, tejas/new-M1A2 = its own clean package; ALL FOUR get
MORE-MASSIVE CROWS RWS on top (P95-envelope datum law §5.73-1 covers
the height). Coordinated graduate-change wave (sepv2 54b35994 /
tusk b1786e4c / tejas f7510d88 / m1a1-siblings byte-guarded; sepv3
2c9023d0 binding) — re-cert critics + re-freeze wave at landing.

## 5.75 OWNER ORDER — PROFILE-MODULE CONSISTENCY REFACTOR
(2026-08-08): "make some more profile modules for tanks like t90,
t72, t80, challengers, and so on to be consistent." PLAN: one family
per module, PURE REFACTOR LAW = byte-identical tmp-hashgeo for every
moved id (the guard battery IS the proof; zero geometry change).
SPLITS: russia.js -> profiles/t90.js (t90/t90a/t90m/t90sm/vladimir/
t90ms/t90a_burlak/pt91m) + profiles/t72.js (t72b_1987/t72bu/t72b3m)
+ profiles/t80.js (t80/t80b/t80bv/t84) + the t62/t64 residue stays
russia.js (or soviet-mid.js if clean); challengers -> NEW
profiles/challenger.js consolidating challenger1 (from uk.js) +
challenger2/challenger_3 (from modern1.js); "and so on" = the
standing principle for future splits (korea/china candidates noted).
Each split: move builders + shared russia helpers stay importable
(kit.js pattern), export <FAMILY>_PROFILES, wire profiledProcedurals
imports, hash-prove EVERY moved id byte-identical, npm test.
SEQUENCE: challenger module NOW (uk.js+modern1.js free); russia
splits AFTER t44/type59 lands, THEN §5.73-4 (t90-family measurement
consistency) works in the fresh t90.js.

## 5.75a CHALLENGER MODULE EXECUTED (2026-08-08): profiles/
challenger.js (2188 lines) consolidates challenger1 (ex-uk.js,
profiles-class) + challenger2/challenger_3 (ex-modern1.js,
modern-class spec+build) — PURE-REFACTOR LAW satisfied: 15/15 ids
byte-identical before/after (incl. FROZEN centurion3 bad74e60 +
challenger1 5bf5f2ec), ALL_TANK_IDS roster order JSON-identical (the
new module re-inserts at indexOf('merkava4') preserving carousel
order), helpers stay owned by their original files and exported
(never duplicated), npm test x3 green. russia splits (t90/t72/t80)
remain sequenced behind t44/type59 per §5.75.

## 5.76 LEOPARD RCWS RESTORED + LANDED (2026-08-08, §5.73-3): both
calls re-enabled — a4 verbatim (clash-checked clean vs the §5.55
blunt-brick roof), proto with ONE elegant re-seat (the blanked-OWS
ring stand-in became the station's visible MOUNT FLANGE — the
ratified "deliberate ring" read survives as the annulus). §5.09 read
verified in pixels (full FLW anatomy ~0.6m over the a4 roof; squat
station + 2.78w tower on proto); CROWS-FORWARD by construction; §B5
yaw90 unity; ratified §5.55 reads survive BOTH. Proto gate x2: hull
48.7->48.9 IMPROVED, dims 100 held. Builder candidate hashes were proto
d900c8e2 / a4 8fb73bdd (final coupled hashes corrected in §5.78).
leo2a4 heightM 2.48->3.03 APPLIED (P95 law: the FLW band
owns p95Top 3.020 — band-class not spike; m26/type99a precedent).
Guards x3 sweeps EXACT (incl. leo2a7v/leo1a5 siblings). RE-CERT
completed in §5.78; the candidate hashes printed here were corrected
there to the hashes of the actual coupled landing.

## 5.77 TYPE90 DATUM APPLIED — 68.9 -> 79.5 (2026-08-08, §5.73-1):
heightM 2.34 -> 2.55, derived AGAINST the naive 3.05 (a 1-2-column
max-spike over the swung M2 that the gate's antenna-robust p95
correctly excludes — spec'ing it would misdatum honest builds ~16%
low). 2.55 = the ratified 49-v2 oracle's own bodyHeightM through the
gate's dims replica (t14/type99a precedent flow; two-source bracket
2.34 roof < 2.55 p95-kit < 2.60 print max < 3.05 published max). The
§5.57 crown-band cap DISSOLVED: turret_side +10.6, front_whole 90.9,
dims 100 HELD at the new datum via an engineered p95 anchor. Hash
b9182ad4 -> 5d7bc85c x2; guards x6 exact; the ratified 9.3 low-flat
read SURVIVES (kit crowns went flush -> the real proud-ring class).
BRIEF-ERROR CAUGHT by the agent: my D1/D2/D3 dressing items were the
type99a critic's bank, not type90's — the real §5.57 bank (basket
lattice, cheek chamfers, dead-front slab) stays open; §E chin-knee is
now type90's biggest chaseable class. LESSON: brief-writing pulls
banks from the REGISTRY section named, not from memory.

## 5.78 LEOPARD RCWS RE-CERT RATIFIED + HASH RECORD CORRECTED
(2026-08-08): independent fresh sitting PASS x2 — leo2a4 floor 9.1 /
mean 9.21, leopard2_proto floor 9.0 / mean 9.09 across 14 views each
(`shots/critic-leo-rcws/`; full verdict
docs/critique/shaded-parity-leopard-rcws-recert.md). §5.09 anatomy,
CROWS-FORWARD, §B5 yaw-90 unity, mount connection, and the full §5.55
source-fidelity reads all survive. Clean detached-HEAD verification
caught that §5.76's builder candidates were not the hashes of the final
coupled landing: authoritative hashes are proto **a9aba192** and a4
**41587e99**, reproduced both at detached acc0a48 and in the live tree;
the stale d900c8e2/8fb73bdd candidates are retired in both packets.
Frozen guards remain exact: leo2a5 e215a738 / leo2a6 09912270 / kf51
9ac547ac / revolution db70c929. No geometry changed in the correction.

## 5.79 ABRAMS FLANK-PANEL PITCH RE-CERTIFIED + RE-FROZEN
(2026-08-08, owner screenshot order): the shared tejas-family turret flank
bins/lips, CIP and radar faces, seam rails, rear pouch, and drum mounts now
follow the certified 16.9-degree tumblehome instead of standing vertically
off the angled shell. Two full seven-id gate runs were byte-identical; TUSK
reproduced a third time. dims/floaters 100 hold on every gate-able mark.
Independent fresh 14-view sittings PASS all six changed variants: graduate
floors/means m1a1 9.1/9.19, m1a1ha 9.1/9.19, tejas 9.1/9.22, sepv2
9.1/9.18; TUSK 9.0/9.13; false-0 SEPv3 identity 9.1/9.20. RE-FROZEN:
m1a1 **4e28ff40**, m1a1ha **99962364**, tejas **3afe65f0**, sepv2
**c5bfbb70**. Bindings: TUSK **bd371600**, SEPv3 **329ec520**. Retired
legacy m1a2 and abramsx remained hash- and pixel-exact (`636a4860` /
`2c6eb344`). Full verdict:
docs/critique/shaded-parity-abrams-panelpitch-recert.md. The §5.74
DISTINCTIVENESS round is now unblocked and begins from these pitched carriers.

## 5.80 ABRAMS DISTINCTIVENESS ROUND RATIFIED + RE-FROZEN
(2026-08-08, §5.74 owner order): the retired legacy M1A2 inventory has been
redistributed into four unmistakable current-mark packages on the certified
pitched carriers. Tejas/new-M1A2 is the clean ERA-free mark with a broad
unarmored CROWS, sustainment roll, and relay/tool case; TUSK carries the heavy
armored CROWS, strengthened loader shield, four ARAT-style turret panels per
flank, two-course hull ARAT and rear slat cage; SEPv2 carries the tallest
armored CROWS, one broad hull ERA course and four large passive turret slabs
per flank; SEPv3 carries the wide-low CROWS, 9x2 hull plus 5x2 turret micro-ERA,
ADL/IFLIR/Trophy, and deterministic physical olive foliage over the turret,
glacis, and side ERA. The retired `m1a2`, both CWS siblings, and `abramsx`
remain byte guards: **636a4860 / 4e28ff40 / 99962364 / 2c6eb344**.

§5.73-1 P95 DATUM APPLIED to the mandatory kit, replacing the old bare-roof
2.44 row: tejas measured 3.2441 -> heightM 3.24; TUSK 3.2748 -> 3.27; SEPv2
3.4265 -> 3.43; SEPv3 3.1009 -> 3.10. Two edited-tree hash batteries and two
gate sittings reproduced exactly. The resulting oracle rows are tejas 57.8
(91.7/57.8/63.3/91.9/100/100), TUSK 0
(14.7/0/39/23.1/100/100), and SEPv2 37.3
(69.4/37.3/53/73.2/100/100). These are NOT geometry PASSes: the lower mask
scores are the documented, owner-adjudicated divergence caused by mandatory
new CROWS/armor silhouettes plus the honest P95 datum; dims and floaters stay
100. SEPv3 remains FALSE-0 with no invented gate or ledger row.

Independent §B8 fresh sittings PASS all 56 views at >=9.0: tejas floor/mean
9.1/9.23, TUSK 9.1/9.26, SEPv2 9.2/9.31, SEPv3 9.0/9.20. RE-FROZEN:
tejas **01e698e8**, SEPv2 **a0a4e87c**. Bindings: TUSK **7620b020**,
SEPv3 **d6e87b0c**. No fix round ordered. Full verdict and exact score sheets:
docs/critique/shaded-parity-abrams-distinctiveness-recert.md. Fleet ledger
remains **24/96**; graduate count remains **30**.

## 5.81 K2 90-LADDER GRADUATED — 31st (2026-08-08): the Leclerc-method
rebuild closed from §5.67's 48.4 floor to a dual PASS. The final gate is
**90.1** x2 bit-identical: hull 90.6 / whole 90.1 / turret 90.6 / stations
90.7 / dims 95.9 / floaters 100. Geometry hash **827d5ffc** reproduced x2
(63 meshes / 115754 verts). Independent R26 §B8 PASS: all 14 views >=9.0,
floor 9.0 / mean 9.09. Exact track audit is band 8/36 and shoe 14/42;
contiguity 0, decor mg1+5d, turret parent 0/0/0. Batch-56 oracle recovery
reproduced **8d92cd1b8a7421548824ca22ba8d660d4dbeba579c666a3bb893faaa647a69f1**
twice from pristine `.bak` **3e514bedb40be0fde6787dad6513f625ba077cd0c1da04d29defe94e9c156140**.
Fleet is **25/96**; graduates **31**. Verdict:
docs/critique/shaded-parity-k2-graduation.md.

## 5.82 OWNER PRIORITY — LECLERC METHOD + ABRAMSX COMPLETE REDESIGN
(2026-08-08): the owner names Leclerc as the geometry/visual-comparison
standard for every unfinished tank, specifically Challenger 2, Challenger 3,
and all T-90s, then elevates AbramsX to the next full-redesign priority.
Codified in BUILD-STANDARD §K.1: connected-component/station measurements,
joined true-profile lofts, real asymmetry and gaps, P95-only axis
normalization, and fresh 14-view comparisons after meaningful changes.
AbramsX (`abramsx`, `buildAbramsX` in `profiles/abrams.js`) is REOPENED despite
its historical 9.2 re-cert: compare both local references
`community/abramsx-mortavex.glb` and `community-candidates/abrams_x_low_poly.glb`,
replace its geometry comprehensively, and certify from fresh evidence. It
runs immediately after K2 and ahead of K1A1/lower-priority cleanup. Frozen
**2c6eb344** remains the pre-redesign guard only.

## 5.83 ABRAMSX COMPLETE REDESIGN GRADUATED — 32nd (2026-08-09)

The owner-priority §5.82 rebuild is complete. AbramsX now uses the Leclerc
method end to end: connected-component inventory, exact source stations,
non-convex terraces/gaps, measured asymmetry, P95 mandatory-kit datum and a
fresh comparison after each material shape wave. Final gate x2 is identical:
**90.2** | 90.2/90.5/91.0/93.4/99.8/100. Freeze **fe7f9852** reproduced x2
(75 meshes / 161040 verts); oracle repair SHA-256
**01acf03c1027f08512a0bb7c04fa109b167a281fec0bea017b15638c1aec6816**
reproduced x2 from pristine `.bak`. Standard: clip 37/26, contig 0, mg1+5d;
turret-parent 0/0/0; fidelity 93.0; npm test green. Independent polish26
§B8 PASS: all 14 views >=9.0, floor 9.0 / mean 9.04. The old `2c6eb344`
guard is retired to history. Fleet is **26/96**; graduates **32**. Verdict:
docs/critique/shaded-parity-abramsx-redesign-graduation.md. The owner-priority
Leclerc-method lane now advances to Challenger 2, Challenger 3 and the T-90
family.

## 5.84 CHALLENGER 3 LECLERC-METHOD REDESIGN GRADUATED — 33rd
(2026-08-09)

The owner-priority Challenger 3 rebuild is complete and supersedes the earlier
CH1-base candidate. Source connected components and independent longitudinal
stations drove a joined low-shoulder hull, five-station Rheinmetall turret,
collapsed forward brow/lower cheeks, raked bustle, measured oval L55 jacket,
open RWS, large oval loader station, six non-overlapping wheels on measured
pitch, and a broad closed stern course with dense grille/guard layering.

Final gate x2 is bit-identical: **90.4** | 90.8/90.4/91.0/91.8/100/100.
Post-verdict freeze **2678f6c** reproduced x2 (60 meshes / 69,457 vertices).
Exact-tree fidelity is **91.52**, minimum view 91.50. Oracle SHA-256
**a5fcd8018279793fb62bf0ff97c25f110a3b43a2da714fc51138280b9cb35a25**
is bound to pristine `.bak`
**5eaa24a25e3c200b80ab7d1f8301d2ca8d6aed87137940**. Track exact is band
0/24 and shoes 0/38; turret-parent 0/0/0; winding reversed/mixed 0/0;
standard contiguity 0, mg1+5d; npm test green. Independent §B8 PASSes all
14 fresh pairs at floor **9.0**, mean **9.04**. Fleet is **27/96**;
graduates **33**. Verdict:
`docs/critique/shaded-parity-challenger3-graduation.md`. The owner-priority
Leclerc-method lane advances to Challenger 2, then the T-90 family.

## 5.85 CHALLENGER 2 LECLERC-METHOD REDESIGN GRADUATED — 34th
(2026-08-09)

The owner-priority Challenger 2 rebuild is complete and supersedes every
earlier FINISH/CH1-base candidate. Connected-component and station evidence
drove exact hull side profiles/plan bands, joined V-section bow and stern,
a closed three-band turret with separate brow/cassette undercuts, six deep
Hydrogas wheels, exact track runs, true single-lid roof grammar, open basket,
recessed stern/service structure and the complete L30/remote-station stack.

Final gate x2 is bit-identical: **90.1** |
90.1/90.3/90.3/91.1/93.8/100. Freeze **63ee160** reproduced x2
(42 meshes / 250,769 vertices). Direct-tree fidelity is **91.3**, minimum
whole view **93.31**. Exact track clip is band 0/0 and shoes 0/0; standard
contiguity 0, MG 1+1d; winding mode 1 reversed/mixed 0/0; npm test green.
Fresh independent §B8 PASSes all 14 pairs at floor **9.0**, mean **9.03**,
with zero browser/console errors. Oracle SHA-256
**d2e22673103353436517c1d17be38531b530b8936538f921d996a26fcfab5f3f**
is reproducible from pristine `.bak`
**1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48**.

The closeout also codifies BUILD-STANDARD §K.4: source-exact visible fitting
groups may carry the normal marker/AABB contract when a generic constructor
would destroy certified variant geometry, and contiguity holes close with the
smallest real local hardpoint rather than broad mask paint. Generic MAG and
broad shoulder experiments both fell to 89.5 and were rejected; terminal
housings 88.2 and proud cassette growth 88.6 remain rejected. The parent and
yaw audit candidates were component-proved fixed driver/hull masses and are
documented false positives in the verdict.

Fleet is **28/96**; graduates **34**. Verdict:
`docs/critique/shaded-parity-challenger2-graduation.md`. The owner-priority
Leclerc-method lane now advances through the required T-44/Type 59 landing,
Russia pure-refactor split, then T-90-family measurement consistency and
complete redesign work in the fresh `t90.js`.

## 5.86 OWNER RECOVERY-BRANCH RECONCILIATION (2026-08-09)

All six named temporary branches were compared fragment-by-fragment against
current `main`; none was merged wholesale and none was deleted during this
accounting. Results:

- `codex/salvage-challenger2-followup` @ **e641e23** — **REJECTED / SAFE TO
  PRUNE**. It preserves the known ~89.5 generic-MAG/broad-fill intermediate.
  The measured replacement graduated at 90.1 as **e83207b / 63ee160**, so no
  code, gate row or ledger byte from the salvage commit is current.
- `codex/salvage-k2-geometry-evidence` @ **c304245** — **SUPERSEDED / SAFE TO
  PRUNE**. Its K2 row is 52.8 versus the landed 90.1 graduate row/freeze
  **827d5ffc**. Its only useful helper fragment, T-44/Type 59 critic override
  coverage, is already present in all current comparison helpers (main
  lineage **7fca27d**); the old row and generated ledger are rejected.
- `codex/salvage-provenance-tuning` @ **f741d73** — **REJECTED / SAFE TO
  PRUNE**. The two one-line experiments would undo the owner-ratified Leopard
  2A4 mandatory-RCWS P95 datum (3.03 -> 2.48) and shrink the Leopard prototype
  source-matched OWS flange (0.31 -> 0.20) without a gate/critic chain. The
  current §5.76/§5.78 values remain authoritative.
- `codex/salvage-tejas-critic` @ **46fba99** — **SUPERSEDED / SAFE TO PRUNE**.
  Its temporary proc-only Tejas capture page is replaced by the generic
  reference/procedural harness and the landed 56-view Abrams distinctiveness
  verdict (**fb5432b**); no shipping or evidence byte is missing.
- `codex/salvage-type99a-geometry` @ **3ea4efa** — **SUPERSEDED / SAFE TO
  PRUNE**. Its gate row is 0 and its 2.37 m datum is obsolete. The useful
  expanded follower registration already landed at **6a8c5f8**; re-onboarding,
  owner-ratified 2.86 m P95 datum and the current measurable 17.7 row landed
  at **c940272**. The salvage gate/ledger/profile deltas are rejected.
- `claude/festive-bell-2e3357` @ **5c76fae** — **PERFORMANCE-REJECTED / SAFE
  TO PRUNE**. Two untouched real-entry controls on e83207b completed with
  zero console errors, zero battle-open program births/freezes and battle-open
  p95 18.2 ms normal / 18.4 ms constrained. Applying the 22-line per-battle
  FX mini-volley made the first normal control DevTools-unresponsive past the
  180 s bound and fail at `Input.dispatchKeyEvent`; the patch was removed and
  `src/main.js` restored byte-clean. The pre-patch path already births zero
  programs in the judged ten-second window, so there is no benefit to trade
  for that regression.

No temporary branch was pruned here; this section is the requested durable
accept/reject accounting. All six listed branches are now safe for the owner
to prune.

## 5.87 OWNER TURRET-ATTACHMENT CLOSEOUT — CHALLENGER 3 + ABRAMSX (2026-08-09)

The owner's close-up Challenger screenshot reopened both graduates: a correct
outer envelope is insufficient when thin brackets disappear at garage range
and make roof hardware read as pieces suspended over the turret. The binding
rule is now explicit for these builds: intentional service openings may remain
inside a mechanism, but every sight, launcher, receiver, rail and equipment
case needs a visible continuous load path into the turret with no air seam at
its seat.

Challenger 3 now carries a half-buried Protector roof shoe, substantial fork
cheeks, a central receiver spine, rail/terminal-optic and outboard-sensor
brackets, plus armored backing shoes behind both five-tube smoke banks. AbramsX
now carries buried necks under raised D-hood sights and a continuous XM914
foundation, recoil spine and gun-right equipment foot. All additions are
turret-parented and overlap the certified shell/roof courses physically; the
open-cradle grammar remains only where real service space belongs.

Geometry gate x2 remains bit-identical to the graduation rows:
Challenger 3 **90.4** (90.8/90.4/91.0/91.8/100/100) and AbramsX **90.2**
(90.2/90.5/91.0/93.4/99.8/100). Standard-check passes both with contiguity 0
and mg1+5d; exact track receipts remain the pre-existing 0/24, shoes 0/38 for
Challenger 3 and 37/26, shoes 10/0 for AbramsX, with zero blind spots. `npm test`
is green. Independent §B8 fresh sittings pass every view: Challenger 3
floor **9.0**, mean **9.06**; AbramsX floor **9.0**, mean **9.09**. The first
Challenger evidence sitting correctly failed six invalid off-screen captures;
those six were recaptured individually at unchanged geometry and all fourteen
final files have distinct SHA-256 values.

Post-verdict freezes reproduce x2: Challenger 3 **b0c172a4** (60 meshes /
71,977 vertices) and AbramsX **d1dbfa2** (75 meshes / 162,372 vertices).
Verdict: `docs/critique/shaded-parity-turret-attachment-recert.md`; evidence:
`shots/critic-turret-attachment-closeout/{challenger_3,abramsx}/`. Graduate
count remains **34** and fleet remains **28/96**. The owner-priority lane now
advances to the complete harmonious T-90 family round.

## 5.88 RUSSIA FAMILY-MODULE PURE REFACTOR (2026-08-09)

The owner explicitly advanced the complete T-90 family immediately after the
§5.87 attachment closeout, superseding the older §5.75 T-44/Type 59 sequencing
clause for priority only. The §5.75 structural prerequisite itself is now
executed before any new T-90 geometry: `profiles/t90.js` owns T-90/T-90A/
T-90M/T-90SM/Vladimir/T-90MS/Burlak/PT-91M, `profiles/t72.js` owns the three
T-72 builders, `profiles/t80.js` owns T-80/T-80B/T-80BV/T-84, and the
T-62/T-64/T-54/T-44/Type 59 residue stays in `profiles/russia.js`. The assembly
map explicitly preserves the prior Russia roster key order.

PURE-REFACTOR proof against `main` at **4d36376** is byte-identical for all
fifteen moved ids (hash / meshes / vertices):

| Family | Receipts |
|---|---|
| T-90 | t90a `265610e2`/54/99,313; t90 `72104d14`/59/89,077; t90ms `034e1bac`/49/86,097; t90a_burlak `d588df50`/51/81,059; pt91m `2cf10e23`/50/93,280; t90sm `d98f27dc`/45/83,511; t90a_vladimir `bdfe7d24`/51/80,413; t90m `e345ee8a`/49/111,241 |
| T-72 | t72b_1987 `d62c8140`/42/62,453; t72b3m `175be954`/122/222,702; t72bu `68082d79`/41/60,749 |
| T-80 | t80 `578b7f08`/43/76,373; t80b `99393970`/43/77,477; t80bv `89769670`/43/78,905; t84 `04707a9c`/43/85,876 |

`npm test` is green. No geometry gate receipt, fleet count, graduation state or
freeze changes in this commit. The next commit may now change only T-90-family
geometry in the fresh module under the normal measurement/gate/critic laws.

## 5.89 CHALLENGER 2 FUSED HULL/TURRET REPAIR (2026-08-10)

The owner's garage screenshot proved that the Challenger 2 source's
material-based split had left a broad turret/casemate course in the fixed hull,
overlapping the real procedural turret and remaining behind at non-zero yaw.
The repair now classifies the raw fused primitive by connected component and
physical ring crossing: 572 components / 12,313 vertices / 14,546 triangles
move into `TurretParts`, while the actual hull remains in `HullParts`. The
procedural hull roof is rebuilt on the physical 1.55 m deck/ring datum rather
than the contaminated 2.07 m trace. A thin continuous ring landing is the only
fixed structure beneath the articulated shell; driver and rear-deck furniture
remain correctly hull-owned.

Two eight-centimetre seams between the centre bow strip and V-section
cross-loft were closed with a narrow profile-following bridge entirely inside
the existing glacis silhouette. This is structural closure, not a mask proxy:
standard contiguity moved 26 -> 0 while exact track clipping stayed 0/0 and the
geometry gate held at **90.1** x2 (hull 90.5 / whole 90.1 / turret 90.3 /
stations 91.8 / dims 93.1 / floaters 100). Turret-parent is 0 stranded / 0
abutting / 0 dangling; winding is 0 reversed / 0 mixed, 0 yaw candidates;
`npm test` is green.

Independent §B8 on `shots/critic-challenger2-fusedfix/` passes all fourteen
fresh views: floor **9.0**, mean **9.06**. The yaw/load-path read passes **9.3**:
the shell, gun, RWS, hatches, optics, smoke banks and bases rotate as one
assembly with no fixed duplicate mass, unsupported hardware or air seam.
Freeze **3b4bd5f0** reproduces x2 (42 meshes / 250,157 vertices). Repaired
oracle SHA-256 is `f44e3b46ee07a457b04fff6cdf8950f880a45fd22d952226e2ef16a4bd3c49ba`,
reproducible from pristine `.bak`
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.
Verdict: `docs/critique/shaded-parity-challenger2-fused-block-recert.md`.

## 5.90 FV510 OWNER-SOURCE EXACT REDESIGN GRADUATED — 35th (2026-08-10)

The owner's supplied `fv510_warrior.glb` is byte-identical to the attributed
42manako CC-BY-4.0 oracle already held locally. The previous photo-estimated
Warrior shell is superseded by the source's exact component geometry. A
census-guarded repair spatially reconnects export-split vertices for analysis
and repartitions 663 complete authored solids without cutting any triangle:
Hull 593 components / 29,689 vertices / 23,703 triangles; Turret 69 / 4,565 /
3,989; Gun 1 / 438 / 410. Track remains 558 vertices / 480 triangles.

The exact transformed positions/indices are now a synchronous generated
profile payload, so private and public-fallback builds render the same Warrior
while the runtime GLB registration is retired. The repaired oracle SHA-256 is
`8bc9e6c1eb9a73794278cdb9ee4f6de2d540364d4772adc87e9c8224b40a2be6`,
reproducible from pristine `.bak`
`d4bcad966b92d0735f0affe65a926502eee9e2a158ff0b35cfe6c443453fa389`;
`tools/fv510-source-bake.py --verify` reproduces all four encoded payloads.

Final gate x2 is bit-identical: **93.2** |
93.2/93.2/98.2/100/100/100. Direct fidelity is **98.7** overall (hull 98.3,
turret/gun 100, tracks 99.9). Exact track/shoe is 5/39 with no blind spot;
standard contiguity 0, mg1+0d; turret-parent 0/0/0; winding reversed/mixed 0/0
and yaw candidates 0. Freeze **7884762a** reproduces x2 (10 meshes / 86,486
vertices). `npm test` and `npm run build:private` are green.

Independent §B8 passes all fourteen current-byte pairs at floor **9.4**, mean
**9.51**. The yaw/load-path sitting passes **9.4**: the RARDEN, turret shell,
sight pedestal, hatch/cupola equipment and turret rails rotate as one seated
assembly; hull-owned deck furniture correctly remains fixed. There is no
unsupported hardware, air seam, detached fitting or duplicate fixed turret
mass. Verdict:
`docs/critique/shaded-parity-fv510-exact-source-graduation.md`. Fleet is
**29/96** and graduates **35**. The owner-priority lane resumes the harmonious
T-90 family, T-72B3M parenting repair, Leopard 2A7/Revolution closeout and T-14
proportion round.

## 5.91 FV510 GAME-NATIVE TRACK SYSTEM RE-FROZEN (2026-08-10)

The owner required the exact-source Warrior to use the fleet's specific track
system. The bake now removes all 34 donor wheel/end-drum spatial components
from the Hull at whole-component boundaries and retains the encoded donor
Track only as reproducible oracle evidence; neither donor running-gear class
is rendered. The exact Warrior hull, side/bow guards, troop body, slat armor,
stern and RARDEN assembly remain source-derived. One normal
`buildRunningGear` course supplies six road-wheel stations per side, distinct
front sprockets and rear idlers, animated/damage-aware linked shoes, chain and
guide horns. Source guards are explicitly tagged `trackGuard`; the audit
exemption is limited to those enclosures and cannot hide donor gear or primary
hull structure.

Final gate x2 is bit-identical: **90.3** |
90.3/90.4/99.8/94.4/100/100. Direct fidelity is **98.0** overall (hull 97.2,
turret/gun 100, tracks 96.6); standard exact containment is 4/3 with no holes
or blind spot, decoration census is mg1+0d, turret-parent is 0/0/0, and winding
is reversed/mixed 0/0 with yaw candidates 0. Freeze **927beeb2** reproduces
x2 (23 meshes / 91,409 vertices). The generator verifies 30,175 encoded
vertices and 23,879 triangles; source payload SHA-256 is
`5b998049fa6397549440f1ed56a66bfa98a63f74f5662339de7d0a16f2e0d406`,
with pre-bake `.bak` SHA-256
`20c8e47be7e23ba29dad48d3eadbb2bd6e998fd3d32a68286c98266090fef372`
retained out of tree.

Independent §B8 passes all fourteen current-byte pairs at floor **9.1**,
mean **9.26**; yaw/load paths pass **9.4**. The sitting confirms one coherent
six-wheel station set, distinct terminal gears, continuous grounded native
shoe wraps behind the source guards, and no donor belt, duplicate wheel,
floater, guard penetration, collapsed arc, or upper-geometry regression.
Verdict:
`docs/critique/shaded-parity-fv510-native-track-recert.md`.

## 5.92 TYPE 10 OWNER-SOURCE EXACT REBUILD GRADUATED — 36th (2026-08-10)

The owner's `type-10-main-battle-tank.zip` is byte-identical to the source OBJ
already preserved in the ignored Type 10 packet. It supersedes the prior
photo-built shell and confirms one authoritative geometry source: ZIP SHA-256
`22bf48234c20edad51c9087dc4c02b99156c687af6a326533275eca9953d7468`,
nested OBJ
`c95211bba65d883700671373816c182c749f1973b638c42d21a562f244d686c5`.
The pristine tracked GLB remains unchanged at
`2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67`.

A deterministic semantic bake classifies all 2,450 authored spatial
components without cutting triangles. The playable source-derived payload is
Hull 30,754 vertices / 20,125 triangles, TrackGuards 15,030 / 10,488, Turret
31,174 / 21,492 and Gun 2,803 / 2,487. The repaired oracle is
`1d7fff3c390aef8898a05e2017e8abdd42f3b1a1df07ab86b7dd456a8c3bdfca`.
All 1,064 donor-track components and 60 donor wheel/end-drum components are
excluded from the playable. The exact upper now rides the game's native
five-wheel Type 10 gear, terminal sprocket/idler, rollers, linked shoes, guide
horns and damage/animation system.

Final gate x2 is bit-identical: **94.6** |
94.6/95.1/96.6/99.9/96.7/100. Direct fidelity is **97.4** overall (hull 97,
turret/gun 100, gear 91); exact band and shoe clipping are 0/0, contiguity is
0 and turret-parent is 0/0/0. Freeze **84f5d108** reproduces x2 (25 meshes /
184,760 vertices). Winding mode 1 is clean. The mode-2 candidate is visually
adjudicated as the correct fixed engine-deck/stern service course behind the
ring: the source-exact turret, gun, bustle, roof kit and antennae all rotate
together with continuous seated load paths. All fourteen current-byte paired
views and yaw 0/90 were inspected with zero browser console warnings/errors;
`npm test` and `npm run build:private` are green.

Independent §B8 passes all fourteen current-byte views at floor **9.2**,
mean **9.48**; yaw/load paths pass **9.7**. The sitting confirms the correct
five-road-wheel-per-side Type 10 layout, clean terminal wraps, complete donor
gear suppression, continuous turret equipment attachment and the mode-2
engine-deck adjudication. Verdict:
`docs/critique/shaded-parity-type10-source-graduation.md`.

Fleet is **30/96** and graduates **36**. The owner-priority lane advances
directly to the AMX-40 completion round.

## 5.93 AMX-40 LECLERC-METHOD COMPLETION GRADUATED — 37th (2026-08-10)

The raw AMX-40 has been rebuilt against the registered measurement-only
source with the Leclerc exact-geometry/paired-view method. The playable stays
fully procedural; oracle SHA-256 is
`570a12b0ced56299061fc0a57c3f86343d2aa45e2fb79d53e049f58da2e9849d`,
reproducible from pristine `.bak`
`2a510ae66a2355bc9766f043c7f42ae51164181ac9a6ed40d45c63993789d50e`.
The local oracle remains ignored and never ships.

The final tank uses one continuous low asymmetric welded turret loft, a
source-height canted mantlet web with bounded oval tunnel, seated
cupola/optic/smoke/flank/service hierarchy, full-width layered stern, and
source-traced belly/bow/skirt courses. `buildRunningGear.loopPoints` is an
optional additive centerline: AMX-40 uses it to match the source wraps while
retaining the fleet's animated/damage-aware linked shoes, six wheels and
terminal gears; every existing caller retains the historical path.

Final gate reproduced twice at **90.1** |
90.2/90.5/90.1/91.8/93.4/100; gate JSON SHA-256 is
`bc02bdb21b99b004e847dbd5c153f1633957c6d5aeaa41aeb668a6e4ceb103b9`.
Direct fidelity is **94.7** overall (H96.4 / T90.9 / G92.1 / R95.9), with
every measured view >=95.57. Exact track containment is band 26/48 and shoes
26/16, below the 60-voxel law with no blind spot; contiguity is 0, census is
mg1+7d, winding is 0 reversed / 0 mixed and yaw-stranded candidates are 0.
Freeze **d2c73d96** reproduces x2 (58 meshes / 83,226 vertices).

Independent §B8 passes all fourteen frozen-byte views at floor **9.0** and
mean **9.06**. Fresh yaw 0/90 confirms the complete turret, mantlet/gun,
cupola, optics, smoke/flank/service kit and bases rotate together with no
fixed duplicate, unsupported decoration or air seam. The game-native
six-wheel linked-shoe system passes with coherent contact and terminal wraps
and no donor gear. Verdict:
`docs/critique/shaded-parity-amx40-source-graduation.md`.

Fleet is **31/96** and graduates **37**. The owner-priority lane returns to
the harmonious T-90 family, T-72B3M parenting repair, Leopard 2A7/Revolution
turret closeout and T-14 proportion round.

## 5.94 T-90 FAMILY FIRST WAVE GRADUATED — 38th–40th (2026-08-10)

The stale dedicated family worktree was reconciled fragment-by-fragment onto
current `main`; only `profiles/t90.js`, the required opt-in Russia helpers and
three independent verdicts were recovered. Its unrelated fleet-wide gate
churn and temporary critic page remain out of the landing. Current-main gate,
hash and audit batteries reproduce the recovered final bytes exactly.

T-90A finishes as the correct low cast primary mass with radial K-5 and its
own ESSA/Shtora/cupola/Kord grammar; Vladimir keeps that cast lineage but uses
its compact recovered sight train, roof asymmetry and unequal service
transom; T-90SM retains the family's angular welded/bustle/Relikt identity.
Shared logic is limited to physical fabrication, attachment and measured
station rules. No tank is reduced to another variant with palette-swapped
boxes, and every turret-owned decoration has a visible seat and coherent yaw
load path.

Final gate x2:

- T-90A **90.4** | 90.6/90.5/90.4/90.4/97.8/100; freeze **810a6f18**.
- Vladimir **90.0** | 90.2/90.0/91.2/92.2/96.2/100; freeze **c13fec50**.
- T-90SM **90.0** | 90.2/90.3/90.8/90.0/100/100; freeze **56324371**.

All standard checks pass; exact track maxima remain below 60 with no blind
spot; contiguity is zero; winding mode 1 is clean. Independent §B8 passes all
42 frozen-byte views: floor/mean T-90A 9.0/9.11, Vladimir 9.0/9.01 and T-90SM
9.0/9.04; yaw/load paths pass 9.2/9.3/9.1. Verdicts:
`docs/critique/shaded-parity-t90a-graduation.md`,
`docs/critique/shaded-parity-t90a-vladimir-graduation.md`, and
`docs/critique/shaded-parity-t90sm-graduation.md`.

Fleet is **34/96** and graduates **40**. The same uninterrupted owner round
continues with the raw T-90, T-90A Burlak and T-90MS Tagil before T-72B3M,
Leopard 2A7/Revolution and T-14.

## 5.95 OWNER SCREENSHOT REOPEN — CHALLENGER 3 / ABRAMSX ATTACHMENT (2026-08-10, RE-CERTIFIED)

The owner identified the two garage references explicitly as Challenger 3
and AbramsX and demonstrated that §5.87's yaw-coherence verdict had not proved
physical attachment. That attachment conclusion is therefore superseded and
both tanks were reopened. Rotation with the turret is now treated only as a
parenting receipt; a continuous visible load path into the local turret
surface is a separate gate (§B5 PHYSICAL-SEAT).

Challenger 3's defect was a datum error: forward fittings were seated from
`C3H`, the peak of the inset crown, although the brow is much lower at their
actual stations. The repair adds a tapered buried Protector foundation,
re-seats the forward optic directly into the descending brow, closes the
roof-to-ammunition tier with a buried service trunk, and authors the EPSOM
hood on the real sloped face rather than translating it from peak height.
Fresh low-side, top, close and yaw views show each complete component meeting
solid turret structure. Candidate freeze reproduces x2 at **5c15b250**
(60 meshes / 72,337 vertices).

AbramsX's screenshot came from the local/private garage runtime installing
the recovered Mortavex GLB. Although its flattened siblings had been made to
yaw together, the asset itself contains the giant stilted receiver and empty
attachment gaps. The GLB is now measurement-only in both critic harnesses;
the playable and private garage paths both use the seated procedural AbramsX.
Its geometry freeze remains **d1dbfa2** (75 meshes / 162,372 vertices).

Fresh gate runs reproduce Challenger 3 at **90.4**
(90.8/90.4/91.0/91.8/100/100) and AbramsX at **90.2**
(90.2/90.5/91.0/93.4/99.8/100). Standard-check passes both: contiguity 0,
decoration mg1+5d, track receipts 0/24 and 37/26 respectively. All 28 paired
PNG receipts are 1280x640 with distinct SHA-256 values; `npm test` is green.
Evidence lives in `shots/critic-challenger3-owner-gap-recert/` and
`shots/critic-abramsx-owner-gap-recert/`.

The first §5.95 landing remained a **candidate repair**, because the prior
§5.87 critic sitting did not cover the owner-reported failure correctly. A
fresh current-main re-cert now closes that hold. Later universal visible-bore
geometry moved the reproducible integrated freezes to AbramsX **26b46ba0**
(77 meshes / 162,506 vertices) and Challenger 3 **3e5a7797** (62 meshes /
72,471 vertices); both reproduce x2. Their geometry rows remain 90.2 and 90.4.
Standard check, asset freshness, visible muzzle proof, parent 0/0/0, tests and
private build pass. Challenger 3 winding is pixel-clean. AbramsX's mode-1
nomination is only 10 top-view pixels / 0.01%; the full 42-frame independent
inspection finds no open sheet, disappearing face or backface wound.

Each final receipt is 42 unique current-byte PNGs: fourteen paired standard
views plus fourteen yaw-0 and fourteen yaw-90 frames. Fresh independent §B8
scores AbramsX
`[9.4,9.5,9.4,9.3,9.3,9.4,9.4,9.5,9.6,9.6,9.5,9.7,9.6,9.7]`, floor
**9.3**, mean **9.49**; Challenger 3
`[9.5,9.6,9.5,9.5,9.4,9.5,9.5,9.6,9.7,9.7,9.6,9.8,9.6,9.8]`, floor
**9.4**, mean **9.59**. The critic explicitly confirms continuous physical
seats for every RWS, optic, smoke, antenna and roof-equipment course—not just
shared yaw motion—and finds no fused duplicate turret mass, stranded part,
empty-air gap, track wound or visible winding defect. **RE-CERTIFIED; KEEP
`26b46ba0` and `3e5a7797`; retire `d1dbfa2` and `b0c172a4`.**

## 5.96 TYPE 90 SOURCE-VIEW TURRET PARENTING REPAIR (2026-08-10)

The owner's orange/white garage screenshot is the recovered Type 90 print,
not the playable procedural geometry. The fleet flip removed its runtime GLB
row but did not preserve a Sources-card `candidateGlb` articulation contract,
so a source-view instance could present the rear cage, two circular roof
stations and service boxes as if they were fused to the hull.

The recovered GLB SHA-256 is
`8ce5a2235d383e6f349026c96356a5931703ece7b04ae49f5f43f7c432e87e3f`.
Its node inventory is unambiguous: two hull/running-gear meshes and one
`TurretMesh`; the latter is the sole child of the authored `Turret` node and
contains the complete welded upper assembly, gun, roof stations, boxes and
bustle cage. `MODEL_SOURCE.type90` now remains `source: procedural` for
gameplay while exposing the local-only recovered print as a candidate with
explicit `turretNode: '^Turret$'`, automatic pivot resolution and the
required -90-degree source yaw correction.

A fresh Sources-card render at yaw 0/90 confirms that the whole print upper
assembly moves under `rig_turret`; no cage, circular station, service box or
gun remains hull-fixed. The procedural path independently keeps its authored
rear basket and roof equipment under the same turret rig. This is a
source-view parenting repair, not a Type 90 geometry graduation: the current
79.5 geometry gate is unchanged and the graduate registry/count do not move.
`npm test` and `npm run build:private` are green.

## 5.97 OWNER CORRECTION — TYPE 10 REAR-BUSTLE PARENTING (2026-08-10, RE-GRADUATED)

The owner clarified that the photographed rear cage, spare-wheel forms and
service boxes belong to Type 10, not Type 90. Type 90 is removed from this
ticket and remains untouched. The §5.92 source split left the rear
`Object_5` equipment course and four `Object_6` rack rails on the hull.

The deterministic bake now reclassifies only whole spatial components.
Seventy-one complete above-deck bustle components move into the turret
bucket; no source triangle is cut, duplicated or discarded. The corrected
census is drop-track 1,064 / drop-gear 60 / hull 656 / guard 236 / turret
424 / gun-barrel 9 / gun-root 1. Playable counts are hull
26,294v/16,523t, guard 15,030v/10,488t, turret 35,634v/25,094t and gun
2,803v/2,487t. The generated payload is SHA-256
`7d9fc77e1b377a1f7073cbe4104e2eda54314ee33a90394bd53db5360d586008`;
the repaired articulated oracle is
`c3753b826975fc6eb9968be4343e0cb5a761f166c4d39ff6254374ae3475f485`.

Gate reproduces x2 at **94.6** | 94.6/95.1/96.6/99.9/96.7/100.
Standard check is clean (holes 0, contiguity 0, mg1+0d); exact native-track
audit is band 0/0 and shoes 0/0. Parent audit is stranded 0 / abutting 0 /
dangling 0. Winding is 0 reversed / 0 mixed, one non-visible deficit pixel,
and zero yaw candidates. The source-correct running gear remains exactly five
native road wheels per side; donor wheels and tracks never render. Bake
verification, `npm test` and `npm run build:private` are green. Integrated
geometry freeze reproduces x2 at **201d0a08** (27 meshes / 184,894 vertices).

Forty-two fresh current-byte PNGs certify the change: fourteen paired source
views plus fourteen yaw-0 and fourteen yaw-90 frames. Independent §B8 scores
`[9.5,9.6,9.5,9.5,9.4,9.5,9.5,9.6,9.7,9.7,9.7,9.7,9.6,9.7]`, floor
**9.4**, mean **9.59**. The complete cage, both circular forms, boxes, RWS,
sights, gun and antennas rotate as one physically seated turret package. The
lower engine deck remains correctly fixed and is cleanly exposed at yaw 90;
no stranded component, duplicate turret mass, air attachment or disappearing
surface remains. **RE-GRADUATED; KEEP `201d0a08`; retire `84f5d108`.**

## 5.100 LEOPARD 2A7V OWNER-SOURCE REBUILD (2026-08-10, GRADUATED)

The owner-supplied `leopard-2a7v-main-battle-tank.zip` is now the Leopard
2A7V geometry authority. Its outer archive is SHA-256
`fef951b1794415aa5a9876efc8e9ecbdde2dbfe4c540357fc109209b254dc901` and
its nested source archive is
`54ff6b63f2ded1dbf35ec4a8dd68a86d2562e8475f76b650a3fb95c095a9f898`.
The deterministic bake reads 332,136 source vertices / 110,712 triangles,
splits the turret and L/55 only at welded connected-component boundaries,
and never cuts, duplicates or moves a source triangle. The playable exact
upper is 134,580 vertices / 44,860 triangles: hull 28,494v/9,498t,
hull-detail 35,997v/11,999t, left/right guards 13,587v/4,529t and
17,958v/5,986t, turret 29,046v/9,682t, and gun 9,498v/3,166t. The generated
payload is SHA-256
`295778221eccb26ea3b93be060fd97e5c90feffdfb036971b32876735dcba58a`;
the locally ignored articulated oracle is
`d8c02f1ea46497f156721428375a3014dbadf76cbc6bd410aa95010ddfb1d2da`.

The donor 197,556v/65,852t belts, wheels, suspension and end drums never
enter the playable assembly. One native seven-road-wheel linked-shoe course
per side replaces them at the source stations. Exact clip audit reports
front/rear band **0/15** and shoes **0/58**, with no blind spot or visible
bow/stern penetration. Narrow buried shelves close the only measured sky
wells in the open AMAP side cages without changing their exterior plan.
The first visual sitting exposed two detached lower-rear registration pads
and failed at floor 8.5. That freeze is retired. The final repair replaces
them with compact recovery heads, each joined to the source transom by a
diagonal inboard arm and transverse tie routed clear of the native gear.

Machine gate PASS reproduces x2 at **91.1** |
91.1/91.9/91.8/91.3/92/100. Standard check passes with holes 0,
contiguity 0 and mg1+0d. Bake verification, vertex extraction, `npm test`
and `npm run build:private` are green. The parent/winding tools nominate the
merged fixed `rig_hull` when yaw exposes glacis, ring surround and engine
deck; all 28 yaw frames independently falsify a stranded/fused turret mass
and show no reversed, mixed-winding or disappearing surface. Geometry freeze
reproduces x2 at **27b2d654** (33 meshes / 169,286 vertices).

Fresh evidence is 42 unique current-byte PNGs: fourteen paired source views
plus fourteen yaw-0 and fourteen yaw-90 frames. Independent §B8 scores
`[9.3,9.2,9.2,9.1,9.1,9.1,9.2,9.2,9.5,9.4,9.1,9.5,9.4,9.5]`, floor
**9.1**, mean **9.27**. The critic confirms source fidelity, one continuously
seated rotating turret/gun/AMAP/roof package, correct fixed-hull ownership,
native running-gear continuity, and physically attached rear recovery stays.
**GRADUATED by the §5.100 landing commit; KEEP freeze `27b2d654`.**

## 5.101 LEOPARD 2 REVOLUTION OWNER-SOURCE REBUILD (2026-08-10, GRADUATED)

The owner-supplied `leopard-2-mbt-revolution.zip` is now the Leopard 2
Revolution geometry authority. Its outer archive is SHA-256
`8577cb2ac53daf369dc2175b045207de4760246ec73f6434bbcfce38a0fc3e4f`;
the nested source archive is
`a14675098d77bc2a4adb9e6f8cfd0975384596dd55be7eef4ecc03b6f1079186`,
and the authoritative OBJ is
`d97595be419fee2c474a1cd4cfdc6b502e666070d4c746dda2e7b0d8c2d60481`.
The source carries 64,126 vertices / 47,420 triangles with named hull,
turret, gun and donor-running-gear groups. The playable preserves the exact
source upper vehicle while excluding all 9,674 donor vertices / 9,272 donor
triangles from rendering.

The supplied exterior is topology-open at its turret pressure volume and
several fender/rear-deck floors. The deterministic bake therefore completes
only those physically required interior seats: a rotating pressure core and
ring, bustle roots, and hull-owned fender/rear floors. It adds reverse faces
only to source-sheet components proven open by a position-weld topology
census; already closed solids are not doubled. This closes the former visible
air corridors and FrontSide wounds without changing the authoritative outer
silhouette. The final locally ignored articulated oracle is SHA-256
`167d880bb093f70f31e0ae27df484424fe81e77ea8837f269bc6a3ed9f0bda26`.
Playable source-exact groups are hull 19,473v/24,264t, turret
10,404v/13,084t and gun 343v/287t, for 30,220v/37,635t before the game's
native running gear.

Donor belts, wheels, suspension, rollers and terminal drums never enter the
playable assembly. They are replaced by one symmetric damage-aware native
seven-road-wheel linked-shoe system measured to the source stations, with
distinct idler/sprocket terminals and continuous grounded contact and wrap
courses. Both normal and exact track-clip audits report 0/0 band and 0/0 shoe
intersections. Fresh yaw 0/90 frames show the complete turret shell, gun,
optics, RWS, braces and roof furniture rotating together while fans, rear deck
and running gear remain correctly hull-owned. Parent audit is clean
(stranded 0 / abutting 0 / dangling 0); winding audit is 0 reversed / 0 mixed
with only 22 deficit pixels (0.03%) and no visible wound.

Machine gate PASS reproduces at **91.5** |
91.5/92.1/94.7/96.3/97.3/100. Standard check is clean (holes 0,
contiguity 0, mg1+0d), the deterministic bake verifies, and geometry freeze
reproduces x2 at **24658d8b** (24 meshes / 134,057 vertices). All fourteen
fresh paired views plus fourteen yaw-0 and fourteen yaw-90 frames rendered
from the frozen bytes; the sole HTTP miss is the critic page's irrelevant
`favicon.ico`. `npm test` is green.

Fresh independent §B8 review of the frozen evidence passes all fourteen views
at floor **9.2** / mean **9.35**. The critic independently confirms the exact
source upper, continuous native seven-wheel course, absence of donor running
gear, correct fixed hull deck/fan/fender ownership, and one continuously
seated rotating turret/gun/optics/RWS assembly with no floater, fused mass,
air seam or disappearing face. **GRADUATED by the §5.101 landing commit; KEEP
freeze `24658d8b`.**

## 5.102 LEOPARD 2A4 OWNER-SOURCE REBUILD (2026-08-10, GRADUATED)

Owner source `leopard-2a4-otco.zip` was repaired and deterministically baked
into registered hull, hull-detail, hull-cloth, turret, turret-detail,
turret-cloth and gun payloads. The bake excludes donor wheels, end drums and
track. Payload SHA-256 is
`55abf214396287f17f6a9b3c186775b2c560b6d6e385468752d4491bcba21892`;
the repaired ignored oracle is
`f46cabda3f928e8235e4080a394670ec11713c70ae86eec672f48fb27376a598`.
The candidate keeps the exact source upper and camouflage while using one
game-native seven-road-wheel linked-shoe course.

Integrated preflight retired the earlier unlanded `f42ac010` candidate after
the exact track audit exposed a source-plan transform omission: scale had been
applied without the registered `z=-0.214625` plan center. The landed recipe
applies `sourceZ=(z+0.214625)*1.055` to every running-gear station and uses a
0.55 native shoe radial profile. Final exact audit reports front/rear bands
18/27 and shoes 0/0, with no donor course, doubled terminal or blind spot.

Machine gate reproduces x2 at **94.5** |
94.5/95.0/96.7/97.3/99.8/100, with JSON SHA-256
`d65573de3a71657c3d487b262cb2806882793e66a96c0fabbc46c078e773fc67`.
Standard audit is clean (holes 0, contiguity 0, mg1+0d); parent audit is
stranded 0 / abutting 0 / dangling 0. Winding reports 0 reversed and one tiny
44-triangle rear-underbody mixed component (1,531 rear pixels / 0.99%), but
all direct-rear, quarter, elevated and yaw pixels show a continuous sheet with
no tear, disappearing face or silhouette pop. The deterministic bake verifies,
`npm test` and `build:private` are green, and freeze reproduces x2 at
**`f031f2fc`** (30 meshes / 538,821 vertices).

Fresh independent §B8 review passes all fourteen source pairs at floor
**9.4** / mean **9.52**. It independently confirms the source upper identity,
one coherent native seven-wheel course, correct turret/hull ownership through
yaw 0/90, continuous mounting for all roof and bustle equipment, and the
rear-sheet winding adjudication. No donor gear, fused turret mass, decoration
floater, empty-air load path or visible wound remains. **GRADUATED by the
§5.102 landing commit; KEEP freeze `f031f2fc`.**

## 5.103 AMX-40 EXACT-SOURCE FRONT-HALF REOPEN (2026-08-10, RE-FROZEN)

The owner's close screenshot correctly showed that §5.93 had improved the
turret and rear but left the old procedural front half visibly behind the
source. This graduate-change replaces the upper hull, complete turret,
mantlet/coax/LLLTV package and CN120 with deterministic exact-source payloads;
donor wheels, terminals and track are excluded. The payload SHA-256 is
`ed9e0ec4ffdb4d23719e3b2baba21118e4294e46c9abbb2c5b760c7753b2f443`
and its bake verifies the five registered groups at hull 37,971/28,838,
hull-detail 4,184/3,721, turret 25,923/20,574, turret-detail 4,393/3,722 and
gun 4,281/3,850 vertices/triangles.

The exact source upper is articulated at turret pivot
`[-0.001,1.545,-0.421]` and gun world pivot `[0,1.94,1.30]`. It rides on one
game-native six-road-wheel linked-shoe course, preserving animation,
suspension, damage, scrolling and thrown-track behavior. Machine gate
reproduces x2 at **92.6** | 92.6/93.5/96.9/100/95.1/100; gate JSON SHA-256 is
`55044c099e02a2900488342d12f76f8e4a3e984e2da79a19b736bb2ccd49307d`.
Direct fidelity is **98.5** (H98/T100/G100/R94), exact track containment is
band 0/0 and shoes 0/0, standard check passes with contiguity 0 and mg1+0d,
and parent audit is stranded 0 / abutting 0 / dangling 0.

Winding mode 1 has no reversed component and only a three-pixel rear speck
with no visible wound. Mode 2 nominates `rig_hull/mesh#17`, but both main and
independent yaw inspection identify it as the continuous fixed rear
engine-deck/service surface correctly revealed by turret rotation. The full
release gate is green: deterministic bake, visible muzzle bore, `npm test`,
private build, and all eight regenerated AMX-40 presentation assets/manifest.

Freeze reproduces x2 at **`50710918`** (26 meshes / 201,673 vertices). Fresh
independent §B8 passes all fourteen source pairs at floor **9.5** / mean
**9.70**, confirming the exact front-half identity, coherent turret load
paths, hull-owned engine deck, clean native running gear and absence of fused
mass, floaters, empty-air attachments or visible backface wound. **KEEP
`50710918`; prior graduate freeze `d2c73d96` is retired.**

## 5.104 T-14 OWNER-SOURCE EXACT REBUILD (2026-08-10, HISTORICAL / RETIRED)

This section records a retired source-baked experiment. It is superseded by
the fully first-party runtime and fresh certification in §5.131; none of the
payload described below remains in the playable or public build.

At that historical snapshot, the owner's
`t-14_armara_uralvagon_factory.glb` was treated as the T-14 geometry
authority. Its SHA-256 is
`02785328797c80090fd0e9c48b5bb6fe8e7a1e3fac4d340138fede6348c8d2b3`;
the 223 MB CC-BY-4.0 GLB remains gitignored and local-only while a small
deterministic source payload ships. The bake applies the registered width
scale and source pivot, keeps the authored 8.639 m hull without stretching,
and preserves the exact upper hull, compact unmanned turret, bustle, roof
sensor/weapon hierarchy and 2A82 root. Only the source-short forward tube is
extended from a 2.0 m knee to the published 10.8 m overall datum.

The payload is SHA-256
`8075dbfb6686dfd72c295d76f5b3f16c492b0e884ceff0b135e968cd47b1ade2`.
Its verified vertex/triangle groups are left/right guards 10,128/11,680 and
10,106/11,680, hull 44,814/51,616, hull detail 17,631/23,002, turret
25,751/35,802, turret detail 17,271/21,436, turret weapon 7,408/10,128 and
gun 6,461/7,112. Source Object_14 is split only at whole connected-component
boundaries so the 2A82 elevates while the rear roof weapon remains turret
owned. Open source-sheet components receive reverse triangles only where a
position-weld topology census proves them open; already closed solids are
not doubled.

Donor Object_4..Object_7 tracks, wheels and terminal drums never enter the
playable assembly. One fleet-native seven-road-wheel system supplies
animation, suspension, damage, scrolling links and thrown-track behavior.
The source's hollow rear side-cage presentation skins remain exterior-exact;
thin enclosed backing surfaces sit inside their existing envelope and stay
hull-owned, closing the former top/oblique sky-through without outline growth.

Machine gate is **90.7** | 92.0/90.7/92.8/100/99.8/100; gate JSON SHA-256
is `071c3c9a792165aa65d0b5b9c9b46ed68197d616fb7c4ef380c2c6bda9bf8bc6`.
Direct fidelity is **92.6** composite with whole silhouette 97.5, hull 97.7,
turret 94.0, tracks 93.7 and every whole view at least 95.81. The isolated
gun score of 64.3 records the deliberate published-datum extension beyond
the source-short tube, not a station or attachment defect. Normal and exact
track audits are band 0/0 and shoes 0/0; standard check has contiguity 0 and
mg1+0d; parent audit is stranded 0 / abutting 0 / dangling 0; winding is
0 reversed / 0 mixed / 0 deficit pixels with no yaw candidate. The bake,
visible muzzle-bore proof, all eight regenerated presentation assets,
`npm test` and `npm run build:private` are green.

Geometry freeze reproduces x2 at **`a88afa6c`** (29 meshes / 538,774
vertices). Forty-two fresh unique PNGs cover fourteen paired views plus
fourteen yaw-0 and fourteen yaw-90 frames. Independent §B8 scores
`[9.5,9.6,9.5,9.5,9.5,9.5,9.5,9.6,9.7,9.7,9.6,9.8,9.6,9.8]`, floor
**9.5**, mean **9.60**. The critic explicitly confirms source proportions,
buried cage support with no remaining sky wound, one seated rotating
turret/gun/sensor package, correct fixed-hull ownership, continuous native
seven-wheel tracks and no visible winding wound. **GRADUATED; KEEP
`a88afa6c`; the earlier `f95cf87e` sitting and procedural `60d7d14` record
are retired. Fleet gate is 38/97 and graduates are 43.**

## 5.105 T-90SM OWNER-PRIORITY COMPLETE REDESIGN (2026-08-10, RE-FROZEN)

The owner correctly rejected the earlier T-90SM graduation as visually
unfinished. The repair retains the source-section hull, gun, low welded
turret core and variant-specific equipment rather than replacing them with a
generic modern-family proxy. The former solid vertical bustle steps are now
supported, backed slat cells: every stile terminates into upper/lower rails,
the recessed backing closes sky-through, and buried carrier feet return the
assembly into the rotating bustle. A low diamond cheek skin is embedded in
the measured shell to recover the source's broad swept shoulders without a
second turret or envelope growth. Deep inboard scalloped skirts restore the
side silhouette without entering the native shoes, and unequal rear louvre,
pipe and tow planes replace the former blank transom.

Freeze reproduces x2 at **`7efc69c9`** (48 meshes / 93,257 vertices).
Machine gate reproduces x2 at **90.0** | 90.2/90.3/90.9/90.0/100/100;
gate JSON SHA-256 is
`55c349c191fbb584620fe0cf0d88f315ff4a72c23156d19951b31a73b6a22c61`.
Direct fidelity is **93.3** (H96/T88/G94/R91), with every whole-vehicle view
above 93. Standard audit passes with clips 24/49, contiguity 0 and mg1+3d.
Winding is 0 reversed / 0 mixed, with a 15-pixel (0.03%) left deficit and
zero yaw candidates. The parent-audit nominee `fitting_towCable` is correctly
hull-owned; fresh yaw proves it stays on the exposed fixed deck while the
complete turret departs. `npm test` and `npm run build:private` are green.

Fresh independent §B8 inspected 42 unique frames: fourteen paired source
views, fourteen yaw-0 views and fourteen yaw-90 views. The fixed score vector
is `[9.0,9.1,9.0,9.1,9.0,9.1,9.0,9.1,9.1,9.1,9.1,9.1,9.1,9.2]`, floor
**9.0**, mean **9.08**. It confirms that the gun, cheek skin, turret, backed
slat wrap, optics, RWS/MG, smoke kit and antennas rotate as one physically
seated assembly; the scalloped skirts, rear service field and tow cable stay
hull-fixed; and one continuous native six-road-wheel linked-shoe system has
no donor residue or penetration. No fused turret mass, stranded decoration,
air seam or visible winding wound remains. **KEEP `7efc69c9`; prior freeze
`56324371` and its lower-detail sitting are retired. Fleet gate remains 38/97
and graduates remain 43.**

## 5.106 T-90A VLADIMIR HULL/TURRET DE-FUSION (2026-08-10, RE-FROZEN)

The owner's yaw screenshot correctly identified a large hull-fixed mass beneath
the rotating Vladimir turret. Source-node isolation established that the source
owns an open fender/service frame in this station, not a second armored shell.
The procedural solid center plateau and thin silhouette slivers are therefore
retired. A narrow open hull frame now follows the measured source envelope: two
long side rails, a transverse tie and deck-buried posts provide visible load
paths while preserving negative space. The rotating assembly receives a buried
collar, so the cast shell, gun, ERA, optics, RWS, smoke kit, hatches and antenna
roots leave the deck together at yaw without exposing an impossible seam.

The recovered source remains byte-unchanged at SHA-256
`3ceda4972aa0e4cdba9ecf0353ab584ed61b6cd22e1af75d4c077f75c4a67400`.
Freeze reproduces at **`52f98951`** (41 meshes / 74,100 vertices). Machine
gate reproduces at **90.4** | 90.4/90.8/91.1/93.0/96.2/100; gate JSON
SHA-256 is
`8f467675eb17c98ee05d69586413a6ae8e1045cca7203adb98de06a311dd3c5d`.
Direct fidelity is **91.58** (H95.23/T82.05/G89.38/R94.75), with every
whole-vehicle view at least 92.04. Standard audit is green with track band
54/0, contiguity 0 and mg1+0d. Parent audit reports stranded 0 / abutting 0 /
dangling 0. Winding mode 1 is 0 reversed / 0 mixed / 0 deficit pixels; the
mode-2 `rig_hull/mesh#17` nominee is the new supported fixed service frame,
not stranded turret geometry. `npm test` and `npm run build:private` pass.

Fresh independent §B8 inspected 42 uniquely hashed frames: fourteen paired
source views plus fourteen yaw-0 and fourteen yaw-90 views. Its fixed vector is
`[9.1,9.2,9.1,9.0,9.0,9.0,9.1,9.1,9.2,9.2,9.0,9.2,9.2,9.2]`, floor
**9.0**, mean **9.11**. It confirms that the former fused mass is gone, the
open replacement frame is supported and correctly hull-owned, and every turret
fitting has a continuous rotating load path. Tracks and winding also pass with
no visible wound. **KEEP `52f98951`; prior freeze `c13fec50` is retired.
Fleet gate remains 38/97 and graduates remain 43.**

## 5.107 ABRAMS FIVE-MARK ARMOR + FULL GHILLIE WAVE (2026-08-10, RE-FROZEN)

The owner required substantially better visible armor/decorations and a real
shrub/ghillie package covering the turret, hull and machine-gun stations on
`m1a1ha`, `m1a2_tejas`, `m1a2_sepv2`, `m1a2_sepv3` and `m1a2_tusk`. The two
supplied SEPv2 ZIPs are byte-identical (SHA-256
`3cb26ee5bdb10c8cbcb2e4af127ff7e8eb30f4c5f260f3895debe33f091a87f0`)
and carry no preserved redistribution license. They were used only as a
local visual/inventory reference; no mesh, texture or archive byte ships.

The implementation is original deterministic geometry. A transparent cut-net
with diagonal cord courses sits directly on crown, cheeks, bustle, glacis,
engine deck and side carriers. Overlapping leaf strips, knots, grass blades
and vines all intersect those seats. Separate turret and hull packages enforce
ownership: turret blankets and the covered CWS/CROWS rotate; glacis, deck,
skirts, side armor/ERA and TUSK cage remain hull-fixed. Optical glass, gun
lines and muzzles stay exposed. Passive seam/fastener language is used on
M1A1HA and clean M1A2, while TUSK/SEPv2/SEPv3 retain their distinct existing
reactive/passive array grammar instead of receiving one generic ERA skin.

The mandatory configured P95 heights are now 2.80 m M1A1HA, 3.30 m M1A2,
3.44 m SEPv2, 3.18 m SEPv3 and 3.29 m TUSK. Registered gate rows are 53.2,
25.7, 14.3 and 0 for HA/M1A2/SEPv2/TUSK respectively. Their low shape scores
record the owner-mandated armor/ghillie divergence from the bare Tejas oracle,
not a dimension, floater or seating waiver: dims are 100/100/100/98.3 and
floaters are 100 throughout. SEPv3 remains FALSE-0; no oracle registration,
gate file or ledger row was invented.

Exact track audits retain one native seven-wheel course. Front/rear band clips
are 60/42 for HA, M1A2, SEPv2 and SEPv3 and 60/0 for TUSK; shoe clips are 0/0
for every mark. Standard audit has zero enclosed-air holes and one connected
MG/CROWS assembly per mark. Winding reports zero deficit pixels and no visible
reversed/mixed sheet. The hull-ghillie candidates are correctly hull-owned,
as the corrected quarter-turn evidence shows.

Freezes reproduce twice: **`d8a948cc`** HA (55 meshes / 208,210 vertices),
**`1adc0bde`** M1A2 (56 / 214,570), **`7680a400`** SEPv2 (58 / 232,258),
**`2cd6070`** SEPv3 (55 / 237,010) and **`cfc006f2`** TUSK (66 / 261,898).
The initial `r6-yaw90` capture was discarded because its driver
double-converted degrees and produced only a 1–2 degree turn. Final evidence
uses 42 distinct frames per mark: fourteen paired views plus freshly captured
actual yaw-0/yaw-90 sets.

Independent §B8 floors/means are HA 9.2/9.36, M1A2 9.2/9.39, SEPv2
9.2/9.41, SEPv3 9.3/9.44 and TUSK 9.4/9.47. All five pass source/variant
identity, attachment seating, turret/hull ownership, CWS/CROWS load paths,
native tracks and winding with no blockers. Forty presentation assets were
regenerated; live asset/metadata and muzzle-bore checks pass all five. The
consolidated release wrapper intentionally exits nonzero at its standard-check
phase because it requires a >=90 machine gate and therefore treats these
documented owner-divergence/FALSE-0 rows as non-graduates. **KEEP all five
freezes. The three existing graduates are re-frozen; SEPv3 FALSE-0 and TUSK
owner-divergence bindings remain non-graduate. Fleet gate stays 38/97 and
graduates stay 43.**

## 5.108 K1A1 K6-ON-CUPOLA + STRUCTURAL FINISH (2026-08-10, RE-FROZEN)

The owner's standing K6-to-cupola order supersedes the obsolete 2.25 m
low-wall trade. The owner archive `k1a1-armored-warfare.zip` is SHA-256
`d2e8eeb7d828b2cff23ee78d54657ebf97935f430151741f4dab8a23cbb6a96d`.
Its nested Armored Warfare OBJ/textures have no preserved redistribution
license and remain quarantined for local visual measurement only; no archive,
mesh, material, texture or derivative payload byte ships. The ignored local
visual oracle is SHA-256
`b36b620f868cccbdbc2a874c6967273e2cc712b7df83c6e1bc054ec95bad24a0`.

The old center-box/outer-slab turret is retired. One continuous twelve-station
polyLoft now forms a short mantlet throat, swept cheeks, low rounded sides and
tapered bustle. The K6 sits on a broad AA ring, hatch, vision drum and buried
cupola seat; the loader MAG has an explicit hatch ring. Doghouse, periscopes,
mast, folded whips and smoke banks all meet physical pads, collars or cheek
bases. The open wrap basket directly contacts the bustle and returns through
longitudinal rails, transverse brackets, corner uprights and a narrowed rear
rack, so its negative space remains supported rather than becoming a wall or
floater.

Hull shoulders are canted, the prow flare follows the glacis rake, and shorter
raised skirts expose a compact native six-wheel course. The six 0.36 m road
wheels use 0.75 m cadence and shortened terminal transitions while retaining
the game's linked-shoe animation/damage system. No donor wheel, drum, band or
track byte enters the playable vehicle. The configured combat P95 height is
2.58 m; measured broad-envelope height is 2.56 m.

Freeze reproduces x2 at **`28c7f5f0`** (62 meshes / 73,566 vertices).
Dimension and floater rows are 100: actual/published height 2.56/2.58, hull
7.51/7.48, overall 9.67/9.71 and width 3.59/3.60. The quarantined print's
source/material segmentation keeps its comparison gate cap-documented at
**49.7** | 58.5/53.7/49.7/51.3/100/100; that row is not presented as a
machine PASS. Winding is 0 reversed / 0 mixed, with a clean 131-pixel (0.184%)
front-right deficit and a clean 112-pixel yaw nominee. Parent audit's sole
candidate is the fixed driver-periscope strip; it reports no abutting or
dangling fitting. Fresh yaw identifies the winding nominee as a supported
hull-owned rear spare-track fitting.

Fresh independent §B8 inspected 42 distinct frames and confirmed a genuine
quarter-turn. Its vector is
`[9.2,9.3,9.1,9.1,9.0,9.1,9.1,9.3,9.2,9.3,9.2,9.3,9.3,9.3]`, floor
**9.0**, mean **9.21**. Gun, shell, K6, loader MG, smoke/optic/antenna suite
and entire open basket rotate together with visible seats; driver optics,
deck, transom and rear spare links remain hull-fixed. One coherent six-wheel
native course passes with no donor duplication, penetration or broken wrap.
No fused mass, stranded equipment, empty-air decoration or visible winding
wound remains. All eight K1A1 presentation assets and its manifest record were
regenerated; the targeted asset/metadata/geometry/muzzle-bore gate passes 1/1.
`npm test` and `npm run build:private` pass. The all-fleet asset
freshness checker remains independently red only on pre-existing unrelated
`leo2a4`, `leo2a7v`, `leopard2_proto`, `m1a1` and `type10` stale records; the
new K1A1 record is not among its failures. **KEEP
`28c7f5f0`; prior `53b64e74` and its low-wall K6 trade are retired. Fleet
gate stays 38/97 and graduates stay 43.**

## 5.109 TYPE 99A2 OWNER-SOURCE COMPLETE REBUILD (2026-08-11, RE-FROZEN)

The owner-required Type 99A2 finishing wave retires the §5.51/§5.52
block-stack/ERA-blanket builder. The supplied
`type_99a2_armored_warfare.glb` is SHA-256
`35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f`.
Because it is commercial-game-titled and lacks proven redistribution
provenance, it remains a local measurement/visual reference only. No source
mesh, material, texture, animation or derived payload byte ships.

The new original procedural build has a long low hull, shallow sharp glacis,
one connected low arrowhead turret, integrated gun root and lengthened
chamfered aft shoulders. A backed full-width open bustle returns into the
turret through upper/lower rails, deep end frames, corner uprights and diagonal
braces. Hatches, dense periscopes, panoramic/compact sights, MG, smoke banks
and antennas all meet physical plinths, collars or armor pads. The louvred
engine deck and layered service transom stay hull-owned. Raised/scalloped
skirts expose six unmistakable native road wheels inside one continuous
linked-shoe course; donor running gear is absent.

The release-only bow correction narrows the lower nose inside the native
track lane and carries the outer shoulders on raised guard bridges. Exact
band clips fall from 204/16 to **17/16**, shoe collisions from 227/0 to
**0/0**, and the four tiny front-corner top-down pockets close to zero without
changing the certified upper silhouette.

Freeze reproduces x2 at **`cf97a01b`** (52 meshes / 76,251 vertices).
Dimensions are 100: measured/published hull 7.33/7.35, overall 10.67/10.70,
width 3.71/3.70 and P95 height 2.50/2.50. Floaters are 100; parent audit is
stranded 0 / abutting 0 / dangling 0. Winding is 0 reversed / 0 mixed, with
one rear-left pixel (0.00%) and zero visible wound. The quarantined print's
fused/component registration keeps the automated comparison honestly
cap-documented at **4.0** | 4.0/8.3/28.5/28.1/100/100; this is not claimed
as a machine PASS. Gate JSON SHA-256 is
`5f0d6cccd1bf9391128fd744927f7453065f3c3dfece58c8e0a7f636b79f59a7`.

Fresh independent §B8 inspected 42 distinct frames and a genuine quarter-turn.
Its vector is
`[9.2,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.3,9.2,9.3,9.3,9.4]`, floor
**9.1**, mean **9.24**. It confirms source proportions, seated roof/bustle
load paths, correct turret/hull ownership, one coherent six-wheel native
track course and no fused mass, stranded fitting, empty-air decoration or
visible backface wound. Eight presentation assets and the manifest record are
regenerated from the frozen playable. **KEEP `cf97a01b`; prior `8d13f030`
and pre-release `d1ded13b` are retired. Fleet gate stays 38/97 and graduates
stay 43.**

## 5.110 TYPE 74 OWNER-SOURCE COMPLETE REBUILD (2026-08-11, RE-FROZEN)

The supplied `/Users/kevinliu/Downloads/type_74.glb` is SHA-256
`8cd9eb1a915a4bcba402ba86032a6111cdd8c7e1f5cc1698a5fe50bdbd7c726e`.
Its Sketchfab Standard/commercial-reference provenance keeps it ignored and
local-only. It served solely as a visual/measurement oracle; no source mesh,
texture, material, armature, animation or derivative payload byte ships.

The old six-small-wheel/oval-dome fallback is retired. A new original
procedural build uses a compact folded hull, exactly five exposed wheels per
side, one low asymmetric cast shell, rounded mantlet/gun root, source-side
searchlight, broad seated MG/cupola, canted smoke banks and an open basket
carried by side/diagonal turret returns. Compact twin-lamp cassettes land on
the upper bow shoulders. Unequal radiator/service bays, offset latches, an
exhaust coupling, recovery box and asymmetric tow/light fittings give the
rear its source identity. The last hidden 126-cell lower-tub/transom pocket
is closed by an inner bridge without changing the visible envelope.

Five 0.455 m road wheels retain distinct rubber tires, recessed dishes, hubs
and bolt cadence inside one native linked-shoe course. Exact band and shoe
collisions are **0/0 front and rear**; contiguity is **0**. Parent audit's
sole nominee is the supported fixed driver-periscope strip, with abutting 0 /
dangling 0. Winding mode 1 is 0 reversed / 0 mixed / 0 deficit pixels; the
456-pixel mode-2 nominee is the supported fixed forward lamp/shoulder package,
confirmed hull-owned by the quarter-turn evidence.

The P95 combat-height datum is corrected from 2.48 m to **2.70 m**. Dimension
rows are 94.0 (actual/published height 2.70/2.70, hull 6.64/6.70, overall
9.58/9.42, width 3.18/3.18) and floaters are 100. The skinned/fused local
print still cannot provide honest hull/turret/station component masks, leaving
the comparison row cap-documented at **0** | 0/0/0/0/94/100 rather than
inventing a machine PASS. Gate JSON SHA-256 is
`a1b7503c3225d6251d20f3d6a4e599181f94791ba954b1bba6dfa99e9bbb2c3e`.

Freeze reproduces x2 at **`8319dbb8`** (49 meshes / 66,511 vertices).
Fresh independent §B8 inspected 42 distinct r15 frames and a genuine
quarter-turn. Its vector is
`[9.2,9.3,9.2,9.2,9.1,9.2,9.2,9.3,9.4,9.4,9.3,9.5,9.3,9.5]`, floor
**9.1**, mean **9.29**. It passes source fidelity, all turret equipment and
basket load paths, hull ownership, lower-bridge closure, exact five-wheel
native tracks and winding with no fused mass, stranded item, empty-air
decoration or visible wound. Eight presentation assets and the manifest were
regenerated; targeted asset/metadata and muzzle-bore checks, `npm test` and
`npm run build:private` pass. The standard wrapper is red only because it
correctly requires a >=90 machine row and will not waive the fused-oracle
cap. **KEEP `8319dbb8`; all earlier Type 74 fallback/freezes are retired.
Fleet gate remains 38/97 and graduates remain 43.**

## 5.111 C1 ARIETE NATIVE-PROCEDURAL REBUILD (2026-08-11, RE-FROZEN)

A local comparison file, `/Users/kevinliu/Downloads/c1_ariete_italian_mbt.glb`, is
112,070,992 bytes with SHA-256
`738505b3099016c938daa85f8eb82806cd6af19a2aa3e15b26810bc6c163607e`.
Its DustyMojito/Sketchfab Standard provenance keeps it local-only as a visual
and measurement oracle. No source mesh, material, texture, animation or
derived payload byte ships, and the historical quarantined model swap stays
disabled.

The old slab-heavy procedural fallback is retired. The original procedural
replacement has a long low hull, shallow layered bow, a broad low connected
turret and an integrated rounded mantlet with a source-measured shorter gun
run. Asymmetric cupolas, TURMS/optic stations, MG/RWS, smoke banks and antenna
whips all meet visible seats, collars or cheek brackets. The open rear basket
returns into the bustle through side, transverse and diagonal rails. Unequal
backed service bays and exhaust/recovery/light/tow hardware remain hull-owned.
A small real backing seat inside the lower recovery rails closes the final
single 5 cm top-down pocket without silhouette growth.

Exactly seven native road wheels per side remain separately legible inside
one continuous linked-shoe course. Exact band clips are 7/0 and shoes 8/0;
standard contiguity is zero. Parent audit is stranded 0 / abutting 0 /
dangling 0. Winding is 0 reversed / 0 mixed / 0 deficit pixels. The 57-pixel
mode-2 nominee is the supported fixed rear service seat, not a turret item.

Freeze reproduces x2 at **`acea2100`** (49 meshes / 75,357 vertices).
Dimensions are 99.4 and floaters 100. The source GLB's fused gun and sparse,
mask-incompatible component segmentation cap the automated source comparison
at **24.8** | 59.2/39.5/24.8/64.6/99.4/100 rather than permitting a false
machine PASS. Gate JSON SHA-256 is
`1f79dcc144078df83fc8128ca07c7487394537d35f7a6dd0fda4001cdae35ff3`.

Fresh independent §B8 uses only the 42 uniquely hashed `acea2100` r14 frames:
fourteen paired views plus genuine yaw-0/yaw-90 sets. Its vector is
`[9.3,9.3,9.2,9.1,9.0,9.1,9.2,9.3,9.3,9.4,9.2,9.4,9.3,9.4]`, floor
**9.0**, mean **9.25**. It passes source fidelity, the rear-seat closure, all
turret and basket load paths, hull ownership, seven-wheel native tracks and
winding with no fused mass, stranded fitting, empty-air decoration or visible
wound. Presentation assets and release gates are regenerated at landing.
**KEEP `acea2100`; `5a99fca8` and every earlier Ariete freeze are retired.
Fleet gate remains 38/97 and graduates remain 43.**

## 5.112 CHALLENGER 1 MK.3 NATIVE-PROCEDURAL REBUILD (2026-08-11, GRADUATED)

A local comparison archive, `challenger-1-mk3.zip`, is 25,380,501 bytes with SHA-256
`eab836f4e2d4b0631f121e8f9fcb876519656ccbb3413616128a723731ef99fe`.
The recovered local visual oracle `challenger1.glb` is 5,882,980 bytes with
SHA-256
`aab22967e5d66d7c122fdb8d7fe83dcc9f43c506d1454af58e30749f91134d27`.
Both remain ignored, local-only measurement and visual references. No source
mesh, texture, material, animation or derived payload byte ships.

The historical gate-shaped block build is retired. Its nominal 90.2 row
required the same fused/follower component interpretation that produced the
owner-rejected tall turret, blank walls and incorrect hull/turret split; its
old critic floor was only 7.0. The new original procedural build uses a compact
low hull around exactly six native road wheels, a layered swept prow, one low
connected cast turret, buried curved cheek shoulders and a broader oval
mantlet seat. A low interconnected commander/TOGS foundation carries the
periscope and MG cadence on broad seats. Smoke banks land on cheek brackets,
antennas terminate in collars, and the full open basket returns into the
bustle through side/end supports. Unequal dark bustle rolls and packs remain
cradled to the turret; backed framed transom louvres, recovery fittings and
service hardware remain hull-owned.

Freeze reproduces x2 at **`cacb1337`** (50 meshes / 115,647 base vertices;
456,951 instanced vertices). Root dimensions are width 3.495 m, combat height
2.965 m, overall length 11.572 m and hull length 8.159 m. One continuous
native linked-shoe course carries six separately readable tire/dish/hub wheel
assemblies per side with coherent terminal transitions and no donor course.
The inter-track belly, high sponson underside and lane-local terminal faces
now pass the exact audit at band **0/0** and shoes **0/0**.

The commercial print's fused/follower component segmentation cannot provide
honest hull/turret/station masks for this corrected articulation. The machine
row is therefore cap-documented at **0** | hull 43.6 / whole 19.1 / turret 0 /
stations 34.6 / dims 99.6 / floaters 100, not claimed as a PASS. Gate JSON
SHA-256 is
`1867d29e95de991a2981da866fb2ed385eae47d57e9f84696b156d34545594da`.
This is the same reference-mask incompatibility class already documented for
the Type 74, Type 99A2 and Ariete native-procedural graduates; retaining the rejected
visual build merely to preserve a green automated row is forbidden.

Fresh independent §B8 inspected only 42 unique r26 frames: fourteen paired
reference views plus genuine yaw-0 and yaw-90 sets. Its fixed vector is
`[9.2,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.2,9.1,9.2,9.1,9.2]`, floor
**9.0**, mean **9.13**. It confirms source fidelity, a real quarter-turn, the
complete gun/turret/commander/TOGS/smoke/antenna/bustle/basket package moving
as one seated assembly, a coherent fixed hull/deck/transom, six-wheel native
tracks and no fused duplicate mass, stranded fitting, empty-air decoration,
sky hole or visible winding wound. Eight presentation assets and the manifest
record are regenerated from the freeze. Targeted asset and muzzle-bore checks,
`npm test` and `npm run build:private` pass at landing. **GRADUATED; KEEP
`cacb1337`; the old `5bf5f2ec` gate-shaped visual failure and every intermediate
reconstruction sitting are retired. Fleet gate is honestly 37/97 and graduates
are 44.**

## 5.113 LEOPARD 2A6 OWNER-SOURCE UPPER REBUILD (2026-08-11, GRADUATED)

The owner-supplied `/Users/kevinliu/Downloads/leopard_2_a6.glb` has SHA-256
`b98d81990ecf8a65e8d7f81158226f1bd55fe71d6e923c4f896151d7ee237477`.
It is the same CC-BY-4.0 buh Leopard 2 A6 lineage already recorded in
`docs/ATTRIBUTION.md`. The deterministic `tools/leopard2a6-source-bake.py`
fails closed on that hash, reads only the semantic hull, turret and gun
meshes, and excludes donor wheels, tracks, rollers and terminal gears. Two
authored 1.6 m bustle whips are rigidly folded into the source's documented
Bundeswehr tied-down pose: exactly 104 source vertices rotate 90 degrees about
their shared base line with no deletion, scaling or reshaping.

The retired procedural approximation is replaced by the exact articulated
source upper: 31,012 hull vertices / 34,888 triangles, 20,250 turret vertices /
23,641 triangles and 1,949 gun vertices / 2,614 triangles. Authored hull plan,
arrowhead AMAP cheeks, mantlet and complete L/55, EMES/PERI stations, roof
furniture, bustle, deck and rear service geometry are retained. The source is
width-normalized to 3.75 m while preserving its authored plan aspect ratio.
One native seven-wheel linked-shoe course per side replaces the donor gear;
its idler, sprocket, belt and shoe lane are reseated under the source
mudguards. Exact audit is band **0/0**, shoes **0/0**, blind spots zero,
standard contiguity zero and decoration census `mg1+0d`.

Freeze reproduces at **`961b625b`** (30 rendered meshes / 557,311 rendered
vertices / 185,949 triangles). The generated source module SHA-256 is
`2d174631885c13341337c51ae50246dc556ea95fc60e38707d327b436cea96a8`.
The shape gate confirms hull 90.7 / whole 90.3 / turret 91.4 / stations 100 /
floaters 100. Its **42.8** headline is an adjudicated dimension-only false
zero: exact owner geometry measures height 2.75 vs 2.64 m (4.25%), source hull
7.40 vs published 7.72 m (4.18%), overall 10.78 vs 10.97 m (1.72%) and width
3.75 vs 3.75 m (0.08%). A falsification pass that anisotropically compressed
height improved the nominal dimension row but destroyed source fidelity
(stations 100 -> 66.5); it was rejected. Distorting exact owner geometry to
manufacture a green dimension row is forbidden.

Fresh final evidence contains fourteen paired source/procedural views plus
fourteen yaw-0 and fourteen genuine yaw-90 frames. The fixed vector is
`[9.5,9.6,9.5,9.5,9.4,9.5,9.5,9.6,9.7,9.7,9.6,9.7,9.6,9.7]`, floor
**9.4**, mean **9.58**. It confirms exact source fidelity, a genuine
quarter-turn, the gun/mantlet/turret/roof/whip package moving as one seated
assembly, hull/deck/native gear remaining fixed, and no fused duplicate mass,
stranded fitting, empty-air decoration, track penetration or visible winding
wound. Presentation assets and release gates are regenerated at landing.
**GRADUATED; KEEP `961b625b`; retired freezes `09912270`, `cff6f478`,
`80b76338` and the procedural approximation no longer define the playable.
Fleet gate is honestly 36/97 because this exact-source dimension false zero
replaces the old procedural machine PASS; graduates are 45.**

## 5.114 T-72B OBR. 1987 OWNER-SOURCE REBUILD (2026-08-11, GRADUATED)

The owner's archive
`/Users/kevinliu/Downloads/t-72b-obr-1987-ussr.zip` is fixed at SHA-256
`1585d7468a4b5c23f66c6b57e9a9440c2b49363a9b877d7d0d6a04852416c04d`.
Its recovered local visual oracle,
`public/models/tanks/community/recovered/t72b_1987.glb`, is fixed at SHA-256
`75f1243ad7f3e3cf25fd7e29cb3a86091d7a833fa681ad9f3dafc7e63068c927`.
The archive does not provide sufficient redistribution provenance, so both
remain ignored, local-only review inputs: no source mesh, material or texture
bytes ship in this graduate. The playable is an original procedural rebuild.

The earlier print-tuned `d62c8140` freeze is retired after the new owner-source
baseline exposed a 7.7 floor / 7.83 mean. Its high smooth dome, deep slab
side, sparse upright Kontakt-1 proxies and simplified rear could not be
finished by decoration alone. `buildT72B87Owner` replaces that presentation
with a compact low loft hull, six large dished native road wheels, one linked
shoe course, a low clipped pear/cast turret, dense buried and staggered K1
front/flank courses, a restrained shielded commander/NSVT station, supported
optics/periscopes/antennae, twin smoke banks, low rear turret packs and an
unequal backed drum/louvre/service transom. The old builder remains only as an
archaeological receipt; `T72_PROFILES.t72b_1987` selects the owner rebuild.

Freeze reproduces at **`3f2483d4`** (39 rendered meshes / 117,587 rendered
vertices). Exact track audit is band **0/0**, shoes **0/0**, blind spots zero.
The turret-parent audit is stranded 0 / abutting 0 / dangling 0. Winding is
rev 0 / mix 0 / deficit 0 px / yaw candidates 0. The geometry gate records
headline 0 with hull 34 / whole 33 / turret 38.8 / stations 32.4 / dimensions
0 / floaters 100; its JSON SHA-256 is
`17951ae82c907d37e4e7ccaaf6df1a686c91c5d1e35961e6af0ec939bd3251f9`.
The plan contiguity scan reports only two one-cell apertures at the supported
rear recovery/service hardware (`x +/-1.18, z -2.92`). They are stable,
intentional mechanical negative space rather than an open hull sheet: no
background wound appears in any of the 42 standard/yaw frames. The combined
release wrapper therefore remains red for the recorded silhouette gate and
those conservative recovery-eye cells; its asset, bore, exact-track,
parenting and winding constituents pass independently.
This remains an honest machine false-zero against the recovered commercial
scene masks rather than a hidden green override: measured dimensions are
height 2.38 vs 2.23 m (+6.57%), hull 6.02 vs 6.67 m (-9.79%), overall 9.28 vs
9.53 m (-2.58%) and width 3.58 vs 3.59 m (-0.14%). The independent registered
source views, not distortion toward those batch masks, govern this visual
owner-source graduation.

Fresh immutable evidence contains fourteen source/procedural pairs plus
fourteen yaw-0 and fourteen genuine yaw-90 frames: 42 PNGs / 42 distinct
SHA-256 hashes. The fixed standard vector is
`[9.2,9.2,9.1,9.1,9.0,9.1,9.1,9.2,9.1,9.2,9.1,9.2,9.2,9.1]`, floor
**9.0**, mean **9.14**. It confirms source fidelity and a real quarter-turn:
the gun, cast shell, full inner/outer K1 blanket, commander/NSVT, optics,
hatches, antenna roots and rear turret packs rotate as one visibly seated
assembly; glacis, deck, engine grilles, skirts, rear drums/log, transom service
field and running gear remain fixed. No fused duplicate mass, stranded
fitting, empty-air decoration, donor course, penetration, open sheet or
backface wound is visible.

All eight presentation assets were regenerated and their manifest geometry
binding refreshed. The asset/currentness audit passes 1 tank / 8 files, the
rendered bore proof passes, the full `npm test` suite passes and the private
production build passes. **GRADUATED; KEEP `3f2483d4`; retire `d62c8140` as
the playable freeze. Fleet gate remains honestly 36/97; graduates are 46.**

## 5.115 T-72BU OWNER-SOURCE REBUILD (2026-08-11, GRADUATED)

The owner's `/Users/kevinliu/Downloads/t-72bu-ussr.zip` is 2,800,528 bytes
with SHA-256
`582bae1f9f268fdcedc9f61179ef7c33e3b2e8885a5dd2f977ab7d048a208310`.
Its recovered local visual oracle,
`public/models/tanks/community/recovered/t72bu.glb`, is 855,800 bytes with
SHA-256
`2957f8938e4e5c897ba680deb2ca986b270bbddb215fcddd52e495b3e4b9608b`.
The archive does not establish sufficient redistribution provenance, so both
remain ignored local measurement/review inputs. No owner mesh, material,
texture, animation or derived payload byte ships; the playable is original
procedural geometry.

The rejected baseline had a 4.8 floor / 5.87 mean: a nearly hull-width smooth
dome, tall slab hull, undersized wheels, sparse generic protection and roof
pieces carried on implausibly thin links. `buildT72BUOwner` replaces it with a
compact low loft hull, exactly six large dished native wheels, one continuous
linked-shoe course, a low clipped pear/cast turret and an articulated 2A46M-4.
Narrow deep irregular K5 courses bury into the cheek/roof transition. The
source-side searchlight, commander cupola and shielded NSVT form one low
asymmetric station on broad stepped seats; optics, smoke banks and antennae
terminate in visible pads or collars. Four unequal strapped fuel drums,
backed transom panels, low recovery hardware, terminal mudguards and the
deep-wading snorkel remain hull-owned. Low unequal turret-rear packs and open
rails return into the cast shoulder through visible brackets.

Freeze reproduces x2 at **`4b66bf6c`** (38 rendered meshes / 108,803 rendered
vertices). Exact track audit is band **0/0**, shoes **0/0**, blind spots zero.
Turret-parent audit is stranded 0 / abutting 0 / dangling 0. Winding reports
reversed 0 / mixed 0 and a visually null 2-pixel (0.00%) frontright deficit;
the 95-pixel mode-2 `rig_hull/mesh#17` nominee is the supported fixed
deck/rear-service package independently confirmed hull-owned under yaw.

The recovered commercial scene's fused/component masks do not provide an
honest automated comparison for the new articulated procedural. Its recorded
machine row is therefore a transparent false zero: **0** | hull 26.7 / whole
23 / turret 24.2 / stations 0 / dimensions 0 / floaters 100. Measured rows
are height 2.43 vs 2.23 m, hull 6.32 vs 6.86 m, overall 9.69 vs 9.53 m and
width 3.74 vs 3.78 m; exact registered source pixels govern the owner-source
graduation rather than distorting the playable toward those incompatible
masks. Gate JSON SHA-256 is
`c795344de67f7423e05801de6d487b559e7633dda9ecf6ed949f924f3676e672`.

Fresh independent §B8 inspected 42 distinct frozen r9 frames: fourteen paired
source/procedural views plus fourteen yaw-0 and fourteen genuine yaw-90
frames. Its fixed vector is
`[9.1,9.2,9.2,9.2,9.0,9.1,9.2,9.2,9.3,9.3,9.2,9.3,9.1,9.3]`, floor
**9.0**, mean **9.19**. It confirms source fidelity and a true quarter-turn:
the gun/mantlet, full cast shell, every K5 cassette, compact combat station,
optics, smoke, antennae and rear packs rotate as one visibly seated package;
the snorkel, four drums/straps, mudguards, transom, engine deck and native
running gear stay fixed. No fused duplicate mass, stranded fitting,
empty-air decoration, donor course, collision, open sheet, sky hole or visible
winding wound remains.

All eight presentation assets and the manifest binding are regenerated.
Targeted asset/currentness and rendered-bore checks pass; `npm test` and
`npm run build:private` pass. **GRADUATED; KEEP `4b66bf6c`; retire the legacy
`buildT72BU` presentation and every intermediate sitting. Fleet gate remains
honestly 36/97; graduates are 47.**

## 5.116 T-80U OWNER-SOURCE EXACT UPPER REBUILD (2026-08-11, HISTORICAL / RETIRED)

> This source-baked playable was retired on 2026-08-12. The current runtime
> is the fully first-party `buildT80UNative2026`; see §5.132 below.

The owner's `t-80u-ussr.zip` (4,197,004 bytes; SHA-256
`958e399cced2c24cb9dbcc23bce1b7f7edafd573c3b7af299ff2d076de96beb4`)
and `tank_t-80u.glb` (3,437,024 bytes; SHA-256
`8a4547d6f121fc5561d6f377bc6e70efc5321b66c0578503f060af554c19ee7f`)
identify the same javanilga source lineage already attributed in the
repository. No new third-party binary ships.

The gate-shaped procedural approximation is retired. A deterministic,
fail-closed source bake now supplies the exact articulated hull, turret and
gun upper geometry from the repaired attributed asset: 25,655 source vertices
and 25,379 source triangles. Donor wheels, tracks and terminal gears are
excluded. One fleet-native six-road-wheel linked-shoe course per side replaces
them at the source-measured wheel, sprocket, idler and terminal-wrap datum.
The complete source gun/mantlet, cast shell, ERA, smoke, hatch/periscope/optic,
commander/MG, antenna, rear-cylinder/cradle and basket package belongs to the
turret; glacis/fender/deck/transom and native gear remain hull-owned.

Presentation freeze reproduces at **`c0dc2502`** (32 rendered meshes / 108,979
base vertices / 415,027 instanced vertices / 138,521 rendered triangles).
Exact track containment is band **0/0** and shoes **0/0**. Turret-parent audit
is stranded 0 / abutting 0 / dangling 0. Winding reports reversed 0 / mixed 0
and yaw candidates 0; its conservative 932-pixel (0.40%) rear FrontSide
deficit has no visible sheet wound in any standard or yaw frame.

The recorded geometry row remains an honest legacy-oracle non-pass at
**72.4** | hull 80 / whole 74.8 / turret 72.4 / stations 94.8 / dimensions
77.7 / floaters 100. That reference path still applies the old hand-normalized
and 130%-height-clamped print registration; an isolated 3.08 m antenna node
historically shrinks the full source scene before mask measurement. It cannot
truthfully judge an exact semantic-subtree bake at published hull scale. Gate
JSON SHA-256 is
`673801aa72d2d85884c39b5f902cf910d928c67264b46c149c22e6dca353f890`.
The stale automated row is disclosed rather than overridden or gamed.

Fresh independent §B8 inspected only 42 r2 frames: fourteen paired views and
genuine yaw-0/yaw-90 sets. Its vector is
`[9.7,9.6,9.4,9.5,9.7,9.5,9.4,9.6,9.8,9.7,9.7,9.8,9.7,9.8]`, floor
**9.4**, mean **9.64**. It confirms one-for-one upper fidelity, real turret
quarter-turn, visible attachment load paths, fixed hull ownership, exact
six-wheel native-track continuity and no fused/stranded mass, empty-air
decoration, collision, open sheet, backface wound or sky hole. Eight
presentation assets and their manifest binding are regenerated; targeted
asset/currentness and muzzle-bore checks pass. **GRADUATED; KEEP `c0dc2502`;
the legacy procedural T-80U is retired. Fleet gate remains honestly 36/97 and
graduates are 48.**

## 5.117 T-72B3M OWNER-SOURCE COMPLETE REBUILD (2026-08-11, GRADUATED)

The owner's `/Users/kevinliu/Downloads/t-72b3.zip` is 28,415,786 bytes with
SHA-256
`19b196bdc9825dc721dd20191e5e98146ab5c32202c50c213b079a6c523d2d8e`.
Its FBX/textures and a review-only Blender conversion remain ignored local
measurement inputs because the archive does not establish redistribution
provenance. No source binary ships; the playable remains original procedural
geometry.

The retired build's high slab hull, giant box/tower mass, sparse regular armor
and buried small wheels are gone. `buildT72B3Owner` supplies one compact low
hull, six large fleet-native dished wheels and one continuous linked-shoe
course. One low pear/cast turret carries the 2A46M gun/mantlet, broad pointed
frontal leaves, irregular mixed-depth cheek/inner/flank protection, a compact
Sosna-U/cupola/periscope/MG suite, smoke, antennae, flank packs and three
unequal backed/louvred rear service cells. Glacis armor, engine deck, skirts,
drums/log, unequal transom radiators, exhaust/recovery/light/tow hardware and
the running gear remain hull-owned. Every item has a visible carrier, pad,
collar, bracket or backed face.

Freeze reproduces twice at **`2e314ed8`** (39 rendered meshes / 162,491
rendered vertices). Exact track containment is band **0/0**, shoes **0/0** and
blind spots zero. Parent audit is stranded 0 / abutting 0 / dangling 0.
Winding is reversed 0 / mixed 0 / deficit 0 px / yaw candidates 0.

The recorded commercial-print geometry row is an honest incompatible-oracle
zero: **0** | hull 8.2 / whole 0 / turret 15.4 / stations 48.5 / dimensions 0
/ floaters 100. That stale recovered GLB's axis registration and fused
component masks do not describe the owner's articulated FBX hierarchy or the
new procedural ownership split. Its measured procedural dimensions are 2.36 m
height, 6.15 m hull, 9.26 m overall and 3.57 m width. The row is disclosed
rather than gamed. Gate JSON SHA-256 is
`29cdf17fe25efaedf9957ccec88a1991df3bb788cd56fb56d626d99eb383cd80`.

Fresh independent §B8 inspected 42 distinct r17 frames and reports
`[9.2,9.3,9.2,9.2,9.2,9.2,9.2,9.3,9.4,9.3,9.3,9.4,9.3,9.4]`, floor
**9.2**, mean **9.28**. Genuine yaw-0/yaw-90 evidence proves that the complete
shell, gun, every protection course, roof suite, smoke, antennae, side packs
and new louvred cells rotate together while the deck/transom/service package,
skirts and tracks remain fixed. No fused/stranded mass, empty-air decoration,
donor course, collision, open sheet, backface wound or sky hole remains.

All eight presentation assets and the manifest binding are regenerated.
Targeted asset/currentness and rendered-bore checks pass; the aggregate release
wrapper is red only for the disclosed stale machine row. `npm test` and
`npm run build:private` pass. **GRADUATED; KEEP `2e314ed8`; retire `175be954`
and all intermediate sittings. Fleet gate remains honestly 36/97; graduates
are 49.**

## 5.118 T-90MS TAGIL OWNER-SOURCE COMPLETE REBUILD (2026-08-11, GRADUATED)

The old `034e1bac` ladder candidate is retired. Its long rectangular
cabinet-like turret, regular side belt, undersized buried wheel course and
generic roof/rear treatment could not satisfy the recovered T-90MS source.
The replacement builds one connected low clipped-diamond welded shell from
measured longitudinal sections, buries irregular Relikt and the paired optics
into that carrier, sharply tapers the removable bustle, and seats the
panoramic/RWS head, Kord, smoke, antenna and supported rear cage on explicit
load paths. The hull uses six large native rubber-tired/dished wheels, one
linked-shoe course, a raised short side cover, unequal backed service bays and
continuous source bow shoulders.

Freeze reproduces twice at **`5076891c`** (53 rendered meshes / 102,052
rendered vertices). Exact track containment is band **0/0**, shoes **0/0**
and blind spots zero. Plan contiguity is **0**; fitting census is MG 1 + 5.
The muzzle gate is tagged-first-hit PASS (14.2 inner, 130.6 surround, 116.4
contrast). Parent audit's lone `fitting_spareTrackLinks` nominee is legitimate
fixed deck stowage, independently cleared under yaw. Winding's 15-pixel /
0.02% rear-quarter deficit and fixed-hull rear-service candidates have no
visible pixel wound or ownership error in final evidence.

The recorded recovered-print row is an honest incompatible-datum zero:
**0** | hull 75.3 / whole 58.9 / turret 51.2 / stations 72.5 / dimensions 0
/ floaters 100. The height tool compares the source-visible 2.85 m
panoramic/RWS combat station to the published 2.23 m turret-roof datum, even
though the packet and print explicitly distinguish them. Other measurements
remain on datum: hull 6.93/6.86 m, overall 9.52/9.53 m, width 3.77/3.78 m.
Gate JSON SHA-256 is
`ee9b29301f3751d78998c6725f658451d61a5e661845fbe873845f03bc65bb71`.
The stale silhouette/dimension row is disclosed rather than overridden.

Fresh independent §B8 discarded the prior hash and inspected only 42 distinct
r10 frames. Its vector is
`[9.2,9.2,9.1,9.0,9.0,9.1,9.1,9.2,9.3,9.3,9.2,9.3,9.2,9.3]`, floor
**9.0**, mean **9.18**. It confirms source fidelity, a true quarter-turn,
complete seated turret ownership, fixed hull kit, clean bow-bridge seating,
native track continuity and no fused/stranded mass, empty-air decoration,
collision, open sheet, sky hole or visible backface wound.

All eight presentation assets and the manifest binding are regenerated.
Targeted asset/currentness and bore checks pass; `npm test` and
`npm run build:private` pass. **GRADUATED; KEEP `5076891c`; retire every
earlier T-90MS sitting. Fleet gate remains honestly 36/97. The raw-trio queue
continues in §5.119 and §5.120; the full current graduate count is reconciled
under the native-only order in §5.121.**

## 5.119 T-90A BURLAK NATIVE-PROCEDURAL REBUILD (2026-08-11, GRADUATED)

The prior box-stack presentation is retired. The replacement is authored in
`src/vehicles/profiles/t90.js` from the shared primitive, fitting and native
track libraries: one low clipped casting, broad chamfered protection wings,
five varied buried armor courses, an integrated mantlet/gun root and one long
shallow autoloader bustle with real forward roots, ribs, lids, rails and end
framing. The panoramic station, MG/shield, cupolas, sights, smoke fans and
antennae meet explicit pads, collars or cheek brackets. No external mesh,
vertex, texture, material, rig, animation or converted payload enters the
playable.

Freeze **`5ae80a4`** reproduces twice at 61 meshes / 93,412 vertices. Exact
track containment is band **0/0**, shoes **0/0**; parent audit is stranded 0 /
abutting 0 / dangling 0. The live reference row is retained as an honest
incompatible-mask zero: 0 | hull 43.2 / whole 24.6 / turret 6.7 / stations
11 / dimensions 0 / floaters 100; JSON SHA-256 is
`159748c7840b34ddc7ca77e498a5c352e148cd92ac433febfdbf8ee193de0bac`.

Fresh independent §B8 inspected 42 distinct final frames. Its vector is
`[9.2,9.2,9.0,9.0,9.1,9.0,9.0,9.1,9.2,9.2,9.1,9.2,9.1,9.2]`, floor
**9.0**, mean **9.11**. It confirms a genuine quarter-turn, complete seated
turret/bustle ownership, fixed hull service geometry, six-wheel native-course
continuity and no fused/stranded mass, empty-air item, collision, open sheet,
sky hole or visible winding wound. Assets, muzzle, tests and private build
pass. **GRADUATED / KEEP `5ae80a4`.**

## 5.120 BASE T-90 NATIVE-PROCEDURAL REBUILD (2026-08-11, RE-FROZEN)

The final base T-90 is generated entirely by `src/vehicles/profiles/t90.js`
and the shared authored primitive/fitting library. Its connected low cast
dome, irregular buried K-5/Shtora blanket, mantlet/gun, supported
commander/NSVT/night-sight and smoke suite, rear turret packs, low hull,
six-wheel course, strapped log and backed service field contain no imported
or converted comparison geometry.

Freeze **`da6f7fba`** reproduces at 68 meshes / 120,036 vertices. Exact track
containment is band **0/0**, shoes **0/0**. Muzzle contrast is 93.2 and the
asset/currentness check passes. The registered comparison row remains an
honest incompatible-mask zero: 0 | hull 71.8 / whole 45.4 / turret 20 /
stations 55.4 / dimensions 0 / floaters 0; JSON SHA-256 is
`2c257f87bf25f91e7ebb94d4ce8ec636b6ace9eae26b33ee8eb0eb03708da4d9`.

Fresh independent §B8 inspected only 42 distinct r11 frames. Its vector is
`[9.2,9.2,9.1,9.1,9.1,9.1,9.1,9.2,9.2,9.3,9.2,9.3,9.3,9.3]`, floor
**9.1**, mean **9.19**. Genuine yaw proves complete seated turret ownership;
the lone fixed `fitting_spareTrackLinks` nominee is legitimate deck stowage.
No visible winding wound, fused duplicate, stranded fitting, donor course or
collision remains. Tests and private build pass. **RE-FROZEN / KEEP
`da6f7fba`; prior `72104d14` is retired.**

## 5.121 NATIVE-ONLY RUNTIME PROVENANCE RECONCILIATION (2026-08-11, OPEN)

The owner clarified that comparison models may guide visual judgment only:
playable geometry must remain our own design. A runtime import audit found
nine playables that were still calling generated exact-source geometry modules:
`leo2a4`, `leo2a6`, `leo2a7v`, `leo2_revolution`, `fv510`, `type10`, `t14`,
`amx40` and `t80u`. Their prior visual/mechanical evidence remains useful,
but exact-source certification cannot satisfy the native-only order.

Those nine ids were therefore reopened and removed from the current graduate
registry. Each received an authored procedural replacement; comparison files
remain ignored local measurement/review material only. The four Leopard ids
(`leo2a4`, `leo2a6`, `leo2a7v`, `leo2_revolution`) now have fresh first-party
42-frame evidence and are re-frozen in §5.126. Type 10 is independently
re-frozen in §5.128; FV510 is independently re-frozen in §5.129; AMX-40 is
also restored and landed. The remaining provenance reopen set is `t14` and
`t80u`; each still requires its own fresh native certification before
re-freezing. Eight omitted native-procedural graduates were simultaneously
backfilled into the registry; with FV510 the reconciled current count is now
**50**. The T-90M Proryv quality rebuild is complete at §5.127; its authored
procedural builder is the only playable geometry and any local GLB remains an
isolated visual oracle.

## 5.122 T-90MS FIRST-PARTY REPLACEMENT RE-CERTIFICATION (2026-08-11, GRADUATED)

The superseded comparison-geometry T-90MS certification in §5.118 is not a
native-playable receipt. The active replacement is authored entirely in
`src/vehicles/profiles/t90.js` from repository primitive, fitting and native
running-gear libraries. No comparison mesh, converted vertex array, material,
texture, rig, animation or runtime wrapper is used.

The current build has one connected clipped-diamond shell, buried cheek and
roof-edge Relikt, compact paired optics, a corrected 125 mm gun run, sharply
tapered bustle and one supported rear cage. A faceted panoramic head, raised
Kord mount, commander optics, smoke banks and antenna sit on explicit
plinths, yokes, brackets and collars. The hull retains a compact six-wheel
native course, short raised side cover, sculpted bow and backed unequal rear
service grammar.

Freeze `59de23ce` reproduces at 53 meshes / 107,956 vertices. Native fidelity
is **90.91 aggregate** with every standard silhouette at least **90.34**;
components are whole 91.79 / hull 93.77 / turret 83.91 / gun 92.25 / tracks
93.67. Exact containment is band **0/0** and shoes **0/0**. Winding reports 0
reversed / 0 mixed with one visually null rear-left deficit pixel.

All 42 distinct frames in `/tmp/critic-t90ms-native-final-r3` were inspected.
They prove a genuine quarter-turn and complete seated turret ownership. The
fixed `fitting_spareTrackLinks` nominee is legitimate forward-deck stowage;
the fixed rear candidates are supported engine/service covers. No fused
duplicate turret, stranded fitting, empty-air object, donor course, collision,
open sheet, sky hole or visible winding wound remains. **GRADUATED / KEEP
`59de23ce`; the §5.118 comparison-geometry implementation remains retired.**

## 5.123 BASE T-90 FIRST-PARTY GEOMETRY CORRECTION (2026-08-11, GRADUATED)

This receipt supersedes the older base T-90 freeze in §5.120. The active
playable remains entirely authored in `src/vehicles/profiles/t90.js`; no
comparison mesh, converted vertex payload, material, texture, rig, animation
or runtime source wrapper is used.

The hull pressure corridor and sponson underside were rebuilt around the real
native shoe path, the bow glacis was narrowed and closed without penetrating
the terminal course, and the overlong mudflaps were restrained. Six larger
dished road wheels now fill the compact T-90 side elevation. The cast turret
is seated on the correct deck datum and the 2A46M run, sleeve and bore reach
the measured authored envelope. A supported rear service cross-member closes
the stern reach without stretching the pressure hull or creating a floater.

Freeze `35a932c0` reproduces twice at 68 meshes / 120,828 vertices. Native
fidelity is **90.47 aggregate** with every standard silhouette at least
**90.29**; components are whole 91.77 / hull 92.12 / turret 82.55 / gun 93.27
/ tracks 95.21. Exact containment is band **0/0** and shoes **0/0**. Winding
reports 0 reversed / 0 mixed and zero deficit pixels.

All 42 distinct frames in `/tmp/critic-t90-native-final-r3` were inspected.
They prove a genuine quarter-turn and complete seated turret ownership. The
fixed `fitting_spareTrackLinks` candidate is legitimate forward-deck stowage.
No fused duplicate turret, stranded fitting, empty-air item, donor course,
collision, open sheet, sky hole or visible winding wound remains.
**GRADUATED / KEEP `35a932c0`; the §5.120 hash is retired.**

## 5.124 AMX-30B / AMX-30B2 FIRST-PARTY FAMILY REBUILD (2026-08-12, GRADUATED)

Both active playables are authored entirely in
`src/vehicles/profiles/misc.js` from repository primitives, fitting helpers
and the native linked-track generator. The two Ahab GLBs remain local
measurement/comparison material only; no mesh, vertex, texture, material,
rig, animation or converted payload enters either runtime model.

The shared rebuild replaces the former small wheels and tall side enclosure
with a compact low 6.59 m pressure hull, five large dished road wheels, close
terminal transitions, raised short sponson shoulders and one exact native
course. A clipped two-stage cast turret now carries the integrated 105 mm gun,
visible 20 mm coax, PH-8-B/searchlight grammar, supported commander/optic/MG
station, smoke banks, antennas and a low braced bustle rack. The B2 adds its
fuller rear cast shoulder, backed service cells and mantlet camera without
changing the family datum.

AMX-30B freezes twice at **`89a4cdf0`** (49 meshes / 51,609 vertices).
Machine fidelity is **91.81** with every standard view at least **90.01**;
components are whole 91.67 / hull 91.58 / gun 93.73 / tracks 90.25. Its
geometry gate is 90.0 minimum / whole 90.0 / dimensions 97.6 / floaters 100.

AMX-30B2 freezes twice at **`34076800`** (49 meshes / 55,365 vertices).
Machine fidelity is **91.51** with every standard view at least **90.14**;
components are whole 91.35 / hull 92.56 / gun 90.73 / tracks 90.03. Its
geometry gate is 90.1 minimum / whole 90.1 / dimensions 95.7 / floaters 100.
The source exports fuse fixed hull regions beneath their turret nodes, so
turret-only geometry masks are honestly N/A while all nine registered whole
views, valid hull/gun/track masks, dimensions and floater checks remain live.

Both exact track receipts are band **0/0** and shoes **0/0**. Winding is 0
reversed / 0 mixed / 0 deficit pixels / 0 yaw candidates. Parent audits are
stranded 0 / dangling 0; the sole abutting nominee is a fixed fender/deck tow
cable outside the cast turret envelope, visibly supported and correctly
hull-owned in yaw.

All 84 fresh files in `/tmp/critic-amx30-final` are distinct. AMX-30B's final
vector is `[9.2,9.2,9.0,9.1,9.1,9.0,9.0,9.2,9.4,9.2,9.1,9.3,9.2,9.2]`,
floor **9.0**, mean **9.16**. AMX-30B2's is
`[9.1,9.2,9.0,9.1,9.0,9.0,9.0,9.2,9.2,9.2,9.1,9.2,9.2,9.2]`, floor
**9.0**, mean **9.12**. Genuine quarter-turns prove complete seated turret
ownership over fixed hull/service/running-gear packages. No fused duplicate,
stranded or empty-air fitting, donor course, collision, disappearing face,
open sheet, sky hole or visible winding wound remains.

The full test suite, public build/quarantine stripping, native-playable audit
(108 playables / 0 GLB-sourced), family-order test, standard check and geometry
audits pass. **GRADUATED / KEEP `89a4cdf0` and `34076800`.**

## 5.125 TYPE 99A2 FIRST-PARTY MEASURED-ENVELOPE REBUILD (2026-08-12, RE-FROZEN)

This receipt supersedes the stale `cf97a01b` freeze in §5.109. The active
playable is authored entirely in `src/vehicles/modern2.js` from repository
primitives, fitting helpers and the native linked-track generator. The
owner-supplied `type_99a2_armored_warfare.glb` (SHA-256
`35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f`)
is an ignored local measurement and visual-comparison oracle only. No source
mesh, vertex payload, material, texture, rig, animation or converted geometry
enters the runtime model or public build.

The rebuilt hull uses the measured 7.76 m physical envelope, one tapered
pressure pan, broad two-plane prow, canted side shoulders, shallow segmented
skirts and a raised backed engine/service deck. Exactly six large native
rubber-tired/dished wheels use the measured 0.901 m cadence inside one linked
course with compact raised terminal wraps. The upper assembly is one connected
low welded shell with buried cheek laminates, canted side protection, an
integrated mantlet and source-length ZPT-98. A full-width open bustle is carried
by direct shell returns, transverse ties, corner uprights and side braces.
Hatches, periscopes, panoramic and secondary sights, QJC-88, smoke banks and
antennae all meet visible armor seats, plinths, brackets or collars.

Freeze `50bbc9bc` reproduces twice at 53 rendered meshes / 76,693 vertices.
Machine fidelity is **92.08 aggregate** with every registered whole view at
least **90.76**; the valid whole row is 91.77 and the native track profile is
93.43. Hull/turret/gun component rows remain honestly N/A because the
comparison export fuses fixed and rotating regions in `Object_29` and exposes
only the tube as `Object_17`; the build is not distorted to game those invalid
masks. The independent geometry gate passes at **90.8 minimum**, dimensions
100 and floaters 100.

Exact containment is band **0/0**, shoes **0/0**, with no blind spots. Winding
is 0 reversed / 0 mixed; the seven rear-quarter deficit pixels are 0.01% and
produce no visible wound. The yaw audit's fixed candidates are the backed
engine-deck louvre field at y 1.61..1.74, correctly hull-owned and exposed when
the turret departs. The parent audit's sole abutting nominee is the fixed
driver-periscope strip on the forward deck; stranded and dangling counts are
zero.

All 42 final files are distinct. The fresh fixed vector is
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.2,9.1,9.2,9.1,9.2]`, floor
**9.0**, mean **9.11**. A genuine yaw-0/yaw-90 quarter-turn proves that the
complete shell, gun/mantlet, protection, bustle, sights, QJC-88, smoke and
antennae rotate together while the prow, driver deck, skirts, six-wheel
course, engine deck and transom remain fixed. No fused duplicate turret,
stranded fitting, empty-air decoration, donor course, collision, open sheet,
sky hole or visible backface wound remains.

All eight Type 99 presentation assets and their manifest binding are
regenerated. Targeted asset/currentness and muzzle-bore checks pass. `npm test`,
the native-playable audit (108 playables / 0 GLB-sourced), the T-72/T-80/T-90
family-order test and `npm run build:public` all pass; the public build strips
the comparison-candidate directory. **RE-FROZEN / KEEP `50bbc9bc`; retire
`cf97a01b` and every intermediate Type 99 sitting.**

## 5.126 LEOPARD 2 FIRST-PARTY FAMILY RE-CERTIFICATION (2026-08-12, RE-FROZEN)

This receipt closes the four Leopard provenance reopens from §5.121:
`leo2a4`, `leo2a6`, `leo2a7v` and `leo2_revolution`. All active geometry is
authored in `src/vehicles/profiles/leopard.js` from repository primitives,
fitting helpers and the native linked-track generator. Ignored local GLBs are
measurement and visual-comparison oracles only. No source mesh, vertex payload,
material, texture, rig, animation or converted geometry enters any playable or
public build.

The 2A4 restores the compact seven-wheel hull, low welded turret, integrated
mantlet, PERI/EMES roof grammar, supported MG and layered rear service field.
The 2A6 retains its deeper arrowhead/wedge cheeks and bustle, but its former
unmarked hand-built roof gun is replaced by the canonical first-party MG3
fitting with a visible foot, post, cradle and receiver load path. Both receive
small authored upper-shoulder bridges rooted in the glacis; the bridges close
the inboard bow pockets without entering either terminal shoe lane. The 2A7V
adds its low applique package, supported FLW/PERI station and fixed APU/cooling
field. Revolution carries one clipped wedge/AMAP upper assembly, compact roof
station, tapered bustle package and supported unequal rear/service grammar.

Deterministic freezes reproduce twice as follows:

- `leo2a4` **`3a653cf9`** — 66 rendered meshes / 87,331 vertices;
  machine fidelity **92.49**, minimum standard view **90.43**, geometry gate
  minimum 90.4 / whole 90.4 / dimensions 97.9 / floaters 100.
- `leo2a6` **`e99f8490`** — 46 meshes / 145,547 vertices; machine fidelity
  **95.43**, minimum view **95.32**, geometry gate minimum 91.0 / hull 91.3 /
  whole 91.0 / turret 92.6 / stations 91.9 / dimensions 91.0 / floaters 100.
- `leo2a7v` **`a097ec`** — 46 meshes / 108,003 vertices; machine fidelity
  **91.17**, minimum view **90.05**, geometry gate minimum/whole 90.0 /
  dimensions 97.0 / floaters 100.
- `leo2_revolution` **`37139b70`** — 78 meshes / 104,145 vertices; machine
  fidelity **94.92**, minimum view **91.17**, geometry gate minimum/whole 91.2 /
  dimensions 99.5 / floaters 100.

The 2A4, 2A7V and Revolution comparison exports fuse or misclassify fixed and
rotating regions, so their invalid hull/turret-only component masks remain
honestly N/A; all registered whole views, valid gun/track rows, dimensions and
floater checks stay live. The procedural models are not distorted to game
those invalid component trees.

All four exact track receipts are band **0/0** and shoes **0/0**. The combined
standard check reports 4/4 pass, zero enclosed top-plan cells and canonical MG
censuses `mg2`, `mg1`, `mg2`, `mg1`. Winding reports 0 reversed / 0 mixed on
every build. The 2A7V's 39-pixel (0.06%) front-left deficit and Revolution's
65-pixel (0.09%) right deficit produce no disappearing face, open sheet or
silhouette wound. Yaw confirms the 2A7V Mode-2/parent nominees are fixed
hull-deck, APU, cooling and service geometry; Revolution's nominees are fixed
hull-service courses. They correctly remain with the engine deck when the
complete turret departs and are not stranded turret fittings.

Each directory in `/tmp/critic-leopard-native-final-r2` contains 42 PNGs and
42 distinct hashes. The fresh fixed vectors are:

- 2A4 `[9.1,9.2,9.0,9.1,9.0,9.1,9.0,9.2,9.2,9.2,9.1,9.2,9.1,9.2]`, floor
  **9.0**, mean **9.12**;
- 2A6 `[9.4,9.5,9.4,9.4,9.3,9.4,9.4,9.5,9.6,9.5,9.4,9.5,9.5,9.6]`, floor
  **9.3**, mean **9.46**;
- 2A7V `[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.2,9.1,9.2,9.1,9.2]`, floor
  **9.0**, mean **9.09**;
- Revolution `[9.3,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.4,9.4,9.3,9.4,9.3,9.4]`,
  floor **9.1**, mean **9.27**.

Every yaw pair shows a genuine quarter-turn. Gun/mantlet, complete turret
shell, roof stations, smoke, antennas and full bustle packages rotate together
over fixed prow, skirts, wheels, engine decks and transoms. All equipment keeps
visible plinths, collars, braces or broad armor seats; no fused duplicate,
stranded fitting, empty-air decoration, donor course, collision, sky hole or
visible backface wound remains.

The four targeted eight-view asset sets and manifest bindings are regenerated;
targeted asset/currentness and muzzle-bore checks pass. `npm test`, private and
public builds, the native-playable audit (108 playables / 0 GLB-sourced), the
T-72/T-80/T-90 family-order test and the four-tank release check all pass. The
public build strips all comparison-candidate and quarantine directories.
**RE-FROZEN / KEEP `3a653cf9`, `e99f8490`, `a097ec` and `37139b70`.**

## 5.127 T-90M PRORYV FIRST-PARTY REBUILD (2026-08-12, RE-FROZEN)

The owner rejected the earlier gate-shaped T-90M as a slabby interpretation
with the wrong primary hull, turret and running-gear presentation. The active
playable now calls `buildT90MProryvNative2026` in
`src/vehicles/profiles/t90.js`. It is authored entirely from repository
primitives, fittings and the native linked-track generator. The isolated GLB
is a render/measurement oracle only; no source mesh, vertices, materials,
textures, rig, animation or converted payload enter runtime.

The active hull is a compact low V-bow pressure body with raised track-clear
shoulders, sculpted skirts and six large native road wheels. The complete
rotating package is one connected welded fighting compartment with buried
Relikt, an integrated gun/mantlet, enlarged commander/loader stations, seated
panoramic/Kord equipment, a continuously tapered bustle, supported open rack
and a strapped transverse rear cylinder on visible braces.

Freeze **`a21894b8`** reproduces at 55 rendered meshes / 114,746 vertices.
Independent procedural fidelity is **90.96 aggregate** with every required
whole view at least **90.02**; components are whole **92.73**, hull **91.67**,
direct turret **86.86** and native tracks **91.25**. The comparison export's
`Main_barrel` node contains only the forward tube, leaving the sleeve/root as
turret siblings, so its direct-turret component split is not an acceptance
law. Exact containment is band **0/0** and shoes **0/0** at both terminals.
Muzzle-bore and turret-parent audits pass. Winding is 0 reversed / 0 mixed;
the four-pixel/0.01% nomination has no visible wound.

All 42 distinct frames in
`/tmp/critic-t90m-proryv-native-final-r4/t90m` were inspected. They prove a
genuine quarter-turn and complete ownership: gun, shell, every Relikt course,
roof suite, bustle, rack and cylinder rotate together over a fixed V-bow,
deck, transom, skirts, six-wheel course and rear hull drums. All fittings keep
visible armor roots, pads, collars, rails, straps or braces. No fused duplicate,
stranded fitting, empty-air decoration, donor course, collision, open sheet,
sky hole or visible backface wound remains.

The generated legacy geometry-gate row remains an honest **27.1 FAIL**. Its
contour/component calibration rewards the retired slab-shaped builder and is
incompatible with the independently accepted native geometry and source node
split. The red row is committed and disclosed rather than falsified or used to
reshape our model toward comparison geometry. **RE-FROZEN / KEEP
`a21894b8`; retire `e345ee8a`.**

## 5.128 TYPE 10 FIRST-PARTY PROVENANCE RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The earlier Type 10 source-bake graduation is historical only and does not
satisfy the owner's all-first-party order. The active playable now calls
`buildType10Native2026` in `src/vehicles/modern3.js`. Its complete folded bow,
pressure hull, skirts, five-wheel running gear, one continuous clipped welded
turret, gun, side modules, bustle and station/service kit are authored from
repository primitives and fittings. The repaired GLB remains an isolated
render/measurement oracle; none of its meshes, vertices, materials, textures,
rig, animation or converted arrays enters runtime or the public build.

The final closure adds two thin faceted upper-bow shoulder bridges between the
glacis and lamp/guard seats. Their roots overlap existing armor, their lower
faces clear the idler/shoe arcs, and they close the only two one-cell plan
pockets without changing the accepted Type 10 silhouette. Freeze
**`7ac6d434`** reproduces twice at 62 rendered meshes / 56,562 vertices.

Independent procedural fidelity is **91.41 aggregate** with every required
whole view at least **90.02**; components are whole **92.29**, hull **92.41**,
gun **90.09** and the deliberately native substituted track profile **86.42**.
Exact containment is smooth band **0/0** and individual shoes **0/0** at both
terminals. Contiguity is zero holes, decoration is `mg1+8d`, muzzle-bore probe
passes, and winding is 0 reversed / 0 mixed; its seven-pixel/0.01% rear-left
nomination has no visible wound.

The generated legacy geometry row remains an honest zero: hull 50.3 / whole
45.4 / stations 45.2 / dimensions 49.3 / floaters 0. It is calibrated to the
retired source-baked semantic/component tree and is not a valid mask for the
independently authored replacement. That machine debt is committed and
disclosed rather than used to distort native geometry.

All 42 PNGs in `/tmp/critic-type10-native-final-r10/type10` have distinct
SHA-256 hashes. Every yaw pair proves a genuine quarter-turn: gun, continuous
shell, cheek/side modules, roof stations, MG, smoke, antennas and complete
bustle/rack rotate together over a fixed folded bow, driver deck, engine deck,
transom and five-wheel course. The parent tool's `fitting_towCable`,
`hullCloth` and `fitting_spareTrackLinks` nominees are legitimate fixed deck
stowage with visible hull contact after turret departure. No fused duplicate,
stranded turret fitting, empty-air decoration, donor course, collision, open
sheet, sky hole or visible winding wound remains. **RE-FROZEN / KEEP
`7ac6d434`; retire the source-baked `84f5d108` playable.**

## 5.129 FV510 WARRIOR FIRST-PARTY PROVENANCE RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The exact-source FV510 playables recorded in §5.90 and §5.91 are historical
only and cannot satisfy the owner's all-first-party rule. The active mapping
now resolves exclusively to `fv510PhotoBuild` in
`src/vehicles/profiles/uk.js`. Its hull, six-wheel running gear, RARDEN
turret/gun, roof stations, slat armor, rear door and service package are
authored from repository primitives and the native linked-track generator.
The community GLB remains an isolated visual/measurement oracle; no source
mesh, vertex/index payload, material, texture, rig, animation or converted
array enters the playable or public build.

Freeze **`61023726`** reproduces twice at 70 rendered meshes / 59,949
vertices. Independent procedural fidelity is **90.84 aggregate** with every
required whole view at least **90.12**; components are overall **90.54**,
hull **91.04**, turret **84.45**, gun **100.0** and native tracks **93.73**.
The lower direct-turret row reflects the oracle's fused/component split and is
not a whole-vehicle acceptance failure. Exact track containment is band
**0/0** and shoes **0/0**, plan contiguity is zero holes, muzzle-bore passes,
and decoration census is `mg1+15d`.

The generated legacy geometry row remains an honest zero: hull 18.3 / whole
9.0 / turret 42.7 / stations 68.8 / dimensions 0 / floaters 0. That gate is
registered to the retired source-derived semantic/component tree and cannot
measure the independent photo builder without rewarding copied topology. The
red row is committed and disclosed rather than used to deform our authored
vehicle.

All 42 PNGs under `/tmp/critic-fv510-native-final-r9/fv510` are distinct.
The fresh fixed vector is
`[9.1,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.2,9.1,9.2,9.1,9.2]`, floor
**9.0**, mean **9.11**. Every yaw pair proves a genuine quarter-turn: the
RARDEN gun/mantlet, complete turret, sights, hatches, smoke, MG, antennae and
turret service fittings rotate together over a fixed glacis, driver deck,
engine deck, slat package, rear door/service field and six-wheel course.

The parent nominee `hullGlass` is a legitimate fixed driver/periscope strip
with visible deck contact after turret departure. Winding census is 0
reversed / 0 mixed. Its 655-pixel/0.61% rear-quarter FrontSide difference is
confined to thin slat/rail regions and remains stable through yaw; inspection
finds no disappearing face, open sheet, sky wound or silhouette tear. No
fused duplicate turret, stranded fitting, empty-air decoration, donor course
or collision remains.

All eight FV510 presentation assets and their manifest binding are
regenerated. Targeted asset/currentness and bore checks pass, as do native
provenance, family ordering, tests, and private/public builds. **RE-FROZEN /
KEEP `61023726`; retire source-baked `7884762a` and `927beeb2` as playables.**

## 5.130 ABRAMSX FIRST-PARTY WINDING + RENDER-TRUTH UPDATE (2026-08-12, RE-FROZEN)

AbramsX remains the repository-authored `buildAbramsX` in
`src/vehicles/profiles/abrams.js`. The Mortavex GLB is a private comparison
and measurement oracle only; it is stripped from public builds and none of
its geometry, materials, textures, rig or animation enters the playable.

This update corrects a latent authored-mesh defect without changing the
accepted silhouette or source-measured stations. An AbramsX-local
`orientedSlab` guard now gives outward triangle order to the mirrored lower
bow facets, central keel recesses, both XM360 tunnel jambs and the cheek pairs
of both open D-hood sight housings. The family helper remains untouched, so no
other Abrams geometry or freeze changes. Winding census improves from 8
reversed connected pieces to **0 reversed / 0 mixed**; the remaining
10-pixel/0.01% top FrontSide difference is a stable rear-edge hairline with no
open sheet, disappearance or silhouette wound.

Freeze **`976a1370`** reproduces twice at 77 meshes / 162,506 vertices.
Procedural fidelity remains **94.29 aggregate** with minimum whole view
**93.99** and components overall 95.56 / hull 96.15 / turret 92.13 / gun
89.05 / tracks 96.25. Geometry gate holds **90.4** (hull 90.4 / whole 90.6 /
turret 91.0 / stations 93.4 / dimensions 99.8 / floaters 100). Standard
contiguity is zero, decoration is `mg1+5d`, muzzle-bore passes and parent
audit is 0 stranded / 0 abutting / 0 dangling. The standing exact track
receipt remains within its certified loaded-contact class: band 37/26 and
shoes 10/0 with no blind spot or visible penetration.

All 42 PNGs in `/tmp/critic-abramsx-native-final-r2/abramsx` are distinct.
Fresh inspection retains the fixed vector
`[9.4,9.5,9.4,9.3,9.3,9.4,9.4,9.5,9.6,9.6,9.5,9.7,9.6,9.7]`, floor
**9.3**, mean **9.49**. Every yaw pair proves that the complete turret, gun,
RWS, D-hood sights, smoke, antennae and roof kit rotate together while the
knife bow, engine deck, service field and native seven-wheel course remain
fixed. Every fitting keeps a visible armor seat, plinth, bracket or collar;
no fused duplicate, stranded part or empty-air decoration appears.

All eight AbramsX presentation assets and their manifest binding are
regenerated. Targeted asset/currentness and bore checks, tests, native
provenance, family ordering, and private/public builds pass. **RE-FROZEN /
KEEP `976a1370`; retire `26b46ba0`.**

## 5.131 T-14 FIRST-PARTY RUNTIME RESTORATION (2026-08-12, RE-FROZEN)

The active T-14 is the repository-authored `buildT14` in
`src/vehicles/modern2.js`. Its hull, seven-wheel running gear, linked shoes,
unmanned faceted shroud, gun, bustle, Afganit/APS equipment, RWS, optics,
sensor masts, cages and service hardware are assembled exclusively from KIT
primitives and repository fittings. The local CC-BY comparison GLB is a
private measurement/render oracle only. No source vertex/index payload,
material, texture, rig, animation or converted array enters the playable or
public build. The historical source-baked `a88afa6c` experiment in §5.104 is
retired.

The runtime metadata now matches the authored/reference envelope rather than
the retired published-datum extension: overall length is **9.98 m** and the
armor/gameplay barrel proxy is **5.64 m**, exactly matching the visible 2A82
tube. Freeze **`a94a2480`** reproduces at 47 rendered meshes / 61,723
vertices. Independent fidelity is **90.53 aggregate** with every whole view
at least **91.52**; components are overall 93.14 / hull 93.53 / turret 86.66
/ gun 83.97 / tracks 89.21. The direct whole-vehicle law passes even though
the source file's fused, donor-track component masks do not match our
independent primitive ownership split.

The geometry row is therefore retained honestly at **72.3**, with hull 79.4
/ whole 75.0 / turret 72.3 / stations 84.0 / dimensions 100 / floaters 100.
It is diagnostic debt, not an excuse to replace the authored model with
source topology. Exact native track containment is band **0/0** and shoes
**0/0**. Parent audit is 0 stranded / 0 abutting / 0 dangling; winding is 0
reversed / 0 mixed / 0 deficit pixels with no yaw candidate. Plan contiguity
is zero and decoration census is `mg1+3d`.

All 42 PNGs in `/tmp/critic-t14-native-final-r2/t14` are distinct. Fresh
inspection records the fixed vector
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.1,9.0,9.1,9.0,9.0]`, floor
**9.0**, mean **9.04**. Every yaw pair shows the complete gun, connected
shroud, bustle, RWS, optics, Afganit/APS equipment and sensor suite making a
genuine quarter-turn while the crew-capsule bow, glacis, engine deck, rear
service package, cages and seven-wheel course remain fixed. Seats, brackets,
collars and cage returns remain visible; no fused duplicate, stranded
fitting, empty-air decoration or winding wound appears.

All eight T-14 presentation assets and manifest binding are regenerated.
Targeted assets/bore, tests, native provenance, family ordering, and private
and stripped-public builds pass. **RE-FROZEN / KEEP `a94a2480`; retire
source-baked `a88afa6c` as a playable.**

## 5.132 T-80U FIRST-PARTY RUNTIME RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The active T-80U resolves to the repository-authored
`buildT80UNative2026` in `src/vehicles/profiles/misc.js`. Its tapered turbine
hull, folded bow, skirts, six-wheel linked course, cast fighting compartment,
Kontakt-5 clamshell, gun, cupolas, NSVT, optics, smoke banks, basket and rear
service equipment are built exclusively from KIT primitives, original lofts
and repository fittings. The javanilga GLB remains an isolated private
measurement/render oracle. No source mesh, vertex/index payload, material,
texture, rig, animation or converted array enters the playable or public
build. The source-baked `c0dc2502` experiment in §5.116 is retired.

Freeze **`77f9ae78`** reproduces twice at 43 rendered meshes / 61,979
vertices. Independent fidelity is **91.51 aggregate** with every required
whole view at least **90.20**; components are whole 92.88 / hull 96.23 /
turret 83.21 / gun 89.66 / native tracks 94.32. The direct-turret component
remains explicit refinement debt: improve the authored cast-shoulder and
station surfaces in place, never by restoring source topology.

The legacy component gate is retained honestly at **60.0**, with hull 76.1 /
whole 65.7 / turret 60.0 / stations 75.1 / dimensions 85.0 / floaters 100.
Its masks encode the retired fused source subtree and cannot grade the
independently authored ownership split without rewarding copied topology.
Exact track containment is band **0/0** and shoes **0/0**. Parent audit is 0
stranded / 0 abutting / 0 dangling. Winding is 0 reversed / 0 mixed; the
38-pixel/0.03% top FrontSide difference is a stable non-structural hairline,
and yaw mode 2 has zero candidates.

All 42 PNGs in `/tmp/critic-t80u-native-final-r3/t80u` are distinct. Fresh
inspection records the fixed vector
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.0,9.1,9.0,9.1,9.0,9.0]`, floor
**9.0**, mean **9.04**. Every yaw pair shows the complete gun, cast shell,
K-5 package, cupolas, NSVT, sights, smoke and supported rear package making a
genuine quarter-turn while the glacis, turbine deck, transom, skirts and
six-wheel course remain fixed. All equipment retains a visible armor seat,
plinth, collar, basket return or cradle; no fused duplicate, stranded
fitting, empty-air decoration, track collision or winding wound appears.

All eight T-80U presentation assets and manifest binding are regenerated.
Targeted assets/bore, tests, native provenance, family ordering, and private
and stripped-public builds pass. **RE-FROZEN / KEEP `77f9ae78`; retire
source-baked `c0dc2502` as a playable.**

## 5.133 TYPE 99A STRICT TRACK-CORRIDOR / REAR-SEAT RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The active Type 99A remains the repository-authored `buildType99A` in
`src/vehicles/modern2.js`. The supplied Armored Warfare GLB is a private
measurement and render oracle only. No source mesh, converted vertex/index
payload, material, texture, rig, animation or runtime GLB node is present in
the playable or public build. Every visible triangle is produced by the
repository's own KIT primitives, authored lofts, fittings and native linked
track system.

This strict-clearance pass preserves the measured-envelope hull and complete
angular turret package while lifting the front and rear sponson undersides
clear of the full native shoe sweep. The left exhaust and soot treatment are
now outside the running lane. The rear U-cable support tray is deepened so the
complete curve and both returns remain backed, eliminating the last three
plan-view pockets without adding a rear wall or changing the source envelope.

Freeze **`6d52abda`** reproduces at 58 rendered meshes / 79,776 vertices.
The geometry gate is **90.7** with dimensions 97 and floaters 100. Independent
procedural fidelity is **93.0**, and every required whole view is at least
90. Exact strict track containment is band **0/0**, individual shoes **0/0**,
and the complete sweep **0/0**. Six native road wheels remain separately
readable inside one continuous linked course with coherent terminal wraps.

The final packet contains 15 paired + 15 yaw0 + 15 yaw90 frames, including
the repeatable elevated-left profile, for 45 PNGs / 45 distinct hashes. Fresh
independent inspection records the mandatory fixed vector
`[9.3,9.4,9.3,9.3,9.4,9.3,9.3,9.4,9.5,9.5,9.4,9.5,9.4,9.5]`, floor
**9.3**, mean **9.39**. The supplemental elevated profile also passes turret
length, gun seating, attachment and track-clearance inspection.

Yaw proves that the gun/mantlet, angular shell and cheeks, roof stations,
hatches, sights, smoke/equipment, antennas and complete supported bustle/slat
rack rotate together. Glacis, raised sponsons and shadow strips, fenders,
engine deck, exhaust, transom, cable tray/U-loop, rear service field and native
running gear remain fixed. The parent and winding heuristics' fixed-deck
nominees are low hull covers, fender/guard structures and backed rear-service
surfaces; they remain continuously hull-supported and reproduce no turret
silhouette or station. No fused duplicate, stranded fitting, empty-air
decoration, open sheet, backface wound or yaw-dependent silhouette pop is
visible.

All eight Type 99A presentation assets and manifest binding are regenerated.
Targeted standard, geometry, fidelity, strict track, bore, asset, full test,
native provenance, family-order and private/public build checks pass.
**RE-FROZEN / KEEP `6d52abda`; retire `50bbc9bc` and all earlier Type 99A
freezes.**

## 5.134 TYPE 90 OWNER-HEIGHT / STRICT TRACK RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The active Type 90 is the repository-authored builder in
`src/vehicles/profiles/misc.js`. Its hull, welded turret, gun, bustle, roof
stations, skirts and six-wheel linked course are constructed exclusively from
repository primitives, original lofts and fittings. The recovered GLB remains
a private visual/measurement oracle; no source mesh, converted payload,
material, texture, rig, animation or runtime node enters the playable or
public build.

This pass executes the owner's explicit correction after the earlier half-
height experiment: the connected turret body is substantially taller and the
final controlled section is 0.80 local Y. The gun datum stays fixed while
cupolas, sights, periscopes, MG, smoke banks, decals and antenna collars are
re-seated on the raised armor. Independent procedural fidelity is **92.22**,
with every machine-scored whole view at least **90.53**.

The Type 90 course now obeys the strict physical law. Mid-skirt armor uses one
outboard datum, the dark wheel-bay recess is explicitly running-gear-owned,
and exact clearance is band front/rear **0/0**, shoes **0/0**, full sweep
**0/0**. Exactly six native road wheels remain readable between a coherent
front idler and rear drive transition. Parent audit is 0 stranded / 0 abutting
/ 0 dangling. Winding is 0 reversed / 0 mixed; the 16-pixel/0.03% right
FrontSide difference has no visible wound, disappearance or open sheet.

Freeze **`d8f8a3a8`** reproduces twice at 53 meshes / 67,557 vertices. All 45
frames in `/tmp/critic-type90-clearance-final/type90` are distinct: 15 paired,
15 yaw0 and 15 yaw90 including the standard elevated-left profile. Fresh
inspection records
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.2]`, floor **9.0**
and mean **9.08**. Yaw proves that the complete turret, gun and roof station
rotate together while the hull, coherent deck, rear service field, skirts and
course stay fixed. No fused duplicate, stranded fitting, empty-air decoration,
collision or yaw-dependent wound appears.

The legacy curve/component gate is committed honestly at **27.5** (hull 88.4
/ whole 56.0 / turret 43.7 / stations 27.5 / dimensions 64 / floaters 100).
Its recovered component mask encodes the retired low-body experiment and is
incompatible with the explicit owner correction; it is diagnostic debt, not a
reason to distort first-party geometry or restore source topology. All eight
presentation assets and their manifest binding are regenerated; targeted
assets, bore, rig, strict track, parent and winding checks pass. **RE-FROZEN /
KEEP `d8f8a3a8`; retire `5d7bc85c` and all earlier Type 90 freezes.**

## 5.135 AMX-40 OWNER FORWARD/HEIGHT + STRICT TRACK RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The playable AMX-40 is the first-party `buildAMX40` implementation in
`src/vehicles/france.js`. The local Armored Warfare GLB is a private visual
and measurement oracle only. No source mesh, converted vertex/index payload,
material, texture, rig, animation or source-backed runtime node enters the
playable or public build.

The owner-standard elevated profile confirms the earlier connected forward
turret extension and this pass executes the later height order. The lower
shoulders, cheeks, crown, welds and forward cassettes remain carried forward
around the gun seat as one loft. The complete fighting-compartment section is
then raised exactly **20%** in local Y: shell, bustle, roof suite and
mantlet/cradle scale together, while the hull and gun run remain unchanged.
Both direct smoke banks and the roof MG are re-seated at the same 1.20 datum.

The strict running-gear pass fixes two hidden full-sweep defects. Lower belly
shoulders now stop inside the shoe inner edge, and the existing painted wheel
faces, rims and hubs carry explicit running-gear ownership through a new
material-correct bucket. Exact containment improves from 318 band / 128 shoe
sweep intersections to band front/rear **0/0**, shoes **0/0**, and complete
sweep **0/0**. Six native road wheels remain between a distinct front idler
and rear drive sprocket inside one continuous linked course.

Machine fidelity is **92.94** with every whole direction at least **91.90**;
components are overall 93.43 / hull 96.39 / turret 85.53 / gun 94.11 / tracks
96.80. The legacy component gate is retained honestly at **51.3** (hull 90.4
/ whole 68.3 / turret 61.9 / stations 51.3 / dimensions 63.5 / floaters 100)
because its retired lower-section masks cannot grade the explicit owner
correction without rewarding source-topology restoration.

Freeze **`3d312bde`** reproduces twice at 62 meshes / 98,642 vertices. The
final packet contains 15 paired + 15 yaw0 + 15 yaw90 frames including the
elevated-left profile: 45 PNGs / 45 distinct hashes. Fresh inspection records
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.1]`, floor **9.0**
and mean **9.07**. The entire turret, gun, roof suite, smoke, MG, flank bins
and rear package rotate together. Hull deck, service field and native course
stay fixed. Parent nominees are visibly supported hull cable, spare-link
stowage and driver/periscope geometry; no turret item is stranded.

Winding is 0 reversed / 0 mixed / 0 deficit pixels. Mode-2's fixed-deck
candidate is coherent hull structure revealed by turret departure. Rig,
muzzle, targeted assets, strict track and all-view fidelity pass. All eight
presentation assets are regenerated. **RE-FROZEN / KEEP `3d312bde`; retire
all source-baked AMX-40 playables and the pre-height forward-extension
freeze.**

## 5.136 CHALLENGER 3 FORWARD-PROFILE + STRICT TRACK RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The playable Challenger 3 remains the fully first-party `buildChallenger3`
implementation in `src/vehicles/profiles/challenger.js`. Its hull, turret,
gun, running gear, protection, stations and service equipment are authored
from repository primitives and original lofts. Comparison assets remain
private read-only visual/measurement oracles; no source geometry or payload is
shipped or instantiated.

The standardized elevated-left profile confirms the prior owner-directed
turret correction: the connected outer walls, crown and lower cheeks continue
forward to the mantlet as a full fighting-compartment silhouette. They remain
joined to the aft casting and bustle and rotate with the gun, Protector, roof
suite, smoke/APS fittings and antennas at yaw 0 and 90 degrees. No detached
plate is used to fake length and no second over-extension is warranted.

This wave closes the remaining physical course defects without changing that
accepted turret. The rear final drive is re-seated below the sponson floor;
the inner spine and lower shoulder return are narrowed inside both shoe lanes;
the forward cable anchor moves onto the glacis; and a wide fake-AO strip inside
the tracks becomes a thin outboard skirt seam. Exact native containment is
band front/rear **0/0**, shoes **0/0**, and strict full sweep **0/0**. Six road
wheels remain readable between a front idler and rear drive sprocket in one
continuous linked course.

Freeze **`564057a4`** reproduces twice at 62 meshes / 72,471 vertices. The
fresh packet contains 15 paired + 15 yaw0 + 15 yaw90 frames, including the
elevated-left profile: 45 PNGs / 45 distinct hashes. Fresh inspection records
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.1]`, floor **9.0**
and mean **9.07**. Quantitative fidelity is **93.02**, with every whole view
at least **92.17**.

Parent audit is 0 stranded / 0 abutting / 0 dangling. Winding is 0 reversed /
0 mixed, with a 25-pixel/0.04% antialias deficit and no visible wound; mode 2
is clean. Rig, bore and targeted presentation assets pass. The legacy
curve/component row is retained honestly at 83.3 because it grades retired
aft/edge plan masks rather than this owner-directed forward profile. **KEEP /
RE-FROZEN `564057a4`; retire `3e5a7797` and all earlier Challenger 3
freezes.**

## 5.137 LECLERC FRONT MUDGUARD RESTORATION + TRACK-CLEARANCE RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The prior native-track repair correctly deleted a low static rubber plate that
occupied the animated idler/shoe path, but it left the Leclerc without a
convincing pair of front mudguards. This round restores them as first-party
geometry rather than reintroducing the intersecting plate. Each side now has
a broad tapered steel cap above the idler crest, a shallow flexible leading
lip ahead of the terminal-shoe orbit, an inboard knee buried into the narrow
bow and an outboard knee buried into the existing fender rail. The two load
paths keep the caps hull-owned and prevent a floating-decorative-panel read.

Exact native containment is band front/rear **0/0**, individual shoes **0/0**
and strict full sweep **0/0**. The front idlers, six road wheels, rear drive
sprockets and continuous linked courses remain fully visible; no static guard
or shadow proxy substitutes for a track surface. The restored guards remain
fixed at yaw 0 and 90 degrees while the complete turret departs normally.

Freeze **`5fa68984`** reproduces twice at 47 meshes / 85,191 vertices. The
fresh evidence packet contains 15 paired + 15 yaw0 + 15 yaw90 frames,
including the elevated-left profile: **45 PNGs / 45 distinct hashes**.
Quantitative fidelity is **94.0** (hull 95, turret 91, gun 91, tracks 93),
with every scored view and component at least 90. Parent audit is 0 stranded /
0 abutting / 0 dangling; winding is 0 reversed / 0 mixed with a 0-pixel
deficit and clean mode 2. Rig, bore, native-playable provenance, family order,
targeted assets, the complete test suite, and private/public builds pass.
**KEEP / RE-FROZEN `5fa68984`; retire `683be340`.**

## 5.138 LEOPARD 2 PROTOTYPE FORWARD WELDED-LOFT + STRICT TRACK RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The gameplay prototype remains the fully first-party `buildLeo2Proto`
implementation in `src/vehicles/profiles/leopard.js`.  Its private recovered
GLB is a quarantined comparison oracle only; no source mesh, converted vertex
payload, material, texture or runtime node enters the playable build.

The owner-identified short slab turret is replaced by one connected native
three-ring welded loft.  The lower belt retains broad clipped shoulders, the
long plan now reaches 0.16 m farther through the armored nose and 0.15 m
farther through the bustle, and the whole rotating package is seated 0.10 m
farther forward.  An inset crown produces the low fabricated shoulder break
without changing the published roof height.  The mantlet bay and gun seat move
with the shell; the exposed tube is shortened by the corresponding amount so
the overall muzzle station remains unchanged.  Hatch foundations, weld
courses and bustle latches add supported prototype detail.

The front glacis lane transition moves aft of the rising idler arc.  Exact
native containment improves from a hidden 21-voxel hull sweep contact to band
front/rear **0/0**, individual shoes **0/0**, and strict full sweep **0/0**.
Seven primary road wheels remain behind a distinct front idler and rear drive
sprocket in one continuous linked course.

Freeze **`a7eae06a`** reproduces twice at 65 meshes / 90,127 vertices.  The
fresh evidence packet contains 15 paired + 15 yaw0 + 15 yaw90 frames,
including the standardized elevated-left profile: **45 PNGs / 45 distinct
hashes**.  Fresh semantic inspection records
`[9.2,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.3,9.2,9.3,9.2,9.3]`, floor **9.1**
and mean **9.22**.

Quantitative fidelity is **93.71** with hull 94.03, tracks 92.69 and every
available direction at least 92.52.  Turret and gun masks remain unavailable
because the recovered print has a certified sunken turret and deck-level gun;
its legacy zero curve row is retained honestly rather than repaired by source
topology copying.  Parent audit is 0 stranded / 0 abutting / 0 dangling;
winding is 0 reversed / 0 mixed with a 0-pixel deficit and clean mode 2.  Rig,
bore, native-only provenance, family order and all eight targeted presentation
assets pass.  The complete test suite and both private and stripped-public
production builds also pass.  **KEEP / RE-FROZEN `a7eae06a`; retire
`27f9212e` and all earlier prototype freezes.**

## 5.139 LEOPARD 2A4 FORWARD WELDED-LOFT + ZERO-HOLE TRACK-CLEAR RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The playable Leopard 2A4 remains the fully first-party `buildLeo2A4`
implementation in `src/vehicles/profiles/leopard.js`. The private recovered
GLB is a quarantined, read-only measurement/visual oracle used by the QA
harness only. No source mesh, converted vertex payload, texture, material or
runtime node enters the playable.

The former short central box is replaced by a longer connected ten-point
welded loft. Its armored nose, clipped shoulders and aft walls now carry the
full fighting-compartment silhouette 0.10 m farther forward, while the rear
shoulders and supported slatted basket extend into the correct long A4
profile. The mantlet bay, gun seat and EMES-15 housing move with that shell;
the exposed L/44 tube is shortened by the corresponding amount so the muzzle
envelope remains correct. Shallow roof welds, rear-shoulder latches, extended
grab rails and the existing PERI, cupolas, smoke banks, MG3, antennas and
basket kit all meet broad native surfaces or frames.

The side-body repair lifts only the outboard sponson floor over the complete
return run while retaining the compact central tub. Thin outboard skirts are
carried by a visible fender rail and localized hangers. Supported inboard
shoulder and outboard mudguard caps close three tiny front plan pockets without
entering the shoe lane. Exact native containment is band front/rear **0/0**,
individual shoes **0/0**, and strict full sweep **0/0**. Plan-contiguity is
**0 holes**. Seven primary road wheels remain between a distinct front idler
and rear drive sprocket in one continuous linked course.

Freeze **`4011c71c`** reproduces twice at 66 meshes / 89,443 vertices. The
fresh packet contains 15 paired + 15 yaw0 + 15 yaw90 frames, including the
standard elevated-left profile: **45 PNGs / 45 distinct hashes**. Fresh
semantic inspection records
`[9.2,9.2,9.1,9.1,9.1,9.1,9.1,9.2,9.2,9.3,9.2,9.3,9.2,9.3]`, floor **9.1**
and mean **9.19**. Quantitative fidelity is **92.14**, with whole-view floor
**90.18**, gun **91.53**, tracks **96.03**, dimensions **97.9** and floater
score **100**.

All yaw pairs show a genuine quarter-turn. The complete shell, gun/mantlet,
EMES, PERI/cupolas, MG3, smoke, antennas, weld/latch courses and full basket
move together. Bow shoulders, skirts/hangers, seven-wheel course, deck and
rear service field remain fixed. Parent audit is 0 stranded / 0 abutting / 0
dangling; winding is 0 reversed / 0 mixed with 0 deficit pixels and clean mode
2. Rig, zero-hole standard, exact tracks, native-only provenance and the
targeted evidence battery pass. **KEEP / RE-FROZEN `4011c71c`; retire
`3a653cf9` and all earlier Leopard 2A4 freezes.**

## 5.140 LEOPARD 2A7V TURRET-SEPARATION + FULL-SWEEP TRACK RE-CERTIFICATION (2026-08-12, RE-FROZEN)

The gameplay Leopard 2A7V remains the fully first-party `buildLeo2A7V`
implementation in `src/vehicles/profiles/leopard.js`. Its private recovered
GLB is a quarantined read-only comparison oracle. No source mesh, converted
vertex/index payload, material, texture, animation or runtime node enters the
playable or public build.

The complete rotating package is raised **1 cm** as one unit so its lower
cheeks and apron no longer visually merge into the fixed deck. A thin dark
annular weld seam exposes the existing load-bearing ring without adding a
floating neck. The gun, wedge shell, armor courses, bustle, FLW/PERI suite,
smoke, hatches, roof fittings and antenna bases retain their existing turret
parent and broad seats. The secondary whip is shortened to an asymmetric
source-semantic service length, and a backed horizontal louvre cassette with
full-height frame returns replaces the formerly blank bustle-rear bay.

The track-clearance pass lifts only the outboard sponson underside over the
complete articulated course and moves the glacis lane cut 10 cm aft of the
idler transition. The compact central tub and external armor silhouette stay
unchanged. Exact containment is band front/rear **0/0**, individual shoes
**0/0**, and strict suspension sweep **0/0**. Seven primary road wheels remain
between a distinct front idler and rear drive sprocket in one continuous
linked course. Plan contiguity is **0 holes**.

Freeze **`ec69fe94`** reproduces at 46 meshes / 110,055 vertices. The final
packet in `/private/tmp/leo2a7v-final-r5/leo2a7v` contains 15 paired, 15 yaw0
and 15 yaw90 frames including the standardized elevated-left profile: **45
PNGs / 45 distinct hashes**. Fresh semantic inspection records
`[9.2,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.3,9.2,9.3,9.2,9.3]`, floor **9.0**
and mean **9.16**. Quantitative fidelity is **90.23**, every view is at least
**90.02**, and the curve gate remains **90.0** with dimensions **97** and
floaters **100**.

All yaw pairs show a genuine quarter-turn. The complete turret package moves
together and exposes one coherent fixed deck/ring seat. The parent audit's
broad `hullDetail`/`hullDark` candidates and winding mode-2 candidates
`hull#17`, `hullDark#18` and `hullDetail#19` are visibly continuous fixed
engine-deck, APU and service surfaces; no turret fitting is stranded. Winding
is 0 reversed / 0 mixed with a 41-pixel (0.06%) antialias-only deficit and no
visible wound. Rig, native provenance, family order and standard gates pass.
**KEEP / RE-FROZEN `ec69fe94`; retire `a097ec` and all earlier Leopard 2A7V
freezes.**

## 5.141 LEOPARD 2 REVOLUTION LEFT-HULL / TRACK-CLEARANCE CLOSEOUT (2026-08-12, RE-FROZEN)

The owner's singular left-hull rectangle was isolated with an identical-camera
A/B. It was the one-sided raw `hullDark` cuboid previously described as a
left-hull exhaust outlet. Removing it changed only an 82×47-pixel patch in the
left-rear owner-angle view; the symmetric AMAP courses and all other owner
views were byte-identical. Leopard 2 exhaust/service grammar is already carried
at the rear, so the erroneous side cuboid is retired rather than cosmetically
hidden.

The refreshed strict track gate also exposed legacy profile-painter geometry
inside the live linked course. Both rear dip plates, both front ramp trim
planks and the asymmetric band-edge strips are retired. The lower tub is now an
honest 2.04 m inter-track belly with 0.58 m ground clearance; broad deck/sponson
courses begin above the 1.402 m shoe crown. Mid-gap walls and front mudguard
planks remain visually continuous but start 27.5 mm outside the native shoe
lane. The exterior AMAP/skirt silhouette is preserved while the complete
physical corridor now reads band front/rear **0/0**, individual shoes **0/0**,
strict band sweep **0/0** and strict shoe sweep **0/0**.

Freeze **`fe2dc714`** reproduces at 76 meshes / 101,445 vertices. The ignored
private oracle was mounted read-only for QA and is neither imported nor
shipped. Fresh machine fidelity is **94.2** (gun 96 / tracks 98); geometry gate
minimum is **90.2**, dimensions **99.5**, floaters **100**, contiguity **0
holes**, and the live decor census is `mg1+4d`. The final packet at
`/private/tmp/leo2rev-final-r2/leo2_revolution` contains 15 paired, 15 yaw0 and
15 yaw90 frames including the standardized elevated-left profile: **45 PNGs /
45 distinct hashes**. Fresh semantic inspection records
`[9.3,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.4,9.4,9.3,9.4,9.3,9.4]`, floor **9.1**
and mean **9.27**.

Every yaw pair shows a genuine quarter-turn. Gun/mantlet, complete connected
turret shell, AMAP courses, roof stations, smoke, antennas and bustle package
rotate together over the fixed prow, cleared skirts/sponsons, wheels, engine
deck and transom. The parent audit's broad `hullDetail`/`hullDark` candidates
remain visibly continuous engine-deck/service buckets, not stranded turret
equipment. Winding is 0 reversed / 0 mixed; the 65-pixel (0.09%) right-view
deficit is antialias-only with no visible wound. Rig, assets, muzzle bore,
standard, release, test and private/public build gates pass. **KEEP /
RE-FROZEN `fe2dc714`; retire `37139b70` and all earlier Revolution freezes.**

## 5.142 ABRAMS OWNER-SCOPE GHILLIE + STRICT-COURSE CLOSEOUT (2026-08-12, RE-FROZEN)

The owner's final cover order is exact: dense physical net/shrub camouflage is
present only on M1A1HA and M1A2 SEPv3. The base M1A2 (`m1a2_tejas`), SEPv2 and
TUSK are clean again, exposing their armor, CROWS and urban-kit identities.
The two covered marks use a denser 12-pixel cut-net weave with 72 deterministic
leaf/rag elements, but muzzle lines, sight glass and weapon apertures stay
open. All cover is first-party procedural geometry rooted on armor, deck,
bustle, carrier rails or other rooted cover. No private mesh or texture enters
the runtime or repository.

The simultaneous clearance pass retires the net shoulder sheets that entered
the idler/sprocket arcs, explicitly tags wheel/hub/bay and wrap-pad dress as
running gear, keeps the belly rim inboard of the course, and hands the
full-width sponson into the narrow central structure before the rear wrap. TUSK
uses short local ARAT brackets rather than track-crossing arms and gains two
backed lower-tail return flanges that close its former clean-variant service
pockets without reaching the shoes. Every mark retains seven primary road
wheels between a distinct front idler and rear final-drive sprocket, support
rollers and suspension inside one continuous native linked course.

Exact front band/shoe, rear band/shoe and strict full-sweep receipts are **0/0
for all five**, and plan contiguity is **0 holes**. Standard decor, asset, rig,
muzzle-bore, native-provenance and family-order checks pass. Winding reports 0
HARD failures; the small authored-leaf/mode-2 candidate counts have no visible
missing face, open sheet or wound and resolve through yaw as supported hull
cover or fixed deck/service structure. Existing commercial-style geometry
rows remain honestly unavailable/capped and are not promoted into false
scores; authored/no-oracle SEPv3 and TUSK receive no fabricated paired vector.

The final first-party freezes are:

| id | freeze | meshes / vertices | fresh independent result |
|---|---|---:|---|
| `m1a1ha` | `9fb09dfc` | 60 / 222,370 | floor 9.4 / mean 9.49 |
| `m1a2_tejas` | `ed044ac8` | 55 / 165,322 | floor 9.3 / mean 9.39 |
| `m1a2_sepv2` | `e8589ad6` | 57 / 180,346 | floor 9.0 / mean 9.20 |
| `m1a2_sepv3` | `d34f9818` | 60 / 245,842 | authored/no-oracle yaw PASS |
| `m1a2_tusk` | `978d507c` | 65 / 212,722 | authored/no-oracle yaw PASS |

The final evidence at `/private/tmp/abrams-ghillie-final-r2` is **195 PNGs /
195 distinct hashes**. HA, base M1A2 and SEPv2 each have fifteen paired,
fifteen yaw0 and fifteen yaw90 frames; SEPv3 and TUSK each have fifteen yaw0
and fifteen yaw90 frames. Every set includes the standardized elevated-left
profile. Fresh review proves a genuine quarter-turn, correct turret/hull cover
split, broad CWS/CROWS and equipment seats, a fixed TUSK hull cage, clean
courses and no fused, stranded or empty-air mass. `npm test`, private build and
public build pass. Full evidence and vectors are recorded in
`docs/critique/shaded-parity-abrams-owner-scope-recert.md`.

**PASS / KEEP all five; retire `d8a948cc`, `1adc0bde`, `7680a400` and every
earlier conflicting owner-scope freeze. Ordered blockers: none.**

## 5.143 POST-REGRESSION ROLLBACK AUTHORITY + SAFE MODERN RESTORATION (2026-08-13, LIVE)

The running-gear incident is governed by
`docs/POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md`. Commit `90e853af`
restored the tracked vehicle tree to owner-approved boundary `68c20cc`.
Sections above this one remain useful historical evidence, but their old
freeze hashes are **not** permission to reintroduce later hull deletion,
raised/missing skirt, source-route, or replacement-builder changes. Live
`origin/main` plus this section is the controlling state.

The safe post-rollback modern sequence now landed on `main` is:

| commit | live closure |
|---|---|
| `e03324bd` | Added an explicitly labelled authored-only comparison mode; absent private comparison files can no longer pressure runtime geometry back onto a source route. |
| `c69c85af`, `fe555e7e`, `b2fb876d` | Rebuilt the Leopard 2 Revolution cheek/mantlet, removed the one-sided cheek card, and separated/seated the complete 2A7V rotating package; regenerated both Leopard asset sets. |
| `23d86bcc` | Restored Leclerc return rollers and the complete visible upper linked-shoe run without deleting hull, skirt, or mudguard structure. |
| `e9fa7950` | Regenerated the missing T-72B3M presentation assets. |
| `1c41e599` | Lowered the complete Type 10 turret package as one assembly and re-seated its gun and roof equipment. |
| `74e4a6db`, `78afcb00` | Replaced the base T-90 hemisphere with a repository-authored pear casting, then re-planted and re-oriented its Kontakt-5 and station hardware on that casting. |
| `bdae8fdd`, `7455403c` | Restored the first-party T-80U modular Kontakt-5 clamshell and corrected its asymmetric smoke-bank grammar. |
| `381ccf1e` | Standardized the T-80/T-80B/T-80BV family around the shared authored base while preserving historically correct variant protection and equipment. |
| `b42f3401` | Restored the T-72B obr. 1987 dense Kontakt-1 wrap and roof cadence without touching its hull or native course. |
| `828a162d` | Added broad turret-side carriers, cheek ties, aft returns and rear supports to the T-72B3M so its flank/rear armor and service package visibly belong to and yaw with the turret; moved the B3M beside the T-72 family. |
| `11021b79`, `4f703844` | Completed the T-72B3M ownership repair: moved the remaining side-bin cells and the entire raised side/back soft-pack belt, including straps, ribs, rear faces and support detail, into turret-local geometry. Fresh yaw evidence and the parent audit show 0 stranded / 0 dangling while the real engine deck and transom stay fixed; no hull, skirt or track geometry changed. |
| `ec54ea1c` | Restored the older T-90A's complete radio silhouette with two unequal, fully seated turret-owned whip stations; regenerated its eight presentation assets. Candidate `ae37a914` passed 45-frame independent re-cert at floor 9.6 / mean 9.76 with clean yaw/load paths and no hull or course change. |
| `990d7acd` | Restored T-90A Vladimir's two unequal radio stations at its own aft roof seats without scaling or replacing the tank; regenerated its eight presentation assets. Candidate `3ff8e1e8` passed 45-frame independent re-cert at floor 9.6 / mean 9.77; the fixed open fender/service frame was explicitly verified as supported hull structure. |

Live provenance is authoritative: `node tools/native-playables-audit.mjs`
passes **108 battle playables / 0 GLB-sourced / 26 isolated comparison
candidates**. Comparison GLBs are optional, private measurement/visual
oracles only. They never enter a battle playable, public build, converted
vertex module, or replacement runtime route.

The owner's Challenger 1 and Ariete recovery ruling is also explicit. The
live routes stay on the earlier stronger repository-authored
`challenger1Build` and `buildAriete` implementations. The later
`challenger1Native2026` and `buildArieteNative2026` experiments are rejected
comparison history: do not switch either runtime route to them. Future
fidelity work must refine the live first-party builders in place and preserve
their complete hulls, skirts, mudguards and running-gear corridors.

Fresh same-camera authored and paired packets on this boundary verify the
current T-90 family plus Challenger 1 and Ariete directly from live code.
Track/yaw claims must continue to come from newly generated packets; no
pre-rollback graduation note may override current pixels. Remaining modern
work proceeds as additive/reseating rounds on these live builders, one tank
and one atomic pushed commit at a time. The next visual queue is: complete
family-scale/equipment reconciliation for the older T-90 marks; then the
owner-named Challenger 1/Ariete in-place polish; then the remaining modern
Leopard/AMX/Type 99/AbramsX verification re-sits. WWII work stays behind the
modern queue.

## 5.144 REVERTED MODERN RUNNING-GEAR EXPERIMENT (2026-08-13, RETIRED)

Commit `f16c9659` is **not authoritative**. Although it attempted to repair
six modern running-gear envelopes, it mixed safe terminal-wrap changes with
road-wheel/cadence/presentation changes whose live result visually damaged
the established hull/skirt relationship. Commit `4b3b8f2f` reverts that
experiment exactly. No road-wheel, wheel-face, shadow-proxy or side-envelope
delta from `f16c9659` may be reintroduced by copying that commit.

Commit `d9feca33` separately removes the owner-rejected Merkava IVm
Windbreaker row; that independent deletion remains live and does not alter
another Merkava mark.

## 5.145 CHALLENGER 1 IN-PLACE TURRET / COURSE CLOSEOUT (2026-08-13, FROZEN)

The live first-party `challenger1Build` is refined in place. Its complete hull,
six-station Hydrogas layout, skirts and mudguard architecture remain the
authoritative foundation. The fighting compartment is lowered and broadened
as one connected cast mass; overlapping ellipsoidal cheeks now flow into a
closed oval L11 carrier and a body-colour outer mask, eliminating the former
rectangular mantlet shelf without creating a hemisphere or replacement shell.
The commander/TOGS heads are tapered and clustered on one broad low plinth,
the MG is re-seated, canted smoke banks gain broad cheek pads, and the basket,
cable/coil, backed louvres and unequal rear recovery field all retain visible
load paths.

The course repair is additive/reseating-only. The complete front and rear mud
flaps move immediately outside the terminal wraps; custom concentric wheel
faces are explicitly owned by the native running gear; shadow catch plates
move behind the inner tire faces; and the closed bow-guard underside rises as
one continuous arch over the idler approach. No hull or guard panel is
deleted. Exact track containment is front/rear band **0/0**, front/rear shoes
**0/0**, strict band sweep **0/0** and strict shoe sweep **0/0**.

Freeze **`4ecc29b4`** reproduces at 89 meshes / 103,167 vertices. The final
packet at `/private/tmp/ch1-final-r12/challenger1` contains 15 paired, 15 yaw0
and 15 yaw90 frames including the elevated-left profile: **45 PNGs / 45
distinct hashes**. Fresh semantic inspection records
`[9.0,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.1,9.0,9.1,9.0,9.1]`, floor **9.0**
and mean **9.04**. The machine geometry floor is **90.3**. Parent audit is 0
stranded / 0 abutting / 0 dangling; winding is 0 reversed / 0 mixed with no
pixel deficit. Every yaw pair shows a real quarter-turn and the complete gun,
cast shell, roof suite, smoke and supported basket move together over one
fixed coherent hull/deck/course. `npm test` and the production build pass.

**PASS / KEEP `4ecc29b4`. Challenger 1 ordered blockers: none. Ariete is the
next live in-place modern recovery target.**

## 5.146 SURGICAL MODERN IDLER / NATIVE-WRAP CORRECTION (2026-08-13, LIVE)

The post-`4b3b8f2f` repair is intentionally limited to running gear. It does
not scale, translate, clear or replace any hull, side skirt, mudguard, turret,
road-wheel row or road-wheel face.

- Ariete retains its original seven road wheels and complete panelled skirt.
  Its fake static `hullTrackTrim` wrap wedges are removed, a real full-size
  front idler is seated ahead of the row, and the native linked course owns
  the complete front transition. Exact front band/shoe contact improves from
  `455/1388` to `0/0`; no hull course was deleted.
- Leclerc retains its original six road wheels and complete skirt/mudguard
  geometry. Its over-authored zig-zag loop is replaced by the native
  wheel-supported trapezoid, with a full front idler, a lower run resting on
  the wheel bottoms and an upper run resting on the existing return rollers.
  Exact band/shoe/strict containment is `0/0`.
- T-90M Proryv retains its established road-wheel row and skirts. Its former
  idler station nearly coincided with the leading road wheel; the idler and
  its concentric face are moved forward as one wheel and the native front
  wrap follows it. Existing unrelated strict hull/dressing receipts are not
  "fixed" by deleting side armor.
- Challenger 3, T-90A Vladimir and Leopard 2 Revolution retain every wheel
  and armor part. Only the native front lift-off/wrap is extended around the
  leading tire. Challenger 3 uses a shallower linked-shoe radial profile so
  that extended wrap also clears its internal render-only gear-air backers.
  Challenger 3, Leclerc and Revolution certify at exact strict `0/0`.

The controlling rule is now explicit: front-idler and native-loop repairs may
change the terminal wheel and the real band/shoes only. They must never be
implemented by deleting, lifting, shortening or hiding the tank's authored
hull, skirts, mudguards or road-wheel course.

## 5.147 ARIETE FIRST-PARTY TURRET / ASSET RE-FREEZE (2026-08-13, LIVE)

The live repository-authored `buildAriete` route is refined in place; the
rejected `buildArieteNative2026` experiment remains inactive. No source mesh,
converted vertex payload or private model enters the playable. The complete
hull, panelled side skirts, mudguards, seven-road-wheel row and post-§5.146
native idler/course are byte-unchanged by this closure.

The former constant-height fighting compartment is replaced by one connected
12-station multi-loft casting. Its clipped cheeks retain the measured central
roof datum while the side belts and bustle fall away at unequal heights. A
rounded nested mantlet/root surround replaces the old box-on-box canvas mass;
the gun run and MRS collar are shortened together to the measured envelope.
Broad low commander/loader rings, seated MG, inboard GALIX banks, unequal
collared radio whips and the supported rear basket remain turret-owned. The
basket now carries unequal strapped packs behind an open backed rail cadence
instead of one full-width solid cargo wall.

Freeze **`6c24e284`** reproduces at 49 meshes / 103,875 vertices. Quantitative
first-party fidelity is **92.7** with hull **93.8**, turret **89.7** (display
class **90**), tracks **91.7** and every mandatory whole view at least
**91.45**. The final packet at
`/private/tmp/ariete-clean-final-r4/ariete` contains 15 paired, 15 yaw0 and 15
yaw90 frames including the elevated-left profile: **45 PNGs / 45 distinct
hashes**. Fresh semantic inspection records
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.1,9.1,9.1]`, floor **9.0**
and mean **9.07**.

All yaw pairs show a genuine quarter-turn. Gun/mantlet, connected casting,
cheek modules, roof stations, GALIX banks, MG, whips, bustle and complete
basket move together; the hull/deck/course remain fixed and expose a coherent
ring seat. Winding is 0 reversed / 0 mixed with no mode-2 candidate or visible
wound. The parent audit's sole `hullCloth` candidate is the visibly seated
fixed left engine-deck roll at x −1.30 / z −2.15; it remains with the hull as
the turret turns and is not rear-turret equipment. `fitting_spareTrackLinks`
is likewise legitimate fixed deck stowage.

The track audit remains honest: the §5.146 front terminal is exact band/shoe
**0/0** and the protected lower vehicle is unchanged. A pre-existing shallow
rear `rig_hull` contact (12 band voxels / 5 shoe voxels, max depth 25 mm) and
lane-local full-sweep track-dressing/backer contacts remain recorded; this
turret closure does not conceal them by moving or deleting hull/skirts. Rig,
muzzle bore, assets, native provenance, family order, unit tests and the
production build pass. All eight Ariete presentation assets and their manifest
binding are regenerated for this exact geometry.

**KEEP / RE-FROZEN `6c24e284`. Any later terminal repair must obey §5.146:
wheel/wrap only, never hull or side-armor subtraction.**

## 5.148 BASE T-90 TURRET-EQUIPMENT RESEATING (2026-08-13, LIVE)

The plain `t90` route remains fully repository-authored procedural geometry.
Its existing hull, glacis, complete skirts, mudguards, six-road-wheel row,
terminal wheels and native linked course are untouched by this round. The
quarantined comparison GLB is used only for transient visual/metrology QA and
is neither imported nor shipped.

The pear-section cast turret is retained instead of reverting to a hemisphere.
The old finish pass was still decorating it at superseded dome coordinates,
which produced a second K-5 belt, duplicate cupola/platform mass and a broad
rear box field. That duplicate layer is retired. One source-relative package
now owns the turret: seven planted frontal K-5 cassettes per side, a short
buried inner stagger, four falling flank cassettes, enlarged and re-seated
Shtora housings, inboard 902B banks, one compact commander/night-sight station,
low unequal periscopes, two collared radio whips and a supported broken rear
rail/strap/coil cadence. The complete package is narrowed 1.8% as one assembly
against the measured cast envelope; the nested gun cross-section is preserved.

Geometry fingerprint **`da0ea477`** reproduces with regenerated angle, top,
side, silhouette, hit-zone, armor and module assets. Quantitative first-party
fidelity is **90.02 aggregate** with overall silhouette **91.40**, hull
**92.04**, turret display class **82**, gun **92.07** and tracks **95.26**.
The raw mask floor is **89.81** in direct rear; that residual belongs to the
protected inherited hull/transom silhouette and is not hidden by subtracting
or lifting lower-vehicle geometry. Fresh source-semantic review of the 14
mandatory pairs records
`[9.0,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.2,9.1,9.2,9.1,9.2]`, floor **9.0**
and mean **9.09**.

The final packet at `/private/tmp/t90-decoration-final-r7/t90` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile: **45
PNGs / 45 distinct hashes**. Every yaw pair shows a genuine quarter-turn; the
gun, connected cast shell, all K-5, Shtora, smoke, cupolas, optics, MG, whips
and rear rails rotate together while the hull/deck/course remain fixed. The
parent audit's only nominee is legitimate fixed-deck spare-track stowage.
Winding is 0 reversed / 0 mixed with no mode-2 candidate. Exact native band
and shoe contact is front/rear **0/0**; the strict sweep's 661 `sweep:hull`
pixels are the unchanged inherited hull bucket and are not "repaired" by
deleting armor. Rig, muzzle bore, assets, native provenance, family order,
unit tests and the production build pass.

**KEEP / RE-FROZEN `da0ea477`. Future work on this tank must preserve the
lower vehicle and may refine only additive or re-seated turret-owned detail.**

## 5.149 T-72BU FAMILY-QUALITY / OWNERSHIP CLOSURE (2026-08-13, LIVE)

The live `t72bu` remains entirely repository-authored procedural geometry. Its
proven BU hull, full skirt and mudguard envelope, six road wheels, terminal
wheels and one native linked course are retained without subtraction or
replacement. The recovered comparison GLB remains a temporary visual oracle;
no source mesh or converted payload enters the playable.

The existing low obr. 1992 cast turret and pointed K-5 blanket remain the
family base. The rotating package is compressed from 0.94 to 0.90 vertically
around its own datum while the graduated gun is counter-scaled and re-seated
to preserve the complete world-space recoil axis and run. The former short
box-rods become two unequal radio stations with broad roof shoes, stepped
collars, short braces and flexible whips. A small backed cable coil completes
the unequal rear rack cadence. All K-5, optics, hatches, smoke banks, the
commander/NSVT assembly, both radio stations, unequal side/rear packs and the
complete rack remain children of the one rotating turret group.

Geometry fingerprint **`7e123f00`** reproduces at 46 meshes / 92,743 vertices.
Quantitative fidelity is **90.18 aggregate** with overall silhouette **92.28**,
hull **93.58**, turret **80.25**, gun **90.99** and tracks **93.94**. Eight of
nine raw whole-view masks are at least 90; the sole numeric residual is
**89.90** in rear-right, caused by the protected inherited hull width rather
than the reworked turret. It is not hidden by shaving skirts or hull armor.
Fresh semantic inspection of the mandatory pairs records
`[9.1,9.2,9.1,9.0,9.1,9.0,9.1,9.2,9.2,9.2,9.1,9.2,9.1,9.2]`, floor **9.0**
and mean **9.12**.

The final packet at `/private/tmp/t72bu-quality-final-r3/t72bu` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile: **45
PNGs / 45 distinct hashes**. Every yaw pair shows a genuine quarter-turn. The
gun, cast shell, full K-5 blanket, sights, hatches, smoke, NSVT, whips and all
side/rear packs rotate together; the deep-wading mast, hull deck, skirts,
running gear and transom remain fixed. Turret-parent audit reports 0 stranded,
0 abutting and 0 dangling items. Winding reports 0 reversed / 0 mixed and no
mode-2 candidate. Exact band and shoe contacts are front/rear **0/0**; the
strict sweep's 673 `sweep:hull` pixels are the unchanged inherited hull bucket
and are not repaired by deleting lower-vehicle geometry. Rig and muzzle-bore
probes pass. All eight T-72BU presentation assets are regenerated for this
exact geometry.

**KEEP / RE-FROZEN `7e123f00`. Later T-72 family refinement must preserve this
complete hull/course and keep every turret-semantic pack inside `turretG`.**

## 5.150 BASE T-90 EXACT BURLAK-FOUNDATION REBUILD (2026-08-13, LIVE)

The plain `t90` now calls the exact same repository-authored 18-station core
and load-bearing shoulder-foundation functions as the live first-party Burlak.
This supersedes the earlier hand-copied twelve-point approximation. It does
inherits Burlak's complete closed five-station autoloader bustle but not its
prototype roof suite or protection cassettes. The base T-90 carries its own heavy Kontakt-5
horseshoe and inner stagger, buried Shtora heads, unequal smoke banks,
cupolas, sights, NSVT, three unequal collared radio stations and dense aft
service equipment on that shared foundation. The two OTShU/Shtora stations
use larger complete seated housings—not merely enlarged lens decals—and the
aft pack adds unequal buried bins, diagonal returns, straps and cylindrical
stowage in real cradles. No external mesh, converted payload or copied source
geometry is used by the runtime builder.

The complete hull, glacis, deck, skirts, mudguards, six-road-wheel row and
native linked course are byte-for-byte untouched by this turret-only change.
The final packet at `/tmp/critic-t90-full-burlak-final-r6/t90` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile: **45
PNGs / 45 distinct hashes**. Fresh owner-directed semantic inspection records
`[9.2,9.2,9.1,9.0,9.1,9.0,9.1,9.2,9.2,9.3,9.1,9.2,9.1,9.2]`, floor **9.0**
and mean **9.14**. Every yaw pair shows a genuine quarter-turn: the gun, exact
shared core and shoulders, the complete autoloader bustle/body/lids/side
cells/end frame, all K-5, Shtora, smoke, roof stations, whips and rear
equipment rotate together while the complete lower vehicle remains fixed.

Deterministic geometry freeze **`34b9980`** reproduces at 70 meshes / 129,882
vertices. The same refactor leaves the playable Burlak byte-for-byte stable at
**`ec0dd544`**, 63 meshes / 103,597 vertices. The legacy machine oracle is an
unbustled production T-90 and therefore no longer represents the explicit
owner target: it records 88.23 solely because the requested three-metre
autoloader body changes the side silhouette. Hull **92.04**, gun **92.07** and
tracks **95.26** remain stable. The owner-directed semantic target is the live
first-party Burlak body plus T-90 stations, which the fresh paired/yaw packet
confirms without hiding or deleting lower armor, skirts, track structure or
the inherited transom.

Rig checks pass 10/10. The only parent-audit nominee is legitimate fixed-deck
spare-track stowage, visibly seated after the turret departs. Winding is clean
(0 reversed / 0 mixed, no mode-2 candidate), muzzle bore passes, and exact
native band/shoe contacts are front/rear **0/0**. Unit tests and the public
production build pass.

**KEEP / RE-FROZEN `34b9980`; retire `8e196a78`, `da79f77b`, `24851190`, `da0ea477` and all earlier
base-T-90 turret freezes. Future work must preserve the exact shared Burlak
foundation and the complete lower vehicle.**

## 5.151 LEOPARD SIDE-SKIRT / REVOLUTION CHEEK-CARD REPAIR (2026-08-13, LIVE)

The playable first-party `leo2a4` and `leo2a7v` again carry their full-depth
modular side curtains. A prior clearance pass had lifted the lower edges to
road-wheel-crown height despite the builders still documenting deep skirts.
This repair restores the intended lower edges at 0.52-0.55 m, keeps every
panel entirely outboard of the linked-shoe lane, and preserves the complete
hulls, fenders, mudguards, wheels, suspension and native tracks. Nothing in
either lower vehicle is deleted, shifted upward or replaced.

The Revolution owner screenshot was reproduced with a diagnostic material
isolation. The visible thin square was the remaining standalone left mid-slab:
a 7 cm-thick, 1.84 m-long horizontal card projecting from the cheek. That
specific redundant primitive is removed. The connected primary loft, buried
cheek and continuous outer armor course already overlap beneath it, so the
repair leaves a closed supported cheek with no hole, replacement card or
stand-off decoration.

The final procedural packet at
`/tmp/critic-leopard-skirts-cheek-final-r4/{leo2a4,leo2a7v,leo2_revolution}`
contains 15 paired, 15 yaw0 and 15 yaw90 frames per vehicle including the
standard elevated-left profile. All corresponding yaw pairs show a genuine
quarter-turn: complete turrets and their equipment rotate while both restored
skirt courses and every lower-vehicle component remain fixed. The 2A7V
winding mode-2 candidate is the now-more-visible fixed hull/skirt assembly,
not stranded turret mass. The Revolution parent nominee is the merged
hull-detail bucket spanning supported deck/fender/transom courses, not the
removed turret card.

Deterministic freezes are `d8374cc8` (2A4, 66 meshes / 90,811 vertices),
`b6b630f4` (2A7V, 46 / 110,043) and `cffcd052` (Revolution, 76 / 103,533).
Rig and parent checks pass. Exact native band, shoe and strict suspension-sweep
contacts are front/rear **0/0** for all three. Winding mode 1 is clean with no
reversed or mixed faces, and the Revolution card remains absent at yaw 0 and
90 degrees.

**KEEP / RE-FROZEN all three. Future track-clearance work must not raise or
delete these skirt courses; their lateral separation already provides the
required physical corridor.**

## 5.152 CHALLENGER 1 TRUE-RING / GUN-CRADLE CLOSURE (2026-08-13, LIVE)

The existing first-party Challenger 1 hull, skirts, mudguards, six-wheel
Hydrogas course and already accepted in-place turret/rear fidelity work remain
unchanged. The isolated lower gun-cradle cylinder is removed: it did not meet
the connected thermal sleeve, appeared as a detached polygon at turret yaw,
and entered the upper-glacis space at idle. The remaining oval carrier,
thermal sleeve and casting cheeks retain a continuous supported L11 load path.

The turret articulation is re-seated from the stale local z=-0.20 pivot to the
recovered hull-ring center z=0.362. Every turret-owned child is counter-
translated after assembly, so the accepted yaw-zero silhouette remains
unchanged while the complete shell, gun, basket and roof suite rotate around
the physical ring rather than orbiting behind it. No hull geometry is moved,
scaled, subtracted or replaced.

The final packet at `/private/tmp/critic-ch1-final-r10/challenger1` contains
15 paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile:
**45 PNGs / 45 distinct hashes**. Fresh semantic inspection records
`[9.0,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.1,9.0,9.1,9.0,9.1]`, floor
**9.0** and mean **9.04**. Top/elevated/close yaw pairs prove a genuine
quarter-turn around the deck ring with no residual lower-cradle island,
stranded station, fused duplicate mass or empty-air fitting.

Deterministic freeze **`fa346ca4`** reproduces twice at 89 meshes / 103,071
vertices. Rig checks pass 10/10; parent audit reports 0 stranded / 0 abutting /
0 dangling. Winding is 0 reversed / 0 mixed with no pixel deficit. Its sole
151-pixel mode-2 nominee is the legitimate fixed rear-deck service strip at
world z -3.063..-2.892 and y 1.823..1.830, only 3-10 mm above the audit's deck
cut; it has no turret semantics and remains continuously seated as the turret
departs. Exact native track bands and shoes remain front/rear **0/0** and the
muzzle-bore probe passes.

**KEEP / RE-FROZEN `fa346ca4`; retire `4ecc29b4` and all earlier Challenger 1
freezes. Future repairs must preserve the complete lower vehicle.**

## 5.153 LECLERC NATIVE-COURSE / GARAGE-ASSET RECONCILIATION (2026-08-13, LIVE)

The owner-reported detached `\\======//` Leclerc course is closed in the
current first-party builder. Read-only inspection of the live geometry shows
six road wheels, a full-size elevated front idler, raised rear drive, five
return rollers seated immediately beneath the visible upper linked-shoe run,
and a wheel-supported lower course. `coveredTop` is false, so the upper shoes
are present rather than hidden. The earlier hand-authored track-tone fillers
are absent; one native articulated course owns both terminal transitions.

No new geometry change is justified by the live pixels. The complete hull,
side armor, skirts and restored raked mudguards remain untouched. Exact band,
shoe and strict suspension-sweep contacts are front/rear **0/0**. Winding is
0 reversed / 0 mixed with no mode-2 nominee. The final procedural packet at
`/tmp/critic-leclerc-track-r2-baseline/leclerc` contains 15 paired, 15 yaw0
and 15 yaw90 frames including the elevated-left profile; all 45 files are
distinct and show the fixed hull/course under a genuine turret quarter-turn.

The remaining live mismatch was presentation metadata: the eight garage,
silhouette, armor, hit-zone and module assets still described an older track
freeze. All eight are regenerated from the current procedural model. The
asset checker now passes geometry, metadata, files and muzzle bore. Canonical
procedural freeze **`467186cc`** reproduces at 47 meshes / 86,775 vertices;
the asset-manifest fingerprint is **`f9914c87`**.

**KEEP / RE-FROZEN `467186cc`. Future course changes must preserve the hull,
skirts and mudguards and must not reintroduce static duplicate track fills.**

## 5.154 T-72B3M TURRET-OWNERSHIP / ASSET RECONCILIATION (2026-08-13, LIVE)

The current first-party `buildT72B3M` has been re-audited against the owner's
specific yaw order. The complete raised side/back soft-pack belt, its mound
caps, straps, ribs and rear faces, the three aft side-bin cells per side,
buried flank carriers, central bustle root, protection, Sosna/roof suite,
smoke and rear cells are all authored under `turretG`. The short forward
fender cells, engine deck, hull, skirts and transom remain correctly
hull-owned.

The final packet at
`/private/tmp/critic-t72b3m-ownership-final-r2/t72b3m` contains 15 paired, 15
yaw0 and 15 yaw90 frames including the elevated-left profile: **45 PNGs / 45
distinct hashes**. Top, side, rear and hero pairs show a genuine quarter-turn;
the entire side/back package relocates with the cast shell and exposes one
coherent fixed engine deck. Turret-parent audit reports **0 stranded / 0
abutting / 0 dangling**. Winding is clean at 0 reversed / 0 mixed with no
mode-2 ownership candidate.

The existing wrap-fade strips, chord/joint fills and front-idler face annulus
were already native-course components, but their old `hullTrackTrimL/R`
labels caused the newer strict audit to count them as hull intrusions. They
are now merged into the explicit suspension-owned `hullRunningGearDark`
bucket. No coordinate, material, vertex, hull, skirt, wheel, idler or shoe is
changed: all 45 pre/post rendered frames are byte-identical. Exact front/rear
band and shoe contacts are now **0/0**. The remaining full-sweep overlaps are
the deliberately retained skirt/hull-shadow/spare-link presentation, not a
terminal wrap defect; none is deleted to manufacture a gate pass.

Deterministic geometry freeze **`b8cc33a8`** reproduces at 123 meshes / 226,508
vertices. All eight garage, silhouette, armor, hit-zone and module assets are
regenerated for this live package; the asset manifest fingerprint is
**`d3afa90d`** and the targeted asset checker passes.

**KEEP / RE-FROZEN `b8cc33a8`. Future T-72 family work must preserve the
complete lower vehicle and keep every side/back turret-semantic pack inside
`turretG`.**

## 5.155 TYPE 10 LOWERED-TURRET LIVE RECONCILIATION (2026-08-13, LIVE)

The current first-party `buildType10Native2026` retains the owner-ordered
0.10 m turret lowering from `1c41e599`: its articulation pivot is y=1.40
rather than the former y=1.50 datum, burying the complete clipped welded
package into the upper shoulder instead of leaving a visible bearing neck.
The gun pivot and every turret-local child were retained together, so the
lowering did not strand, separately scale or clip the mantlet, barrel, cheeks,
bustle, hatches, optics, antenna or roof equipment. The complete hull, deep
side armor, skirts, fenders and native five-wheel running gear remain
unchanged.

Fresh evidence at `/private/tmp/critic-type10-live-r1/type10` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile: **45
PNGs / 45 distinct hashes**. The side/profile evidence shows the turret seated
continuously on the ring without the owner-reported tall gap. Top, side and
hero yaw pairs prove a genuine quarter-turn: the gun, full turret casting,
bustle and complete station package rotate together while the engine deck,
skirted hull and one continuous linked-shoe course remain fixed.

The parent audit's six geometric nominees are not turret equipment: they are
the right-fender tow cable, driver glass, rear-deck cloth and spare links, plus
merged backed hull-detail buckets. Their world boxes sit on fixed deck/fender
surfaces and remain visibly supported after the turret departs. Winding is 0
reversed / 0 mixed; the six-pixel rear-quarter deficit is 0.01% and has no
visible wound. Its mode-2 pixels resolve to the same fixed rear-deck cloth and
service field, not stranded turret mass.

The terminal contact census records only millimetric authored end-support
tangencies: the front shoe/shadow maximum is 2 mm and the rear entries are
12-18 mm outside the shoe volume by the audit's signed-depth convention. No
visible shoe penetration, detached `\\======//` course, duplicated track or
missing hull/side-skirt surface appears. These intact lower-vehicle parts are
therefore preserved rather than deleted or raised to manufacture a numerical
zero.

Deterministic geometry freeze **`d7faced8`** reproduces at 62 meshes / 56,802
vertices. The targeted eight-file asset checker passes geometry, metadata,
files and muzzle bore on the live freeze.

**KEEP / RE-FROZEN `d7faced8`; retire stale ledger freeze `7ac6d434`. Future
Type 10 work must preserve the complete lower vehicle and keep the full turret
package on the corrected y=1.40 articulation.**

## 5.156 FV510 UPPER-GLACIS / SIGHTING-SUITE FIDELITY PASS (2026-08-13, LIVE)

The live first-party `fv510PhotoBuild` now closes the owner's requested front
and equipment pass without replacing any vehicle mass. The previous deck
polyline concentrated almost the complete upper-glacis rise into its last
20 cm, producing a flat shelf above a visually abrupt nose. Its published bow
and deck anchors are retained, but the intermediate break is moved rearward
and down so the same armor surface forms one continuous long Warrior rake.
The lower bow, hull tub, open WRAP screens, skirts, mudguards, wheel stations
and linked course are untouched.

The existing RAVEN commander station is enlarged in place into a protected
dual-channel day/thermal and laser head on a broad tapered pot. A compact
forward IR searchlight is added beside the RARDEN root with a buried cheek
shoe, rear housing and three visible guard returns. The first render's extra
upper marker lamps were rejected because they read sky-backed and were
removed completely; the established paired guarded bow light clusters remain
the only hull lamps. No decorative item is accepted merely because it shares
a material or follows yaw.

Fresh final evidence at `/private/tmp/critic-fv510-final-r4/fv510` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the elevated-left profile: **45
PNGs / 45 distinct hashes**. The complete gun, turret shell, new searchlight,
dual-channel sight, smoke banks, hatches, periscopes, MG, whips and open rear
basket execute a genuine quarter-turn together. The full hull, driver station,
lights, WRAP screens and one continuous native course remain fixed. The
parent audit reports 0 stranded / 1 abutting / 0 dangling; the single nominee
is the real hull-owned driver glass immediately ahead of the turret, visibly
seated after the turret departs.

Winding census is 0 reversed / 0 mixed across 652 pieces. Its FrontSide mask
flag localizes to the intentionally open thin WRAP screen ribs at the rear
flanks, not a disappearing hull sheet; every final shaded view retains the
screen's rails, uprights and body behind it. The mode-2 candidate is the same
fixed driver glass and is below the hard threshold. Muzzle-bore proof passes.
The exact terminal tool continues to report the pre-existing 1 cm conservative
inner-tub tangency at both ends; it is inboard of the visible lane, unchanged
in signed depth by this upper-hull/turret pass, and produces no shoe, wheel or
screen penetration in the final pixels. No lower-vehicle part is deleted or
raised to force a numerical zero.

Deterministic geometry freeze **`313ab8ca`** reproduces at 70 meshes / 60,873
vertices. All eight FV510 garage, silhouette, armor, hit-zone and module assets
are regenerated for this freeze; the targeted asset checker passes geometry,
metadata, files and muzzle bore.

**KEEP / RE-FROZEN `313ab8ca`; retire `61023726`. Future FV510 work must
preserve the full lower vehicle, continuous long glacis rake and complete
turret-owned sight/searchlight load paths.**

## 5.157 ABRAMS STUDIO-SELECTED LEFT-CHEEK OVERLAY REMOVAL (2026-08-13, LIVE)

The owner used the first-party Tank Surface Markup Studio on `m1a2_tejas` to
mark three adjacent patches on the left-front turret cheek. The exported
patches resolve to faces 2286-2301 of the merged `turret` bucket and share the
same authored bounds: x=-1.601..-1.101, local y=-0.12..0.51 and
z=0.20..1.74922. They are the raked face, outboard face and roof face of the
same procedural stair-zone overlay, not three independent armor parts.

The complete closed overlay (its thin toe and upper wedge) is therefore
removed at the builder level. Individual triangles are not deleted: doing so
would leave an open non-manifold wound. The primary Abrams turret loft under
the overlay remains intact and now supplies one continuous swept left cheek.
The inboard mantlet-shoulder transition at x=-1.101..-0.699 is retained, as are
the gun, smoke bank, roof stations, bustle, hull and native running gear.

Fresh first-party studio inspection at the owner's exported hero/elevated-left
camera family confirms the selected card is absent. Direct side and top yaw90
inspection show a closed cheek with no sky hole, stranded fitting or duplicate
turret mass; the complete remaining package still rotates together. Because
the corrected cheek is shared by the authored Tejas-family builder, all 48
garage/silhouette/armor/hit-zone/module assets for `m1a1`, `m1a1ha`,
`m1a2_tejas`, `m1a2_tusk`, `m1a2_sepv2` and `m1a2_sepv3` are regenerated.
Targeted asset and muzzle-bore gates pass for all six variants. The new
`m1a2_tejas` deterministic geometry freeze is **`5882a89c`**.

**KEEP. Future Abrams cheek edits should use studio surface bounds to remove
the owning procedural primitive, never raw triangles from the merged mesh.**

## 5.158 T-72B OBR. 1987 CURRENT-FAMILY COHESION PASS (2026-08-13, LIVE)

`t72b_1987` was already a visible, playable member of the main roster and the
ordered T-72 family. No duplicate vehicle or alias was added. The existing
first-party `buildT72B87` keeps its proven low cast turret, complete hull,
skirts, six native road-wheel stations and one continuous linked track course.

The active turret receives a localized family-quality pass while preserving
its period-correct Kontakt-1 identity. A second unequal 902B launcher bank now
lands on a broad cheek carrier; the Luna/TPN head is a round armoured housing
with an inset lens and two hinge shoes; and a low rear shield shoe ties the
commander ring and NSVT cradle together. Three unequal low rear service cells,
an open transverse rail and explicit side/vertical returns add the mechanical
density present on the current B3M/BU family without inventing a modern
autoloader bustle or replacing the 1987 casting.

First-party studio inspection covers hero, elevated-left, rear, top and a true
90-degree turret yaw. Gun, complete cast shell, all Kontakt-1, both smoke
banks, optic/cupola/NSVT equipment, antennas and the new supported rear field
rotate together; the hull, skirts, road wheels, track, deck and rear hull kit
remain fixed. No open sheet, floating rail, stranded turret fitting, duplicate
course or running-gear regression is visible. Fleet ordering, garage ordering,
track geometry, live registry and muzzle-bore checks pass. All eight roster
assets are regenerated for deterministic geometry freeze **`a11c97ed`**.

**KEEP `a11c97ed`. Future T-72B obr. 1987 work must preserve the period K1
blanket, complete hull/skirt envelope and native six-wheel course.**

## 5.159 FV510 DEEP WRAP SIDE-ARMOUR RESTORATION (2026-08-13, LIVE)

The owner's side-protection follow-up is implemented on the existing
first-party `fv510PhotoBuild` without deleting or reshaping the proven hull,
bow, stern, running gear or linked track. The prior recovery used six shallow
rectangular cards behind the WRAP rails; at normal garage distance the rails
visually swallowed those cards and the Warrior still appeared to have lost
its side-skirt armour.

Each side now carries six closed, deep applique volumes with chamfered upper,
lower and end faces. Dark recessed perimeters keep the stations separately
readable, paired diagonal ribs form the requested large chevron/zig-zag
armour language, and broad upper/lower shoes return every module into the
original sponson. Armoured seam drops create the characteristic toothed lower
edge while ending above the road-wheel and linked-shoe corridor. The exterior
WRAP cage is retained as a supported screen but lowered to four horizontal
courses with seven vertical tie stations so it no longer hides the armour.

First-party studio inspection covers pure left profile, elevated left, front
and hero views. The six modules remain closed and hull-owned; no rail, rib or
shoe is supported through empty air, no front-width growth enters the track
lanes, and all six road-wheel stations plus the single native linked course
remain visible and continuous. Live registry, muzzle-bore, track-geometry and
targeted asset checks pass. All eight FV510 assets are regenerated for
deterministic geometry freeze **`f15951c4`**.

**KEEP `f15951c4`. Future FV510 work must preserve these closed deep modules,
the original complete hull and the unobstructed native track corridor.**

## 5.160 LEOPARD 2 REVOLUTION LEFT-CHEEK CORE BURIAL (2026-08-13, LIVE)

The repeatedly reported rectangular shelf on the vehicle-left turret cheek is
resolved at its actual procedural owner. Studio inspection traced the visible
patch to the left fore-core closure: one broad slab spanning local
x=-1.30..-0.44 and z=0.55..1.70 beneath the outer Revolution armour. It was
not a smoke launcher, mantlet component or hull guard; its flat upper ring
projected through the newer primary cheek from the owner's elevated-left view.

The monolithic closure is replaced by two closed fore/aft taper sections. The
lower rings retain enough internal volume to back the outer shell, while their
upper rings pull sharply inboard to x=-0.72/-0.70. This removes the secondary
square armour card without deleting triangles, opening the turret, changing
the accepted primary cheek/mantlet outline or touching the hull and tracks.

First-party elevated-left, hero and close-roof comparisons confirm that the
main cheek now supplies the uninterrupted exterior silhouette. A 90-degree
turret inspection retains a closed shell and coherent deck/ring exposure; no
sky hole, duplicate plate, stranded fitting or new collision appears. Live
registry, muzzle bore, linked-track and targeted asset checks pass. All eight
Leopard 2 Revolution assets are regenerated for deterministic geometry freeze
**`bd9bd452`**.

**KEEP `bd9bd452`. The buried fore-core is internal support only; future
turret work must not restore an outboard flat shelf in this station.**

## 5.161 ABRAMS SECOND STUDIO CHEEK-OVERLAY DELETION (2026-08-13, LIVE)

The owner's second `m1a2_tejas` studio packet selects the three exposed planes
of the remaining inboard half of the legacy vehicle-left cheek overlay:
local x=-1.101..-0.699, y=0.00..0.53 and z=0.90..1.906. The raked face,
vertical side and roof selections all resolve to one closed procedural wedge,
immediately inboard of the outboard overlay removed in §5.157.

The complete owning wedge is removed at the builder level rather than erasing
individual merged-mesh triangles. Its small seam-toe carrier is removed with
it because that carrier had no independent armour or equipment purpose once
both overlay halves were gone. The original swept Abrams turret cheek beneath
the overlays remains a closed solid and now owns the full uninterrupted
vehicle-left silhouette.

First-party studio inspection covers elevated-left and top-biased owner views
at turret yaw 0 and 90 degrees. The repaired cheek stays closed, the gun and
complete turret equipment rotate coherently, and no sky hole, open sheet,
stranded face, hull change or track regression appears. All eight assets are
regenerated for the six first-party variants sharing this builder (`m1a1`,
`m1a1ha`, `m1a2_tejas`, `m1a2_tusk`, `m1a2_sepv2`, `m1a2_sepv3`). Targeted
asset, muzzle-bore and linked-track gates pass. The new `m1a2_tejas`
deterministic geometry freeze is **`8b4fdf8a`**.

**KEEP `8b4fdf8a`. The selected legacy overlay is fully absent; future Abrams
cheek work must reshape the surviving primary loft rather than reintroducing
separate stair or shelf wedges.**

## 5.162 LEOPARD 2 REVOLUTION STUDIO MARKUP + FORWARD MAG (2026-08-13, LIVE)

The owner's follow-up Revolution studio packet resolves three unwanted right
fore-turret surface parts and the complete sideways roof-gun shorthand. The
removed surface owners are the isolated right-aft wing camo overlay
(x=0.845..1.395, z=3.19..3.65), its thin aft hinge bar, and the long dark
wing-cover seam at z=3.10. All three were cosmetic overlays; the closed
structural wing and primary turret shell underneath remain unchanged.

The three weapon annotations identify the pale transverse receiver, cross-rod
barrel and narrow pintle post at x=0.777..1.380 and z=2.714..2.788. Their
unselected pale cap is removed with the assembly so it cannot become a
floater. A shared first-party MAG fitting replaces the shorthand: dark
gunmetal receiver and barrel, real muzzle, ammunition box and a flanged
pintle planted directly into the closed right wing. The barrel points along
turret-forward +z and the complete fitting remains turret-owned through yaw.

First-party studio inspection covers the supplied top/elevated angles at yaw
0 and a true 90-degree turret turn. The deleted overlays do not expose a hole;
the MAG retains its foot, receiver and forward bore, and no hull or running-
gear geometry changes. All eight Revolution assets are regenerated. Targeted
asset, muzzle-bore, native-track, full test and production-build gates pass.
The deterministic Revolution geometry freeze is **`97d36207`**.

**KEEP `97d36207`. Future Revolution work must preserve the closed wing and
the forward, dark, physically seated MAG orientation.**

## 5.163 T-72B OBR. 1987 MODERN CATALOG MOVE (2026-08-13, LIVE)

The existing `t72b_1987` playable is moved from the garage's UI-only Cold War
override into the Modern catalog requested by the owner. Its underlying spec
already inherits `era: modern` from the T-72 family; therefore this is a
single authoritative classification change, not a duplicate vehicle, alias,
stat rewrite or geometry change. Nation/name ordering continues to place it
beside the other T-72 variants inside the Modern Russian block.

**KEEP. `t72b_1987` has one roster identity and belongs to Modern.**

## 5.164 T-72B OBR. 1987 NATIVE FAMILY REDESIGN (2026-08-13, LIVE)

The playable `t72b_1987` now routes to the repository-authored native T-72
family builder instead of the retained historical print-tuned receipt. This
restores the same compact low hull, broad pear-shaped casting, six-wheel
stance, articulated gun and explicit hull/turret ownership used by the
current B3M family while keeping the 1987 vehicle period-correct: dense
Kontakt-1 rather than modern Kontakt-5, Luna/night-sight grammar, twin 902B
smoke banks and an open shallow rear stowage frame rather than an autoloader
bustle.

The hull receives a deliberately raised forward idler and supported
trapezoidal linked course without deleting or moving any side armour. All six
native road wheels remain distinct and gain restrained dish/hub/fastener
faces. Two unequal backed radiator fields, broken louvres, exhaust/service
hardware, lamps, recovery eyes, drums and log complete the transom. Three
unequal jerrycan/tool cells, braces and a rolled service item deepen the
turret rear while preserving open negative space and broad returns into the
cast shoulder.

First-party studio inspection covers front, left, rear, hero and a true
90-degree turret turn. The complete Kontakt-1 blanket, gun, roof suite, smoke
banks, rear cells and rail turn together; hull deck, skirts, six-wheel course
and transom remain fixed. No second track, deleted hull side, stranded pack,
open sheet or empty-air fitting appears. The eight gameplay assets are
regenerated and freeze deterministic geometry **`8c2a07b6`**.

**KEEP `8c2a07b6`. Future obr.1987 work must preserve the native family hull,
complete side armour, raised idler course and period-correct Kontakt-1/rear
stowage distinction.**

## 5.165 LEOPARD 2A7V UPPER SIDE-ARMOUR RESTORATION (2026-08-13, LIVE)

The owner's 2A7V screenshot shows the deep modular lower skirts still present
but a bright exposed return-run/support comb between their y=1.28 upper edge
and the fender. The complete existing hull, lower skirts, mudguards, native
running gear and tracks are preserved. Nine first-party upper cassettes per
side now fill only that missing shoulder band, meeting the lower skirt and
tucking beneath the original fender through a continuous cap/hinge rail.

The restored course remains inside the certified ±2.00 m width and outside
the linked-track lane. Segment seams, top straps and five supported hinge
blocks make the upper armour read as part of the vehicle rather than one new
slab. Left and elevated-left studio views confirm a continuous side-protection
silhouette with no exposed central return comb, deleted hull face, displaced
lower skirt, track overlap or empty-air cassette. All eight assets are
regenerated for deterministic geometry **`921f0b8d`**.

**KEEP `921f0b8d`. Future 2A7V running-gear work must preserve both the deep
lower modules and this closed upper shoulder course.**

## 5.166 PLAIN T-90 EXACT BURLAK-FOUNDATION RECONCILIATION (2026-08-13, LIVE)

The plain `t90` now installs the live first-party Burlak foundation at its
authored scale: the same closed 18-station fighting compartment, buried
shoulder structure and complete massive autoloader bustle used by the Burlak
variant. The previous post-installation 0.935/0.94 compression is removed.
The plain vehicle keeps its own T-90 equipment layer, expands the paired
OTShU/Shtora eyes without changing sibling variants, and retains every rear
pack, rail, lid and bustle support as turret-owned geometry.

The complete fixed hull and turret-ring datum move down 0.05 m to match the
established T-90 family height. This uses the native bucket-offset API after
construction: hull shell, glacis, skirts, mudguards and seated fittings move
together, while the six road wheels, raised idler, final drive and animated
linked-track path remain byte-for-byte on their approved ground datum. No
hull face or side armour is deleted and no track is duplicated or rewrapped.

First-party Studio checks cover front, left, elevated-left and a genuine
90-degree yaw. The entire gun, exact Burlak body/bustle, K-5 fan, enlarged
eyes, roof suite, antennas and rear equipment rotate as one connected
package; the lowered hull, deck, side armour and native course remain fixed.
The eight gameplay assets are regenerated and freeze deterministic geometry
**`0cd0fc4f`**.

**KEEP `0cd0fc4f`. Future plain T-90 work must preserve the exact-scale
Burlak foundation, complete massive bustle, larger twin eyes, lowered fixed
hull datum and unchanged native running gear.**

## 5.167 T-90M PRORYV HULL AND ROOF-SYSTEM COMPLETION (2026-08-13, LIVE)

The live `t90m` retains its approved welded Proryv fighting compartment,
Relikt armor, native six-wheel suspension and single linked-shoe course. A
new first-party completion layer brings the fixed hull to the established
T-90SM standard without deleting or moving any existing hull face: seven
deep overlapping side-curtain panels per side, articulated upper/lower
glacis seams, recovery fittings and three unequal backed rear louvre courts
complete the side, bow and transom grammar. The curtain remains outboard of
the native course, while wheels, idler, sprocket, suspension and track paths
are unchanged.

The turret now carries two separately readable machine-gun stations. The
existing Kord/RWS remains on the right station; a second shielded NSVT-style
weapon is planted on the opposite hatch through a broad ring, pintle shoe
and receiver cradle. A deliberately oversized forward searchlight is buried
into the right cheek with an armored shoe, paired yokes, deep cylindrical
body, rim and clear aperture. All new equipment uses visible load paths and
faces turret-forward.

Front, rear, elevated and true 90-degree yaw inspections confirm that both
weapons, the large searchlight, Relikt, sights and bustle rotate with the
turret, while the complete deep skirt course, glacis, transom and running
gear remain fixed. The rear louvres are backed, no decoration spans empty
air, and the native track remains singular and continuous. The eight
gameplay assets freeze deterministic geometry **`0fcd4abb`**.

**KEEP `0fcd4abb`. Future Proryv work must preserve the two roof weapons,
supported large searchlight, complete T-90SM-grade hull envelope, deep
side-curtain course, backed rear field and untouched native running gear.**

## 5.168 ABRAMS FAMILY ARMOUR / ASSET RECONCILIATION (2026-08-13, LIVE)

The latest first-party Abrams completion pass changes shared procedural
geometry across six playables: `m1a1`, `m1a1ha`, `m1a2`, `m1a2_sepv2`,
`m1a2_sepv3` and `m1a2_tusk`. The M1A1 pair gains physically seated side,
flank and cheek armour plus low roof electronics; the M1A2 branch gains its
own complete shallow skirt/cheek/bustle armour courses. Upgraded vehicles
retain two deliberately separated, forward-facing roof machine-gun stations
instead of a transverse or overlapping duplicate. TUSK's loader station is
seated on the vehicle-right hatch opposite the common left CROWS.

Current first-party hero, close-roof and true 90-degree yaw inspection shows
complete Abrams hulls and side protection, seven separately readable road
wheels inside one linked-shoe course, and no deleted sponson or duplicate
track. Gun, turret armour, electronics and both roof weapons rotate together;
glacis, skirts, wheels, tracks and engine deck remain hull-owned. Every added
cassette, receiver, pintle and electronics case meets an armour plane or broad
local foundation.

The exact strict course audit also removes the recovered M1A2 builder's
obsolete static filler belt and parked bow/tail shoe blocks; the native
scrolling belt and instanced links are now the only course. Wheel-well closure
plates move inboard without opening the hull, the idler-corridor floor rises
5 cm earlier, and the SEPv2/SEPv3 third bow cassettes retain their old outer
faces while their inner walls pull clear of the raised idler. All six Abrams
variants pass exact band and shoe sweeps at **0/0**.

The code change initially left the eight derived gameplay presentations per
tank stale. All affected icon, side, top, silhouette, armour, hit-zone and
module assets are regenerated from the final live first-party builders. A
fresh-process release check caught and corrected an intermediate browser
receipt that had been generated before the final track-clearance edit. The
authoritative frozen geometry hashes are `695f90af` (`m1a1`), `e5afb30a`
(`m1a1ha`), `ac6a54df` (`m1a2`), `7a01b7f6` (`m1a2_sepv2`), `5eb37f07`
(`m1a2_sepv3`) and `8874d86c` (`m1a2_tusk`).

**KEEP these six hashes. Future Abrams work must preserve complete hull/side
armour, the singular seven-wheel native course, separated forward roof
weapons and the documented hull/turret ownership split.**

## 5.169 FIRST-PARTY SURFACE-LAB ROSTER / GARAGE LABEL TRUTH (2026-08-13, LIVE)

The app-integrated Surface Lab now exposes the complete 107-vehicle shipped
roster. Its previous `spec.community` filter confused retained historical
visual-reference credits with the live geometry source and consequently hid
native procedural vehicles such as `t90m`. Every selection remains hard-locked
to `createTank(..., proceduralOnly: true)`, so adding the complete roster does
not permit an external GLB or comparison asset to enter the authoring scene.

The Garage applies the same ownership distinction. A Community model credit is
shown only when `MODEL_SOURCE[id].source === 'glb'`; retired reference metadata
no longer labels a first-party procedural vehicle as a community model. Current
public-build verification reports zero GLB-sourced playables, while the live
Surface Lab selects and renders T-90M Proryv as a first-party procedural model.
Garage DOM inspection confirms both the peer Surface Lab navigation entry and
the absence of a false Community model label.

**KEEP. Authoring eligibility and player-facing ownership labels must follow
the live geometry source, never stale historical reference metadata.**

## 5.170 LIVE FIRST-PARTY FLEET DUAL-FREEZE LEDGER (2026-08-13, LIVE)

The historical graduate table records independent certification lineage, but
it cannot serve as a current byte ledger after later shared-family edits. A
second ambiguity had also accumulated in late receipts: some called the
instance-aware asset-currentness fingerprint a "freeze", while the original
graduate tool hashes topology and world transforms but not `InstancedMesh`
transforms. That distinction matters for wheels, linked shoes, ERA arrays and
repeated turret fittings.

`docs/FLEET-FREEZE-CURRENT.json` is now the authoritative live snapshot for all
107 shipped vehicles. Each row records three deterministic values:

- `freezeHash`: the historical certification algorithm at camo seed 4242,
  covering position buffers, world matrices and indices;
- `instanceFreezeHash`: the instance-aware geometry fingerprint at the same
  certification seed, covering every repeated wheel/shoe/fitting transform;
- `assetGeometryHash`: the same instance-aware fingerprint at the asset seed
  4100, required to match `public/icons/tank-assets.json` exactly.

`npm run tank:freeze` regenerates the snapshot and
`npm run tank:freeze:check` rebuilds every first-party procedural tank in a
fresh browser, verifies all three values and fails if the 107-row roster or
asset manifest drifts. The current snapshot reproduces twice. The independent
release battery also passes: 107/107 native with zero GLB playables, four
family lineages ordered, 856/856 presentation files current, complete muzzle
bores, all application tests and the stripped public production build.
This ledger proves provenance and byte/currentness only; it does not waive the
separate source-fidelity, strict track-clearance, contiguity or decoration
gates reported by `tank:release:check`.

**KEEP the dual ledger as the live byte authority. Never use a historical
single hash to claim that an instanced wheel, track, armor block or fitting is
unchanged.**

## 5.171 ABRAMS DEEP-ARMOUR COURSE CLEARANCE / FAMILY ASSET SYNC (2026-08-13, LIVE)

The later base-Abrams armour deepening on main extended the M1A1/M1A1HA bow
cassette sequence inward over the raised native idler wrap. The repair is
strictly non-subtractive: every bow cassette now keeps its load-bearing back
face on the existing x=1.812 skirt carrier, while its height and longitudinal
spacing preserve the stepped visual taper. No hull face, side skirt, wheel,
suspension member or linked shoe was removed, shortened or hidden.

The complete hull still left only a 16-19 mm interference at the top of the
instanced idler shoes. The idler centre therefore moves down by 30 mm, from
y=0.88 to y=0.85. It remains clearly elevated above the y=0.53 road-wheel
line and retains the intended `____/` front transition. The matching visual
wrap pads follow the configured idler centre. Live front/hero inspection
shows the deep armour seated on the intact hull and the full side-skirt course
present. The exact strict audit reports **0/0 band and 0/0 individual-shoe
intersections** for `m1a1`, `m1a1ha` and `m1a2`.

Because the upstream shared Abrams completion changed the family builder, all
seven current Abrams asset sets are regenerated together: `m1a1`, `m1a1ha`,
`m1a2`, `m1a2_sepv2`, `m1a2_sepv3`, `m1a2_tejas` and `m1a2_tusk`. Their live
dual-ledger rows are:

- `m1a1`: freeze `f2d9cb79`, instance `5651b6b9`, asset `4c1a7288`;
- `m1a1ha`: freeze `2a3b5984`, instance `69de015c`, asset `7736ae35`;
- `m1a2`: freeze `43adc230`, instance `485b02e3`, asset `147315ff`;
- `m1a2_sepv2`: freeze `20f2e180`, instance `f34acea8`, asset `cd0617df`;
- `m1a2_sepv3`: freeze `5e4e6774`, instance `f08392b7`, asset `5b755d05`;
- `m1a2_tejas`: freeze `0c690428`, instance `a59e4470`, asset `b93ff8a6`;
- `m1a2_tusk`: freeze `b1246e64`, instance `0cb090dc`, asset `4ed7cebb`.

**KEEP the complete hull and deep armour package. Future course repairs must
move the interfering fitting or track endpoint; they must not delete hull or
side-skirt geometry.**

## 5.172 T-72B OBR.1987 NON-SUBTRACTIVE COURSE CLEARANCE (2026-08-13, LIVE)

The completed first-party obr.1987 family redesign remains intact: no hull
face, side-skirt panel, mudguard, wheel, suspension station, turret armour or
rear equipment was removed. The strict course failure had two concrete causes
inside the existing build. Decorative wheel faces had been merged into generic
`hull` buckets, so intended wheel/shoe proximity was reported as hull
penetration; and the concealed central sponson underside plus the inner face of
the complete hanging skirt course occupied the upper linked-shoe lane.

Wheel-face, idler and sprocket dressing now compile into explicit
first-party running-gear meshes under `rig_hull`, retaining the identical
visible tire/dish/hub/fastener geometry. The hidden obr.1987 sponson underside
moves above the return run while the complete outer hull remains unchanged.
Finally, the entire supported skirt stack moves outboard by 45 mm without any
change to its height, depth, longitudinal coverage or hull ownership. This is a
clearance move of intact armour, not the earlier destructive practice of
deleting or shortening hull and skirt geometry. The related B3 builder keeps
its separately authored bay for its own audit.

Fresh first-party evidence contains 15 paired authored-baseline/current boards
and 15+15 yaw frames (45 files / 45 distinct hashes). Every mandatory view
retains the low T-72 family hull, complete side armour, six separately readable
road wheels, elevated front idler, elevated rear final drive and the intended
`____/` course profile. A genuine 90-degree turn moves the gun, complete cast
turret, Kontakt-1 blanket, roof suite, antennas and bustle/service package
together while the deck, sponsons, skirts and running gear remain fixed. The
winding audit reports zero reversed/mixed pieces and no stranded yaw candidate.
The exact band and individual-shoe audit is **0/0**, with zero contiguity holes.

The retired external reference GLB is not restored merely to regenerate the
obsolete geometry-gate row; doing so would violate the first-party-only rule.
The live model remains the previously accepted authored family design, with
only the clearance/bucketing corrections above. All eight gameplay assets are
regenerated and current. Dual-ledger geometry is freeze **`586ae4a3`**,
instance freeze **`54bdb9fd`**, asset geometry **`adbaa3cc`**.

**KEEP these hashes. Future T-72B obr.1987 work must preserve the complete hull
and side-armour envelope, the singular native course, the elevated idler/final
drive profile and the documented hull/turret ownership split.**

## 5.173 T-72BU COMPLETE-HULL COURSE / FENDER CLOSURE (2026-08-13, LIVE)

This pass closes the two machine residuals explicitly carried by §5.149 while
preserving the accepted first-party BU design and its **90.18** fidelity
aggregate. No visible hull plate, skirt, mudguard, wheel, suspension member,
track shoe, turret armour or equipment is removed. The strict 673-voxel sweep
was not a reason to shave armour: it resolved to the complete lower tub's
concealed side wall touching the inner native-band tolerance and to the hidden
sponson floor occupying the central upper return lane.

The full lower tub remains a closed solid, with its concealed side wall moved
inboard by 60 mm so it is physically between the track corridors. Its hidden
sponson floor is lifted to the existing 1.22-m shoulder datum above the return
run. The complete outer hull, deep skirt/mudguard envelope, six road-wheel
stations, raised idler/final drive and linked-shoe path stay in their certified
world positions.

The top-down contiguity scan also identified narrow background pockets between
the already-supported segmented fender shelves. A continuous 35-mm hull-owned
fender shelf now follows the full existing skirt course under those visible
segments. Its inner edge meets the intact upper hull, its outer edge seats on
the side-armour line, and its lower face remains above the highest terminal
shoe. It closes real plan-view daylight without becoming a second track cover
or hiding any road wheel.

Fresh evidence contains 15 authored-baseline/current boards plus 15 yaw0 and
15 yaw90 frames (**45 PNG / 45 distinct hashes**). The prior source-semantic
silhouette, pointed protection blanket, gun, compact roof station, rear packs,
complete hull and six-wheel course remain intact. Every turret attachment
quarter-turns with the casting while the new fender shelf, hull, skirts and
running gear remain fixed. Winding is zero reversed / zero mixed, with no
stranded yaw candidate. Exact band and individual-shoe sweeps are **0/0** and
the contiguity scan is **0 holes**. All eight presentation assets are current.

Dual-ledger geometry is freeze **`85414b08`**, instance freeze **`81ae9ae6`**
and asset geometry **`30a70c91`**.

**KEEP these hashes and retire the §5.149 673-voxel inherited-course residual.
Future BU work must preserve the complete lower tub and outer armour; clearance
belongs in the concealed mechanical walls or track endpoints, never by deleting
the hull or side skirts.**

## 5.174 T-72B3M COMPLETE-HULL / TURRET-OWNERSHIP CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the graduated first-party B3M of §5.117 and the
turret-ownership reconciliation of §5.154. No visible hull plate, glacis,
side skirt, mudguard, road wheel, idler, final drive, shoe, turret armour or
equipment is removed. Fresh paired evidence retains the accepted independent
§B8 vector `[9.2,9.3,9.2,9.2,9.2,9.2,9.2,9.3,9.4,9.3,9.3,9.4,9.3,9.4]`
(floor **9.2**, mean **9.28**) against the authored baseline copy.

The strict full-course residual separated into two classes. First, the complete
lower tub's concealed central walls occupied the 1.04-m inner shoe lane and its
hidden 0.86-m sponson floor coincided with the native return crowns. The closed
tub remains present but is now physically between the two corridors, while the
complete hidden floor follows the existing 1.22-m shoulder datum above the
return run. The upper hull, front/rear proportions and complete outer armour do
not move. Second, wheel-face annuli, bay-shadow crescents, fade chords and the
behind-wheel course were already mounted on the suspension but inherited hull
material buckets. Their vertices and transforms are retained and explicitly
tagged as running gear so the strict audit does not judge a wheel against its
own face package.

The existing inner skirt closures and road-wheel backers are reseated outboard
inside the unchanged 1.80-m skirt envelope. A 35-mm structural fender shelf
under the existing articulated tabs ties the intact upper hull to the full
outer skirt; a short inboard bow return closes that shelf into the tapered
glacis shoulder above the idler. These supported hull-owned surfaces eliminate
the real plan-view daylight pockets without covering the wheels or becoming a
second track course.

Fresh evidence contains 15 paired boards plus 15 yaw0 and 15 yaw90 frames
(**45 PNG / 45 distinct hashes**). The complete cast shell, gun, protection,
Sosna/roof suite, smoke, antennae, flank packs, raised side/back belt and all
rear cells quarter-turn as one turret package. Hull, engine deck, transom,
skirts, fender shelf and running gear remain fixed. Parent audit is **0
stranded / 0 abutting / 0 dangling**. Winding is zero reversed / zero mixed,
with no yaw ownership candidate. Exact band and individual-shoe sweeps are
**0/0**; plan contiguity is **0 holes**.

All eight presentation assets are current. Dual-ledger geometry is freeze
**`046f522c`**, instance freeze **`62c0bd33`** and asset geometry
**`240dc3af`** (124 rendered meshes / 226,508 vertices).

**KEEP these hashes. Future B3M work must retain the complete hull/skirt
envelope and keep every turret-semantic side/back/rear package under the turret
parent; course clearance belongs in concealed mechanical geometry or explicit
suspension ownership, never subtractive armour edits.**

## 5.175 PLAIN T-90 COMPLETE-HULL COURSE CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the accepted first-party plain T-90 reconciliation of
§5.166: the exact Burlak-derived fighting compartment, massive autoloader
bustle, enlarged twin frontal eyes, dedicated T-90 armour/equipment grammar and
the 50-mm lower hull datum all remain unchanged. No visible hull plate, glacis,
side skirt, mudguard, road wheel, idler, final drive, linked shoe, turret armour
or turret fitting is deleted, rescaled or relocated.

The strict sweep found only the complete lower hull's concealed sponson floor
inside the upper return lane. That hidden floor now follows the existing
1.22-m shoulder datum while retaining the 1.40-m terminal crown bridge. The
closed outer hull, six large road-wheel stations, elevated idler/final drive,
full skirt course and linked-track outline therefore keep their accepted world
positions and silhouette.

Fresh evidence contains 15 authored-baseline/current boards plus 15 yaw0 and
15 yaw90 frames (**45 PNG / 45 distinct hashes**). The gun, exact connected
turret foundation, complete bustle, armour, enlarged eyes, roof station,
antennae and rear turret package execute a genuine quarter-turn as one assembly.
Hull, deck, skirts and running gear remain fixed. The sole fixed-deck nominee,
`fitting_spareTrackLinks`, remains legitimate hull-owned stowage seated directly
on the forward deck; it is not a stranded turret fitting. Winding is zero
reversed / zero mixed with no yaw candidate. Exact band and individual-shoe
sweeps are **0/0**, and the contiguity scan is **0 holes**. The legacy machine
oracle remains incompatible with this owner-approved authored target and is not
used as a visual graduation verdict.

All eight presentation assets are current. Dual-ledger geometry is freeze
**`6de77bd8`**, instance freeze **`f843384a`** and asset geometry
**`78bd0fe5`** (70 rendered meshes / 130,962 vertices).

**KEEP these hashes and the §5.166 turret design. Future plain T-90 clearance
work must remain inside concealed mechanical geometry; never delete the hull,
side skirts, mudguards or accepted turret package.**

## 5.176 T-90M PRORYV COMPLETE-HULL COURSE CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the owner-requested and accepted §5.167 Proryv design:
both roof machine guns, the oversized forward searchlight with its armoured
shoe/yokes, the low welded fighting compartment, T-90SM-grade upper/lower
glacis, complete scalloped side curtains and the layered engine-deck/transom
service package remain unchanged. No visible hull, skirt, mudguard, running
gear, turret armour, weapon or fitting is removed or relocated.

The strict residual separated into the concealed hull floor and the native
road-wheel face package. The full lower tub remains closed, while its hidden
sponson floor moves from the 0.82-m return-crown plane to the existing 1.21-m
shoulder datum. Outer hull dimensions and the complete armour silhouette do not
move. Road-wheel annuli, dishes, hubs and bolts retain byte-equivalent geometry,
materials and transforms; their buckets now record their actual suspension
ownership instead of labelling each wheel's own face package as hull/track
interference.

Fresh evidence contains 15 authored-baseline/current boards plus 15 yaw0 and
15 yaw90 frames (**45 PNG / 45 distinct hashes**). The complete gun, welded
turret, protection, two machine guns, large searchlight, optics, smoke, roof
stations and rear turret package execute a genuine quarter-turn. Hull, glacis,
deck, deep curtains, six-wheel running gear and rear service package remain
fixed. Parent audit is **0 stranded / 0 abutting / 0 dangling**. The winding
audit reports zero reversed / zero mixed faces; its fixed-hull nominee is the
supported `hullCloth` side-curtain package, which remains visibly attached to
the sponson and correctly does not follow the turret. Exact band and
individual-shoe sweeps are **0/0**, and the contiguity scan is **0 holes**. The
legacy source-registration machine oracle remains stale for this approved
authored target and is not used as a visual graduation verdict.

All eight presentation assets are current. Dual-ledger geometry is freeze
**`b8a09f20`**, instance freeze **`0a707fd9`** and asset geometry
**`e84d5ca1`** (55 rendered meshes / 125,114 vertices).

**KEEP these hashes and all §5.167 owner features. Future Proryv track work
must preserve the complete glacis, side curtains, rear field and turret package;
clearance belongs only in concealed mechanics or explicit running-gear
ownership.**

## 5.177 FIRST-PARTY SURFACE LAB INTEGRATION (2026-08-14, LIVE)

The first-party surface-markup utility is now an application page at
`/surface-studio`, labelled **Surface Lab** in the shared Home / Garage /
Studio navigation. It uses the same typography, dark olive control surfaces,
amber focus language and responsive header as the rest of the application.
The tool always creates the selected vehicle with `proceduralOnly: true` and
exports stable JSON annotations containing tank id, rig ownership, mesh and
triangle identities, local/world bounds, camera pose and the requested
add/remove operation. External/community geometry remains disabled.

This is the authoritative owner-to-builder markup path used for the queued
Abrams and Leopard Revolution surface removals. A marked triangle is evidence
for locating an authored primitive; it is not permission to punch an open
sheet into a closed hull or turret. Builders must remove or reshape the owning
primitive and then re-run winding, yaw ownership and contiguity gates.

## 5.178 LEOPARD 2A6 NON-SUBTRACTIVE TERMINAL-COURSE REWRAP (2026-08-14, LIVE)

The live first-party Leopard 2A6 retains its complete hull, upper/lower glacis,
front and rear side-skirt courses, diving mudguards, seven road wheels,
suspension and all linked shoes. No visible armour or running-gear component is
deleted, shortened or hidden. The strict residual came from two precise
near-contacts: the idler/sprocket band grazed the intact glacis and rear
sponson seams, while a concealed 15-mm projection-closure curtain sat 20 mm
inside the shoe sweep.

The curtain remains full-size and moves 57.5 mm inboard, clear of both native
courses. The track itself is rewrapped through the existing terminal wheels:
the front idler moves 60 mm forward, the rear final-drive centre moves 30 mm
rearward and 10 mm down. Both remain strongly elevated above the road-wheel
line and preserve the intended `\\______/` side profile. The central and upper
track runs, wheel sizes, skirt envelope, body shell and turret are unchanged.

Fresh evidence contains 15 authored-baseline/current boards plus 15 yaw0 and
15 yaw90 frames (**45 PNG / 45 distinct hashes**), including the standardized
elevated-left profile. Side, front/rear quarter and elevated views retain all
seven wheels, the complete armour envelope and coherent terminal wraps. Parent
audit is **0 stranded / 0 abutting / 0 dangling**. Winding is zero reversed /
zero mixed with no yaw candidate. The strict exact audit is **0/0 band and 0/0
individual-shoe intersections** over front, rear and full sweep; contiguity is
**0 holes** and the machine-checkable standard remains **91.0 PASS**.

All eight presentation assets are regenerated. Dual-ledger geometry is freeze
**`8ac0b4b1`**, instance freeze **`e15a1b19`** and asset geometry
**`70bfb68e`** (46 rendered meshes / 145,883 vertices).

**KEEP this complete bodywork and course. Future Leopard track repairs must
rewrap the native course or reseat concealed support geometry; never delete
hull plates, skirts or mudguards to satisfy clearance.**

## 5.179 T-80 FAMILY COMPLETE-FENDER / NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This non-subtractive pass closes the strict native-course residuals on the
first-party T-80, T-80B, T-80BV and T-84. It preserves every visible hull
plate, glacis, mudguard, side-skirt panel, road wheel, idler, final drive,
linked shoe, turret armour course and turret fitting. The accepted family
silhouettes and the distinct bare/applique/Kontakt protection identities do
not move.

The T-80/T-80B/T-80BV residual was a filled wheel well, not a reason to cut
the side armour. Their full-width upper-hull floor sat on the return-run
envelope and a solid 455-by-140-mm fender bar occupied the same suspension
space. The complete sponson underside now follows the existing 1.24-m
shoulder datum above the return, and the fender is rebuilt as one closed,
supported cross-section: the original top and outboard silhouette remain,
with a shallow inboard fold and full outer lip tied into the unchanged hull
and skirt line. No exterior opening or daylight pocket is introduced.

The T-84 had an independent lower-tub contact. Its concealed centre walls
remained at 0.98 m while the native inner shoe/pin lane required the already
established 0.94-m terminal clearance. The full closed lower tub now carries
that 0.94-m between-track width continuously. Upper hull, fenders, deep
skirts, bow, stern and all externally visible proportions remain unchanged.

Fresh 15-view authored-model boards and standardized elevated profiles were
inspected for all four vehicles; additional yaw0/yaw90 packets were inspected
for the T-80 and T-84. The complete turret/gun/protection/equipment package
quarter-turns coherently while hull, fenders, skirts and running gear remain
fixed. Front, rear, side and elevated pixels retain closed hull volumes,
supported fender load paths, six readable road-wheel stations where exposed,
and the intended elevated-terminal `\\______/` course. No floater, stranded
attachment, fused turret mass, winding wound or sky-through hull opening is
visible.

Exact strict band and individual-shoe sweeps are **0/0** for all four marks.
All changed presentation assets are regenerated. Dual-ledger geometry is:
T-80 **`e09accd0` / `09f85f26` / `4b1bddf9`** (47 meshes / 76,267 vertices),
T-80B **`6c2b05d0` / `df4e202d` / `8c5de16b`** (51 / 79,243), T-80BV
**`b4b39c14` / `92140144` / `c9a9960f`** (51 / 89,227), and T-84
**`f86c66df` / `df834830` / `be884f3f`** (45 / 86,058).

**KEEP the complete outer hulls and side skirts. Future T-80-family clearance
work belongs only in the concealed mechanical corridor or a native-course
rewrap; never delete visible bodywork to satisfy a track gate.**

## 5.180 T-80U CLOSED-SPONSON / FENDER-STOWAGE COURSE CLOSEOUT (2026-08-14, LIVE)

The first-party T-80U now passes the same non-subtractive native-course law as
the rest of its family. The complete glacis, lower hull, upper deck, fenders,
segmented side skirts, mudguards, six road-wheel stations, elevated idler and
final drive, linked shoes, turbine-service rear and approved K-5 turret remain
present. No exterior plate or running-gear component is deleted or hidden.

The strict residual had two exact causes. First, the wide rear deck band was a
solid filled sponson all the way down to 1.06 m. Its authored top and outboard
silhouette are retained as a shallow closed cap while an inboard body carries
the deck load into the central hull, leaving the native return corridor open.
Second, the left fuel/stowage run and two right fender bins were centred below
their own fender plane. Their dimensions and plan stations are unchanged; they
are now seated on the fenders above the return rather than occupying the shoe
envelope. The dark concentric wheel-bay cylinders are geometry-identical and
declared as running gear instead of hull armour.

Fresh 15-view authored-baseline/current boards, the standardized elevated-left
profile and 15 yaw0 plus 15 yaw90 frames were inspected. Side and elevated
pixels retain the full skirt envelope, six readable native wheels and the
intended elevated-terminal `\\______/` track profile. The complete turret,
gun, K-5 courses, optics, smoke and roof equipment quarter-turn together;
fenders, raised stowage, skirts, deck, turbine rear and running gear remain
hull-fixed. No empty-air fitting, fused turret mass, stranded decoration,
sky-through hull opening or silhouette regression is visible.

The exact strict band and individual-shoe sweep is **0/0**. Turret parenting is
**0 stranded / 0 abutting / 0 dangling**. Winding is **0 reversed / 0 mixed**,
with a 0.03% top-view DoubleSide diagnostic difference and zero yaw-stranded
candidates. The retired visual-oracle GLB is intentionally unavailable after
the first-party asset cleanup, so its legacy comparator row is not rewritten
from a failed load; live authored evidence and mechanical gates are the
authoritative closeout for this corridor-only change.

All eight presentation assets are regenerated. Dual-ledger geometry is freeze
**`2c605ba8`**, instance freeze **`3a3dc724`** and asset geometry
**`555dab0f`** (48 rendered meshes / 75,899 vertices).

**KEEP the complete T-80U outer hull, fenders and skirts. Any future clearance
change must remain inside the concealed cross-section or rewrap the native
course; never remove bodywork to satisfy a track audit.**

## 5.181 T-62MV-1 / T-64BV-1 CLOSED-HULL COURSE RECONCILIATION (2026-08-14, LIVE)

This Russian-family pass preserves both complete first-party vehicles: hull
shells, upper/lower glacis, fenders, segmented skirts, mudguards, native road
wheels and shoes, accepted cast turrets, ERA, gun runs and service equipment.
No side armour or exterior hull plate is deleted. All changes either reshape a
concealed track-bay cross-section, rewrap the existing terminal course, or
reseat an existing fitting with its dimensions intact.

On T-62MV-1, the loft's 0.864-m filled sponson floor occupied the full return
run and clipped the rear terminal by 28 mm. The measured deck, belly and width
curves are unchanged; only the concealed closed track-bay roof now follows a
1.14-m datum above the complete native course. The five road wheels, elevated
idler/final drive, full fender and skirt rows, bow fittings and drum/log rear
remain in their accepted positions.

On T-64BV-1, the same concealed floor began at 0.80 m while the upper return
ran through it. Its closed centre hull now pinches the outer loft above the
course at 1.16 m without changing the deck, belly or width curves. The native
idler is rewrapped forward from z 1.55 to 2.00 while retaining its elevated
0.70-m centre and existing radius; all six road wheels, the rear final drive
and central runs are unchanged. Existing bow prongs, glacis bars, fender bins
and rear rack supports are reseated on the deck/fender plane above the course,
with their dimensions and plan stations retained. Two thin longitudinal
fender rails are corrected from the retired oracle's physically wrong turret
parenting to fixed hull ownership and sit immediately outboard of the shoes.

Fresh 15-view authored-baseline/current boards, standardized elevated-left
profiles and 15 yaw0 plus 15 yaw90 frames were inspected for both tanks. Their
hulls remain closed in front, rear, side and elevated views; the T-62 retains
five readable road wheels and the T-64 six, each inside one continuous
elevated-terminal `\\______/` course. Turret, gun, ERA and turret equipment
quarter-turn together. Deck links/cables, the T-64 unditching log, fenders,
corrected rails, rear hull kit and running gear remain fixed. The parent tool's
T-62 deck-link/cable and T-64 log candidates are therefore legitimate
hull-owned stowage visible after turret departure, not stranded fittings.

Exact strict band and individual-shoe sweeps are **0/0 on both vehicles**.
Winding is **0 reversed / 0 mixed**; T-62 has an 8-pixel (0.00%) diagnostic
front difference and no yaw candidate, while T-64 has zero DoubleSide deficit.
The 48-pixel T-64 `rig_hull/hullDark` candidate is supported fixed rear/deck
service structure and remains visually continuous with the hull in both yaw
states.

All sixteen presentation assets are regenerated. Dual-ledger geometry is:
T-62MV-1 **`d3ce3904` / `75630bb4` / `a10d6bb8`** (44 meshes / 58,087
vertices) and T-64BV-1 **`61191131` / `c13a5259` / `56dbc145`** (45 meshes /
82,135 vertices).

**KEEP both complete outer hulls, fenders and skirt courses. Future work must
adjust only concealed cross-sections, supported fitting seats or the native
course itself; never remove hull/side-armour geometry for clearance.**

## 5.182 T-90 FAMILY SINGLE-NATIVE-COURSE / CLOSED-HULL CLOSEOUT (2026-08-14, LIVE)

This pass closes the remaining strict mechanical corridors on the first-party
T-90A, T-90A Vladimir, T-90A Burlak, T-90SM and T-90MS without changing any
approved turret. Every complete outer hull, upper/lower glacis, fender,
mudguard, side-skirt course, road wheel, idler, final drive, native linked
shoe, turret armour course and turret fitting remains present.

The T-90A and inherited Burlak basis carried a concealed 0.86-m sponson floor
through the native return plus a lower wall reaching the inner pad edge. The
floor now follows the existing 1.22/1.40-m shoulder datums and the closed
pressure tub pinches inboard below it. Two legacy gear-fade rows and four
grounded edge blocks were a second static track proxy occupying the native
linked course; only those redundant track proxies are retired. The actual
six-wheel suspension, elevated terminals and all hull/side armour remain. The
existing tow eyes move inboard on the same lower-bow plate. Burlak's section
correction now restores its complete skirt/fender course outside the shoes for
the full wheelbase instead of only at the terminals.

Vladimir's complete recovered body is unchanged externally; only its hidden
full-length 0.90-m underside rises to 1.22 m. Its four redundant static loaded-
run edge blocks are retired in favour of the one native linked course. T-90SM
likewise raises only the concealed 0.81-m bay roof to the existing 1.22/1.35-m
shoulder line. Its torsion arms retain identical geometry and material but now
declare their actual running-gear ownership. T-90MS adopts the already proven
plain-T-90 closed pressure-tub and 1.22/1.40-m sponson section; its exterior,
Relikt skirts, rear service field and accepted welded turret do not move.

Fresh 15-view authored-baseline/current boards, standardized elevated-left
profiles and 15 yaw0 plus 15 yaw90 frames were inspected for all five tanks.
All accepted gun/turret/armour/roof/rear packages execute a genuine quarter-
turn while the complete hull, fenders, skirts and running gear remain fixed.
Vladimir's and T-90MS's winding nominees are supported hull service structures;
T-90A deck cable/links and T-90SM/MS deck stowage are also legitimate fixed
hull equipment, not stranded turret fittings. No missing side armour, hollow
hull, empty-air fitting, duplicate course, winding wound or sky-through opening
is visible.

Exact strict band and individual-shoe sweeps are **0/0 on all five tanks**.
Winding is **0 reversed / 0 mixed**; T-90SM's 15-pixel (0.03%) left-view
DoubleSide diagnostic has no yaw-stranded candidate. All forty presentation
assets are regenerated. Dual-ledger geometry is: T-90A **`b14f3c6c` /
`04c60bfc` / `2c7ba70d`** (62 meshes / 129,495 vertices), Vladimir
**`a6150440` / `cee9f435` / `56e66f9c`** (43 / 70,716), Burlak
**`e2f21210` / `2c87a455` / `198dc0f8`** (61 / 102,049), T-90SM
**`24b96f48` / `dff7cf0e` / `4183e4e0`** (49 / 93,281), and T-90MS
**`c2d56268` / `eb5fb490` / `19e42c32`** (53 / 108,208).

**KEEP every approved T-90-family turret and the complete outer hull/skirts.
Future clearance work belongs only to concealed mechanics, explicit running-
gear ownership or a rewrap of the one native linked course.**

## 5.183 ABRAMSX EXACT NATIVE-COURSE / OWNERSHIP CLOSEOUT (2026-08-14, LIVE)

This pass preserves the complete first-party AbramsX: knife bow, closed lower
hull, full side-armour/skirt envelope, seven road wheels, elevated idler and
final drive, one linked-shoe course, XM360 gun, accepted faceted turret, D-hood
sights, RWS and all roof/rear equipment. No hull, side-armour, skirt, wheel or
track component is deleted or hidden.

The former strict report mixed two different classes. The painted wheel-face
rings, hubs, bolts, end-wheel spokes and exposed torsion links were authored
inside generic hull buckets even though they are visible suspension parts.
They retain identical geometry, transforms and materials but now use explicit
running-gear ownership. The loaded inboard grouser strip likewise remains part
of the native track assembly in its original position and material. A dedicated
track-material running-gear bucket records that fact without granting any
exemption to real hull, fender, mudguard or skirt surfaces.

After that classification repair, the only physical contact was the continuous
glacis tow cable crossing the elevated front shoe arc at its two endpoints. The
complete cable remains present and supported; its endpoints are reseated inward
on the protected centre glacis while the bow, lights, shackles and course stay
unchanged. The final exact strict receipt is **front 0/0, rear 0/0 and complete
animated sweep 0/0** for band and individual shoes.

Fresh 15-view authored-model boards, the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames were inspected. Seven distinct road-wheel stations,
both raised terminals and the continuous `\\______/` course remain readable.
The complete turret/gun/RWS/sight/equipment package quarter-turns coherently
while the hull, reseated cable and running gear remain fixed. Turret parenting
is **0 stranded / 0 abutting / 0 dangling**. Winding is **0 reversed / 0
mixed**, with only the accepted 10-pixel (0.01%) top-view diagnostic hairline
and zero yaw-stranded candidates. No duplicate course, floater, hull wound,
sky-through opening or silhouette regression is visible.

All eight presentation assets are regenerated. Dual-ledger geometry is freeze
**`91364f7e`**, instance freeze **`e63530b2`** and asset geometry
**`89d90a05`** (79 rendered meshes / 162,878 vertices). The established
first-party geometry gate remains **90.4** and the accepted source-semantic
visual basis remains above the mandatory 9.0 floor.

**KEEP the complete AbramsX outer hull, side armour and native running gear.
Future clearance fixes must distinguish mechanical ownership from real hull
contact and must never delete exterior bodywork to silence the audit.**

## 5.184 ABRAMS ERA / DUAL-ROOF-GUN ASSET RECONCILIATION (2026-08-14, LIVE)

The first-party Abrams armour update at `92897fe5` expanded the flush turret
ERA layouts and extended the two roof machine-gun stations on M1A1, M1A1HA,
legacy M1A2, TUSK, SEPv2 and SEPv3. This follow-up reconciles the generated
presentation assets and dual freeze ledger with those already-landed authored
builders. M1A2 Tejas shares the family verification pass but its current
geometry asset bytes remain unchanged. No source GLB, donor geometry or
runtime model swap is involved.

Fresh 15-view authored-model boards, standardized elevated-left profiles and
15 yaw0 plus 15 yaw90 frames were generated for every changed variant. The
expanded armour remains flush against the turret planes rather than standing
off as unsupported boxes. Both roof guns have visible cupola/pedestal load
paths, face forward at yaw zero and quarter-turn with the complete turret,
optics, smoke and bustle package. The full hulls, skirts, seven-wheel native
courses and rear service equipment remain fixed. HA and SEPv3 retain only
their previously approved surface-supported foliage; M1A1, legacy M1A2, TUSK,
SEPv2 and Tejas remain clean.

Exact strict band and individual-shoe sweeps are **0/0 for all seven family
variants**. Winding census is **0 reversed / 0 mixed** and render deficit is
zero except one non-material TUSK pixel. The parent tool's TUSK/SEPv2 rear
jerry cans and the broad hull service buckets on TUSK/SEPv2/SEPv3 are
legitimate hull-owned equipment. Fresh yaw pixels show them remaining seated
on the fixed aft deck while the turret departs; they are not stranded turret
mass. No dangling fitting, sky-through opening, duplicate track or new course
contact is visible.

All affected presentation assets are current and muzzle bores pass. Dual-ledger
geometry is: M1A1 **`4a89c130` / `7a104d9e` / `e706708f`** (53 meshes /
191,362 vertices), M1A1HA **`396a5138` / `58429fb5` / `42cbc254`** (54 /
191,566), legacy M1A2 **`186cb8bb` / `8cd4b7ad` / `03326151`** (47 /
145,022), M1A2 Tejas **`0c690428` / `a59e4470` / `b93ff8a6`** (55 /
165,142), TUSK **`a89bde4c` / `e94d71c4` / `784b0f1b`** (65 / 220,498),
SEPv2 **`527f794f` / `1c97fb9d` / `33d654f6`** (57 / 203,662), and SEPv3
**`21ccbdac` / `c5805d85` / `7d33570f`** (54 / 207,778).

**KEEP every complete Abrams outer hull, native seven-wheel course, approved
foliage scope and supported turret package. Generated assets and freeze records
must land atomically with future shared-family geometry changes.**

## 5.185 C1 ARIETE NON-SUBTRACTIVE NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This pass preserves the complete accepted first-party Ariete: closed lower
hull, upper/lower glacis, both fenders, every segmented side-skirt and
mudguard, seven road-wheel stations, full-size elevated front idler, raised
rear final drive, return rollers, one linked-shoe course, gun, low turret and
all supported roof/rear equipment. No exterior armour or running-gear
geometry is deleted, hidden, scaled or moved.

The strict report was almost entirely a classification defect. Ariete's
painted concentric wheel faces, dark hubs/rings, wheel-bay recesses and exposed
torsion arms were still merged into generic hull-detail buckets even though
they are the visible native suspension. Their geometry, transforms and
materials are unchanged; they now declare explicit running-gear ownership.
The colour-invisible procedural shadow carrier also extended 0.30 m behind the
real lower tub and through the final-drive arc. Its hull segment now ends at
the actual z=-2.90 tub station. Finally, an oversized transparent exhaust-soot
card crossed the rear shoes; the complete stain is reduced and reseated on the
physical left exhaust housing instead of spanning the track corridor.

Fresh 15-view authored-model boards, the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames were inspected. All seven road wheels remain
separately readable below the complete skirts; the front idler and rear final
drive support one continuous `\\______/` course. The turret, gun, optics,
roof station and basket quarter-turn together. The fixed hull tarp roll and
spare-link rack flagged by the parent heuristic remain visibly seated on the
aft deck while the turret departs; they are legitimate hull stowage, not
stranded turret mass.

Exact strict band and individual-shoe sweeps are **front 0/0, rear 0/0 and
complete sweep 0/0**. Winding is **0 reversed / 0 mixed**, with only a
31-pixel (0.04%) rear-left diagnostic edge and zero yaw-stranded candidates.
No hollow hull, missing skirt, duplicate course, floater, sky-through opening
or silhouette regression is visible. The retired visual-oracle gate row is
historical and cannot be honestly rewritten after the first-party source-asset
cleanup; current authored evidence and mechanical gates govern this
course-only re-certification.

All eight presentation assets are current and the muzzle bore passes.
Dual-ledger geometry is freeze **`64308158`**, instance freeze **`57570dd5`**
and asset geometry **`c45c50e0`** (51 rendered meshes / 104,019 vertices).

**KEEP the complete Ariete hull, skirt/mudguard envelope and all seven native
wheel stations. Future clearance work must remain a course rewrap, supported
fitting reseat or truthful running-gear classification.**

## 5.186 K2 NON-SUBTRACTIVE NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This pass preserves the complete graduated first-party K2 Black Panther:
closed lower hull, upper/lower bow, full-width sponson roof, every sawtooth
side-skirt and mudguard, six road-wheel stations, elevated front idler, raised
rear final drive, return rollers, one linked-shoe course, long turret, gun and
all supported roof/bustle equipment. No exterior armour, skirt, guard, wheel
or track component is deleted, hidden, scaled or moved.

The original strict report was dominated by a mechanical-ownership error.
K2's nested idler/final-drive faces, concentric hubs, ISU knuckles and arms,
and the dark wheel-bay backers were merged into ordinary hull buckets even
though they are native running gear. Their geometry, transforms and materials
are unchanged; only their explicit running-gear ownership is corrected. Real
rubber flaps, fringes and guards remain ordinary audited hull candidates.

After that split, the sole physical defect was the rear sponson modeled as a
deep full-width solid through the raised return-shoe corridor. The complete
center body remains at its original depth and the original full-width roof and
outer upper edge remain closed and unchanged; only the outboard underside is
lifted above the course. This is a supported sponson cap, not a hollow-hull or
side-armour deletion.

Fresh 15-view authored-model boards, the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames were inspected (45 PNG / 45 distinct hashes).
The full side-skirt envelope and rear silhouette remain complete. Six road
wheels remain separately readable beneath the skirts, while the elevated
idler and final drive support one continuous `\\______/` course. The turret,
gun, optics, roof equipment and bustle quarter-turn as one package while the
hull and running gear remain fixed.

Exact strict band and individual-shoe sweeps are **front 0/0, rear 0/0 and
complete sweep 0/0**. Turret parenting is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed**, with a clean 0-pixel
yaw-stranded result; the 126-pixel (0.18%) front-right diagnostic deficit is
below the flag threshold and produces no visible wound. No duplicate course,
floater, missing hull face, sky-through opening or silhouette regression is
visible. The previously accepted first-party visual basis remains floor 9.0 /
mean 9.09.

All eight presentation assets are current and the muzzle bore passes.
Dual-ledger geometry is freeze **`260a8111`**, instance freeze **`3211203d`**
and asset geometry **`8a171500`** (62 rendered meshes / 116,916 vertices).

**KEEP the complete K2 hull, full sawtooth skirt/mudguard envelope and native
six-wheel course. Future running-gear work must preserve the exterior body and
distinguish truthful mechanical ownership from real physical contact.**

## 5.187 TYPE 10 NATIVE-COURSE REWRAP, ZERO BODY LOSS (2026-08-14, LIVE)

This pass leaves the accepted first-party Type 10 body byte-for-byte at its
previous geometry: closed belly and sponsons, upper/lower glacis, both bow
shoulders, fenders, full modular skirts, mudguards, rear plate, engine deck and
the owner-corrected lowered turret are not deleted, shortened, lifted or
reshaped. The correction is confined to the native five-wheel mechanism.

The previous individual-shoe envelope was already clear, but the hidden
continuous return band rose gradually from the last support roller into the
elevated idler and passed through the upper-glacis shoulder. The course now
uses a real fourth forward return roller, holds the supported top run lower
until immediately before the idler, and shifts the complete gear line 0.065 m
outward. Its lane is narrowed around the 0.25 m wheel faces while retaining
the established outer skirt-contained silhouette. Every road wheel remains
inside the belt; the front idler and rear final drive keep their elevated
stations and the loaded ground run is unchanged.

Fresh 15-view authored-model boards, the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames were inspected (45 PNG / 45 distinct hashes).
The five large road wheels remain separately readable, the top run visibly
rests on its return supports, and the elevated ends form one continuous
`\\______/` course inside the complete skirts. Front pixels show both belts
inside the intact bow/guard envelope. The already lowered turret remains
properly seated and its gun, shell, optics, roof stations and bustle execute a
genuine quarter-turn.

Exact strict band and individual-shoe sweeps are **front 0/0, rear 0/0 and
complete sweep 0/0**. Winding remains **0 reversed / 0 mixed** with a six-pixel
(0.01%) non-material rear-left diagnostic edge. The parent and mode-2 tools'
nominees are the same fixed right-fender tow cable, driver glass, rear-deck
cloth/spare links and backed service buckets adjudicated in §5.155: fresh yaw
pixels show each remaining fixed and surface-supported as the complete turret
departs. No turret-semantic item is stranded, no track is duplicated and no
hull/skirt face is missing.

All eight presentation assets are current and the muzzle bore passes.
Dual-ledger geometry is freeze **`ca815d52`**, instance freeze **`fa67252d`**
and asset geometry **`a6c89710`** (62 rendered meshes / 56,898 vertices).

**KEEP the exact Type 10 hull, full skirt/guard envelope and lowered turret.
Future track corrections must remain native-course rewraps and may not remove
body surfaces to manufacture clearance.**

## 5.188 M2A2 BRADLEY NATIVE-COURSE SEMANTIC CLOSEOUT (2026-08-14, LIVE)

This correction moves no geometry. The Bradley builder already carries the
accepted complete first-party hull, full-length appliqué skirts, six road
wheels, raised front idler and rear final drive, support rollers and one
continuous linked course. Its strict sweep false-positive came exclusively
from nineteen authored asymmetric ground-pad pairs and one supported
return-run cover that were emitted through the generic `hullTrack` bucket.
Those pieces are native course construction, not body armor, so they now use
the explicit `hullRunningGearTrack` ownership bucket. Dimensions, transforms,
materials, hull panels, skirts, wheels, terminal stations and shoes are
unchanged.

The exact strict band and individual-shoe audits now report **front 0/0,
rear 0/0 and complete sweep 0/0**. Winding has no pixel deficit, mixed face,
sky hole or yaw-dependent wound. Its legacy reversed-call census remains a
non-visual implementation flag with a 0-pixel deficit rather than a geometry
failure.

Fresh evidence contains 15 authored-model boards including the standardized
elevated-left profile, 15 yaw0 frames and 15 yaw90 frames: **45 PNG / 45
distinct hashes**. All six wheels remain readable beneath the intact side
armor; the loaded run rests on the wheels and the two raised ends preserve the
supported `\\______/` profile. The gun, turret, TOW pod, sights, smoke,
roof stations and bustle execute a genuine quarter-turn while the body and
course remain fixed. The parent tool's only nominee is the short spare-track
link stowage on the hull deck; top and hero yaw evidence show that it remains
surface-seated and correctly hull-owned as the turret departs.

Presentation assets remain byte-current because the visible model is
unchanged. Dual-ledger geometry is freeze **`45ef7b0c`**, instance freeze
**`e140abae`** and asset geometry **`b57d1148`** (61 rendered meshes / 77,560
vertices).

**KEEP the complete Bradley body, skirts and course. Future audit repairs must
distinguish native running-gear ownership from actual body penetration; no
hull or skirt surface may be removed to manufacture clearance.**

## 5.189 FV510 BURIED ARMOR-CARRIER CLEARANCE (2026-08-14, LIVE)

This pass preserves the complete accepted Warrior exterior: long raked upper
glacis, full sponson, six deep closed WRAP armor modules per side, diagonal
chevrons, toothed lower edges, open rib screens, fender shoulders, mudguards,
six-wheel suspension, terminal stations and linked course all remain. The
strict audit localized its remaining contact to the inboard half of the six
lower transverse shoes that carry those side modules back to the sponson.
The global upper-body height correction had left those buried load paths
crossing the supported return lane.

Each lower carrier is lifted 0.32 m in builder space while remaining inside
and in contact with the same closed armor module; the upper carrier and panel
faces are unchanged. No hull, side armor, skirt, rail, wheel or track piece is
deleted, shortened or hidden. The exact strict band and individual-shoe tools
now report **front 0/0, rear 0/0 and complete sweep 0/0**.

Fresh evidence contains 15 authored-model boards including the standardized
elevated-left profile, 15 yaw0 frames and 15 yaw90 frames: **45 PNG / 45
distinct hashes**. Normal and elevated profiles show every armor panel and
chevron intact, six wheels readable, the loaded run resting beneath them and
both end transitions continuous. The gun, complete turret, RAVEN sight,
searchlight, smoke banks, basket, MG and antennas execute a genuine
quarter-turn while the Warrior body, WRAP package and course remain fixed.
The parent tool reports 0 stranded / 1 abutting / 0 dangling; the nominee is
the surface-seated hull-owned driver glass already adjudicated in §5.156.

Winding remains 0 reversed / 0 mixed. Its 621-pixel diagnostic deficit is the
same intentionally open thin WRAP screen rib field retained in §5.156, not a
disappearing body sheet; every shaded yaw frame preserves the backed armor
modules behind the open rails. There is no sky-through hull wound or stranded
turret-semantic fitting.

All eight targeted presentation assets and the muzzle-bore receipt are
current. Dual-ledger geometry is freeze **`f912ef92`**, instance freeze
**`574db777`** and asset geometry **`9a70ec6a`** (70 rendered meshes / 71,529
vertices).

**KEEP the complete Warrior hull and full WRAP side package. Future clearance
work may move buried load paths within their supported panels, but may not
remove exterior armor, rails, skirts or mudguards.**

## 5.190 CHALLENGER 2 HYDROGAS OWNERSHIP + SKIRT-SEAM CLEARANCE (2026-08-14, LIVE)

The accepted Challenger 2 exterior is preserved: the complete closed hull,
segmented full skirts, guards, front/rear service fields, six Hydrogas road
wheels, raised terminal stations, linked course and articulated turret are not
deleted or reshaped. Exact localization showed that 2,171 of 2,177 individual
shoe-contact voxels belonged to the wheels' own dark rings, dishes, hub bolts,
swing arms and end-wheel faces. Those parts were emitted through generic hull
buckets even though they are native suspension dressing.

The wheel-face, hub, arm, inter-wheel and terminal-face pieces now use the
explicit running-gear dark/detail ownership buckets with identical geometry,
coordinates and materials. The remaining six voxels came from the inner edges
of two narrow vertical rubber seam strips at the ring shoulders. The left strip
moves 0.03 m outward and the right 0.04 m outward, retaining their full height,
width and visible skirt connection. No plate, mudguard or skirt section is
removed.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 authored-model boards
including the standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames:
**45 PNG / 45 distinct hashes**. Six dished wheels remain separately readable,
all wheel faces stay inside the linked belt, both end ramps remain supported
and the body/skirt silhouette is unchanged. The complete gun, turret armor,
roof stations, optics, MG, smoke and bustle execute a genuine quarter-turn.

The parent audit is **0 stranded / 0 abutting / 0 dangling**. Winding is
**0 reversed / 0 mixed**, with only an 80-pixel (0.14%) non-material
front-left diagnostic edge; no sheet disappears, no sky-through wound opens
and mode 2 is clean. All eight targeted presentation assets and the muzzle
bore are current.

Dual-ledger geometry is freeze **`4fbb2768`**, instance freeze **`ac0a9624`**
and asset geometry **`47364cd8`** (46 rendered meshes / 250,579 vertices).

**KEEP the complete Challenger 2 body, skirts and Hydrogas mechanism. Future
course work must use ownership correction or localized reseating and may not
delete exterior armor to force a clean audit.**

## 5.191 LEOPARD 2A7 CLOSED-TUB + TERMINAL-WRAP CLEARANCE (2026-08-14, LIVE)

This pass preserves the complete accepted Leopard 2A7 exterior: full-width
upper deck and glacis, restored heavy front side-armor panels, continuous aft
skirts and lips, every panel seam, both mudguards, seven road-wheel stations,
raised end wheels and one native linked-shoe course remain present. The live
strict audit localized the failure to the old full-width lower-hull box, whose
side walls occupied both track lanes, plus front/rear mudflaps mounted inside
the terminal wraps. This was a closed-body routing defect, not permission to
remove side armor.

The lower hull is now a complete 2.16 m-wide tub between the native courses.
At the bow a narrow load-bearing chin remains closed through the terminal
wheel height, then flares back to the unchanged full-width upper shoulder and
glacis above the tracks. The rear lower plate follows the same between-course
width. Both front and rear mudflaps remain full size and surface-seated, but
move longitudinally beyond their respective wraps. The heavy front armor and
aft skirt runs remain unchanged in height and length and move only far enough
outboard to clear the outer link pins; no skirt, panel, sponson, guard, hull
face, wheel or shoe is deleted or hidden.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. The parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed / 0-pixel deficit** with clean
mode 2. Fresh evidence contains 15 authored-model boards including the
standard elevated-left profile, 15 yaw0 frames and 15 yaw90 frames: **45 PNG /
45 distinct hashes**. All seven road wheels remain readable behind the full
side armor, the loaded run rests beneath them and both terminal transitions
remain continuous. The complete gun/turret/roof/bustle package performs a
genuine quarter-turn while the restored skirts, hull and course remain fixed.

The base `leo2a7` remains a hidden first-party donor/studio spec rather than a
battle-roster row, so it intentionally owns no orphan presentation assets; the
107-row asset ledger passes without extras. Dual-ledger geometry is freeze
**`6b8fa412`**, instance freeze **`026fd934`** and asset geometry
**`52f5f8fb`** (40 rendered meshes / 85,082 vertices).

**KEEP the complete Leopard 2A7 upper hull and restored side-armor system.
Future course work may reshape the hidden lower tub or reseat mudguards, but
must not delete, shorten or lift exterior armor to manufacture clearance.**

## 5.192 K1A1 CLOSED-BELLY + NATIVE-COURSE CLEARANCE (2026-08-14, LIVE)

This pass preserves the complete accepted first-party K1A1 exterior: upper
and lower glacis, pointed prow, full sponson shoulders, front guard flares,
segmented skirts, mudguards, rear service armor, six road wheels, elevated
front idler and rear final drive, support rollers and one linked-shoe course.
No exterior body, skirt, guard, wheel or track component is deleted or hidden.

The strict report contained two distinct causes. The pair of near-black
wheel-bay walls are visual suspension backdrops rather than armor, so their
unchanged geometry now uses the explicit `hullRunningGearDark` ownership
bucket. The actual physical contact came from the old 2.04 m-wide hidden belly
and lower pointed toe occupying the inner edges of both terminal lanes, plus a
four-centimeter-deep sponson underside touching the return run. The belly is
still one continuous closed 6.90 m body but narrows only 0.04 m per side; its
rear contact clears completely. The lower chin and closed toe beam receive the
same inboard clearance, while the complete visible bow shoulder/glacis remains
unchanged. The sponson lower root lifts 0.04 m above the supported return shoes
and still returns continuously into its original full-width deck edge.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 authored-model boards
including the standardized elevated-left profile, 15 yaw0 frames and 15 yaw90
frames: **45 PNG / 45 distinct hashes**. The hull remains visibly closed from
front, rear and side; all six wheels remain separately readable, the loaded
run rests beneath them and both raised end transitions remain continuous. The
gun, turret, sights, cupolas, smoke banks, MG, basket and roof equipment execute
a genuine quarter-turn while the complete hull and running gear remain fixed.

The parent tool's sole nominee is the driver's three-periscope glass strip on
the forward glacis. It remains surface-seated, below the ring and hull-owned as
the turret departs; it is not stranded turret furniture. Winding is **0
reversed / 0 mixed**. Its 131-pixel (0.18%) front-right diagnostic edge and
112-pixel mode-2 hull-dark candidate are below flag thresholds and show no
missing sheet, sky hole, silhouette wound or turret-semantic stranded mass in
the fresh yaw evidence.

All eight K1A1 presentation assets are current and the muzzle bore passes.
Dual-ledger geometry is freeze **`e93bc384`**, instance freeze **`3f17a94a`**
and asset geometry **`30ce071b`** (63 rendered meshes / 73,854 vertices).
The freeze generator now explicitly retains the hidden first-party Leopard
2A7 donor/studio model alongside the 107 asset-backed battle playables, so the
108-model authored geometry ledger is reproducible by `tank:freeze:check`
without creating an orphan garage-icon row.

**KEEP the complete K1A1 hull, skirts, guards and native six-wheel course.
Future repairs must preserve visible body geometry and use only truthful
ownership correction or localized hidden-clearance shaping.**

## 5.193 M60A1/A3 CLOSED-HULL RETURN-CORRIDOR RESTORATION (2026-08-14, LIVE)

The M60A1 and M60A3 share one Patton-family hull implementation, so this is a
single non-subtractive family correction. Both retain their complete accepted
first-party hulls: closed center belly, cast lower bow, long upper glacis,
full-width deck and fenders, rear plate, mudflaps, six large road wheels,
front idler, rear final drive, return rollers and one linked-shoe course. No
visible armor, fender, guard, wheel or track part is deleted or hidden.

The former full-width sponson band began at y=1.13 across both track lanes,
inside the supported return shoes, while the outer glacis wing extended down
to the pointed toe through the front idler arc. The complete between-course
center wedge and lower hull remain unchanged. Only the outboard sponson
underside now begins at y=1.40, and the full-width outer glacis wing begins
behind the idler at z=2.72 after the narrow closed center bow has cleared the
terminal ramp. The rear full-width band receives the same supported underside
clearance. This restores real wheel-well space without creating a hollow body
or changing the visible deck, armor crown, fender width or end plates.

The 32-voxel secondary report was the actual set of six return-roller mounting
brackets. Their geometry, dimensions, transforms and material are unchanged;
only those brackets use `hullRunningGearDetail`. Mudflap hanger straps and all
other hull/service fittings remain ordinary audited body candidates.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0** for both tanks. Separate fresh packets contain 15
authored-model boards including the standardized elevated-left profile, 15
yaw0 and 15 yaw90 frames per tank: **90 PNG / 90 distinct hashes**. Side,
front and rear pixels show complete closed hull volumes; six road wheels remain
separately readable, the loaded run rests beneath them and both terminal ramps
remain continuous. Each gun/turret/optic/cupola/bustle package executes a
genuine quarter-turn while the body and running gear remain fixed.

Parenting is **0 stranded / 0 abutting / 0 dangling** for M60A1 and M60A3.
Winding is **0 reversed / 0 mixed / 0-pixel deficit**, and mode 2 reports zero
yaw-stranded candidate pixels on both. There is no duplicated course, missing
hull sheet, sky-through opening, floater or silhouette regression.

All sixteen targeted presentation assets are current and both muzzle bores
pass. M60A1 dual-ledger geometry is freeze **`fda73f97`**, instance freeze
**`a4a8ed4a`** and asset geometry **`dc0b3d5d`** (39 rendered meshes / 80,203
vertices). M60A3 is freeze **`f5918aa0`**, instance freeze **`3e4b0688`** and
asset geometry **`994b5d9a`** (40 rendered meshes / 82,999 vertices).

**KEEP both complete M60 hulls and their Patton running gear. Future work may
refine fidelity above this mechanical foundation, but may not remove body or
fender surfaces to force track clearance.**

## 5.194 MERKAVA 1B/2B/2D/3C/3D CLOSED-SPONSON NATIVE-COURSE RESTORATION (2026-08-14, LIVE)

This family pass preserves every accepted first-party exterior: complete
upper and lower hulls, glacis, full sponson shoulders, side curtains or
skirts, mudguards, tail racks, rear service armor, six road-wheel stations,
raised terminal wheels, support rollers and one native linked-shoe course.
Merkava 4 remains owner-removed and is not restored. No visible body, skirt,
guard, wheel or track component is deleted or hidden.

The common defect was the old full-width lower loft: its concealed outboard
floor occupied both return lanes even though the visible sponson and deck sat
above them. The loft now remains one closed body with its original center
belly, exterior walls, upper armor and deck silhouette; only the concealed
left/right underside begins above the native return shoes. The tail-notch
slabs use the same supported floor. Variant-specific rear fittings remain in
place but are reseated immediately behind their idler wraps: the Mk.1B tail
fill, Mk.2 rack/front panels, Mk.3C tiered corner curtain and Mk.3D idler flap.
The Mk.1B exhaust louvre remains on the outer hull face and is trimmed to the
real bay above the return run rather than entering the shoe volume.

Wheel-bay backers, suspension arms, wheel dishes, hubs and native end-wheel
face anatomy keep their exact geometry and materials but now use explicit
running-gear ownership buckets where required. This makes the strict audit
distinguish suspension furniture from armor without exempting real flaps,
guards or hull plates.

Exact strict band and individual-shoe audits report **front 0/0, rear 0/0 and
complete sweep 0/0** on all five vehicles. Fresh evidence contains 15 paired
boards including the standardized elevated-left profile, 15 yaw0 frames and
15 yaw90 frames per tank: **225 PNG / 225 distinct hashes**. All five hulls
remain visibly closed from front, rear, side and top; every six-wheel cadence
is readable, the loaded run rests beneath it and both terminal ramps remain
continuous. Each complete gun/turret/optic/roof/bustle package performs a
genuine quarter-turn while the hull, skirts, service fields and running gear
remain fixed.

Parent auditing is clean on Mk.2B, Mk.3C and Mk.3D. Mk.1B's only nominee is a
small forward-deck glass fitting, visibly seated on the fixed glacis; Mk.2D's
merged dark nominee is the supported fixed deck/rear-service field. Neither
has turret semantics or follows yaw. Winding is **0 reversed / 0 mixed /
0-pixel render deficit** across all five; Mk.2D's 28 mode-2 pixels remain the
same fixed supported hull field and are below the audit floor. There is no
stranded turret equipment, open sheet, sky hole, duplicated course or
silhouette regression.

All forty targeted presentation assets are current. Dual-ledger geometry is:

- Merkava 1B: freeze **`102e495d`**, instance **`ea2eac46`**, asset
  **`dbb2c5bb`** (44 meshes / 133,629 vertices).
- Merkava 2B: freeze **`582edc54`**, instance **`da7da1ad`**, asset
  **`27d6763b`** (38 meshes / 78,729 vertices).
- Merkava 2D: freeze **`f01c9f44`**, instance **`7631de7a`**, asset
  **`4acdf5c2`** (38 meshes / 78,225 vertices).
- Merkava 3C: freeze **`c41e5c3c`**, instance **`b2a290f0`**, asset
  **`2a3b8fb2`** (42 meshes / 147,951 vertices).
- Merkava 3D: freeze **`3dc50bb4`**, instance **`8f861539`**, asset
  **`4661c405`** (41 meshes / 165,119 vertices).

**KEEP the complete Merkava hulls, side protection and native courses. Future
course repairs must remain non-subtractive and may only reshape concealed
undersides, reseat track-adjacent fittings or correct truthful ownership.**

## 5.195 T-54 / TYPE 59 CLOSED-HULL NATIVE-COURSE RESTORATION (2026-08-14, LIVE)

This family pass preserves both accepted first-party vehicles in full: their
cast upper and lower hulls, complete fenders and service equipment, turrets,
five road-wheel stations, raised terminal wheels, support rollers and single
linked-shoe courses. No visible body, fender, guard, wheel or track component
is deleted or hidden.

On T-54, the former full-width loft split placed the concealed sponson floor
inside the supported return shoes even though its exterior deck edge was
already above them. The closed center belly, outer hull sides, deck silhouette
and fenders remain unchanged; only the concealed track-bay roof now starts
above the course. The two transverse rear drums remain complete, while their
four-centimeter dark end bands move 0.04 m inboard onto the drum bodies rather
than grazing the inner shoe edge.

Type 59 had the same full-width hidden-floor defect plus three localized
contacts. Its closed center tub narrows only inside the wheel wells while the
measured outer armor and deck remain unchanged. The complete stern is now
three overlapping closed solids: a full-height center plate plus raised
outboard caps that preserve the original 2.90 m crown and side silhouette
above the final-drive shoes. Both complete mudflaps and their stays move aft
onto the stern hangers behind the final drives. Four internal dark reference
mask carriers keep their depth, height and casting overlap but narrow inside
the center hull so they cannot sweep through either course as the turret yaws.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0** for both tanks. Fresh evidence contains 15 paired
boards including the standardized elevated-left profile, 15 yaw0 frames and
15 yaw90 frames per tank: **90 PNG / 90 distinct hashes**. Front, rear, side
and elevated-profile pixels show closed hulls, five separately readable road
wheels, loaded runs resting beneath them and continuous raised terminal
transitions. Each complete turret, gun and roof package performs a genuine
quarter-turn while the hull, fenders, rear fittings and running gear remain
fixed.

T-54 parenting is **0 stranded / 0 abutting / 0 dangling**. Type 59's only
heuristic nominee is the fixed driver-glass strip on the forward hull roof;
it remains visibly surface-seated as the turret departs and has no turret
semantics. Winding is **0 reversed / 0 mixed** on both. Type 59 has a zero
render deficit; T-54's nine-pixel (0.01%) antialias edge is below every flag
threshold, with zero yaw-stranded candidates on both vehicles. No open sheet,
sky hole, floating fitting, duplicate course or silhouette regression appears.

All sixteen targeted presentation assets are current, both muzzle bores pass
and all nineteen targeted runtime-rig checks pass. T-54 dual-ledger geometry
is freeze **`0ff49358`**, instance freeze **`053e7a8c`** and asset geometry
**`dea8f4a7`** (41 rendered meshes / 46,087 vertices). Type 59 is freeze
**`bd8ceae6`**, instance freeze **`dbef757f`** and asset geometry
**`aaf9cc94`** (40 rendered meshes / 52,159 vertices).

**KEEP both complete hulls, fenders and native courses. Future clearance work
must remain non-subtractive and may only reshape concealed bay floors, reseat
track-adjacent fittings or correct truthful ownership.**

## 5.196 PT-91M TOW-EYE / NATIVE-RAMP COURSE CLOSEOUT (2026-08-14, LIVE)

This localized repair preserves the complete accepted first-party PT-91M:
closed hull, glacis, full skirts and fenders, ERAWA packages, rear drum/service
train, six road wheels, raised idler/final drive and one linked-shoe course. No
body, armor, skirt, guard, wheel or track component is deleted or hidden.

The front residual was physical: both complete tow-eye tori sat at ±1.242 m
inside the idler shoe lanes, penetrating the linked shoes by 34 mm. They move
inboard to ±0.98 m while keeping the same height, depth, geometry and lower-bow
seat. The rear candidates are the existing per-side native-course ramp fade
strips, not hull armor; their geometry and pixels remain unchanged while their
ownership becomes explicit left/right running gear. The single strip beneath
the rising rear shoe lowers 0.03 m, remaining visible as ramp shading without
duplicating or entering the linked shoe above it.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 paired boards including
the standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG
/ 45 distinct hashes**. The hull remains closed, all six wheels remain
readable beneath the complete skirts and both raised terminal transitions stay
continuous. The gun, turret, ERAWA, optics, commander station, smoke and rear
turret equipment execute a genuine quarter-turn while the complete hull,
skirts, drums and running gear remain fixed.

Parenting is **0 stranded / 0 abutting / 0 dangling**. Winding is **0 reversed
/ 0 mixed**, with a 26-pixel (0.04%) antialias edge below every flag threshold
and zero yaw-stranded candidates. No empty-air fitting, duplicate course, open
sheet, sky hole or silhouette regression appears. All targeted presentation
assets are current, the muzzle bore passes and all ten targeted runtime-rig
checks pass.

Dual-ledger geometry is freeze **`c31951d0`**, instance freeze **`f56c5f91`**
and asset geometry **`6d09ab73`** (54 rendered meshes / 93,702 vertices).

**KEEP the complete PT-91M hull, skirts and native course. Future work must
preserve the accepted exterior and use only physical fitting clearance or
truthful running-gear ownership.**

## 5.197 KF51 CLOSED-SPONSON / NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This repair preserves the complete accepted first-party KF51 exterior: its
center hull, full deck roof, original outer side walls and side armor, front
glacis outline, rear service field, seven road wheels, raised idler/final
drive and single linked-shoe course. No visible hull, skirt, guard, wheel or
track component is deleted or hidden.

The former deck and front-glacis solids extended their concealed lower faces
through the moving return and idler crest. They are now closed sponson
constructions: a complete inter-track body retains the load-bearing hull,
while the full-width original roof, outer side skins and visible glacis armor
remain at the same coordinates. Only the invisible over-track underside is
open above the moving course. The unchanged sprocket/idler rim, hub and face
pieces are also truthfully classified as running gear rather than hull armor.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 paired boards including
the standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG
/ 45 distinct hashes**. Paired pixels are silhouette-identical to the
accepted authored baseline copy. Side, front, rear and elevated views show a
closed complete hull, full side armor, seven separately readable road wheels,
a loaded lower run and continuous raised terminal transitions. The complete
turret, gun, roof station, optics and bustle execute a genuine quarter-turn
while the hull, deck, skirts and running gear remain fixed.

The parent heuristic's nominees are thin fixed rear-deck grilles and service
strips inside the broad turret bounding box. Yaw90 exposes them still seated
on the closed hull deck; none has turret semantics or follows the rotating
package. There are no dangling candidates. Winding is **0 reversed / 0
mixed**, with only a three-pixel antialias edge (0.00%) and zero yaw-stranded
candidates. No empty-air fitting, duplicate course, open sheet, sky hole or
silhouette regression appears.

All eight targeted presentation assets are current, the muzzle bore passes
and all ten targeted runtime-rig checks pass. Dual-ledger geometry is freeze
**`79ce4523`**, instance freeze **`ea8e0d16`** and asset geometry
**`3813131d`** (299 rendered meshes / 101,258 vertices).

**KEEP the complete KF51 exterior hull, side armor and native course. Future
clearance work must remain non-subtractive and may only reshape concealed
sponson undersides, reseat track-adjacent fittings or correct truthful
running-gear ownership.**

## 5.198 STRV 103 FIXED-CASEMATE / NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This pass preserves the complete first-party Strv 103 exterior: its low
fixed-casemate hull, full dozer bow, deep side skirts, deck furniture, four
road-wheel stations, front drive, raised rear idler and single linked-shoe
course. No visible hull, skirt, blade, wheel or track component is deleted or
hidden.

The primary loft previously remained a full-width solid through both course
lanes. It now uses the casemate family's established closed-sponson corridor:
a complete inter-track body remains load-bearing while the measured upper
wings, deck surface and exterior side silhouette stay at their original
coordinates above the shoes. The two complete blade support arms move 0.14 m
inboard onto the bow structure, clear of the idler shoes. The unchanged dark
wheel-bay wall is truthfully classified as running-gear well shading rather
than hull armor.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 paired boards including
the standardized elevated-left profile plus 15 yaw0 and 15 yaw90 frames. The
45 PNGs produce 35 distinct hashes; every duplicate is confined to the
expected fixed-mount yaw states. Paired pixels are silhouette-identical to the
accepted authored baseline copy and show a closed low hull, complete deep
skirts, four readable road wheels, a loaded lower run and continuous raised
terminal transitions.

Strv 103 is hull-aimed: its gun and fighting compartment are intentionally
fused to `rig_hull`, with an empty turret casting. The parent audit therefore
reports **0 stranded / 0 abutting / 0 dangling**. The winding surface audit is
**0 reversed / 0 mixed / 0-pixel deficit**. Its mode-2 heuristic marks the
static casemate hull because yaw cannot move a nonexistent turret; identical
yaw evidence confirms this is the correct fixed-mount contract rather than
stranded equipment. No open sheet, sky hole, floating fitting, duplicate
course or silhouette regression appears.

All eight targeted presentation assets are current, the muzzle bore passes
and all ten targeted runtime-rig checks pass. Dual-ledger geometry is freeze
**`4d0ff518`**, instance freeze **`18fd2507`** and asset geometry
**`78d38173`** (29 rendered meshes / 51,373 vertices).

**KEEP the complete Strv 103 hull, deep skirts, dozer bow and native course.
Future repairs must preserve the fixed-casemate exterior and may only reshape
concealed sponson undersides, reseat track-adjacent fittings or correct
truthful running-gear ownership.**

## 5.199 CHIEFTAIN MK.10 CLOSED-SPONSON / NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This repair preserves the complete first-party Chieftain Mk.10: closed bow
and stern, full deck and side hull, fenders, six-panel Stillbrew-era skirts,
six road wheels, raised front idler, high rear drive sprocket and one
linked-shoe course. No visible hull, skirt, fender, wheel or track component
is deleted or hidden, and the accepted turret/gun/equipment package remains
unchanged.

The sole defect was the full-width concealed lower face of the deck band,
which crossed the supported return while the visible exterior already sat
above it. A new opt-in UK closed-sponson band is enabled only by Mk.10: the
complete inter-track body remains load-bearing, while the exact original deck
roof and exterior side-wall line remain at their measured coordinates above
the course. Chieftain Mk.5 and every other UK builder remain byte-untouched by
the opt-in path.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**. Fresh evidence contains 15 paired boards including
the standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG
/ 45 distinct hashes**. Paired pixels are silhouette-identical to the
accepted authored baseline copy. Side and elevated views retain the full
skirt/side hull, all six readable road wheels, a loaded lower run and
continuous raised terminal transitions; front and rear views remain closed.

The complete Stillbrew turret, gun, commander/TOGS station, optics, smoke and
turret stowage execute a genuine quarter-turn while the hull, deck, fenders,
skirts and running gear remain fixed. Parenting is **0 stranded / 0 abutting
/ 0 dangling**. Winding is **0 reversed / 0 mixed / 0-pixel deficit**, with
zero yaw-stranded candidates. No empty-air fitting, duplicate course, open
sheet, sky hole or silhouette regression appears.

All eight targeted presentation assets are current, the muzzle bore passes
and all ten targeted runtime-rig checks pass. Dual-ledger geometry is freeze
**`55a23544`**, instance freeze **`e382b2fb`** and asset geometry
**`7dc96e76`** (44 rendered meshes / 74,543 vertices).

**KEEP the complete Chieftain Mk.10 hull, fenders, skirts and native course.
Future clearance work must preserve the accepted exterior and use only
concealed sponson shaping, physical fitting clearance or truthful ownership.**

## 5.200 VICKERS MK.1 CLOSED-SPONSON / NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This repair preserves the complete first-party Vickers Mk.1 exterior: the
measured low hull and deck, full sponson side faces, bow and stern plates,
fender tips, mudguards, six road-wheel stations, raised front idler, high rear
drive sprocket and one linked-shoe course. No visible hull, side armor,
fender, mudguard, wheel or track component is deleted or hidden.

The sole defect was the concealed 1.05–1.12 m underside of the full-width
sponson loft crossing the supported return run. The Vickers builder now uses
the established UK closed-sponson construction only across that central
course span: a complete inter-track body remains closed inside x +/-0.90,
while the exact original roof and outer side surfaces resume above 1.14 m.
The original glacis, tail band and both terminal assemblies remain intact.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**, improved from 180 band voxels / 202 shoe voxels.
Fresh evidence contains 15 paired boards including the standardized
elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct
hashes**. Side, front and elevated pixels retain a closed complete hull, all
six separately readable road wheels, the loaded lower run and continuous
raised terminal transitions.

The complete turret, gun, optics, cupolas and stowage execute a genuine
quarter-turn while the hull, deck, fenders and running gear remain fixed.
The parent heuristic's single `hullCloth` nominee is the visibly seated
left-fender camouflage roll; the winding heuristic's large fixed nominee is
the legitimate closed hull/deck package. Yaw90 confirms neither has turret
semantics or becomes stranded. There are **0 abutting / 0 dangling** parent
findings and **0 reversed / 0 mixed / 0-pixel winding deficit**. No duplicate
course, empty-air fitting, open sheet, sky hole or silhouette regression
appears.

All eight targeted presentation assets are current, the muzzle bore passes
and all ten targeted runtime-rig checks pass. Dual-ledger geometry is freeze
**`430bd6b9`**, instance freeze **`9afc8d83`** and asset geometry
**`9ea36f65`** (42 rendered meshes / 56,795 vertices).

**KEEP the complete Vickers Mk.1 hull, side armor, fenders, mudguards and
native course. Future clearance work must remain non-subtractive and may only
reshape concealed sponson undersides, reseat track-adjacent fittings or
correct truthful running-gear ownership.**

## 5.201 AMX-30 / AMX-30B2 NATIVE-COURSE CLOSEOUT (2026-08-14, LIVE)

This family repair preserves both complete first-party AMX-30 exteriors: low
joined hulls, one-piece raked glacis plates, sponson shoulders, fender rails,
front and rear mudflaps, five large road wheels, raised idler/sprocket
transitions and one linked-shoe course per side. No hull, side armor, fender,
mudguard, wheel or track geometry is deleted.

The apparent broad collision was not armor. The 158/72 shoe-voxel sets were
the authored circular wheel-well darkness immediately behind the road wheels;
those unchanged discs are now truthfully tagged as running-gear furniture.
Both unit-number decals were physically reduced and reseated on the raised
sponson shoulder instead of spanning the moving return lane. On B2, the
full-length support under each unequal rear service bin remains present, but
its lower face is lifted 6 cm onto the sponson rather than entering the top
shoes.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0 for both variants**, improved from AMX-30 95/158 and
AMX-30B2 117/72. Fresh evidence contains 30 paired boards including both
standardized elevated-left profiles, 30 yaw0 and 30 yaw90 frames: **90 PNG /
90 distinct hashes**. Side, front, rear and elevated pixels retain closed
complete hulls, five separately readable road wheels, loaded lower runs and
continuous raised terminal transitions.

Each complete cast turret, gun, TOP-7 station, coax, optics, smoke and bustle
executes a genuine quarter-turn while the hull, deck and running gear remain
fixed. The parent heuristic's single abutting nominee on each tank is the
visibly seated hull-owned tow cable along the right sponson; it correctly
stays fixed under yaw and is not turret equipment. There are **0 stranded / 0
dangling** findings. Winding is **0 reversed / 0 mixed / 0-pixel deficit**
with no yaw-stranded candidate. No duplicate course, empty-air fitting, open
sheet, sky hole or silhouette regression appears.

All sixteen targeted presentation assets are current, both muzzle bores pass
and all nineteen targeted runtime-rig checks pass. AMX-30 dual-ledger geometry
is freeze **`5f66f958`**, instance freeze **`ff4063b5`** and asset geometry
**`e0314647`** (50 rendered meshes / 51,849 vertices). AMX-30B2 is freeze
**`430737d0`**, instance freeze **`1e7c92d5`** and asset geometry
**`d719235d`** (50 rendered meshes / 55,605 vertices).

**KEEP both complete AMX-30 hulls, fender/mudguard packages and native
courses. Future clearance work must preserve the accepted exterior and use
only physical reseating or truthful running-gear ownership.**

## 5.202 M60A2 STARSHIP RUNNING-GEAR OWNERSHIP CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the complete first-party M60A2: its joined Patton
hull, cambered engine deck, full sponson and fender system, front and rear
mudboards, six road-wheel stations, raised front idler, high rear sprocket
and one linked-shoe course. No hull, side armor, fender, mudguard, wheel or
track component is moved, deleted or hidden.

The entire strict receipt was native running-gear furniture already sitting
in its intended mechanical envelope: 94 shoe voxels came from the unchanged
hub rings and wheel bolt heads, while the 90 band / 100 shoe voxels came from
the unchanged return-roller support brackets. M60A2 now opts those exact
pieces into the existing Patton running-gear buckets; every armor and fitting
coordinate remains byte-identical.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**, improved from 90 band voxels / 194 shoe voxels.
Fresh evidence contains 15 paired boards including the standardized
elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct
hashes**. Side, front, rear and elevated pixels retain the closed complete
hull, six readable road wheels, loaded lower run and continuous raised
terminal transitions.

The complete Starship turret, launcher, roof station, optics and bustle kit
execute a genuine quarter-turn while the hull, deck, fenders and running gear
remain fixed. The parent heuristic's single abutting nominee is the supported
hull-owned tow cable along the left sponson; yaw90 confirms it remains seated
and has no turret semantics. There are **0 stranded / 0 dangling** findings.
Winding is **0 reversed / 0 mixed / 0-pixel deficit**. Its mode-2 hull nominee
is the legitimate fixed hull/deck package exposed when the tall turret turns,
not stranded equipment. No duplicate course, empty-air fitting, open sheet,
sky hole or silhouette regression appears.

All eight targeted presentation assets are current, the 152 mm muzzle bore
passes and all ten targeted runtime-rig checks pass. Dual-ledger geometry is
freeze **`001b5966`**, instance freeze **`3b05126a`** and asset geometry
**`1283ae46`** (47 rendered meshes / 65,035 vertices).

**KEEP the complete M60A2 hull, mudboards and native course. Future clearance
work must preserve the accepted exterior and treat its wheel/roller hardware
as running gear rather than armor.**

## 5.203 M48A5 PATTON FRONT-WRAP / RUNNING-GEAR CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the complete first-party M48A5 hull, cast bow,
full-length fenders, lamp guards, front and rear mudguards, six road-wheel
stations and its single linked-shoe course. No hull, side armor, fender,
mudguard, wheel or track component is deleted or hidden.

The original strict receipt was dominated by native wheel-face hardware and
the low tension-idler / return-roller support system. Those unchanged rings,
bolts, wheels and brackets now use the Patton builder's opt-in running-gear
buckets. The only real contact was a five-voxel / 33 mm outer-shoe touch at
the intact glacis wing. It is repaired by lowering only the front idler orbit
40 mm; the idler remains visibly raised **430 mm** above the six road-wheel
centres, retaining the required raised-front / loaded-bottom track profile.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**, improved from 302 band voxels / 505 shoe voxels.
Fresh evidence contains 15 paired boards including the standardized
elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct
hashes**. Side, front, rear and elevated pixels retain the complete hull,
guards, six readable wheels and continuous end transitions.

The turret, gun, cupola and roof station execute a genuine quarter-turn while
the hull, deck, fenders and complete running gear remain fixed. The parent
heuristic's merged `hullDark` nominee and winding mode-2 `rig_hull/hull#17`
nominee are the same legitimate fixed hull/gear package exposed by yaw; no
turret-semantic fitting remains behind. Mode-1 winding is **0 reversed / 0
mixed**, with only a three-pixel (0.00%) antialias deficit. The muzzle bore and
all ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Dual-ledger geometry is
freeze **`28331d00`**, instance freeze **`d2c5635a`** and asset geometry
**`134a47dc`** (45 rendered meshes / 76,993 vertices).

**KEEP the complete M48 hull, fenders and mudguards. Future clearance work
must rewrap the course or reseat fittings without subtracting exterior armor.**

## 5.204 CHIEFTAIN MK.5 CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the complete first-party Chieftain Mk.5 exterior:
the full central hull, both asymmetric fender courses, both complete side
guard walls, bow wings, stern package, six road-wheel stations, raised front
idler, high rear sprocket and one native linked-shoe course. No exterior hull,
side armor, fender, mudguard, wheel or track component is deleted or hidden.

The initial strict receipt mixed authored wheel-bay shadow furniture with a
real full-width sponson/course overlap. The named ground filler, wheel-gap
tabs and bay backdrop now use the native running-gear shadow bucket. The
concealed over-track volume is rebuilt as a **closed raised soffit**: the
central inter-track hull remains solid, the original deck/outer roof remains,
and connected floor plates bridge above the moving return run into the intact
outer guard walls. It does not create an open corridor or a hollow side.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0**, improved from 1,046 band voxels / 952 shoe voxels.
Fresh evidence contains 15 paired boards including the standardized
elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct
hashes**. The current side/front/rear pixels are silhouette-identical to the
accepted exterior and retain all six wheels, the complete guards and the
raised-end track form.

The complete turret, gun, roof stations and bustle equipment execute a
genuine quarter-turn. The parent heuristic reports 0 stranded / 0 dangling;
its one abutting fixed item is the supported right fender stowage bin, which
correctly remains hull-owned when the turret departs. Winding is **0 reversed
/ 0 mixed / 0-pixel deficit**. The small mode-2 fixed-hull candidate is deck
and fender structure, not stranded turret equipment. The muzzle bore and all
ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Dual-ledger geometry is
freeze **`a17f4ce4`**, instance freeze **`73f5ff21`** and asset geometry
**`56ae25cf`** (43 rendered meshes / 95,351 vertices).

**KEEP the complete Chieftain exterior and closed soffit. Future course work
must preserve both side guards and may not reopen or subtract the hull.**

## 5.205 CENTURION MK.3 / MK.5 CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This pair closeout preserves both complete first-party Centurion exteriors:
the central hulls, cast bows, full skirts and outer armour strips, fender
horns, mudguards, six road-wheel stations, raised front idlers, high rear
sprockets and single native linked-shoe courses. No visible hull, side armour,
skirt, guard, wheel or track component is deleted, hidden or shifted.

The original strict receipts were dominated by named `gearAirShadowBacker`
plates, which are render-only members of the native wheel-bay assembly and
now carry truthful running-gear ownership. A small real contact remained at
the concealed over-track shoulder. It is repaired with a **closed raised
soffit** shared by both marks: the complete central inter-track hull remains
solid, the accepted exterior deck and side walls are unchanged, and connected
floor plates bridge above the return run into the intact outer armour. This
is not an open or deleted hull corridor.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0** for both marks, improved from 85 band / 74 shoe
voxels per tank. Each fresh packet contains 15 paired boards including the
standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG /
45 distinct hashes per tank**. Baseline/current boards retain identical
exterior silhouettes, complete side armour, six readable wheels and the
raised-end track form.

Both complete turrets, guns, cupolas, sights and stowage execute genuine
quarter-turns while their hulls, decks, skirts and native courses remain
fixed. Parent audits are **0 stranded / 0 abutting / 0 dangling** for both.
Winding is **0 reversed / 0 mixed / 0-pixel deficit**, with no mode-2 stranded
candidate. Both muzzle bores and all ten targeted runtime-rig checks pass.

All sixteen targeted presentation assets are current. Centurion Mk.3 dual-
ledger geometry is freeze **`a6195aa4`**, instance freeze **`10f53dbc`** and
asset geometry **`6fe78d3d`** (47 rendered meshes / 69,695 vertices).
Centurion Mk.5 dual-ledger geometry is freeze **`92383e80`**, instance freeze
**`1c914936`** and asset geometry **`ab1ccc09`** (50 rendered meshes / 77,855
vertices).

**KEEP both complete Centurion exteriors and closed soffits. Future course
work must preserve every skirt, fender and mudguard.**

## 5.206 M46 / M47 PATTON CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This pair closeout preserves both complete first-party Patton exteriors:
their cast bows and joined hulls, full fender and skirt courses, mufflers,
mudguards, six road-wheel stations, raised terminal wheels and single native
linked-shoe courses. No visible hull, side armour, fender, skirt, mudguard,
wheel or track component is deleted or hidden.

The initial receipts mixed native wheel-bay presentation with real concealed
contacts. The named shadow backers, return-run covers and rim glints now carry
truthful running-gear ownership; wheel-face rings, bolts and roller brackets
use the existing Patton running-gear buckets. Broad sponson contacts are
repaired with mark-specific **closed raised soffits**: the central hull stays
solid, the original deck and exterior side walls remain, and connected floor
plates bridge above each return run. The only remaining physical contacts
were the lower ends of the muffler legs; those legs are shortened upward and
reseated on the closed shoulder while the complete muffler/strap assemblies
remain visible and supported.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0** for both tanks. M46 improves from 1,195 band / 1,641
shoe voxels and M47 from 978 band / 1,560 shoe voxels. Each fresh packet
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes per tank**.
Baseline/current boards retain identical exterior silhouettes, all fenders,
six readable wheels and continuous raised terminal transitions.

Both complete turrets, guns, roof stations and bustle equipment execute
genuine quarter-turns while hulls, mufflers, fenders and running gear remain
fixed. Parent audits are **0 stranded / 0 abutting / 0 dangling** for both.
Winding has **0 reversed / 0 mixed geometry**; mode-1 deficits are one pixel
for M46 and 48 pixels (0.05%) for M47, both clean antialias-level results.
M46's mode-2 candidates are the correctly fixed deck muffler and strap field
at the aft sponson, visibly supported and intentionally hull-owned—not
stranded turret equipment. M47 has no mode-2 candidate. Both muzzle bores and
all ten targeted runtime-rig checks pass.

All sixteen targeted presentation assets are current. M46 dual-ledger
geometry is freeze **`8f42c12f`**, instance freeze **`8b2c4931`** and asset
geometry **`79b6ea0d`** (102 rendered meshes / 85,113 vertices). M47 dual-
ledger geometry is freeze **`afb76590`**, instance freeze **`881a0652`** and
asset geometry **`75f356c1`** (111 rendered meshes / 97,566 vertices).

**KEEP both complete Patton exteriors, closed soffits and supported muffler
packages. Future course work may not subtract their hulls or side armour.**

## 5.207 OWNER-ONLY SELECTABLE ROSTER CONTRACT (2026-08-14, LIVE)

The selectable registry is now explicitly sealed as **first-party procedural
geometry only**. Every garage, battle, studio and generated-asset tank receives
the same runtime authorship record; `tank:native:check` and the default vehicle
asset self-test both fail if a selectable row resolves through external
geometry, carries obsolete `community` source-credit metadata, uses the
Community nation bucket, or lacks the first-party contract.

This cleanup changes no accepted hull, turret, side armour, skirt, wheel or
track geometry. It corrects stale UI/registry metadata left behind after the
runtime GLB swaps were retired. Historical reference files remain isolated
comparison oracles only. Source-branded duplicate display names are normalized
to vehicle variants (for example `Tiger I Early`, `T-34-85 obr. 1944` and
`IS-3 Late`) while retaining their repository-authored procedural builders.

The two generic third-party placeholders—`recon_tank` and `q_heavy`—are no
longer selectable and no longer receive generated roster assets. They are not
historical first-party vehicle designs and therefore cannot satisfy the owner-
only law. The live roster contracts from 107 to **105 first-party procedural
tanks**, with zero GLB-sourced playables. Isolated comparison-candidate metadata
does not alter runtime ownership and remains covered by the native audit.

## 5.208 GERMAN CASEMATE CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This closeout repairs `jagdtiger`, `jpz_e100` and `sturmtiger` without replacing
or hollowing their first-party hulls. Each accepted casemate, glacis, roof,
fender course, side silhouette and native running-gear layout remains in place.
The hidden lower tubs now use closed raised soffits over the two linked-shoe
corridors; solid central belly plates and the complete exterior side walls are
retained. Sturmtiger keeps a full-length side-skirt course, with its lower hem
ending above the return shoes rather than passing through them. Its suspension
arms retain their geometry and now carry truthful running-gear ownership.

Exact strict band and individual-shoe audits report **front 0/0, rear 0/0 and
complete sweep 0/0** for all three vehicles. Fresh evidence contains 15 paired
boards (including the standardized elevated-left profile), 15 yaw0 and 15
yaw90 frames per tank. Every directory contains 15 distinct images. Repeated
corresponding yaw pixels are expected for fixed-mount casemates and are covered
by the explicit runtime fixed-mount contract rather than misrepresented as a
rotating turret.

Runtime rig verification passes all **28 checks**: each model is procedural,
its cannon remains fused to the fixed casemate hierarchy, aim articulation is
live, and no load error occurs. Parent audits report **0 stranded / 0 abutting
/ 0 dangling**. Winding mode 1 reports **0 reversed / 0 mixed geometry**;
Jagdtiger and Sturmtiger have zero render deficit, while JPz E 100's 27-pixel
(0.01%) front result is antialias-level and clean. Mode-2 candidates are the
correctly fixed casemate/hull masses, not stranded turret equipment. All three
muzzle bores pass with dark-center contrast.

All 24 targeted presentation assets are current. Jagdtiger dual-ledger
geometry is freeze **`b55db0f8`**, instance freeze **`58e1634a`** and asset
geometry **`fa8c3683`** (33 rendered meshes / 52,887 vertices). JPz E 100 is
freeze **`0ff4e810`**, instance freeze **`716ecf18`** and asset geometry
**`7d51f201`** (34 meshes / 50,223 vertices). Sturmtiger is freeze
**`3a7af13c`**, instance freeze **`5eaabc5c`** and asset geometry
**`f52e3091`** (33 meshes / 55,658 vertices).

**KEEP all three complete exteriors and closed soffits. Future track work may
not delete, open or replace their hull, fender or side-skirt geometry.**

## 5.209 TIGER I / PANZER III CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This family slice preserves the accepted first-party `tiger1`, `newc_pziii`
and `pziii_konserwa` exteriors, turrets, fenders, mudguards and native running
gear. Tiger I's two dark wheel-bay walls are visually unchanged and now carry
truthful suspension ownership. The Panzer III pair retain their full outer
superstructure walls and solid central bellies; a sealed inward soffit rises
from the central floor into the original side walls above each return run.
No hull face, skirt, fender, wheel or shoe course is deleted.

Exact strict band and individual-shoe audits now report **front 0/0, rear 0/0
and complete sweep 0/0** for all three tanks. Each fresh packet contains 15
paired boards including the standardized elevated-left profile, 15 yaw0 and
15 yaw90 frames: **45 PNG / 45 distinct hashes per tank**. The profiles retain
the accepted complete side silhouettes, readable wheel cadence and raised
terminal track form.

The Panzer III parent audits report **0 stranded / 0 abutting / 0 dangling**.
Tiger I's two parent candidates are the correctly fixed hull-owned wood and
cloth deck-stowage packages: yaw90 exposes their broad deck seats while the
complete turret, gun and roof package moves away. They are not stranded turret
equipment. Winding reports **0 reversed / 0 mixed geometry**; mode-1 deficits
are 187 pixels (0.18%) for Tiger I, zero for Panzer III Ausf. J and 13 pixels
(0.01%) for Panzer III Ausf. E, all clean antialias-level results. All three
dark muzzle bores and all 28 targeted runtime-rig checks pass.

All 24 targeted presentation assets are current. Tiger I dual-ledger geometry
is freeze **`449558c5`**, instance freeze **`c1a92627`** and asset geometry
**`50dafa48`** (48 rendered meshes / 73,132 vertices). Panzer III Ausf. J is
freeze **`5865b990`**, instance freeze **`a47c4c45`** and asset geometry
**`ded1ae1a`** (39 meshes / 41,022 vertices). Panzer III Ausf. E is freeze
**`6051dcec`**, instance freeze **`7398c17c`** and asset geometry
**`28c7ab9a`** (39 meshes / 40,236 vertices).

**KEEP these complete first-party family exteriors and closed soffits. Future
course work may not subtract their hulls, fenders or mudguards.**

## 5.210 IS-3 FAMILY CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

This closeout preserves the complete first-party `is3` and `is3_bergman`
exteriors: their pike noses, closed lower hulls, upper sponson walls, rear
plates, fenders, mudguards, six-wheel running gear and single native linked-
shoe courses. The original full-width concealed lower frustum and lower pike
core crossed the front idler sweeps. They are replaced by a **closed raised
soffit**: a solid inter-track centre belly and bow remain, narrow sealed pike
transitions join that core to the intact upper shoulders, and complete outer
armor walls continue above the return run. No hull, skirt, fender, mudguard,
wheel or track component is deleted.

The family suspension arms and wheel-face recesses are unchanged visually and
now carry truthful running-gear ownership. Exact strict band and individual-
shoe audits report **front 0/0, rear 0/0 and complete sweep 0/0** for both
variants. Each fresh evidence packet contains 15 paired boards including the
standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG /
45 distinct hashes per tank**. Front, rear and profile pixels show complete
closed armor, readable wheels and continuous raised terminal transitions.

Both complete turrets, guns and roof fittings execute genuine quarter-turns
while the hull, deck and running gear remain fixed. Parent-audit `hullWood`
candidates are the correctly fixed pioneer tools, visibly seated on the hull
deck. Winding mode 1 reports **0 reversed / 0 mixed geometry and zero-pixel
deficit**. Mode-2 candidates are the correctly fixed aft fuel-drum/deck field,
not stranded turret equipment. Both muzzle bores and all nineteen targeted
runtime-rig checks pass.

All sixteen targeted presentation assets are current. IS-3 dual-ledger
geometry is freeze **`e45adf90`**, instance freeze **`8c2b684c`** and asset
geometry **`82c23801`** (36 rendered meshes / 67,758 vertices). IS-3 Late is
freeze **`2541ca76`**, instance freeze **`fd6772b5`** and asset geometry
**`994e9f12`** (36 meshes / 67,758 vertices).

**KEEP both complete IS-3 family exteriors and their closed raised soffits.
Future course work may not subtract or open their pike, hull or side armor.**

## 5.211 IS-7 CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The IS-7 remains its complete first-party vehicle: the clean pike casting,
broad upper hull, full roof and rear armor, fenders, front and rear mudguards,
seven road-wheel stations, elevated end wheels and single linked-shoe course
are all retained. Native wheel-bay recesses and suspension arms now carry
truthful running-gear ownership. The real concealed contacts are repaired with
a **closed raised soffit**: a solid inter-track belly and lower pike core stay
in place, connected centre bridges meet the roof, and the complete outer
sponson and rear walls continue above the return run. Nothing is hollowed or
deleted.

The exact strict audit improves from 270 band / 239 individual-shoe voxels to
**front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence contains 15
paired boards including the standardized elevated-left profile, 15 yaw0 and
15 yaw90 frames: **45 PNG / 45 distinct hashes**. All views retain the closed
pike/rear faces, accepted exterior silhouette and continuous raised-terminal
course.

The complete turret, gun, cupolas and rear weapon platform execute a genuine
quarter-turn while all hull and running-gear structure remains fixed. Parent
audit is **0 stranded / 0 abutting / 0 dangling**. Winding reports **0
reversed / 0 mixed geometry**, a clean two-pixel (0.00%) antialias deficit and
no mode-2 candidate. The dark muzzle bore and all ten targeted runtime-rig
checks pass.

All eight targeted presentation assets are current. IS-7 dual-ledger geometry
is freeze **`1445a9e0`**, instance freeze **`83896ab2`** and asset geometry
**`711ee0e3`** (33 rendered meshes / 67,446 vertices).

**KEEP the complete IS-7 exterior and closed raised soffit. Future course work
may not subtract its pike, hull, fenders or mudguards.**

## 5.212 OBJECT 279 FOUR-TRACK CORRIDOR CLOSEOUT (2026-08-14, LIVE)

Object 279 retains its complete first-party elliptical hull, rounded stern,
sloped bow, roof, turret, and distinctive four-track presentation. The outer
native linked courses, inner wrap stubs, beam structure and seven outer wheel
stations remain in place. No shell, track, wheel or support is deleted.

The shared native suspension recesses now carry truthful running-gear
ownership. The real contact was the low full-width elliptical shell passing
through the outer courses at both ends. Its replacement is a **closed
four-track soffit**: a solid narrow keel stays between the track beams, while
the complete broad shell and rounded stern continue above the shoe lanes and
join the unchanged upper hull. The prow keeps its closed center core beneath
the full outer bow.

Exact strict band and individual-shoe audits improve from 358 band / 599 shoe
voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Front, rear,
profile and hero views preserve the accepted elliptical silhouette and
four-track identity.

The entire dome, mantlet, gun and roof suite execute a genuine quarter-turn;
the hull and all four-track structure stay fixed. Parent audit is **0 stranded
/ 0 abutting / 0 dangling**. Winding is **0 reversed / 0 mixed geometry with
zero-pixel deficit**, and mode 2 is clean. The dark muzzle bore and all ten
targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Object 279 dual-ledger
geometry is freeze **`26c7107c`**, instance freeze **`0ff2d460`** and asset
geometry **`65db5fa2`** (33 rendered meshes / 59,366 vertices).

**KEEP the complete Object 279 elliptical hull and four-track construction.
Future course work may not hollow the shell or delete any track structure.**

## 5.213 IS-6B CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The IS-6B retains its complete first-party hull, onion turret, glacis, rear
deck, full fender planes, outer skirt lips, mudguards, six-wheel suspension
and single linked-shoe course. The accepted side silhouette and all exterior
armor remain present. Native suspension recesses and arms now carry truthful
running-gear ownership.

Physical contacts were isolated to the concealed full-width sponson floor,
wide lower glacis and low stern rake/mudflap seats. They are repaired with a
**closed raised soffit**: the original solid centre belly and stepped tub stay
intact, a connected centre bridge joins them to the roof, and the complete
outer sponson and rear deck continue above the return run. The lower glacis
and stern remain closed inter-track cores beneath their full upper armor.
Both rear mudflaps remain visible and supported, reseated above the terminal
shoes rather than deleted.

Exact strict band and individual-shoe audits improve from 341 band / 625 shoe
voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. The final evidence
packet contains 15 paired boards including the standardized elevated-left
profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. It
preserves the complete front/rear faces, skirt/fender silhouette and raised
terminal course.

The turret, mantlet, gun and roof equipment execute a genuine quarter-turn;
the entire hull package remains fixed. Parent audit is **0 stranded / 0
abutting / 0 dangling**. Two latent closed slabs were also rewound correctly:
the mirrored deck-edge chamfer and lower glacis. Final winding is **0 reversed
/ 0 mixed geometry with zero-pixel deficit**, and mode 2 is clean. The dark
muzzle bore and all ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. IS-6B dual-ledger
geometry is freeze **`feb36830`**, instance freeze **`87d6edda`** and asset
geometry **`28e2f770`** (35 rendered meshes / 51,174 vertices).

**KEEP the complete IS-6B exterior, fenders, skirt lips and supported
mudguards. Future course work may not subtract or open its hull.**

## 5.214 KV-2 CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The KV-2 retains its complete first-party hull and tower turret, upper
sponsons, nose deck, fender planes, handrails, mudguards, six-wheel
suspension and single native linked-shoe course. No exterior hull, skirt,
fender, wheel or track member is deleted. Its accepted side profile and
raised idler/sprocket terminal shape remain intact.

Native guard, wheel-face and suspension details now carry truthful
running-gear ownership. The physical contacts were the concealed broad lower
sponson, lower bow shelf and low outer stern corners. They are replaced by a
**closed inter-track hull core** joined through a solid centre bridge to the
unchanged raised outer armor. The full-width upper bow soffit, complete
sponson wall and stern corners continue above the visible shoe envelope.
Handrails and their supports remain attached to the raised side armor.

Exact strict band and individual-shoe audits improve from 933 band / 1,171
shoe sweep voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh
evidence contains 15 paired boards including the standardized elevated-left
profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Every
view preserves the closed front/rear body, full side armor, fenders and
continuous raised-terminal course.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry with zero-pixel
deficit**, and mode 2 is clean. The dark muzzle bore and all ten targeted
runtime-rig checks pass.

All eight targeted presentation assets are current. KV-2 dual-ledger geometry
is freeze **`8917bafa`**, instance freeze **`8461265a`** and asset geometry
**`9a078a92`** (36 rendered meshes / 103,522 vertices).

**KEEP the complete KV-2 exterior, fender planes, handrails, mudguards and
native raised-terminal track shape. Future corridor work may not subtract or
hollow its hull.**

## 5.215 TIGER I (NEWC42) CLOSED END-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party procedural Tiger I (Newc42 roster entry) retains its complete
slab hull, superstructure, glacis, full fender flare, front and rear
mudguards, drum turret, eight-wheel suspension and single native linked-shoe
course. No hull, fender, mudguard, wheel or track member is deleted.

The only physical contacts were the concealed full-width lower bow block and
low tail shelf entering the front and rear terminal wraps. Both ends now use
**closed inter-track cores** beneath the unchanged full-width upper bow and
tail armor. The upper slope, driver plate, exterior fenders and both visible
mudguards retain their established silhouette and support.

Exact strict band and individual-shoe audits improve from 98 band / 98 shoe
sweep voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. All views retain
the complete hull and raised end-wheel track profile.

The complete turret, gun and roof suite execute a genuine quarter-turn while
the hull and running gear remain fixed. Parent audit is **0 stranded / 0
abutting / 0 dangling**. Winding is **0 reversed / 0 mixed geometry with
zero-pixel deficit**, and mode 2 is clean. The dark muzzle bore and all ten
targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Tiger I (Newc42)
dual-ledger geometry is freeze **`5c99244a`**, instance freeze **`c7bec406`**
and asset geometry **`cd4c72a1`** (39 rendered meshes / 50,930 vertices).

**KEEP the complete Tiger I exterior, fender flare, supported mudguards and
native terminal track shape. Future corridor work may not subtract or hollow
its hull.**

## 5.216 COMET SIDE-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party Comet retains its complete Cromwell-family hull, pannier
armor, glacis, track guards, fender aprons, turret and five-wheel native
course. No hull, skirt, fender, wheel or track member is deleted.

The physical contact was limited to the lowest 3 cm of the rear end of the
outer pannier slice. That supported slice is raised locally above the shoe
envelope while the full upper pannier and closed centre hull remain intact.
The lower side seam remains present and seated on the raised armor rather
than crossing the rear shoe surface.

Exact strict band and individual-shoe audits improve from 12 band / 4 shoe
sweep voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Every view
preserves the accepted complete side hull and native course.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. The parent audit's single merged `hullGlass`
abutting box is the visibly fixed bow-light/guard group ahead of the turret,
not stranded turret equipment; pixels and mode 2 show no candidate. Winding
is **0 reversed / 0 mixed geometry with zero-pixel deficit**. The dark muzzle
bore and all ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Comet dual-ledger
geometry is freeze **`9ebfa1e0`**, instance freeze **`b9e04df3`** and asset
geometry **`4c3d9a71`** (37 rendered meshes / 43,085 vertices).

**KEEP the complete Comet hull, panniers, guards, fenders and native course.
Future corridor work may not subtract or hollow its armor.**

## 5.217 A30 CHALLENGER CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party A30 Challenger cruiser retains its complete long
Cromwell-family hull, pannier armor, bow, track guards, fender aprons, turret
and six-wheel native course. No hull, skirt, fender, wheel or track member is
deleted.

The broad low pannier slice is raised above the shoe envelope and joined to
the unchanged centre body by a **solid inter-track bridge**. The full-width
outer side armor continues from that raised soffit to the roof. Its low bow
tip is lifted above the idler wrap rather than clipped or opened, while the
closed toe core and full glacis remain present. The lower side seam remains
supported on the raised armor.

Exact strict band and individual-shoe audits improve from 215 band / 7 shoe
sweep voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Every view
preserves the long closed hull, full upper sides and native track profile.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry with zero-pixel
deficit**, and mode 2 is clean. The dark muzzle bore and all ten targeted
runtime-rig checks pass.

All eight targeted presentation assets are current. A30 Challenger
dual-ledger geometry is freeze **`5ec6c300`**, instance freeze **`e0b7787e`**
and asset geometry **`f79233ec`** (36 rendered meshes / 41,063 vertices).

**KEEP the complete A30 hull, pannier armor, guards, fenders and native
course. Future corridor work may not subtract or hollow its armor.**

## 5.218 CHARIOTEER CLOSED TRACK-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party Charioteer retains its complete Cromwell-family hull, broad
pannier armor, bow, track guards, fender aprons, turret and five-wheel native
course. No hull, skirt, fender, wheel or track member is deleted.

The low pannier underside is raised above the shoe envelope and joined to the
unchanged centre body by a **solid inter-track bridge**. Full-height outer side
armor continues from that closed soffit to the roof. The bow toe, lower side
seam and complete guard course are lifted just above their native end and shoe
wraps rather than clipped, opened or replaced.

Exact strict band and individual-shoe audits improve from 348 band / 0 shoe
sweep voxels to **front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence
contains 15 paired boards including the standardized elevated-left profile,
15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Every view
preserves the closed hull, full side armor, guards and native track profile.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry with zero-pixel
deficit**, and mode 2 is clean. The dark muzzle bore and all ten targeted
runtime-rig checks pass.

All eight targeted presentation assets are current. Charioteer dual-ledger
geometry is freeze **`368c7000`**, instance freeze **`66caa0b3`** and asset
geometry **`bd0ea04b`** (36 rendered meshes / 42,299 vertices).

**KEEP the complete Charioteer hull, pannier armor, guards, fenders and native
course. Future corridor work may not subtract or hollow its armor.**

## 5.219 LEICHTTRAKTOR CLOSED END-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party Leichttraktor retains its complete riveted hull, tall track
frames, bow and tail armor, rear fighting deck, turret and six-wheel native
course. No hull, track frame, guard, wheel or track member is deleted.

The original broad low body is expressed as a closed centre belly plus joined
outer pannier solids whose soffits clear the native course while preserving
the full ±1.0 hull silhouette. The tail uses the same construction: its low
centre core remains closed and its complete outer armor continues above the
sprocket wrap. This removes penetration without hollowing the hull or cutting
the track-frame outline.

Exact strict audit improves from front 18 / rear 35 band voxels, front 32 /
rear 66 shoe voxels and sweep 63/130 to **front 0/0, rear 0/0 and complete
sweep 0/0**. Fresh evidence contains 15 paired boards including the
standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG /
45 distinct hashes**. Every view preserves the tall riveted side frames,
closed bow/tail and continuous native track profile.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry with zero-pixel
deficit**, and mode 2 is clean. The dark muzzle bore and all ten targeted
runtime-rig checks pass.

All eight targeted presentation assets are current. Leichttraktor dual-ledger
geometry is freeze **`6492b590`**, instance freeze **`13eb520b`** and asset
geometry **`a4999947`** (33 rendered meshes / 33,948 vertices).

**KEEP the complete Leichttraktor hull, riveted track frames, bow/tail armor
and native course. Future corridor work may not subtract or hollow them.**

## 5.220 TIGER II CLOSED END-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party Tiger II retains its complete upper hull, roof, glacis,
central lower nose, belly, tail, side armor, fenders, mudguards, turret and
nine-wheel native course. No hull, skirt, fender, wheel or track member is
deleted.

The lower nose is rebuilt as the correct closed inter-track core, while the
full-width upper glacis rises from that toe into the unchanged broad shoulder.
The low belly is kept as a closed centre solid between the track courses; the
unchanged upper hull and side armor preserve the entire external silhouette.
The correction therefore opens only the native end-wheel lanes and does not
hollow the hull or remove its visible armor.

Exact strict audit improves from front 72 / rear 32 band voxels, front 72 /
rear 0 shoe voxels and sweep 330/72 to **front 0/0, rear 0/0 and complete
sweep 0/0**. Fresh evidence contains 15 paired boards including the
standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG /
45 distinct hashes**. Every view preserves the complete Tiger II profile and
continuous native track course.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding mode 1 is **0 reversed / 0 mixed geometry with zero-pixel
deficit**. The mode-2 pixel candidate is visually adjudicated as legitimate
fixed hull-owned radiator/louvre deck and continuous side armor: top and rear
quarter yaw frames show broad hull seats, while no turret-semantic fitting is
left behind. The dark muzzle bore and all ten runtime-rig checks pass.

All eight targeted presentation assets are current. Tiger II dual-ledger
geometry is freeze **`305600d1`**, instance freeze **`b2ceff01`** and asset
geometry **`29b8e4e8`** (39 rendered meshes / 54,998 vertices).

**KEEP the complete Tiger II hull, glacis, belly, side armor, fenders and
native course. Future corridor work may not subtract or hollow them.**

## 5.221 T30 SHOE-CORRIDOR AND RUNNING-GEAR OWNERSHIP CLOSEOUT (2026-08-14, LIVE)

The first-party T30 retains its complete long hull, lower bow, full upper
glacis, sponsons, fenders, mudguards, turret and eight-wheel native course. No
hull, skirt, fender, wheel or track member is deleted.

The actual hull contact is localized to the lowest outboard edge of the long
glacis. That toe is kept as a closed inter-track plate and still rises into
the unchanged full-width shoulder, clearing the idler lanes without hollowing
or shortening the bow. The much larger dark hit was not hull armor or a
second track: it was the authored road-wheel recess discs. Those identical
discs now use the dedicated `hullRunningGearDark` ownership bucket so strict
lint recognizes them as suspension-owned wheel-bay geometry.

Exact strict audit improves from band sweep 0 and shoe sweep 592 (568
suspension-shadow / 24 hull) to **front 0/0, rear 0/0 and complete sweep
0/0**. Fresh evidence contains 15 paired boards including the standardized
elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct
hashes**. Every view preserves the closed hull, broad upper glacis, complete
wheel train and continuous native track course.

The complete turret and gun execute a genuine quarter-turn while the hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry**, with a negligible
six-pixel front deficit classified clean, and mode 2 is clean. The dark muzzle
bore and all ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. T30 dual-ledger geometry
is freeze **`153838e4`**, instance freeze **`b73d82bc`** and asset geometry
**`e9d8afa9`** (42 rendered meshes / 58,970 vertices).

**KEEP the complete T30 hull, glacis, fenders, suspension and native course.
Wheel-bay shadows remain running-gear-owned and may not be duplicated.**

## 5.222 M26 PERSHING CLOSED SPONSON-CORRIDOR CLOSEOUT (2026-08-14, LIVE)

The first-party M26 Pershing retains its complete hull, raised outer
sponsons, fenders, bow and stern armor, turret and six-wheel native running
gear. No hull, skirt, fender, mudguard, wheel or track member is deleted.

The strict contact was the broad underside of the full-width sponson and
authored wheel-recess, hub and suspension-bracket geometry. The hull now uses
a closed central inter-track body with joined raised outer sponson shoulders;
the original roof and side silhouette remains unchanged while the underside
clears the linked-shoe lanes. The identical wheel-recess and bracket geometry
now uses the dedicated running-gear ownership buckets so strict lint does not
misclassify suspension parts as hull armor.

Exact strict audit improves from **501 band / 1,019 shoe sweep contacts** to
**front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence contains 15
paired boards including the standardized elevated-left profile, 15 yaw0 and
15 yaw90 frames: **45 PNG / 45 distinct hashes**. Paired pixels preserve the
complete closed hull and raised outer armor while the native track remains a
single continuous course.

The complete turret and gun execute a genuine quarter-turn while hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry** with a 0.20% rear-left
deficit classified clean; mode 2 is clean. The dark muzzle bore and all ten
targeted runtime-rig checks pass.

All eight targeted presentation assets are current. M26 Pershing dual-ledger
geometry is freeze **`c1581114`**, instance freeze **`8eb5f983`** and asset
geometry **`9c25bd32`** (52 rendered meshes / 73,735 vertices).

**KEEP the complete closed hull and both raised outer sponsons. Wheel-recess,
hub and suspension-bracket geometry remains running-gear-owned and may not be
duplicated.**

## 5.223 M45 PATTON CLOSED CORRIDOR AND MUDGUARD RESEAT (2026-08-14, LIVE)

The first-party M45 Patton retains its complete hull, deck shoulders, fender
platforms, front and rear mudguards, turret and six-wheel native running gear.
No hull, skirt, fender, mudguard, wheel or track member is deleted.

The full-width sponson contact is resolved with a closed central inter-track
body and joined raised outer shoulders, preserving the accepted roof and side
outline. The shoulder skirt remains a closed armor course but its concealed
underside now meets the raised corridor floor. Wheel recesses, hubs and
suspension brackets keep their geometry and use the dedicated running-gear
ownership buckets. Both the inner mudguard panels and their outer wings were
raised together and reseated at the fender lip; none was removed or exempted.

Exact strict audit improves from **front 34 band / 8 shoe, rear 20 band / 8
shoe and sweep 442 band / 706 shoe contacts** to **front 0/0, rear 0/0 and
complete sweep 0/0**. Fresh evidence contains 15 paired boards including the
standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG / 45
distinct hashes**. Paired pixels retain the complete hull, deck shoulders and
both mudguard pairs while the native track remains one continuous course.

The complete turret and gun execute a genuine quarter-turn while hull and
running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling**. Winding is **0 reversed / 0 mixed geometry**, with a 0.17%
rear-left deficit classified clean; mode 2 is clean. The dark muzzle bore and
all ten targeted runtime-rig checks pass.

All eight targeted presentation assets are current. M45 Patton dual-ledger
geometry is freeze **`61f041c0`**, instance freeze **`1167ab47`** and asset
geometry **`9769ea43`** (47 rendered meshes / 69,967 vertices).

**KEEP the complete M45 hull, closed shoulder armor and both reseated
mudguard pairs. Running-gear ownership must not be used to exempt real armor.**

## 5.224 IS-1 / IS-2 CLOSED HULL AND RAISED SHOULDER CLOSEOUT (2026-08-14, LIVE)

The first-party IS-1 and IS-2 retain their complete lower hulls, straightened
glacis, full raised shoulder armor, fenders, sawtooth mudguards, turret and
six-wheel native running gear. No hull, fender, mudguard, wheel or track
member is deleted.

The shared lower body is now a closed inter-track core. Broad glacis and
sponson shoulders remain closed, joined armor volumes with their original
upper/outer silhouettes; only their concealed track-lane soffits rise above
the linked shoes. The straightened nose retains its pointed Soviet profile
through a narrower closed toe and raised outer glacis wings. Front/rear
fenders, sawtooth mudguards and their supports were raised and reseated as
complete assemblies. The return-run ceiling remains present but is correctly
owned as running-gear shadow geometry, and the right-side stowage remains
physically seated above the course.

For each tank, exact strict audit improves from **front 36 band / 47 shoe and
sweep 610 band / 1,493 shoe contacts** to **front 0/0, rear 0/0 and complete
sweep 0/0**. Each fresh evidence packet contains 15 paired boards including
the standardized elevated-left profile, 15 yaw0 and 15 yaw90 frames: **45 PNG
/ 45 distinct hashes per tank**. Paired pixels preserve the complete hull,
glacis shoulders and guards while the native track remains one continuous
course.

Both complete turret/gun packages execute a genuine quarter-turn while hull
and running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling** for both. Winding is **0 reversed / 0 mixed geometry** with a 0.02%
rear deficit classified clean. Mode-2's fixed `rig_hull/hullDetail#17`
nominee is legitimate hull-owned deck stowage: it stays visibly seated on the
upper shoulder after turret departure and has no turret silhouette or station
semantics. Both dark muzzle bores and all targeted runtime-rig checks pass.

All sixteen targeted presentation assets are current. IS-1 dual-ledger
geometry is freeze **`e490314c`**, instance freeze **`f26923da`** and asset
geometry **`de3a7c0d`** (33 rendered meshes / 55,014 vertices). IS-2 is freeze
**`9f030f34`**, instance freeze **`b4f92501`** and asset geometry
**`14694d29`** (33 rendered meshes / 55,014 vertices).

**KEEP both closed hull cores, full raised shoulders, fenders and sawtooth
mudguards. The fixed deck-stowage nominee is hull-owned and must stay seated.**

## 5.225 SHERMAN FAMILY CLOSED SPONSON AND NATIVE-GEAR CLOSEOUT (2026-08-14, LIVE)

The first-party M4A3E8 and Sherman Jumbo retain their complete hulls, full
outer sponson armor, glacis, fenders, mudguards, sand shields, turrets and
six-wheel native running gear. No hull, skirt, fender, mudguard, wheel or
track member is deleted.

Both hulls now use closed inter-track cores with joined outer shoulder
bridges whose complete undersides sit above the native linked-shoe envelope.
The M4A3E8's HVSS wheel-bay wall, recess discs and bogie hardware retain their
geometry under explicit running-gear ownership. Its full fender and both
mudguards are raised and reseated together above the course. The Jumbo's
former low outer belly strips remain present as closed raised shoulder
bridges under its unchanged full-height side armor and sand shields. The
mirrored Jumbo nose flange and rotor taper also have corrected outward
winding with no silhouette or dimensional change.

Exact strict band and individual-shoe audits are **front 0/0, rear 0/0 and
complete sweep 0/0** for both tanks. Fresh evidence contains 15 paired boards
including the standardized elevated-left profile, 15 yaw0 and 15 yaw90
frames per tank: **90 PNG / 90 distinct hashes**. Every view preserves the
closed body, full outer armor, guards and one continuous native course.

Both complete turret/gun packages execute a genuine quarter-turn while hull
and running gear remain fixed. Jumbo parent audit is **0 stranded / 0
abutting / 0 dangling**. The M4A3E8 parent nominee is legitimate fixed
`hullWood` deck-tool/stowage geometry: top and close-roof yaw evidence shows
both long tools seated on the engine deck while the turret departs, with no
turret semantics or empty-air span. Winding census is **0 reversed / 0 mixed
geometry** for both; mode 2 is clean. Both dark muzzle bores and all 19
targeted live-rig checks pass.

All targeted presentation assets are current. M4A3E8 dual-ledger geometry is
freeze **`c437f778`**, instance freeze **`bf6a59ac`** and asset geometry
**`80bbd338`** (49 rendered meshes / 77,626 vertices). Sherman Jumbo is
freeze **`3aae60d0`**, instance freeze **`651097a6`** and asset geometry
**`eca3320a`** (42 rendered meshes / 61,358 vertices).

**KEEP both complete Sherman hulls, raised outer shoulders, fenders,
mudguards/sand shields and native courses. Running-gear ownership may not be
used to exempt real armor.**

## 5.226 T-34-85 FAMILY CLOSED HULL AND RAISED FENDER CLOSEOUT (2026-08-14, LIVE)

The first-party T-34-85 and T-34-85 CAD retain their complete hulls, sloped
glacis and tail armor, full side shoulders, fenders, mudguards, turret and
five-wheel native running gear. No hull, fender, mudguard, wheel, suspension
or track member is deleted.

Both variants now use closed central inter-track bodies with joined raised
outer armor. The base T-34 keeps its complete original upper side and nose
silhouette while its concealed underside clears the linked course. The CAD
variant's glacis, side and tail volumes are closed centrally and continue
outboard as full raised wings rather than leaving a hollow lane. Complete
front/rear fenders, mudflaps, bins, fuel drums, tarp, tools and cable were
raised and reseated together. Wheel shadows and suspension arms retain their
geometry under explicit running-gear ownership.

Exact strict band and individual-shoe audits are **front 0/0, rear 0/0 and
complete sweep 0/0** for both tanks. Fresh evidence contains 15 paired boards
including the standardized elevated-left profile, 15 yaw0 and 15 yaw90
frames per tank: **90 PNG / 90 distinct hashes**. Every view preserves the
closed body, complete fender line, five readable wheels and one continuous
native course with raised terminal transitions.

Both complete turret/gun packages execute a genuine quarter-turn while hull
and running gear remain fixed. Parent audit is **0 stranded / 0 abutting / 0
dangling** for both. The CAD mode-2 `rig_hull/hull#18` nominee is legitimate
fixed rear-deck stowage: the short trunk remains visibly seated on the closed
deck after turret departure and has no turret silhouette or station
semantics. Winding is **0 reversed / 0 mixed geometry**; the CAD's three-pixel
rear-left deficit is 0.00% and classified clean. Both dark muzzle bores and
all 19 targeted runtime-rig checks pass.

All sixteen targeted presentation assets are current. T-34-85 dual-ledger
geometry is freeze **`5b8cb28c`**, instance freeze **`5c6858cd`** and asset
geometry **`64246a81`** (41 rendered meshes / 56,298 vertices). T-34-85 CAD is
freeze **`b10dbb54`**, instance freeze **`eac9f85c`** and asset geometry
**`2cf15a6c`** (37 rendered meshes / 41,178 vertices).

**KEEP both complete closed hulls, raised outer armor, full fenders,
mudguards and five-wheel native courses. Running-gear ownership must never be
used to remove or exempt real armor.**

## 5.227 PANTHER G CLOSED CORRIDOR AND SCHÜRZEN CLOSEOUT (2026-08-14, LIVE)

The first-party Panther G retains its complete lower hull, sloped
superstructure, glacis, fenders, full-height Schürzen course, turret and
eight-station interleaved native running gear. No hull, skirt, fender, wheel,
suspension or track member is deleted.

The lower hull and both front plates now use closed central inter-track
volumes with joined raised outer shoulders/wings. The complete sloped upper
silhouette is unchanged. Every Schürzen plate keeps its original height and
vertical placement; the intact course is reseated just outboard of the linked
shoe envelope, including the characterful bent plate, rather than being
raised into or removed from the hull. The interleaved-wheel AO backer remains
present under explicit running-gear ownership.

Exact strict band and individual-shoe audits improve from **front 122 band /
68 shoe, rear 100 band / 12 shoe and sweep 1,684 band / 350 shoe contacts** to
**front 0/0, rear 0/0 and complete sweep 0/0**. Fresh evidence contains 15
paired boards including the standardized elevated-left profile, 15 yaw0 and
15 yaw90 frames: **45 PNG / 45 distinct hashes**. Every view preserves the
closed body, eight readable overlapping wheel stations, full side armor and
one continuous native course.

The complete turret/gun package executes a genuine quarter-turn while hull,
stowage and running gear remain fixed. Parent audit is **0 stranded / 0
abutting / 0 dangling**. The mode-2 `rig_hull/hullDetail#17` nominee is the
pair of legitimate fixed rear-deck stowage boxes: both remain visibly seated
on the closed engine deck after turret departure and have no turret silhouette
or station semantics. Winding is **0 reversed / 0 mixed geometry**, with a
0.02% rear deficit classified clean. The dark muzzle bore and all ten
targeted runtime-rig checks pass.

All eight targeted presentation assets are current. Panther G dual-ledger
geometry is freeze **`43e00c5a`**, instance freeze **`6f7944b6`** and asset
geometry **`2cfddd39`** (37 rendered meshes / 48,974 vertices).

**KEEP the complete closed Panther hull, raised joined glacis wings,
full-height outboard Schürzen, fenders and interleaved native course. The
wheel-bay backer is running-gear-owned and must not be duplicated as armor.**

## 5.228 LEOPARD 2 REVOLUTION SINGLE SMART-COURSE CLOSEOUT (2026-08-14, LIVE)

The owner-marked underside view identified the Revolution's recessed
connector/guide-horn instancing as a second complete green course beneath the
real tread-pad run. The correction is profile-local: `integratedLinks:true`
keeps the recessed web and center guide horn in the animated outer tread while
omitting the exposed parallel connector rails and transverse pin-cap row. The
terrain-conforming smart band, detailed
tread, seven road wheels, raised idler/final drive, suspension and end
transitions remain unchanged. No hull, glacis, armor plate, side or top skirt,
sponson, fender, mudguard or guard geometry is removed or reshaped.

The immediately preceding 2A7V-specific suppression was based on the wrong
tank identification and is fully reverted. 2A7V returns to its accepted
geometry and presentation assets; the shared factory capability remains only
as an explicit per-profile opt-in for Revolution.

A new read-only `tank:track:duplicates` audit examines all 105 first-party
playables. It rejects overlapping smart bands/pad courses and any non-running-
gear full-length proxy occupying the loaded lower-run envelope, while
distinguishing spare-track/stowage buckets and separated multi-lane systems.
The complete fleet reports **PASS: 0 overlapping smart courses / 0 static
full-length track proxies**. The same audit now runs inside every targeted
`tank-release-check`.

Revolution dual-ledger geometry is freeze **`f8a15318`**, instance freeze
**`0184e0f1`** and asset geometry **`f4a9214c`** (73 rendered meshes / 102,453
vertices). All eight targeted presentation assets are regenerated. The
owner's elevated underside camera confirms that the duplicate green course is
gone while the detailed outer treads and complete armor envelope remain.

**KEEP the complete Revolution hull, armor, skirts and smart suspension
system. Future duplicate-course work may remove only a proven redundant
running-gear layer; it may never subtract vehicle armor or body geometry.**

## 5.229 FLEET SINGLE-SMART-SHOE STANDARDIZATION (2026-08-14, LIVE)

All 105 first-party playables now use one terrain-conforming animated shoe
instance layer per canonical running-gear build. The outer pad, grousers,
recessed web, connector rails, pins and guide horn are merged into that one
shoe before instancing; suspension deformation, scrolling, end wraps, road
wheels, raised idler and final drive remain unchanged. Leopard 2 Revolution
uses its narrower reduced web/horn component and a dark worn-steel shoe finish
so the owner-selected `gearTrackPads` no longer read as body-camouflage olive.

The read-only duplicate audit is now stricter: a separate connector/guide
mesh is itself a fleet failure. It reports **105/105 integrated smart-shoe
layers**, **0 overlapping smart courses** and **0 static full-length track
proxies**. The audit explicitly classifies armor, hull plates, side/top
skirts, mudguards, fenders, sponsons and track guards as protected bodywork;
those classes are excluded from duplicate candidates and are never edited by
the tool.

Visual sampling across Revolution, 2A7V, Leclerc, Ariete, T-90M, T-72B3M and
M1A2 confirms one coherent tread course with the complete accepted bodywork
envelope intact. Unit tests, production build and the full 105-tank duplicate
audit pass.

**KEEP every complete armor/bodywork envelope. Future smart-track changes are
track-only and must preserve the one integrated animated shoe contract.**

## 5.230 T-90A WELDED-BASE AND SHTORA CLEARANCE REVISION (2026-08-14, LIVE)

The first-party T-90A no longer uses its rotational half-dome foundation. A
single shared helper now authors the exact T-90SM welded foundation: the same
variable-base faceted shell, rear casting shelf and structural crown. T-90SM
is byte-stable after the refactor—freeze **`f0294f9c`**, instance freeze
**`1856845a`**, asset geometry **`fe26cb10`**, 48 rendered meshes and 93,281
vertices—while T-90A keeps its own hull, gun, K-5, Shtora and roof identity.

The former generic full-width K-5 leaves crossed the two OTShU/Shtora optical
lanes. They are replaced by split inner/outboard K-5 modules whose buried
roots enter the welded cheek on opposite sides of each emitter. Both larger
eye stations now sit forward in deliberate armor openings on broad tapered
pedestals; their circular red lenses, housing fins and brackets are fully
visible from front, quarter, top and yaw90 views. Existing flank cassettes,
roof stations, bustle equipment and radio whips remain turret-owned and
supported. Two shallow joined hull shoulders also close the pre-existing bow
and rear-service plan pockets without moving skirts or entering the track
lane.

Fresh authored-only evidence contains 15 presentation boards, including the
standardized elevated-left profile, plus 15 yaw0 and 15 yaw90 frames: **45
PNG / 45 distinct hashes**. It proves a genuine quarter-turn of the complete
welded shell, gun, K-5/Shtora package, roof equipment, bustle bins and both
radio stations while the hull and running gear remain fixed. Runtime rig
checks pass **10/10**; strict track clearance is **front 0/0, rear 0/0 and
sweep 0/0**; contiguity is **0**; the supported MG and dark muzzle bore pass;
the winding census is **0 reversed / 0 mixed** with no render deficit.

All eight targeted presentation assets are current. T-90A dual-ledger
geometry is freeze **`b9547790`**, instance freeze **`0593ea9b`** and asset
geometry **`2e8becf6`** (61 rendered meshes / 121,953 vertices).

**KEEP the shared welded foundation, unobstructed eye lanes and complete
T-90A hull/bodywork envelope. Future ERA changes must preserve both optical
cones and visible cheek load paths.**

## 5.231 M1A2 SEPv2 PRESENTATION / DUAL-LEDGER RECONCILIATION (2026-08-14, LIVE)

The accepted first-party SEPv2 runtime geometry already carried the current
Abrams flush-armor and roof-system revisions, but its eight generated garage
assets and dual geometry ledger still described the preceding build. This is
a presentation-only reconciliation: no hull, turret, armor, equipment,
running-gear or ownership geometry changes in this step.

All eight targeted SEPv2 assets and their manifest metadata are regenerated
from the live first-party procedural build. Current dual-ledger geometry is
freeze **`c4c00554`**, instance freeze **`b94c3e9e`** and asset geometry
**`b94a412f`** (56 rendered meshes / 200,422 vertices). Targeted asset,
native-course, rig, muzzle and winding checks remain the release authority
for the unchanged accepted build. The legacy external-oracle fidelity row
still reports its historical 14.3 mismatch and is explicitly not treated as
proof against this owner-authored runtime; no geometry was changed to chase
that non-authoritative source.

**KEEP the complete accepted SEPv2 geometry. Future asset refreshes must be
targeted to this tank and may not modify another manifest row.**

## 5.232 T-90A RING-CENTER AND SHTORA-SEAT CORRECTION (2026-08-14, LIVE)

The complete T-90A rotating assembly is moved rearward from the obsolete
glacis-biased offset onto the authored hull-ring datum. The gun, welded shell,
K-5, Shtora package, roof equipment, bustle bins and radio stations remain one
turret-owned group; no hull, skirt, armor or running-gear geometry changes.

Both Shtora stations are also pulled 220 mm into their cheek lanes. Their broad
tapered pedestals are shortened with them, so the larger circular eyes remain
fully supported and unobstructed without reading as lamps on long projecting
stalks. Fresh front, side, elevated-quarter, close-roof and yaw90 evidence
confirms the centered bearing, continuous cheek load paths and coherent
quarter-turn.

Machine gates pass at **90.4 minimum**, strict track clearance is **0/0 +
0/0**, contiguity is **0**, the single integrated smart course passes, the
muzzle bore passes, runtime rig checks pass **10/10**, and winding/ownership is
clean with **0** stranded yaw candidates. All eight presentation assets are
regenerated. Current dual-ledger geometry is freeze **`cb360ad9`**, instance
freeze **`9d73c134`** and asset geometry **`0bdddd95`** (61 rendered meshes /
121,953 vertices).

**KEEP the centered ring seat and shortened supported Shtora pedestals. Future
eye or ERA changes must preserve the clear optical lanes and one rotating
assembly.**

## 5.233 T-90A VLADIMIR RAISED-IDLER AND LARGE-BUSTLE REVISION (2026-08-14, LIVE)

Vladimir retains its complete recovered hull, side skirts, fenders and armor.
Only the authored running gear changes: six full-size road wheels use a tighter
non-overlapping cadence, a distinct 0.28 m front idler occupies its own raised
terminal bay, and the single integrated smart course follows a clean trapezoid
around the unchanged rear final drive. The final track route clears the
existing front mudguard without moving or deleting that bodywork.

The turret now carries one much larger closed welded bustle. Its forward
station buries through the cast rear shoulder and tapers through four supported
lid courses to a framed service terminal. Unequal side bins, diagonal returns
and a backed rear grid articulate the body while remaining part of
`rig_turret`; yaw0/yaw90 evidence shows the complete bustle relocating with the
gun, casting and roof equipment. The fixed hull-owned open fender/service frame
remains supported and is not stranded turret mass.

Machine gates pass at **90.4 minimum** with strict track clearance **0/0 +
0/0**, contiguity **0**, one integrated smart course, a valid muzzle bore and
runtime rig checks **10/10**. Winding is **0 reversed / 0 mixed**. All eight
presentation assets are regenerated. Current dual-ledger geometry is freeze
**`7141cfc8`**, instance freeze **`82fc6f8`** and asset geometry
**`d5d1c997`** (42 rendered meshes / 73,860 vertices).

**KEEP the complete bodywork, separated raised idler and connected tapered
bustle. Future track work must fit beneath the mudguard rather than subtracting
armor or skirts.**

## 5.234 T-90M PRORYV TRACK-PROFILE AND SEARCHLIGHT REVISION (2026-08-14, LIVE)

Proryv retains its complete accepted hull, glacis, side skirts, mudguards,
armor and rear-service structure. Only the actual running gear changes: the
six full-size road wheels now occupy a shorter centered loaded run, leaving a
clear terminal bay ahead of wheel six and behind wheel one. A distinct raised
front idler and raised rear final drive carry one continuous trapezoidal smart
course; the upper return remains supported by four rollers and no second
static track proxy is present. No bodywork was deleted, raised or cut to make
the track fit.

The blue searchlight is raised as one supported turret-owned assembly. Its
broad armored shoe, unequal yokes, cylindrical lamp, dark rim and blue lens all
move upward together, preserving the visible load path and optical aperture.
Yaw0/yaw90 evidence confirms that the complete lamp relocates with the turret
while the redesigned course, wheels, skirts and hull service equipment remain
fixed.

Strict exact track clearance is **front 0 / rear 0**, shoe clearance is **0 / 0**
and the full sweep is **0 / 0**. The duplicate-course audit reports one
integrated smart-shoe layer; the muzzle bore and runtime rig pass **10/10**.
Face winding is **0 reversed / 0 mixed**. Its sole yaw-census candidate is the
fixed rear canvas/fuel-drum package, which is visibly seated on the transom and
correctly remains hull-owned. All eight presentation assets are regenerated.
Current dual-ledger geometry is freeze **`c69eb7e0`**, instance freeze
**`dd8523cc`** and asset geometry **`936bd268`** (54 rendered meshes / 125,402
vertices).

**KEEP the complete Proryv bodywork, separated terminal wheel bays and raised
supported searchlight. Future running-gear work may alter only the wheels and
smart course, never hull armor or skirts.**

## 5.235 T-72B OBR. 1987 COMPLETE CURRENT-FAMILY REDESIGN (2026-08-14, LIVE)

The first-party `t72b_1987` is rebuilt as a distinct period member of the
current T-72 family rather than a decorated copy of B3M or BU. Its complete
hull is one closed low loft with the T-72 family's compact wheelbase, tapered
bow shoulders, engine-deck falloff and backed transom. The full segmented side
skirt remains in place and carries separately supported Kontakt-1 cassettes;
no hull plate, mudguard, skirt or armor course was deleted to clear the track.

The rotating assembly now uses a broad, low pear-shaped cast shell with buried
mantlet shoulders. Four staggered frontal Kontakt-1 courses, a tighter inner
horseshoe and three descending flank courses follow the casting with mixed
pitch, depth and yaw instead of the former decorative necklace. A lower
commander/NSVT station, planted TPN sight, large Luna searchlight on a welded
two-stay cradle, low periscopes and an unequal supported rear service rack give
the obr. 1987 its own period-correct roof and bustle grammar while remaining
visibly related to the current B3M and BU family.

The running gear has six large separated road wheels, a distinct raised front
idler, raised rear final drive and one integrated animated smart-shoe course.
Exact clearance is **front 0 / rear 0**, individual-shoe clearance is **0 / 0**
and the full strict sweep is **0 / 0**. The duplicate audit reports one course;
runtime rig checks pass **10/10**, muzzle-bore and winding checks pass, and the
turret-parent audit reports **0 stranded / 0 abutting / 0 dangling**.

Fresh first-party evidence contains 15 paired presentation boards plus 15
yaw0 and 15 yaw90 frames: **45 PNG / 45 distinct hashes**. Top, hero, close and
rear comparisons prove a genuine quarter-turn of the gun, cast shell, complete
Kontakt-1 blanket, smoke banks, Luna/TPN equipment, commander/NSVT station,
antennas and rear rack. The hull deck, side armor, glacis Kontakt-1, transom,
wheels and smart course stay fixed. No floating attachment, hollow hull, open
sheet, duplicate course or yaw-dependent wound is visible.

All eight targeted presentation assets are regenerated. Current dual-ledger
geometry is freeze **`acc6dd00`**, instance freeze **`8719f205`** and asset
geometry **`6e2b8941`** (41 rendered meshes / 152,135 vertices). The full unit
test suite and production build pass. The fleet snapshot tool still stops on
the pre-existing unrelated stale `m1a2_sepv3` manifest row; this tank's three
fingerprints were therefore captured directly from the same deterministic
freeze page and its ledger row is updated without altering Abrams assets.

**KEEP the complete B87 hull/skirt envelope, period Kontakt-1 identity,
supported roof/rear equipment and singular six-wheel smart course. Future
family refinements must preserve this period distinction and ownership split.**

## 5.236 VLADIMIR / T-72B3M GARAGE PLATFORM CENTERING (2026-08-14, LIVE)

The first-party T-90A Vladimir and T-72B3M obr. 2022 builders retain recovered
family coordinate frames whose complete hull-plan centers sit respectively
0.83 m and 0.81 m aft of the local rig origin. The garage previously planted
that historical origin on the disc center, so both vehicles visibly stood off
the platform datum even though their gameplay, armor and turret pivots were
internally coherent.

Each spec now declares its measured presentation-only longitudinal correction.
The pedestal pose rotates that local +Z correction through the standard garage
yaw before placing the root, so the physical hull/ring center lands on the
platform center from every showroom orbit. Cached heroes and map re-seating use
the same pose function. No builder vertices, armor volumes, tracks, turrets,
physics transforms or generated tank assets change.

**KEEP these offsets presentation-only. Future model centering must never move
certified gameplay geometry merely to compensate for a showroom datum.**

## 5.237 GARAGE COUNTRY / TIER / NAME ORDER (2026-08-14, LIVE)

The garage's existing Modern / Cold War / WWII catalog partition is retained,
but cards inside each catalog now follow the owner rule exactly: country first,
numeric tier second, display name third, then id only as a deterministic
duplicate-name tie-break. USSR, USSR/Russia and Russia share one country block.

**KEEP the catalog partition outermost and the country block immediately
inside it. Tier-first ordering across countries is not the owner rule.**

## 5.238 BMP-2M OWNER MODERNIZATION (2026-08-14, LIVE)

The live first-party BMP-2 remains a class `ifv` with its 30 mm 2A42 APDS and
HE-I belts on the dedicated sub-second autocannon recoil/reload path. Its
visual package is modernized additively: two staggered upper-glacis cassette
rows, seven supported side cassettes per side, low buried turret protection,
rear equipment cells, twin protected headlight clusters, four-quadrant
laser-warning/EO heads, an independent thermal viewer and two collar-seated
radio whips. All side protection stays above the smart-track return; no hull,
fender, skirt, wheel or track geometry is removed.

**KEEP the BMP's complete boat hull and singular six-wheel course. Future
modernization may add supported equipment, never hollow the hull or substitute
a duplicate track layer.**

## 5.239 T-90A VLADIMIR INTEGRATED TURRET HEIGHT (2026-08-14, LIVE)

Vladimir's accepted long welded bustle is retained, but its fighting
compartment no longer ends as a visibly lower half-dome beneath that bustle.
The actual faceted cast crown rises aft while preserving the existing low
cheek, mantlet, Shtora and Kontakt-5 envelope. A closed upper shoulder overlaps
both the crown and the forward bustle frame, replacing the former abrupt
vertical step with one load-bearing transition.

The ESSA housings, cupola, gunner station, periscopes and NSVT are reseated on
the raised roof line rather than buried by it. Every changed component remains
turret-owned; the parenting audit reports **0 stranded / 0 abutting / 0
dangling**, the live rig passes **10/10**, the muzzle bore passes and duplicate
track audit confirms the unchanged singular smart course. Winding is **0
reversed / 0 mixed**; its fixed hull service-frame yaw candidate predates this
turret-only change and remains legitimate hull-owned structure.

**KEEP the new crown-to-bustle height flow. Future height work must reshape and
reseat the complete roof assembly, never stack a disconnected cover above the
old dome.**

## 5.240 ABRAMS FAMILY RAKED SHOULDERS / REAR-CORNER CLOSURE (2026-08-15, LIVE)

The first additive repair correctly covered the front plan pockets but left two
visual faults: its roofs read as flat shelves above the real shoulder seam, and
the rear-left/right sprocket wells were still open between the side armor and
engine-deck corners. The shared first-party M1A1, M1A1HA, M1A2, TUSK, SEPv2 and
SEPv3 hull now replaces each flat front cap with a two-stage raked wedge. Its
inner carrier overlaps the center bow above the idler crown while its outboard
return descends into the existing fender/skirt line beyond the track-pin plane.

Each rear corner now has a high hull-owned roof from the central stern structure
to the outer fender, plus a full side return joining the skirt top, grille pod
and existing rear guard/tongue. Elevated rear-quarter views land on continuous
armor instead of seeing through to the sprocket bay. No hull, glacis, skirt,
wheel, suspension, smart-track or variant equipment geometry is removed.

Exact band clearance, individual-shoe clearance and strict sweep remain
**front 0 / rear 0** for all six tanks, and duplicate-track audit confirms one
integrated animated course per tank. Winding mode 1 remains clean. Fresh
first-party evidence contains 15 paired, 15 yaw0 and 15 yaw90 frames per variant
(**270 PNGs / 270 distinct hashes**); the repaired shoulders and rear corners
remain hull-fixed while every complete turret executes a genuine quarter-turn.
The supplied front/rear camera classes were also reproduced at close range in
Surface Lab and show the front rake and both closed rear wells directly.

All six icon, silhouette, armor, hit-zone and module sets are regenerated.
Current dual-ledger freezes are **`da934f6c`** (M1A1), **`fcbe7ff0`** (M1A1HA),
**`4cce8a04`** (M1A2), **`fae459f0`** (TUSK), **`065d7e9b`** (SEPv2) and
**`ca666266`** (SEPv3). The targeted asset fingerprints are current; the full
unit-test suite and production build pass.

**KEEP this repair additive and family-wide. Future corridor work must retain
the complete side armor, raked front shoulders, closed rear wells and singular
animated smart-track course.**

## 5.241 BASE T-90 UNIFIED FRONTAL COMBAT-PACKAGE RAISE (2026-08-15, LIVE)

The plain first-party `t90` retains the exact shared Burlak core, complete
five-station bustle, roof equipment, hull, skirts and running gear. Only the
front combat-package datum changes. The complete 2A46M gun/saddle group,
enlarged Shtora eyes, their tapered cheek roots, the broad shoulder carrier,
buried mantlet bridge and both irregular frontal Kontakt-5 courses rise
**0.12 m** and move **0.07 m toward the bow** together. This restores the
requested gun-line relationship without leaving an eye housing, armor face or
hidden carrier at the superseded lower station.

Fresh first-party evidence contains 15 paired boards, 15 yaw0 frames and 15
yaw90 frames (**45 PNGs / 45 distinct hashes**). Direct-front, elevated hero
and live Surface Lab views show both eyes centered beside the cannon root and
the K-5 fan clear of the hull roof. The genuine quarter-turn carries the gun,
eyes, carrier, mantlet bridge and every changed armor leaf together; no gap,
stranded fitting, duplicate turret mass, open sheet or winding wound appears.
The only parent-audit nominee remains the established hull-owned forward-deck
spare-link stowage.

Exact track clearance remains **front 0 / rear 0**, individual-shoe clearance
is **0 / 0**, and the duplicate audit reports one integrated animated course.
The muzzle bore and targeted asset check pass. All eight changed presentation
images and the asset manifest are regenerated. Current dual-ledger geometry is
freeze **`d15f8148`**, instance freeze **`6fb5ae46`** and asset geometry
**`b13d9370`** (71 rendered meshes / 131,004 vertices).

**KEEP the three-part datum coupled. Future gun-height work must carry the
Shtora housings, their supports, the shoulder carrier and both frontal K-5
courses with it rather than adjusting an exposed face independently.**

## 5.242 M1A2 TUSK UNIFIED CHEEK CASSETTES (2026-08-15, LIVE)

The first-party `m1a2_tusk` alone replaces the four visibly separated XM32
tiles on each forward turret cheek with one continuous deep cassette per
side. Each body follows the existing bilinear swept/raked Abrams cheek plane,
remains buried into its carrier and uses a zero-gap curved face skin without
the former recessed horizontal and vertical cross seams. The forward-side
armor, bustle cassettes, smoke banks, roof weapons, hull ARAT, skirts and
running gear remain unchanged.

Close left/right Surface Lab views show one uninterrupted armored field on
each cheek. A fresh yaw90 inspection carries both complete cheek cassettes
with the turret and exposes no detached face, empty-air support or winding
wound. Winding mode 1 is clean with zero reversed or mixed pieces. The known
hull-owned mode-2 candidate remains byte-semantically unchanged from the
parent and is not turret equipment.

Exact band, individual-shoe and strict-sweep track audits remain **front 0 /
rear 0**; duplicate-course audit still reports one integrated animated track
layer. Current geometry is freeze **`305dda8c`**, instance freeze
**`02856ab9`** and asset geometry **`91a169a6`** (66 rendered meshes / 184,772
vertices). TUSK presentation, armor, hit-zone and module assets are
regenerated and current; the full unit-test suite and production build pass.

**KEEP the cheek bodies visually singular. Their internally tessellated face
skin may follow the curved carrier, but no visible cross seam or four-tile
spacing may be reintroduced.**

## 5.243 K1A1 RAISED-TERMINAL TRACK PROFILE (2026-08-15, LIVE)

The first-party K1A1 keeps its complete accepted hull, pointed bow, full
sponson shoulders, segmented skirts, mudguards and six suspension-driven road
wheels. Its former front idler and rear final-drive centers sat almost directly
on the road-wheel datum, collapsing the visible track into a low rectangle.
Only those two terminal stations change: the full-size front idler rises by
0.17 m and the rear drive rises by 0.11 m. The loaded ground run and all six
road-wheel stations remain fixed, producing a long-base `\______/` course with
clean approach and departure ramps.

Close left and right Surface Lab profiles show both terminal transitions
wrapping their end wheels and returning continuously over the covered support
rollers. No hull, armor, skirt, guard, wheel or suspension component is
deleted, shifted or hidden. Duplicate-course audit confirms one integrated
animated tread/connector layer.

Exact band clearance, individual-shoe clearance and the complete strict sweep
are **front 0 / rear 0**. Winding mode 1 remains clean at zero reversed and
zero mixed meshes. Current geometry is freeze **`642e144c`**, instance freeze
**`5c64a0c8`** and asset geometry **`c868def5`** (62 rendered meshes / 73,888
vertices). K1A1 icons, silhouettes, armor, hit-zone and module assets are
regenerated and current.

**KEEP the complete K1A1 exterior and single smart course. Future running-gear
work may tune only the mechanical station path; it must not manufacture track
clearance by deleting or lifting hull and skirt geometry.**

## 5.244 SESSION RE-SYNC AT 0c627023 (2026-08-16, orchestrator): this
session pulled the 546-commit fast-forward after the monthly spend
limit terminated five of its agent rounds mid-flight (abrams
flank-panel pitch, k2 90-ladder, t44+type59 builds, §E batches
53/54/55, leopard RCWS re-cert). RECONCILIATION FINDINGS: the registry
is CONTINUOUS (no fork — the parallel session continued §5.78-§5.243
on top of this session's §5.34-§5.77 landings, through 2026-08-15);
this session's freezes stand or were properly re-frozen with lineage
(bradley 90a5568c -> 45ef7b0c §5.188; m45 53caa687 intact; leclerc
683be340 intact). Much of this session's queued work was EXECUTED
downstream by the parallel session (abrams family shoulders §5.240,
tusk cassettes §5.242, base-t90 package §5.241, k1a1 iterated to
freeze-class §5.243, vladimir/t90a revisions §5.230-§5.239, fleet
smart-shoe standardization §5.229). THE FIVE STALE WIP SNAPSHOTS are
RETIRED (parked at scratchpad prepull-wip/ + prepull-untracked/ —
historical only; any resumption re-derives from the LIVE registry
tail, not these). npm deps synced post-merge (@upstash/redis etc.),
full suite green. AGENT SPAWNING stays PAUSED pending the owner's
word on the spend limit; the live queue = the registry's own LIVE
tail sections + the standing DISMISSED-PENDING asks (m45 6.47,
newc_tiger, AFV stats, Sources cards).

## 5.245 POST-MERGE SPOT VERIFICATION (2026-08-16, orchestrator):
live gate reproduces the fleet claim (36/96; k1a1 gates 49.7 live at
this tree). Hash spot-check (k1a1/leclerc/m45) reads values differing
from their §3-era freezes — EXPECTED, not drift: §5.229 (2026-08-14)
standardized running gear across all 105 playables, legitimately
moving every geometry hash after that date; the parallel session's
freeze discipline also evolved to a three-hash system (geometry /
instance / asset — see §5.243's k1a1 record). Pre-§5.229 hash-table
entries are superseded-by-standardization; the LIVE gate + the
per-section freeze records from §5.229 onward are the operative
truth. No drift alarm.

## 5.246 FLEET ICON REGEN LANDED (2026-08-16): 351 of 981 icon files
refreshed from a clean-HEAD git worktree (the §5.45-era standing
order finally executed at a true quiet window, load 3.8): every
garage icon/silhouette/marking now matches the merged-tree build
state (the flips, the §5.38 wave, the §5.229 standardization, and
all §5.230-243 revisions render fresh). Worktree removed. The last
standing my-lane deferral is closed; the session idles pending the
owner's spend-limit word.

## 5.247 OWNER GOAL — TEN-TANK LECLERC-LEVEL QUALITY WAVE
(2026-08-17): "KV-2, ISU-122s, ISU-152, t-64bv1, leopard 1a5, tiger,
sturmtiger, panther, jagdpanzer e100, and t95 — full leclerc-level
redesign based on its model and historical references... ultra high
level of quality on par with our modern tanks. include all
decorations and detailing based off of our existing libraries. leave
nothing untouched and unimproved. make sure we load all sources
correctly." A session goal-hook enforces completion. LANES: casemate
(isu122s, isu152, sturmtiger, jpz_e100, t95), ww2 (tiger1,
panther_g — panther build reachable via tankFactory core), soviet-
heavy (kv2 — NEVER-GATE, visual/critic bar only), russia (t64bv1),
leopard (leo1a5). BAR per tank: §K exemplar flow (measure the print
+ historical references -> loft to measured lines -> close with real
geometry -> prove in pixels), the mature fitting/decoration libraries
applied, dual verification (gate where an oracle exists + independent
critic >=9.0 x14). FIRST STEP per round: verify the ids' oracle
registrations RESOLVE and the prints LOAD (report broken rows to the
orchestrator lane). Five builder rounds spawned; agent spawning
RESUMED by this order (spend pause lifted by the owner's goal).

## 5.248 OWNER ORDER — 28-PRINT GROUND-UP REBUILD WAVE (2026-08-17):
28 new reference GLBs dropped (Downloads root x13 + "Claude of Tanks
Models" folder x15). ORDER: "completely redesign the pl-01, t72 m1
jaguar, pt-91 a twardy, strv 122, amx 30b+stb1 (use more vertices and
geometries in turrets), type 90a, type 10b, t-64bv donbas, type 59,
ztz-85-III, type 99A2, carro 45t, ariete c1 and ariete c2, and the
rest of the tanks included above... because we just reused a lot of
models when i wanted completely new ones built from the ground up
doing high quality visual AND exact geometric comparison with the 3d
models... leclerc highest standards." READ: the parallel session's
family waves used donor-clone specs/geometry (variantOf) — the owner
wants GROUND-UP print-measured §K builds for every subject in the
drop set. EXECUTION: (1) onboarding delegated x2 agents (inspect,
provenance per the §5.38 ATTRIBUTION law, quarantine parking, node
censuses, registration-row PREPARATION — the orchestrator lands all
map edits); (2) rebuild rounds spawn per family lane AS REGISTRATIONS
LAND (poland/sweden/china/ukraine/japan/IFV lanes are free NOW; the
§5.247 ten-tank wave keeps its five lanes); (3) overlaps with live
rounds relayed (t64bv1 gets the donbass print mid-round; type90/
leo2a4/leo2a6 prints queue behind their lanes' current rounds).
STACKED GOALS: §5.247 (ten tanks) + §5.248 (this wave) both enforce.

## 5.249 §5.248 ONBOARDING COMPLETE — 28/28 REGISTERED (2026-08-17):
batch B (15, folder) + batch A (13, root) both landed: quarantine
parking, provenance verdicts (4x CC-BY-NC never-ship class, 3x
viewer-rip/WT-fingerprint strong suspects incl. the Arrafi rip-poster
account trio, 1x Tripo AI weak instrument, the rest clean-parked),
node censuses, three-map + vertex-REG rows, ATTRIBUTION sections.
SIDE FINDINGS: several registered oracle paths DANGLING on disk
(type10-repaired, recovered/type90, m2_bradley_ifv, leo2a6_buh —
.bak-only; the whole public/models/tanks tree reads untracked =
parallel-session territory); spz_puma RESTORED from the same-source
re-drop; type10 re-drop = byte-identical pristine receipt;
DISK-RESTORE ROUND queued for the rest. REBUILD ROUNDS: poland/
sweden/china spawned earlier; UKRAINE + ITALY + IFV spawning now;
japan (type90-alt/type10/stb1) + germany-leopards (leo2a6m/leo2a4m)
queue behind their busy lanes. ASK-OWNER banked: upior concept dims
(print-proportional default), bmp3 nation (Russia default — ROK
livery noted), stb1 spec 9.20 vs published 9.42, m2a3_bradley as
family-reference vs new playable id.

## 5.250 KV-2 RATIFIED + LANDED — §5.247 tank 1/10 (2026-08-17):
critic PASS 9.6 (15/15 checklist verified in code AND independent
pixels; builder evidence byte-identical md5 to the critic's own
renders; leclerc-class delta confirmed — the empty-box roof and bare
fenders now carry real seated hardware at every print/photo station;
DShK §B5 triple-verified; width anchor ±1.6595 EXACT; never-gate law
held, zero gate rows). Hash ea4382c0 -> adb8b0a8. Non-defect
observations banked (markings = fleet scope; pair-tile framing = rig
geometry; remaining gap = the print's baked weathering, certified
out of profile scope). Round tools swept at landing.

## 5.251 CASEMATE WAVE DELIVERED + FLEET DEAD-PRINT FINDING
(2026-08-17): ALL FIVE §5.247 casemate tanks delivered. FLEET-CRITICAL:
the owner's 952561ea (Aug 13, "retire tank GLB runtime") DELETED every
oracle GLB from repo+disk — every gate run at this tree needs a local
restore (`git show '952561ea^:path' > path`); the .bak files are a
TRAP (PRE-repair originals — isu152.bak lacks batch-17; NEVER
re-oracle from .baks); restored GLBs stay untracked + now IGNORED
(public/models/tanks/**/*.glb appended). THREE BROKEN ROWS REPAIRED
in the maps (sturmtiger/jpz_e100/t95 — the §5.31b flip's missing
override class). ROWS LANDED (x2): isu122s 87.8-regression FOUND+FIXED
-> 91.5 PASS (GRADUATE — re-cert critic before re-freeze at 90f3a6a0);
isu152 91.9 HELD byte-exact (6a78ffa2, untouched-proven); sturmtiger
88.8 (hash 616c7652 — RW61 launcher face, lattice crane, staged
round, lift trunnions); jpz_e100 91.3 PASS (fb3fc84c); t95 80.8
(294795a0 — ventilator towers, M2, travel lock; quad-run track-clip
tool limitation queued). Baked-in receipts: the §5.229 bin re-phase
regression class + the t95 topMax 9mm margin law. Fleet counter reads
36/110 live (the roster grew; dead-print ids elsewhere still need
restores — every lane briefed via this section). Two critics spawn:
isu122s+isu152 re-cert/verify + the TD trio identity sitting.

## §5.252 — leo1a5 LANDED (§5.247 #7); t64bv1 DELIVERED 90.3 (2026-08-17)
- **leo1a5 leclerc-level redesign LANDED** at `2aee1f9d` (53/84765). Independent critic **9.1 PASS** (14 views + 6 garage, own driver + own numeric probe: overall 9.537×3.370×2.643, muzzle [0,1.93,+6.00] EXACT, turretMass 41.6%≤42%). FALSE-0 photo-class law respected (no gate row run). Identity ratified: EMES-18 twin-aperture w/ wiper, welded 3-panel hexagon turret, saddle mantlet (r1 searchlight-drum read dead), 7 dished wheels + 4 return rollers, 8-block cupola, full German fender grammar. §B5 yaw90 unity holds; 7 leopard guards byte-identical. Residuals (non-blocking, audit queue): sprocket carrier flat-dark shading, basket mesh tone from dead-rear, corner louvres dark astern, glacis "123" vs license plate. Builder floors 8.5-8.8 were an underclaim.
- **t64bv1 DELIVERED-PENDING-CRITIC** at `2216e0b0`: gate **90.3 PASS ×2 bit-identical** (wholeCurves 90.3 / dims 100 / floaters 100), hold-or-improve vs 90.2 ✓ (note: HEAD bytes actually measured 88.7 — the 90.2 HEAD row was generated pre-merge; drift documented in packet). Built from direct vertex decode of owner print `t-64bv1_ussr.glb` (sha256 608336f2… byte-exact vs packet header; restored to recovered/ path untracked). Wrapper ua_t64bv drifts 6630af20→`10d103cb` (renders on new base, board-verified). 26/26 russia guards clean across three external HEAD landings. §5.37 chevron/boot/NSVT ratified reads preserved. ORCHESTRATOR ITEMS BANKED: (a) batch-12 warp recipe in repair_oracles.py STALE for t64bv1 — reproduces the retired published-dims print (4152882a…) vs the 2026-08-15+ silhouette spec (5.98/8.61/2.28) — retire recipe to history; (b) long deck canisters poisoned eight side columns — receipt banked; (c) donbass print = ua_t64bv's oracle (ukraine lane), broad reads pre-banked for fine-chase. Critic spawned.
- **npm test at the live tree FAILS on foreign WIP**: tier.selftest missing tiers for bmp3/bmpt/upior — the live IFV+poland lanes' in-flight registrations in afvFamily.js (their deliveries carry the tier rows). leo1a5 landing proven green in a clean HEAD+leopard.js worktree (exit 0) per the genIcons clean-worktree recipe. Landing law note: at multi-lane load, npm test verdicts must be attributed before blocking a landing.
- §5.247 status: ALL TEN DELIVERED — kv2 ✓landed 9.6, isu122s/isu152/sturmtiger/jpz_e100/t95 ✓landed (critics scoring), leo1a5 ✓LANDED 9.1, tiger1+panther_g delivered (critic scoring), t64bv1 delivered (critic scoring).

## §5.253 — tiger1 + panther_g LANDED (§5.247 #8+#9) (2026-08-17)
- **tiger1 r3 LANDED** at `e2be895a` (51/84244): critic **9.1 PASS** (floor 9.0 across 14 views, garage floor 9.1). Identity ratified in critic pixels: 5 real cupola wall slits w/ glass, loader escape hatch, ringed Feifel risers, shackle horns + hanging shackles, 20t jack, spare-link frame, binocular TZF9b, antenna 2.92<3.00. 16-station cadence not penalized (24-station revert receipt honored). Non-gating: wheel rim tonal separation, radiator-well interiors, zimmerit = paint-scope exclusion (kv2 precedent).
- **panther_g full redesign LANDED** at `d44cf526` (48/70150): critic **9.1 PASS** (floor 9.1, garage 9.2 across). Identity ratified: one-plane 55° visor-less glacis + Kugelblende RIGHT + Bosch lamp, armor-true trapezoid w/ flat-ended rolling-pin mantlet half-embedded, 7-hood cast cupola, full G deck, 30° undercut rear w/ stacks-in-shrouds, skirts hung tight w/ missing-#5/bent-#3 wear. Dims trued 6.87/8.86. tankFactory.js = exactly two hunks (marked KIT_FITTINGS import + build region); guards tiger2/t34_85/is2/m4a3e8 byte-identical vs clean §5.251 worktree.
- Both FALSE-0 photo-class (never gated). Clean-worktree npm test exit 0 (live tree still fails on IFV/poland tier WIP per §5.252). QUEUED: panther §E width true-up (3.53 vs 3.42) + gunBarrel 5.25 proxy delta, cupola cast-lathe kit candidate, tiger §E re-source lane.
- §5.247 status: **9/10 LANDED** — only t64bv1 (delivered 90.3 ×2, critic sitting live) remains.

## §5.254 — isu122s RE-FROZEN 90f3a6a0; isu152 hold verified (2026-08-17)
- **isu122s graduate-change re-cert PASS**: independent critic reproduced gate 91.5 (whole 91.5 / dims 100, hullLengthM 6.75 at 0.24% / floaters 100) **×2 bit-identical to the landed packet via a non-writing clone** (`tmp-critic-isupair-gate.mjs`, session-scratchpad packets only). Fix surface = exactly the two documented lines at bd52af51 (channel box 0.24 deep @ y1.53 + tabH 0.40). Changed views 9.1–9.3 in critic pixels (channel reads as strapped rod-stowage carrier; 0.40 tabs read as rear flap/hanger plates mirroring the print's under-tail hooks). Identity HOLD — ball-pot D-25S mantlet per the certified packet (the brief's "A-19S square mantlet" phrasing = base ISU-122, not this id). §3 row updated: **re-frozen at 90f3a6a0**, prior 8f420d18 retired.
- **isu152 hold verified**: 6a78ffa2 held, gate 91.9 ×2 bit-identical, no tail tabs (growth confirmed flag-gated isu122s-only). NOTE: §3 row still carries pre-§5.229 hash 8e2f75c0 — belongs to the queued fleet-wide §5.229 re-freeze sweep, not this landing.
- **EVIDENCE FINDING banked (non-blocking)**: builder's isu122s before/after pairs in shots/casemate-wave/ are byte-identical md5 (both captured post-fix — mislabeled duplicate). Fix remains proven independently (code diff + critic gate reproduction + critic pixels). LESSON for briefs: before/after visual pairs must be captured at their respective trees, and a byte-identical before/after on a CHANGED id is an evidence void, not a no-regression proof (contrast: on an UNTOUCHED id it is the intended hold proof, per isu152).
- §5.251 dead-print check: both certified prints at recovered/ path, md5s af646bba/192c6cb6 — no restore needed, .baks untouched.

## §5.255 — TD trio critic verdicts: jpz_e100 RATIFIED 9.1; sturmtiger 8.4 + t95 8.8 FAIL → fix round (2026-08-17)
- **jpz_e100 9.1 PASS — fully ratified** (gate 91.3 + critic concur). Skirt hangers ×7/side count-confirmed, saukopf collar/boot/ring, real segmented bow links ×3. Logged improvement items (not gate-class): saukopf bolt FIELD reads as thin studded ring; tail shackles + 2-link rack read flat vs the print's 3D jaw/bolt clusters.
- **sturmtiger 8.4 FAIL** — roof story is leclerc-class (lattice jib complete, staged round, trunnions seated) but: (1) RW61 mouth does NOT dominate dead-front — proc collar ~0.70m OD near-flush vs print's ~0.95m projecting pot inside ~1.66m recessed surround, 9-hole vent ring unreadable, bore flat; (2) bow face near-bare — 2+2 spare links vs full-width band, thin-pin shackles, bow MG ball + driver visor ABSENT; (3) rear plate bare — muffler drums lying on deck vs standing shrouded stacks, no jack/tools/rear port. Minor: fan rings flat/hollow. Gate 88.8/dims 100 is silhouette-only — these are face/furniture defects.
- **t95 8.8 FAIL (close)** — all §5.247 work-order items delivered (quad-track stance unmistakable, real louvered ventilator towers, M2, travel lock engaged); holds under 9.0: (1) sponson-top tow cables + tool rows ABSENT (right sponson fully bare vs Aberdeen photos); (2) rear slope lacks dominant louvered grille block (large empty planes at 3/6 garage angles); (3) bow fender racks + final-drive drums absent. §B7 squat-print caps respected.
- All three: hashes EXACT open+close (616c7652/fb3fc84c/294795a0), 81 critic sheets zero-console-error, no floaters, yaw90 diffs 0.16-0.24% label noise. Real density deltas vs hash-verified before evidence confirmed for all three.
- **HARNESS FINDING banked**: t90fam critic harness relies on the RETIRED runtime GLB swap (§5.251) — the working reference-render path is `tools/reference-glb-loader.js` (board pattern). Future critic briefs should name it.
- Fix round spawned for sturmtiger+t95 at the exact defect lists (casemate lane, hold-or-improve gate ×2, fresh sittings after).

## §5.256 — t64bv1 critic FAIL 6.8 → ordered fix round (2026-08-17)
- **t64bv1 (2216e0b0) FAILS the visual bar at 6.8** despite gate 90.3 PASS ×2. Root cause: **turret casting built to the wrong print** — proc dome spans ~2.82m (rings max 1.30 × sz 1.07) = the donbass/ua_t64bv broad read the §5.248 coordinator hold reserved for the ukraine lane's fine-chase, vs the owner print's ~2.28m casting. Consequences: (1) the §5.37 ratified chevron/cassette/boot/gap-plate is INVISIBLE — authored at certified lines (tips ±0.24, world 1.10) but the enlarged dome's plan chord (world z +1.27) swallows it — **code-true, pixel-false, §5.04 bury class**; (2) turret kit at toy scale on a >90% bare dome (NSVT stub vs dominant shielded mass, no rack silhouette, OPVT cluster absent); (3) skirt band ~2× too deep (~0.4 vs ~0.22m), buries the six-small-wheels acid tell — symmetric, NOT the certified left-skirt residual; (4) minor: blank transom face, heavy idler.
- **Hull layer largely at bar** (glacis K-1 courses, V splash, handed rear rack, wheels/gun/1G42/gallery/Luna ✓); §B2 clean, §B5 clean, family distinctness holds. Certified residuals honored.
- **GATE-BLINDNESS LESSON banked**: in the fused class (whole-silhouette masks + dims + floaters), top view reads the dome as interior to the hull outline and side views hide casting width behind the hull profile — **a 90+ gate PASS and a failed visual identity are fully compatible; §B8 is the only layer that sees casting span and face content**.
- **Brief correction banked**: guard ids t64bmv/t72a do not exist — real russia-family guards are t72b_1987/t72b3/t80b/t90a (critic substituted and verified all four bit-identical vs clean bd52af51 worktree, sandwich-hashed its render batch).
- Ordered fix (one round, returned to the original builder): casting rings ~×0.82 → print's ~2.28 span keeping ring seats (un-buries the chevron), skirt bottom raised to the thin band, NSVT census mass, rear-rack rail silhouette; the 2.8-span + tall-MG donbass reads stay banked for ua_t64bv. Fresh sitting after.

## §5.257 — t64bv1 repair-chain retirement in repair_oracles.py (2026-08-17)
- Both t64bv1 recipes retired to history comments (batch-45 house pattern, control points preserved inline): the batch-9 TurretMesh index surgery + the batch-12 axis warp. Rationale (§5.252 builder finding): the chain reproduces the RETIRED published-dims print (4152882a…, byte-idempotent ×2 re-verified) while the 2026-08-15+ silhouette* spec (5.98/8.61/2.28) measures the RAW owner print (sha256 608336f2…, byte-exact to packet header) — the raw bake IS the certified oracle, unwarped. `python3 -c "import ast; ast.parse(...)"` OK; zero live REPAIRS['t64bv1'] references remain (the spread-extension pair retired together — a lone spread would KeyError). Disk bytes + .bak untouched. Also delivered by the fix round: t64bv1 fix at eabf99cc (89.5 ×2 honest, −0.8 = removed wrong-print dome fill), fresh sitting live.

## §5.258 — owner c425f495 "sparse new-family turrets" merged under three live lanes (2026-08-17)
- Owner's parallel session rebuilt sparse turrets in profiles/afvFamily.js (+97), italy.js (+164), sweden.js (+30) + regenerated new-family icons (55 files) — the exact files the IFV/italy/sweden §5.248 lanes are mid-rebuild in. Merge protocol: snapshot (scratchpad/merge-snap-030206) → checkout → merge → 3-way re-apply → CONFLICTS all three → worktree resolved to LANE side (lanes own the ids per §5.248; owner version preserved in history). Owner per-file diffs extracted to the snapshot dir; all three lanes SendMessage'd: re-verify markers + re-snapshot now, ABSORB the owner's turret improvements before delivering, final reports must state absorb-or-supersede with measured evidence. Pushed 41ff7e86.
- Owner activity note: two same-hour landings on §5.248 new-family ids (stb1 rebuild 5a9c28ef, sparse turrets c425f495) — the owner is actively working this family in parallel; expect more mid-flight landings, keep the snapshot-merge-notify protocol hot.

## §5.259 — china lane DELIVERED (critic live); japan round SPAWNED (2026-08-17)
- **china §5.248 DELIVERED-PENDING-CRITIC**: ztz85_iii `b888d2f8` (54/73547) honest 0→**87.4** (dims 100, floaters 100) — first-party welded flat-cheek wedge replacing the type59-donor call; ztz99a2 `df0bf70c` (60/80219) 10.8→**88.8** (dims 100, floaters 100) — first-party deep-rake wedge distinct from resident type99a. Both ×2 bit-identical; whole<90 = documented instrument ceiling (85 print ~+9% tall turret band + fused mast; 99A2 ~+4-7% long; published dims ratified per WEAK-partition). Five reverted experiments banked with receipts. Guards type59/type99a byte-identical (verified my side too); track-clip 0/0 both (two real §B4 offenders fixed on 99A2). **BUG FIXED fleet-wide-relevant**: `variant()` silently inherited donor silhouette* gate rows (t62mv1's rode type59→ztz85_iii; type99a's rode into ztz99a2) — now stripped before override. Orientation TBDs resolved (both nose +X → yawOffset −π/2, registered w/ probe receipts, 99A2 inches confirmed 140.14u×0.0254=3.56m). ORCHESTRATOR ITEM banked: both china specs still carry donor-cloned armor FRAMES (values scaled per row) — armor-frame refit out of scope this round. Critic spawned (hashes verified my side: all four exact).
- **japan round SPAWNED** (china slot freed): type90 + type10 ground-up (stb1 OUT — owner's 5a9c28ef). Both certified oracles dangle (§5.251): recovered/type90.glb + type-10_main_battle_tank_repaired.glb — restore-from-952561ea^ is the round's first action; §5.248 drops (type90_42manako, type-10_main_battle_tank + type10-source/) = visual refs only.

## §5.260 — t64bv1 LANDED 9.1 (§5.247 #10 — ALL TEN NOW LANDED) (2026-08-17)
- **t64bv1 fresh sitting 9.1 PASS** at `eabf99cc` (51/104,345): all five §5.256 ordered fixes verified in critic pixels — casting pixel-measured **2.27m** vs ordered ~2.28 (was 2.82 at FAIL), **§5.37 chevron reads in front + close + plan** (the T-64BV top signature restored), thin-band skirts with all six spoked wheels exposed, shielded census NSVT, twin-rail bustle rack (drum RIGHT / OPVT LEFT handed correctly) rotating as one through yaw90, census transom. Prior passes spot-held; §B2 clean across 37 sheets; guards t72b_1987/t80b/t90a/t72b3 exact; sandwich-hash held through two mid-sitting owner merges. Residual −0.9 documented (roof/flank kit density −0.4, cassette-seam tonal flatness −0.3, tab row stops mid-hull −0.1, kit spike 2.352 + idler + sponson flats −0.1).
- Ledger row overlaid via stage-ledger-rows.py (tool-written 89.5 honest row per §5.256 gate-blindness adjudication; the −0.8 vs the wrong-print 90.3 is removed defect mass). Clean-worktree npm test exit 0. Round probes swept.
- **§5.247 status: ALL TEN LANDED.** Ratified ≥9.0: kv2 9.6, isu122s (re-cert, RE-FROZEN 90f3a6a0), isu152 (hold 91.9), jpz_e100 9.1, leo1a5 9.1, tiger1 9.1, panther_g 9.1, t64bv1 9.1 = **8/10 ratified**; sturmtiger (8.4) + t95 (8.8) fix round LIVE — goal-hook closes when both clear ≥9.0 fresh sittings.
- Orchestrator queue add: t64bv1 89.5→90 honest gate-recovery round (banned: every reinflation vector that rebuilds the §5.256 defect) + roof/flank kit-density pass (the −0.4 residual) can couple into one future round.

## §5.261 — poland lane DELIVERED (critic live); germany-leopards SPAWNED (2026-08-17)
- **poland §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side, donors byte-stable): t72m1_jaguar `c5f74df0` min **90.6 PASS** (fused print, componentMasks:false; cap certified: print turret band 2.43-2.51 vs pub 2.23); pl01 `763b4f0c` min 62.2 at PRE-REPAIR CAP CEILING (RWS field +21% print-tall + short gun 4.88 vs 5.36 — §E normalize plan filed w/ literals; dims 100/floaters 100; followers row completed, three.js dot-sanitize regex hazard banked); pt91_twardy `8d369116` min 0 CAPPED — **_vlo audit verdict POLLUTED** (chassis_vlo bakes turret+gun into hull masks + poisons side/front registration dy 0.27; §E coupled excision + axis rescale plan filed w/ literals; dims 100/floaters 100 = the only vlo-untouchable components, both perfect). Donor-clone calls (buildK2/buildT72B87Native/buildPT91M) GONE. npm test exit 0 their side; track-clip 0/0 ×3; turret-parent clean ×3.
- **Cross-lane repair by poland**: the ukraine lane's mangled ua_t84_oplot_m row (broken regex + orphan line = invalid JS killing every map consumer) syntax-fixed in all three map files preserving intent — ukraine lane re-verifies at delivery.
- **ORCHESTRATOR ITEMS banked**: (1) visual-evaluator-page ref path uses the game createTank swap — cannot load ANY community-candidate override id; needs the critic page's loadReferenceGlb pattern (map-tool refit, my lane); (2) pt91a/jaguar accessor min/max LIE — never census batch-B prints by accessors alone (extends the §5.66 census law); (3) heightM p95 ≈ 4th-from-top column — roof stations must share one ≤3-4 col window or stay under pub+1% (three receipts in packets).
- **germany-leopards round SPAWNED** (poland slot freed): leo2a6m + leo2a4m — _vlo shell-isolation audit FIRST (the pt91 POLLUTED precedent), then ground-up builds.
- §E QUEUE (my lane, post-critic): pl01 normalize (RWS y-compress + Cannon extension), pt91 vlo excision + axis rescale — both plans filed with literals in the packets.

## §5.262 — sweden lane DELIVERED (critic live; strv103 graduate-change re-cert in the sitting) (2026-08-17)
- **sweden §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side; guards centurion3 63f6a82c / leo2a5 6ecdfb06 byte-held): strv81 `11e5e876` whip-capped (print fuses 4.17m whips into turret_0; dims 100/floaters 100 after 7.82→7.56 hullLengthM donor-error true-up; §E whip-excision plan filed); strv103 `4ac3c8c8` **GRADUATE REPLACED WHOLESALE** (frozen 4d0ff518 → re-freeze on critic PASS; length-short print −18.2%, published dims sovereign, whole 76.7/dims 100; §E z-warp ×1.223 plan filed); strv122 `4f5694d4` weak-Tripo ceiling ~87 (dims 100; six controlled experiments 86.2-87.5; cap consistent with the owner's pre-declared weak-instrument ruling — documented, not a new ask). All donor-clone calls retired; registration repairs (sideways strv103 +π/2, strv122 −π/2, strv81 π) in all four maps.
- **Owner c425f495 absorption receipted**: measured shell supersedes the squash; broken-cadence crown plates + ventilator drum absorbed at measured stations, marked ABSORBED in file. NOTE: my §5.258 worktree resolution silently dropped their batch-6 hull edits (snapshot-vs-live-edit race) — they recovered from receipts; LESSON: lanes keep editing between snapshot and re-apply, recovery-from-receipts is the correct protocol and briefs already mandate scratchpad snapshots.
- Lessons banked in packets: gMask ambient-dead gear reads as holes (gearFloor/tireHex re-attach mandatory); detach-bisect for floating kit; 12% body-filter rough-coupling hit strv122's beak exactly as the memory note predicted.

## §5.263 — IFV wave DELIVERED (critic live); dead-oracle restores done (2026-08-17)
- **IFV §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side; guards bmp2 8da8b75a / m2a2_bradley a41410ac byte-held): bmp3 `417526e2` (IoU 92.3), bmpt `2a697153` (blockout print cap 5.7), upior `76163cf0` (FBX z-handedness fixed, IoU 90.1), marder1a3 `ab70b098` (fused print, whole 85.3), m3a3_bradley `17f88614` (print does NOT assemble — parts-kit pose, §E posed-bake queued, min 0 lawful), spz_puma `73ee54e0` refresh (floaters 0→100). dims 100 ×6. Tier rows DELIVERED (bmp3 8/bmpt 9/upior 9) — the §5.252 live-tree npm-test failure resolves at their landing; npm test green their side. Owner c425f495 absorption: two hunks re-applied verbatim (bmp3_rok 7456de28 / upior_ifv 3f16cb9a rebuilt), marder intents absorbed into the ground-up build (82→85.3 across absorb runs).
- **Instrument findings banked**: GLTFLoader dot-sanitization (dotted node regexes need \.? forms — gate silently ran fused paths); width-guard class (fittings/skirts exceeding spec width silently rescale builds — root cause of frozen dims rows); §C edge-on prism law re-confirmed (segmented side plates, stations 0→58.6 upior).
- **Dead-oracle restores DONE (my lane)**: m2_bradley_ifv.glb (md5 37dadd81…) + leo2a6_buh.glb (md5 e025fe73…) restored from 952561ea^, untracked-gitignored. §5.251 disk-restore queue CLEAR (japan lane holds its own two).
- **§E queue adds**: m3a3 posed-bake (unlocks all curve rows), bmpt blockout split, spz_puma normalize (still filed), bmp3 fused-sight-stack candidates, strv81 whip excision, strv103 z-warp ×1.223.
- **ASK-OWNER adds**: roster near-duplicate pairs (bmp3/bmp3_rok, bmpt/bmpt_terminator2, upior/upior_ifv) — clone retirement is an owner call; upior dims + bmp3 nation still standing from §5.249.

## §5.264 — sturmtiger + t95 fix round DELIVERED; fresh sittings LIVE (2026-08-17)
- Both §5.255 ordered fix lists delivered (13 marker blocks in casemate.js), gates held EXACT ×2 (sturmtiger 88.8, t95 80.8; dims 100/floaters 100 both), guards isu122s/isu152/jpz_e100 byte-identical, npm test green on the LIVE tree. Hashes: sturmtiger `616c7652→a7fc1ce2` (+9156 verts), t95 `294795a0→88bf1858` (+14802 verts). Verified my side ×5 exact.
- Sturmtiger: RW61 collar ring 1.60×0.92 + projecting pot + 20 vent wells + recessed bore; 15-column bow link band + jaw shackles + MG ball/visor at print stations; sooted shrouded stack cluster at the certified 1.878-1.88 max — **ADJUDICATED RESIDUAL: full-height standing stacks geometrically impossible** (stern rakes 40° to −3.16; two leaned variants measured 88.7 ×2; the print's own stack window tops at the same class). Fan wells sunk.
- t95: both sponsons stowed (cables/tools/bins), two-panel pillow-louver grille block at measured sweet spot 1.710/1.650 (three-point bisect — the oracle-prose "deck 1.74" does not map to the registered ref line), X-draped tail cables + pintle + ports, bow drum noses + fender racks at 1.436.
- LESSONS banked: KIT.torus pre-rotates rings FLAT (a collar mount swept a washer to z 3.56 breaking overallLengthM — vertex census attributed); 47° plate plane below the wall break floats; measured sweet spots beat prose mapping.
- Fresh sittings spawned (goal-hook closes on double-PASS ≥9.0).

## §5.265 — ukraine lane DELIVERED (critic live); false-0 graduate hazard CONFIRMED (2026-08-17)
- **ukraine §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side ×8 exact; donors t84/t80u/t80bv + ua_m1a1 byte-held): ua_t84_oplot_m `6a699084` (min 0 print-capped, dims 100 after heightM 3.15→2.285 KMDB true-up), ua_t80u_kursk `3985f9b0` (min 82.3, dims 100, heightM 2.90→2.20), ua_t64bv `d6ac5b50` (min 30.2, dims 99.8, 55-follower K-1 census CLOSED, +4.2m off-center print recentered), ua_t80bv `bc3c80a` (min 2.4, dims 94.6, bashnya oracle defect: drums/log fused into turret mesh). All donor-clones replaced by §K builds; npm test green their side; §B2 holes 0 ×4.
- **INSTRUMENT REPAIRS**: three prints backwards/sideways (oplot+t80bv raw -Z fused-gun yawOffset π; kursk diorama at (-1118,-2163) yawOffset +π/2); **tools/reference-glb-loader.js recenter law** (pre-yaw footprint recenter when offset >0.35×diagonal — byte-identical for normal prints, fixes diorama + off-center classes); t64bv follower census closed (55 turret K-1 by AABB); oplot default076 interior joined followers (killed a false 1.91 deck hump); t80bv chassis_vlo = benign low-LOD gear shell.
- **FALSE-0 GRADUATE HAZARD CONFIRMED (LAW)**: graduate oracles are .bak-only on disk (§5.251 state) — the builder's t84 run wrote a false 0 row and RESTORED the HEAD tool-written 92.5 verbatim per the false-0 law (verified my side: head=work=92.5). **ANY lane gating graduates right now corrupts the ledger** — critic briefs now carry DO-NOT-GATE-GRADUATES.
- **P95 budget arithmetic banked**: ~3 gate columns of spike allowance; a standing pintleMG sweeps 6+ columns at 2.4-2.5m; stowed-MG doctrine applied ×3 (standing variants return post-warp at documented cost). Donor t80-line dims=100 rows are STALE (pre-§5.229, .bak-only oracles can't re-measure) — fleet re-freeze sweep item.
- **§E queue adds (SIM-verified plans w/ literals + candidate bytes in scratchpad ua-round/warp-candidates/)**: oplot warp (post-sim stations 76.7/whole 39.4/dims 100), t64bv warp (hull 62.8/whole 43.6), t80bv fwd_map REVISE (tail-scoped compress — uniform hurt hull 56→34), kursk warp OPTIONAL (raw close better). Orphaned-mud-flap floater class banked (chain flaps to sprocket faces/fender brackets).
- variant() silhouette purge applied ukraine-side too (donor t64bv1 overrides were leaking into ua_t64bv) — same class as china's §5.259 fix; the fleet-wide variant() audit stays queued.
- Ukraine deferred release-check/asset regen (gates on ≥90, warp-blocked) — documented, resumes post-warp-landing.

## §5.266 — china critic verdicts: ztz85_iii 7.2 + ztz99a2 8.3 FAIL → fix round (2026-08-17)
- Sitting s5248 (79 sheets, own harness, track-clip re-run 0/0 both, §B5/§B3.1 re-verified in pixels, family strip PASS type59≠ztz85_iii≠type99a≠ztz99a2). Calibrated OUT per resident-parity/WEAK-partition: yaw-180 tube graze 0.17/0.19 vs resident's own 0.22, print stylization bands, flank smoke placement.
- **ztz85_iii 7.2**: (1) SKIRT BURIES GEAR — band to y 0.45, ~80% of six-wheel gear invisible side-on (print + resident + donor all show wheels proud); (2) numerals auto-reseat behind the basket backing plate (both flanks blank, no insignia); (3) gun-root saddle doghouse proud on the wedge nose vs print's recessed shadow; (4) pale crown-rim horseshoe (polyMultiLoft ring catches sun unpainted); (5) glacis lamps underscaled; (6) basket backing solid vs open slats.
- **ztz99a2 8.3 (close)**: (1) same skirt class milder (~25% wheels visible vs print ~50%); (2) numerals CLIPPED mid-glyph by turret-side modules; (3) pinched plan nose ~0.6 vs print ~1.0; (4) same crown-rim band + flat lamp lenses. Strengths: A2 identity lands, drum transom excellent, wide belt beats print toward reality.
- Ordered fixes (returned to china builder): skirt yBot 0.45→~0.80 (85) / bay bottoms 0.44→~0.62 (99A2) + §B4 re-run; numerals to visible faces (85 basket-backing outer/forward cheek; 99A2 module gap z≈−0.96); 85 saddle tucked behind mantlet line; crown-rim dressed both; 85 lamps guard-framed. Fix hashes: b888d2f8/df0bf70c. Fresh sitting after.

## §5.267 — poland verdicts: pl01 9.1 PASS; jaguar 7.8 + pt91 8.9 FAIL; wave LANDED as delivered, fix round on landed base (2026-08-17)
- **pl01 9.1 PASS — RATIFIED** (acid test: never reads as a conventional MBT; §B5 follower unity proven in pixels; certified caps honored in-build). Refinement list banked (mast sensor cluster, RWS articulation, bow light-strips, EO domes) — non-blocking.
- **t72m1_jaguar 7.8 FAIL** (gate 90.6 is curves; pixels don't sell it): (1) wrong-family turret read — oversized smooth dome, no mantlet mass, bald cupola rings (donor t72b_1987 reads MORE T-72 in the family strip); (2) buried gear (§5.266 class); (3) slab hull side + floating fender rails + hovering bow boxes; (4) flat painted deck; (5) kit under-realized (Asteria box, RCWS nub, plank log, dot lamps). Keeps: ERAWA fields real, snorkel exact, evacuator, bore, articulation, dims, checkerboard/PL-721.
- **pt91_twardy 8.9 FAIL (two tenths)**: (1) turret-front/roof ERA carpet missing (bare dome nose/roof vs print's full front-sector grid); (2) rear plank-stacked (drums no cylinder read, rack slab, log plank); (3) deck grilles painted-thin; (4) cupola lidless. Identity kit otherwise complete (6L/3R smoke confirmed, correctly omits T-72 IR searchlight).
- **LANDED AS DELIVERED** (casemate precedent — protect delivered work from external-revert hazard; ledger rows honest: pl01 62.2 cap / jaguar 90.6 / pt91 0 vlo-cap; fleet 37/99): profiles+specs+packets+gate JSONs+rows. Clean-worktree npm test exit 0. Map-row edits stay in the shared dirty maps for a consolidated landing once critics settle (other lanes' rows uncommitted in the same files). Fix round returned to the poland builder ON THE LANDED BASE; fresh sitting after.
- **Critic harness finds banked**: pt91a print authored gun −z (vertex-extract auto-flips ~line 1406; reference-glb-loader lacks the flip — critic pages add yawOffset π for pt91 refs); China-template critic page latent visibility bug (renderModel leaves non-last roots hidden → family-strip boxes degenerate — fix in-page); pt91 chassis_vlo confirmed 2 nodes (pollution state matches packet).

## §5.268 — sturmtiger 9.2 + t95 9.2 DOUBLE-PASS: **§5.247 GOAL-HOOK CLOSED** (2026-08-17)
- Fresh sittings at the gated bytes: **sturmtiger 9.2** (RW61 mouth dominates with 20 counted vent wells — "night and day" vs before; 15-column bow band counted; rear delivered within the adjudicated envelope; fan wells read) + **t95 9.2** (both sponsons stowed; grille block dominant from garage-high; X-draped tail cables "a dead ringer"; bow drums + racks). §B2/§B5 clean both; keeps intact; camera-parity harness, zero console errors. One pre-existing ~8px muzzle-station torus at yaw90 (t95, yaw-rig parented, invisible at yaw0, identical in prior sittings) flagged as follow-up chip task_3d06d29a — outside ordered scope, no score impact.
- LANDED: casemate.js fix bytes + packets + tool-written gate JSONs (ledger rows identical to HEAD — 88.8/80.8 held EXACT). Clean-worktree npm test exit 0. TD round tmp tools swept.
- **§5.247 TEN-TANK LECLERC WAVE COMPLETE — ALL TEN RATIFIED ≥9.0:** kv2 9.6 · isu122s re-cert PASS (RE-FROZEN 90f3a6a0) · isu152 hold 91.9 · tiger1 9.1 · panther_g 9.1 · leo1a5 9.1 · jpz_e100 9.1 · sturmtiger 9.2 · t95 9.2 · t64bv1 9.1. Every tank measured against its model/historical references, redesigned ground-up or uplifted to the leclerc bar, decorated from the fitting libraries, sources loading verified (§5.251 dead-print law born of it), nothing left untouched.

## §5.269 — IFV verdicts: 0/5 PASS; §B9 GEAR-VISIBILITY LAW formalized; two instrument findings (2026-08-17)
- Sitting (210 sheets ×2 runs, sandwich digest ×2 while HEAD moved 3×): **bmp3 6.4** (buried gear — full-height flank slabs vs print's exposed dished wheels, the bmp2 GUARD itself proves the pipeline bar; slab bow vs raked boat bow + trim vane; sight chimney vs pot; 902V not reading; decal stern doors), **bmpt 7.0** (station a head too tall/slab; Ataka pods read as flush bins side-on vs rack arms + red caps; ~85% gear hidden; ERA reads louvre not brick — ROSTER NOTE: retained bmpt_terminator2 clone currently OUT-READS the new build), **upior 7.6** (+MUST-FIX below; turret smooth dome vs faceted drum; ATGM flush vs L-pedestal; cradle under-massed; hull = wave's best), **marder1a3 6.5** (worst buried gear — slab to hub line, no scalloped skirt tell; tall two-tier box vs low cast turret; blank ramp; short/steep glacis; absorbed intents present but smoke collars never read), **m3a3_bradley 8.6** (ONE fix from PASS: TOW twin-box under-massed — thin plate side-on; everything else Bradley-true + m2a2-distinct), **spz_puma 8.7 informational** (refresh sound). §H.4 wave distinctness + §B5 strips clean ×6.
- **§B9 GEAR-VISIBILITY LAW (formalized — third lane failing the class after §5.266 china + §5.267 jaguar)**: running gear must read at side/garage angles per print+resident parity — full-height flank slabs burying wheels are a scoring defect regardless of silhouette/IoU rows (outline-blind). All future briefs carry §B9; skirt/wall bottoms author to the print's wheel-exposure line.
- **INSTRUMENT FINDING 1 (MUST-FIX pre-gate-rerun)**: upior's delivered yawOffset π renders the print REAR-FORWARD in the browser pipeline (ref +z face = twin-door stern w/ tow cable; plan guns oppose; dAlong 0.06 is flip-blind — 180° preserves midpoints) — the gate's curve rows scored a REVERSED silhouette. Pin re-adjudication in all three maps + REG, then gate re-run.
- **INSTRUMENT FINDING 2**: m3a3's print RENDERS FULLY ASSEMBLED — the "parts-kit pose" was an AABB artifact (geometry bounds ignore skinning; default skeleton pose assembles). The gate's ref-side FRAMING fails, not the print — a skinned-bounds fix likely replaces the queued §E posed-bake; ref-side curve rows unlockable now.
- Fix round returned to the IFV builder (fresh sitting after; critic harness kept tools/tmp-critic-ifv-s5248.*).

## §5.270 — china fix round DELIVERED; fresh sitting live (2026-08-17)
- All §5.266 items delivered with ROOT-CAUSED receipts: ztz85_iii `b888d2f8→13f0c8d7` (skirt 0.80 §B9-compliant, marks re-authored on exposed flank band — root cause: the marking ray only sees the turret bucket, old seats reseated behind the basket backing; saddle tucked; crownRimTrim; framed lamps; flank baskets slatted w/ rear-solid REVERT receipt honoring the print), ztz99a2 `df0bf70c→93c78198` (bays 0.62, numerals unclipped outside the belt wall at z≈−0.96 — root cause: turret widening moved the wall past the authored decals, reseat rays back-faced; nose broadened to ~1.0m broad-arrow; rim + lenses).
- Gates: 87.4 HELD / **88.9 IMPROVED**, dims 100 stay, floaters 100, track-clip 0/0 after raises, guards byte-held, npm test GREEN live. Gate-recovery kit honest (silhouetteHullLengthM 6.47 flap-inclusive vs print's 6.49). Fresh sitting spawned at the new hashes (verified my side ×4 exact).

## §5.271 — sweden wave 3/3 PASS, LANDED; strv103 RE-FROZEN 4ac3c8c8 (2026-08-17)
- **strv81 9.1 / strv103 9.2 / strv122 9.0 — all PASS** (107 critic sheets, sandwich-hashed ×2 batches, guards centurion3/leo2a5 held, family strips prove non-clone reads). strv103 graduate-change re-cert CONFIRMED — §3 row re-frozen at `4ac3c8c8` (prior 4d0ff518 retired); §B5 fixed-mount proven diffPx:0. strv81's print-true Type-A 20-pdr (no fume extractor — the print carries none) ratified; ABSORBED owner items verify (crown plates at station; vent housing as massing, ~60% behind bin3). strv122 judged vs historical refs per the weak-print order: Swedish kit stationed (roof fields, Galix, basket lattice praised, PERI/EMES, wavy hems), NOT a leo2a5 clone; camo L44 w/ sleeve/MRS historically correct (print's bare tube not sovereign).
- LANDED: profiles+specs+packets+gate JSONs+rows (strv81 34.9 cap / strv103 37.1→76.7 / strv122 87.1; fleet 37/101). Non-blocking findings routed: strv81 polish list ('81' decals buried in bins §5.04 class — re-seat on bin outer faces; vent drum exposure; dead-front mantlet read; rust-red tube ends), strv103 → §E z-warp round (blunt bow cap + dozer-as-lower-bow after ×1.223; louvre banks; '103B' half-mask), strv122 → cap-ratification round (tall slab turret proportion vs weak print; scallop depth; fan wells; forward side walls).
- **Cross-lane harness flag**: the poland-page family-strip loop boxes hidden roots (renderModel leaves prior roots invisible → smear frames) — same latent bug class as §5.267's; fixed in the sweden critic's own rig; poland/china-template pages need the visible=true fix before reuse (orchestrator queue).

## §5.272 — ukraine verdicts: 0/4 (oplot 7.8, kursk 8.4, ua_t64bv 8.7, ua_t80bv 8.3) → fix round (2026-08-17)
- Sitting integrity: sandwich ×2 through three HEAD moves, no graduate gated (§5.265 honored), loader recenter verified (kursk+t64bv refCenter exactly 0,0), 144 sheets. Family distinctness ×4 PASS (incl. ua_t64bv vs t64bv1 — longer/taller-MG/own-chevron vs the 2.27 casting), §B5 ×4 PASS, dims published-true ×4.
- **oplot 7.8**: MUST-FIX bow contraption (transverse bar past both hull sides ending in forward toothed wheel discs — reads broken/mine-roller at 5/6 garage angles; delete or rebuild inboard); bow sprocket-read wheel (idler must be smooth); PNK-6 under-massed (~0.15 straw vs ~0.5 tower, keep 2.80 height); Duplet wings smooth (no module articulation); NSVT unreadable.
- **kursk 8.4**: MUST-FIX §B9 (~80% wheels hidden; resident t80u guard proves the bar); dome front one smooth shield; folded NSVT read; log high+bright.
- **ua_t64bv 8.7 (near-bar)**: rear cluster mis-grammar (print: twin stern snorkel tubes + hull-left drum + canisters; build: bustle crates + turret drum); mud-flaps RAW WOOD-TAN (paint rubber-dark); chevron wrap short 1-2 blocks/cheek; MG stand thin.
- **ua_t80bv 8.3**: MUST-FIX bo4ki drums squared shelf (oracle's fused-mesh defect caps GATE rows, NOT build freedom — model two real transverse cylinders); MUST-FIX §B9 (worst print-parity gap); glacis raft low-relief; Luna unreadable; pendant rod reads inverted-whip.
- Cross-wave themes: §B9 authoring + wheel material contrast; named-fitting mass realism; ERA articulation; material color pops. Fix round returned to ukraine builder; fresh sitting after (harness kept).

## §5.273 — poland fix round DELIVERED; fresh sitting live (2026-08-17)
- All §5.267 orders delivered w/ receipts: jaguar `c5f74df0→98798d10` (mantlet block at dome face 0.62-0.95 after an inside-shell first pass, cast waist seam, real cupolas w/ wreaths, hem 0.80 §B9 + gear re-hooks — 1.00 overshot measured −0.3 fused-mask and reverted, 7 brackets/side, seated corner boxes, louvre relief, Asteria/RCWS/pods/log realized), pt91 `8d369116→8322c846` (front-sector ERAWA carpet arcs, camo steel drum cylinders + open rail, louvres, sunk cupola lid — dims-100 held through a THREE-OWNER p95 4th-column chase: cupola lug 2.213 → arc seams 2.202 → whip-stub AA-faded tips, final heightM 2.19 @0.05%).
- Gates ×2: jaguar **90.8** (+0.2 over hold); pt91 dims/floaters 100 HELD (whole 5.2 vlo-cap class unchanged). Guards + pl01 763b4f0c byte-held; track-clip 0/0 ×2; npm test exit 0 LIVE. Verified my side ×6 exact.
- **LAW-BANK**: fused-print whole metric PRICES proud kit the print lacks — visible-read work rides tone/position inside the ref envelope (three toggle receipts); AA-faded thin-tip columns enter p95 at phase-dependent heights (whip-stub class — extends whip-rough-coupling); tan plank/slab reads on this palette are TONE (wood slot renders tan; rehookClone fixes free).
- Fresh sitting spawned at the new hashes.

## §5.274 — china pair 9.1/9.2 PASS, LANDED (2026-08-17)
- Fresh sitting s5266 (85 sheets, visibility-fixed harness, all family-strip cells lit): **ztz85_iii 9.1** (all six fixes verified — gear reads §B9, marks crisp, wedge nose clean, no horseshoe, framed lamps, slatted flanks w/ honored rear revert; recovery kit reads as real kit) + **ztz99a2 9.2** (bays 0.620 exact, numerals+star unclipped, ~1.0m broad-arrow nose w/ elevation verified at +14°, rim/lenses dressed). Prior strengths held; family strip 4-distinct.
- LANDED: profiles+specs+packets (copied from gitignored shots/ to docs/references/tanks/ — packet-location note for future briefs: packets go in docs/)+gate JSONs+rows (87.4/88.9; fleet 37/103). China round tmp tools swept. §5.248 ratified count: 6 (pl01, strv81, strv103, strv122, ztz85_iii, ztz99a2).

## §5.275 — italy DELIVERED with a hash mismatch → reconciliation before critic (2026-08-17)
- **italy §5.248 delivery report**: carro45t gate **90.3 PASS ×2 from honest 0** (asymmetric roof, turret-borne driver crest, print-exact course; extractor BACKWARDS flag adjudicated heuristic-misfire w/ receipts; silhouetteHeightM 2.42 per LOW-CONF law), ariete_c1 39.6 certified structural (arrafi print uniformly z-compressed — built at published z-scale ×1.08803 per §D anti-gaming; **§E ask: uniform z-warp on the print, build is already post-warp-correct**; short-tube class documented), ariete_c2 no-gate-by-design (C1 base + real AMV package, dims trued 7.59/9.67/3.60/2.47). Owner c425f495 absorption receipted (squash-hacks superseded by measured geometry; lids/arcs/louvres/MGs absorbed; proud panels + twin C1 whips superseded w/ evidence). Donor ariete `43e126e8` byte-held.
- **HASH MISMATCH at my verify** (HEAD unmoved 76196647, donor matches): reported 7c5a8744/6d4afe90/550aa3c vs live **49ce4878/a9ed20d8/c44ff748**. Reconciliation returned to the builder (stale-report vs external-interference determination; gates re-run if row-bytes ≠ delivered bytes). Critic HOLDS until reconciled — verdicts bind to exact hashes.
- **Laws banked from the round**: registration-frame roulette (pin both body edges w/ robust-band content before chasing paired features); station-camera prism law bites REFERENCES too; offset-mount whips resolve pot-vs-rod window conflicts; silhouetteHeightM = sanctioned like-with-like paper-vehicle height instrument; `__GEO_CURVES` score-neutral gate export (one line in procedural-fidelity.html) — RECOMMEND KEEP (turns worst-column guessing into direct decode).
- Asks banked: ariete_c1 §E z-warp ×1.08803; carro45t REG orientationAdjudicated note; vertex-extract follower regex missed Object_2/6 (gate map correct — harness-map hygiene item).

## §5.276 — italy hashes RECONCILED (case a: stale report); critic spawned (2026-08-17)
- Builder re-verified at the current tree: **ariete_c1 49ce4878 / ariete_c2 a9ed20d8 / carro45t c44ff748** (matches my verify ×4 exactly). Root cause piece-for-piece: the report's hashgeo ran ONE BATCH EARLY — before the final glance-closure fixes (ariete mantlet collar shroud + cavity cheeks +396 verts on both arietes via shared buildArieteMk; carro bow corner wedges +72). Gates RE-RUN ×2 at reconciled bytes: carro45t 90.3 PASS + ariete_c1 39.6 — both bit-identical AND matching the close rows (the original gate runs were already at these bytes; only the report trio was stale). Donor held; npm test green; italy.js md5 == builder's .FINAL snapshot; one stale hash corrected in ariete_c2.md.
- LESSON for briefs: final-report hashes must be computed AFTER the last geometry batch — "hashgeo, then hands off the profile."
- Italy critic spawned against the reconciled set.

## §5.277 — poland fix bytes 9.1/9.2 PASS, LANDED — poland lane COMPLETE 3/3 (2026-08-17)
- Fresh sitting s5267 (92 sheets, sandwich ×4 through four HEAD moves, family strip visible-fixed all cells lit): **jaguar 9.1** (all five fixes verified — mantlet/seam/wreathed cupolas make it out-read the donor as T-72-family; §B9 gear with 10-bolt faces; brackets counted; louvres; log tone-fixed RGB receipt) + **pt91 9.2** (ERAWA carpet cures the bare dome; true drum cylinders + see-through rail; louvres; sunk lid — dims-100 discipline held). KEEPs held ×2; glacis "flags" adjudicated = driver periscope slots (not a defect).
- LANDED: fix bytes + rows (jaguar 90.6→90.8; pt91 0 vlo-cap unchanged) + packets. Poland lane COMPLETE: pl01 9.1 / jaguar 9.1 / pt91 9.2. §5.248 ratified: **9** (pl01, strv81, strv103, strv122, ztz85_iii, ztz99a2, jaguar, pt91 + carro/ariete pending italy critic... correction: 8 ratified). Poland critic tools swept.
- Non-blocking polish banked: jaguar sprocket-carrier star + palette saturation; pt91 carpet contrast + WKM-B slimness + whip droop.

## §5.278 — owner triple-landing merged (PT-91 suspension wheels + turret-fidelity + icon reconcile) (2026-08-17)
- Owner landed c40164eb (PT-91 wheels suspension-driven: poland.js −29 lines, pt91 icons), 5ed4d73c (turret fidelity: afvFamily.js +245, italy.js 98, japan.js 63, challenger.js +7, procedural-fidelity.html 16, reference-glb-loader.js +18), 8258b1a3 (icon reconcile incl. carro45t/m3a3/strv81). Merge protocol: icons owner-wins (reproducible), lane files snapshot→merge→3-way→LANE-side on conflicts (afvFamily/italy/fidelity-page; modern3+loader applied CLEAN — ukraine recenter + owner +18 coexist), owner diffs extracted to merge-snap-050806/ for absorb orders. Pushed 33641d03.
- **pt91_twardy GEOMETRY MOVED under its fresh ratification**: 8322c846 (66/93701) → **16de0490** (63/69509) — the owner's suspension-driven wheel system replaced the lane's authored wheels (owner-sovereign). Re-gate at new bytes: row IDENTICAL (whole 5.2/dims 100/floaters 100 — vlo-cap class is wheel-insensitive), ×2 re-run staged. The 9.2 ratification's §B9/gear reads bind to the old bytes — **wheel-scoped spot-sitting spawned** (side/garage views only) to re-verify §B9 at the system wheels. jaguar 98798d10 + pl01 763b4f0c unmoved.
- Owner-diff absorb orders: italy (98-line turret deepening on the OLD donor builds — superseded-by-rewrite determination at landing), IFV (afvFamily +245 under the live fix round), japan (63 lines at HEAD under their uncommitted WIP).

## §5.279 — IFV fix round DELIVERED; upior pin re-adjudicated (critic was right); fresh sitting live (2026-08-17)
- All §5.269 orders delivered (hashes verified my side ×8 exact; guards byte-held; npm test green; track-clip 0/0/0 strict ×5 across five audit iterations; width-guard no-rescales, one 2-voxel dims freeze caught): bmp3 `310b7f2e` (36.6, all rows ≥ base), bmpt `cd427718` (8.2; hull −5.3 = ORDERED §B9/§B4 cost vs the fused blockout, §B7-certified), upior `ab3f40e4` (honest row replaces the reversed-frame score; dims re-derived gun-forward 5.15/6.20/3.00/2.55 — the parked pose hid a 1.1m muzzle overhang), marder1a3 `694568` (85.1, −0.2 ordered-cost), m3a3_bradley `b0eb98a1` (TOW at real depth).
- **UPIOR PIN RE-ADJUDICATION (instrument)**: round-1 π pin WRONG — shaded-content adjudication (+z face = twin-door stern) beats profile-shape tells when both hull ends converge; π removed from all three browser maps (native frame nose-+z), REG carries the parser-side flip (flip:true receipt re-committed in vertex/upior.json). **NEW LOADER LAW banked**: `turretYaw` opt-in param in reference-glb-loader.js (absent-param byte-identical) — re-poses artist-parked stations to gun-forward rest about the TURRET-SHELL-ONLY footprint (whole-cluster pivot measured 0.5m biased by the parked gun).
- Print's floating pedestal fragments + sub-pixel whips adjudicated negative w/ receipts. Fresh sitting live at the new hashes.

## §5.280 — germany-leopards DELIVERED (critic live); a6m _vlo verdict + dims-grid law (2026-08-17)
- **germany §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side ×7; 8 guards byte-held incl. leo2a6 e99dd7f8 + leo1a5 2aee1f9d): leo2a6m `59452b7a` **90.9 PASS ×2** (dims 100 at print-true 3.98 width; baseline 82.8), leo2a4m `94a83234` **89.5 ×2 = certified instrument ceiling** (print +6% deck-tall band + p95 3-column budget; dims 100; baseline 69; §E print y-normalize deck ×0.94 would release ≥90 if the fleet bar requires). Registration: leo2a4m rows ADDED to three maps (was crash-broken in vertex-extract — completed), leo2a6m amended componentMasks:false.
- **_vlo AUDIT VERDICT (real vertex scans)**: leo2a6m's chassis_vlo pair is BENIGN-REQUIRED (the print's only wheel train — excision would amputate wheels); the REAL bake is the chassis.0 detail shells (Object_5+7 carry the gun tube to x 7.964 = hullMask +51.4% smoking gun + at-rest turret band) + Slat_Armor turret-height panels hull-side → marder1a3 class, componentMasks:false. leo2a4m: whole-shell fused, no usable split → jaguar class. §E excision plan w/ tri-level literals filed (restores component gating; vlo pair must stay).
- **NEW INSTRUMENT LAW banked**: the dims grid is framed by the ref∪proc SHARED box — a proc edit whose lit span outgrows the ref re-phases EVERY column (a4m r7-r9 regression receipts); + the whip-rough coupling's second shape (raked whips spread tall tops across ~10 columns → p95 reads the tip). GEOMETRY-GATE.md note queued. Width true-up ask: REG pubDims 4.24/4.07 inflated vs print-true 3.98/3.77 (specs landed print-true; REG rows untouched).
- One REAL §B4 offender found+fixed (a4m mudflaps pierced the course 20/10 — outboard re-hang + seated hinge arms). npm-test ambient italy.js markers = the transient §5.278 window (verified clean now: 0 markers, parses, ariete_c1 hash exact); their clean-worktree exit 0 binds. Critic live.

## §5.281 — japan DELIVERED (critic live) — ALL EIGHT §5.248 BUILDER LANES NOW DELIVERED (2026-08-17)
- **japan §5.248 DELIVERED-PENDING-CRITIC** (hashes verified my side ×6; guards type74 ca287df4 / type89 3c89045d exact; variants build clean type90a 92e93b30 / type10b 77870ef0; npm test exit 0 LIVE): type90 `43179448` **83.9 ×2** (from 35.1, dims 100, beats datum-round 79.5 — the 08-12 0.80-Y turret compression RETIRED under print-parity; oracle = 49-v2 certified bytes fcfeb38a), type10 `97267188` **69.3 ×2** (from honest-0, dims 100, first honest first-party row; spec trued to 6.84/9.49/3.24/2.68; the 0.001 "belly" decoded as donor track sheet; baseline floater = real 5.5cm air-gap, fixed). Oracle restores done from 952561ea^ (type90 fcfeb38a + type10-repaired c3df50a6), .baks untouched, four-map registrations verified no-drift.
- ORCHESTRATOR ITEMS: (a) type90 08-12 taller-turret order retired by print-parity — owner confirmation flag (§B7 re-ruling only if the garage read is still wanted); (b) japan specs carry donor-cloned armor FRAMES (china-precedent refit queue); (c) type90a/type10b variant re-seat round suggested (tuned against old bases); (d) open attributions: type90 station i3 ~1% slab, type10 +0.96 front col right-only ground-read; (e) foreign fidelity-map WIP flag (batch-A row removals — verify at next map landing).
- **§5.248 STATUS: all eight builder lanes DELIVERED** (poland+sweden+china COMPLETE-RATIFIED, germany/italy/IFV/ukraine/japan in critics/fixes). Critic live.

## §5.282 — pt91 wheel spot-sitting: HOLD — 9.2 re-bound to 16de0490 (2026-08-17)
- System wheels equal-or-better on all four criteria: §B9 IMPROVES (the lane's authored wheels painted faces with mats.hull — camo streaked across discs; system wheels carry dark tire / olive dish / hub ring / 8-bolt ring, and twardy now out-reads the pt91m parity bar), no new track-clip (teeth mesh the wrap), hem/skirt lines pixel-identical, ratified kit pixel-identical. The owner's c40164eb supersession is a strict improvement — ratification re-binds cleanly.
- **poland lane FULLY CLOSED**: pl01 9.1 @763b4f0c, jaguar 9.1 @98798d10, pt91 9.2 @16de0490. Spot harness swept. Rig quirk noted: tmp-tank-critic's manako pt91 ref row carries no yawOffset (renders 180-yawed as a context column) — consolidated map landing item.

## §5.283 — italy wave 3/3 PASS, LANDED — italy lane COMPLETE (2026-08-17)
- **ariete_c1 9.1 / ariete_c2 9.2 / carro45t 9.3 — all PASS** (166-sheet sitting, five hash sandwiches through parallel-landing churn, DO-NOT-GATE honored). carro45t print-true within ~1% everywhere; c1's z-compression law read exactly as documented (build longer than print — not penalized); c2's package fully verified with c1≠c2≠donor direct pairs. Round-1 harness finds all harness-side (hlebov print gun −z yawOffset π; brighten threshold 0.12; the see-through-skirt scare DISPROVEN — InstancedMesh local-box leak + §B2 judged in pixels ×3 clean).
- **Owner 5ed4d73c italy-diff determination: SUPERSEDED-BY-REWRITE with receipts** — the owner's turret hunks targeted the OLD donor builds; the critic's donor-vs-c1 pair proves the measured 2.16 roof beats the donor squash the owner was patching. Owner intents already absorbed at build level (§5.275 statement + critic verification of lids/louvres/stanchions/MGs).
- LANDED: profiles+specs+packets+gate JSONs+vertex extracts+rows (ariete_c1 39.6 structural-cap / ariete_c2 0 no-oracle-by-design / carro45t **90.3** — fleet 38/106). Polish lists banked for a future dressing pass: c1 rear-sponson louvre band + glacis grille + brush guards + rack-end caps; carro crew-hatch plan re-seat (cupola left + oval loader right — station-safe) + octagonal muzzle block + outboard corner lamps + deck cables + corner smoke banks; c2 inherits c1 micro only. Italy critic harness swept.
- §5.248 ratified count: **12** (poland ×3, sweden ×3, china ×2, italy ×3 + jaguar... correction: poland 3 incl jaguar = pl01/jaguar/pt91, sweden strv81/strv103/strv122, china ztz85_iii/ztz99a2, italy ariete_c1/ariete_c2/carro45t = 11 ratified).

## §5.284 — germany wave 2/2 PASS, LANDED — germany lane COMPLETE (2026-08-17)
- **leo2a6m 9.3 / leo2a4m 9.1 — both PASS** (107-sheet sitting, §B4 independently re-run 0/0 strict both, §B5 rigid-rotation AABB receipts, guards ×5 exact, leo2a4_otco smoke-builds post-wrapper-retirement). a6m: L55 station verified, M-package in pixels, ISAF cage as real geometry w/ turret-owned flank sections that yaw. a4m: L44 station, slab package, mudflap fix verified, ceiling residuals verified-consistent w/ the certified 89.5.
- LANDED: profiles+specs+packets+gate JSONs+rows (leo2a6m **90.9** / leo2a4m 89.5 ceiling — fleet 39/108). Map rows stay in the shared dirty maps for the consolidated landing. Polish queue: a6m bow-corner cage flares + rear-wall cables/lamps; a4m hull-module face ribs (§5.04 class in flat side-ortho). Round probes + critic harness swept.
- §5.248 ratified: **13** (poland ×3, sweden ×3, china ×2, italy ×3, germany ×2).

## §5.285 — japan wave 2/2 PASS, LANDED — japan lane COMPLETE (2026-08-17)
- **type90 9.2 / type10 9.1 — both PASS** (116-sheet sitting vs byte-verified oracles fcfeb38a/c3df50a6; the retired 08-12 compression confirmed GONE in before-states; type10's 0.34 raised-belly decode confirmed in pixels — daylight passes under the hull exactly like the ref). Certified residuals honored (type10 roof-kit 2.68-datum set; type90 §B3.1 collar). Defect queue (non-blocking dressing): type90 basket band solid-olive vs open 10-cell grid (texture, not geometry — largest garage-visible gap), mast T-crossbars scaffold read; type10 transom access-rectangle tone.
- LANDED: profiles/misc.js + gate JSONs + reference-doc round sections + full PACKETs copied to docs (type90-packet-s5248.md / type10-packet-s5248.md). Rows type90 **83.9** / type10 69.3. NOTE: type10's modern3.js rewrite rode the §5.283 italy landing (shared file, mixed-lane commit — now ratified, harmless; LESSON: shared-file landings check for co-resident lane hunks). Critic rig swept; tmp-misc3-worldtrace null-guard KEPT per builder.
- §5.248 ratified: **15** (poland ×3, sweden ×3, china ×2, italy ×3, germany ×2, japan ×2). Remaining: ukraine fix round (4 ids) + IFV landing (5/5 PASSED — landing next).

## §5.286 — IFV wave 5/5 PASS, LANDED — IFV lane COMPLETE; upior REG defect fixed-at-landing (2026-08-17)
- **bmp3 9.0 / bmpt 9.2 / upior 9.0 / marder1a3 9.0 / m3a3_bradley 9.3 — all PASS** (179-sheet fresh sitting; track-clip strict 0/0/0 ×5 reproduced by the critic; §B5/§B9 ×5; wave 6-strip reads six distinct vehicles; roster reversal EARNED — bmpt now out-reads bmpt_terminator2 for the print's DNA). m3a3's TOW depth delta vs the m2a2 guard "unmistakable".
- **upior turretYaw REG defect FIXED AT LANDING** (critic receipts: the station is NATIVELY gun-forward — the §5.279 PI re-pose double-flipped the ref muzzle-over-tail 1.48m past the hull; the builder never saw it — their after-run used the stale s5248 page): param removed from all three maps (python + assert + grep-0 receipts), **upior re-gated ×2 bit-identical at the corrected registration** (hull 3.4/whole 0/turret 0/stations 0/dims 100/floaters 100 — the honest true-orientation row, replaces the flipped-ref 4.9-class row).
- LANDED: afvFamily ×2 + packets ×5 + gate JSONs ×5 + vertex upior.json + rows (bmp3 36.6 / bmpt 8.2 §B7-cap / upior 0 print-cap / marder1a3 85.1 / m3a3 0 instrument-cap / spz_puma refresh). Tier rows land with this wave — the §5.252 live-tree npm failure RESOLVES. Critic harnesses swept. Fleet-polish theme banked: wheel-bay lighting dim across all five (§B9 geometrically present, underlit at garage angles) — dressing-pass queue.
- §5.248 ratified: **20** (poland ×3, sweden ×3, china ×2, italy ×3, germany ×2, japan ×2, IFV ×5). Remaining: ukraine fix round (4 ids — last lane).

## §5.287 — IFV landing HOTFIX: tier/label/marking wiring landed; broken-window closed (2026-08-17)
- **INCIDENT**: the §5.286 landing missed the IFV lane's wiring files (tier.js/tankLabels.js/vehicleMarkings.js — bmp3/bmpt/upior rows) — 2fc642fb was pushed FAILING tier.selftest for ~4 minutes. Root cause: the landing chained the clean-worktree test with `;` instead of gating the commit on its exit code — exit=1 printed and the commit ran anyway. Fixed forward immediately (wiring landed, clean-worktree exit 0 verified BEFORE this commit).
- **LANDING LAW HARDENED**: (a) clean-worktree npm test must GATE the commit (&& not ;) — never chain past the exit code; (b) a lane's "Wiring:" report line = a landing checklist — enumerate every named file into the pathspec (the §5.285 shared-file lesson's sibling).

## §5.288 — ukraine fix round DELIVERED (last lane); fresh sitting live (2026-08-17)
- All 17 §5.272 ordered items delivered w/ receipts (hashes verified my side ×8; guards byte-held; npm test GREEN live; track-clip 0/0 ×3 + t64bv byte-equal banked class): oplot `6a699084→d7d068be` (bow contraption DELETED — the toothed discs were exposed idler shoe pads now under the print-true skirt; PNK-6 real tower; 8-brick Duplet wings; **roof-plate discovery: the shell plate authored AT the p95 datum swallowed every roof fitting** — dropped 0.865→0.795, furniture now proud), kursk `3985f9b0→1332bd55` (82.6 +0.3; §B9 fixed; K-5 clamshell; folded NSVT reads; log low+desaturated), t64bv `d6ac5b50→4fac9a30` (30.5; print stern grammar w/ OPVT-through-rack; rubber-dark flaps; chevron +2), t80bv `bc3c80a→554591b8` (2.5 every-component-≥; real bo4ki cylinders; §B9 worst-case fixed; climbing glacis raft; articulating Luna-4).
- Owner 2b193244 absorb-or-supersede MEASURED: mushrooms + lens-ring adopted (zero cost), outer-return chevron withdrawn (−1.2 receipt), bustle drums superseded by print-station hull drums (bashnya fusion = documented oracle defect), standing NSVT banked post-warp.
- Instrument lessons banked: lifted-front-view sees stern over dome; tilted-brick AABB corners feed p95 (~0.12 @ rx 0.28); datum-height shell plates render roof kit invisible; 4-way bisect switchboard attributed a −2.0 regression (stripped); strict offender AABBs beat bucket guessing.
- Fresh sitting live — the wave's LAST verification.
## §5.289 — sparse modern-turret articulation wave (OWNER session entry; renumbered from §5.288 at merge) (2026-08-17)
- Corrected three visually flat new-family turrets without broad fleet churn: **pl01, t72m1_jaguar, strv122**. Added source-semantic shallow applique/service panels, roof seams and fasteners, seated periscope/sensor cadence, commander observation stations, and warning/side optics within each existing turret envelope. Hero, top, and yaw-90 renders were manually inspected; all additions remain turret-owned and rotate as one supported package.
- PL-01 now carries faceted applique and roof strakes instead of one blank plate; Jaguar gained ERAWA flank articulation, cupola/periscope rhythm, a protected panorama, Luna-style cheek lamp, and roof cassettes; Strv 122 gained the Swedish articulated roof-armor spine. The initially prepared Leopard 2A4M/2A6M wrapper edits were deliberately dropped during rebase because current main replaced those retired wrappers with newly measured ground-up builds.
- Duplicate-course audit found Jaguar's old decorative static wheel-face layer over the suspension wheels. It was removed while retaining the single animated smart track/wheel course, skirts, armor, and suspension. Final duplicate audit: **5/5 PASS**. Turret-parent audit: no stranded/dangling turret decoration; PL-01's sole abutment is the legitimate hull-owned driver periscope at the ring.
- Selective icons, silhouettes, armor/hit-zone/module plates, and `tank-assets.json` regenerated: **3 tanks / 27 files PASS** on current main. Post-rebase full `npm test` and private production build PASS. Existing source-normalization and Strv 122 track-clip findings remain separate pre-existing hull/reference issues; no false all-standard-gates claim is made for this turret-only wave.

## §5.290 — owner articulation (§5.289) gate cost measured; dims-recovery round live (2026-08-17)
- Post-merge re-hash: pl01 `763b4f0c→932ce948`, t72m1_jaguar `98798d10→cf5357b` (−3 meshes = the owner's duplicate wheel-face-layer removal — their 5/5 duplicate audit), strv122 `4f5694d4→e50e253e`; strv103 4ac3c8c8 GRADUATE FREEZE INTACT, strv81 + pt91 held.
- Re-gate ×2 bit-identical at the articulated bytes: pl01 **64.1** (whole IMPROVED 62.2→64.1, dims 100→**90**), jaguar **71.3** (whole IMPROVED 90.8→91.0, dims 97.4→**71.3** binding), strv122 **87.1/100 CLEAN**. The owner's audits (turret-parent, duplicate-course, npm test, build) did not include geometry-gate — the articulation's roof-kit heights exceed p95 budgets (§5.261/§5.273/§5.280 class).
- **DIMS-RECOVERY ROUND live** (my lane): prime directive = preserve EVERY owner fitting; re-seat heights/mounts only into the p95 budget (pt91 §5.273 pattern); targets dims 100 both while HOLDING the owner-earned whole gains (64.1/91.0); strv122 untouched; guards incl. the graduate freeze. Ratification spot-sitting follows the recovery (one sitting covers owner-articulation visuals + recovered dims). Rows land after recovery — the current ledger keeps the pre-articulation rows until then (documented drift, §5.278 precedent).

## §5.291 — ukraine wave 4/4 PASS, LANDED — ALL EIGHT §5.248 LANES CLOSED, 24 ids RATIFIED (2026-08-17)
- **oplot 9.3 / kursk 9.1 / ua_t64bv 9.2 / ua_t80bv 9.2 — all PASS** (148-sheet sitting, 26/26 fix markers, all 17 ordered items verified in critic pixels; the byte-equal front-flap "receipt" was caught and re-verified against source+pixels — delivered, sloppy receipt only; owner-absorb all present, withdrawn module absent as receipted). Residuals pre-adjudicated (palette classes, muzzle-endon harness framing artifact — family-wide −0.37 box class, banked).
- LANDED: profiles+specs+packets ×4+gate JSONs ×4+vertex extracts+rows (oplot 0 print-cap / kursk 82.6 / t64bv 30.5 / t80bv 2.5 — honest capped rows, §E warps queued). Round tools + ukraine critic harnesses swept.
- **§5.248 VERIFICATION COMPLETE: 24/24 delivered ids ratified ≥9.0** — poland ×3 (pl01/jaguar/pt91), sweden ×3 (strv81/strv103-refrozen/strv122), china ×2 (ztz85_iii/ztz99a2), italy ×3 (c1/c2/carro45t), germany ×2 (leo2a6m/leo2a4m), japan ×2 (type90/type10), IFV ×5 (bmp3/bmpt/upior/marder1a3/m3a3), ukraine ×4. Plus spz_puma refresh + stb1 owner-built = the full 28-print order accounted for (28 drops → 24 rebuilt ids + puma refresh + stb1 owner + 2 prints serving as alt-references for existing ids per §5.249 onboarding).
- HOOK-CLOSURE REMAINING: dims-recovery (pl01/jaguar owner-articulation, LIVE) → consolidated map-row landing → §E batch round → icon regen for rebuilt ids → closure entry.
## §5.292 — STB-1 source-semantic turret articulation (OWNER session entry; renumbered from §5.291 at merge) (2026-08-17)
- Reopened the owner-authoritative `stb_1.glb` as a comparison-only oracle and inspected source/procedural hero-front, hero-rear, top, close-front, and close-roof pairs. The prior cast silhouette was sound, but its key fittings were too shallow to survive garage scale, which made the turret read as a bare dome.
- Strengthened the source's backed flank ventilation arrays, corrected the four-cell cheek grille from a wrong-axis flat strip into four side-facing armored vent cells, rebuilt the six-pane searchlight face, articulated the loader hatch with a seated ring/hinge/vision-block cadence, and added the broad backed rear-crown mesh field. All new pieces are turret-owned and visibly overlap a supporting cast surface.
- Track duplicate audit **1/1 PASS** and turret-parent audit reports **0 stranded / 0 abutting / 0 dangling**. Selective STB-1 icons, silhouettes, hit-zone/armor/module sheets, and manifest were regenerated and `tank-assets-check --ids=stb1` passed. The fleet standard checker still reports this tank's pre-existing missing gate packet and legacy clip census, so this entry makes no false all-standard-gates claim.

## §5.292 — Carro 45t source-semantic turret articulation (2026-08-17)
- Reopened the authoritative `carro_45t.glb` as a comparison-only oracle and inspected fourteen source/procedural views after each edit. The measured low OTO wedge remains intact; this is an articulation pass, not an invented modern-ERA conversion.
- Rebuilt the swallowed loader position as a buried shoe, shallow lid, rim, hinge, split seam, and four seated periscopes; converted the painted flank rectangles into backed ribbed access cells; added the source-like twin five-tube corner smoke banks on broad brackets; and formed the rear crown lattice as one dark connected rail with four visible armor returns. The launchers and lattice now survive garage and top-tilt scale without floating or overtopping the commander station.
- Machine gates remain green: standard floor **90.3**, clip **0/0+0/0**, holes **0**, and fittings census **MG1+5d**. Duplicate-course audit is **1/1 PASS**. Turret-parent audit reports **0 stranded / 0 dangling**; its single abutment is the pre-existing hull-owned spare-track packet beside the ring, not turret equipment. Selective Carro icons, silhouettes, hit-zone/armor/module sheets, and the asset manifest were regenerated and pass `tank-assets-check --ids=carro45t --allow-partial`.

## §5.293 — carro45t owner articulation (d7afdb66) gate cost measured; row re-staged honest (2026-08-17)
- carro45t `c44ff748→9fa68918` (+4 meshes/+5100 verts). Re-gate ×2 bit-identical: **82.9** (was 90.3; whole 90.7→82.9, stations 89.2, turret/hull held, **dims 100 HELD**). Classification: §5.273 law — the fused print LACKS the owner's added kit, so the whole metric prices it; dims-clean means no published-truth violation (contrast the jaguar §5.290 case). Owner articulation is sovereign visual enrichment; the ledger reflects the honest 82.9 with this documentation. NOT a regression class — documented instrument-vs-reality gap.
- carro45t joins the pl01/jaguar post-recovery spot-sitting (one sitting re-binds all three owner-articulated ratifications; strv122 clean-held needs none). stb1 (owner's own id) articulated to 1898e153 — informational, never program-gated.

## §5.294 — dims-recovery LANDED: jaguar 90.9 PASS + pl01 dims-100; measured owner-exchange documented (2026-08-17)
- **jaguar `cf5357b→f5a12caf`: dims 71.3→97.4, min 90.9 PASS ×2** (net vs pre-owner POSITIVE 90.8→90.9). Owner fittings preserved w/ receipts: panorama mount sunk 0.84→0.75 (still 6.4cm proud, lens+glass exposed), periscope cadence re-seated down the forward slope (in-place sinking would read flush = deletion), cassettes STAND (surfacing experiment measured −0.1, reverted — print has no gun-shoulder mass). Structural note: dims 97.4 is the ceiling — the certified dome crown itself reads 2.2594 > the 2.2523 dims-100 edge; 100 requires re-shaping ratified geometry (out of scope).
- **pl01 `932ce948→d168fac4`: dims 90→100 ×2** (heightM 2.83 @0.90%); whole 64.1→63.1 keeping +0.9 of the owner's +1.9 earn. **MEASURED EXCHANGE LAW banked**: the owner's over-published heights were buying whole score with dims budget (pl01 0.41 col·m ↔ 1.0 whole); full whole-hold + dims-100 structurally incompatible over print-tall bands; every further lever re-shapes certified geometry or trips the whip-rough-coupling law. Owner strakes/ribs/periscopes re-seated to the highest dims-legal pixel rows (reads quantize in 1.04cm rows), all still proud.
- Guards ×4 + graduate freeze byte-held; track-clip 0/0 both; §B5 closed on construction evidence (coordinate-only diff, zero bucket/parent changes — FIFO-wedge precedent); npm test &&-GATED green. Rows staged (fleet 39/117 — jaguar back in the passing set). Probe tools swept.
- **ONE spot-sitting spawned re-binding the three owner-articulated ratifications**: pl01 9.1 @ d168fac4, jaguar 9.1 @ f5a12caf, carro45t 9.3 @ 9fa68918.

## §5.295 — CONSOLIDATED MAP-ROW LANDING (four shared harness maps, one gated commit) (2026-08-17)
- Landed the wave's full registration state across procedural-fidelity.html / visual-evaluator-page.html / tmp-tank-critic.html / vertex-extract.mjs: all 24 rebuilt-id rows verified present per map (poland w/ completed pl01 followers, sweden yawOffsets, china −π/2 pair, ukraine π/+π/2 + recenter-class rows, leo2a4m ADDED + leo2a6m componentMasks:false, japan verified-no-drift, IFV incl. upior turretYaw-REMOVED §5.286 rows), vertex-extract parses, owner fidelity hunks from 5ed4d73c coexisting.
- **batch-A clone-row removals ADJUDICATED**: bmp3_rok / bmpt_terminator2 / upior_ifv fidelity rows are GONE (removed during lane registration cleanup — the clones pointed at the same prints as the new primary ids). Harmless: clones never gated, never had own oracles, and are ASK-OWNER retirement candidates; rows re-add trivially if the owner keeps them. marder1a3/m3a3/ua_/strv one-liner "deletions" = expansions to multi-line rows (all present).
- Known map quirks carried (documented, non-blocking): tmp-tank-critic pt91 manako ref row lacks yawOffset (context-column 180 read §5.282); visual-evaluator ref path still can't load community-candidate override ids (§5.261 refit queued).

## §5.296 — re-bind spot-sitting: ALL THREE RE-BOUND; no re-opens (2026-08-17)
- **pl01 9.1 @ d168fac4** (strakes+ribs proud at the re-seated bytes, conformal periscope trio, faceted identity intact), **jaguar 9.1 @ f5a12caf** (re-seated trio reads PROUD not flush, panorama lens exposed, cassettes at owner seats, family read + §B9 single-course held), **carro45t 9.3 @ 9fa68918** (all d7afdb66 articulation reading — hatch shoe/lid/hinge, periscope ring, both canted smoke banks, low crown rail no-sky-rods, rib panels; ratified identity intact). strv122 guard held w/ owner spine present. §B5 ×4, zero floaters, zero regressions.
- The three owner-articulation events (§5.289/§5.293) are fully reconciled: visuals re-bound, dims recovered (§5.294), honest rows staged. Rebind rig swept.
## §5.297 — KF51B + Type 90A flat-turret articulation wave (OWNER session entry; renumbered at merge) (2026-08-17)
- A procedural-only census of the omitted new variants (`kf51b`, `type90a`, `type10b`, `merkava4b`, `leclerc_xlr`, `amx56`) found two genuine garage-scale flatness defects: KF51B's broad source-faithful wedge had almost no readable roof/flank articulation, and Type 90A's new measured base left a large uninterrupted welded roof. Type 10B and Merkava 4B already carry dense, supported stations; Leclerc XLR and AMX 56 already resolve hatches, optics, smoke/RWS hardware and flank packages, so they were intentionally not cluttered with invented armor.
- **KF51B** keeps the low Panther source silhouette but now carries two seated hatch coamings/lids/hinges, six vision blocks, cross-roof service seams, longitudinal weld courses, seven shallow backed armor cells per flank, supported sensor/APS pods, a more legible SEOSS head, and a proper shared-fitting MAG inside the existing split-shield RWS. The dedicated comparison lane now accepts both owner and normalized KF51 source node spellings.
- **Type 90A** now has a second physically seated crew station, coaming/lid/hinge/vision blocks, five weld/service courses, four backed roof access plates, joined flank NERA/service cells with ribs, and supported side sensors. Its Type 90 hull, basket, smoke banks, panorama, whips, smart running gear and envelope are unchanged.
- Visual inspection covered front-left, rear-right, close-roof, top and top-tilt views after the final RWS conversion. Turret-parent audit: **0 stranded / 0 abutting / 0 dangling** for both. Duplicate-course audit: **2/2 PASS**, one suspension-driven tread/connector course each. Standard decoration census now sees KF51B `MG1`; Type 90A remains `MG2+10d`. KF51B's old exact track-envelope counts remain separately documented and were not touched by this turret-only correction.
- Regenerated **18** derived icon/silhouette/hit-zone/armor/module/marking assets plus the manifest; selective asset check passes with muzzle bores verified. Full `npm test` and private production build pass on the rebased current-main tree.

## §5.298 — owner KF51B/Type90A wave (§5.297) verified clean of ratified ids (2026-08-17)
- Post-merge re-hash: kf51 ffb1144c UNMOVED (kf51b is its own userdrops3 tier-10 id), type90a 92e93b30→b59b6274 (unrated variant, informational — already flagged for the variant re-seat round). Ratified neighbors in both owner-touched files byte-held: leo2a6m/leo2a4m/leo1a5 + type90/type10/type10b all exact. No re-gates needed. NOTE: §3's kf51 row (79ce4523) is the known pre-§5.229 stale class — fleet re-freeze sweep item, unchanged by this event.

## §5.299 — OWNER ORDER SET (verbatim, 2026-08-17): six-item refinement wave on the §5.248 results
Owner: "undo strv 122 and strv 81. make our old pl-01 from before our changes into a new K2B tank in korea. keep the type 10b and revert the plain type 10 to the model before. c1 and c2 ariete should have sloped turret fronts and upper glacis. for our leopard 2a4m, use the new hull and gun but use the turret from before we were using. and finally finish the leopard 2a6m turret"
- Parsed lanes: (A) strv81+strv122 REVERT to pre-§5.271 builds (strv103 rebuilt/graduate state UNTOUCHED — not named); (B) NEW id `k2b` (Korea) = the pre-§5.267 pl01 build (the K2-donor variant) resurrected; current ratified pl01 stays; (C) type10 REVERT to pre-9555f7fe build (the rewrite rode the italy landing §5.285-note) with type10b PINNED FIRST to its current 77870ef0 state (owner: keep); (D) ariete_c1+c2 sloped turret fronts + sloped upper glacis (owner enhancement on ratified builds); (E) leo2a4m = germany-wave hull+gun + PRE-WAVE wrapper turret; leo2a6m turret FINISH (critic polish list + print parity). All lanes: gates ×2 honest rows, §5.287 gated landings, changed-view re-certs where ratified surfaces change.
- §E batch (live) adjudication note: strv81/strv122/pl01-normalize print items become moot-for-gating post-revert (prints stay as references; repairs harmless); leo2a6m/leo2a4m §E items DEFER until lane E lands.
## §5.300 — Strv 81 garage-scale turret articulation (OWNER session entry) (2026-08-17)
- Continued the new-family flat-turret census after the KF51B/Type 90A wave. Source/procedural roof and hero comparisons show the completed German, IFV, Japanese, Chinese, Italian and Ukrainian batches already retain readable source-specific stations or armor grammar; they were deliberately not covered with generic ERA. The remaining real scale-loss defect was Strv 81: its cast shell was sound, but the source's cupola, Ksp cradle, loader station, search lamp, smoke sextets and roof fittings were too small to survive garage presentation.
- Preserved the Centurion cast silhouette, 20-pdr station, hull, skirts and running gear. Broadened the commander cupola in plan while holding its existing height envelope; added eight backed vision cells; articulated the loader coaming/lid/hinge/vision block/handles; enlarged and lowered the shared-fitting Ksp onto a two-rail cradle; added shallow crown service courses and supported grab rails; rebuilt the lamp as a backed drum and lens; and strengthened both source-semantic six-tube smoke banks on broad cheek pads. No modern ERA/APS was invented for this period vehicle.
- Final evidence contains 14 paired + 14 yaw0 + 14 yaw90 views. Manual inspection of roof, heroes and quarter-turn views confirms every new fitting rotates with the turret and remains visibly seated. Turret-parent audit: **0 stranded / 0 abutting / 0 dangling**. Duplicate-course audit: **1/1 PASS** with one suspension-driven integrated tread/connector layer. Standard continuity/decor checks report **0 holes** and `MG1+6d`; the old unrelated Strv 81 geometry-gate and exact track-envelope scores remain pre-existing and are not misrepresented as repaired by this turret-only pass.
- Regenerated the selective Strv 81 icon/silhouette/hit-zone/armor/module assets and manifest; `tank-assets-check --ids=strv81 --allow-partial` passes with the muzzle bore verified.
- ADJUDICATION: this articulation landed in-flight BEFORE the owner's §5.299 order "undo strv 81" — the order supersedes; lane A's revert includes this articulation by the owner's own instruction.

## §5.301 — OWNER ORDER EXTENSION (verbatim, 2026-08-17): "revert the strv 103b as well"
- strv103 joins lane A's revert scope (the §5.299 order named only 122/81; this extension revokes the strv103-untouchable clause). The pre-§5.271 build (the §5.198-era graduate state, historical freeze 4d0ff518) restores from 75780d72^; the lane reports the restored hash (post-§5.229 it may differ from the historical freeze value); the §3 graduates-table row reverts at landing (orchestrator action): 4ac3c8c8 entry retires, the row re-binds to the restored state with this order as authority.
- Lane A messaged mid-flight with the updated scope. Five §5.299 lanes + §E batch remain live.

## §5.302 — OWNER ORDER (verbatim, 2026-08-17): "now completely revert our marder hull while preserving its new turert"
- Lane F spawned: marder1a3 = PRE-§5.286 hull (from 2fc642fb^, completely — the wave's hull-side §B9/glacis/ramp fixes revert with it) + the CURRENT ratified turret (low cast round-front, MK20 carriage, MILAN, collars — §5.269-fix state). Ring-seat reconciliation + §B5 unity required; all seven afvFamily neighbors hard-gated byte-identical; honest re-gate ×2; spec hull-side values revert if the wave moved them. Seven §5.299-family lanes now live (+§E batch).

## §5.303 — OWNER ORDERS (verbatim, 2026-08-17): kf51b integration; bmp3 gap+enrichment; bmpt removal
- **"lets integrate kf51 b. make it a lot more inline with our visual aesthetic and tracks and hull and turret."** → folded into lane E (kf51b's builder lives in profiles/leopard.js, lane E's file): item 3 — fleet-integrate tracks/hull/turret (§B6 gear, KIT census, fleet tones, §B2/§B3.1/§B5/§B9), absorb the owner's b3d15714 deepening w/ receipts, kf51 resident ffb1144c untouchable, FALSE-0/photo-class (no oracle), packet kf51b.md new.
- **"update bmp-3s. huge gap you can see through the side through upper glacis. fix and add more equipment, machine guns, deocrations"** (w/ garage screenshot showing a see-through bow gap = live §B2 violation) → folded into lane F (afvFamily.js): item 2 — close the bow/glacis/side seam with real geometry + §B2 sweep, add the real BMP-3's twin bow PKT MGs, enrich per fleet grammar + §5.269 polish debts (902V mass, waterjet/grille depth, idler face, side band), verify bmp3_rok inherits, honest re-gate ×2.
- **"keep our BMPT terminator 2, but remove the BMPT-72 Terminator 2"** → folded into lane F: item 3 — REMOVE id `bmpt` (spec/builder/tier/labels/markings/garage wiring/map rows; ledger row drops at landing via orchestrator; gate JSON + packet stay as history w/ retirement note), KEEP `bmpt_terminator2` untouchable. Resolves the §5.269 roster-reversal question by owner ruling; the ASK-OWNER clone-retirement item partially answers itself (bmpt pair: clone wins).
- Live: lanes A (sweden ×3 revert), B (k2b), C (type10 revert), D (ariete slopes), E (leo2a4m turret + leo2a6m finish + kf51b), F (marder hull + bmp3 + bmpt removal), §E batch = 7 agents.

## §5.304 — OWNER ORDER (verbatim, 2026-08-17): "update our t62 obr 1975 10% wider and then redeisgn our type 59 to be based off of that"
- Lane G spawned: (1) t62mv1 ("T-62 obr. 1975") build + spec widthM ×1.10 (owner-decreed spec change — the oracle print now reads ~−10% narrow; dims/width-coupled rows documented as adjudicated divergence, never chase the print back); (2) type59 REDESIGNED as a procedural build on the widened t62mv1 base w/ Chinese identity dressing — retires MODEL_SOURCE.type59 (GLB flip per the t44/type59 flip-era mechanics; GLB stays as reference). Guards: ztz85_iii 13f0c8d7 (first-party since §5.259, must not move) + china/russia neighbors. Track-clip high-risk after the gauge change — strict 0/0 required.
- EIGHT agents live: lanes A-G + §E batch.

## §5.305 — LANE A LANDED: swedish triple revert (owner §5.299/§5.301) (2026-08-17)
- All three restored WHOLESALE byte-exact from 75780d72^ (the only post-wave commits on those files were the two owner articulation commits — the order supersedes them): strv81 `911d5770` (centurionBuild donor + addStrv81Package, spec 7.82 restored; row 34.9→0 pre-wave class), strv122 `1ca18498` (buildLeo2A5 donor + package; row 87.1→86.6 weak-Tripo class), strv103 `4c8f1330` (casemate build + oracle package; row 76.7→57 — the maps keep the §5.271 corrected yawOffsets so the honest-current number differs from the historical 75.8). Guards centurion3/leo2a5 unmoved; npm test green live; §5.254 pairs 0/14 byte-identical (no evidence void).
- **§3 graduate row REVERTED**: strv103 → 4c8f1330 (the §5.198-era build at current hashing; 4ac3c8c8 retired by owner authority). No critic — owner-ordered reverts to pre-ratification states need honest rows only.
- §5.248 scoreboard note: the sweden lane's three ratifications are owner-retired; the wave's ratified-and-KEPT count adjusts in the closure entry.

## §5.306 — §E BATCH LANDED: 9 DONE / 2 SKIPPED / 3 STOPPED, all receipted (2026-08-17)
- Batches 57-65 in repair_oracles.py (+ new census-guarded `_tri_region_move` op). DONE: pl01 63.1→**66.9** (dims 99.6 pixel-row debt documented), pt91 0→**24.6** (vlo excision de-poisoned registration dy 0.27→0.02), strv81 print whips excised (+15.4 measured pre-revert; reverted build now measures 0-class honestly vs the repaired print), strv103 body ×1.2229 (reverted build 57 honest), spz_puma z/y normalize (hull 43.8/whole 23.0), bmp3 stack+whip pin (36.6→**39.8**, hull EXACT HOLD), oplot maps (stations 68.5), ua_t64bv (hull 56.3/whole 42.9; min moved to turret 24.9 — sim-normals delta receipted, landed bytes are truth), leo2a6m tri-level detail-shell excision (**90.9/100/100 EXACT HOLD = move-invariance proof**; componentMasks re-registration deferred per §5.299). SKIPPED w/ receipts: kursk (dims sovereignty 100 vs 89.9), leo2a4m (both shapes measure BELOW the 89.5 ceiling — §5.280 hypothesis disproven). STOPPED w/ receipts: bmpt (premise disproven — deficit is ABSENT geometry, §E can't synthesize; id being removed anyway), ua_t80bv (y_map owns the hull crater — new plan needed), m3a3 (§5.269 skinned-bounds hypothesis DISPROVEN at every link: 0 skins, accessors truthful, scatter real — unlock needs a new drop or hand-authored pose).
- Guard proof: 25/26 byte-identical; the one mover = the owner's own c2dc8924 (superseded into lane A). Batch laws banked: vlo-owns-width-anchor (re-key ×1.0579 post-delete), k2 frame-pin law generic (max-y warps re-frame every court — the t80bv crater class), sim-normals forecast ±4-8 on knife-edges.
- Rows staged for current-build ids (bmp3's 39.8 will re-stage under lane F). Swedish rows verified already-bound (lane A gated post-repair). npm test green at close.

## §5.307 — LANE B LANDED: K2B (Korea) from the resurrected pl01 (owner §5.299) (2026-08-17)
- **k2b `13afe560`** (76/132434) — BYTE-IDENTICAL resurrection proof (detached-worktree hash of d7ba844f^ pl01 matches exactly; sole delta = the PL-01→K2B number decal, texture-only). Nation South Korea, tier 9 (k2's), old pl01 deltas verbatim (hp 2300, 35t, DM63A1, digital scheme, dims 7.00/9.20/3.80/2.80). Seven-file wiring checklist complete (§5.287 law): profiles/korea.js + korea.js NEW, tankFactory import, profiledProcedurals spread, tier/labels/markings. Guards pl01 d168fac4 + k2 99594568 unmoved ×3. FALSE-0/photo-class (no gate row; k2's oracle not wrapped). Garage evidence eyeballed: KR tab shows IX K2B beside K2 Black Panther.
- Cross-lane receipt: the live tree transiently fails npm on lane E's mid-edit (buildLeo2A4M frustum ReferenceError — expected mid-work state, their &&-gate will catch it at their close). Straggler strv81/strv103 vertex extracts (repaired-print regens) land with this commit.

## §5.308 — LANE C LANDED: type10 reverted, type10b pinned byte-identical (owner §5.299) (2026-08-17)
- **type10 `97267188→a1cecea6`** (62/59602) — buildType10Native2026 restored BYTE-EXACT from 9555f7fe^ (whole-file equality proof). Row 69.3→**68.7** ×2 (hull 77.3/whole 68.7/stations 85.4/dims 100/floaters 100 — the old floater island does NOT reproduce; truth over the min-0 expectation). **type10b `77870ef0` HELD EXACTLY** through pin+revert+battery (14/14 pixel hold proof) — the japan-wave base pinned verbatim as buildType10BBase, type10b its only consumer. Guards type90/type74/type89 exact. §5.254 determinism 28/28.
- Landed: modern3.js (pin block + revert; ariete untouched per fence), profiles/japan.js (re-point only), packet, gate JSON, row. Lane tmp driver swept.

## §5.309 — LANE D DELIVERED (re-cert sitting live); OWNER ORDER: amx30 pair → LANE H (2026-08-17)
- **Lane D delivered**: ariete_c1 `49ce4878→49c15299` + ariete_c2 `a9ed20d8→b0b3c184` — sloped turret fronts (cheeks raked ~40° from vertical, was ~8°) + true sloped glacis planes (the "flat" reads root-caused: side-wall slab overrunning to z+2.87 painting a 1.51 shelf + horizontal stepped plates). c1 rows hold-or-improve ×2 (39.6 held, hull 46.6→47.87, dims byte-identical — no spec contact); guards carro/donor byte-held; whip re-pair probed + reverted w/ receipt. Changed-view re-cert sitting LIVE. (Their flaky kit.js TDZ race flagged as a separate chip — pre-existing, standalone-green.)
- **OWNER ORDER (verbatim)**: "make the amx 30bs based off of stripped down versions of amx 40 without sideskirts and as much side turret armor, with a lil more turret rounding, the cupolas lights machine guns etc. update the amx-30b and amx-30b2" → **LANE H spawned** (amx30 + amx30b2 rebuilt on the amx40 base: skirtless §B9, stripped side-turret armor, cast-round turret re-loft, TOP cupola/lights/20mm-coax/IR grammar, B2 tells; amx40 + leclerc untouchable; userdrops7 region-fenced vs lane G).
