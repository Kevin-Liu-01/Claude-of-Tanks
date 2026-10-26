// Dev-only mount of the Garage's tech-tree screen (tools/tech-tree-preview.html): the spec-only fleet registration
// supplies the vehicles (no builders, no WebGL), the kit's sheet and hover tip come up as in the game, and the screen's
// strings load as the Garage loads them. First-party: Kevin B. Liu (NOTICE.md).
import '../src/vehicles/fleetRegistration.ts';
import { TANK_CATALOGS, TANK_SPECS } from '../src/vehicles/specs.ts';
import { TECH_TREES } from '../src/techTree/trees.ts';
import { createTechTreeScreen } from '../src/ui/techTree.ts';
import { ensureTechTreeStrings } from '../src/ui/techTreeStrings.ts';
import { installHoverTips } from '../src/ui/components/hoverTip.ts';
import { setLocale } from '../src/ui/i18n.ts';
import '../src/ui/tokens/tokens.css';
import '../src/ui/components/components.css';
import '../src/ui/techTree.css';
import '../src/ui/heroCard.css';

const params = new URLSearchParams(location.search);
await setLocale(params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US');
await ensureTechTreeStrings();
installHoverTips(document);
const vehicles = new Map(TANK_CATALOGS.production.map((id) => [id, TANK_SPECS[id]]));
const picks: string[] = [];
const tree = TECH_TREES.find((entry) => entry.id === params.get('tree'));
const screen = createTechTreeScreen({
  trees: TECH_TREES,
  vehicles,
  selectedId: params.get('select') ?? tree?.nodes[0]?.id ?? null,
  onPick: (id) => { picks.push(id); },
  // The preview has no Garage to return to: reopen.
  onClose: () => { queueMicrotask(() => screen.open()); },
});
screen.open();
Object.assign(window, { __techTree: { screen, picks } });
