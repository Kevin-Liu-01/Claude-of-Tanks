# Native-only runtime provenance audit

Date: 2026-08-11

## Authoritative rule

Every playable vehicle is built from this repository's authored procedural
primitives, family builders, fittings and native running-gear system. A local
comparison GLB may inform silhouette, proportions and station semantics only.
It may not be registered as playable geometry, converted into JavaScript
geometry, baked into a profile, or credited as the runtime vehicle.

## Machine-enforced result

`npm run tank:native:check` loads the complete registered fleet through the
runtime factory and rejects:

- any playable whose `MODEL_SOURCE.source` is not `procedural`;
- source-geometry modules or imports in playable code;
- any playable builder map wired through a `Source`/`OwnerSource`-labelled
  implementation, even when `MODEL_SOURCE` still claims `procedural`;
- recovered/local runtime switches that have been re-enabled; and
- missing runtime builders.

Current receipt:

```text
Native-playable provenance audit PASS: 108 battle playables,
0 GLB-sourced, 26 isolated comparison candidates.
```

The public-build strip/probe independently reports 50 playables,
0 GLB-sourced and 23 comparison-only `candidateGlb` prints. Candidate files
are stripped from the public artifact and never become runtime geometry.

## Restored native builders

The exact-source/baked wrappers have been retired for:

- Leopard 2A4, Leopard 2A6, Leopard 2A7V and Leopard 2 Revolution;
- Type 10;
- T-80U;
- T-14 Armata;
- AMX-40;
- FV510 Warrior.

Their active mappings now resolve to our pre-existing or rebuilt native
procedural builders. The corresponding `*-source-geometry.js` modules and
source-bake scripts were deleted. Challenger 1, Ariete, the T-72/T-80/T-90
families and the rest of the fleet were also audited through the same factory
path and remain native.

## Family restoration and ordering

`src/vehicles/fleetOrder.js` makes registration order irrelevant. It keeps the
Soviet modern line (T-62/T-64, the explicit T-72 family, the explicit T-80
family, then the explicit T-90 family), Leopard progression, Challenger
progression and Japanese MBTs contiguous and ordered. The T-72, T-80 and T-90
subfamilies retain their own turret/protection identities while sharing the
native six-road-wheel/course convention. `npm run tank:family:check` enforces
both the sequences and a six-station geometry receipt for every listed
variant. The staged default battle selects `TANK_IDS` explicitly rather than
depending on garage order.

## Visual work remains open

Native provenance is a floor, not a fidelity waiver. Restored vehicles are
being reworked and re-certified from fresh procedural renders. Leopard,
Type 10, T-90M Proryv and FV510 now have fresh native-only receipts. T-14 and
T-80U remain the open provenance re-certifications; AbramsX and the broader
Challenger/Ariete presentation set remain owner-priority quality audits. Old
scores and freeze hashes for changed geometry are historical until replaced
by fresh paired and yaw evidence.
