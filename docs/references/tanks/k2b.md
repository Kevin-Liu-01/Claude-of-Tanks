# Shared production K2 wheels — 2026-09-22

Owner target: XK2 and K2B use the production K2 (`k2_x`) road wheels.
`profiles/k2RoadWheels.ts` now owns the shared 0.3225 m tire radius,
0.387 m stock width and 0.90 painted-face ratio. The native animated tire,
painted disc and inset geometry matches K2 exactly in HIGH, LOW and AI.
Each receiving chassis retains its six axle X/Z stations, return rollers,
idler and sprocket. The native solver reseats wheel height, suspension and
lower-track tangencies; fixed inboard knuckles follow that solved axle.
Generated interior fills were refreshed to clear the changed track course.

The focused geometry regression compares actual buffers against `k2_x`;
the rough-field regression now covers both variants in HIGH and LOW. The
six-second turning/rough-ground simulation reports zero tire cuts and zero
loaded gaps for all four cases. The production K2 geometry is unchanged in
all three qualities; the wheel change adds no triangles. The only exterior
mesh changes are road wheels, their suspension and track courses, and the
inboard knuckles. Existing turrets, hull armor and end wheels are retained.

Garage verification used the real country filter and vehicle cards, live
engine context, static batching and a cached return to XK2. The rendered
geometry buffers for all three moving wheel layers match production K2;
six wheels remain on each side. Served development version:
`v1.0.0+ge3e560ae0.dirty`. Production deployment is a separate action.

Validation passes: exact HIGH/LOW track and shoe clearance, HIGH/LOW/AI wheel
geometry regression, HIGH/LOW rough-ground turning, complete anatomy update
and check, marking receipts, all nine asset views, module alignment/hits,
centering, duplicate-track detection, muzzle/barrel checks, type checking
and private production build. Registered self-tests: the initial `npm test` pre-phase passed 405/406
files and correctly rejected the old XK2 assembly fingerprint. After the
independent geometry/unchanged-mesh review, only that requested rebuild's
fingerprint was updated; `sourceXFleet.selftest.mjs` then passed in isolation.
The remaining registered core and post phases passed 684/684 and 42/42.
Thus all 1,132 registered files have passing results for the final runtime;
the original failed invocation is retained rather than labeled a clean
single-command `npm test` pass.


The complete release command remains **failed**: K2B has eight enclosed
top-down cells at approximately x=-1.77, z=2.45 and no registered local GLB
for the mandatory fidelity stage. A fresh standard check on unchanged
`e3e560ae0` reproduces the same eight-cell opening. It also reports 2,452
band and 271 shoe intersections with the old interior fill; the refreshed
fill clears those completely in HIGH and LOW. The exterior sealed-ledger
check passes at 131 open pixels against its unchanged 133-pixel allowance.
No threshold, source target or qualification status was relaxed.

Publication authorization — 2026-09-22: owner explicitly approved deployment
of this wheel-only fix after confirming that integration preserves current
main. This scoped exception covers the inherited qualification issues above;
it does not change any geometry threshold or certify those issues as fixed.
The release integration starts from `14a3262ec` and keeps the newer terrain,
camouflage mapping and track-lane fill policy. Only the authored wheel patch
is carried forward; generated fills, anatomy and assets are rebuilt against
the current code. The final deployed revision is recorded in `docs/DEPLOYS.md`.

---

# K2B (`k2b`) — §5.299 resurrection packet

**Owner order (§5.299, verbatim):** "make our old pl-01 from before our
changes into a new K2B tank in korea"

**What this id is:** the pre-§5.248-wave PL-01 build — the K2-donor stealth
variant that shipped before the poland ground-up wave — resurrected as a NEW
Korean fleet id. It is NOT a new design round: geometry, spec deltas and the
marking seat are the old pl01's, re-flagged K2B / South Korea. The current
`pl01` (§5.267 ratified ground-up stealth build, hashgeo `d168fac4`) is
untouched and remains Poland's; this id coexists beside it.

## PROVENANCE / DONOR LINEAGE

- Source of truth (builder): `git show d7ba844f^:src/vehicles/profiles/poland.js`
  — `buildPL01(P) { buildK2(P); addPL01Package(P); }` plus the module helpers
  it used (`mount`, `cassette`, `addPolishWhips`, `addPolishRWS`).
- Source of truth (spec row): `git show d7ba844f^:src/vehicles/poland.js`
  — `pl01: variant('pl01', 'k2', {…})`.
- Donor: `k2` (buildK2 + spec, `src/vehicles/modern3.ts`). Donor drift check:
  buildK2 function body and the k2 spec row are **byte-identical** between
  `d7ba844f` (old pl01's last certified tree) and HEAD (diff receipts run
  2026-08-17), so the resurrection reproduces the certified geometry exactly.
