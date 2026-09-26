# Dardo, LRMV Lynx and Borsuk — photographic reconstruction

Qualification boundary: photographic reconstruction. Numerical 3D comparison is unverified for all three; no exact 3D inputs were supplied.

The owner requested these three vehicles using the attached photographs on 2026-09-25. Each is a separate selectable first-party procedural vehicle. No photograph or third-party mesh is loaded as playable geometry. Game armor, HP, reloads and penetration are balance abstractions, not claims about real protection or combat performance.

| ID | Target and equipment | Chassis and crew |
| --- | --- | --- |
| `dardo` | Production Dardo with HITFIST 25 mm and coaxial 7.62 mm. The supplied image has no fitted optional TOW battery; none is invented. | Independent low Italian hull, six road wheels, three vehicle crew with two in the turret. |
| `lrmv_lynx` | Early Italian LRMV Lynx with Lance 30 mm and coaxial machine gun. Later Hitfist deliveries are a separate configuration. | Explicit KF41 chassis reuse, separate Lance turret, three crew. Italy's existing national wheel-face standard remains in force. |
| `borsuk` | Polish Borsuk with ZSSW-30, 30 mm, coaxial 7.62 mm and twin Spike LR. | Independent amphibious hull, six wheels, three crew in the hull, remote turret. |

LRMV is based on Lynx KF41, not Puma. Rheinmetall's 27 January 2026 delivery statement identifies the first four Italian vehicles as KF41 with Lance 30 mm. The second supplied photograph is a KF41 family view; it is not by itself proof of the Italian vehicle's exact equipment. The manufacturer's dated statement resolves that identity.

## Sources and dimensions

