// Production surface owners, deterministic catalog, no renderer or live room writes.
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/garage.css';
import {installResponsiveLayout} from '../../src/ui/responsiveLayout.ts';
import {createGarage} from '../../src/ui/garage.ts';
import {createSettings} from '../../src/ui/settings.ts';
import {createTouchControls} from '../../src/ui/touchControls.ts';
import {createPlayMenu} from '../../src/ui/playMenu.ts';
import {createInput} from '../../src/game/input.ts';
import {createBus} from '../../src/game/stateCore.ts';
import {TANK_SPECS,PRODUCTION_TANK_IDS} from '../../src/vehicles/specs.ts';
import {CAMO_CATALOG_PATTERN_IDS, CAMO_PATTERN_LABEL} from '../../src/vehicles/camoPolicy.ts';
import {MAP_IDS,getMapName} from '../../src/world/maps/catalog.ts';
import {MAP_THUMBS,MAP_HEROES} from '../../src/ui/mapThumbs.ts';
import {GARAGE_VARIANTS} from '../../src/game/garageVariants.ts';
import {setLocale} from '../../src/ui/i18n.ts';
setLocale(new URLSearchParams(location.search).get('locale') || 'en-US');
installResponsiveLayout();
const bus=createBus(), input=createInput();
const full=new URLSearchParams(location.search).has('full');
const maps=full?[{id:'random',name:'Random'},...MAP_IDS.map(id=>({id,name:getMapName(id),thumb:MAP_THUMBS[id],hero:MAP_HEROES[id]}))]:[{id:'random',name:'Random'},{id:'verdant',name:'Verdant Fields'},{id:'desert',name:'Sirocco Wadi'},{id:'winter',name:'Frosthollow'}];
const specs=full?PRODUCTION_TANK_IDS.map(id=>TANK_SPECS[id]):Object.values(TANK_SPECS).filter(spec=>['m1a3','m1a2','m2a2_bradley','sheridan','leo2a5','t90m'].includes(spec.id));
const paint=new Map(),customPaint=new Map();
const menu=createPlayMenu({maps,vehicles:specs,getSelection:()=>({specId:'m1a3',mapId:'verdant',equipment:[],camo:'factory'})});
const garage=createGarage({specs,maps,bus,garageVariants:full?GARAGE_VARIANTS.map(v=>({...v,thumb:MAP_THUMBS[v.mapId]})):[],onPlayRequest:request=>menu.show(request.mode),camo:{...(full?{getCustom:id=>customPaint.get(id)||null,setCustom:(id,value)=>customPaint.set(id,value)}:{}),patterns:CAMO_CATALOG_PATTERN_IDS,label:CAMO_PATTERN_LABEL,get:id=>paint.get(id)||'factory',set:(id,value)=>paint.set(id,value)}});
const settings=createSettings({input,bus,isBattleActive:()=>false,gearVisible:()=>true});
createTouchControls({input,bus,isBattleActive:()=>false,onOpenSettings:()=>settings.open()});
garage.attachSettingsControl(settings.gear);
garage.show('m1a3');
// Drive the real lobby surface through its public adapter; no transport is faked as live.
const roomCommands=[];
function room(mode,gameMode,seat='host',count=28) {
  const playerId=seat==='host'?'p0':seat==='spectator'?'spectator':'p1';
  const state={roomCode:'ABC123',mode,gameMode,phase:'waiting',hostId:'p0',maxPlayers:28,maxSpectators:4,
    allowTeamSwitch:true,locked:false,mapId:'verdant',teamSize:14,arrangement:null,campaignOperationId:null,
    revision:1,matchSeed:null,round:1,lastResult:null,
    players:Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Commander with a long name ${i}`,team:i%2?'bravo':'alpha',specId:'m1a3',equipment:[],camo:'factory',ready:true,connected:true,isHost:i===0,rating:null}))};
  if(seat==='spectator')state.players.push({id:playerId,name:'Observer',team:'spectator',specId:null,equipment:[],camo:'factory',ready:false,connected:true,isHost:false,rating:null});
  menu.show(mode);menu.attachActiveRoom({state,playerId,role:seat==='host'?'host':'client',
    command(command){roomCommands.push(command);if(command.type==='set_ready'){state.players.find(p=>p.id===playerId).ready=command.ready;menu.updateActiveRoom(state);}return true;},
    leave(reason){roomCommands.push({type:'leave',reason});}});
  return state;
}
window.__MOBILE_SURFACES={garage,settings,menu,room,roomCommands,customPaint};
