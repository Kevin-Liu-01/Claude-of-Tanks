import '../../src/ui/garage.css';
import { createCustomSelect } from '../../src/ui/customSelect.ts';
import { createBattleArrangementPanel } from '../../src/ui/battleArrangementPanel.ts';
import { readTeamArrangement } from '../../src/game/teamArrangement.ts';
import { MARS_GRAVITY_IDS, MARS_CACHE_IDS } from '../../src/sim/matchRuleset.ts';
import { t } from '../../src/ui/i18n.ts';
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
