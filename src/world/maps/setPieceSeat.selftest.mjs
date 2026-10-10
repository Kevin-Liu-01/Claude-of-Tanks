// Receipt for the works vehicles' seat, prints and ground contact (the map-content lane's R6, 2026-10-10; gauntlet wave
// 358a on Whiteout Crossing and Copper Mesa: the Sno-Cat "hovers above the snow on spindly wheels with no shadow", the
// haul truck "hovers on the slope with no contact shadow or seated wheels"). Checked here:
//   - each works kind (vehicleSetPieces.ts RUNNING_GEAR_SEATED) reads its running gear off its built solids: two sides of
//     ground contacts (a Sno-Cat's four pontoons, a Bv 206's four tracks, a D8H's two, a Haulpak's tyres and duals);
//   - on every map that places them, seated on that gear (seatOnRunningGear) no floor point stands more than 2 cm clear
//     of the ground and none is sunk past 0.3 m (the pieces on bumpy ground moved a few metres to a flatter seat), where the plane through the footprint's corners left some 0.3-0.7 m up;
//     the dressing kit seats them so (mapKits.ts), the other set pieces by their corners as before;
//   - their prints: a strip under each side's line of gear, out behind them;
//   - their contact (vehicleContactShadow.ts buildSetPieceContacts, to the contact-shadows lane's rule): darken-only, the
//     body 0.35 at its densest, the crease 0.38 over it (0.6 together at the most), the body no more than 15 cm past the
//     footprint and the creases no more than 8 cm past their gear, deterministic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GEAR_SEAT_CLEARANCE_M, RUNNING_GEAR_SEATED, SET_PIECE_SIZE, seatOnRunningGear, setPiecePrints, setPieceRunningGear,
} from './vehicleSetPieces.ts';
import {
  SET_PIECE_CONTACT_BODY, SET_PIECE_CONTACT_CREASE, SET_PIECE_CONTACT_CREASE_M, SET_PIECE_CONTACT_SPILL_M, buildSetPieceContacts,
} from './vehicleContactShadow.ts';
import { MAP_IDS, getMapConfig } from './index.ts';
import { createHeightField } from '../terrain.ts';

// the running gear
const GEAR = { snocat: 4, bv206: 4, d8h: 2, haulpak: 4 };
for (const kind of RUNNING_GEAR_SEATED) {
  for (const wrecked of [false, true]) {
    const gear = setPieceRunningGear(kind, wrecked);
    const left = gear.contacts.filter((c) => c.x0 + c.x1 < 0), right = gear.contacts.filter((c) => c.x0 + c.x1 > 0);
    assert.ok(left.length && right.length, `${kind}${wrecked ? ' wrecked' : ''}: ground contacts on both sides`);
    if (!wrecked) assert.ok(gear.contacts.length >= GEAR[kind], `${kind}: its running gear reads (${gear.contacts.length} contacts)`);
    assert.ok(gear.floor.length >= 24 && gear.floor.length % 3 === 0, `${kind}: its floor points`);
    const size = SET_PIECE_SIZE[kind];
    for (const c of gear.contacts) {
      assert.ok(Math.abs(c.x0) <= size.hw + 0.15 && Math.abs(c.x1) <= size.hw + 0.15 && Math.abs(c.z0) <= size.hl + 0.15 && Math.abs(c.z1) <= size.hl + 0.15,
        `${kind}: its contacts inside its footprint`);
    }
  }
  const prints = setPiecePrints(kind);
  assert.ok(prints && prints.xs.length === 2 && prints.xs[0] < 0 && prints.xs[1] > 0 && prints.width > 0.2 && prints.z0 < -12 && prints.z1 > 0,
    `${kind}: a print under each side's gear, out behind it (${JSON.stringify(prints)})`);
}
assert.equal(setPiecePrints('lrv'), null, 'the rover keeps its own prints (props.ts)');

// the seat on every map that places them
const kit = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
assert.match(kit, /const seat = solid\.gear \? seatOnRunningGear\(piece, solid\.gear, \(x, z\) => heightField\.getHeightAt\(x, z\)\) : null;/,
  'the dressing kit seats the works vehicles on their gear');
