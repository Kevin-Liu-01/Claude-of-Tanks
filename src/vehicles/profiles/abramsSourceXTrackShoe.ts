// Authenticated extraction of the preserved Abrams source-X shoe recipes.
// Not activated for any existing family or global fleet gear policy.
import * as THREE from 'three';
import { mergeAll, xform } from '../factoryGeometry.ts';
import { gearFastener } from '../runningGearPrimitives.ts';
import type { TrackPattern } from '../trackPatterns.ts';
import type { TrackShoeDimensions, TrackLinkCrossSection, TrackShoeBuildParameters } from '../tankFactoryCore.ts';
type Side = -1 | 1;
const SHOE_BOX_TOP = 2, SHOE_BOX_BOTTOM = 3;
export interface TrackGuideProfile {
  readonly stations: readonly (readonly [inwardM: number, halfWidthM: number])[];
  readonly wallM: number;
  readonly cavityTipInwardM: number;
  readonly rootDepthRatio: number;
  readonly tipDepthRatio: number;
  /** Two straight thin walls meet at one ridge; the cavity also has one tip. */
  readonly triangularTip?: boolean;
}

type DimensionedTrackPattern = Omit<TrackPattern, keyof TrackShoeDimensions>
  & Required<Omit<TrackShoeDimensions, 'pinCentreY'>>
  & Pick<TrackShoeDimensions, 'pinCentreY'>;

/** Owner-style outsole only: keep the source inner pad plane, web, pins and
 * guide fixed. Ground seating must account for the extra outward depth. */
export interface TrackOutsoleDimensions {
  readonly padHeight: number;
  readonly grouserHeight: number;
}

function outsolePattern(pattern: DimensionedTrackPattern, outsole?: TrackOutsoleDimensions): DimensionedTrackPattern {
  if (!outsole) return pattern;
  for (const key of ['padHeight', 'grouserHeight'] as const) {
    if (!Number.isFinite(outsole[key]) || outsole[key] < pattern[key] || outsole[key] > .15)
      throw new RangeError('Invalid outward-only track outsole');
  }
  return {...pattern, ...outsole};
}


function trackPadRecipeWidth(trackW: number, section?: TrackLinkCrossSection): number {
  if (!section) return trackW;
  const keys = ['padWidthM', 'pinCapLengthM', 'pinHalfSpacingM', 'connectorInnerM',
    'connectorOuterM', 'connectorHeightM', 'connectorDepthM', 'connectorCentreYDeltaM'] as const;
  for (const name of keys) {
    const value = section[name];
    if (!Number.isFinite(value) || (name !== 'connectorCentreYDeltaM' && value <= 0))
      throw new RangeError(`Invalid native track-link cross-section: ${name}`);
  }
  if (section.padWidthM > trackW || section.connectorInnerM >= section.padWidthM / 2
    || section.connectorOuterM <= section.connectorInnerM || section.connectorOuterM > trackW / 2
    || section.pinCapLengthM > trackW / 2 || section.connectorDepthM <= section.pinHalfSpacingM * 2
    || section.connectorHeightM > .5 || section.connectorDepthM > .5
    || Math.abs(section.connectorCentreYDeltaM) > .1)
    throw new RangeError('Invalid native track-link cross-section proportions');
  return section.padWidthM / .97;
}
function shoeBox(
  w: number,
  h: number,
  d: number,
  omittedFaceGroups: readonly number[] | null = null,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (!omittedFaceGroups?.length) return geometry;
  const omitted = new Set<number>(omittedFaceGroups);
  const sourceIndex = geometry.index?.array;
  if (!sourceIndex) return geometry;
  const retained: number[] = [];
  for (const group of geometry.groups) {
    if (group.materialIndex != null && omitted.has(group.materialIndex)) continue;
    for (let i = group.start; i < group.start + group.count; i++) {
      retained.push(sourceIndex[i]);
    }
  }
  geometry.setIndex(retained);
  geometry.clearGroups();
  return geometry;
}
function oneCappedCylinderX(
  radius: number,
  length: number,
  segments: number,
  outerSide: Side,
): THREE.BufferGeometry {
  const wall = xform(
    new THREE.CylinderGeometry(radius, radius, length, segments, 1, true),
    0, 0, 0, 0, 0, Math.PI / 2,
  );
  const cap = xform(
    new THREE.CircleGeometry(radius, segments),
    outerSide * length / 2, 0, 0, 0, outerSide * Math.PI / 2, 0,
  );
  return mergeAll([wall, cap]);
}
function moveOutsoleStock(geometry: THREE.BufferGeometry, originalHeight: number, outerHeight: number): void {
  const position=geometry.getAttribute('position'),offset=(outerHeight-originalHeight)/2;
  const outerBottom=Math.fround(-outerHeight/2),originalBottom=Math.fround(-originalHeight/2);
  // Adding two independently rounded values can drift the retained inner
  // face by a nanometre. Author that plane from its unchanged source scalar,
  // while every other vertex receives the ordinary outward translation.
  for(let i=0;i<position.count;i++){
    const y=position.getY(i);position.setY(i,y===outerBottom?originalBottom:y+offset);
  }
  position.needsUpdate=true;
  if(geometry.boundingBox)geometry.computeBoundingBox();
  if(geometry.boundingSphere)geometry.computeBoundingSphere();
}

