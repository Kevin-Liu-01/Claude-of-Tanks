// Tank hero cards: the policy and compositor invariants, CPU only (no WebGL, no capture lock).
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { GARAGE_CAMERA_AZIMUTH_RAD, GARAGE_CAMERA_PITCH_RAD } from '../src/game/garagePresentationPose.ts';
import {
  HERO_CAMERA, HERO_CARD_LAYOUT, HERO_FLAG, HERO_FLAG_MASK, HERO_GUN_SIDE, HERO_NAME_LINE_HEIGHT, HERO_POSE, HERO_SIDE_MARGIN, flagMaskStops,
  heroCenterX, heroFlagMaskCss, heroFlagPolicy, heroGunSide, heroTurretTraverseDeg, heroTurretTraverseLimitDeg, placeTank,
} from '../src/ui/heroCardPolicy.ts';
import { applyFlagMask, composeCard, drawTank, horizontalBands, measureBounds, renderFlagLayer } from './hero-cards-compose.mjs';

const deg = (rad) => rad * 180 / Math.PI;
const right = HERO_CAMERA.facing === 'right';

// 1. The hull faces the way the owner ruled (2026-10-20: "Whole tank faces left", superseding the 2026-10-17
//    right-facing roster rule), from a camera within 10 deg of the showroom camera's azimuth and 2 deg of its
//    pitch (front three-quarter: the glacis and the flank both show).
assert.equal(HERO_CAMERA.facing, 'left', 'hero card hulls face left (bow toward screen-left)');
assert.ok(Math.abs(HERO_CAMERA.azimuthDeg - deg(GARAGE_CAMERA_AZIMUTH_RAD)) <= 10, `hero azimuth ${HERO_CAMERA.azimuthDeg} within 10 deg of the Garage camera`);
assert.ok(HERO_CAMERA.azimuthDeg > 0 && HERO_CAMERA.azimuthDeg < 90, 'front three-quarter: the glacis and the flank both show');
// 2026-10-26 (owner via Main, 258: "make the camera look down on the tanks more"): the Garage's presentation pose looks down
// 14 deg while the cards keep their ratified elevation until a re-render matches them (raised with Main), so a card never
// looks down more than the Garage and stands within 10 deg of it
const garagePitch = deg(GARAGE_CAMERA_PITCH_RAD);
assert.ok(HERO_CAMERA.elevationDeg <= garagePitch + 2 && garagePitch - HERO_CAMERA.elevationDeg <= 10,
  `hero elevation ${HERO_CAMERA.elevationDeg} at or under the Garage pitch ${garagePitch.toFixed(1)}, within 10 deg`);

// 2. One mask, two renderers: the CSS string carries the compositor's stops and mirrors with the facing.
const stops = flagMaskStops();
assert.deepEqual(stops[0], [0, 1]);
assert.equal(stops.at(-1)[0], 1);
assert.equal(stops.at(-1)[1], 0);
for (let i = 1; i < stops.length; i++) assert.ok(stops[i][1] <= stops[i - 1][1], 'mask alpha falls monotonically');
const pct = (ratio) => Number((ratio * 100).toFixed(2));
const css = heroFlagMaskCss();
const anchor = right ? 1 - HERO_FLAG_MASK.anchorX : HERO_FLAG_MASK.anchorX;
assert.ok(css.startsWith(`radial-gradient(ellipse ${pct(HERO_FLAG_MASK.radiusX)}% ${pct(HERO_FLAG_MASK.radiusY)}% at ${pct(anchor)}% 0%`), css);
for (const [t, a] of stops) assert.ok(css.includes(`rgba(0,0,0,${a}) ${(t * 100).toFixed(1)}%`), `css stop ${t}`);
assert.ok(heroFlagMaskCss(HERO_FLAG_MASK, 'left').includes(` at ${pct(HERO_FLAG_MASK.anchorX)}% 0%`), 'mask mirrors with the facing');

// 3. The compositor mask: opaque at the rear-top corner, clear toward the gun side and the floor.
{
  const w = 200, h = 120;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  applyFlagMask(ctx, w, h, { opacity: 1 });
  const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  const rear = (x) => (right ? x : w - 1 - x); // x measured from the rear edge
  assert.ok(alpha(Math.round(rear(w * (1 - HERO_FLAG_MASK.anchorX))), 1) > 245, 'opaque at the anchor');
  assert.equal(alpha(rear(w - 3), h - 2), 0, 'clear at the gun-side floor corner');
  assert.ok(alpha(rear(2), 2) > alpha(rear(w / 2), 2) && alpha(rear(w / 2), 2) >= alpha(rear(w * 0.8), 2), 'fades toward the gun');
}

