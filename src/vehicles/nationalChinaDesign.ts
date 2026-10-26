// Original Chinese modernization studies: scalar design datums, not service claims.
// All turret coordinates are relative to the vehicle's retained bearing centre.
export const NATIONAL_CHINA_DESIGNS = [
  {
    // Release 227 (owner 2026-10-16: "make the yun keep all its extra add ons and modifications but altered slightly to
    // be wrapped around the type 96b turret base"): the Type 96B turret (nationalDonorTurrets.ts); roofY is its roof, rws
    // the faceted station's own left-roof seat, cupola the 96B commander's cupola, turretRear the rear band (the slat
    // cage reaches -2.45).
    heightM:3.295,roofY:.70,rws:[.392,.70,-.607],cupola:[-.592,.683,.105],
    hullLength:6.72,width:4.34,turretRear:-2.22,
    description:'Yun T-80U retrofit concept: the original turbine hull carries a Type 96B turret wrapped in the Yun\'s own armour. One welded horseshoe housing a side runs from the nose round the 96B wall and the bustle module\'s flank, carrying six broad Chinese single-piece chevron ERA cassettes and three flat reactive tiles; a bustle module with its roof plate, a rear band and a horizontal slat cage close the rear. Eight roof smoke tubes on two roof cradles, three service cases on a spine frame, a low flat optic, a service antenna, an armoured hood round the gunner\'s sight on its cast plinth, a spine sensor, paired slit lamps on the housings\' front shelves ahead of the box sight, a monocle eye and two side electronics boxes complete the roof, and the 12.7 mm faceted station keeps its own seat beside the commander\'s cupola; the gun carries thermal-sleeve bands and a muzzle-reference strip, and the box sight rides its mantlet. The hull keeps six thick layered skirt modules, glacis tiles, paired rectangular driving lamps in armoured cowls on the glacis corners under the gun\'s sweep, twin engine-deck cooling panels, a slatted transom, two small transverse fuel drums on native transom brackets and a rear field rack.',
  },
  {
    // Owner 2026-10-15 (VEH-20): the Type 96B turret (nationalDonorTurrets.ts); roofY is its roof, rws the QJC-88
    // emplacement's seat on the 96B commander's cupola (release 227) and cupola that cupola's base on the roof,
    // turretRear the 96B bustle and bins (the open maintenance cage reaches -2.28).
    heightM:3.435,roofY:.70,rws:[-.592,.884,.105],cupola:[-.592,.683,.105],
    hullLength:7.31,width:4.54,turretRear:-1.92,
    description:'Kunlun T-72B3M retrofit concept: the low T-72B3M hull carries a Type 96B turret. Its wedge front wears twelve Chinese single-piece chevron ERA cassettes on permanent carriers, two Shtora-style infrared dazzler heads flank the mantlet, each carrying a square guarded driving lamp on its hood, and a QJC-88 12.7 mm machine gun stands on an open pintle in a socket on the commander\'s cupola rim, clear of the hatch lid, its cradle and light shield, closed round a small gun port, elevating with it; a box sight riding the mantlet, the gunner\'s sight on a cast plinth, a scanner head, service cases, a second whip and an open maintenance cage with a three-cell rear console complete the turret. The hull keeps seven thick staggered skirt modules, glacis cassettes, twin circular driving lamps in armoured cowls on the glacis corners under the gun\'s sweep, engine-deck cooling panels, large transverse auxiliary fuel drums and a rear field rack.',
  },
  {
    // 252 (owner: "redesign the qilin around a type 96b inspired Yun like turret"): the Type 96B turret
    // (nationalDonorTurrets.ts); roofY is its roof, rws the QJC-88 emplacement's seat on the 96B commander's cupola (the
    // Kunlun's rim socket) and cupola that cupola's base on the roof, turretRear the bustle module's rear face (the loaded
    // stowage rack reaches -2.36). heightM less the turret drop is the listed 3.097 m (the 96B's whip).
    heightM:3.182,roofY:.70,rws:[-.592,.884,.105],cupola:[-.592,.683,.105],
    hullLength:6.8784,width:4.363,turretRear:-2.04,
    description:'Qilin T-72B3 retrofit concept: the original low T-72B3 hull carries a Type 96B turret in the Qilin\'s own welded fit. One sleeve a side runs from the bustle corner along the 96B wall and steps out into a heavier brow over the cheek: the brow\'s two front facets carry four Chinese single-piece chevron ERA cassettes, the flank housing behind the step three flat reactive tiles, the brow\'s side a marking board. A welded bustle module closes the rear behind the 96B\'s rear cap and carries a full-width stowage rack loaded with a camouflage-net roll, a folded tarpaulin, two ammunition cases, a spare-parts case and a kit bag, each on two floor bars, with a rear camera looking aft over it. Round guarded lamps stand on the brows\' front shelves, a side camera and a flat eye on the brows, two four-tube smoke cradles on the flank housings; a split-panel sensor on the crown\'s centre, a roll framed by a small rack, a field-service box and a tool chest complete the roof, the gunner\'s sight on its cast plinth, and a QJC-88 12.7 mm machine gun stands on an open pintle in a socket on the commander\'s cupola rim, clear of the hatch lid, behind its light shield. The hull keeps five ribbed layered skirt modules, glacis cassettes, round driving lamps, engine-deck cooling panels, two individually cradled rear fuel drums and a rear field rack.',
  },
] as const;