function simplifiedTrackShoeGeometry(
  trackW: number,
  pitch: number,
  pattern: DimensionedTrackPattern,
  radialScale = 1,
  widthScale = 1,
  section?: TrackLinkCrossSection,
  pinCapOuter: number | null = null,
  guideProfile?: TrackGuideProfile,
  outsole?: TrackOutsoleDimensions,
  fleetDetail?: FleetShoeDetail,
): THREE.BufferGeometry {
  // At this distance one shoe spans only a handful of pixels. Retain its
  // authored pitch, width, pad depth and grouser peak so the track silhouette
  // and deterministic per-link color cadence remain intact. Guide horns,
  // split-pad gaps, pins and family-specific rib layouts stay on the exact
  // close level, where they are actually resolvable.
  const padW = trackPadRecipeWidth(trackW, section);
  const outer = outsolePattern(pattern,outsole);
  const pad = shoeBox(padW * 0.97, outer.padHeight, pitch * pattern.padCoverage);
  const grouserPeakScale = pattern.surface === 'heavy-chevron'
    ? 1.08 : pattern.surface === 'open-chevron' ? 1.04 : 1;
  const grouserHeight = outer.grouserHeight * grouserPeakScale;
  const grouser = xform(
    shoeBox(padW * 0.86, grouserHeight, pitch * 0.14,
      section&&fleetDetail?null:[SHOE_BOX_BOTTOM]),
    0, outer.padHeight / 2 + grouserHeight / 2, 0,
  );
  if(outsole){moveOutsoleStock(pad,pattern.padHeight,outer.padHeight);moveOutsoleStock(grouser,pattern.padHeight,outer.padHeight);}
  const parts: THREE.BufferGeometry[] = [pad, grouser];
  // A measured, narrower pad needs its physical connectors at both levels:
  // the empty lateral intervals must not become a continuous wide LOD slab.
  if (section) {
    const assembly={parts, trackW, pitch, padH: pattern.padHeight,grouserH: pattern.grouserHeight};
    if(fleetDetail)appendTrackShoeConnectors(assembly,pattern,section);
    else appendTrackShoePins(assembly,pattern,pinCapOuter,section);
  }
  if (guideProfile) parts.push(trackGuideGeometry(pitch, guideProfile));
  const geometry = mergeAll(parts);

  if (radialScale !== 1) geometry.scale(1, radialScale, 1);
  if (widthScale !== 1) geometry.scale(widthScale, 1, 1);
  return geometry;
}

