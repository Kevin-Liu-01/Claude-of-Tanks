// The lobby's equipment sends (fire-fx-debounce-272 audit follow-up, release 273): an unchanged Garage pick sends
// nothing, a changed pick sends once (not again while it is in flight, again after the room refused it), and the room
// still applies a repeat from an older client. The Play menu sends every select_equipment through the gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEquipmentSelectionGate } from './equipmentSelection.ts';
import { applyRoomCommand, createRoom, joinRoom } from './roomPolicy.ts';

const sent = [];
const failures = [];
const gate = createEquipmentSelectionGate((command, failed) => { sent.push(command); failures.push(failed); });
const pick = (equipment, consumables = []) => ({ type: 'select_equipment', equipment, consumables });

// unchanged: the seat already holds the pick (as the room cleans it: trimmed, deduplicated, in slot order)
const seat = { equipment: ['rammer', 'optics'], consumables: ['repair_kit'] };
assert.equal(gate.send(seat, pick(['rammer', 'optics'], ['repair_kit'])), false, 'an unchanged pick sends nothing');
assert.equal(gate.send(seat, pick([' rammer', 'optics', 'rammer'], ['repair_kit'])), false, 'equal once cleaned');
assert.equal(sent.length, 0);

// changed: sent once, not again while in flight, and the seat showing it ends the flight
assert.equal(gate.send(seat, pick(['optics', 'rammer'], ['repair_kit'])), true, 'slot order is a change');
assert.equal(gate.send(seat, pick(['optics', 'rammer'], ['repair_kit'])), false, 'the same pick in flight is not resent');
assert.equal(sent.length, 1);
const shown = { equipment: ['optics', 'rammer'], consumables: ['repair_kit'] };
assert.equal(gate.send(shown, pick(['optics', 'rammer'], ['repair_kit'])), false);
assert.equal(gate.send(shown, pick(['optics', 'rammer'], ['medkit'])), true, 'a consumables change alone is a change');
assert.equal(sent.length, 2);
assert.deepEqual(sent[1], pick(['optics', 'rammer'], ['medkit']), 'the command goes as written');

// refused: the same pick may go again; a later pick's refusal never clears a newer one in flight
failures[1]();
assert.equal(gate.send(shown, pick(['optics', 'rammer'], ['medkit'])), true, 'after a refusal the pick goes again');
assert.equal(gate.send(shown, pick(['optics'], [])), true);
failures[2]();
assert.equal(gate.send(shown, pick(['optics'], [])), false, 'an older refusal leaves the newer pick in flight');
gate.reset();
assert.equal(gate.send(shown, pick(['optics'], [])), true, 'a reset forgets the pick in flight');
// no seat yet (the lobby has not shown this player): send
assert.equal(createEquipmentSelectionGate(() => {}).send(null, pick([], [])), true);

// the room still applies a repeat from an older client (it un-readies the seat, as before)
{
  const now = 1_700_000_000_000;
  const room = createRoom({ roomCode: 'ROOM01', mode: 'private', creator: { id: 'p1', name: 'One' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2 }, now });
  joinRoom(room, { player: { id: 'p2', name: 'Two' }, selection: { specId: 't90am' }, now: now + 1 });
  const repeat = { type: 'select_equipment', equipment: ['rammer'], consumables: [] };
  applyRoomCommand(room, 'p2', repeat, now + 2);
  applyRoomCommand(room, 'p2', repeat, now + 3);
  assert.deepEqual(room.players.find((player) => player.id === 'p2').equipment, ['rammer'], 'a repeated select_equipment is applied, never refused');
}

// the Play menu writes no select_equipment that skips the gate
const playMenu = readFileSync(new URL('../../ui/playMenu.ts', import.meta.url), 'utf8');
const sends = playMenu.match(/type: 'select_equipment'/g) ?? [];
const gated = playMenu.match(/equipmentGate\.send\([^,]+, \{ type: 'select_equipment'/g) ?? [];
assert.ok(sends.length >= 2 && gated.length === sends.length, `every select_equipment goes through the gate (${gated.length} of ${sends.length})`);

console.log(`equipmentSelection.selftest: an unchanged pick sends nothing, a changed one once (${sent.length} sends), a refused one again; the room applies a repeat; the Play menu's ${sends.length} sends are gated`);
