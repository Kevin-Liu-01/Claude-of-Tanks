# hud_ui r1 handoff — fixes required outside src/ui/

## 1. Garage is a black void: mount the new procedural hangar (MAJOR, garage view)

File to change: `/Users/kevinliu/claude-of-tanks/src/main.js`
New module (already written, owned by hud_ui): `/Users/kevinliu/claude-of-tanks/src/ui/garageStage.js`

`createGarageStage(engineCtx, GARAGE_POS)` builds a fully procedural hangar:
concrete floor with painted bay markings/tread scuffs (canvas texture, dithered
— no banding), corrugated-steel walls with a hazard wainscot, ceiling +
trusses, hanging highbay lamps and wall flood fixtures with real lights
(2 PointLight + 2 SpotLight, ranges 26/46 m so battle lighting is unaffected),
a hazard-striped display podium, and workshop props (crates, barrels, tires,
tool cabinet, workbench). It replaces the bare gray pad + apron discs, and the
walls enclose the backdrop so the banded sky gradient is never visible.

Patch (two edits):

1. Add the import next to the other `./ui/` imports (~line 27):

```js
import { createGarageStage } from './ui/garageStage.js';
```

2. In the "garage stage" block (~lines 85-102), KEEP line 86
   (`GARAGE_POS.y = ...`) and KEEP the two spotlights (spotA/spotB, lines
   103-111 — they remain the key showcase lights). DELETE the pad and apron
   code between them, i.e. remove exactly:

```js
const padMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.85, metalness: 0.15 });
engineCtx.setupShadowMaterial(padMat);
const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 0.35, 48), padMat);
pad.position.set(GARAGE_POS.x, GARAGE_POS.y + 0.175, GARAGE_POS.z);
pad.receiveShadow = true;
scene.add(pad);
// The battle terrain meshes stop at the map border, so at the garage stage the
// backdrop would be the sky dome below the horizon (blinding white). A wide
// matte ground disc catches the fog gradient instead.
const apronMat = new THREE.MeshStandardMaterial({ color: 0x2e3330, roughness: 1.0, metalness: 0 });
engineCtx.setupShadowMaterial(apronMat);
const apron = new THREE.Mesh(new THREE.CircleGeometry(880, 40), apronMat); // stays outside the 1024 m map
apron.rotation.x = -Math.PI / 2;
apron.position.set(GARAGE_POS.x, GARAGE_POS.y - 0.02, GARAGE_POS.z);
apron.receiveShadow = true;
scene.add(apron);
```

   and insert in its place:

```js
const garageStage = createGarageStage(engineCtx, GARAGE_POS);
scene.add(garageStage.group);
```

Verify: `node tools/screenshot.mjs --views garage` — enclosed lit hangar
(floor texture, corrugated walls, visible light fixtures, props), no gradient
banding, no black void. This patch was applied locally and verified before
being reverted (main.js is untouched in this delivery).

## 2. Optional polish (not blocking)

`SHOT_VIEWS.player_view` (~line 597) forces `penRatio: 1.3` while aiming at
open ground, so the arcade reticle reads "green = will pen" against grass.
WoT shows the neutral white reticle over terrain; consider `penRatio: null`
in that recipe. The HUD handles both — purely a screenshot-recipe choice.
