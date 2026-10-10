import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCrewFigure,
  buildCrewSceneGeometry,
  CREW_SOLE_BELOW_ANKLE_M,
  CREW_STANDING_HIP_M,
  crewDress,
  crewPointInScene,
  GARAGE_CREW_SCENES,
} from './garageCrewFigures.ts';
import { GARAGE_VARIANTS } from './garageVariants.ts';
import {
  BURLAK_SCAFFOLD_CLEARANCE_OFFSET,
  getAbramsWeldingBayPlacement,
  getGarageWorkshopLayoutPose,
  LEOPARD_MOBILITY_BAY_OFFSET,
} from './garageWorkshopLayout.ts';
import { GARAGE_PLATFORM_GEOMETRY, GARAGE_PRESENTATION_POSE } from './garagePresentationPose.ts';

// 2026-10-09, the owner: "human workers working with each other on tanks". The Garage crews must read as people at a
// glance: anthropometric proportions, hands that close on their tools, soles on their floor, and a bounded budget.

// --- one standing figure keeps standard stature fractions (H = 1.76 m) ---------------------------------------------
const A = CREW_SOLE_BELOW_ANKLE_M;
const standing = buildCrewFigure(crewDress('us', 1), {
  pelvis: [0, CREW_STANDING_HIP_M, 0], leftFoot: [0.11, A, 0], rightFoot: [-0.11, A, 0],
});
const H = 1.76;
const k = standing.skeleton;
assert.ok(Math.abs(k.leftShoulder[1] / H - 0.818) < 0.03, `shoulder height ${k.leftShoulder[1]} is 0.818 H`);
assert.ok(Math.abs(k.hips[1] / H - 0.53) < 0.03, `hip height ${k.hips[1]} is 0.53 H`);
assert.ok(Math.abs((k.leftKnee[1]) / H - 0.285) < 0.03, `knee height ${k.leftKnee[1]} is 0.285 H`);
const shoulderSpan = Math.abs(k.leftShoulder[0] - k.rightShoulder[0]);
assert.ok(shoulderSpan > 0.32 && shoulderSpan < 0.42, `shoulder joint span ${shoulderSpan} m`);
const top = standing.geometry.boundingBox.max.y;
assert.ok(top > 1.7 && top < 1.84, `standing figure is ${top.toFixed(2)} m tall with its cap`);
assert.ok(Math.abs(k.soleY) < 1e-6, 'a standing figure stands on the floor');
assert.ok(standing.geometry.getAttribute('color'), 'figures carry vertex colours for the seeded program');
assert.equal(standing.geometry.getAttribute('uv'), undefined, 'figures drop UVs (one merged vertex-coloured layout)');

// --- every scene: hands on tools, soles on surfaces, bounded triangles -------------------------------------------
const sceneIds = Object.keys(GARAGE_CREW_SCENES);
assert.deepEqual(sceneIds, ['burlak', 'abrams', 'leopard', 't90m', 'k2', 'mezzanine'],
  'one crew per exhibit, plus the Verdant mezzanine crew seen above the hero');
