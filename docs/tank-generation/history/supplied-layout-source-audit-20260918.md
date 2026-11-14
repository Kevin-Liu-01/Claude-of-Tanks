# Supplied vehicle layout source audit — 2026-09-18

Read-only review of `internalLayoutRegistry.ts` entries `suppliedUnmannedIfv`,
`suppliedMissileCarrier`, and `suppliedFrontAutoloader`. This is evidence for
coarse platform inferences, not an interior dimensional survey. No runtime file
was changed by this review.

The empty source arrays explain the anatomy source-trail failure. Adding links
alone is insufficient for Griffin: its current shared entry also assigns a third
crew station and missile storage unsupported by the exact supplied variant.

## Minimal usable sources

| Suggested source key | Source and provenance | Supports | Does not establish |
| --- | --- | --- | --- |
| `awKurganetsStudy` | [Armored Warfare — In Development: Kurganets-25, 2020-10-28](https://armoredwarfare.com/en/news/general/development-kurganets-25), `source-model-publisher` | Front-mounted engine; driver, commander and gunner; remotely operated turret. Its discussion distinguishes the earlier 30 mm system from the game's short 57 mm/Epokha configuration. | Exact crew stations, powerpack envelope, internal armor thickness or ammunition/feed routing. |
| `gdGriffin2018Interview` | [GD's Mike Peck interview at AUSA 2018, 2018-10-09](https://defaeroreport.com/2018/10/09/gds-peck-on-current-and-future-combat-vehicles/), `manufacturer-interview` | Griffin **III** IFV demonstrator, 50 mm turret, two crew and six passengers; Ajax-derived engine/transmission/suspension. Peck explicitly distinguishes this from Griffin I's MPF role and notes future two-versus-three crew requirements were undecided. | Exact crew coordinates; proof that every future Griffin/XM30 configuration has the same layout; detailed powerpack placement or ammunition container shape. |
| `awGriffin50Study` | [Armored Warfare — In Development: Griffin 50mm, 2019-09-24](https://armoredwarfare.com/en/news/general/development-griffin-50mm), `source-model-publisher` | Exact game IFV identity and 50 mm autocannon; explicitly lacks ATGM armament. | Exact internal stations or a third crewmember. |
| `awAft10Study` | [Armored Warfare — In Development: AFT-10, 2018-09-24](https://armoredwarfare.com/en/news/general/development-aft-10), `source-model-publisher` | Modified ZBD-04A hull; commander, driver and missile operator; operator under launcher in hull; two groups of four external missiles on traversing launcher. | Exact left/right stations, front engine envelope or a hidden reserve missile magazine. The article distinguishes eight externally replenished real-world missiles from its game's extra ammunition. |
| `awDragun125Study` | [Armored Warfare — In Development: BMP-3M Dragun, 2016-07-29](https://armoredwarfare.com/en/news/general/development-bmp-3m-dragun), `source-model-publisher` | Front engine; three-person crew. The **125 mm BM 125** configuration is expressly manned, with commander and gunner in turret, and an automatically loaded 2A75. The 100+30 mm and 57 mm versions are described separately as unmanned. | Exact carousel position, isolation, blast separation, rack dimensions or driver lateral station. |

The game publisher is a primary source for the supplied game-model identity and
its described configuration, **not a manufacturer or operator interior manual**.
Retain `platform-inferred` confidence and that distinction in source kinds/titles.
The search did not locate a manufacturer interior drawing for these supplied
Kurganets, AFT or Dragun exports. Do not label these links as manufacturer proof.

## Recommended narrow integration

1. Give Kurganets its own entry sourced by `awKurganetsStudy`. The current broad
   three-hull-crew/front-powerpack/unmanned-turret arrangement is supportable as
   an inference. Lateral station names and all internal dimensions remain
   authored approximations. The source's 57 mm configuration does not by itself
   support the inherited `dualBeltFeed` description.
2. Split Griffin out of `suppliedUnmannedIfv`. Use the manufacturer interview and
   exact `awGriffin50Study` together. Prefer two functional crew stations (driver
   and commander/weapon operator), with hull placement explicitly inferred,
   and remove its missile rack. Do not silently attach Kurganets-specific sources
   to Griffin. Its supplied exterior is a 50 mm IFV, not the earlier 120 mm MPF
   Griffin or Griffin II/Booker.
3. Attach `awAft10Study` to the missile-carrier entry. The external launcher and
   hull weapon-operator arrangement are supported; three exact hull coordinates
   are not. Front powerpack/final-drive positions remain chassis/exterior
   inferences. Keep eight canisters external; no inferred extra internal rack.
4. Attach `awDragun125Study` to the front-autoloader entry. Current hull driver
   plus turret gunner/commander agrees with the described 125 mm model. Replace
   or explicitly qualify the unsupported `isolatedCarousel` claim: the article
   establishes automatic loading, not isolation or precise storage geometry.
   Do not cite the ordinary rear-engine BMP-3 manual as evidence for Dragun's
   front-engine arrangement.

## Source conflict retained

[AW's earlier general Griffin history](https://armoredwarfare.com/en/news/general/development-griffin)
uses two-man-turret wording, yet also states two total crew. It does not reconcile
those statements. The direct manufacturer interview establishes the demonstrator's
two-person total but does not map its crew into exact interior stations. The
[manufacturer's 2018 announcement](https://www.gd.com/Articles/2018/10/04/general-dynamics-ausa-2018-accelerating-innovation-advance-us-army-s-mission)
only establishes a modular turret and multiple possible crew configurations;
search-index text was available, while direct retrieval returned HTTP 403.
Do not use that broad release as proof of three particular hull positions.

## Local evidence limits

The existing packets `docs/references/tanks/{kurganets25_x,griffin50_x,aft10_x,bmp3m_dragun125_x}.md`
identify the owner's supplied GLBs and frozen hashes. All are external studies
with generic material groups and no trustworthy recovered crew/module hierarchy.
Their measured outer hull, hatch, deck and turret datums can constrain an inferred
placement envelope; they cannot certify concealed crew positions, armor partitions,
feeds or ammunition isolation. Exact-source target conflicts already recorded in
those packets remain unchanged by this audit.

## Authorized metadata follow-up

After the read-only audit, the integrator requested the bounded registry fix.
`internalLayoutRegistry.ts` now contains the five source records above. Griffin
has a separate two-hull-crew entry using the existing `driver` and `gunner` damage
roles; the latter represents its combined commander/weapon operator. It has no
missile rack. Kurganets uses an explicitly inferred automatic feed. Dragun keeps
its manned turret and uses generic hull ammunition/automatic-loader forms,
without claiming an isolated carousel. All four retain `platform-inferred`.

The renderer's generic hull-ammunition and autoloader branches were checked in
`internalAnatomyVisuals.ts`; no rendering code change was needed. Registry-only
metadata assertions in `internalLayoutRegistry.selftest.mjs` and project type
checking pass. The integrator owns the subsequent generated anatomy/card refresh
and full anatomy/release checks. No exterior profile or shared specification was
changed by this follow-up.

Registry SHA-256: `225ae432ac66dc14d8648fe61329f4389816c711a4d5d0ebac04673fdef6284a`.
Focused test SHA-256: `859ffc17b68bfb9a3edab9c61551ecde08b2fc7348b4d22fbdbb5a0cdc449e03`.
