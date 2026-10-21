// endScreenAircraft.selftest.mjs — (lane ac130-fx-228 r3, the engineering critic's K2: the text checks let "the end
// screen's roster row names the garage tank" live) the after-battle team roster names the AC-130 on a gunship pilot's row,
// never the tank the pilot's garage held, and every tank's row keeps its own vehicle. Driven through the real end screen
// (createEndScreen().show) over the recording DOM, the rows read by their markup.
import { created, StubElement } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { createEndScreen } from './endScreen.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';

const host = new StubElement('div');
const screen = createEndScreen(createBus(), host);
const stats = { dealt: 2400, received: 0, blocked: 0, fired: 30, hits: 18, pens: 12, assist: 0 };
screen.show('victory', {
  result: 'victory', timeS: 300, stats, kills: [], playerAircraft: true, playerVehicle: 'M1A1 Abrams HC', playerSpecId: 'm1a1_abrams_hc',
  allies: [
    { id: 'player', name: 'Claude', specId: 'm1a1_abrams_hc', aircraft: true, dmg: 2400, kills: 3, dead: false, isPlayer: true },
    { id: 'ally-1', name: 'Wingman', specId: 'type90', dmg: 800, kills: 1, dead: false },
  ],
  enemies: [{ id: 'foe-1', name: 'Rival', specId: 'm1a3', dmg: 300, kills: 0, dead: true }],
});
const rows = created.filter((e) => e.classes.has('es-tr'));
const rowOf = (who) => rows.find((r) => r.innerHTML.includes(`>${who}<`));
const veh = (row) => /<span class="veh">([^<]*)<\/span>/.exec(row?.innerHTML ?? '')?.[1] ?? null;
const pilotRow = rowOf('Claude'), wingRow = rowOf('Wingman'), foeRow = rowOf('Rival');
assert.ok(pilotRow && wingRow && foeRow, `the roster renders every combatant's row (${rows.length})`);
const ac130 = killSourceIdentity('ac130').label;
assert.ok(veh(pilotRow).startsWith(ac130), `the gunship pilot's row names the AC-130 (${veh(pilotRow)})`);
assert.ok(!/abrams|m1a1/i.test(veh(pilotRow)),
  'never the garage tank under the gunship');
assert.ok(!veh(wingRow).includes(ac130) && veh(wingRow).length > 0, `a tank's row keeps its own vehicle (${veh(wingRow)})`);
console.log(`endScreenAircraft: the after-battle roster names the ${ac130} on the pilot's row (${veh(pilotRow)}), each tank its own (${veh(wingRow)})`);
