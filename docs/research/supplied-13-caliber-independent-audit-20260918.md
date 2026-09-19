# Supplied13 main-weapon caliber audit — 2026-09-18

Read-only audit found **two pre-correction mismatches: Kurganets25 X30→57 mm and CV90 MkIV X35→50 mm**. The other11 agree with their supplied-study identity or an explicitly supported configuration. This is a nominal weapon-identity check; no new source geometry, bore rays, balance parameters or profile edits were made. British/Europe own the corrections and their subsequent proof.

The immutable pre-correction registry is `.qa-dev/tank-run/critic-complexity/spec-before.json`; private inventory, observed file hashes and copied source-contract inputs are in `.qa-dev/tank-run/independent-caliber-audit/`. Metadata values below describe that snapshot, not a claim that an active correction has finished.

| Supplied ID | Before | Source configuration | Verdict and binding |
|---|---:|---:|---|
| kurganets25_x |30|57|Mismatch: AW Epokha configuration has the short57mm weapon plus Kornet and Bulat; ordinary30mm Bumerang is a different configuration.|
| ztz100_x |105|105|Matches explicit owner/source-study OD ZTZ20 Test3 contract; no claim about a different real-world Type100.|
| fv510_milan_x |30|30|War Thunder Warrior MILAN source;30mm RARDEN and separate MILAN.|
| aft10_x |170|170|Matches eastern study's HJ10 missile-only contract, eight fixed canisters.170 is missile caliber, not a cannon aperture.|
| bmp3m_dragun125_x |125|125|Exact Dragun125 source name and eastern weapon contract; authored tube inner radius.0625m.|
| griffin50_x |50|50|Exact Griffin50mm AW source and packet; neither105mm Griffin variant nor Puma donor caliber.|
| kf41_lynx_x |35|35|Compatible with publisher's Wotan35 option; publisher also offers30mm, so identity alone does not uniquely prove which exported configuration was selected. Existing source packet/native35mm throat is consistent; no contrary source evidence found.|
| k21_x |40|40|Eastern source contract and40mm authored tube (.020m radius).|
| cv90_mkiv_x |35|50|Mismatch: exact supplied AW configuration is the50mm Bushmaster with paired launchers; current private throat was an authored35mm choice.|
| ajax_x |40|40|AW Ajax source is40mm CTAS; its local inherited CV90 label does not define caliber.|
| sabra_mk2_x |120|120|SabraMk2 source/publisher120mm IMI M253; authored.0598m fitted inner radius is not evidence for changing nominal120.|
| cv90105_tml_x |105|105|Exact TML105 source/packet; physical bore declaration.0525m radius.|
| type96b_x |125|125|Eastern source contract125mm; larger stylized source tube opening is not a different nominal caliber.|

## Independent source bindings

**CV90:** `src/vehicles/europeSourceStudyData.ts` binds `cv90_mkiv_x` to `cv90_mk.iv_armored_warfare.glb`, raw SHA-256 `d310fed791778e966ca70454df5e02614fdef95fe1768920fd140e369baeec0c`, canonical SHA-256 `29160cf92e8e2221cf8b441626f871104dafde6b3ef5a80d3ec91d1fe3c8649a`. The original publisher describes its in-game manned turret as50mm Bushmaster and names the paired SpikeLR launcher. This matches the study's turret/canister configuration. Inferring35mm from a generic real-world CV90 alternative contradicts that source identity. The pre-correction profile explicitly sets `inner=.0175` and the packet calls35mm a nominal gameplay datum, not a scalar-derived source caliber. Required narrow repair: caliber/shell metadata50 and actual native throat radius.025m, retaining the measured outer brake and source frame; prove the resulting wall, rim, backstop and inner clearance before refreshed qualification. [Publisher CV90 article](https://armoredwarfare.com/en/news/general/development-cv90-mkiv).

**Kurganets:** the publisher explicitly distinguishes the original30mm Bumerang configuration from its short57mm Epokha game configuration, whose visible companion systems are Kornet and Bulat. The captured source/native layout has the short tube, lateral large launchers and separate bank of small launch tubes, so the Puma30mm inheritance is inappropriate. The publisher does not establish an exact Bulat caliber (it gives an estimate); do not turn a fitted gameplay value into a source-measured claim. Correct the actual three weapon channels rather than only the display name. [Publisher Kurganets article](https://armoredwarfare.com/en/news/general/development-kurganets-25).

**Other publisher crosschecks:** the KF41 prototype explicitly offers30 and35mm guns with no ATGM launcher; the current35mm selection is supported. Ajax is explicitly40mm CTAS. The supplied Warrior filename identifies War Thunder, whose current Warrior page identifies the30mm RARDEN configuration; SabraMk2's publisher describes the120mm gun. [KF41](https://armoredwarfare.com/en/news/general/development-kf41-lynx-prototype), [Ajax](https://armoredwarfare.com/en/news/general/development-ajax), [Warrior](https://wiki.warthunder.com/unit/uk_fv510_isv), [Sabra](https://armoredwarfare.com/en/news/general/discounts-sabra-mk2-and-marder-2).

The eastern boot-light weapon contracts explicitly record AFT170, Dragun125, K2140 and Type96B125. Griffin50 and TML105 are also bound by their exact supplied filename/packet identity. ZTZ105 remains the explicit study/owner contract. Physical source brake apertures can exceed nominal barrel caliber; neither a stylized muzzle opening nor a donor name alone establishes a different weapon. No additional actionable nominal-caliber discrepancy was established in those11 IDs. Fresh correction hashes, physical proof, final generated records and independent visual review remain separate tasks.