interface TrackShoeAssembly {
  parts: THREE.BufferGeometry[];
  trackW: number;
  pitch: number;
  padH: number;
  grouserH: number;
}

type FleetShoeDetail = 'high' | 'low';

function fleetPadGeometry(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern, high: boolean): void {
  if (!high) {
    appendLowShoePad(assembly,pattern);
    return;
  }
  // Preserve the real longitudinal shoulder endpoints. Extending its raised
  // roof all the way to the pad ends cut the source ground on angled shoes.
  if(pattern.surface==='paired-pad'){
    appendTrackShoePad(assembly,pattern);
    for(const side of[-1,1])appendTrackShoeBox(assembly,assembly.trackW*.085,
      pattern.shoulderHeight,assembly.pitch*.80,side*assembly.trackW*.442,
      assembly.padH/2+pattern.shoulderHeight/2,0,0,[SHOE_BOX_BOTTOM]);
    return;
  }
  const {trackW: w, padH: h, pitch, parts} = assembly, lift = pattern.shoulderHeight;
  const pad = (points: number[][]): void => {
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, {depth: pitch * pattern.padCoverage, steps: 1, bevelEnabled: false});
    g.translate(0, 0, -pitch * pattern.padCoverage / 2); parts.push(g);
  };
  pad([[-w*.485,-h/2],[w*.485,-h/2],[w*.485,h/2+lift],
    [w*.3995,h/2+lift],[0,h/2],[-w*.3995,h/2+lift],[-w*.485,h/2+lift]]);
}

function appendLowShoePad(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const {trackW:w,pitch,padH:h,parts}=assembly;
  const peak=pattern.surface==='heavy-chevron'?1.08:pattern.surface==='open-chevron'?1.04:1;
  const rise=assembly.grouserH*peak,half=pitch*pattern.padCoverage/2;
  // Side-profile envelope: no peak-height corner at a pad's extreme end.
  // All six vertices are bounded by established pad/grouser endpoints, so a
  // rigid rotation cannot manufacture a deeper ground corner than those.
  // Split chevrons project beyond their axial centres by both half-width
  // and half-depth. Retain that actual high-recipe envelope in low detail.
  const top=pattern.surface==='split-chevron'
    ? pitch*.19+pitch*.06*Math.cos(.28)+w*.235*Math.sin(.28)
    : pattern.surface==='staggered-rib'
      ? pitch*.30+pitch*.0375*Math.cos(.08)+w*.265*Math.sin(.08) : pitch*.31;
  const shape=new THREE.Shape([[-half,-h/2],[half,-h/2],[half,h/2],
    [top,h/2+rise],[-top,h/2+rise],[-half,h/2]].map(([z,y])=>new THREE.Vector2(z,y)));
  const split=['paired-pad','rubber-block','split-chevron'].includes(pattern.surface);
  const gap=split?w*.055:0,width=split?(w*.97-gap)/2:w*.97;
  for(const center of(split?[-(width+gap)/2,(width+gap)/2]:[0])){
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,steps:1,bevelEnabled:false});
    g.translate(0,0,-width/2).rotateY(-Math.PI/2).translate(center,0,0);parts.push(g);
  }
}

function fleetShoeTraction(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const {trackW: w,pitch} = assembly;
  if(pattern.surface==='staggered-rib'){
    // The four staggered bars' rotated endpoints establish the source knee
    // contact. Two generic transverse bars silently shortened that envelope.
    appendTrackShoeSurface(assembly,pattern);return;
  }
  if (pattern.surface === 'paired-pad' || pattern.surface === 'rubber-block') {
    // The two former bars ended at +/- .31 pitch. Their merged stock keeps
    // those actual outer endpoints; .25 left source-ground stations bare.
    for (const x of [-w*.25,w*.25]) appendTrackShoeBar(assembly,w*.40,pitch*.62,x);
  } else if (['chevron','heavy-chevron','open-chevron','split-chevron'].includes(pattern.surface)) {
    if(pattern.surface==='split-chevron'){
      appendTrackShoeSurface(assembly,pattern);return;
    }
    const multiplier = pattern.surface === 'heavy-chevron' ? 1.08 : pattern.surface === 'open-chevron' ? 1.04 : 1;
    appendTrackShoeChevron(assembly,0,1,assembly.grouserH*multiplier);
  } else {
    for (const z of [-.25,.25]) appendTrackShoeBar(assembly,w*.86,pitch*.10,0,pitch*z);
  }
}

