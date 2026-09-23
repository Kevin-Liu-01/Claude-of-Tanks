# Fleet internal-anatomy evidence

Last reviewed: 2026-08-26

## Scope and honesty boundary

The playable fleet has an explicit entry in
`src/vehicles/internalLayoutRegistry.ts`. Each entry identifies its crew roster,
crew owner frame and station band, powerpack/transmission end, ammunition form,
and any autoloader, weapon feed, or missile stowage. The registry is consumed by
combat anatomy, Gallery diagnostics, and the kill cam; it is not a decorative
catalog disconnected from runtime behavior.

Public sources rarely publish safe, dimensioned interior CAD. Accordingly:

- `documented` means the operator, manufacturer, or technical manual publishes
  the relevant crew/system topology.
- `published-demonstrator` means the represented vehicle is a public technology
  demonstrator rather than an in-service production configuration.
- `platform-inferred` means the placement band follows the documented parent
  platform or closely related variant, while exact classified hardpoints are not
  claimed.
- `owner-directed` is reserved for fictional or intentionally speculative game
  vehicles. It must not cite a real source as proof of a fictional interior.

Positions are therefore honest compartment bands fitted inside the exact
procedural hull/turret receipt, not invented millimetre coordinates. The fleet
selftest requires exact 122-ID coverage, validates every source identifier,
checks crew topology and owner frame, and checks front/rear/turret system
placement.

## Primary evidence set

| Platform | Evidence used | Runtime consequence |
|---|---|---|
| Leopard 1/2 | [Bundeswehr Leopard anatomy](https://www.bundeswehr.de/de/meldungen/64-tonnen-kampfkraft-leopard-2-bundeswehr-5569556) and [variant overview](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/kampfpanzer-leopard-versionen-bundeswehr) | Four crew, manual loader, rear powerpack, hull/bustle ammunition form. |
| Abrams | [U.S. Army Weapon Systems Handbook](https://www.army.mil/e2/downloads/rv7/2020-2021_Weapon_Systems_Handbook.pdf) and [Army Armor ammunition-rack discussion](https://www.benning.army.mil/Armor/eARMOR/content/issues/2005/SEP_OCT/ArmorSeptemberOctober2005web.pdf) | Four crew, gas turbine powerpack, blow-off bustle racks. |
| Bradley | [TM 9-2350-252-10-2 scan](https://www.scribd.com/document/647553432/M2-Bradley-M3-Turret-Operators-Manual-TM-9-2350-252-10-2-1984) | Front powerpack, three vehicle crew, turret feed, internal TOW stowage. |
| T-72/T-90/PT-91 | [T-72B technical manual](https://djvu.online/file/9mQtcIE6pVd0Q), [Indian MoD autoloader cell](https://www.ddpmod.gov.in/en/resources/products/cell-t-72-t90-tanks), [Rosoboronexport T-90S](https://roe.ru/pdfs/pdf_6184.pdf), and [Bumar PT-91](https://bumar.gliwice.pl/en/strefa-militarna/o/czolg-pt-91a-twardy) | Three crew and low AZ-style carousel/cassettes; T-64/T-80 derivatives retain a distinct MZ-basket form. |
| KF51 | [Rheinmetall KF51 brochure](https://www.rheinmetall.com/Rheinmetall%20Group/brochure-download/Vehicle-Systems/B405e0524-Panther-KF51-main-battle-tank.pdf) | Three basic crew, no fictional loader, 20-round bustle autoloader. |
| K2 | [Hyundai Rotem K2](https://www.hyundai-rotem.co.kr/en/business/defense/details.do?productNm=K2+Main+Battle+Tank) | Three crew and bustle autoloader. |
| Type 10/90 | [Japan MoD Type 10 evaluation](https://www.mod.go.jp/j/approach/hyouka/yosan_shikko/2018/04.pdf) | Three crew and bustle autoloader. |
| Leclerc | [KNDS Leclerc XLR](https://knds.com/en/products/systems/leclerc-xlr) | Three crew and 22-round automatic bustle magazine. |
| Challenger | [British Army Challenger 2](https://www.army.mod.uk/learn-and-explore/equipment/combat-vehicles/challenger-2/) | Four crew, manual loader, separated two-part ammunition visual form. |
| Ariete | [Italian Army Ariete](https://www.esercito.difesa.it/equipaggiamenti/veicoli-blindati-e-corazzati-da-combattimento/veicoli-da-combattimento/carro-armato-ariete/81543.html) | Four crew, front driving station, rear powerpack, manual loading. |
| Merkava | [IDF Merkava history](https://www.idf.il/en/mini-sites/training-and-preparation/the-merkava-celebrates-35-years-of-service-in-the-idf/) | Four crew, front powerpack, rear individual ammunition canisters. |
| Puma | [Bundeswehr Puma technical overview](https://www.bundeswehr.de/de/organisation/heer/aktuelles/schuetzenpanzer-puma-technischer-quantensprung-5037928) | Commander, gunner, and driver in hull; unmanned turret feed; front powerpack. |
| Marder | [Bundeswehr Marder](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/landsysteme-bundeswehr/schuetzenpanzer-marder) | Front powerpack, driver beside it, two turret operators. |
| Warrior | [British Army Warrior](https://www.army.mod.uk/learn-and-explore/equipment/combat-vehicles/warrior/) | Three vehicle crew, front powerpack, two-person turret. |
| BMP-3 | [Rosoboronexport BMP-3](https://roe.ru/pdfs/pdf_4442.pdf) | Rear powerpack, 22-round conveyor plus non-mechanized racks and missile stowage. |
| Type 89 IFV | [JGSDF Type 89](https://www.mod.go.jp/gsdf/equipment/ve/?modal-index=3%2F) | Three vehicle crew and explicitly front-mounted engine. |
| Strv 103 | [Saab Strv 103 history](https://www.saab.com/newsroom/stories/2019/may/artillery-pieces-and-combat-vehicles) | All crew and loading mechanism in hull; fixed-gun magazine and front twin-powerplant form. |
| Tiger/Panther | [Tiger manual translation](https://www.fichier-pdf.fr/2017/05/01/manuel-tiger-i/) and [Panther manual/load-plan index](https://www.panther1944.de/index.php/en/?id=23&view=category) | Five-person crews, radio operator/bow position restored, rear engine and front final drive. |

The complete source manifest, including source kind and stable identifiers used
by runtime records, lives next to the exact fleet mapping in
`src/vehicles/internalLayoutRegistry.ts`.

## Visual-form contract

The shared `internalAnatomyVisuals.ts` builder distinguishes bustle racks,
individual canisters, hull bins, AZ/MZ carousels, bustle and fixed-gun loaders,
dual weapon feeds, missile tubes, diesel/twin/gas-turbine powerpacks, and
transmissions. Crew are articulated seated figures with head, helmet, torso,
shoulders, arms, thighs, and shins. Gallery adds the dashed diagnostic surface;
the kill cam supplies damage-state materials to the same meshes.
