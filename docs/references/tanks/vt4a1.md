# vt4a1: VT-4A1 turret (release 276, cn-turrets-276, 2026-11-24)

Kevin, 2026-11-24: "clean up and redesign the vt 4a1 ztz 99a2 and ztz99a turrets which are a little messy esp with
cheeks, and need to be redesigned."

The hull is the ZTZ-99A2's (one shared builder, unchanged). The turret is lofted as one closed solid from its plan
outline (`src/vehicles/profiles/chineseTurretOutlines.ts`; the mechanism and receipt are in ztz99a2.md, release 276).
The VT-4A1 Baihu (`vt4a1_baihu`) carries the Longwei turret, not this one, and is unchanged.

**Photographs** (reference only, never shipped): Wikimedia Commons "NORINCO VT-4 at IDEX 2017.jpg".

| # | Region | Photo read | Baseline (was) | Fix (now) |
|---|---|---|---|---|
| 1 | Cheek plan | Flat-faced welded box modules. The front stands nearly square to the bore, and a 45-degree chamfer turns the outer corner to the vertical side wall. | Leopard-2A6-style chevrons swept from the throat to the shoulder. | Outline tip (0.41, 1.70), front corner (1.22, 1.62) (5 degrees), chamfer to the side wall at (1.58, 1.26). |
| 2 | Cheek section | A tall vertical face with a narrow bevel along the top front edge and an undercut chamfer along the bottom one. | A chevron section (upper and lower faces meeting at a ridge). | Undercut 0.155 to 0.255 (9 cm back), a vertical face to 0.60, and a 13 cm top bevel to the 0.76 roof. |
| 3 | Panels | Bolted modular panels with vertical seams, three across each front, bolt heads visible. | Four thin cassettes per side along the chevron. | 8 closed panels (three per front, one per chamfer), 18 mm seams, two bolt heads each. |
| 4 | Roof | A flat roof with sights, a hatch and warning heads. | A loft crown with a separate roof bridge slab. | A flat 0.76 roof (the old bridge top), every fitting seated. |
| 5 | Smoke launchers | On the side walls behind the modules. | At x 1.18 on the old chevron shoulder, inside the new module. | On the side walls at x 1.66, z -0.30. |
| 6 | Joins | One welded volume. | Shell, bridge, chevrons and cassettes crossing. | One solid; the module faces are the shell's own faces. |
