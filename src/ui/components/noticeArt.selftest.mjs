// noticeArt.selftest.mjs — a notice's art (notices-276; Kevin 2026-11-23: "those kinds of notifications need graphics in the
// empty part of the notifications with like the graphic and then its gradient transitioning from nothing into the image").
// Copyright © 2026 Kevin B. Liu.
// - one mechanism: an art id names a render (the aircraft's and the tanks' 3/4 thumbnails, one studio), the kit draws it in
//   one layer, and one stylesheet rule masks it from transparent into the picture; no other sheet styles it;
// - the ruled kinds carry it (Kevin and Main 2026-11-23): INCOMING by its aircraft, an aircraft brought down by its own, an
//   enemy drone brought down, the auto-aim lock by its target; a refusal and the barrage (no aircraft) stay words;
// - every aircraft art has its render on disk, in the aircraft manifest.
import { created } from '../hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { NOTICE_AIRCRAFT, noticeArtUrl } from './noticeArt.ts';
import { noticeContentHtml } from './notice.ts';
import { RENDERED_AIRCRAFT, PREVIEW_AIRCRAFT } from '../../vehicles/previewVehicles.ts';
import { createBus } from '../../game/stateCore.ts';
import { createAirSupportHud, INCOMING_NOTICE } from '../airSupportHud.ts';
import { BATTLE_EVENT } from '../battleNoticeEvents.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R } from '../../sim/matchRuleset.ts';
void created;

// ---- the ids and their pictures
for (const id of NOTICE_AIRCRAFT) {
  assert.ok(Object.hasOwn(RENDERED_AIRCRAFT, id), `${id}: a rendered aircraft (previewVehicles.ts)`);
  assert.equal(noticeArtUrl(id), `/icons/thumbs/${id}_angle.webp`);
}
const manifest = JSON.parse(readFileSync('public/icons/aircraft-assets.json', 'utf8'));
for (const id of NOTICE_AIRCRAFT) {
  assert.equal(manifest.aircraft[id]?.assets?.angle?.thumbnail?.file, `thumbs/${id}_angle.webp`, `${id}: rendered (node tools/genAircraftAssets.mjs --ids=${id})`);
  assert.ok(existsSync(`public/icons/thumbs/${id}_angle.webp`), `${id}: its thumbnail on disk`);
}
// the notice aircraft are never previewed in a tank's place (no mode, no hero card)
for (const id of ['a10', 'f16', 'drone']) assert.ok(!Object.hasOwn(PREVIEW_AIRCRAFT, id), `${id} is no preview aircraft`);
assert.equal(noticeArtUrl('tank:t90a'), '/icons/thumbs/t90a_angle.webp');
assert.ok(existsSync('public/icons/thumbs/t90a_angle.webp'), 'a tank thumbnail on disk');
for (const bad of [undefined, null, '', 'b52', 'tank:', 'tank:../x', 'tank:a b', 'tank:"><img']) assert.equal(noticeArtUrl(bad), null, String(bad));

// ---- the kit's markup: one layer, decorative, after the words; none without art
{
  const html = noticeContentHtml({ text: 'Gunship overhead', detail: '4 s', art: 'ac130' });
  assert.match(html, /<span class="cot-c-notice__art" aria-hidden="true"><img src="\/icons\/thumbs\/ac130_angle\.webp" alt="" decoding="async" draggable="false"><\/span>$/);
  assert.doesNotMatch(noticeContentHtml({ text: 'Fire' }), /cot-c-notice__art/);
  assert.doesNotMatch(noticeContentHtml({ text: 'x', art: 'tank:../x' }), /cot-c-notice__art/, 'an id that names no render draws none');
}

// ---- one rule: the mask from transparent into the picture, in the kit's sheet alone
{
  const sheet = readFileSync('src/ui/components/notices.css', 'utf8');
  const rule = sheet.match(/\.cot-c-notice__art img\{([^}]*)\}/);
  assert.ok(rule, 'the kit styles the picture');
  assert.match(rule[1], /mask-image:linear-gradient\(to right,transparent,#000 \d+%\)/, 'masked from transparent into the image');
  // (the sheet's one rule, the kit's markup, and this module's own comment)
  const OWNERS = ['src/ui/components/notices.css', 'src/ui/components/notice.ts', 'src/ui/components/noticeArt.ts'];
  const others = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (/\.(css|ts)$/.test(entry.name) && !OWNERS.includes(path) && readFileSync(path, 'utf8').includes('cot-c-notice__art')) others.push(path);
  } };
  // (the UI's sheets and modules, where a notice's styles live: tools/selftest-scans.mjs declares the listing)
  walk('src/ui');
  assert.deepEqual(others, [], 'no per-notice art CSS');
}

// ---- the ruled kinds
{
  const calls = [], events = [];
  const port = { condition(o) { calls.push(o); }, dismiss() {} };
  const bus = createBus();
  bus.on(BATTLE_EVENT, (e) => events.push(e));
  const hud = createAirSupportHud(globalThis.document.createElement('div'), bus, port);
  const ORIGIN = { x: 0, y: 0, z: 0 };
  const cooldowns = Object.fromEntries(AIR_STRIKE_KINDS.map((k) => [k, 0]));
  const want = { gunship: 'ac130', strafe: 'a10', bomb: 'f16', missile: 'f16', artillery: undefined };
  let id = 0, at = 10;
  for (const [kind, art] of Object.entries(want)) {
    at += 100;
    const strike = { id: ++id, kind, team: 'bravo', x: 0, y: 0, z: 0, heading: 0, calledS: at - 1, landsS: at + 4, endS: at + 60,
      hp: 1, maxHp: 1, downedS: null, downedBy: null, mine: false };
    hud.update({ nowS: at, points: 0, cooldowns, strikes: [strike] }, ORIGIN, ORIGIN, 'alpha', at, true, 'X');
    const raised = calls.filter((c) => c.id === INCOMING_NOTICE).at(-1);
    assert.equal(raised?.art, art, `INCOMING ${kind}: art ${art ?? 'none'}`);
    hud.update({ nowS: at + R[kind].warningS + 600, points: 0, cooldowns, strikes: [] }, ORIGIN, ORIGIN, 'alpha', at + 1, true, 'X');
  }
  bus.emit('ui:aircraftDowned', { kind: 'strafe' });
  bus.emit('ui:aircraftDowned', { kind: 'gunship' });
  bus.emit('ui:strikeRefusal', { kind: 'gunship', reason: 'POINTS' });
  assert.deepEqual(events.map((e) => e.art), ['a10', 'ac130', undefined], 'downed by its aircraft; a refusal stays words');
  const hudSource = readFileSync('src/ui/hud.ts', 'utf8');
  assert.match(hudSource, /on\('drone:down'[\s\S]{0,400}text: t\('hud\.alert\.droneDowned'\)[^\n]*art: 'drone'/, 'an enemy drone brought down shows the drone');
  assert.match(hudSource, /art: targetSpecId \? `tank:\$\{String\(targetSpecId\)\}` : undefined/, 'the auto-aim lock shows its target');
}
console.log(`noticeArt.selftest: PASS (${NOTICE_AIRCRAFT.length} aircraft renders and the tanks' thumbnails; one masked layer; the ruled kinds carry it)`);
