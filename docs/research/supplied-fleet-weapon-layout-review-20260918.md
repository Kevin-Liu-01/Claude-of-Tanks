# Supplied fleet weapon and internal-layout review — 2026-09-18

The final integration review found two classes of metadata defects that were
independent of the exterior geometry scores.

K21's source study and native turret both contain a two-canister launcher, but
its inherited CV90 loadout had no guided channel. K21 now keeps the40mm APFSDS
and HE channels and replaces the redundant second APFSDS choice with two guided
rounds. The missile uses the established Type89 gameplay tuning and a generic
name; this does not assert a researched missile model or real performance.
It retains separate cannon/launcher inventory and reload channels. The exact
source turret/gun frames and balance peers are unchanged. The new loadout has
a focused real combat-state/selector test, including depletion and repeated
metadata synchronization.

Warrior MILAN, K21 and the supplied CV90 Mk.IV now have explicit
`platform-inferred` launcher layouts. Their measured exterior source packets
establish launcher presence; they do not establish hidden reserve stowage,
classified dimensions or exact feeding mechanisms. The anatomy registry
therefore specifies generic turret launcher ready rounds and inferred cannon
feed. This avoids relying on the legacy missile inference's reload-time floor,
which omitted damageable missile modules on short-cycle IFVs. Gun-only source
variants and unrelated older layouts remain unchanged.

CV90105 TML previously inherited a rear-engine layout from a conventional MBT.
Its dedicated inferred layout now has a front powerpack and transmission,
a hull driver and three turret crew, with manual loading. The source-model
publisher describes the CV90 chassis, four-person crew, manual105mm gun and
hull/turret ammunition stowage; the front powerpack placement follows the CV90
platform and remains explicitly inferred. The same article's separate game
balance section invents a clip autoloader, which is not used as evidence for
the vehicle's mechanism. [Source-model publisher's configuration account](https://armoredwarfare.com/en/news/general/development-cv90105-tml).

All four changed anatomy rows require fresh calibration/marking receipts and
technical diagrams before release. Exterior model triangles and suspension
positions are not changed by these metadata corrections. The batch packet
records their final integrated tests and generation status.