function fleetShoeHorn(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const {trackW:w,pitch,padH,parts}=assembly;
  const bottom = -(padH/2+pattern.webHeight-.006), top=bottom-pattern.hornHeight;
  const rootW=Math.min(w*.16,.082),tipW=Math.min(w*.09,.046);
  // Closed ruled casting with the original horn's root/tip envelopes.
  const g=new THREE.BoxGeometry(1,1,1);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const inward=p.getY(i)>.0,wx=inward?tipW:rootW,d=inward?pitch*.21:pitch*.34;
    p.setXYZ(i,p.getX(i)*wx,inward?top:bottom,p.getZ(i)*d);
  }
  // The primitive's +Y cap becomes the inward tip, so reverse winding.
  const index=g.index!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
  g.computeVertexNormals();parts.push(g);
}

function connectedLowShoePad(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const {trackW:w,pitch,padH:h,parts}=assembly;
  // Two closed cast pads, not a full-width box through the measured link air.
  // Keep the original projected chevron endpoints and peak. LOW removes only
  // the small end-wall kink; HIGH retains that kink and every separate cap.
  const half=pitch*pattern.padCoverage/2;
  const top=pitch*.19+pitch*.06*Math.cos(.28)+w*.235*Math.sin(.28);
  const rise=assembly.grouserH,gap=w*.055,width=(w*.97-gap)/2;
  const shape=new THREE.Shape([[-half,-h/2],[half,-h/2],
    [top,h/2+rise],[-top,h/2+rise]].map(([z,y])=>new THREE.Vector2(z,y)));
  for(const side of[-1,1]){
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,steps:1,bevelEnabled:false});
    g.translate(0,0,-width/2).rotateY(-Math.PI/2).translate(side*(width+gap)/2,0,0);
    parts.push(g);
  }
}

function fleetTrackShoeGeometry(
  trackW:number,pitch:number,pattern:DimensionedTrackPattern,pinCapOuter:number|null,
  radialScale:number,widthScale:number,section:TrackLinkCrossSection|undefined,
  guide:TrackGuideProfile|undefined,detail:FleetShoeDetail,
  outsole?:TrackOutsoleDimensions,
):THREE.BufferGeometry {
  const assembly:TrackShoeAssembly={parts:[],trackW:trackPadRecipeWidth(trackW,section),pitch,
    padH:pattern.padHeight,grouserH:pattern.grouserHeight};
  const outer=outsolePattern(pattern,outsole),outerAssembly={...assembly,
    padH:outer.padHeight,grouserH:outer.grouserHeight};
  const connected=!!section&&outer.surface==='split-chevron';
  if(connected&&detail==='low')connectedLowShoePad(outerAssembly,outer);
  else fleetPadGeometry(outerAssembly,outer,detail==='high'&&!connected);
  if(detail==='high'&&!connected)fleetShoeTraction(outerAssembly,outer);
  if(outsole)for(const g of assembly.parts)moveOutsoleStock(g,pattern.padHeight,outer.padHeight);
  appendTrackShoeBox(assembly,assembly.trackW*.78,pattern.webHeight,pitch*pattern.webDepth,
    0,-(pattern.padHeight+pattern.webHeight)/2+.004);
  if(guide)assembly.parts.push(trackGuideGeometry(pitch,guide));else fleetShoeHorn(assembly,pattern);
  // Narrow-pad measured connectors remain actual separate stock in both
  // qualities. Generic low pins are subpixel relief, not a second course.
  if(connected&&detail==='low')appendTrackShoeConnectors(assembly,pattern,section!);
  else if(detail==='high'||section)appendTrackShoePins({...assembly,trackW},pattern,pinCapOuter,section,4);
  const geometry=mergeAll(assembly.parts);

  if(radialScale!==1)geometry.scale(1,radialScale,1);
  if(widthScale!==1)geometry.scale(widthScale,1,1);
  return geometry;
}