- [CIO Dardo brochure](https://www.iveco-otomelara.com/wp-content/uploads/2024/10/Dardo-AIFV-ATGM.pdf): 6.71 m length, 3.10 m width including fenders, 1.75 m hull roof, 2.61 m turret height, 0.40 m ground clearance, 23 t, 520 hp, 70 km/h; 25 mm KBA, coaxial 7.62 mm, eight smoke tubes, −10°/+60°. The ATGM configuration is optional.
- [Italian Army Dardo](https://www.esercito.difesa.it/equipaggiamenti/veicoli-blindati-e-corazzati-da-combattimento/veicoli-da-combattimento/vcc-dardo/81621.html).
- [Leonardo/Rheinmetall first Italian delivery](https://www.rheinmetall.com/Rheinmetall%20Group/Presse/News/Documents/2026/01/2026-01-27-leonardo-and-rheinmetall-hand-over-first-lynx-infantry-fighting-vehicles-to-italy.pdf): KF41, early Lance 30 mm, later Hitfist 30 mm.
- [HSW Borsuk product](https://www.hsw.pl/produkty/nowy-bojowy-plywajacy-woz-piechoty-borsuk/) and [HSW MSPO summary](https://www.hsw.pl/en/news/huta-stalowa-wola-s-a-at-mspo-2019-summary/): amphibious Borsuk, ZSSW-30, Spike.
- [Polska Zbrojna Borsuk report](https://www.polska-zbrojna.pl/home/articleshow/39148?t=Borsuk-idzie-do-linii): published 7.6 m body length and 3.4 m width.

[Photographic target packet](../photos/ifvs-20260925.json) separates published dimensions from reconstructed weapon/antenna envelopes. Estimated hidden surfaces do not become measured source geometry. The standard gate keeps the 3% declared dimensional tolerance, HIGH/LOW stock and articulation, zero unexplained openings, strict animated track clearance, physical roof-equipment census, muzzle/launcher probes, anatomy, assets, full tests and build. It records the numerical 3D comparison as **unverified**, not N/A, a fabricated score or a concept exemption.

## Native mechanics

Borsuk's twin Spike terminals are at turret-local `(1.34, 0.545/0.795, 0.91)` metres. They follow turret yaw independently of the cannon's pitch. The canisters, cradle and side housing use the same weapon-stock tagging as the existing missile fleet, so generated anatomy can link impacts to the weapon modules. Smoke dispensers are equipment, never offensive missile origins.

The LRMV shares only the explicitly KF41-derived hull and suspension. The common chassis function does not construct a turret. Removing a redundant German wheel-pattern override allows the existing nationality resolver to select Italy's owner-approved wheel construction without changing the original KF41's default.

The existing KF41 control was built before and after this extraction in HIGH
and LOW. Mesh hierarchy, transforms, geometry attributes, indices and instance
matrices have identical SHA-256 digests in both versions (42 HIGH meshes and
41 LOW meshes). Evidence: `.qa-dev/ifv-identity/kf41-parity.log`.

## Release requirements

Publication requires final anatomy/marking/asset validation, module alignment, the complete release check, and exact-commit integration onto current main with a normal push. Completed physical and visual checks are recorded below; they are not a deployment claim.

## Owner image intake

Local comparison-only files, retained by the owner; not shipped to players:

- `dardo`: `codex-clipboard-b4129a19-ae07-4668-90e6-fbe44e1cbc90.png`, SHA-256 `1529f7d8f2c36eb93c7cab8a98886635d592f8f60cdd626541544f18799a4b50`.
- `lrmv_lynx`: `codex-clipboard-da354667-f46d-42eb-928c-1aa172876d62.png`, SHA-256 `1ba1ca0a67ecc0d22628a917e75339e64b5f3819a2847eccf8ff6d62bd828cb2`.
- `borsuk`: `codex-clipboard-70d3f754-10e8-4ee8-85f5-3c443eadf31e.png`, SHA-256 `dc4c7559bf8a270d3028541c8a5431f8b4773ae595dfc876a6af00adbd7961df`.

## Continuation checkpoint

The owner's handed-off continuation was reviewed and integrated. Dardo remains
modern; LRMV and Borsuk use the next-generation balance bracket of their actual
KF41/2020s design peers. Borsuk's Spike velocity is explicitly 180 m/s as a game
parameter. Roster, ammunition and marking-census receipts include all six new
IFVs, and the generated vehicle roster lists 198 vehicles.

All three passed the fresh photo-configuration and standard checks, including
HIGH/LOW dimensions, real weapon configuration and zero strict animated track
intersections. Numerical 3D fidelity remains unverified. The oblique Borsuk
closure check separately exposed its missing inward bore wall; that wall and
a finite recessed end plate now pass all 33 closure views. All ten IFVs in the
combined batch have zero measured deep-interior leaks.

The actual Garage carousel was exercised at 1600 × 1000 with all ten IDs and
a return to Puma S1 X after cache eviction. Each capture verifies the selected
ID, visible attached pedestal root, Garage phase, and served version
`v1.0.0+g0293fb36a.dirty`. This is local candidate evidence, not a deployed-build
claim. Native front, quarter, side, rear and top Gallery captures supplement
the Garage review. Evidence: `.qa-dev/ifv-identity/garage-r7.log` and
`gallery-r7.log` (the corrected `r7b` capture set).

Finite wheel-stock probes sample the actual end-wheel solids and track bands
at five axial positions and 120 radial angles, in HIGH and LOW. All six new
IFVs have positive clearance; the lowest measured clearance is 5.27 mm.
The Borsuk's final strict animated track audit reports zero band and shoe
intersections, including the full sweep.
The final anatomy update regenerated 198 records and 594 technical cards. The revised Puma, Type 89 and Borsuk assets were regenerated and synchronized with their measured presentation anchors. Full release checks apply to the integrated commit before publication.

## Final physical review

Dardo, LRMV Lynx and Borsuk pass the final combined 10/10 standard check,
33-view closure, calibrated module alignment, asset freshness, duplicate-track
and barrel-circularity checks. The handoff's Borsuk closure and regenerated-asset
work is complete. Actual Garage selection and the finite HIGH/LOW running-gear
proofs are recorded above. Numerical 3D comparison remains unverified, as
required by their photographic qualification. The integrated release gate
remains the publication prerequisite, not a claim that production was deployed.
