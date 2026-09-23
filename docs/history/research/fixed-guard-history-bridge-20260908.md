# Fixed-guard finish history bridge — 2026-09-08

Status: **test-only candidate; seven focused tests passed**. This changes no
playable geometry, finish, armor metadata, source model, or release threshold.
The final combined bodywork release remains required.

The seven-vehicle bodywork candidate at `ca475a6bf9309aebde45e683c3c234828488fdac`
moves two Leclerc X bow guards and four AMX-40 X aprons from `hullDetail` to
camouflage-painted `hullPaintedDetail`. The older auxiliary-armor regression
hashes complete native geometry, UVs, material assignments, owners and
instances. Its historical digest therefore correctly rejects the new finish.
Both original HIGH failures were independently reproduced before changing the
test, with test-file SHA-256
`c394fedfd971728dabee6c13b0f2f2382cc790a1faaa858c4756c623bdad7c26`.

The expanded suite also reproduced the Leopard 2A6 X partition fingerprint
failure: HIGH `fcd94cec` became `b3b0bb9d`. That asset fingerprint groups
positions by merged mesh; separating eight unchanged sheets into a new paint
bucket changes it even though the oriented physical triangle union is exact.
The same authenticated inverse therefore covers its two named bow guards and
six labelled upper sheets. All eight western expected geometry digests and
all permanent-armor metadata hashes remain unchanged.

The bridge preserves all fourteen original `BEFORE` values. Only those two IDs
rebuild the old finish for that digest, using exact authored labels, expected
counts/order and provenance. The complete inverse source text is authenticated
against the independently committed `2933d5645` versions through the existing
immutable `fixedStockPaintHistory.test-support.mjs` hashes. It was also compared
byte-for-byte with those actual git blobs. No geometry attribute is excluded.
All surface, air, seam, donor-value and projectile tests still run on the real
painted model. The five other IDs keep their original direct comparison.

The first bridge attempt passed the unchanged Leclerc digest, then failed a
new assertion that expected rendered material names in geometry-only receipt
mode. The correction checks actual hull-material identity in that mode. The
separate registered-guard test still requires the rendered armor material,
shared camouflage texture and exact spatial UVs; that check was not weakened.

Private failed receipts are retained in the isolated bridge worktree under
`.qa-dev/history-before-MrwGj8/` and `.qa-dev/history-after-2uJvRD/`. These local
QA artifacts and comparison inputs are not publication assets.

The intermediate A6 failure is retained in `.qa-dev/history-after-3ZiHjU/`
and `.qa-dev/history-after-v2.log`. The final complete seven-file pass is in
`.qa-dev/history-after-b2px23/` and `.qa-dev/history-after-v3.log`, with all
2,257 source/config inputs unchanged. It covers OtherAux's seven IDs and
WesternAux's four IDs at HIGH/LOW, 4,312 raw paint emissions, 192 posed/spent
receiving rays, actual source planes, source air and donor protection. It is
not a replacement for the final composed release on current main.

The follow-up hash audit found no further literal coupling in the seven-target
scope: the A5 detail digest is rounded world positions and excludes its named
new fittings; source-fleet tests pin unchanged non-X donors; ERA tests compare
current before/after activation; roller/shoe literals cover unchanged gear;
night-lighting reports native digests but does not assert old tank hashes.
The Burlak literal already has its own eight-sheet inverse. Real receiving
tests continue to use the new bucket or all actual meshes, never a historical
proxy. Native images and generated receipts remain the parent's release work.

Run the maintained `sourceXOtherAuxArmor.selftest.mjs` regression for all seven
IDs, then the registered/broad paint, western auxiliary, Leclerc source-fitting,
Leopard A5 detail and AMX-40 skirt tests. The existing test-suite registration
already includes the modified auxiliary regression; no runtime allowlist or
new gate exemption is introduced.
