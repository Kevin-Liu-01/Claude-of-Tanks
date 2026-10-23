// The zh-CN English audit's shell surfaces (tools/zh-latin-audit.browser.mjs, BUI-F8): the production Garage, battle
// setup, Settings, play menu and room, debrief and battle load, built from data named in the active locale exactly as
// src/main.ts names it (map and camouflage names, mode labels, loading stages), so any English the audit finds came
// from the product, never from this fixture. Player names are user content and use the locale's script. No renderer,
// no live room writes. ?surface=garage|setup|settings|play|room|end|load picks one surface per document.
import '../../src/ui/tokens/tokens.css';
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/garage.css';
import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { createInput } from '../../src/game/input.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
import { CAMO_CATALOG_PATTERN_IDS } from '../../src/vehicles/camoPolicy.ts';
import { getLocalizedMapName } from '../../src/world/maps/catalog.ts';
import { setLocale, t } from '../../src/ui/i18n.ts';

const params = new URLSearchParams(location.search);
await setLocale(params.get('locale') || 'zh-CN');
installResponsiveLayout();
const surface = params.get('surface') || 'garage';
const bus = createBus();
const input = createInput();
const maps = [{ id: 'random', name: t('map.random') }, ...['verdant', 'desert', 'winter'].map((id) => ({ id, name: getLocalizedMapName(id) }))];
const camoLabel = Object.fromEntries(CAMO_CATALOG_PATTERN_IDS.map((id) => [id, id === 'auto' ? t('garage.camo.auto') : t(`camoPattern.${id}`)]));
const specIds = ['m1a3', 'm1a1_abrams_hc', 'm2a2_bradley', 'sheridan', 'leo2a4_v', 't90am'];
const specs = Object.values(TANK_SPECS).filter((spec) => specIds.includes(spec.id));
const zh = params.get('locale') !== 'en-US';
const playerName = (i) => (zh ? `车长${String(i + 1).padStart(2, '0')}` : `Commander ${i + 1}`);
const ready = [];

async function garageSurface({ setup = false } = {}) {
  const { createGarage } = await import('../../src/ui/garage.ts');
  const paint = new Map();
  const garage = createGarage({
    specs, maps, bus, garageVariants: [], onPlayRequest: () => {},
    camo: { patterns: CAMO_CATALOG_PATTERN_IDS, label: camoLabel, get: (id) => paint.get(id) || 'factory', set: (id, value) => paint.set(id, value) },
  });
  garage.show('m1a3');
  if (setup) document.querySelector('.cot-battle-mode')?.click();
}

async function settingsSurface() {
  const { createSettings } = await import('../../src/ui/settings.ts');
  createSettings({ input, bus, isBattleActive: () => false, gearVisible: () => true }).open();
}

async function playSurface({ room = false } = {}) {
  const { createPlayMenu } = await import('../../src/ui/playMenu.ts');
  const menu = createPlayMenu({ maps, vehicles: specs, getSelection: () => ({ specId: 'm1a3', mapId: 'verdant', equipment: [], camo: 'factory' }) });
  menu.show('private');
  if (!room) return;
  const state = {
    roomCode: 'ABC123', mode: 'private', gameMode: 'capture_the_flag', phase: 'waiting', hostId: 'p0', maxPlayers: 14, maxSpectators: 4,
    allowTeamSwitch: true, locked: false, mapId: 'verdant', teamSize: 7, arrangement: null, campaignOperationId: null,
    revision: 1, matchSeed: null, round: 1, lastResult: null,
    players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: playerName(i), team: i % 2 ? 'bravo' : 'alpha', specId: specIds[i % specIds.length],
      equipment: [], camo: 'factory', ready: i % 3 !== 0, connected: true, isHost: i === 0, rating: null })),
  };
  menu.attachActiveRoom({ state, playerId: 'p0', role: 'host', command: () => true, leave: () => {} });
}

async function endSurface() {
  const { createEndScreen } = await import('../../src/ui/endScreen.ts');
  const { createEndOverlayRuntime } = await import('../../src/ui/endOverlayRuntime.ts');
  createEndOverlayRuntime({ bus, onReturnToGarage: () => {} });
  const host = document.createElement('div');
  host.className = 'cot-si-stats';
  document.body.append(host);
  const report = createEndScreen(bus, host);
  const rows = (side, count) => Array.from({ length: count }, (_, i) => ({ id: `${side}-${i}`, name: playerName(i), specId: i % 2 ? 't90am' : 'm1a1_abrams_hc',
    kills: i % 5, dmg: 8400 - i * 310, dead: i > 4, isPlayer: side === 'ally' && i === 0 }));
  const player = TANK_SPECS.m1a1_abrams_hc;
  report.show('victory', {
    playerVehicle: player.label?.displayName || player.name, playerSpecId: player.id, map: getLocalizedMapName('verdant'), timeS: 480,
    reason: 'elimination', stats: { dealt: 8420, received: 1230, blocked: 3600, fired: 20, hits: 17, pens: 12, assist: 900 },
    kills: rows('kill', 5), allies: rows('ally', 7), enemies: rows('enemy', 7), awards: null,
  });
}

async function loadSurface() {
  const { createBattleLoadScreen } = await import('../../src/ui/battleLoad.ts');
  const screen = createBattleLoadScreen();
  const rows = (count, ally) => Array.from({ length: count }, (_, i) => {
    const spec = TANK_SPECS[specIds[i % specIds.length]];
    return { id: spec.id, name: spec.label?.displayName || spec.name, tier: 'X', isPlayer: ally && i === 0 };
  });
  screen.show({ mapName: getLocalizedMapName('verdant'), mode: t('playMenu.matchMode.turbo_ball.label'), thumb: '/maps/verdant.webp', allies: [], enemies: [] });
  screen.rosters(rows(7, true), rows(7, false));
  screen.progress(0.97, t('battleLoad.stage.preparingDeployment'));
}

const surfaces = {
  garage: () => garageSurface(), setup: () => garageSurface({ setup: true }), settings: settingsSurface,
  play: () => playSurface(), room: () => playSurface({ room: true }), end: endSurface, load: loadSurface,
};
await (surfaces[surface] ?? surfaces.garage)();
ready.push(surface);
window.__ZH_AUDIT = { surface, ready: true };