function appendTrackShoeBox(
  assembly: TrackShoeAssembly,
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
  ry = 0,
  omittedFaces: readonly number[] | null = null,
): void {
  assembly.parts.push(xform(shoeBox(w, h, d, omittedFaces), x, y, z, 0, ry, 0));
}

function appendTrackShoeBar(
  assembly: TrackShoeAssembly,
  w: number,
  d: number,
  x = 0,
  z = 0,
  ry = 0,
  height = assembly.grouserH,
): void {
  appendTrackShoeBox(assembly, w, height, d, x,
    assembly.padH / 2 + height / 2, z, ry, [SHOE_BOX_BOTTOM]);
}

function appendTrackShoeChevron(
  assembly: TrackShoeAssembly,
  z: number,
  direction = 1,
  height = assembly.grouserH,
): void {
  const { trackW, pitch } = assembly;
  appendTrackShoeBar(assembly, trackW * 0.47, pitch * 0.12,
    -trackW * 0.225, z, direction * 0.28, height);
  appendTrackShoeBar(assembly, trackW * 0.47, pitch * 0.12,
    trackW * 0.225, z, -direction * 0.28, height);
}

function appendTrackShoePad(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const { trackW, pitch, padH } = assembly;
  if (pattern.surface !== 'paired-pad' && pattern.surface !== 'rubber-block'
      && pattern.surface !== 'split-chevron') {
    appendTrackShoeBox(assembly, trackW * 0.97, padH, pitch * pattern.padCoverage);
    return;
  }
  const gap = trackW * 0.055;
  const halfW = (trackW * 0.97 - gap) / 2;
  appendTrackShoeBox(assembly, halfW, padH, pitch * pattern.padCoverage,
    -(halfW + gap) / 2);
  appendTrackShoeBox(assembly, halfW, padH, pitch * pattern.padCoverage,
    (halfW + gap) / 2);
}

