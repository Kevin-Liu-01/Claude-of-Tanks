// The image-fit registry (owner 2026-10-26, on the battle load screen: "there are still black bars above and below the
// images here!!! fix that!!! no more object containns LOL"). Copyright © 2026 Kevin B. Liu.
//
// A picture of the world (a scene, a background, footage, a photo) fills its box: cover, with its focal point declared.
// `contain` is right only for a transparent cutout, which draws no bars (a tank render, an icon, a silhouette, a diagram
// on its own plate, a logo); each one is a row here, keyed as tools/image-fit-lint.mjs keys it (the CSS rule's selector,
// `inline:<target>` for an inline style, `js:<line>` for a script), with what it holds. The lint,
// tools/image-fit-lint.selftest.mjs, fails on a contain site no row names and on a row whose site is gone. This table
// never reaches a bundle: only the lint reads it.

interface ImageFitCutout {
  /** The module or sheet (repo-relative). */
  readonly owner: string;
  readonly key: string;
  /** The transparent picture it fits whole. */
  readonly holds: string;
}

const GARAGE_CSS = 'src/ui/garage.css';

export const IMAGE_FIT_CUTOUTS: readonly ImageFitCutout[] = Object.freeze([
  // tank renders and silhouettes (transparent PNG and WebP cutouts)
  { owner: 'src/ui/serviceRecord.css', key: '.cot-record-vehicle', holds: "the vehicle's side render" },
  { owner: 'src/ui/endScreen.ts', key: '.cot-es .es-vehicle-card>img', holds: "the vehicle's render on its card" },
  { owner: 'src/ui/endScreenPresentation.css', key: 'body[data-cot-width] .cot-es.cot-es--record .es-vehicle-card>img', holds: "the vehicle's render on its card" },
  { owner: 'src/ui/battleLoad.ts', key: '${WIDE} .cot-bl .team.cards .row.card .sil', holds: "a roster card's side silhouette" },
  { owner: 'src/game/killcam.ts', key: '.cot-kc-killer .nm .sil', holds: "the killer's side silhouette" },
  { owner: 'src/ui/spectatorSwitcher.ts', key: '.cot-spec .portrait img', holds: "the watched tank's angle render" },
  { owner: 'src/ui/techTree.css', key: '.cot-tt .tt-portrait', holds: "a node's tank render" },
  { owner: GARAGE_CSS, key: '.cot-card .ti', holds: "a roster card's packaged angle render" },
  { owner: GARAGE_CSS, key: '.cot-garage .stats .stats-ti', holds: "the readout's tank icon" },
  { owner: 'src/docs/fleet.css', key: '.dm-fleet__side img', holds: "a fleet tile's side render" },
  { owner: 'src/ui/hudEditorPreview.ts', key: "js:drawImageFit(ctx, surface.image, width - 10, height - 10, 'contain');", holds: "the damage panel's top-view plan" },
  // diagrams on their own plates (line drawings, shot schematics)
  { owner: 'src/ui/contextInfo.ts', key: ".cot-info-modal__media figure[data-fit='contain'] img", holds: "an info image its caller marks fit: 'contain', a render or a diagram (a footage frame or a photo takes the default cover)" },
  { owner: GARAGE_CSS, key: '.cot-technical-figure img', holds: 'a technical drawing (armour, modules, crew)' },
  { owner: GARAGE_CSS, key: '.cot-technical-viewer-figure img', holds: 'a technical drawing, enlarged' },
  { owner: 'src/ui/shotInfo.ts', key: '.cot-si-diag .pf', holds: "the shot schematic's profile drawing" },
  { owner: 'src/ui/battleHudLayout.css', key: 'body[data-cot-battle-layout][data-cot-width][data-cot-height] .cot-si-diag :is(.pf,.sil)', holds: "the shot schematic's profile and silhouette" },
  { owner: 'src/ui/battleHudLayout.css', key: 'body[data-cot-battle-layout][data-cot-width][data-cot-height] .cot-si-diag svg.ov', holds: "the shot schematic's overlay" },
  // icons and marks
  { owner: GARAGE_CSS, key: '.cot-header-nav .nv .nvi', holds: "a destination's icon" },
  { owner: GARAGE_CSS, key: '.cot-mobile-nav-menu button img,.cot-mobile-nav-menu button svg', holds: "a menu item's icon" },
  { owner: GARAGE_CSS, key: '.cot-locale-credit img', holds: "the translation credit's logo" },
  { owner: 'src/ui/transition.ts', key: '.cot-trans .mark', holds: 'the brand mark' },
]);
