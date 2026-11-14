// The standard check's B2 openings verdict on the build alone (owner 2026-11-12: no gate reads an outside 3D model):
// a vehicle with an approved exterior opening may show holes only inside it, pinned cells exact; every other vehicle
// keeps zero holes.
import assert from 'node:assert/strict';
import {approvedOpeningsVerdict,hasApprovedOpening} from './approved-openings.mjs';
import {ARIETE_OPENING_RASTERS} from './ariete-source-openings.mjs';
import {BARAK_OPENING_CELLS} from './barak-source-openings.mjs';
import {AFT_SOURCE_SLOTS} from './source-opening-witnesses.mjs';
import {latticeCellScan,CONTIG_CELL_M} from './contig-grid.mjs';

const cellOf=(x,z)=>[Math.floor(x/CONTIG_CELL_M),Math.floor(z/CONTIG_CELL_M)];

// the vehicles with an approved opening, and none other
for(const id of ['aft10','warrior_tes_h','merkava4_barak',...Object.keys(ARIETE_OPENING_RASTERS)])assert.ok(hasApprovedOpening(id),id);
for(const id of ['m1a1','leo2a6','chieftain5','unknown'])assert.equal(hasApprovedOpening(id),false,id);
// an ordinary vehicle: zero holes pass, any hole fails, a missing scan fails
assert.equal(approvedOpeningsVerdict({id:'leo2a6',scan:{holeCells:0}}).passed,true);
assert.equal(approvedOpeningsVerdict({id:'leo2a6',scan:{holeCells:1}}).passed,false);
for(const scan of [null,{holeCells:NaN},{holeCells:-1},{holeCells:0,error:'x'}])
  assert.equal(approvedOpeningsVerdict({id:'leo2a6',scan}).passed,false,'a missing or broken scan never passes');

// Ariete rear coupler: exact pinned cells at HIGH and LOW
for(const id of Object.keys(ARIETE_OPENING_RASTERS)){
  const high=latticeCellScan(ARIETE_OPENING_RASTERS[id].high.cells),low=latticeCellScan(ARIETE_OPENING_RASTERS[id].low.cells);
  const ok=approvedOpeningsVerdict({id,scan:high,lowScan:low});
  assert.equal(ok.passed,true,`${id}: the pinned coupler at both qualities`);
  assert.equal(ok.intentionalCells,high.holeCells);assert.equal(ok.unexpectedCells,0);
  assert.equal(approvedOpeningsVerdict({id,scan:high}).passed,false,`${id}: the LOW raster is required`);
  const extra=latticeCellScan([...ARIETE_OPENING_RASTERS[id].high.cells,[5,5]]);
  assert.equal(approvedOpeningsVerdict({id,scan:extra,lowScan:low}).passed,false,`${id}: a hole beside the coupler fails`);
  const fewer=latticeCellScan(ARIETE_OPENING_RASTERS[id].high.cells.slice(1));
  assert.equal(approvedOpeningsVerdict({id,scan:fewer,lowScan:low}).passed,false,`${id}: a filled coupler is not the pinned opening`);
}
// Barak bow bay: exact pinned cells
const barak=latticeCellScan(BARAK_OPENING_CELLS);
assert.equal(approvedOpeningsVerdict({id:'merkava4_barak',scan:barak}).passed,true,'the pinned bow bay');
assert.equal(approvedOpeningsVerdict({id:'merkava4_barak',scan:latticeCellScan([...BARAK_OPENING_CELLS,[0,0]])}).passed,false,
  'a hull hole beside the bay fails');
assert.equal(approvedOpeningsVerdict({id:'merkava4_barak',scan:latticeCellScan(BARAK_OPENING_CELLS.slice(3))}).passed,false,
  'a changed bay is not the pinned opening');
// AFT-10 launcher slots: holes inside a slot pass, a hole outside fails
const slot=AFT_SOURCE_SLOTS[0];
const inSlot=cellOf(slot.x,slot.z);
assert.equal(approvedOpeningsVerdict({id:'aft10',scan:latticeCellScan([inSlot])}).passed,true,'a hole in a launcher slot');
assert.equal(approvedOpeningsVerdict({id:'aft10',scan:latticeCellScan([inSlot,[0,0]])}).passed,false,'a hull hole fails');
assert.equal(approvedOpeningsVerdict({id:'aft10',scan:latticeCellScan([])}).passed,true,'no hole at all passes');
// Warrior TES(H) side bays: inside the bounded bay region only
const bay=cellOf(1.8,0);
assert.equal(approvedOpeningsVerdict({id:'warrior_tes_h',scan:latticeCellScan([bay])}).passed,true,'a hole in the side bay');
assert.equal(approvedOpeningsVerdict({id:'warrior_tes_h',scan:latticeCellScan([bay,cellOf(0,0)])}).passed,false,
  'the hull outside the bays stays closed');
assert.equal(approvedOpeningsVerdict({id:'warrior_tes_h',scan:{holeCells:1}}).passed,false,'a registered opening needs its samples');
console.log('approved-openings: pinned Ariete and Barak cells exact, AFT-10 slots and Warrior bays bounded, every other hole fails; no outside model read');
