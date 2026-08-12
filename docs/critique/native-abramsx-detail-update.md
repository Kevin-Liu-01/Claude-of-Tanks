# AbramsX authored-detail update

AbramsX remains a wholly repository-authored procedural vehicle. The local
Mortavex GLB is used only as a visual/measurement oracle; none of its meshes,
materials, textures, topology, or node geometry ship in the runtime model.

This pass keeps the accepted first-party hull and unmanned-turret envelope,
then replaces several proxy-like reads with authored mechanical geometry:

- seven brighter recessed wheel faces with separate rims, dishes, hubs, and
  fastener cadence;
- clipped armored crowns on the paired panoramic heads;
- a tapered, vented XM914 electronics cassette instead of a rectangular
  AABB box;
- a visible feed/power return into the RWS slew mechanism; and
- larger physical perforations in the XM360 terminal shroud.

Validation on 2026-08-12:

- procedural fidelity: **94.29**, minimum standard view **93.99**;
- geometry gate: **90.4** minimum (90.4 hull / 90.6 whole / 91.0 turret /
  93.4 stations / 99.8 dimensions / 100 floaters);
- standard physical gate: PASS, zero enclosed holes, terminal contact 37/26
  within the audited allowance and no shoe blind spots;
- winding: 0 reversed, 0 mixed, 10 px / 0.01% non-blocking top deficit;
- parenting: 0 stranded, 0 abutting, 0 dangling;
- final evidence: 42 PNGs / 42 distinct SHA-256 hashes; and
- runtime rig, full tests, private build, regenerated tank assets: PASS.
