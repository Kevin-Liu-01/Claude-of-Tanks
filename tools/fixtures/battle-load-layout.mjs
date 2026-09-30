// Real loading screen and viewport rules, without a WebGL world build.
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBattleLoadScreen } from '../../src/ui/battleLoad.ts';

installResponsiveLayout();
const screen = createBattleLoadScreen();
const vehicles = [
  ['m1a2', 'M1A2 Abrams'], ['leo2a5', 'Leopard 2A5'], ['t90m', 'T-90M'],
];
const rows = (count, ally) => Array.from({length:count}, (_,i) => ({
  id:vehicles[i%vehicles.length][0], name:vehicles[i%vehicles.length][1],
  tier:'X', isPlayer:ally && i===0,
}));
window.__LOAD_LAYOUT = {
  screen,
  roster(allies, enemies) { screen.rosters(rows(allies,true), rows(enemies,false)); },
};
screen.show({mapName:'Steinburg', mode:'Turbo Ball · Any battlefield', thumb:'/maps/urban.webp', allies:[], enemies:[]});
const params = new URLSearchParams(location.search);
window.__LOAD_LAYOUT.roster(Number(params.get('allies') ?? 7), Number(params.get('enemies') ?? 7));
screen.progress(.97, 'Priming deployment view');
