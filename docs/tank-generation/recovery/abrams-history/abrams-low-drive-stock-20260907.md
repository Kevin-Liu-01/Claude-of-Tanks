# Abrams X — bounded drive-wheel stock

Status: component and unchanged complete-model source/air/42-pose tests PASS.
Final frozen fleet census and native LOW review remain separate gates.

The complete drive assembly, including all216 native engagement-tooth
triangles, is2,924 triangles at HIGH and1,468 at LOW. This fits the fixed
3,000/1,500 per-end-wheel limits. The previous closed-stock checkpoint was
3,084/2,828. Axles, radii, axial planes and all native teeth are unchanged.

The primitive uses separate pressed annuli, dished stock, a scalloped carrier,
mounting plate and attached fasteners. LOW preserves32 outer dish stations
and20 inner stations: smaller16/20-station candidates failed fixed source
first-surface rays and were rejected. Covered carrier bore, cone and small
hub rings use fewer stations only where the original source recesses and
receiving contacts survive. No full-width cylinder fills the dish or bore.

All16 LOW fasteners retain their entire original flat triangular front cap.
Only the concealed rear prism tapers to a shank embedded inside the actual
mounting plate: four triangles instead of eight. This is a private Abrams
primitive, not a change to every fleet fastener. HIGH fastener buffers are
unchanged. The original complete hub-cap ring remains at both qualities;
several cheaper cap/base candidates erased real ledges and were rejected.

`abramsSourceXDriveBudget.selftest.mjs` checks actual complete assembly cost,
the full cap to10nm Float32 precision, unchanged HIGH caps and192 finite
three-dimensional overlap witnesses inside both fastener shank and mounting
plate. `abramsSourceXDrive.selftest.mjs` passes all14 HIGH/LOW models over
42 poses, original source first surfaces/apertures, authenticated native gear
interfaces, exact216-tooth ownership/winding/spin and positive transforms.

These are local source and physical gates, not proof that every original
source tooth recess is accurate or that thicker tracks clear the complete
moving assembly. The latter remains an independently checked rollout.