// 4. Cards never cut the gun: a synthetic layer (hull block + a long barrel on the gun side) fits every card kind,
//    for the turned turret's gun side and for a fixed mount's gun on the bow side; the core centre leaves the
//    open side to the gun.
for (const gunSide of ['left', 'right']) {
  const lw = 400, lh = 250;
  const layer = createCanvas(lw, lh);
  const lctx = layer.getContext('2d');
  lctx.fillStyle = '#7a7a62';
  const flip = (x, width) => (gunSide === 'right' ? lw - x - width : x);
  lctx.fillRect(flip(120, 220), 120, 220, 90); // hull + turret mass (the dense core)
  lctx.fillRect(flip(10, 120), 140, 120, 6); // the barrel, its muzzle 10 px from the gun-side edge
  const bounds = measureBounds(layer);
  assert.ok(bounds.fx0 * lw <= (gunSide === 'right' ? 60 : 11) && bounds.fx1 * lw >= (gunSide === 'right' ? 389 : 339), 'full silhouette spans the barrel and the hull');
  assert.ok(bounds.cw * lw < 260, 'the dense core ignores the thin barrel');
  for (const [kind, L] of Object.entries(HERO_CARD_LAYOUT)) {
    const w = L.width * 2, h = L.height * 2, artH = h - L.nameBand * 2;
    const card = createCanvas(w, h);
    const box = { w, artH, baseline: artH, coreShare: L.coreShare, coreHeight: L.coreHeight, centerX: L.centerX, gunSide };
    const { k, dx } = drawTank(card.getContext('2d'), layer, bounds, box);
    const left = dx + bounds.fx0 * k, rightEdge = dx + bounds.fx1 * k;
    assert.ok(left >= w * HERO_SIDE_MARGIN - 0.5 && rightEdge <= w * (1 - HERO_SIDE_MARGIN) + 0.5, `${kind} gun ${gunSide}: whole tank inside the card (${left.toFixed(1)}..${rightEdge.toFixed(1)} of ${w})`);
    assert.deepEqual(placeTank(bounds, box), { k, dx, dy: artH - bounds.cb * k }, `${kind}: drawTank is placeTank`);
    const coreCentre = dx + bounds.cx * k;
    assert.ok(gunSide === 'left' ? coreCentre >= w / 2 - 0.5 : coreCentre <= w / 2 + 0.5, `${kind} gun ${gunSide}: the core sits away from the gun's side`);
  }
}

// 5. The flag is the obverse with its hoist at the card's rear edge: facing right, the FR hoist (blue) sits at the
//    left edge behind the rear, the fly (red) runs toward the gun and fades out inside the layer.
{
  const w = 320, h = 200;
  const flag = await renderFlagLayer('fr', heroFlagPolicy('right'), { width: w, height: h });
  const px = flag.getContext('2d').getImageData(0, Math.round(h * 0.35), w, 1).data;
  const at = (x) => [px[x * 4], px[x * 4 + 1], px[x * 4 + 2], px[x * 4 + 3]];
  const [hr, , hb, ha] = at(Math.round(w * 0.04));
  assert.ok(ha > 200 && hb > hr, 'hoist band is blue at the rear (left) edge');
  let red = -1;
  for (let x = Math.round(w * 0.3); x < w; x++) { const [r, g, b, a] = at(x); if (a > 200 && r > b + 60 && r > g + 40) { red = x; break; } }
  assert.ok(red > 0, 'the fly band (red) shows toward the gun');
  assert.ok(at(w - 2)[3] < 40, 'the fly fades out inside the layer');
  // Facing left mirrors it: the hoist under the feather near hoistX, the fly off the far edge.
  const left = await renderFlagLayer('fr', heroFlagPolicy('left'), { width: w, height: h });
  const lp = left.getContext('2d').getImageData(0, Math.round(h * 0.35), w, 1).data;
  let first = -1;
  for (let x = 0; x < w; x++) if (lp[x * 4 + 3] > 200) { first = x; break; }
  assert.ok(first > w * (HERO_FLAG.hoistX - 0.05), `facing left: the hoist sits near hoistX (first cloth at ${first})`);
  assert.ok(lp[(w - 1) * 4 + 3] > 200, 'facing left: the fly runs off the far edge');
}

