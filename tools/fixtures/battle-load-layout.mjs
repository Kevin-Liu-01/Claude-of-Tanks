import '../../src/ui/tokens/tokens.css';
// the shared kit, as the game's entry loads it (main.ts): the rules row's chips
import '../../src/ui/components/components.css';
// Real loading screen and viewport rules, without a WebGL world build.
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { battleLoadModeLabel, createBattleLoadScreen } from '../../src/ui/battleLoad.ts';

installResponsiveLayout();
const screen = createBattleLoadScreen();
const vehicles = [
  ['m1a1_abrams_hc', 'M1A2 Abrams'], ['leo2a4_v', 'Leopard 2A5'], ['t90am', 'T-90M'],
];
const rows = (count, ally) => Array.from({length:count}, (_,i) => ({
  id:vehicles[i%vehicles.length][0], name:vehicles[i%vehicles.length][1],
  tier:'X', isPlayer:ally && i===0,
}));
window.__LOAD_LAYOUT = {
  screen,
  roster(allies, enemies) { screen.rosters(rows(allies,true), rows(enemies,false)); },
};
const params = new URLSearchParams(location.search);
// ?map=<id>&name=<its name>[&mode=<mode id>]: a battlefield as the game passes it (its art, its baked plan on the plate beside the tip, the mode's objectives on it);
// without it the layout probes keep the plain Steinburg entry
const mapId = params.get('map');
// the chip and the plan's objectives name one mode (&mode=<id>, Turbo Ball unless set), as the game's entries pass both
const modeId = params.get('mode') || 'turbo_ball';
screen.show({mapName:params.get('name') || 'Steinburg', mode:battleLoadModeLabel(modeId), thumb:`/maps/${mapId || 'urban'}.webp`,
  ...(mapId ? {biome:mapId, modeId} : {}), allies:[], enemies:[]});
window.__LOAD_LAYOUT.roster(Number(params.get('allies') ?? 7), Number(params.get('enemies') ?? 7));
screen.progress(.97, 'Priming deployment view');
