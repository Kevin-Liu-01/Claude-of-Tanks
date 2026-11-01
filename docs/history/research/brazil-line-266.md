# The Brazil line (release 266): batch contract

## Request and rulings

- Owner, 2026-10-29: "lets build brazil, not taiwan, and flesh it out with all its own tanks"; to this lane the same day,
  "EE-T1 Osório. use our tank generation specs" (with the M41 print attached: byte-identical, sha256 127ca9ed, to the print
  the Denmark lane registered as m41a3's oracle, so the M41C rides that builder).
- Main, 2026-10-29 (DECISIONS; proposal ~/cot-lanes/brazil-line-266-evidence/PROPOSAL.md): ten ids and tiers approved, the
  tree's two branches as drawn, markings and paint by era; wheeled vehicles out (the owner's own call); two heads.
  - Head A (this branch's first READY): the indigenous line, the tree, Brazil as a team country: x1_pioneiro I (root),
    x1a2_carcara I, tamoyo1 II, tamoyo3 III, osorio_p1 III, osorio_p2 IV.
  - Head B (as their lanes land): m41c_caxias I on the Denmark lane's M41 builder (its options hook, that lane's offer
    2026-10-29), leo1a1br I on item/leopard1-263's leo1a2a1, leo1a5br I after the Denmark leopard1Hull split, m60a3br I
    after the Pattons' patton.ts rewrite.
- Every id: a shaded blind photo-critic PASS and a distinctness critic; a photo packet per id.

## Research

~/cot-lanes/brazil-line-266-evidence/RESEARCH-lineup.md and RESEARCH-osorio.md, every figure cited. Best sources: E. C. S.
Bastos, "100 Anos de Blindados no Exército Brasileiro 1921-2021, Parte 2" (FUNCEB, Oct 2022) and "Carro de Combate EE-T1
Osório" (2003); Tanks Encyclopedia's Brazil articles (after Bastos); Forças Terrestres (2015); M. Nita (Poligon 2014, with
Jane's table). Findings: Brazil never fielded a modern MBT (the Leopard 1A5BR is current, kept to 2040; the VBC CC is an
RFI); the Centauro II, EE-9 Cascavel, EE-11 Urutu and Guarani are wheeled; "EE-T2" is an informal name, not a design.

## Nation

Brazil joins as a team country (src/sim/countries.ts: the west bloc, its allies the US, Germany and Italy first), with the BR
flag, en/zh names, the Garage's nation order and the Army's vehicle emblems by era (vehicleMarkings.ts, both plates printed
in Bastos 2022): the 1983-98 green plaque with the Southern Cross oval ('br-cruzeiro', the 1980s ids) and the coat of arms
from 1998 ('br-eb-arms', the country default); the surviving Osório P.1's own ring-and-oval emblem ('br-osorio', the 2015
and 2024 photographs). Wheel set (nationWheelSets.ts): the Bernardini and US-lineage hulls the
M60A3's cast spoke, the MBT hulls the Leopard 2 paired dish. Paints: the Army's two-tone bands and the 1980s three-tones.

## Ids (head A)

| id | packet | builder | per-id packet |
|---|---|---|---|
| x1_pioneiro | ccl-x1-pioneiro-20261029.json | profiles/bernardiniX1.ts ('x1') | docs/references/tanks/x1a2_carcara.md |
| x1a2_carcara | ccl-x1a2-carcara-20261029.json | profiles/bernardiniX1.ts ('x1a2') | docs/references/tanks/x1a2_carcara.md |
| tamoyo1 | mb-3-tamoyo-1-20261029.json | profiles/tamoyo.ts ('t1') | docs/references/tanks/tamoyo1.md |
| tamoyo3 | mb-3-tamoyo-3-20261029.json | profiles/tamoyo.ts ('t3') | docs/references/tanks/tamoyo1.md |
| osorio_p1 | ee-t1-osorio-105-20261029.json | profiles/osorio.ts ('p1') | docs/references/tanks/osorio_p2.md |
| osorio_p2 | ee-t1-osorio-120-20261029.json | profiles/osorio.ts ('p2') | docs/references/tanks/osorio_p2.md |

Registration lines for tools/photo-reference-policy.mjs PHOTO_REFERENCE_PACKETS go in once item/photo-packets-265 lands
(~/cot-lanes/brazil-line-266-evidence/photo-packet-registration.txt). Fixture: src/vehicles/profiles/brazil.selftest.mjs.

## Status

Built, registered, sealed (tank-sealed-check), fixture PASS; GPU sheets and the blind critics, the regeneration chain and
the lane gate in progress (TESTS-OWED.md, the Brazil line's section).