// 6. Pure horizontal-band flags are detected from the art and drawn short enough that every band clears the hull:
//    in the rear column, above the lowest band's centre line, RU shows white, blue and red (r5 hid the red).
{
  assert.equal(await horizontalBands('ru'), 3, 'RU: three bands');
  assert.equal(await horizontalBands('de'), 3, 'DE: three bands');
  assert.equal(await horizontalBands('pl'), 2, 'PL: two bands');
  assert.equal(await horizontalBands('us'), 0, 'US: an emblem flag keeps its 4x3 art');
  assert.equal(await horizontalBands('fr'), 0, 'FR: vertical bands keep their 4x3 art');
  const w = 320, h = 200;
  const flag = await renderFlagLayer('ru', heroFlagPolicy(), { width: w, height: h });
  const rows = Math.round(h * HERO_FLAG.bandFit.lowestBandCentreY) + 2;
  const col = flag.getContext('2d').getImageData(Math.round(w * (right ? 0.1 : 0.9)), 0, 1, rows).data;
  const seen = { white: 0, blue: 0, red: 0 };
  for (let i = 0; i < col.length; i += 4) {
    if (col[i + 3] < 200) continue;
    const r = col[i], g = col[i + 1], b = col[i + 2];
    if (r > 160 && g > 160 && b > 160) seen.white++;
    else if (b > r + 40 && b > g) seen.blue++;
    else if (r > b + 60 && r > g + 40) seen.red++;
  }
  assert.ok(seen.white && seen.blue && seen.red, `RU bands above the floor line: ${JSON.stringify(seen)}`);
}

