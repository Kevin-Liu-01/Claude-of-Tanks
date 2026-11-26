// Mudguard and fender seating on every tank (formerly mudguardFenderSeating.selftest.mjs): every registered guard part
// meets the fixed hull or fender structure in its textured family bucket, and the T-72BU donor gear, the T-90AM and AM
// II's twin guards and the closed KF51 shoulder keep their laws. A fleet audit
// (fleetPass.test-support.mjs) on the factory's default build, shared by fleetPassDefault.selftest. Reads only.
import assert from 'node:assert/strict';
import { ALL_TANK_IDS } from './specs.ts';
import { FLEET_RENEWAL_DONORS } from './fleetRenewalSpecs.ts';

// The T-90AM and AM II's source-X twins (profiles/t90.ts T90_PROFILES: each builds on its twin's builder).
const T90_SOURCE_TWINS = Object.freeze({ t90am: 't90sm', t90m_proryv: 't90m' });

export function createMudguardFenderSeatingAudit() {
  let coveredVehicles = 0;
  let registeredParts = 0;
  let t72buGear = null;
  let t72buXGear = null;
  const shoulderReceipts = new Map();
  const seatLabels = new Map();
  return {
    check(id, visual) {
      const seats = visual.root.userData.mudguardFenderSeats || [];
      seatLabels.set(id, seats.map((seat) => seat.label).sort());
      if (seats.length) coveredVehicles++;
      registeredParts += seats.length;
      for (const seat of seats) {
        assert.equal(seat.supported, true,
          `${id}/${seat.label}: mudguard must meet fixed hull/fender structure `
          + `(gap ${seat.directGapM} m, axis ${seat.directAxisGapM})`);
      }
      const hullRig = visual.root.children.find((child) => child.name === 'rig_hull');
      for (const guard of hullRig?.userData.sharedMudguards || []) {
        const expectedBucket = guard.material === 'painted-steel' ? 'hull'
          : guard.material === 'wood-stained' ? 'hullWood' : 'hullRubber';
        assert.equal(guard.bucket, expectedBucket,
          `${id}/${guard.label}: mudguard material uses its textured family bucket`);
      }

      if (id === 't72bu_1989') {
        assert(hullRig, 't72bu_1989: hull articulation rig');
        [t72buGear] = hullRig.userData.runningGearReceipts || [];
      }
      if (id === 't72bu') [t72buXGear] = hullRig?.userData.runningGearReceipts || [];
      if (hullRig?.userData.leopardShoulderMudguardReceipt) {
        shoulderReceipts.set(id, hullRig.userData.leopardShoulderMudguardReceipt);
      } else if (hullRig?.userData.kf51ShoulderMudguardReceipt) {
        shoulderReceipts.set(id, hullRig.userData.kf51ShoulderMudguardReceipt);
      }
    },
    finish() {
      assert(coveredVehicles >= 25,
        `fleet mudguard receipt coverage regressed (${coveredVehicles} vehicles)`);
      assert(registeredParts >= 104,
        `fleet mudguard receipt coverage regressed (${registeredParts} parts)`);

      // 2026-10-01: the owner's September renewal (4c34b3e8b, docs/tank-generation/fleet-renewal-publication-20260930.md)
      // rebuilt the T-72BU 1989 on the t72bu foundation, so its running gear is the source-measured t72bu course. The
      // separately authored 2026-08-18 gear (354e8fa97) and its exact 9 cm / 6 cm z-only gaps are gone. A z-only gap
      // ignores the raised idler (0.28 m above the axle line): the source idler reads -0.0099 m in z but stands 0.0516 m
      // clear of the lead wheel circle to circle. Protect the donor law and the T-72 family's side-plane clearance law
      // (pt91mPendekarFidelity, t72JaguarRedesign: centre distance minus both radii above 2 cm).
      assert.equal(FLEET_RENEWAL_DONORS.t72bu_1989, 't72bu', 't72bu_1989: the renewal builds the T-72BU 1989 on t72bu');
      assert(t72buGear, 't72bu_1989: running-gear receipt');
      assert(t72buXGear, 't72bu: running-gear receipt');
      for (const key of ['wheelZs', 'wheelY', 'wheelR', 'idler', 'sprocket']) {
        assert.deepEqual(t72buGear[key], t72buXGear[key], `t72bu_1989: ${key} is the t72bu donor's`);
      }
      assert.equal(t72buGear.wheelZs.length, 6, 't72bu_1989: six native road-wheel stations');
      const frontRoadWheelZ = Math.max(...t72buGear.wheelZs);
      const rearRoadWheelZ = Math.min(...t72buGear.wheelZs);
      const terminalClearance = (end, z) => Math.hypot(end.z - z, end.y - t72buGear.wheelY) - (end.r + t72buGear.wheelR);
      const frontTerminalGap = terminalClearance(t72buGear.idler, frontRoadWheelZ);
      const rearTerminalGap = terminalClearance(t72buGear.sprocket, rearRoadWheelZ);
      assert(frontTerminalGap > 0.02,
        `t72bu_1989: forward idler clears lead road wheel in the side plane (${frontTerminalGap})`);
      assert(rearTerminalGap > 0.02,
        `t72bu_1989: aft sprocket clears rear road wheel in the side plane (${rearTerminalGap})`);

      // (267: the T-90 family moved onto the source-X twins, one family chassis for the obr. 1992, AM, AM II, MS and SM
      // (259579e51c, 07fc1eb544, the old build's receipts retired with it): the AM's and the M Proryv's four hung
      // t90m-proryv-* mudguards and the MS's closed front shoulder receipt (t90MSFrontMudguardReceipt) left with the old
      // hulls; whatever mudguards the X hulls hang are held by the fleet-wide seating checks above)
      // 279 (t90am-lamps-273): the AM and AM II build from their source-X twins since 267 (259579e51c, t90-family.md).
      // Each carries every fender guard its twin registers in this same pass (read from the twin's build, never a
      // pinned list), each seated by the law above.
      for (const [mark, twin] of Object.entries(T90_SOURCE_TWINS)) {
        const own = [...(seatLabels.get(mark) || [])], wanted = seatLabels.get(twin) || [];
        assert.ok(seatLabels.has(mark) && wanted.length > 0, `${twin}: registers fender guards for its mark ${mark} to carry`);
        const missing = wanted.filter((label) => { const at = own.indexOf(label); if (at < 0) return true; own.splice(at, 1); return false; });
        assert.deepEqual(missing, [], `${mark}: carries every fender guard its source-X twin ${twin} registers`);
      }

      // (262: the 2A2 and the 2A3 OTCO left leopard.ts's hull for the shared Leopard 2-pattern hull,
      // profiles/leopard2Hull.ts, beside the 2A3 and the Christian II: its front mudguard over the idler is one closed
      // section solid per side, not this receipt's raked flange and terminal web; release 265: the 2A4 and the 2A4 OTCO
      // followed them with the 2A4 family's rebuild, profiles/leopard2A4Family.ts)
      // (268: the Chieftain Mk 3 and Mk 9 left uk.ts's closed shoulder for the Mk 5 X's own bow guards,
      // profiles/chieftain5XSourceHullEquipment.ts, with the source-built Mk 5; 268b: the Mk 9 moved on to the Mk 10 X's,
      // profiles/chieftain10XFenders.ts)
      // (267: the KF51 EVO was rebuilt on its own hull, profiles/kf51Evo.ts (fb694e0dd6), with the 2A4-pattern box
      // mudguards over the idlers its photos show; the Panther closed shoulder stays the KF51-U's alone, 278)
      const expectedClosedShoulders = [
        'kf51_u',
      ];
      // the EVO's own guards stay under the seating check above: its four rubber flaps hang from the box mudguards' lips
      // and the rear guards, each one seated (supported) on the hull (278)
      assert.deepEqual(seatLabels.get('kf51_evo'), ['kf51evo-front-flap-left', 'kf51evo-front-flap-right',
        'kf51evo-rear-flap-left', 'kf51evo-rear-flap-right'], 'kf51_evo: its box mudguards hang their four seated flaps');
      for (const id of expectedClosedShoulders) {
        const receipt = shoulderReceipts.get(id);
        assert(receipt, `${id}: closed shoulder/mudguard receipt`);
        assert.equal(receipt.closedSideVolume, true,
          `${id}: shoulder must be a closed side volume rather than a thin shelf`);
        assert.equal(receipt.sides, 2, `${id}: shoulder closure must be mirrored`);
        assert.ok(receipt.partsPerSide >= 2,
          `${id}: shoulder closure needs a load-bearing flange and terminal guard`);
        assert.equal(receipt.labels.length, receipt.sides * receipt.partsPerSide,
          `${id}: every structural shoulder/mudguard part is registered`);
      }


      for (const id of expectedClosedShoulders) {
        const receipt = shoulderReceipts.get(id);
        assert.equal(receipt.shoulderMergedIntoGlacis, true,
          `${id}: Panther shoulder must merge into the glacis`);
        assert.ok(receipt.trackClearanceM >= 0.05,
          `${id}: deep terminal web remains outside the track course`);
      }

      console.log(`mudguardFenderSeating: ${ALL_TANK_IDS.length} tanks, `
        + `${coveredVehicles} with ${registeredParts} registered guard parts`);
    },
  };
}