function appendTrackShoeSurface(assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern): void {
  const { trackW, pitch, grouserH } = assembly;
  switch (pattern.surface) {
    case 'triple-bar':
      for (const z of [-0.28, 0, 0.28]) {
        appendTrackShoeBar(assembly, trackW * 0.88, pitch * 0.10, 0, pitch * z);
      }
      return;
    case 'cast-block':
      appendTrackShoeBar(assembly, trackW * 0.86, pitch * 0.13, 0, pitch * 0.25);
      appendTrackShoeBar(assembly, trackW * 0.86, pitch * 0.13, 0, -pitch * 0.25);
      appendTrackShoeBar(assembly, trackW * 0.24, pitch * 0.34, 0, 0, 0, grouserH * 0.72);
      return;
    case 'chevron':
      appendTrackShoeChevron(assembly, pitch * 0.17, 1);
      appendTrackShoeChevron(assembly, -pitch * 0.17, -1);
      return;
    case 'paired-pad':
      for (const x of [-trackW * 0.245, trackW * 0.245]) {
        appendTrackShoeBar(assembly, trackW * 0.40, pitch * 0.12, x, pitch * 0.25);
        appendTrackShoeBar(assembly, trackW * 0.40, pitch * 0.12, x, -pitch * 0.25);
      }
      return;
    case 'heavy-chevron':
      appendTrackShoeChevron(assembly, pitch * 0.18, 1, grouserH * 1.08);
      appendTrackShoeChevron(assembly, -pitch * 0.18, -1, grouserH * 1.08);
      appendTrackShoeBar(assembly, trackW * 0.22, pitch * 0.18,
        0, 0, 0, grouserH * 0.72);
      return;
    case 'fine-rib':
      for (const z of [-0.25, 0, 0.25]) {
        appendTrackShoeBar(assembly, trackW * 0.86, pitch * 0.08, 0, pitch * z);
      }
      return;
    case 'open-chevron':
      appendTrackShoeChevron(assembly, pitch * 0.18, 1, grouserH * 1.04);
      appendTrackShoeChevron(assembly, -pitch * 0.18, -1, grouserH * 1.04);
      for (const side of [-1, 1]) {
        appendTrackShoeBar(assembly, trackW * 0.18, pitch * 0.13,
          side * trackW * 0.37, 0, 0, grouserH * 0.72);
      }
      return;
    case 'rubber-block':
      for (const x of [-trackW * 0.245, trackW * 0.245]) {
        for (const z of [-pitch * 0.23, pitch * 0.23]) {
          appendTrackShoeBar(assembly, trackW * 0.37, pitch * 0.25, x, z);
        }
      }
      return;
    case 'split-chevron':
      appendTrackShoeChevron(assembly, pitch * 0.19, 1);
      appendTrackShoeChevron(assembly, -pitch * 0.19, -1);
      appendTrackShoeBar(assembly, trackW * 0.16, pitch * 0.16,
        0, 0, 0, grouserH * 0.65);
      return;
    case 'staggered-rib':
      for (let rib = 0; rib < 4; rib++) {
        const side = rib % 2 ? 1 : -1;
        appendTrackShoeBar(assembly, trackW * 0.53, pitch * 0.075,
          side * trackW * 0.205, pitch * (-0.30 + rib * 0.20), side * 0.08);
      }
      return;
    case 'dead-track':
      appendTrackShoeBar(assembly, trackW * 0.90, pitch * 0.18);
      appendTrackShoeBar(assembly, trackW * 0.76, pitch * 0.08,
        0, pitch * 0.31, 0, grouserH * 0.65);
      appendTrackShoeBar(assembly, trackW * 0.76, pitch * 0.08,
        0, -pitch * 0.31, 0, grouserH * 0.65);
      return;
    default:
      throw new Error('Unsupported track shoe surface');
  }
}

function appendTrackShoeStructure(
  assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern,
  guideProfile?: TrackGuideProfile,
): void {
  const { trackW, pitch, padH } = assembly;
  const shoulderLift = pattern.shoulderHeight;
  for (const side of [-1, 1]) {
    appendTrackShoeBox(assembly, trackW * 0.085, shoulderLift, pitch * 0.80,
      side * trackW * 0.442, padH / 2 + shoulderLift / 2, 0, 0,
      [SHOE_BOX_BOTTOM]);
  }
  const webH = pattern.webHeight;
  appendTrackShoeBox(assembly, trackW * 0.78, webH, pitch * pattern.webDepth,
    0, -(padH + webH) / 2 + 0.004, 0, 0, [SHOE_BOX_TOP]);

  if (guideProfile) {
    assembly.parts.push(trackGuideGeometry(pitch, guideProfile));
    return;
  }

  const hornH = pattern.hornHeight;
  const hornBaseH = hornH * 0.58;
  const hornTipH = hornH - hornBaseH;
  const hornBaseY = -(padH / 2 + webH + hornBaseH / 2 - 0.006);
  appendTrackShoeBox(assembly, Math.min(trackW * 0.16, 0.082), hornBaseH, pitch * 0.34,
    0, hornBaseY, 0, 0, [SHOE_BOX_TOP]);
  appendTrackShoeBox(assembly, Math.min(trackW * 0.09, 0.046), hornTipH, pitch * 0.21,
    0, hornBaseY - hornBaseH / 2 - hornTipH / 2, 0, 0, [SHOE_BOX_TOP]);
}

