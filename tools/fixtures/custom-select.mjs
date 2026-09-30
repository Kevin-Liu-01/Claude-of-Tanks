import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/garage.css';
import { createCustomSelect } from '../../src/ui/customSelect.ts';
import { createBattleArrangementPanel } from '../../src/ui/battleArrangementPanel.ts';
import { readTeamArrangement } from '../../src/game/teamArrangement.ts';
import { MARS_GRAVITY_IDS, MARS_CACHE_IDS } from '../../src/sim/matchRuleset.ts';
import { t } from '../../src/ui/i18n.ts';
if (new URLSearchParams(location.search).get('surface') === 'garage') {
  document.querySelector('main').remove();
  const [{createGarage},{TANK_SPECS},{installResponsiveLayout}] = await Promise.all([
    import('../../src/ui/garage.ts'), import('../../src/vehicles/specs.ts'), import('../../src/ui/responsiveLayout.ts'),
  ]);
  installResponsiveLayout();
  const garage = createGarage({specs:[TANK_SPECS.m1a3], maps:[{id:'random',name:'Random'}]});
  garage.show('m1a3');
  window.__GARAGE_UI = garage;
} else {
for (const [id,values] of [['gravity',MARS_GRAVITY_IDS],['caches',MARS_CACHE_IDS]]) {
  const select=document.getElementById(id);
  select.replaceChildren(...values.map(value=>new Option(t(`mars.${id}.${value}`),value)));
  createCustomSelect(select);
}
const arrangement=createBattleArrangementPanel(document.getElementById('arrangement'));
arrangement.render('mars');
const dynamic=document.getElementById('dynamic');
const controller=createCustomSelect(dynamic);
let changes=0;
dynamic.addEventListener('change',()=>changes++);
window.__SELECT_TEST={arrangement,readTeamArrangement,dynamic,controller,changes:()=>changes};

}
