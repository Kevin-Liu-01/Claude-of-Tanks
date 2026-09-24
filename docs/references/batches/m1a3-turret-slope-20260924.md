# M1A3 turret side slope and cheek-cap removal

Owner target: the September 24 Gallery annotations select both complete
front cheek caps in `turretExternalArmor` (local X ±0.44–1.57 m,
Y -0.015–0.72 m, Z 0.91–2.13 m). Remove those closed additions and
increase the inward slope of the structural turret sides, then reseat the
surrounding equipment. The side annotations select a reshape, not holes.

The upper shell edge moves from ±1.42 m to ±1.15 m; the existing lower
shoulder remains ±1.60 m. Both cheek and bustle sides follow this taper.
The exposed 50 mm turret ring, pitching mantlet, gun pivot, recoil, and hull
fender closures retain their existing geometry and articulation.

Side armor cassettes follow the new rake with embedded inner faces.
Roof fittings, lifting eyes, antennas, sensor bases, service cases and
canvas stowage move onto receiving stock; the bustle cage narrows and its
shelves connect to the side armor. The autoloader casing has tapered sides,
and its six blow-off covers fit the narrower roof. Equipment stays in its
existing semantic buckets; no frame-loop work or material is added.

Implementation and evidence are isolated in
`codex/leopard-improved-width-20260924`, based on `256feb115`.
The shared dirty checkout is untouched. This also contains the owner's
separate 10% frontal-width reduction for `leo2a7v`; the independently
authored `leo2a7v_x` is a preservation control.

Evidence is under `.qa-dev/leopard-width/`: `m1a3-upgrade-final.log`
checks actual receiving-stock rays, cap absence, bilateral side slopes,
ring clearance and the full mantlet/yaw/recoil sweep at HIGH and LOW.
`turret-final/` contains native Gallery angles and articulated poses.
`anatomy-release-final.log` records the required anatomy refresh/check
and targeted release attempt. A log is only a passing receipt when the
command completes successfully; composed reference failures remain failures.
M1A3 has no supplied comparison reference, as explicitly confirmed by the
owner earlier in this task; no source-fidelity certification is claimed.

## Completed validation

- HIGH/LOW M1A3 cap-removal, side-slope, equipment-stock, bearing, mantlet
  sweep and recoil tests pass. The concept/stat contract and type check pass.
- Native Gallery front, side, rear and elevated/depressed gun views pass
  visual review with no browser errors. The actual garage passes cold
  selection, switching to M1A2 and returning to the cached M1A3, plus gun/yaw
  poses, with no browser errors (`m1a3-garage-final/`).
- Anatomy and marking receipts are current for all 192 tanks. The anatomy
  test checks 4,580 closed collision cells; the module probe reports zero
  failures and zero outside-envelope modules. The initial final asset step
  found a stale M1A3 camera projection; regenerating its presentation record
  and images fixes it. The repeated asset step passes all 576 technical files.
- Both tanks pass the existing sealed-body gate. Leopard's strict HIGH/LOW
  moving-track audit reports zero band, shoe and suspension-sweep overlaps.
- The final public production build passes. The broad source-comparison
  release gate remains failed: Leopard's registered comparison GLB is absent
  from this checkout, and M1A3 has no supplied comparison model. The failed
  attempt is retained locally, and it does not replace the older certified
  ledger receipt or certify these new proportions against an old source.

Generated per-tank changes are limited to `m1a3` and `leo2a7v`; unrelated
vehicle rows remain unchanged. These edits are local and have not been pushed.