const lines = [];
let seated = 0;
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  const pieces = (config.props.vehicleSetPieces ?? []).filter((p) => RUNNING_GEAR_SEATED.has(p.kind));
  if (!pieces.length) continue;
  const field = createHeightField(1337, config);
  const ground = (x, z) => field.getHeightAt(x, z);
  let worstCorner = 0, deepest = 0;
  for (const piece of pieces) {
    const gear = setPieceRunningGear(piece.kind, !!piece.wrecked);
    const seat = seatOnRunningGear(piece, gear, ground);
    assert.ok(seat, `${mapId}: ${piece.kind} at (${piece.x}, ${piece.z}) seats on its gear`);
    assert.ok(seat.maxGap <= GEAR_SEAT_CLEARANCE_M + 1e-6, `${mapId}: ${piece.kind} at (${piece.x}, ${piece.z}): no floor point clear of the ground (${seat.maxGap.toFixed(3)})`);
    assert.ok(seat.minGap >= -0.3, `${mapId}: ${piece.kind} at (${piece.x}, ${piece.z}): sunk no more than 0.3 m (${seat.minGap.toFixed(2)})`);
    assert.ok(Math.abs(seat.pitch) < 0.5 && Math.abs(seat.roll) < 0.5, `${mapId}: ${piece.kind} at (${piece.x}, ${piece.z}): a sane pose`);
    deepest = Math.min(deepest, seat.minGap);
    // what the corner plane left: its floor points' highest clearance
    const size = SET_PIECE_SIZE[piece.kind], yaw = (piece.yawDeg * Math.PI) / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const at = (lx, lz) => ground(piece.x + lx * cy + lz * sy, piece.z - lx * sy + lz * cy);
    const fl = at(-size.hw, size.hl), fr = at(size.hw, size.hl), bl = at(-size.hw, -size.hl), br = at(size.hw, -size.hl);
    const pitch = Math.atan2((fl + fr - bl - br) / 2, size.hl * 2), roll = Math.atan2((fr + br - fl - bl) / 2, size.hw * 2), y = (fl + fr + bl + br) / 4;
    for (let k = 0; k < gear.floor.length; k += 3) {
      const x = gear.floor[k], h = gear.floor[k + 1], z = gear.floor[k + 2];
      const x0 = x * Math.cos(roll) - h * Math.sin(roll), y0 = x * Math.sin(roll) + h * Math.cos(roll);
      const y1 = y0 * Math.cos(pitch) + z * Math.sin(pitch), z1 = -y0 * Math.sin(pitch) + z * Math.cos(pitch);
      worstCorner = Math.max(worstCorner, y + y1 - ground(piece.x + x0 * cy + z1 * sy, piece.z - x0 * sy + z1 * cy));
    }
    seated++;
  }
  lines.push(`${mapId} ${pieces.length} (the corner plane's worst ${worstCorner.toFixed(2)} m clear; the gear's deepest ${deepest.toFixed(2)} m in)`);
}
assert.ok(seated >= 20, `the works vehicles seated (${seated})`);

// the contact
const flat = { getHeightAt: () => 0 };
const pieces = [...RUNNING_GEAR_SEATED].map((kind, k) => ({ x: k * 20, z: 0, yaw: 0, hw: SET_PIECE_SIZE[kind].hw, hl: SET_PIECE_SIZE[kind].hl,
  gear: setPieceRunningGear(kind).contacts }));
const mesh = buildSetPieceContacts(pieces, flat), again = buildSetPieceContacts(pieces, flat);
assert.ok(mesh, 'a contact mesh');
assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), Array.from(again.geometry.getAttribute('position').array), 'the same twice');
assert.equal(buildSetPieceContacts([], flat), null, 'none without a piece');
assert.ok(mesh.material.transparent && !mesh.material.depthWrite && mesh.material.vertexColors, 'a soft decal under its vertices\' alpha');
const col = mesh.geometry.getAttribute('color'), pos = mesh.geometry.getAttribute('position');
assert.equal(col.itemSize, 4, 'each vertex its alpha');
let peak = 0;
for (let i = 0; i < col.count; i++) {
  assert.ok(col.getX(i) === 0 && col.getY(i) === 0 && col.getZ(i) === 0, 'darken-only (black)');
  peak = Math.max(peak, col.getW(i));
  const p = pieces[Math.round(pos.getX(i) / 20)], lx = Math.abs(pos.getX(i) - p.x), lz = Math.abs(pos.getZ(i) - p.z);
  const inGearReach = p.gear.some((g) => pos.getX(i) - p.x >= g.x0 - SET_PIECE_CONTACT_CREASE_M - 1e-6 && pos.getX(i) - p.x <= g.x1 + SET_PIECE_CONTACT_CREASE_M + 1e-6
    && pos.getZ(i) - p.z >= g.z0 - SET_PIECE_CONTACT_CREASE_M - 1e-6 && pos.getZ(i) - p.z <= g.z1 + SET_PIECE_CONTACT_CREASE_M + 1e-6);
  assert.ok(inGearReach || (lx <= p.hw + SET_PIECE_CONTACT_SPILL_M + 1e-6 && lz <= p.hl + SET_PIECE_CONTACT_SPILL_M + 1e-6), 'no spill past the footprint\'s 15 cm');
  assert.ok(Math.abs(pos.getY(i) - 0.035) < 1e-6, 'conformed to the ground');
}
assert.ok(peak <= Math.max(SET_PIECE_CONTACT_BODY, SET_PIECE_CONTACT_CREASE) + 1e-6, `no layer past its peak (${peak.toFixed(2)})`);
assert.ok(1 - (1 - SET_PIECE_CONTACT_BODY) * (1 - SET_PIECE_CONTACT_CREASE) <= 0.6 + 1e-6 && SET_PIECE_CONTACT_BODY <= 0.35,
  'the crease over the body 0.6 at the most, the body 0.35');
console.log(`setPieceSeat.selftest: the works vehicles on their own gear, ${seated} seated (${lines.join('; ')}); prints behind them; a soft contact under each`);
