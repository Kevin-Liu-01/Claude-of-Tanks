# Magach 7C (`magach7c`) — reference packet

## Current status (release 267, 2026-10-29): a new Israeli M60

Owner, 2026-10-28: "for the m60 new variants, lets add the: * Magach Series (Israel) ... (Magach 6 and Magach 7
families) ... which look crazyyy". Built as the `magach7c` mark of `src/vehicles/profiles/pattonCast.ts`
(`buildM60CastSteps`) on the M60A1's measured hull and turret casting ([m60a1.md](m60a1.md)); spec
`src/vehicles/m60VariantSpecs.ts`, a clone of the M60A1 sharing its package with the 7C's armour factor and the
AVDS-1790-5A's 908 hp (fleetBalancePass). Israel's special line at II. Implementation: first build; blind critics and
the release check pending.

Stage A (Main, 2026-10-31): no 3D model exists for this mark, so it passes stage A through the Latrun photo packet
(`docs/references/photos/magach-latrun-20261031.json`, `tools/photo-reference-policy.mjs`), proved by
`src/vehicles/profiles/pattonCastProportions.selftest.mjs`. Its round-18 blind photo critic scored 7/10.

Exact vehicle: the IDF's **Magach 7C** of the late 1980s and 1990s: the M60 turret under flat passive armour modules,
a plate over the upper glacis, deep bolted side skirts, the low Urdan cupola with the commander's .50, the 105 mm M68
in its thermal sleeve, as the Yad la-Shiryon (Latrun) museum tank.

### Sources

| Key | Source |
|---|---|
| Latrun | Wikimedia Commons, User:Bukvoed: Magach-7-latrun-1..4 (CC BY 2.5), Magach-7-latrun-5 (CC BY 3.0; dozer blade not drawn) |
| Field | Wikimedia Commons: Magach-7c-055 (CC BY-SA 3.0), Magach7tank, IDF Magach Merkaz (public domain), Tanks in Gilo, Operation Defensive Shield 45/91 (CC BY-SA 3.0) |
| 7A | Wikimedia Commons: Idf m60 magach 7a 1990 (CC BY-SA 4.0), the Magach 7A drawing: layout only |
| Local copies | `~/cot-lanes/m60-variants-refs/magach7c/` (reference only; never shipped), `SOURCES.md` there |

### Differences from the M60A1 build

| Item | Source | Build |
|---|---|---|
| Turret armour | flat bolted modules: a wedge each side of the gun ahead of the mantlet raked back to the cheek's corner, the flank modules back to the bustle, a flat top a little under the roof (Latrun) | `m60Magach7Armour`: one prism a side, walls leaning in 0.10 m, front faces leaning back 0.28 m, two rows of bolts; a plate over the roof's front |
| Glacis | a thick plate over the upper glacis between the light groups (Latrun front) | `m60Magach7Hull`: 1.34 x 0.78 x 0.11 m with its bolts |
| Skirts | deep skirts of five bolted panels a side hung on the fenders' lips, their fronts raked over the idlers (Latrun side) | `m60Magach7Hull` |
| Cupola | the low Urdan cupola with the commander's .50; the loader's MAG on its post (photographs) | `m60UrdanCupola` |
| Gun | the M68 in its thermal sleeve and clamp bands (photographs) | the A3's sleeve |
| Stowage | the large IDF wire basket round the bustle (Latrun rear) | the A1's rack with four rails and its mesh |
| Rangefinder | its ends covered by the armour | the blisters left off |

### Not drawn

The smoke dischargers' exact pattern (unclear in the photographs) and the crew's stowage.