function guideHalfWidth(profile: TrackGuideProfile, inward: number): number {
  const rows = profile.stations;
  for (let i = 1; i < rows.length; i++) {
    if (inward > rows[i][0]) continue;
    const a = rows[i - 1], b = rows[i];
    const t = (inward - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * t;
  }
  return rows[rows.length - 1][1];
}

function validateGuideStations(rows: TrackGuideProfile['stations'], pitch: number, triangular = false): number {
  if (!Array.isArray(rows) || rows.length < (triangular ? 2 : 3) || rows.length > 8
    || (triangular && rows.length !== 2)
    || !Number.isFinite(pitch) || pitch <= 0) throw new TypeError('Invalid native guide profile');
  let previous = 0;
  for (const [index, row] of rows.entries()) {
    const pointed = triangular && index === rows.length - 1 && row[1] === 0;
    if (row.length !== 2 || !row.every(Number.isFinite) || row[0] <= previous
      || row[0] > .5 || (!pointed && row[1] <= 0) || row[1] > .1) throw new RangeError('Invalid native guide station');
    previous = row[0];
  }
  return previous;
}

function validateTrackGuide(profile: TrackGuideProfile, pitch: number): void {
  const rows = profile.stations;
  const previous = validateGuideStations(rows, pitch, profile.triangularTip);
  const scalars = [profile.wallM, profile.cavityTipInwardM, profile.rootDepthRatio, profile.tipDepthRatio];
  if (!scalars.every(Number.isFinite) || profile.wallM <= 0
    || profile.cavityTipInwardM <= rows[0][0] + profile.wallM
    || profile.cavityTipInwardM >= previous
    || profile.rootDepthRatio <= 0 || profile.rootDepthRatio >= 1
    || profile.tipDepthRatio <= 0 || profile.tipDepthRatio > profile.rootDepthRatio
    || (profile.triangularTip
      ? Math.abs(guideHalfWidth(profile, profile.cavityTipInwardM) - profile.wallM) > 1e-12
      : guideHalfWidth(profile, profile.cavityTipInwardM) <= profile.wallM)) {
    throw new RangeError('Invalid native guide cavity or depth');
  }
  for (const [inward, width] of rows) {
    if (inward < profile.cavityTipInwardM && width <= profile.wallM) {
      throw new RangeError('Native guide wall closes its declared cavity');
    }
  }
}

function guideContour(rows: readonly (readonly [number, number])[]): THREE.Vector2[] {
  return [...rows.map(([inward, width]) => new THREE.Vector2(-width, -inward)),
    ...[...rows].reverse().filter(([, width]) => width !== 0)
      .map(([inward, width]) => new THREE.Vector2(width, -inward))];
}

/** Closed thin wall stock with an actual through-cavity. No full triangle
 * fills the guide's air. Every vertex remains in the one animated shoe. */
export function trackGuideGeometry(pitch: number, profile: TrackGuideProfile): THREE.BufferGeometry {
  validateTrackGuide(profile, pitch);
  const rows = profile.stations, root = rows[0][0], tip = rows[rows.length - 1][0];
  const inner: [number, number][] = [[root + profile.wallM,
    guideHalfWidth(profile, root + profile.wallM) - profile.wallM]];
  for (const [inward, width] of rows.slice(1)) {
    if (inward < profile.cavityTipInwardM) inner.push([inward, width - profile.wallM]);
  }
  inner.push([profile.cavityTipInwardM, profile.triangularTip ? 0
    : guideHalfWidth(profile, profile.cavityTipInwardM) - profile.wallM]);
  const shape = new THREE.Shape(guideContour(rows));
  shape.holes.push(new THREE.Path(guideContour(inner).reverse()));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: false });
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const t = (-positions.getY(i) - root) / (tip - root);
    const depth = pitch * (profile.rootDepthRatio + (profile.tipDepthRatio - profile.rootDepthRatio) * t);
    positions.setZ(i, (positions.getZ(i) - .5) * depth);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function fleetShoePinStock(radius: number, length: number, side: Side, closed: boolean): THREE.BufferGeometry {
  // Same four-sided occupied cylinder, with two triangles per flat cap
  // instead of a four-triangle centre fan. No contour/axial plane changes.
  const g=gearFastener(radius,length,true);
  if(closed)return g;
  const normal=g.getAttribute('normal'),indices:number[]=[];
  for(let i=0;i<normal.count;i+=3){
    if(normal.getX(i)*side<-.999999)continue;
    indices.push(i,i+1,i+2);
  }
  g.setIndex(indices);return g;
}