- New home: `src/vehicles/profiles/korea.js` (`buildK2B` = verbatim old
  package; helpers `addPolishWhips`/`addPolishRWS` carried verbatim, renamed
  `addRoofWhips`/`addRoofRWS`) + `src/vehicles/korea.ts` (typed old
  variant machinery, nation `'South Korea'` — the donor's own nation string,
  one garage tab with k2/k1a1).
- Intentional deltas vs the old pl01 (identity only, zero geometry):
  1. baked hull number decal text `'PL-01'` → `'K2B'` (texture paint on the
     same quad — geometry-neutral, proven by the hash receipt below);
  2. spec identity: id `k2b`, name/number/displayName/shortName `K2B`,
     nation `South Korea`;
  3. tier IX (= k2's tier row).
- Everything else is the old row verbatim: digital scheme
  (#313b38/#47504a + patches, camoScale 0.36), dims 7.00/9.20/3.80/2.80,
  hp 2300, 1000 hp, 35.0 t, 70/30 km/h, traverse 44, pitch 36, reload 5.4 s,
  first shell renamed `DM63A1 APFSDS`, armorFactor 1.10 on the cloned k2
  plates. Donor rig (turretPivot/gunPivot/gunBarrel) = certified k2 clone,
  exactly as the old row inherited it.

## HASH RECEIPTS (tools/tmp-hashgeo.mjs, camoSeed 4242)

| id | hash | meshes | verts | verdict |
|---|---|---|---|---|
| **k2b** (this build, HEAD+wiring) | **13afe560** | 76 | 132434 | NEW baseline |
| pl01 @ d7ba844f^ (the resurrected source, worktree run) | 13afe560 | 76 | 132434 | **byte-identical** to k2b |
| pl01 (current, untouchable) | d168fac4 | 53 | 67259 | UNMOVED — hard gate pass |
| k2 (donor guard) | 99594568 | 63 | 117370 | UNMOVED — donor guard pass |

The k2b ≡ old-pl01 hash identity is the resurrection proof: the only
authored delta (decal text) lives in texture paint, not geometry.

## ORACLE STATE

**NO reference oracle.** MODEL_SOURCE procedural, **no geometry-gate row**
(§5.299 order: FALSE-0/photo-class law — never gate this id, and never wrap
k2's oracle onto it). Bar for future fidelity rounds = photo class.

## WIRING CHECKLIST (§5.287 — every touched file)

1. `src/vehicles/profiles/korea.js` — NEW: buildK2B (resurrected geometry),
   KOREA_PROFILES export.
2. `src/vehicles/korea.ts` — KOREA_IDS/KOREA_SPECS (typed variant
   machinery, South Korea), TANK_SPECS/MODEL_SOURCE/ALL_TANK_IDS
   registration.
3. `src/vehicles/tankFactory.ts` — `import './korea.ts';` (after poland.ts,
   before finalizeFirstPartyRoster, so the K2 donor rig exists first).
4. `src/vehicles/profiledProcedurals.ts` — KOREA_PROFILES import + spread
   into PROCEDURAL_PROFILES (builder reaches BUILDERS via the standard
   profile merge).
5. `src/vehicles/tier.ts` — `k2b: 9` (k2's tier).
6. `src/vehicles/tankLabels.ts` — LABEL_OVERRIDES row (displayName/shortName
   `K2B`, aliases `K2B Black Panther`, `Korean stealth K2`).
7. `src/vehicles/vehicleMarkings.ts` — `k2b: anchor('hull','left',0.44,
   0.61,0.26,1)` (the old pl01's proven seat on the faceted hull-side
   panels — same geometry).

## VERIFICATION (2026-08-17)

- `npm test` **green** at HEAD+this-wiring-only (clean worktree at 6b5b7cf3
  + the 7 files above; the live shared tree carried an unrelated foreign
  mid-edit WIP in profiles/leopard.ts — `frustum` ReferenceError in
  buildLeo2A4M — which fails the suite there independently of this lane).
  tier.selftest 115 tanks (k2b covered), vehicleMarkings.selftest 115
  anchors (k2b paint raycast seats on real armor), tankAssets.selftest 115
  (metadata + shadow-caster construction for every id incl. k2b),
  garageOrder/flags/matchmaking green.
- Garage receipt: KR tab card `IX K2B`, designation ROK-K2B, South Korea
  flag, BATTLE enabled; stats card shows the old deltas (2300 hp, 70 km/h,
  5.4 s, DM63A1 APFSDS).

## EVIDENCE

`shots/k2b/`: `garage.png` + six angles (`0_front_left`, `1_front_right`,
`2_side_left`, `3_side_right`, `4_rear_left`, `5_top_front`) — captured in
one cot-shots FIFO ticket (tools/tmp-afv-lockrun.mjs → tools/tmp-k2b-shots.mjs
+ tools/tmp-k2b-angles.html) from the clean HEAD+wiring worktree; all seven
frames eyeballed (full framing, K2B hull number legible on the flank panels).

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-08-17 | — | — | — | — | — | — | resurrection landing; no oracle, no gate row (photo-class law) |