let members = 0, essentialMembers = 0, triangles = 0;
for (const scene of Object.values(GARAGE_CREW_SCENES)) {
  assert.ok(scene.members.length >= 2, `${scene.id}: a crew works in a pair or a group`);
  const build = buildCrewSceneGeometry(scene);
  triangles += build.triangles;
  members += scene.members.length;
  if (scene.essential) essentialMembers += scene.members.length;
  scene.members.forEach((member, index) => {
    const skeleton = build.skeletons[index];
    for (const [side, error] of [['left', skeleton.leftGripErrorM], ['right', skeleton.rightGripErrorM]]) {
      assert.ok(error <= 0.015, `${scene.id}/${member.role}: the ${side} hand reaches its grip (miss ${error} m)`);
    }
    const lying = Math.abs((member.pose.hips?.[1] ?? 0)) > 1;
    const sole = member.at[1] + skeleton.soleY;
    assert.ok(sole >= -0.005, `${scene.id}/${member.role}: boots stay above the floor (${sole.toFixed(3)} m)`);
    if (!lying) {
      assert.ok(Math.abs(skeleton.soleY) <= 0.02,
        `${scene.id}/${member.role}: the soles stand on the member's surface (${skeleton.soleY} m)`);
    }
  });
  for (const tool of scene.tools) {
    assert.ok(tool.member >= 0 && tool.member < scene.members.length, `${scene.id}: every tool has a holder`);
    const holder = scene.members[tool.member].pose;
    const grips = [holder.leftHand, holder.rightHand].filter(Boolean);
    const first = tool.points[0];
    const near = (a, b, limit) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < limit;
    // a one-handed tool sits in a hand; a two-handed one (pendant, cassette) between both hands
    const middle = grips.length === 2 ? grips[0].map((value, axis) => (value + grips[1][axis]) / 2) : null;
    const held = grips.some((grip) => near(grip, first, 0.02)) || (middle !== null && near(middle, first, 0.04));
    assert.ok(held, `${scene.id}: the ${tool.kind} sits in its holder's hand`);
  }
  for (const prop of scene.props ?? []) {
    const onDeck = scene.members.filter((member) => Math.abs(member.at[1] - prop.deckY) < 1e-6);
    assert.ok(onDeck.length > 0, `${scene.id}: a work stand carries the member standing at its deck height`);
    for (const member of onDeck) {
      const dx = member.at[0] - prop.at[0], dz = member.at[2] - prop.at[2];
      assert.ok(Math.abs(dx) < 0.42 && Math.abs(dz) < 0.6, `${scene.id}/${member.role}: stands on the stand's deck`);
    }
  }
}
assert.equal(members, 18, 'eighteen workers: fifteen across the five bays, three on the Verdant mezzanine');
assert.ok(triangles <= 30000, `the crews stay inside 30k triangles (${triangles})`);
assert.ok(essentialMembers >= 6 && essentialMembers * 2 <= members + 1,
  `the mobile tier keeps at most about half the crew (${essentialMembers} of ${members})`);

// --- the crews stand clear of the podium and the canonical camera in all ten destinations ------------------------
// Bay-owner transforms as garageDressing.ts applies them (the Burlak forward offset, the Abrams destination placement,
// the Leopard mobility bay inside its half-turned owner, the K2 half-turn), then each destination's layout pose.
const rotate = (x, z, yaw) => ({ x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) });
function sceneToWorkshop(scene, point, variant) {
  let p = rotate(point.x, point.z, scene.frame.yaw);
  p = { x: p.x + scene.frame.x, z: p.z + scene.frame.z };
  if (scene.frame.parent === 'verdant-interior') {
    // Verdant's interior turns half a turn about the podium (garageDressing.ts verdantInteriorRoot)
    return variant.id === 'verdant_motor_pool' ? { x: -p.x, z: -p.z } : null;
  }
  if (scene.frame.parent === 'leopard-bay') {
    p = rotate(p.x, p.z, -0.55); p = { x: p.x + 18.05, z: p.z - 11.95 };
    p = rotate(p.x, p.z, Math.PI); p = { x: p.x + LEOPARD_MOBILITY_BAY_OFFSET.x, z: p.z + LEOPARD_MOBILITY_BAY_OFFSET.z };
  } else if (scene.id === 'burlak') {
    p = { x: p.x + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.x, z: p.z + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.z };
  } else if (scene.id === 'abrams') {
    const placement = getAbramsWeldingBayPlacement(variant);
    p = rotate(p.x, p.z, placement.rotationRad); p = { x: p.x + placement.x, z: p.z + placement.z };
  } else if (scene.id === 'k2') {
    p = rotate(p.x, p.z, Math.PI); p = { x: p.x - 0.35, z: p.z - 0.35 };
  }
  const [lx, lz, lyaw] = getGarageWorkshopLayoutPose(variant);
  p = rotate(p.x, p.z, lyaw);
  return { x: p.x + lx, z: p.z + lz };
}
const [camX, camY, camZ] = GARAGE_PRESENTATION_POSE.cameraOffsetM;
const keepClear = GARAGE_PLATFORM_GEOMETRY.baseRadiusM + 2.5;
for (const variant of GARAGE_VARIANTS) {
  for (const scene of Object.values(GARAGE_CREW_SCENES)) {
    for (const member of scene.members) {
      const local = crewPointInScene(member, [0, 0, 0]);
      const p = sceneToWorkshop(scene, { x: local.x, z: local.z }, variant);
      if (!p) continue;
      const radius = Math.hypot(p.x, p.z);
      assert.ok(radius > keepClear, `${variant.id}/${scene.id}/${member.role}: outside the podium keep-clear (${radius.toFixed(1)} m)`);
      assert.ok(Math.hypot(p.x - camX, p.z - camZ) > 4, `${variant.id}/${scene.id}/${member.role}: clear of the canonical camera`);
      if (variant.id === 'verdant_motor_pool') {
        assert.ok(Math.abs(p.x) < 22.5 && Math.abs(p.z) < 22.5, `${scene.id}/${member.role}: inside Verdant's walls`);
      }
    }
  }
}
void camY;