function trackShoePinGeometry(
  radius: number, length: number, side: Side, section: TrackLinkCrossSection|undefined,
  segments: number|undefined,
): THREE.BufferGeometry {
  if(segments===4)return fleetShoePinStock(radius,length,side,!!section);
  if(section)return xform(new THREE.CylinderGeometry(radius,radius,length,segments??12),0,0,0,0,0,Math.PI/2);
  return oneCappedCylinderX(radius,length,segments??6,side);
}

function appendTrackShoePins(
  assembly: TrackShoeAssembly,
  pattern: DimensionedTrackPattern,
  pinCapOuter: number | null,
  section?: TrackLinkCrossSection,
  segments?: number,
): void {
  if (pattern.pinStyle !== 'end-caps') return;
  const { trackW, pitch, padH, parts } = assembly;
  const outer = pinCapOuter ?? trackW * 0.48;
  const capLength = section?.pinCapLengthM ?? Math.min(0.058, trackW * 0.15);
  const capX = Math.max(0, outer - capLength / 2);
  const pinY = pattern.pinCentreY ?? -(padH / 2 + pattern.webHeight * 0.38);
  const halfSpacing = section?.pinHalfSpacingM ?? pitch * .30;
  if (section && (section.connectorDepthM > pitch || halfSpacing >= pitch / 2))
    throw new RangeError('Native track-link connector exceeds its physical pitch');
  for (const side of [-1, 1] as const) {
    if(section)appendTrackShoeConnectors(assembly,pattern,section,[side]);
    for (const z of [-halfSpacing, halfSpacing]) {
      parts.push(xform(
        trackShoePinGeometry(pattern.pinRadius,capLength,side,section,segments),
        side * capX, pinY, z,
      ));
    }
  }
}

function appendTrackShoeConnectors(
  assembly: TrackShoeAssembly, pattern: DimensionedTrackPattern, section: TrackLinkCrossSection,
  sides: readonly number[] = [-1,1],
): void {
  const pinY=pattern.pinCentreY??-(assembly.padH/2+pattern.webHeight*.38);
  for(const side of sides)appendTrackShoeBox(assembly,
    section.connectorOuterM-section.connectorInnerM,section.connectorHeightM,section.connectorDepthM,
    side*(section.connectorOuterM+section.connectorInnerM)/2,pinY+section.connectorCentreYDeltaM);
}

export function buildAbramsSourceXTrackShoe(p: TrackShoeBuildParameters, guide?: TrackGuideProfile, outsole?: TrackOutsoleDimensions): THREE.BufferGeometry {
  if(p.pattern.id !== 'nato-double-pin') throw new Error('Abrams recovered shoes require their authored NATO double-pin recipe');
  return buildFleetTrackShoe(p,guide,outsole);
}

/** Quality-aware shared stock retaining the caller's national tread recipe.
 * Identity-specific adapters still enforce their own pattern contract. */
export function buildFleetTrackShoe(p: TrackShoeBuildParameters, guide?: TrackGuideProfile, outsole?: TrackOutsoleDimensions): THREE.BufferGeometry {
  return p.far ? simplifiedTrackShoeGeometry(p.trackW,p.pitch,p.pattern,p.radialScale,p.widthScale,p.section,p.pinCapOuter,guide,outsole,p.high?'high':'low')
    : fleetTrackShoeGeometry(p.trackW,p.pitch,p.pattern,p.pinCapOuter,p.radialScale,p.widthScale,p.section,guide,p.high?'high':'low',outsole);
}