// 7. The runtime cards read the same policy: the lazy layer stylesheet places the tank with placeTank's expression
//    in container units and masks the flag box like the compositor; the Garage strip sets the roster and compact
//    layouts' shares.
{
  const layerCss = readFileSync(new URL('../src/ui/heroCard.css', import.meta.url), 'utf8');
  const garageCss = readFileSync(new URL('../src/ui/garage.css', import.meta.url), 'utf8');
  // an 11 px tier chip reads the floor token (11 px in Latin, the zh floor in Chinese: 18cbf57629, the round-9 zh critic)
  const tierVar = (size) => (size === 11 ? 'var(--fs-floor-11)' : `${size}px`);
  const vars = (L) => `--hc-band:${L.nameBand}px;--hc-share:${L.coreShare};--hc-hshare:${L.coreHeight};--hc-cxr:${Number(heroCenterX(L.centerX).toFixed(2))};--hc-pad:${L.pad}px;--hc-name:${L.nameSize}px;--hc-tier:${tierVar(L.tierSize)};`;
  assert.ok(garageCss.includes(vars(HERO_CARD_LAYOUT.roster)), `roster card vars ${vars(HERO_CARD_LAYOUT.roster)}`);
  assert.ok(garageCss.includes(vars(HERO_CARD_LAYOUT.rosterCompact)), `compact card vars ${vars(HERO_CARD_LAYOUT.rosterCompact)}`);
  assert.match(garageCss, /\.cot-card\{[^}]*container-type:size;/, 'the roster card is a size container from its first paint (no shift when the layers arrive)');
  assert.match(layerCss, /\.cot-hc \.hc-flag\{[^}]*height:calc\(100% - var\(--hc-band\) \* 0\.35\)/, 'flag box ends bandInset of the band above the bottom');
  assert.equal(HERO_FLAG_MASK.bandInset, 0.35);
  assert.match(layerCss, /\.cot-hc \.hc-flag\{[^}]*mask-image:var\(--hc-flag-mask\)/, 'the flag takes the policy mask');
  assert.match(layerCss, /\.cot-hc \.hc-flag\{[^}]*object-position:0 0;/, 'facing right: the flag anchors at the top-left (rear-top) corner');
  assert.match(layerCss, /\.cot-hc\[data-hero-facing='left'\] \.hc-flag\{object-position:100% 0;\}/, 'facing left mirrors the anchor');
  assert.match(garageCss, /\.cot-hc\[data-hero-facing='left'\] \.hc-tier,\.cot-hc\[data-hero-facing='left'\] \.dev-tag\{right:auto;left:6px;\}/, 'facing left: the tier chip takes the bow-side top corner, as the compositor draws it');
  assert.match(layerCss, /--hc-k:min\(calc\(100cqw \* var\(--hc-share\) \/ var\(--hc-cw\)\),calc\(\(100cqh - var\(--hc-band\)\) \* var\(--hc-hshare\) \/ var\(--hc-ch\)\),calc\(100cqw \* 0\.88 \/ var\(--hc-fw\)\)\)/, 'tank width is placeTank\'s k');
  assert.match(layerCss, /left:clamp\(calc\(100cqw \* 0\.06 - var\(--hc-fx0\) \* var\(--hc-k\)\),calc\(100cqw \* \(0\.5 \+ \(var\(--hc-cxr\) - 0\.5\) \* var\(--hc-gs,1\)\) - var\(--hc-cx\) \* var\(--hc-k\)\),calc\(100cqw \* 0\.94 - var\(--hc-fx1\) \* var\(--hc-k\)\)\)/, 'tank x is placeTank\'s clamped dx, the centre mirrored for a gun on the other side');
  const cardTs = readFileSync(new URL('../src/ui/heroCard.ts', import.meta.url), 'utf8');
  assert.match(cardTs, /\(row\.face\?\.\[1\] \?\? HERO_GUN_SIDE\) !== HERO_GUN_SIDE/, 'a row whose gun is on the other side mirrors the centre (--hc-gs)');
  assert.match(cardTs, /--hc-gs:-1/, 'the mirror is the --hc-gs custom property');
  // the flag fades in once loaded, as the tank does (the loading census 262); a card prerendered whole has no pending flag
  assert.match(cardTs, /flagImg\.setAttribute\('data-pending', ''\)[^]*?flagImg\.addEventListener\('error', settle/, 'a decorated card\'s flag waits for its file');
  assert.match(layerCss, /\.cot-hc \.hc-flag\[data-pending\]\{opacity:0;\}/, 'a pending flag stays transparent, then fades on the flag\'s own transition');
  assert.match(cardTs, /\.catch\(\(\) => \{ manifestRequest = null; return null; \}\)/, 'a manifest request the network dropped is forgotten');
  // Every surface that shows cards loads the card module and its stylesheet together, lazily (no static CSS import
  // in a graph, and no extra static chunk on the game page: the boundary is inline at each surface).
  assert.doesNotMatch(cardTs, /^import ['"][^'"]+\.css['"]/m, 'heroCard.ts imports no stylesheet statically');
  assert.match(cardTs, /img\.loading = priority \? 'eager' : 'lazy';/,
    'the selected card\'s layers load eagerly (a lazy LCP waits for layout); the rest stay lazy until drainHeroCards');
  for (const surface of ['../src/ui/garage.ts', '../src/ui/endScreen.ts', '../src/gallery/gallery.ts']) {
    const source = readFileSync(new URL(surface, import.meta.url), 'utf8');
    // (the Gallery's grid also loads its class glyphs in the same batch: owner 10-26, b15a149f64)
    assert.match(source, /Promise\.all\(\[import\('(?:\.\/|\.\.\/ui\/)heroCard\.ts'\), import\('(?:\.\/|\.\.\/ui\/)heroCard\.css'\)(?:, import\('[^']+'\))*\]\)/, `${surface} loads the card module with its stylesheet`);
    assert.doesNotMatch(source, /^import (?!type )[^;]*heroCard\.ts['"];/m, `${surface} never imports the card module statically (type imports are erased)`);
  }
  assert.match(layerCss, /top:calc\(100cqh - var\(--hc-band\) \+ 2px - var\(--hc-cb\) \* var\(--hc-k\)\)/, 'contact line 2 px under the art box');
  // A two-line name overlays the tank and never moves it (owner 2026-10-21: "double line text shouldn't push tanks
  // up ... the text should be overlaid over the tanks", retiring round 1's lift): the Garage marks the card from the
  // name's own height, the floor rises one name line and the name takes a halo; nothing in the layer rules moves.
  assert.doesNotMatch(layerCss, /--hc-n2|--hc-lift/, 'the tank layer never reads the name\'s line count');
  assert.match(garageCss, new RegExp(`\\.cot-card\\.hc-n2\\{--hc-n2:calc\\(var\\(--hc-name\\) \\* ${HERO_NAME_LINE_HEIGHT}\\);\\}`), 'the two-line floor rise is one name line');
  assert.match(garageCss, new RegExp(`\\.cot-card \\.nm\\{[^}]*font:600 var\\(--hc-name\\)/${HERO_NAME_LINE_HEIGHT} `), 'the name\'s line height is HERO_NAME_LINE_HEIGHT');
  assert.match(garageCss, /\.cot-card::after\{[^}]*height:calc\(var\(--hc-band\) \+ var\(--hc-n2,0px\) \+ 6px\)/, 'the name floor rises with a second line');
  assert.match(garageCss, /\.cot-card\.hc-n2 \.nm\{text-shadow:0 1px 3px rgba\(0,0,0,\.85\),0 0 7px rgba\(0,0,0,\.75\);\}/, 'a two-line name takes the halo (the compositor\'s NAME_HALO)');
  assert.doesNotMatch(garageCss, /--hc-lift/, 'no card rule lifts the art box');
  // The type floor (owner: no small text; the type system's 11 px): every card size, policy and strip alike, and the
  // compact chip's numeral alone (tierWord false). The faces are the type system's tokens.
  for (const [kind, L] of Object.entries(HERO_CARD_LAYOUT)) {
    for (const key of ['nameSize', 'minName', 'tierSize']) assert.ok(L[key] >= 11, `${kind}.${key} ${L[key]} px is under the 11 px floor`);
  }
  // a size is a literal px, the house max(<floor>, <token>) (a px or the --fs-floor-N token, whose floor is N px) or a
  // bare type token
  const sizes = [...garageCss.matchAll(/--hc-(?:name|tier):(?:([\d.]+)px|var\(--fs-floor-(\d+)\))/g),
    ...garageCss.matchAll(/\.cot-card \.dev-tag\{[^}]*font-size:(?:max\()?(?:var\(--fs-floor-(\d+)\)|([\d.]+)px|var\(--fs-(\d+)\))/g)]
    .map((m) => Number(m[1] ?? m[2] ?? m[3]));
  assert.ok(sizes.length >= 5 && sizes.every((size) => size >= 11), `garage card text sizes ${sizes.join(', ')} px: none under 11 px`);
  assert.equal(HERO_CARD_LAYOUT.rosterCompact.tierWord, false, 'the compact chip shows the numeral alone');
  assert.match(garageCss, /body\[data-cot-panels='overlay'\] \.cot-card \.hc-tier\{[^}]*font-size:0\}\nbody\[data-cot-panels='overlay'\] \.cot-card \.hc-tier b\{font-size:var\(--hc-tier\)\}/, 'the compact strip hides the chip\'s word and keeps its numeral');
  assert.match(garageCss, /\.cot-card \.nm\{[^}]*font:600 var\(--hc-name\)\/1\.05 var\(--font-ui\);/, 'the name takes the type system\'s UI face (600: Chakra Petch SemiBold)');
  assert.match(garageCss, /\.cot-card \.hc-tier\{[^}]*font:500 var\(--hc-tier\)\/1 var\(--font-mono\);/, 'the tier chip takes the type system\'s mono face');
  assert.match(cardTs, /new ResizeObserver\(/, 'the card marks a wrapped name from its measured height');
  assert.match(cardTs, /classList\.toggle\('hc-n2', height > line \* 1\.5\)/, 'a name taller than one and a half lines is two lines');
  assert.equal(HERO_SIDE_MARGIN, 0.06, 'the CSS margins (0.06, 0.88, 0.94) are HERO_SIDE_MARGIN');
}

// 7b. The compositor overlays a two-line name exactly as the runtime card does: the tank's box and contact line are
//     the one-line card's (owner 2026-10-21: no lift), and the floor under the name rises one name line. A white
//     ground makes the floor's rise measurable; the magenta test survives the floor and the halo darkening it.
{
  const lw = 400, lh = 250;
  const layer = createCanvas(lw, lh);
  const lctx = layer.getContext('2d');
  lctx.fillStyle = '#ff00ff';
  lctx.fillRect(120, 120, 220, 90);
  lctx.fillRect(10, 140, 120, 6);
  const bounds = measureBounds(layer);
  const flag = createCanvas(8, 6);
  const ground = { top: '#ffffff', mid: '#ffffff', bottom: '#ffffff', lift: 'rgba(0,0,0,0)' };
  const L = HERO_CARD_LAYOUT.roster;
  const compose = (name) => {
    const card = composeCard('roster', { tank: layer, bounds, flag, name, tier: 'X', ground }, 2);
    const { data, width, height } = card.getContext('2d').getImageData(0, 0, card.width, card.height);
    let top = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] > 90 && data[o + 2] > 90 && data[o + 1] < 40) { if (top < 0) top = y; bottom = y; break; }
    }
    // The right edge, half a name line above the one-line floor's top (the frame and the type stay clear of it).
    const probe = (Math.round(height - 2 * (L.nameBand + 6 + 0.5 * L.nameSize * HERO_NAME_LINE_HEIGHT)) * width + width - 5) * 4;
    return { top, bottom, floor: data[probe + 1] };
  };
  const one = compose('T-90M');
  const two = compose('Experimental Heavy Vehicle Name (Concept Prototype Two)');
  assert.ok(one.bottom > 0 && two.bottom > 0, 'the tank draws on both cards');
  assert.deepEqual([two.top, two.bottom], [one.top, one.bottom], `a two-line name never moves or shrinks the tank (${JSON.stringify(one)} vs ${JSON.stringify(two)})`);
  assert.ok(one.floor > 245, `a one-line card has no floor above its band (${one.floor})`);
  assert.ok(two.floor < one.floor - 15, `a two-line name raises the floor one name line (${one.floor} -> ${two.floor})`);
}

// 8. The turret pose (owner 2026-10-18: "the turrets should be turned towards you more"; 2026-10-20: "Whole tank
//    faces left"): hull bow left, the turret turned modestly toward the lens so its face shows while the gun still
//    points left and forward with the hull, the gun level; turretless mounts keep the gun on the hull axis and a
//    limited arc turns as far as it legally can. The renderer picks the traverse side by the bore against the lens
//    and records both sides by projection (the receipt checks every row), never by the yaw sign.
{
  const az = HERO_CAMERA.azimuthDeg;
  const T = HERO_POSE.turretTowardCameraDeg;
  assert.ok(T >= 10 && T <= 45, `traverse ${T} deg: turned toward the viewer, short of the lens (${az}) so the gun keeps pointing forward`);
  assert.equal(HERO_POSE.gunPitchDeg, 0, 'the gun is level');
  assert.equal(HERO_GUN_SIDE, 'left', 'hull bow left, gun left');
  assert.equal(heroGunSide(T, 'left'), 'left', 'a modest traverse keeps the gun on the bow\'s side');
  assert.equal(heroGunSide(0, 'left'), 'left', 'a gun on the hull axis points with the bow');
  assert.equal(heroGunSide(az + 10, 'left'), 'right', 'past the lens the gun would cross to the far side (the retired v4 pose)');
  assert.equal(heroGunSide(T, 'right'), 'right', 'the gun side mirrors with the facing');
  assert.equal(heroTurretTraverseLimitDeg({ armor: {} }), Infinity, 'a turret traverses freely');
  assert.equal(heroTurretTraverseDeg({ armor: {} }), T, 'a turret takes the policy traverse');
  assert.equal(heroTurretTraverseDeg({ armor: { turretless: true } }), 0, 'turretless: the gun stays on the hull axis');
  assert.equal(heroTurretTraverseDeg({ armor: { turretless: true }, gunArcDeg: 4 }), 0, 'a casemate arc is not a turret');
  assert.equal(heroTurretTraverseDeg({ armor: {}, gunArcDeg: 10 }), Math.min(10, T), 'a limited turret arc turns as far as it legally can');
  const page = readFileSync(new URL('./hero-cards-page.html', import.meta.url), 'utf8');
  assert.match(page, /const bore = boreDirection\(turret, gun\)[\s\S]*?bore\.dot\(/, 'the traverse side is chosen by the bore against the lens vector');
  assert.match(page, /minimumMechanicalGunPitch\(spec, yaw\)/, 'the gun rises only where the spec\'s rear-deck curve needs it');
  assert.match(page, /gunSide: muzzle\.x >= pivot\.x \? 'right' : 'left'/, 'the gun side is measured by projecting the muzzle');
  assert.match(page, /bowSide: hull1\.x >= hull0\.x \? 'right' : 'left'/, 'the bow side is measured by projecting the hull axis');
}

console.log('hero-cards selftest: ok');