// --- the dressing adds each crew inside its bay owner, lazily, on the seeded vertex-colour program -----------------
const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(dressing, /from '\.\/garageCrewFigures\.ts'/, 'the dressing owns the crews');
assert.doesNotMatch(main, /garageCrewFigures/, 'the crews never reach boot');
assert.doesNotMatch(access, /^import[^\n]*garageCrewFigures/m, 'the access layer does not statically import the crews');
assert.match(dressing,
  /crewMaterial \|\|= track\(shadowMat\(new THREE\.MeshStandardMaterial\(\{\s*color: 0xffffff, vertexColors: true, roughness: 0\.88, metalness: 0\.06,/,
  'one crew material on the vertex-colour program garageStage seeds');
assert.match(dressing, /if \(!scene\.essential && getDeviceTier\(\) === 'mobile'\) return null;/,
  'the mobile tier keeps the essential crews');
for (const [scene, owner] of [
  ['burlak', /addCrewScene\(GARAGE_CREW_SCENES\.burlak, legacyVerdantRoot\)[\s\S]*const burlakBayChildren = legacyVerdantRoot\.children\.slice\(firstBayChildIndex\)/],
  ['abrams', /addCrewScene\(abramsCrew, legacyVerdantRoot\)[\s\S]*placeAuthoredServiceBay\(firstBayChildIndex, 'abrams_welding', 'm1a2'\)/],
  ['leopard', /addCrewScene\(GARAGE_CREW_SCENES\.leopard, mobilityBay\)/],
  ['k2', /addCrewScene\(GARAGE_CREW_SCENES\.k2, legacyVerdantRoot\)[\s\S]*placeAuthoredServiceBay\(firstBayChildIndex, 'rolled_k2', 'k2'\)/],
]) {
  assert.match(dressing, owner, `the ${scene} crew joins its bay before the bay owner captures it`);
}
assert.match(dressing, /addCrewScene\(GARAGE_CREW_SCENES\.t90m, legacyVerdantRoot/, 'the T-90M crew joins its components');
assert.match(dressing, /const weldTip = put\([\s\S]{0,160}torchTip\.x, torchTip\.y, torchTip\.z/, 'the weld glow sits at the welder\'s torch tip');
assert.match(dressing, /torchGrip,\s*\]\);/, 'the welding cable ends in the welder\'s hand');
assert.match(dressing, /figures\.userData\.keepDisplayMesh = true;/,
  'each crew keeps its own draw, so the frustum culls the crews one by one');
const optimization = await readFile(new URL('./garageDressingOptimization.ts', import.meta.url), 'utf8');
assert.match(optimization, /if \(mesh\.userData\.keepDisplayMesh === true\) return false;/,
  'the display merge honours keepDisplayMesh');

// --- a crew never reads as clones: skin, build and sleeves vary ---------------------------------------------------
const dresses = Object.values(GARAGE_CREW_SCENES).flatMap((scene) => scene.members.map((member) => member.dress));
assert.ok(new Set(dresses.map((dress) => dress.skin)).size >= 4, 'skin tones vary across the crew');
assert.ok(new Set(dresses.map((dress) => dress.build)).size >= 3, 'builds vary across the crew');
assert.ok(dresses.some((dress) => dress.sleevesRolled) && dresses.some((dress) => !dress.sleevesRolled),
  'some workers roll their sleeves');
for (const scene of Object.values(GARAGE_CREW_SCENES)) {
  for (const member of scene.members) {
    if (member.dress.headgear === 'welding-hood') {
      assert.ok(!member.dress.sleevesRolled, `${scene.id}/${member.role}: a welder keeps his sleeves down`);
    }
  }
}

console.log(`garageCrewFigures.selftest: ${members} workers in ${sceneIds.length} crews, ${triangles} triangles; hands, soles and clearances pass`);
