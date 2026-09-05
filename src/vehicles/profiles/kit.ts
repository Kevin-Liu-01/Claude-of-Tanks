// Shared profile-building machinery for the per-family procedural modules in
// this directory. Family modules own their PROFILE DATA and any family-only
// kit/build functions; everything generic (hull styles, turret styles, the
// donor mechanism, the family templates) lives here so two family agents
// never have to edit the same file.
//
// These are original primitive reconstructions informed by normalized local
// reference renders and real vehicle dimensions. They intentionally do not
// contain, decode, or reproduce source mesh topology.
import * as THREE from 'three';
import { KIT } from '../tankFactoryCore.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';

type Vec3Tuple = readonly [number, number, number];
type GeometryScale = number | readonly number[];

interface ProfileBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    dark: THREE.Material;
    shadow: THREE.Material;
  };
  readonly disposables: THREE.BufferGeometry[];
  readonly spec: {
    readonly dims: { readonly widthM: number; readonly hullLengthM: number };
    readonly armor: {
      readonly turretPivot: readonly [number, number, number];
      readonly gunBarrel: { readonly radiusM: number; readonly lengthM: number };
    };
    readonly visual: { readonly number?: string; readonly trackWidthM?: number };
  };
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    value: string,
    scale: number,
    position: readonly [number, number, number],
    ...rotation: number[]
  ): void;
}

interface MudguardBuilderPort {
  readonly hullG: THREE.Group;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

export interface ShapedMudguardOptions {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Panel thickness across local X. */
  readonly thickness?: number;
  /** Longitudinal span across local Z. */
  readonly length?: number;
  readonly height?: number;
  /** Existing closed family geometry routed through the shared material/receipt contract. */
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: 'painted-steel' | 'rubber' | 'wood-stained';
  /** Explicit family bucket for existing authored finishes. */
  readonly bucket?: string;
  /** Top-edge rise at the center, in metres. */
  readonly crown?: number;
  /** Amount trimmed from the lower front (+Z after construction) corner. */
  readonly frontCut?: number;
  /** Amount trimmed from the lower rear (-Z after construction) corner. */
  readonly rearCut?: number;
  /** Drop of the front top edge relative to the rear top edge. */
  readonly rake?: number;
  /** Optional normalized [z,y] outline. Values are scaled by length/height. */
  readonly profile?: readonly (readonly [number, number])[];
  readonly rotation?: Vec3Tuple;
  readonly support?: boolean;
}

interface SharedMudguardReceipt {
  label: string;
  designFamily: 'cot-shaped-mudguard-v1';
  material: 'painted-steel' | 'rubber' | 'wood-stained';
  bucket: string;
  x: number;
  y: number;
  z: number;
  thicknessM: number;
  lengthM: number;
  heightM: number;
  outlinePoints?: number;
  customFamilyGeometry: boolean;
  attachedSupport: boolean;
}

interface ProfileConfig {
  turretWidth: number;
  turretHeight: number;
  turretDepth: number;
  turretFront: number;
  turretRear: number;
  gunLength?: number;
  hull?: string;
  width?: number;
  hullLength?: number;
  roofY?: number;
  trackTop?: number;
  trackW?: number;
  skirts?: boolean;
  skirtPanels?: number;
  skirtLength?: number;
  skirtY?: number;
  skirtHeight?: number;
  era?: boolean;
  eraRows?: number;
  casemateWidth?: number;
  casemateHeight?: number;
  casemateDepth?: number;
  casemateRoof?: boolean;
  frontSprocket?: boolean;
  wheelStyle?: string;
  wheelR?: number;
  wheelSpan?: number;
  wheelBias?: number;
  wheelY?: number;
  wheels?: number;
  coveredTop?: boolean;
  arms?: boolean;
  turret?: string;
  bustle?: number;
  gunMountY?: number;
  gunMountZ?: number;
  turretPivotX?: number;
  turretPivotY?: number;
  turretPivotZ?: number;
  gunX?: number;
  gunY?: number;
  gunZ?: number;
  gunRadius?: number;
  mantletWidth?: number;
  mantletHeight?: number;
  sleeve?: boolean;
  smoke?: boolean;
  smokeCount?: number;
  cupolaR?: number;
  cupolaH?: number;
  cupolaPeriscopes?: number;
  commanderX?: number;
  commanderZ?: number;
  loaderX?: number;
  pano?: boolean;
  panoX?: number;
  sightX?: number;
  mg?: boolean | 'heavy';
  antennas?: number | false;
  antennaHeight?: number;
  evac?: boolean;
  evacR?: number;
  rearDoor?: boolean;
  muzzleBore?: boolean | MuzzleBoreOptions;
}

interface DonorProfileConfig extends Record<string, RuntimeValue> {
  base: string;
  kit?: (builder: ProfileBuilderPort, profile: DonorProfileConfig) => void;
}

interface MuzzleBoreOptions {
  r?: number;
  len?: number;
  z?: number;
  x?: number;
  y?: number;
  brake?: boolean | 'double' | 'discs';
  seg?: number;
  boreR?: number;
  parent?: 'hullG' | 'turretG' | 'gunG';
}

interface MuzzleTipOptions {
  rx?: number;
  ry?: number;
  rz?: number;
  parent?: 'hullG' | 'turretG' | 'gunG';
}

interface FittingOptions {
  mats?: RuntimeValue;
  shadows?: boolean;
  rotation?: Vec3Tuple;
  seed?: number;
  cls?: string;
  scale?: number;
  tone?: string;
  // Legacy call-site input retained for source compatibility. Machine-gun
  // barrels must remain collinear with their receivers; elevation belongs on
  // the complete weapon/trunnion assembly, never on barrel vertices alone.
  elev?: number;
  ring?: boolean | { r?: number; stubs?: number };
  ammo?: boolean;
  ammoSlot?: string;
  ammoSide?: number;
  sensorSide?: number;
  sensorHead?: boolean;
  sensorMount?: string;
  weapon?: boolean;
  shield?: boolean | string;
  barrelBridge?: boolean;
  barrelLength?: number;
  machineGunFinish?: string;
  installationVariant?: string;
  variant?: string;
  sizeStandard?: string;
  towerRise?: number;
  bodySlot?: string;
  weaponName?: string;
  caliberMm?: number;
  w?: number;
  d?: number;
  h?: number;
  rails?: number;
  posts?: number;
  mesh?: boolean;
  fill?: number;
  pts?: readonly Vec3Tuple[];
  r?: number;
  eyes?: boolean;
  seg?: number;
  count?: number;
  gap?: number;
  slot?: string;
  strap?: boolean;
  links?: number;
  width?: number;
  pitch?: number;
  pods?: number;
  spacing?: number;
  guard?: boolean;
  lens?: string;
  rake?: number;
  len?: number;
  splay?: number;
  arc?: number;
  caps?: boolean;
  base?: boolean;
  straps?: number;
  axis?: string;
}

interface FittingParts {
  readonly bySlot: Record<string, THREE.BufferGeometry[]>;
  add(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: GeometryScale,
  ): void;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function isProfileBuilder(value: RuntimeValue): value is ProfileBuilderPort {
  return isRecord(value) && typeof value.add === 'function' &&
    typeof value.addGunExtra === 'function' && typeof value.decal === 'function' &&
    value.hullG instanceof THREE.Group && value.turretG instanceof THREE.Group &&
    value.gunG instanceof THREE.Group && isRecord(value.mats) &&
    Array.isArray(value.disposables) && isRecord(value.spec);
}

function requireProfileBuilder(value: RuntimeValue): ProfileBuilderPort {
  if (!isProfileBuilder(value)) {
    throw new TypeError('profile builder is missing the procedural builder contract');
  }
  return value;
}

function isProfileConfig(value: RuntimeValue): value is ProfileConfig {
  if (!isRecord(value)) return false;
  for (const key of [
    'turretWidth', 'turretHeight', 'turretDepth', 'turretFront', 'turretRear',
  ]) {
    if (!Number.isFinite(value[key])) return false;
  }
  return true;
}

function isDonorProfileConfig(value: RuntimeValue): value is DonorProfileConfig {
  return isRecord(value) && typeof value.base === 'string' &&
    (value.kit === undefined || typeof value.kit === 'function');
}

function requireDonorProfileConfig(value: RuntimeValue): DonorProfileConfig {
  if (!isDonorProfileConfig(value)) {
    throw new TypeError('donor profile requires a canonical base and optional kit callback');
  }
  return value;
}

function requireProfileConfig(value: RuntimeValue): ProfileConfig {
  if (!isProfileConfig(value)) {
    throw new TypeError('vehicle profile requires finite turret, gun, and envelope dimensions');
  }
  return value;
}

const transformGeometry = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: GeometryScale,
) => THREE.BufferGeometry;

export { KIT };

export const evenStations = (count: number, span: number, bias = 0): number[] => Array.from({ length:count }, (_, i) =>
  count === 1 ? bias : span / 2 - i * (span / (count - 1)) + bias);

function addSegmentedSkirts(P: ProfileBuilderPort, width: number, length: number, y: number, height: number, panels = 6): void {
  const { box } = KIT;
  const panelD = length / panels;
  for (const side of [-1, 1]) {
    for (let i=0; i<panels; i++) {
      const z=length/2-panelD/2-i*panelD;
      P.add('hull',box(0.045,height,panelD*0.96),side*width/2,y,z);
      P.add('hullDark',box(0.052,height*0.90,0.018),side*(width/2+0.004),y,z-panelD/2);
    }
    // shaded-parity r2 (russia root-cause): the rubber lip's thin sunlit top
    // face rendered as a salmon stripe above the fenders on every family
    // using these skirts. Dark bucket, inset behind the panel face, and no
    // exposed top face under the board key.
    P.add('hullDark',box(0.02,0.06,length*0.98),side*(width/2-0.004),y-height/2-0.02,0);
  }
}

function addEra(P: ProfileBuilderPort, width: number, frontZ: number, roofY: number, rows = 2): void {
  const { box } = KIT;
  const cols=7;
  for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
    const x=(col-(cols-1)/2)*(width*0.82/cols);
    P.add('hullDetail',box(width*0.70/cols,0.07,0.22),x,roofY+0.04-row*0.08,frontZ-row*0.26,-0.20,0,0);
  }
}

interface HullBuildDimensions {
  readonly width: number;
  readonly length: number;
  readonly halfL: number;
  readonly roofY: number;
  readonly trackTop: number;
  readonly trackW: number;
  readonly innerW: number;
  readonly lowerH: number;
  readonly style: string;
}

interface HullBuildResult {
  readonly width: number;
  readonly length: number;
  readonly halfL: number;
  readonly roofY: number;
  readonly trackTop: number;
}

function resolveHullDimensions(P: ProfileBuilderPort, p: ProfileConfig): HullBuildDimensions {
  const d=P.spec.dims;
  const width=p.width || d.widthM;
  const length=p.hullLength || d.hullLengthM;
  const halfL=length/2;
  const roofY=p.roofY || Math.max(1.18,P.spec.armor.turretPivot[1]-0.04);
  const trackTop=p.trackTop || roofY*0.59;
  const trackW=p.trackW || P.spec.visual.trackWidthM || width*0.16;
  const innerW=Math.max(width-trackW*1.95,width*0.58);
  const lowerH=Math.max(0.46,trackTop*0.76);
  const style=p.hull || 'western';
  return {width,length,halfL,roofY,trackTop,trackW,innerW,lowerH,style};
}

function addMerkavaHullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.86,roofY-trackTop,length*0.60),0,trackTop+(roofY-trackTop)/2,-halfL*0.19);
  P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.02,width*0.40,halfL*0.50,-halfL*0.02,
    trackTop,roofY));
  P.add('hull',frustum(width*0.42,halfL*0.74,halfL*0.98,width*0.48,halfL*0.98,halfL*0.98,
    0.35,trackTop));
  P.add('hullDetail',box(width*0.36,0.035,length*0.22),width*0.18,roofY+0.025,halfL*0.14);
}

function addSovietHullShell(P: ProfileBuilderPort, p: ProfileConfig, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.86,roofY-trackTop,length*0.61),0,trackTop+(roofY-trackTop)/2,-halfL*0.18);
  P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.06,width*0.40,halfL*0.42,0,
    trackTop*0.96,roofY));
  P.add('hull',frustum(width*0.39,halfL*0.77,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
    0.31,trackTop*0.96));
  if (p.era) addEra(P,width,halfL*0.48,roofY,p.eraRows || 2);
}

function addType90HullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  // Type 90: low two-level engine deck, very shallow glacis and broad
  // fender shoulders.  The old generic western hull was almost a metre too
  // tall at the nose and read as a rectangular troop carrier in profile.
  P.add('hull',box(width*0.82,roofY-trackTop,length*0.52),0,trackTop+(roofY-trackTop)/2,-halfL*0.23);
  P.add('hull',frustum(width*0.47,halfL*0.98,halfL*0.02,width*0.38,halfL*0.48,halfL*0.02,
    trackTop*0.78,roofY));
  P.add('hull',frustum(width*0.40,halfL*0.81,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
    0.31,trackTop*0.80));
  P.add('hull',box(width*0.94,0.11,length*0.43),0,trackTop+0.17,-halfL*0.22);
  P.add('hullDetail',box(width*0.32,0.035,length*0.26),-width*0.18,roofY+0.025,halfL*0.15);
}

function addWarriorHullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  // FV510 Warrior: tall but strongly chamfered troop hull, a long shallow
  // glacis and a near-vertical rear door.  A single full-height box erased
  // all three of those cues and hid the complete six-wheel suspension.
  P.add('hull',frustum(width*0.46,halfL*0.46,-halfL*0.94,width*0.39,halfL*0.34,-halfL*0.91,
    trackTop*0.93,roofY));
  P.add('hull',frustum(width*0.46,halfL*0.97,halfL*0.31,width*0.38,halfL*0.46,halfL*0.27,
    trackTop*0.72,roofY));
  P.add('hull',frustum(width*0.41,halfL*0.81,halfL*0.98,width*0.46,halfL*0.98,halfL*0.98,
    0.30,trackTop*0.78));
  P.add('hull',box(width*0.92,0.12,length*0.61),0,trackTop+0.17,-halfL*0.12);
  P.add('hullDetail',box(width*0.56,roofY*0.58,0.045),0,roofY*0.61,-halfL*0.985);
  P.add('hullDark',box(width*0.23,roofY*0.44,0.052),0,roofY*0.59,-halfL*0.995);
}

function addIfvHullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.86,roofY-trackTop,length*0.69),0,trackTop+(roofY-trackTop)/2,-halfL*0.12);
  P.add('hull',frustum(width*0.46,halfL*0.98,halfL*0.16,width*0.40,halfL*0.55,halfL*0.04,
    trackTop*0.82,roofY));
  P.add('hull',box(width*0.80,roofY*0.56,0.10),0,roofY*0.62,-halfL*0.96);
}

function addClassicHullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.88,roofY-trackTop,length*0.58),0,trackTop+(roofY-trackTop)/2,-halfL*0.18);
  P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.03,width*0.39,halfL*0.42,-halfL*0.02,
    trackTop,roofY));
  P.add('hull',frustum(width*0.39,halfL*0.78,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
    0.30,trackTop));
}

function addCasemateHullShell(P: ProfileBuilderPort, p: ProfileConfig, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.88,roofY-trackTop,length*0.58),0,trackTop+(roofY-trackTop)/2,-halfL*0.16);
  P.add('hull',frustum(width*0.47,halfL*0.98,halfL*0.08,width*0.40,halfL*0.48,0,
    trackTop,Math.min(roofY,trackTop+0.42)));
  const cW=p.casemateWidth || width*0.72;
  const cH=p.casemateHeight || Math.max(0.62,roofY-trackTop+0.28);
  const cD=p.casemateDepth || length*0.48;
  P.add('hull',frustum(cW/2,cD*0.48,-cD*0.52,cW*0.44,cD*0.35,-cD*0.46,
    roofY-cH,roofY));
  if (p.casemateRoof) P.add('hullDetail',box(cW*0.82,0.035,cD*0.72),0,roofY+0.025,-cD*0.08);
}

function addWesternHullShell(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,frustum }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  P.add('hull',box(width*0.87,roofY-trackTop,length*0.64),0,trackTop+(roofY-trackTop)/2,-halfL*0.16);
  P.add('hull',frustum(width*0.47,halfL*0.97,halfL*0.06,width*0.41,halfL*0.42,0,
    trackTop,roofY));
  P.add('hull',frustum(width*0.40,halfL*0.77,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
    0.34,trackTop));
}

function addHullShell(P: ProfileBuilderPort, p: ProfileConfig, d: HullBuildDimensions): void {
  if (d.style === 'merkava') addMerkavaHullShell(P,d);
  else if (d.style === 'soviet') addSovietHullShell(P,p,d);
  else if (d.style === 'type90') addType90HullShell(P,d);
  else if (d.style === 'warrior') addWarriorHullShell(P,d);
  else if (d.style === 'ifv') addIfvHullShell(P,d);
  else if (d.style === 'classic') addClassicHullShell(P,d);
  else if (d.style === 'casemate') addCasemateHullShell(P,p,d);
  else addWesternHullShell(P,d);
}

function addMerkavaDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box }=KIT;
  const {width,length,halfL,roofY}=d;
  // Front-mounted powerpack: offset louvre bank, intake lip and the rear
  // troop/ammunition hatch that distinguish a Merkava hull in side view.
  P.add('hullDark',box(width*0.31,0.025,length*0.19),width*0.20,roofY+0.035,halfL*0.34);
  for (let i=0;i<7;i++) P.add('hullDetail',box(width*0.28,0.032,0.032),width*0.20,roofY+0.055,halfL*(0.48-i*0.052));
  P.add('hull',box(width*0.32,0.12,0.16),-width*0.18,roofY+0.06,halfL*0.23,-0.18,0,0);
  P.add('hullDark',box(width*0.34,roofY*0.38,0.025),0,roofY*0.64,-halfL*0.985);
  P.add('hullDetail',box(width*0.36,0.035,0.05),0,roofY*0.83,-halfL*0.995);
}

function addSovietDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,cylY,cylZ }=KIT;
  const {width,length,halfL,roofY}=d;
  // Circular driver hatch/periscopes, transverse engine grilles and the
  // familiar right-fender external fuel/stowage run.
  P.add('hull',cylY(0.25,0.25,0.045,16),0,roofY+0.03,halfL*0.27);
  for (const x of [-0.18,0,0.18]) P.add('hullDark',box(0.12,0.04,0.035),x,roofY+0.075,halfL*0.38);
  for (let i=0;i<6;i++) P.add('hullDetail',box(width*0.42,0.028,0.045),0,roofY+0.05,-halfL*(0.40+i*0.07));
  P.add('hull',box(0.34,0.18,length*0.30),width*0.40,roofY-0.07,-halfL*0.20);
  P.add('hullDark',cylZ(0.075,length*0.23,10),-width*0.39,roofY+0.09,-halfL*0.28,Math.PI/2,0,0);
}

function addType90DeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,cylY }=KIT;
  const {width,length,halfL,roofY,trackTop}=d;
  // The Japanese tank's rear deck is dominated by two rectangular cooling
  // banks and a transverse louvre row; the driver sits front-left beneath a
  // flush, polygonal hatch.  These are important in top and rear views.
  for (const side of [-1,1]) {
    P.add('hullDark',box(width*0.29,0.024,length*0.21),side*width*0.19,roofY+0.035,-halfL*0.53);
    for (let i=0;i<7;i++) P.add('hullDetail',box(width*0.26,0.026,0.030),side*width*0.19,roofY+0.055,-halfL*(0.40+i*0.055));
    P.add('hullDark',box(0.035,0.13,0.62),side*width*0.43,roofY-0.04,-halfL*0.54);
  }
  P.add('hull',cylY(0.28,0.28,0.045,8),-width*0.18,roofY+0.03,halfL*0.22,0,0.18,0);
  for (const x of [-0.76,-0.57,-0.38]) P.add('hullDark',box(0.13,0.035,0.038),x,roofY+0.08,halfL*0.36);
  P.add('hullDark',box(width*0.57,0.34,0.025),0,trackTop+0.31,-halfL*0.995);
  for(let i=0;i<8;i++) P.add('hullDetail',box(width*0.52,0.026,0.028),0,trackTop+0.18+i*0.035,-halfL*1.002);
  P.add('hullDetail',box(0.22,0.28,0.04),width*0.36,trackTop+0.27,-halfL*1.01);
}

function addWarriorDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,cylY }=KIT;
  const {width,length,halfL,roofY}=d;
  for (const side of [-1,1]) {
    P.add('hullDark',box(width*0.29,0.024,length*0.23),side*width*0.19,roofY+0.035,-halfL*0.51);
    for(let i=0;i<6;i++) P.add('hullDetail',box(width*0.26,0.025,0.030),side*width*0.19,roofY+0.052,-halfL*(0.37+i*0.065));
    P.add('hullDetail',box(0.18,0.30,0.10),side*width*0.36,roofY*0.70,halfL*0.74);
  }
  P.add('hull',cylY(0.26,0.26,0.045,8),-width*0.19,roofY+0.025,halfL*0.18);
  for(const x of [-0.72,-0.52,-0.32]) P.add('hullDark',box(0.12,0.035,0.035),x,roofY+0.075,halfL*0.34);
}

function addWesternDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { box,cylY }=KIT;
  const {width,length,halfL,roofY}=d;
  // Twin cooling banks, driver's hatch and rear exhaust louvres.
  for (const side of [-1,1]) {
    P.add('hullDark',box(width*0.27,0.025,length*0.16),side*width*0.20,roofY+0.035,-halfL*0.52);
    for (let i=0;i<4;i++) P.add('hullDetail',box(width*0.24,0.03,0.035),side*width*0.20,roofY+0.055,-halfL*(0.42+i*0.07));
  }
  P.add('hull',cylY(0.27,0.27,0.045,16),width*0.18,roofY+0.03,halfL*0.20);
  P.add('hullDark',box(width*0.54,Math.max(0.18,roofY*0.20),0.025),0,roofY*0.66,-halfL*0.995);
}

function addClassicDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  const { cylY }=KIT;
  P.add('hull',cylY(0.25,0.25,0.04,14),d.width*0.16,d.roofY+0.03,d.halfL*0.16);
}

function addHullDeckFurniture(P: ProfileBuilderPort, d: HullBuildDimensions): void {
  if (d.style === 'merkava') addMerkavaDeckFurniture(P,d);
  else if (d.style === 'soviet') addSovietDeckFurniture(P,d);
  else if (d.style === 'type90') addType90DeckFurniture(P,d);
  else if (d.style === 'warrior') addWarriorDeckFurniture(P,d);
  else if (d.style === 'western' || d.style === 'ifv') addWesternDeckFurniture(P,d);
  else addClassicDeckFurniture(P,d);
}

function addHullServiceDetails(P: ProfileBuilderPort, p: ProfileConfig, d: HullBuildDimensions): void {
  const { cylZ,headlight,torus,towCable }=KIT;
  const {width,length,halfL,roofY,trackTop,style}=d;
  // Side-skirt panel fasteners and towing eyes give scale in every family.
  if (p.skirts !== false) for (const side of [-1,1]) for (let i=0;i<(p.skirtPanels || (style === 'ifv'?6:7));i++) {
    const z=length*0.37-i*(length*0.74/Math.max(1,(p.skirtPanels || (style === 'ifv'?6:7))-1));
    P.add('hullDark',cylZ(0.022,0.018,8),side*(width/2+0.035),p.skirtY ?? trackTop*0.78,z,0,side*Math.PI/2,0);
  }
  for (const side of [-1,1]) P.add('hullDetail',torus(0.09,0.018,10),side*width*0.27,0.48,halfL*0.94,Math.PI/2,0,0);
  headlight(P,-width*0.35,trackTop+0.10,halfL*0.88,-0.34,0.05);
  headlight(P,width*0.35,trackTop+0.10,halfL*0.88,-0.34,0.05);
  towCable(P,[[-width*0.34,roofY-0.15,halfL*0.72],[0,roofY-0.01,halfL*0.48],[width*0.34,roofY-0.15,halfL*0.72]]);
}

function addHullRunningGear(P: ProfileBuilderPort, p: ProfileConfig, d: HullBuildDimensions): void {
  const { buildRunningGear }=KIT;
  const {width,length,halfL,trackTop,trackW,style}=d;
  const wheelCount=p.wheels || (style === 'ifv' ? 6 : 7);
  const wheelR=p.wheelR || Math.min(0.40,length/(wheelCount*3.2));
  const wheelSpan=p.wheelSpan || length*0.74;
  const wheelZs=evenStations(wheelCount,wheelSpan,p.wheelBias || 0);
  const xc=width/2-trackW/2;
  buildRunningGear(P,{
    style:p.wheelStyle || 'rubber',wheelR,wheelW:Math.min(0.22,trackW*0.36),wheelY:p.wheelY || wheelR+0.09,xc,
    wheelZs,
    sprocket:{z:p.frontSprocket ? halfL*0.88 : -halfL*0.88,y:wheelR+0.10,r:wheelR*0.88},
    idler:{z:p.frontSprocket ? -halfL*0.88 : halfL*0.88,y:wheelR+0.08,r:wheelR*0.84},
    rollers:evenStations(Math.max(3,Math.floor(wheelCount/2)),wheelSpan*0.68).map((z)=>({z,y:trackTop*0.84,r:wheelR*0.23})),
    trackW,topY:trackTop*0.86,paintedEnds:true,coveredTop:p.coveredTop ?? (p.skirts !== false),arms:p.arms !== false,
  });
  if (p.skirts !== false) addSegmentedSkirts(P,width,p.skirtLength ?? length*0.86,
    p.skirtY ?? trackTop*0.72,p.skirtHeight ?? trackTop*0.60,p.skirtPanels || wheelCount);
}

function buildHull(P: ProfileBuilderPort, p: ProfileConfig): HullBuildResult {
  const { box,fenders }=KIT;
  const d=resolveHullDimensions(P,p);
  const {width,length,halfL,roofY,trackTop,trackW,innerW,lowerH}=d;

  P.add('hull',box(innerW,lowerH,length*0.91),0,0.22+lowerH/2,0);
  fenders(P,innerW/2,width/2+0.02,Math.min(roofY-0.16,trackTop+0.25),-halfL*0.96,halfL*0.94,0.025);
  addHullShell(P,p,d);

  P.add('hull',box(width*0.82,Math.max(0.30,roofY-trackTop),0.10),0,trackTop+(roofY-trackTop)/2,-halfL*0.96);
  P.add('hullDark',box(width*0.49,0.025,length*0.18),0,roofY+0.025,-halfL*0.66);
  for (let i=0;i<4;i++) P.add('hullDetail',box(width*0.46,0.025,0.045),0,roofY+0.04,-halfL*(0.78-i*0.075));
  addHullDeckFurniture(P,d);
  addHullServiceDetails(P,p,d);
  addHullRunningGear(P,p,d);
  return {width,length,halfL,roofY,trackTop};
}

function westernWedge(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,frustum,slab }=KIT;
  const tw=p.turretWidth/2, h=p.turretHeight, front=p.turretFront, rear=p.turretRear;
  P.add('turret',frustum(tw*0.96,front*0.50,rear,tw*0.83,front*0.30,rear*0.94,0.02,h));
  const inner=Math.max(0.13,tw*0.14);
  P.add('turret',slab(
    [inner,0.02,front],[tw,0.02,front*0.42],[tw,0.02,front*0.10],[inner,0.02,front*0.70],
    [inner,h,front*0.58],[tw*0.86,h,front*0.05],[tw*0.86,h,-front*0.15],[inner,h,front*0.34]));
  P.add('turret',slab(
    [-tw,0.02,front*0.42],[-inner,0.02,front],[-inner,0.02,front*0.70],[-tw,0.02,front*0.10],
    [-tw*0.86,h,front*0.05],[-inner,h,front*0.58],[-inner,h,front*0.34],[-tw*0.86,h,-front*0.15]));
  P.add('turret',box(tw*1.75,h*0.72,Math.abs(rear)*0.58),0,h*0.39,rear*0.82);
}

// Abrams-family welded turret: broad, low, almost rectangular bustle with
// distinct swept cheeks. The generic Leopard arrow wedge made every M1 read
// like a narrowed Leopard 2 and was especially obvious from above.
function abramsTurret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,frustum,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  P.add('turret',frustum(tw*0.98,f*0.52,r,tw*0.91,f*0.36,r*0.96,0,h));
  const slot=Math.max(0.22,tw*0.18);
  for (const side of [-1,1]) {
    const a=side*slot,b=side*tw;
    P.add('turret',slab(
      [a,0.03,f],[b,0.03,f*0.35],[b,0.03,-0.38],[a,0.03,f*0.62],
      [a,h*0.88,f*0.54],[b*0.91,h*0.78,f*0.05],[b*0.94,h*0.92,-0.58],[a,h,f*0.30]));
    P.add('turret',box(tw*0.18,h*0.68,Math.abs(r)*0.68),side*tw*0.89,h*0.43,r*0.67);
  }
  P.add('turret',box(tw*1.82,h*0.77,Math.abs(r)*0.72),0,h*0.43,r*0.72);
  P.add('turretDark',box(tw*1.58,0.045,Math.abs(r)*0.48),0,h*0.82,r*0.77);
  // Three blow-off panel bays and the external bustle basket/side rails.
  for (let i=0;i<3;i++) {
    const x=(i-1)*tw*0.48;
    P.add('turret',box(tw*0.40,0.045,Math.abs(r)*0.34),x,h+0.025,r*0.63);
    P.add('turretDark',box(0.025,0.055,Math.abs(r)*0.32),x+tw*0.20,h+0.055,r*0.63);
  }
  const rackZ=r-0.30;
  P.add('turretDetail',box(tw*1.94,0.035,0.035),0,h*0.64,rackZ);
  P.add('turretDetail',box(tw*1.94,0.035,0.035),0,0.14,rackZ);
  for(let i=0;i<10;i++) P.add('turretDetail',box(0.025,h*0.48,0.025),-tw*0.86+i*(tw*1.72/9),h*0.39,rackZ);
}

function sovietTurret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { lathe,box }=KIT;
  const r=p.turretWidth/2, h=p.turretHeight;
  P.add('turret',lathe([[r*0.86,0],[r,0.12],[r*0.94,h*0.48],[r*0.70,h*0.86],[r*0.40,h],[0.02,h]],28,p.turretDepth/(p.turretWidth||1)));
  if (p.bustle) P.add('turret',box(r*1.52,h*0.62,p.bustle),0,h*0.40,-p.turretDepth*0.47-p.bustle*0.32);
  if (p.era) for (const side of [-1,1]) for (let i=0;i<4;i++) {
    P.add('turretDetail',box(0.23,0.12,0.16),side*(0.25+i*0.22),h*0.54,p.turretFront*0.70-i*0.09,0,side*0.12,side*0.05);
  }
}

function merkavaTurret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,cylY,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  const inner=Math.max(0.11,tw*0.13);
  P.add('turret',slab(
    [inner,0.02,f],[tw,0.02,f*0.18],[tw*0.90,0.02,r],[inner,0.02,r*1.08],
    [inner,h,f*0.55],[tw*0.72,h,-0.02],[tw*0.66,h,r*0.90],[inner,h,r*0.94]));
  P.add('turret',slab(
    [-tw,0.02,f*0.18],[-inner,0.02,f],[-inner,0.02,r*1.08],[-tw*0.90,0.02,r],
    [-tw*0.72,h,-0.02],[-inner,h,f*0.55],[-inner,h,r*0.94],[-tw*0.66,h,r*0.90]));
  P.add('turret',box(tw*1.46,h*0.56,Math.abs(r)*0.45),0,h*0.32,r*0.92);
  const rackZ=r-0.36;
  P.add('turretDetail',box(tw*1.60,0.035,0.035),0,h*0.52,rackZ);
  P.add('turretDetail',box(tw*1.60,0.035,0.035),0,0.12,rackZ);
  for(let i=0;i<8;i++) P.add('turretDetail',box(0.025,h*0.40,0.025),-tw*0.72+i*(tw*1.44/7),h*0.32,rackZ);
  // Ball-and-chain curtain beneath the bustle: a signature Merkava rear
  // silhouette. Short alternating drops keep the curtain irregular.
  for(let i=0;i<11;i++) {
    const x=-tw*0.70+i*(tw*1.40/10);
    const drop=0.20+(i%3)*0.035;
    P.add('turretDark',box(0.018,drop,0.018),x,-drop*0.50,r-0.28);
    P.add('turretDark',cylY(0.035,0.035,0.04,8),x,-drop-0.01,r-0.28);
  }
}

function castTurret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { lathe,frustum,box }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight;
  const f=p.turretFront ?? p.turretDepth*0.42;
  const r=p.turretRear ?? -p.turretDepth*0.58;
  // Patton/Centurion castings are low, rounded gun shields flowing into a
  // separate rear bustle—not tall polygonal prisms. A forward cast dome
  // supplies the curved cheeks; the tapered bustle supplies the asymmetric
  // side/top profile without stretching the dome into a giant pyramid.
  const domeR=tw*0.88;
  const domeDepth=Math.min(f*1.02,Math.abs(r)*0.58);
  P.add('turret',lathe([
    [domeR*0.70,0],[domeR*0.94,h*0.12],[domeR,h*0.30],
    [domeR*0.88,h*0.60],[domeR*0.62,h*0.84],[domeR*0.28,h*0.98],[0.02,h],
  ],32,domeDepth/Math.max(domeR,0.01)),0,0,f-domeDepth);
  P.add('turret',frustum(tw*0.82,-0.20,r,tw*0.62,-0.30,r*0.94,h*0.10,h*0.76));
  P.add('turret',box(tw*1.16,0.050,Math.abs(r)*0.54),0,h*0.78,r*0.54);
  const rackZ=r-0.22;
  P.add('turretDetail',box(tw*1.45,0.032,0.032),0,h*0.54,rackZ);
  P.add('turretDetail',box(tw*1.45,0.032,0.032),0,0.16,rackZ);
  for(let i=0;i<7;i++) P.add('turretDetail',box(0.022,h*0.34,0.022),-tw*0.62+i*(tw*1.24/6),h*0.34,rackZ);
}

function ifvTurret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,polyTurret }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  P.add('turret',polyTurret([
    [-tw*0.30,f],[tw*0.30,f],[tw*0.92,f*0.54],[tw,f*0.02],
    [tw*0.76,r],[-tw*0.76,r],[-tw,f*0.02],[-tw*0.92,f*0.54],
  ],h,1.02,0.86));
  P.add('turret',box(tw*0.70,h*0.56,0.18),0,h*0.46,f*0.88);
  P.add('turretDark',box(tw*0.42,h*0.30,0.04),tw*0.36,h*0.60,f+0.025);
  P.add('turret',KIT.cylY(tw*0.22,tw*0.22,0.045,12),-tw*0.30,h+0.02,-0.12);
  P.add('turret',KIT.cylY(tw*0.20,tw*0.20,0.045,12),tw*0.31,h+0.02,-0.18);
  P.add('turretDetail',box(tw*1.34,0.035,0.035),0,h*0.42,r-0.16);
  for(let i=0;i<5;i++) P.add('turretDetail',box(0.025,h*0.30,0.025),-tw*0.55+i*(tw*1.10/4),h*0.30,r-0.16);
}

function type90Turret(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,cylY,polyTurret,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  // Ten-sided welded shell derived from the Type 90 top view: narrow gun
  // throat, swept cheeks, almost parallel autoloader bustle and clipped rear
  // corners.  Keep the roof nearly full-width; a heavily inset generic
  // polyTurret is what produced the old tiered-pyramid silhouette.
  const plan=[
    [-tw*0.18,f],[tw*0.18,f],[tw*0.73,f*0.62],[tw,f*0.16],
    [tw*0.96,r*0.72],[tw*0.72,r],[-tw*0.72,r],[-tw*0.96,r*0.72],
    [-tw,f*0.16],[-tw*0.73,f*0.62],
  ];
  P.add('turret',polyTurret(plan,h,1.02,0.91));

  // Separate lower cheek wedges create the characteristic arrow nose without
  // turning the whole turret into a Leopard 2A5 pyramid.
  const throat=tw*0.16;
  for (const side of [-1,1]) {
    const inner=side*throat,outer=side*tw;
    P.add('turret',slab(
      [inner,0.03,f],[outer,0.03,f*0.20],[outer,0.03,-0.22],[inner,0.03,f*0.63],
      [inner,h*0.74,f*0.62],[outer*0.90,h*0.60,f*0.05],[outer*0.91,h*0.68,-0.34],[inner,h*0.86,f*0.38]));
    // Long, shallow bustle stowage box and side rail.
    P.add('turretDetail',box(tw*0.16,h*0.31,Math.abs(r)*0.62),side*tw*0.91,h*0.38,r*0.61);
    P.add('turretDetail',box(0.035,0.035,Math.abs(r)*0.78),side*tw*1.01,h*0.30,r*0.55);
  }
  // Autoloader bustle, roof access panels and rear rack.
  P.add('turret',box(tw*1.52,h*0.72,Math.abs(r)*0.63),0,h*0.41,r*0.70);
  for (let i=0;i<3;i++) P.add('turretDark',box(tw*0.42,0.032,Math.abs(r)*0.28),(i-1)*tw*0.48,h+0.02,r*0.62);
  P.add('turretDetail',box(tw*1.72,0.035,0.035),0,h*0.58,r-0.27);
  P.add('turretDetail',box(tw*1.72,0.035,0.035),0,0.16,r-0.27);
  for(let i=0;i<9;i++) P.add('turretDetail',box(0.024,h*0.40,0.024),-tw*0.76+i*(tw*1.52/8),h*0.36,r-0.27);
  // Low mantlet aperture and prominent right-side gunner's primary sight.
  P.add('turretDark',box(tw*0.34,h*0.48,0.14),0,h*0.45,f*0.76);
  P.add('turretDetail',box(0.34,0.31,0.28),tw*0.40,h*0.70,f*0.23);
  P.add('turretGlass',box(0.22,0.12,0.025),tw*0.40,h*0.73,f*0.39);
  P.add('turret',cylY(0.24,0.24,0.045,14),-tw*0.38,h+0.025,-0.24);
}

function addTurretShell(P: ProfileBuilderPort, p: ProfileConfig): void {
  if (p.turret === 'casemate') {
    // The armor/simulation rig still supplies a gun pitch group, but there is
    // no yawing turret shell. The hull superstructure is built above.
  } else if (p.turret === 'abrams') abramsTurret(P,p);
  else if (p.turret === 'soviet') sovietTurret(P,p);
  else if (p.turret === 'merkava') merkavaTurret(P,p);
  else if (p.turret === 'cast') castTurret(P,p);
  else if (p.turret === 'ifv') ifvTurret(P,p);
  else if (p.turret === 'type90') type90Turret(P,p);
  else westernWedge(P,p);
}

function addTurretCrewStations(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { cylY,cupola,periscope }=KIT;
  const h=p.turretHeight;
  if (p.turret !== 'ifv' && p.turret !== 'casemate' && p.turret !== 'type90') {
    cupola(P,'turret',p.commanderX ?? p.turretWidth*0.20,h,p.commanderZ ?? -p.turretDepth*0.22,
      p.cupolaR ?? Math.min(0.24,p.turretWidth*0.09),p.cupolaH ?? 0.10,p.cupolaPeriscopes ?? 6);
    P.add('turret',cylY(0.19,0.19,0.035,14),p.loaderX ?? -p.turretWidth*0.20,h+0.02,-p.turretDepth*0.18);
  }
  if (p.turret !== 'casemate') periscope(P,'turretDetail',p.sightX ?? p.turretWidth*0.20,h+0.06,p.turretFront*0.28);
}

function addPanoramicSight(P: ProfileBuilderPort, p: ProfileConfig): void {
  if (!p.pano) return;
  const { box,cylY }=KIT;
  const h=p.turretHeight;
  P.add('turretDetail',box(0.16,0.19,0.16),p.panoX ?? 0.32,h+0.10,-p.turretDepth*0.20);
  P.add('turretDark',cylY(0.12,0.12,0.17,12),p.panoX ?? 0.32,h+0.27,-p.turretDepth*0.20);
}

function addWesternTurretFurniture(P: ProfileBuilderPort, p: ProfileConfig): void {
  if (p.turret !== 'western') return;
  const { box }=KIT;
  const h=p.turretHeight;
  // Recessed primary sight on the right cheek and a rear mesh basket make
  // Leopard/Type-90 style turrets read as authored armor, not a plain box.
  P.add('turretDark',box(0.34,0.18,0.035),p.turretWidth*0.23,h*0.56,p.turretFront*0.54);
  P.add('turretGlass',box(0.24,0.10,0.018),p.turretWidth*0.23,h*0.56,p.turretFront*0.57);
  P.add('turretDetail',box(p.turretWidth*0.74,0.035,0.035),0,h*0.58,p.turretRear-0.22);
  P.add('turretDetail',box(p.turretWidth*0.74,0.035,0.035),0,0.12,p.turretRear-0.22);
  for(let i=0;i<8;i++) P.add('turretDetail',box(0.025,h*0.44,0.025),-p.turretWidth*0.32+i*(p.turretWidth*0.64/7),h*0.35,p.turretRear-0.22);
}

function addTurretAccessories(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,pintleMG,smokeCluster }=KIT;
  const h=p.turretHeight;
  if (p.smoke !== false && p.turret !== 'casemate') {
    smokeCluster(P,p.turretWidth*0.43,h*0.52,0,Math.min(6,p.smokeCount || 4),1.12,0.55);
    smokeCluster(P,-p.turretWidth*0.43,h*0.52,0,Math.min(6,p.smokeCount || 4),-1.12,0.55);
  }
  if (p.mg) pintleMG(P,p.commanderX ?? p.turretWidth*0.20,h+0.08,-p.turretDepth*0.32,p.mg === 'heavy');
  if (p.antennas !== false && p.turret !== 'casemate') for (const side of [-1,1]) {
    P.add('turretDetail',box(0.022,p.antennaHeight || 0.48,0.022),side*p.turretWidth*0.36,h+0.24,p.turretRear*0.78,0,0,side*0.08);
  }
}

function addMainGun(P: ProfileBuilderPort, p: ProfileConfig): void {
  const { box,buildGun,cylZ }=KIT;
  const gunLength=p.gunLength || P.spec.armor.gunBarrel.lengthM;
  const gunRadius=p.gunRadius || Math.max(0.05,P.spec.armor.gunBarrel.radiusM*0.82);
  P.addGunExtra(box(p.mantletWidth || 0.48,p.mantletHeight || 0.44,0.24),0,0.01,p.turretFront*0.62);
  P.addGunExtra(cylZ(Math.max(0.10,P.spec.armor.gunBarrel.radiusM*1.55),0.28,14),0,0,p.turretFront*0.82);
  buildGun(P,{
    len:gunLength,
    r:gunRadius,
    // evacRatio: buildGun's 1.62 default disappears INSIDE a thermal sleeve
    // (r*1.22) — sleeved tubes need the bulge proud of the sleeve to read.
    sleeve:p.sleeve !== false,evac:Object.hasOwn(p,'evac') ? p.evac : 0.55,
    evacR:p.evacR ?? (p.sleeve !== false ? 1.9 : 1.62),
    collar:true,baseR:Math.max(0.12,P.spec.armor.gunBarrel.radiusM*1.7),
  });
  // §B3.1 MUZZLE BORE — OPT-IN per profile (p.muzzleBore true|config);
  // absent = byte-identical build (shared-helper law).
  if (p.muzzleBore) muzzleBore(P,{
    len:gunLength,
    r:gunRadius,
    ...(typeof p.muzzleBore === 'object' ? p.muzzleBore : null),
  });
}

function buildTurretAndGun(P: ProfileBuilderPort, p: ProfileConfig): void {
  addTurretShell(P,p);
  addTurretCrewStations(P,p);
  addPanoramicSight(P,p);
  addWesternTurretFurniture(P,p);
  addTurretAccessories(P,p);
  addMainGun(P,p);
  P.topY=p.turretHeight+(p.pano?0.46:0.25);
}

// §B3.1 addendum MUZZLE BORE (owner 2026-08-06, banked 32a6946; MANDATORY
// MECHANISM per the leclerc landing, banked 3fca39b): no gun ends in a solid
// capped tip — every muzzle face carries an annular rim + a near-black bore
// disc recessed inside the rim mouth. MECHANISM = SHADOW-NAMED RENDER
// FURNITURE (§C), the misc.ts muzzleBore() reference pattern: bucket-based
// rims grow the gun AABB ~3cm and RE-FRAME the turret-row cameras (-6.2
// measured on leclerc; also re-binned gate z-columns here — m46/m47 hull
// -0.5/-0.3 measured before the rework). /shadow/i-named meshes render in
// every game/critic view but are excluded from every measurement mask AND
// the visible-box framing recipes — mask/frame-neutral BY CONSTRUCTION, and
// the rim sits honestly proud of the old solid cap (which would otherwise
// occlude a recessed disc — the kv2 r9/r10 "blank bore face" lesson).
// Dark torus rim at tube radius + mats.shadow disc at 0.62x recessed ~2cm
// inside the rim mouth; parented to P.gunG (elevation-correct).
// ADDITIVE + OPT-IN ONLY: nothing reaches this without a caller asking.
//
// Modes:
//   muzzleBore(P,{len,r,brake})  buildGun-cfg mirror — tip plane derived
//     from buildGun's face table (plain tube len-0.02; brake exits: single
//     +0.02, double +0.00, discs +0.005).
//   muzzleBore(P,{z,r,...})      explicit face plane for hand-authored
//     tubes (x/y for offset bores). MG muzzles do NOT take the ring — the
//     law gives them pinhole-class dark tips (see muzzleTipDot).
export function muzzleBore(builder: RuntimeValue, o: MuzzleBoreOptions = {}): void {
  const P = requireProfileBuilder(builder);
  const { cylZ, torus, xform } = KIT;
  const r = o.r ?? Math.max(0.05, P.spec.armor.gunBarrel.radiusM * 0.82);
  const len = o.len ?? P.muzzleZ;
  const zTip = o.z ?? (o.brake === 'double' ? len
    : o.brake === 'discs' ? len + 0.005
    : o.brake ? len + 0.02
    : len - 0.02);
  const x = o.x ?? 0, y = o.y ?? 0;
  // KIT.torus lies flat — rotate rx PI/2 for a vertical ring about the bore
  const ring = new THREE.Mesh(
    xform(torus(r * 0.82, r * 0.18, o.seg ?? 16), 0, 0, 0, Math.PI / 2, 0, 0),
    P.mats.dark);
  ring.name = 'muzzleBoreShadowRim';
  ring.position.set(x, y, zTip + 0.016);
  const disc = new THREE.Mesh(cylZ(o.boreR ?? r * 0.62, 0.012, o.seg ?? 14), P.mats.shadow);
  disc.name = 'muzzleBoreShadowDisc';
  disc.position.set(x, y, zTip + 0.006);
  // parent choice for hull-frame guns (casemate class: tubes authored in
  // hull buckets at world coords) — default stays the elevating gun group.
  const parent = o.parent === 'hullG' ? P.hullG : o.parent === 'turretG' ? P.turretG : P.gunG;
  for (const m of [ring, disc]) {
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    P.disposables.push(m.geometry);
  }
}

// §C.1 winding guard (orientedSlab class — the misc.ts device, hoisted here
// for the fleet sweep so every family file can bind it): KIT.slab builds its
// six faces for ONE ring handedness — corners in plan order (-x,+z),(+x,+z),
// (+x,-z),(-x,-z), bottom then top. A mirrored call (x *= -1 without
// re-ordering) hands it the OPPOSITE orientation: all six faces come out
// INWARD and the solid is backface-culled in every FrontSide render (game,
// critic, standard-check truth renders) while staying fully visible to the
// gate's DoubleSide masks — the §C MISSING-SIDE class. This wrapper measures
// face outwardness about the corner centroid and re-orients reversed rings
// (b0,b3,b2,b1 / t0,t3,t2,t1) before building: identical solid, outward
// faces, mask-neutral by construction (only the position-buffer ORDER
// changes on repaired slabs — flipped graduates take the graduate-change
// candidate flow). Mixed rings (3-5 outward) pass through untouched —
// per-face adjudication stays with the owning file (§C.1).
export function orientedSlab(
  ...points: readonly (readonly number[])[]
): THREE.BufferGeometry {
  if (points.length !== 8 || points.some((point) => point.length < 3)) {
    throw new TypeError('orientedSlab requires eight 3D corner points');
  }
  const [b0, b1, b2, b3, t0, t1, t2, t3] = points;
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((sum, point) => sum + point[k], 0) / 8);
  const sub = (a: readonly number[], b: readonly number[]): Vec3Tuple =>
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple =>
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3Tuple, b: Vec3Tuple): number =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// MG-scale companion (§B3.1: "M2/NSVT get pinhole-class dark tips, not
// drilled geometry"): ONE tiny mats.shadow disc on the muzzle of a small-
// arms tube. Shadow-named for the same mask/framing neutrality. parent =
// the P group the MG lives in ('turretG'|'hullG'|'gunG', default turretG);
// pos is that group's frame; rx/ry aim the disc with the tube.
export function muzzleTipDot(
  builder: RuntimeValue,
  x: number,
  y: number,
  z: number,
  r = 0.012,
  o: MuzzleTipOptions = {},
): void {
  const P = requireProfileBuilder(builder);
  const { cylZ, xform } = KIT;
  const dot = new THREE.Mesh(
    xform(cylZ(r, 0.006, 8), 0, 0, 0, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), P.mats.shadow);
  dot.name = 'muzzleTipShadowDot';
  dot.position.set(x, y, z);
  dot.castShadow = false;
  dot.receiveShadow = true;
  (o.parent === 'hullG' ? P.hullG : o.parent === 'gunG' ? P.gunG : P.turretG).add(dot);
  P.disposables.push(dot.geometry);
}

export function buildProfile(builder: RuntimeValue, profile: RuntimeValue): void {
  const P = requireProfileBuilder(builder);
  const p = requireProfileConfig(profile);
  const hull=buildHull(P,p);
  // Recovered roster rows inherit balance data from a nearby vehicle, which
  // includes that donor's articulation anchors. A Pershing inheriting a
  // Sherman ring or an ISU inheriting a Sturmtiger trunnion is exactly how
  // detached turrets and floating cannons were produced. Seat every profiled
  // visual from its own generated roof/superstructure instead.
  if (p.turret === 'casemate') {
    const casemateH=p.casemateHeight || Math.max(0.62,hull.roofY-hull.trackTop+0.28);
    P.turretG.position.set(
      p.turretPivotX || 0,
      p.gunMountY ?? hull.roofY-casemateH*0.38,
      p.gunMountZ ?? (p.casemateDepth || hull.length*0.48)*0.22,
    );
    P.gunG.position.set(0,0,0);
  } else {
    P.turretG.position.set(
      p.turretPivotX || 0,
      p.turretPivotY ?? hull.roofY,
      p.turretPivotZ ?? -hull.length*0.04,
    );
    P.gunG.position.set(
      p.gunX || 0,
      p.gunY ?? p.turretHeight*0.43,
      p.gunZ || 0,
    );
  }
  buildTurretAndGun(P,p);
  P.decal('turret','number',P.spec.visual.number || '',0.25,[p.turretWidth/2*0.97,p.turretHeight*0.40,-p.turretDepth*0.16],Math.PI/2);
  if (p.rearDoor) {
    const { box }=KIT;
    P.add('hullDetail',box(hull.width*0.38,hull.roofY*0.48,0.035),0,hull.roofY*0.62,-hull.halfL*0.975);
  }
}

/**
 * Donor mechanism: start from the canonical family builder and let the
 * owning family module apply its own kit deltas via `profile.kit(P, p)`.
 * (The old central variantKit switch is dissolved into the family modules.)
 */
export function buildDonorVariant(builder: RuntimeValue, profile: RuntimeValue): void {
  const P = requireProfileBuilder(builder);
  const p = requireDonorProfileConfig(profile);
  KIT.buildCanonical(P, p.base);
  if (p.kit) p.kit(P, p);
}

function isMudguardBuilder(value: RuntimeValue): value is MudguardBuilderPort {
  return isRecord(value) && value.hullG instanceof THREE.Group
    && typeof value.add === 'function' && typeof value.addMudguard === 'function';
}

function requireMudguardBuilder(value: RuntimeValue): MudguardBuilderPort {
  if (!isMudguardBuilder(value)) {
    throw new TypeError('shared mudguard builder is missing add/addMudguard/hullG');
  }
  return value;
}

/**
 * Closed, profile-driven mudguard panel. The visible outline lives in the
 * local Y/Z plane and is extruded across local X, so a single primitive can
 * form a long side guard, a short fender return, or a transverse end flap.
 * The default outline has clipped lower corners and a subtle center crown;
 * callers can provide a normalized [z,y] polygon for family-specific shapes.
 */
function shapedMudguardGeometry(options: ShapedMudguardOptions): THREE.BufferGeometry {
  if (!(options.length && options.height)) {
    throw new Error('shared shaped mudguard geometry requires positive length and height');
  }
  const length = Math.max(0.04, options.length);
  const height = Math.max(0.04, options.height);
  const thickness = Math.max(0.012, options.thickness ?? 0.035);
  const frontCut = Math.max(0, Math.min(height * 0.45, options.frontCut ?? height * 0.10));
  const rearCut = Math.max(0, Math.min(height * 0.45, options.rearCut ?? height * 0.06));
  const crown = Math.max(-height * 0.18, Math.min(height * 0.18, options.crown ?? height * 0.025));
  const rake = Math.max(-height * 0.35, Math.min(height * 0.35, options.rake ?? 0));
  const outline = options.profile?.length && options.profile.length >= 3
    ? options.profile.map(([z, y]) => [z * length, y * height] as const)
    : [
      [-length / 2, height / 2] as const,
      [0, height / 2 + crown] as const,
      [length / 2, height / 2 - rake] as const,
      [length / 2, -height / 2 + frontCut] as const,
      [length * 0.36, -height / 2] as const,
      [-length * 0.38, -height / 2] as const,
      [-length / 2, -height / 2 + rearCut] as const,
    ];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  // ExtrudeGeometry grows along +Z. Rotate that axis onto local X and center
  // the thickness about the origin; the profile's shape-X becomes local -Z.
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-thickness / 2, 0, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData = {
    ...(geometry.userData || {}),
    designFamily: 'cot-shaped-mudguard-v1',
    outlinePoints: outline.length,
    closedProfile: true,
  };
  return geometry;
}

function addShapedMudguard(builder: RuntimeValue, options: ShapedMudguardOptions): void {
  const P = requireMudguardBuilder(builder);
  // An unspecified/detail-bucket mudguard is exterior sheet steel, not a
  // neutral gray fitting. Keep rubber and wood explicit; route every painted
  // guard through the camouflaged hull material even when an older caller
  // supplied the generic hullDetail bucket.
  const material = options.material ?? (options.bucket === 'hullRubber' ? 'rubber'
    : options.bucket === 'hullWood' ? 'wood-stained' : 'painted-steel');
  const bucket = material === 'painted-steel' ? 'hull'
    : material === 'wood-stained' ? 'hullWood' : 'hullRubber';
  const rotation = options.rotation ?? [0, 0, 0];
  const geometry = options.geometry ?? shapedMudguardGeometry(options);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = bounds ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const length = options.length ?? Math.max(size.x, size.z);
  const height = options.height ?? size.y;
  const thickness = options.thickness ?? Math.max(0.012, Math.min(
    ...[size.x, size.y, size.z].filter((dimension) => dimension > 0.001),
  ));
  geometry.userData = {
    ...(geometry.userData || {}),
    designFamily: 'cot-shaped-mudguard-v1',
    closedProfile: true,
    customFamilyGeometry: Boolean(options.geometry),
  };
  P.addMudguard(options.label, bucket, geometry,
    options.x, options.y, options.z, rotation[0], rotation[1], rotation[2]);

  // A narrow painted hanger at the upper edge makes the support relationship
  // visible and gives the seating audit a real connected island. It remains
  // hull furniture rather than rubber, even when the hanging panel is rubber.
  const attachedSupport = options.support ?? !options.geometry;
  if (attachedSupport) {
    const supportY = options.y + height / 2 - Math.max(0.012, height * 0.035);
    P.add('hull', KIT.box(thickness * 1.45, Math.max(0.035, height * 0.08), length * 0.94),
      options.x, supportY, options.z, rotation[0], rotation[1], rotation[2]);
  }

  const receipts = Array.isArray(P.hullG.userData.sharedMudguards)
    ? P.hullG.userData.sharedMudguards as SharedMudguardReceipt[] : [];
  receipts.push({
    label: options.label,
    designFamily: 'cot-shaped-mudguard-v1',
    material,
    bucket,
    x: options.x,
    y: options.y,
    z: options.z,
    thicknessM: thickness,
    lengthM: length,
    heightM: height,
    outlinePoints: geometry.userData.outlinePoints,
    customFamilyGeometry: Boolean(options.geometry),
    attachedSupport,
  });
  P.hullG.userData.sharedMudguards = receipts;
}

export const MUDGUARDS = {
  geometry: shapedMudguardGeometry,
  add: addShapedMudguard,
};

// ===========================================================================
// KIT.fittings — STANDARD DECORATION FITTINGS (kit-fittings round, 2026-08-03)
// ===========================================================================
// Owner directive (BUILD-STANDARD §B3): builders CALL these instead of
// hand-authoring roof MGs / stowage per tank. Everything below is ADDITIVE —
// nothing above this banner changed (graduates hash on the factory chain;
// tools/tmp-hashgeo.mjs proves byte-identity).
//
// CONTRACT (every builder in KIT.fittings):
//  * Returns a THREE.Group. EVERY mesh inside carries
//    `userData.fitting = '<type>'`; the group itself carries the same marker
//    plus `userData.fittingRoot = true` (one root per fitting instance —
//    tools/tank-standard-check.mjs v2 censuses these markers).
//  * DETERMINISTIC: no Math.random anywhere — jitter comes from `opts.seed`
//    (default 1) through a local mulberry32. Same opts => byte-identical
//    geometry.
//  * MATERIAL SLOTS: callers pass their family material set as `opts.mats`
//    (normally just `P.mats`). Builders pick slots by the createTankMaterials
//    keys (dark / detail / canvasCloth / wood / spareTrack / glass / hull /
//    barrel / rubber) and fall back to `mats.dark`. A neutral white vertex-
//    color attribute is baked into every merged geometry so the camo slots
//    (hull/barrel, vertexColors:true) never render black.
//  * AABB FRAMING (BUILD-STANDARD §C): fittings must never change the model
//    AABB. The CALLER anchors the group so its whole envelope stays INSIDE
//    the hull/turret AABB; the as-built local envelope is stamped on
//    `group.userData.aabb = {min:[x,y,z], max:[x,y,z]}` for containment
//    checks (standard-check's fixture mode asserts it matches the meshes).
//  * WINDING: geometry is composed exclusively from canonical three.js
//    primitives (box/cyl/sphere/torus/lathe/tube) — never hand-wound slabs —
//    so top-view backface culling can't eat a fitting. standard-check's
//    fixture mode renders each fitting top-down with FrontSide materials and
//    asserts non-zero coverage.
//  * MG PHYSICS (banked law): pintleMG builds a receiver MASS (never a
//    stick), a connected feed and engineered cradle, plus a barrel that can
//    break the roofline. The complete weapon and ammunition path always use
//    neutral gunmetal. `tone` changes only the roof bearing/shield support so
//    host camouflage can never turn the gun into a miniature green/tan prop.
//    Pintle silhouette allowance stays within the ≤0.4 gate-pt law when the
//    caller keeps the envelope inside certified bins.
//  * Shadows: castShadow/receiveShadow default true (fittings replace
//    bucket-authored greebles which cast); pass `shadows:false` to opt out.
//
// Distinct from the legacy P-bucket helpers (KIT.pintleMG / KIT.towCable /
// KIT.stowage — those write into merged material buckets and stay for the
// already-graduated call sites): FITTINGS functions return marker-carrying
// groups, which is what the §B3 census machine-checks.
//
// Profile usage:
//   import { KIT, FITTINGS } from './kit.ts';
//   const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone' });
//   mg.position.set(0.62, roofY, -0.85);     // anchor INSIDE the turret AABB
//   P.turretG.add(mg);
function fitRng(seed: number): () => number {
  let a = (seed | 0) ^ 0x2c9277b5;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Per-fitting part collector with P.add ergonomics, keyed by MATERIAL SLOT.
function fitParts(): FittingParts {
  const bySlot: Record<string, THREE.BufferGeometry[]> = {};
  return {
    bySlot,
    add(slot: string, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0,
      rx = 0, ry = 0, rz = 0, s: GeometryScale = 1): void {
      (bySlot[slot] || (bySlot[slot] = [])).push(
        transformGeometry(geo, x, y, z, rx, ry, rz, s),
      );
    },
  };
}

function isMaterial(value: RuntimeValue): value is THREE.Material {
  return isRecord(value) && value.isMaterial === true;
}

function fitMat(mats: Record<string, RuntimeValue>, slot: string): THREE.Material {
  if (slot === 'gunmetalAmmo' && isMaterial(mats.dark)) return mats.dark;
  const m = mats[slot] || mats.dark;
  if (isMaterial(m)) return m;
  for (const value of Object.values(mats)) if (isMaterial(value)) return value;
  throw new Error(`KIT.fittings: no material is available for slot ${slot}`);
}

function requireMaterialMap(value: RuntimeValue, type: string): Record<string, RuntimeValue> {
  if (!isRecord(value)) {
    throw new Error(`KIT.fittings.${type}: opts.mats (family material set, e.g. P.mats) is required`);
  }
  return value;
}

// Merge one mesh per material slot, stamp markers + local AABB, return group.
function fitAssemble(type: string, parts: FittingParts, opts: FittingOptions): THREE.Group {
  const mats = requireMaterialMap(opts.mats, type);
  const g = new THREE.Group();
  g.name = `fitting_${type}`;
  const shadows = opts.shadows !== false;
  for (const [slot, geos] of Object.entries(parts.bySlot)) {
    if (!geos.length) continue;
    const merged = KIT.mergeAll(geos);
    const material = fitMat(mats, slot);
    const camoUvScale = Number(material.userData?.camoUvScale);
    if (Number.isFinite(camoUvScale) && camoUvScale > 0) {
      // Project after all authored transforms have been merged. This keeps a
      // single metres-based pattern across complete RWS/tower armor instead
      // of restarting the full 0..1 camouflage atlas on every tiny primitive.
      KIT.boxUV(merged, camoUvScale);
    }
    // Camo slots (hull/barrel) sample vertexColors; a missing attribute reads
    // (0,0,0) in WebGL and renders BLACK — bake neutral white (ERA precedent).
    merged.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(merged.attributes.position.count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `fitting_${type}_${slot}`;
    mesh.castShadow = mesh.receiveShadow = shadows;
    mesh.userData.fitting = type;
    mesh.userData.fittingSlot = slot;
    mesh.userData.combatHitboxRole = 'equipment';
    mesh.userData.surfaceMarkupSelectable = true;
    if (Number.isFinite(camoUvScale) && camoUvScale > 0) {
      mesh.userData.camoProjection = 'continuous-fitting-box-uv';
      mesh.userData.camoUvScale = camoUvScale;
    }
    g.add(mesh);
  }
  g.userData.fitting = type;
  g.userData.fittingRoot = true;
  g.userData.combatHitboxRole = 'equipment';
  g.userData.surfaceMarkupSelectable = true;
  if (opts.rotation) g.rotation.set(opts.rotation[0] || 0, opts.rotation[1] || 0, opts.rotation[2] || 0);
  const bb = new THREE.Box3().setFromObject(g);
  g.userData.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
  return g;
}

// Browning-derived MG family table. Every class keeps the same authored load
// path and receiver grammar (bearing -> fork -> trunnion -> receiver ->
// jacket/barrel) while caliber-specific dimensions, jackets and muzzle devices
// preserve national identity. `pintleMG` is the fleet default; exact hero props
// may add detail, but must not fall back to anonymous rods or floating boxes.
// rec = [w,h,d] receiver mass.
const MG_CLASSES = {
  m2:    { s: 1.00, rec: [0.115, 0.095, 0.46], barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, caliber: 12.7, name: 'Browning M2HB' },
  heavy: { s: 1.00, rec: [0.115, 0.095, 0.46], barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07, caliber: 12.7, name: 'Browning-pattern HMG' },
  dshk:  { s: 1.02, rec: [0.105, 0.105, 0.44], barrelR: 0.0155, barrelL: 0.50, jacket: 'fins',   flashR: 0.035, flashL: 0.10, caliber: 12.7, name: 'DShK-pattern HMG' },
  nsvt:  { s: 0.98, rec: [0.095, 0.100, 0.42], barrelR: 0.0240, barrelL: 0.55, jacket: 'none',   flashR: 0.035, flashL: 0.10, caliber: 12.7, name: 'NSVT-pattern HMG' },
  kord:  { s: 0.99, rec: [0.100, 0.105, 0.43], barrelR: 0.0220, barrelL: 0.57, jacket: 'ribbed', flashR: 0.033, flashL: 0.10, caliber: 12.7, name: 'Kord-pattern HMG' },
  mag:   { s: 0.78, rec: [0.100, 0.050, 0.34], barrelR: 0.0120, barrelL: 0.46, jacket: 'none',   flashR: 0.017, flashL: 0.06, caliber: 7.62, name: 'Browning-derived GPMG' },
  mag58: { s: 0.80, rec: [0.105, 0.052, 0.35], barrelR: 0.0125, barrelL: 0.47, jacket: 'ribbed', flashR: 0.018, flashL: 0.06, caliber: 7.62, name: 'MAG 58 GPMG' },
};

function isMgClass(value: string | undefined): value is keyof typeof MG_CLASSES {
  return value !== undefined && Object.hasOwn(MG_CLASSES, value);
}

function fittingRing(options: FittingOptions): { r?: number; stubs?: number } | null {
  if (!options.ring) return null;
  return typeof options.ring === 'object' ? options.ring : {};
}

// Machine-gun barrel components are authored on the fitting's local +Z axis.
// Previous builders rotated only these vertices while leaving the receiver,
// trunnion and mount untouched. Besides producing visibly crooked barrels,
// rotating after the forward translation pulled the breech away from its
// support. Keep every barrel straight and connected; callers that need a
// different firing attitude rotate a complete fitting or weapon station.
function placeMachineGunBarrelGeometry(
  geometry: THREE.BufferGeometry,
  dz: number,
  dy = 0,
): THREE.BufferGeometry {
  return KIT.xform(geometry, 0, dy, dz);
}

/**
 * Roof pintle machine gun (MANDATORY §B3 decoration — MG PHYSICS compliant).
 * Origin: pintle FOOT on the roof plate (caller seats it on the deck/cupola).
 * @param {object} opts
 *   mats     family material set (required — normally P.mats)
 *   cls      'm2' | 'heavy' | 'dshk' | 'nsvt' | 'kord' |
 *            'mag' | 'mag58'                                  (default 'm2')
 *   scale    extra uniform scale on the class                (default 1)
 *   tone     'two-tone' | 'pale' | 'dark'                    (default 'two-tone')
 *   elev     legacy no-op; rotate the complete station for elevation
 *   ring     AA ring around the foot: true | {r, stubs}      (default false)
 *   ammo     ammo can on the receiver's left                 (default true)
 *   shield   false | true | 'low' | 'armored'                (default false)
 *   seed, shadows, rotation
 * Envelope (m2/scale 1, no ring): x ±0.17, y 0..0.36, z -0.30..+0.93 —
 * authoritative per-build box in group.userData.aabb.
 */
type MgClassKey = keyof typeof MG_CLASSES;
type MgClassDefinition = (typeof MG_CLASSES)[MgClassKey];

interface PintleMgBuildContext {
  readonly opts: FittingOptions;
  readonly classKey: MgClassKey;
  readonly cls: MgClassDefinition;
  readonly s: number;
  readonly tone: string;
  readonly weaponSlot: string;
  readonly supportSlot: string;
  readonly ammoSlot: string;
  readonly parts: FittingParts;
  readonly rw: number;
  readonly rh: number;
  readonly rd: number;
  readonly colTop: number;
  readonly recY: number;
  readonly recZ: number;
  readonly trunY: number;
  readonly trunZ: number;
  readonly shieldVariant: FittingOptions['shield'];
  readonly aim: (geometry: THREE.BufferGeometry, dz: number, dy?: number) => THREE.BufferGeometry;
}

function createPintleMgBuildContext(opts: FittingOptions): PintleMgBuildContext {
  const classKey = isMgClass(opts.cls) ? opts.cls : 'm2';
  const cls = MG_CLASSES[classKey];
  const s = (opts.scale || 1) * cls.s;
  const tone = opts.tone || 'two-tone';
  // Weapons and ammunition stay neutral gunmetal. Tone now controls only the
  // support/shield finish; letting the host camouflage color receiver caps and
  // ammo cans produced the miniature green/tan guns the fleet pass removes.
  const weaponSlot = 'dark';
  const supportSlot = tone === 'pale' ? 'detail' : 'dark';
  const ammoSlot = opts.ammoSlot || 'gunmetalAmmo';
  const parts = fitParts();
  const [rw, rh, rd] = cls.rec.map((v) => v * s);
  const colH = 0.16 * s;
  const colTop = 0.014 + colH;
  const recY = colTop + 0.080 * s + rh / 2;
  const recZ = 0.06 * s;
  const trunY = recY + 0.004;
  const trunZ = recZ + rd / 2;
  const shieldVariant = opts.shield === true ? 'standard' : opts.shield;
  const aim = placeMachineGunBarrelGeometry;

  return {
    opts,
    classKey,
    cls,
    s,
    tone,
    weaponSlot,
    supportSlot,
    ammoSlot,
    parts,
    rw,
    rh,
    rd,
    colTop,
    recY,
    recZ,
    trunY,
    trunZ,
    shieldVariant,
    aim,
  };
}

function addPintleMgMount(context: PintleMgBuildContext): void {
  const { box, cylX, cylY, torus } = KIT;
  const { colTop, parts, s, supportSlot, weaponSlot } = context;
  // Flanged bearing, spindle, bridge, fork and cross-shaft form one visible
  // load path. The old single post made every gun look like a block on a rod.
  const colH = 0.16 * s;
  parts.add(supportSlot, cylY(0.030 * s, 0.038 * s, 0.014, 14), 0, 0.007, 0);
  parts.add(weaponSlot, torus(0.031 * s, 0.006 * s, 18), 0, 0.015, 0);
  parts.add(weaponSlot, cylY(0.018 * s, 0.023 * s, colH, 12), 0, 0.014 + colH / 2, 0);
  parts.add(weaponSlot, box(0.115 * s, 0.045 * s, 0.15 * s), 0, colTop + 0.0225 * s, 0.01);
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, box(0.020 * s, 0.095 * s, 0.105 * s),
      side * 0.052 * s, colTop + 0.070 * s, 0.045 * s, side * 0.05, 0, 0);
  }
  parts.add(weaponSlot, cylX(0.025 * s, 0.130 * s, 12), 0, colTop + 0.105 * s, 0.065 * s);
}

function addPintleMgReceiver(context: PintleMgBuildContext): void {
  const { box } = KIT;
  const { parts, rd, recY, recZ, rh, rw, s, weaponSlot } = context;
  // Browning-family receiver: service box, hinged top cover, side plate,
  // buffer head, charging handle, rear sight and dual spade grips.
  parts.add(weaponSlot, box(rw, rh, rd), 0, recY, recZ);
  parts.add(weaponSlot, box(rw * 0.92, 0.018 * s, rd * 0.88),
    0, recY + rh / 2 + 0.009 * s, recZ + 0.005 * s);
  parts.add(weaponSlot, box(0.020 * s, rh * 0.70, rd * 0.54),
    rw / 2 + 0.010 * s, recY, recZ - 0.025 * s);
  parts.add(weaponSlot, box(rw * 0.72, rh * 0.58, 0.050 * s),
    0, recY - 0.005 * s, recZ - rd / 2 - 0.025 * s);
  parts.add(weaponSlot, box(0.052 * s, 0.017 * s, 0.075 * s),
    -rw / 2 - 0.026 * s, recY + 0.018 * s, recZ - 0.015 * s);
  parts.add(weaponSlot, box(0.044 * s, 0.045 * s, 0.018 * s),
    0, recY + rh / 2 + 0.030 * s, recZ - rd * 0.22);
  for (const side of [-1, 1]) {
    parts.add(weaponSlot, box(0.018 * s, 0.026 * s, 0.095 * s),
      side * 0.036 * s, recY - 0.012 * s, recZ - rd / 2 - 0.080 * s,
      side * 0.08, 0, 0);
    parts.add(weaponSlot, box(0.035 * s, 0.018 * s, 0.018 * s),
      side * 0.045 * s, recY - 0.042 * s, recZ - rd / 2 - 0.122 * s);
  }
  parts.add(weaponSlot, box(0.012 * s, 0.020 * s, 0.020 * s),
    0, recY + rh / 2 + 0.022 * s, recZ + rd * 0.28);
}

function addPintleMgBarrel(context: PintleMgBuildContext): void {
  const { box, cylZ, torus } = KIT;
  const { aim, cls, opts, parts, s, trunY, trunZ, weaponSlot } = context;
  // Barrel group stays collinear with the receiver at the front trunnion.
  if (cls.jacket === 'sleeve') {
    parts.add(weaponSlot, aim(cylZ(cls.barrelR * s * 1.85, 0.15 * s, 14), 0.075 * s), 0, trunY, trunZ);
    for (let k = 0; k < 4; k++) {
      parts.add(weaponSlot, aim(torus(cls.barrelR * s * 1.88, 0.0035 * s, 12),
        (0.030 + k * 0.034) * s), 0, trunY, trunZ);
    }
  } else if (cls.jacket === 'fins') {
    for (let k = 0; k < 5; k++) {
      parts.add(weaponSlot, aim(cylZ(cls.barrelR * s * 1.5, 0.020 * s, 12), (0.03 + k * 0.028) * s), 0, trunY, trunZ);
    }
  } else if (cls.jacket === 'ribbed') {
    parts.add(weaponSlot, aim(cylZ(cls.barrelR * s * 1.32, 0.13 * s, 12), 0.065 * s), 0, trunY, trunZ);
    for (let k = 0; k < 4; k++) {
      parts.add(weaponSlot, aim(torus(cls.barrelR * s * 1.34, 0.003 * s, 12),
        (0.026 + k * 0.030) * s), 0, trunY, trunZ);
    }
  } else if (opts.barrelBridge) {
    // Some slim, unsleeved weapons otherwise begin their barrel 100 mm ahead
    // of the receiver.  Let callers request the missing breech-to-barrel run
    // without changing the certified silhouettes of existing fittings.
    parts.add(weaponSlot, aim(cylZ(cls.barrelR * s * 1.12, 0.105 * s, 10), 0.0525 * s), 0, trunY, trunZ);
  }
  const bl = cls.barrelL * s;
  parts.add(weaponSlot, aim(cylZ(cls.barrelR * s, bl, 10), 0.10 * s + bl / 2), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(cls.flashR * s, cls.flashL * s, 12), 0.10 * s + bl + cls.flashL * s / 2), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(cylZ(cls.barrelR * s * 0.55, 0.010, 10), 0.10 * s + bl + cls.flashL * s + 0.006), 0, trunY, trunZ);
  parts.add(weaponSlot, aim(box(0.012 * s, 0.026 * s, 0.015 * s), 0.18 * s,
    cls.barrelR * s + 0.014 * s), 0, trunY, trunZ);
}

function addPintleMgAmmo(context: PintleMgBuildContext): void {
  const { box } = KIT;
  const { ammoSlot, opts, parts, recY, recZ, rw, s, weaponSlot } = context;
  if (opts.ammo !== false) {
    const ax = -(rw / 2 + 0.055 * s);
    parts.add(ammoSlot, box(0.085 * s, 0.11 * s, 0.17 * s), ax, recY - 0.005, recZ - 0.02);
    parts.add(weaponSlot, box(0.079 * s, 0.008 * s, 0.158 * s), ax, recY + 0.058 * s, recZ - 0.02);
    parts.add(weaponSlot, box(0.018 * s, 0.060 * s, 0.020 * s),
      ax - 0.050 * s, recY + 0.002 * s, recZ - 0.020 * s);
    // Short visible feed run; links stay gunmetal and terminate at the
    // receiver instead of floating between unrelated boxes.
    for (let index = 0; index < 5; index++) {
      const t = index / 4;
      parts.add(weaponSlot, box(0.018 * s, 0.026 * s, 0.024 * s),
        ax * (1 - t) - rw * 0.36 * t, recY + (0.020 + t * 0.012) * s,
        recZ + (0.065 + t * 0.070) * s, 0, 0, -0.10 + t * 0.16);
    }
  }
}

function addPintleMgShield(context: PintleMgBuildContext): void {
  const { box, cylZ } = KIT;
  const { parts, recY, s, shieldVariant, tone, trunZ, weaponSlot } = context;
  if (shieldVariant) {
    const shieldSlot = tone === 'dark' ? 'dark' : 'detail';
    const shieldZ = trunZ + 0.035 * s;
    const sideW = shieldVariant === 'armored' ? 0.18 : 0.145;
    const shieldH = shieldVariant === 'low' ? 0.14 : shieldVariant === 'armored' ? 0.27 : 0.22;
    for (const side of [-1, 1]) {
      parts.add(shieldSlot, box(sideW * s, shieldH * s, 0.022 * s),
        side * (0.075 + sideW / 2) * s, recY + 0.018 * s, shieldZ,
        0, -side * 0.055, side * 0.035);
      parts.add(weaponSlot, box(0.018 * s, shieldH * 0.82 * s, 0.030 * s),
        side * (0.148 + sideW * 0.45) * s, recY + 0.006 * s, shieldZ - 0.020 * s);
      parts.add(weaponSlot, box(0.020 * s, 0.020 * s, 0.14 * s),
        side * 0.115 * s, recY - shieldH * 0.30 * s, shieldZ - 0.060 * s,
        -0.22, 0, side * 0.08);
    }
    parts.add(shieldSlot, box(0.19 * s, 0.032 * s, 0.026 * s),
      0, recY + shieldH * 0.48 * s, shieldZ);
    // Folded lips, sight slots and fastener heads keep the shield from
    // reading as one featureless rectangle. They share the shield plane and
    // remain part of the equipment fitting rather than turret armor.
    for (const side of [-1, 1]) {
      parts.add(shieldSlot, box(0.022 * s, shieldH * 0.92 * s, 0.045 * s),
        side * (0.075 + sideW - 0.012) * s, recY + 0.018 * s, shieldZ - 0.010 * s,
        0, -side * 0.10, 0);
      parts.add('shadow', box(sideW * 0.43 * s, 0.032 * s, 0.012 * s),
        side * 0.145 * s, recY + shieldH * 0.18 * s, shieldZ + 0.014 * s,
        0, -side * 0.055, 0);
      for (const sy of [-0.28, 0.30]) {
        parts.add('dark', cylZ(0.009 * s, 0.012 * s, 8),
          side * (0.075 + sideW * 0.70) * s,
          recY + sy * shieldH * s, shieldZ + 0.018 * s);
      }
    }
    if (shieldVariant === 'armored') {
      parts.add(shieldSlot, box(0.34 * s, 0.035 * s, 0.18 * s),
        0, recY + shieldH * 0.58 * s, shieldZ - 0.070 * s);
    }
  }
}

function addPintleMgRing(context: PintleMgBuildContext): void {
  const { box, torus } = KIT;
  const { opts, parts, s, tone } = context;
  const ring = fittingRing(opts);
  if (ring) {
    const rr = (ring.r || 0.20) * s;
    const rSlot = tone === 'dark' ? 'dark' : 'detail';
    parts.add(rSlot, torus(rr, 0.011, 26), 0, 0.035, 0);
    const stubs = ring.stubs || 3;
    for (let k = 0; k < stubs; k++) {
      const a = 0.6 + k * (Math.PI * 2 / stubs);
      parts.add(rSlot, box(0.024, 0.032, 0.024), Math.cos(a) * rr * 0.98, 0.018, Math.sin(a) * rr * 0.98);
    }
  }
}

function assemblePintleMg(context: PintleMgBuildContext): THREE.Group {
  const { classKey, cls, opts, parts, shieldVariant } = context;
  const fitting = fitAssemble('pintleMG', parts, opts);
  fitting.name = `fitting_browningDerived_${classKey}`;
  fitting.userData.barrelBridge = Boolean(opts.barrelBridge);
  fitting.userData.browningDerivedStandard = 'cot-browning-family-v2';
  fitting.userData.weaponClass = classKey;
  fitting.userData.weaponName = cls.name;
  fitting.userData.caliberMm = cls.caliber;
  fitting.userData.shieldVariant = shieldVariant || 'open';
  fitting.userData.foldedShieldEdges = shieldVariant ? 2 : 0;
  fitting.userData.shieldVisionPorts = shieldVariant ? 2 : 0;
  fitting.userData.hasConnectedFeed = opts.ammo !== false;
  fitting.userData.hasEngineeredCradle = true;
  fitting.userData.machineGunFinish = opts.machineGunFinish || 'gunmetal';
  fitting.userData.firingAxis = '+Z';
  fitting.userData.barrelAxisLocal = [0, 0, 1];
  fitting.userData.barrelElevationRad = 0;
  const weaponMesh = fitting.children.find((child) => child.userData.fittingSlot === 'dark');
  if (weaponMesh) {
    weaponMesh.name = 'browningDerivedMachineGunBody';
    weaponMesh.userData.appearanceRole = 'machineGun';
  }
  return fitting;
}

function fittingPintleMG(opts: FittingOptions = {}): THREE.Group {
  const context = createPintleMgBuildContext(opts);
  addPintleMgMount(context);
  addPintleMgReceiver(context);
  addPintleMgBarrel(context);
  addPintleMgAmmo(context);
  addPintleMgShield(context);
  addPintleMgRing(context);
  return assemblePintleMg(context);
}

/**
 * Detailed US M2HB installation shared by the Sheridan, Patton and M60
 * families. The generic `pintleMG({ cls: 'm2' })` is the compact fleet
 * standard; this version is the American hero-prop installation with the
 * receiver, feed path, ammunition chest, cradle and perforated jacket all
 * reading as separate connected members.
 *
 * Origin: mounting foot on the roof. +Z is the firing direction.
 */
interface AmericanM2BuildContext {
  readonly opts: FittingOptions;
  readonly s: number;
  readonly ammoSide: number;
  readonly parts: FittingParts;
  readonly recY: number;
  readonly recZ: number;
  readonly trunZ: number;
  readonly shieldVariant: FittingOptions['shield'];
  readonly aim: (geometry: THREE.BufferGeometry, dz: number, dy?: number) => THREE.BufferGeometry;
}

function createAmericanM2BuildContext(opts: FittingOptions): AmericanM2BuildContext {
  const s = opts.scale || 1;
  const ammoSide = Math.sign(opts.ammoSide || -1);
  const parts = fitParts();
  const aim = placeMachineGunBarrelGeometry;
  const recY = 0.345 * s;
  const recZ = 0.195 * s;
  const trunZ = recZ + 0.250 * s;
  const shieldVariant = opts.shield === true ? 'standard' : opts.shield;

  return { opts, s, ammoSide, parts, recY, recZ, trunZ, shieldVariant, aim };
}

function addAmericanM2Mount(context: AmericanM2BuildContext): void {
  const { box, cylX, cylY } = KIT;
  const { parts, s } = context;
  // Roof bearing -> spindle -> fork -> trunnion: one unbroken load path.
  parts.add('dark', cylY(0.070 * s, 0.082 * s, 0.026 * s, 16), 0, 0.013 * s, 0);
  parts.add('dark', cylY(0.032 * s, 0.045 * s, 0.180 * s, 14), 0, 0.116 * s, 0);
  parts.add('dark', box(0.190 * s, 0.055 * s, 0.155 * s), 0, 0.220 * s, 0.035 * s);
  for (const side of [-1, 1]) {
    parts.add('dark', box(0.032 * s, 0.120 * s, 0.130 * s),
      side * 0.073 * s, 0.278 * s, 0.070 * s, side * 0.08, 0, 0);
  }
  parts.add('dark', cylX(0.046 * s, 0.205 * s, 14), 0, 0.330 * s, 0.105 * s);
}

function addAmericanM2Receiver(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { parts, recY, recZ, s } = context;
  // M2 receiver and recognizable top-cover/charging-handle grammar.
  parts.add('dark', box(0.155 * s, 0.145 * s, 0.500 * s), 0, recY, recZ);
  parts.add('dark', box(0.145 * s, 0.022 * s, 0.445 * s),
    0, recY + 0.083 * s, recZ + 0.005 * s);
  parts.add('dark', box(0.052 * s, 0.035 * s, 0.120 * s),
    -0.105 * s, recY + 0.025 * s, recZ - 0.015 * s);
  parts.add('dark', box(0.090 * s, 0.036 * s, 0.046 * s),
    0, recY - 0.015 * s, recZ - 0.280 * s);
  for (const side of [-1, 1]) {
    parts.add('dark', box(0.027 * s, 0.032 * s, 0.125 * s),
      side * 0.053 * s, recY - 0.005 * s, recZ - 0.315 * s,
      side * 0.06, 0, 0);
  }
}

function addAmericanM2Ammo(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { ammoSide, opts, parts, recY, recZ, s } = context;
  // Closed ammunition chest, proud lid, retaining rack and receiver bridge.
  // This is part of the weapon installation rather than vehicle armor, so it
  // stays in neutral gunmetal and never inherits the host camouflage.
  if (opts.ammo !== false) {
    const ax = ammoSide * 0.245 * s;
    parts.add('gunmetalAmmo', box(0.270 * s, 0.205 * s, 0.260 * s),
      ax, recY - 0.020 * s, recZ - 0.015 * s);
    parts.add('gunmetalAmmo', box(0.286 * s, 0.020 * s, 0.276 * s),
      ax, recY + 0.092 * s, recZ - 0.015 * s);
    for (const side of [-1, 1]) {
      parts.add('dark', box(0.020 * s, 0.230 * s, 0.295 * s),
        ax + side * 0.152 * s, recY - 0.015 * s, recZ - 0.015 * s);
    }
    parts.add('dark', box(0.115 * s, 0.070 * s, 0.125 * s),
      ammoSide * 0.115 * s, recY + 0.035 * s, recZ + 0.155 * s,
      0, -ammoSide * 0.18, 0);
    for (let index = 0; index < 7; index++) {
      const t = index / 6;
      parts.add(index % 2 ? 'shadow' : 'dark', box(0.030 * s, 0.040 * s, 0.027 * s),
        ammoSide * (0.168 - t * 0.155) * s,
        recY + (0.052 + t * 0.015) * s,
        recZ + (0.120 + t * 0.095) * s,
        0, 0, ammoSide * (0.10 - t * 0.16));
      }
  }
}

function addAmericanM2Barrel(context: AmericanM2BuildContext): void {
  const { cylZ, torus } = KIT;
  const { aim, opts, parts, recY, s, trunZ } = context;
  // Jacket, barrel and flash hider share one straight receiver axis.
  parts.add('dark', aim(cylZ(0.043 * s, 0.220 * s, 16), 0.110 * s),
    0, recY, trunZ);
  for (let index = 0; index < 5; index++) {
    parts.add('dark', aim(torus(0.044 * s, 0.006 * s, 14), (0.035 + index * 0.039) * s),
      0, recY, trunZ);
  }
  const barrelLength = (opts.barrelLength ?? 0.68) * s;
  parts.add('dark', aim(cylZ(0.019 * s, barrelLength, 12),
    0.220 * s + barrelLength / 2), 0, recY, trunZ);
  parts.add('dark', aim(cylZ(0.038 * s, 0.105 * s, 14),
    0.220 * s + barrelLength + 0.0525 * s), 0, recY, trunZ);
  parts.add('dark', aim(cylZ(0.014 * s, 0.018 * s, 10),
    0.220 * s + barrelLength + 0.114 * s), 0, recY, trunZ);
}

function addAmericanM2Ring(context: AmericanM2BuildContext): void {
  const { box, torus } = KIT;
  const { opts, parts, s } = context;
  const ring = fittingRing(opts);
  if (ring) {
    const rr = (ring.r || 0.235) * s;
    parts.add('dark', torus(rr, 0.014 * s, 28), 0, 0.032 * s, 0);
    for (let index = 0; index < (ring.stubs || 4); index++) {
      const a = 0.55 + index * Math.PI * 2 / (ring.stubs || 4);
      parts.add('dark', box(0.030 * s, 0.045 * s, 0.030 * s),
        Math.cos(a) * rr, 0.020 * s, Math.sin(a) * rr);
      }
  }
}

function addAmericanM2LowShield(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { parts, recY, s, trunZ } = context;
  for (const side of [-1, 1]) {
    parts.add('hull', box(0.215 * s, 0.21 * s, 0.030 * s),
      side * 0.125 * s, recY - 0.015 * s, trunZ + 0.085 * s,
      0, -side * 0.045, side * 0.025);
    parts.add('dark', box(0.022 * s, 0.175 * s, 0.034 * s),
      side * 0.235 * s, recY - 0.018 * s, trunZ + 0.072 * s);
  }
  parts.add('dark', box(0.15 * s, 0.075 * s, 0.035 * s),
    0, recY - 0.015 * s, trunZ + 0.108 * s);
}

function addAmericanM2SplitShield(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { parts, recY, s, trunZ } = context;
  for (const side of [-1, 1]) {
    parts.add('hull', box(0.205 * s, 0.30 * s, 0.032 * s),
      side * 0.145 * s, recY + 0.015 * s, trunZ + 0.090 * s,
      0, -side * 0.055, 0);
    parts.add('dark', box(0.022 * s, 0.275 * s, 0.040 * s),
      side * 0.252 * s, recY + 0.010 * s, trunZ + 0.080 * s);
  }
  parts.add('hull', box(0.36 * s, 0.040 * s, 0.045 * s),
    0, recY + 0.175 * s, trunZ + 0.085 * s);
}

function addAmericanM2ArmoredShield(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { parts, recY, s, trunZ } = context;
  parts.add('hull', box(0.58 * s, 0.34 * s, 0.040 * s),
    0, recY + 0.020 * s, trunZ + 0.090 * s);
  for (const side of [-1, 1]) {
    parts.add('hull', box(0.035 * s, 0.30 * s, 0.23 * s),
      side * 0.272 * s, recY + 0.005 * s, trunZ - 0.010 * s,
      0, -side * 0.10, 0);
  }
  parts.add('hull', box(0.57 * s, 0.035 * s, 0.25 * s),
    0, recY + 0.205 * s, trunZ - 0.005 * s);
  parts.add('dark', box(0.18 * s, 0.115 * s, 0.045 * s),
    0, recY, trunZ + 0.120 * s);
}

function addAmericanM2StandardShield(context: AmericanM2BuildContext): void {
  const { box } = KIT;
  const { parts, recY, s, trunZ } = context;
  for (const side of [-1, 1]) {
    parts.add('hull', box(0.245 * s, 0.30 * s, 0.035 * s),
      side * 0.145 * s, recY + 0.015 * s, trunZ + 0.090 * s,
      0, -side * 0.055, side * 0.035);
    parts.add('dark', box(0.023 * s, 0.268 * s, 0.040 * s),
      side * 0.274 * s, recY + 0.005 * s, trunZ + 0.076 * s);
    parts.add('dark', box(0.024 * s, 0.024 * s, 0.18 * s),
      side * 0.175 * s, recY - 0.115 * s, trunZ + 0.005 * s,
      -0.28, 0, side * 0.08);
  }
  parts.add('hull', box(0.36 * s, 0.038 * s, 0.040 * s),
    0, recY + 0.178 * s, trunZ + 0.085 * s);
  parts.add('dark', box(0.17 * s, 0.11 * s, 0.040 * s),
    0, recY, trunZ + 0.115 * s);
}

function addAmericanM2ShieldDetails(context: AmericanM2BuildContext): void {
  const { box, cylZ } = KIT;
  const { parts, recY, s, shieldVariant, trunZ } = context;
  const shieldH = shieldVariant === 'low' ? 0.21 : shieldVariant === 'armored' ? 0.34 : 0.30;
  const lipW = shieldVariant === 'armored' ? 0.58 : 0.49;
  parts.add('hull', box(lipW * s, 0.026 * s, 0.055 * s),
    0, recY + shieldH * 0.56 * s, trunZ + 0.065 * s, 0.10, 0, 0);
  for (const side of [-1, 1]) {
    parts.add('shadow', box(0.095 * s, 0.036 * s, 0.014 * s),
      side * 0.145 * s, recY + 0.070 * s, trunZ + 0.112 * s,
      0, -side * 0.055, 0);
    for (const sy of [-0.075, 0.125]) {
      parts.add('dark', cylZ(0.010 * s, 0.014 * s, 8),
        side * 0.235 * s, recY + sy * s, trunZ + 0.116 * s);
    }
  }
}

function addAmericanM2Shield(context: AmericanM2BuildContext): void {
  const { shieldVariant } = context;
  if (!shieldVariant) return;
  if (shieldVariant === 'low') addAmericanM2LowShield(context);
  else if (shieldVariant === 'split') addAmericanM2SplitShield(context);
  else if (shieldVariant === 'armored') addAmericanM2ArmoredShield(context);
  else addAmericanM2StandardShield(context);
  addAmericanM2ShieldDetails(context);
}

function assembleAmericanM2(context: AmericanM2BuildContext): THREE.Group {
  const { ammoSide, opts, parts, shieldVariant } = context;
  const fitting = fitAssemble('pintleMG', parts, opts);
  fitting.name = 'fitting_americanM2HB';
  const ammoMesh = fitting.children.find((child) => child.userData.fittingSlot === 'gunmetalAmmo');
  if (ammoMesh) {
    ammoMesh.name = 'sheridanCommanderM2AmmoBox';
    ammoMesh.userData.appearanceRole = 'ammoBox';
  }
  const bodyMesh = fitting.children.find((child) => child.userData.fittingSlot === 'dark');
  if (bodyMesh) {
    bodyMesh.name = 'americanM2HBBody';
    bodyMesh.userData.appearanceRole = 'machineGun';
  }
  fitting.userData.americanWeaponStandard = 'sheridan-m2hb-v2';
  fitting.userData.browningDerivedStandard = 'cot-browning-family-v2';
  fitting.userData.weaponName = 'Browning M2HB';
  fitting.userData.caliberMm = 12.7;
  fitting.userData.ammoSide = ammoSide;
  fitting.userData.shieldVariant = shieldVariant || 'open';
  fitting.userData.foldedShieldEdges = shieldVariant ? 3 : 0;
  fitting.userData.shieldVisionPorts = shieldVariant ? 2 : 0;
  fitting.userData.installationVariant = opts.installationVariant || 'open-cradle';
  fitting.userData.machineGunFinish = 'gunmetal';
  fitting.userData.hasConnectedFeed = opts.ammo !== false;
  fitting.userData.hasEngineeredCradle = true;
  fitting.userData.firingAxis = '+Z';
  fitting.userData.barrelAxisLocal = [0, 0, 1];
  fitting.userData.barrelElevationRad = 0;
  return fitting;
}

function fittingAmericanM2(opts: FittingOptions = {}): THREE.Group {
  const context = createAmericanM2BuildContext(opts);
  addAmericanM2Mount(context);
  addAmericanM2Receiver(context);
  addAmericanM2Ammo(context);
  addAmericanM2Barrel(context);
  addAmericanM2Ring(context);
  addAmericanM2Shield(context);
  return assembleAmericanM2(context);
}

/**
 * M551A1-TTS-derived remote station family.  Variants share a buried slew
 * drum, armored cradle, M2HB receiver/feed system and forward EO face while
 * changing the protection and sensor silhouette for each host vehicle.
 */
interface AmericanRwsBuildContext {
  readonly opts: FittingOptions;
  readonly variant: string;
  readonly s: number;
  readonly standard: boolean;
  readonly armored: boolean;
  readonly hunter: boolean;
  readonly low: boolean;
  readonly parts: FittingParts;
  readonly body: string;
  readonly baseR: number;
  readonly pedestalH: number;
  readonly headY: number;
  readonly headW: number;
  readonly headH: number;
  readonly headD: number;
  readonly recY: number;
}

function createAmericanRwsBuildContext(opts: FittingOptions): AmericanRwsBuildContext {
  const variant = opts.variant || 'compact';
  const s = opts.scale || 1;
  const standard = variant === 'standard';
  const armored = variant === 'armored';
  const hunter = variant === 'hunter';
  const low = variant === 'lowProfile';
  const parts = fitParts();
  // Keep the station in one continuous fitting-paint finish.  Sampling the
  // host hull camouflage independently on every small armor box made the
  // tower read as a stack of unrelated miniature camo tiles.
  const body = opts.bodySlot || 'detail';
  const baseR = (low ? 0.25 : 0.28) * s;
  const pedestalH = (low ? 0.19 : armored ? 0.30 : 0.26) * s;
  const headY = pedestalH + (low ? 0.19 : 0.24) * s;
  const headW = (low ? 0.52 : armored ? 0.48 : 0.42) * s;
  const headH = (low ? 0.22 : armored ? 0.36 : 0.30) * s;
  const headD = (low ? 0.48 : 0.44) * s;
  const recY = headY + headH / 2 + 0.090 * s;

  return {
    opts,
    variant,
    s,
    standard,
    armored,
    hunter,
    low,
    parts,
    body,
    baseR,
    pedestalH,
    headY,
    headW,
    headH,
    headD,
    recY,
  };
}

function addAmericanRwsPedestal(context: AmericanRwsBuildContext): void {
  const { box, cylY, torus } = KIT;
  const { baseR, body, parts, pedestalH, s } = context;

  parts.add(body, cylY(baseR * 0.92, baseR, 0.105 * s, 20), 0, 0.0525 * s, 0);
  parts.add('dark', torus(baseR * 0.88, 0.025 * s, 24), 0, 0.108 * s, 0);
  parts.add(body, box(0.24 * s, pedestalH, 0.22 * s), 0,
    0.095 * s + pedestalH / 2, 0);
  parts.add('dark', box(0.34 * s, 0.055 * s, 0.31 * s), 0,
    0.095 * s + pedestalH, 0);
  // Exposed load-carrying yoke: four tied steel legs make the extra height
  // look engineered rather than like a floating box on a stretched post.
  for (const side of [-1, 1]) {
    parts.add('dark', box(0.028 * s, pedestalH * 0.76, 0.036 * s),
      side * 0.125 * s, 0.095 * s + pedestalH * 0.56, 0.055 * s,
      0, 0, -side * 0.105);
    parts.add('dark', box(0.028 * s, pedestalH * 0.64, 0.036 * s),
      side * 0.105 * s, 0.095 * s + pedestalH * 0.52, -0.065 * s,
      0, 0, side * 0.090);
  }
}

function addAmericanRwsSensorHead(context: AmericanRwsBuildContext): void {
  const { box, cylZ } = KIT;
  const { body, headD, headH, headW, headY, parts, s } = context;
  // Armored sensor/weapon head and serviceable top cover.
  parts.add(body, box(headW, headH, headD), 0, headY, 0.04 * s);
  parts.add('detail', box(headW - 0.025 * s, 0.026 * s, headD - 0.035 * s),
    0, headY + headH / 2 + 0.013 * s, 0.04 * s);
  parts.add('glass', box(0.115 * s, 0.095 * s, 0.020 * s),
    -0.105 * s, headY + 0.035 * s, headD / 2 + 0.050 * s);
  parts.add('glass', box(0.070 * s, 0.060 * s, 0.020 * s),
    0.085 * s, headY - 0.045 * s, headD / 2 + 0.050 * s);
  parts.add('dark', box(0.055 * s, 0.050 * s, 0.022 * s),
    0.088 * s, headY + 0.065 * s, headD / 2 + 0.052 * s);
  // Paired protected work/identification lights share the forward EO face.
  for (const x of [0.155, 0.225]) {
    parts.add('dark', cylZ(0.031 * s, 0.040 * s, 12),
      x * s, headY - 0.075 * s, headD / 2 + 0.052 * s);
    parts.add('glass', cylZ(0.024 * s, 0.006 * s, 12),
      x * s, headY - 0.075 * s, headD / 2 + 0.075 * s);
  }
}

function addAmericanRwsWeaponSystem(context: AmericanRwsBuildContext): void {
  const { box, cylZ } = KIT;
  const { body, headH, headY, parts, recY, s } = context;
  // M2 receiver is nested into the head roof; side coffin and feed are one
  // connected protected assembly rather than a floating generic gun.
  parts.add('dark', box(0.235 * s, 0.145 * s, 0.46 * s), 0, recY, 0.16 * s);
  parts.add('dark', box(0.215 * s, 0.018 * s, 0.41 * s),
    0, recY + 0.080 * s, 0.16 * s);
  parts.add(body, box(0.25 * s, 0.28 * s, 0.34 * s),
    -0.29 * s, headY + 0.02 * s, -0.01 * s);
  parts.add('dark', box(0.10 * s, 0.10 * s, 0.18 * s),
    -0.17 * s, recY - 0.02 * s, 0.24 * s, 0, -0.22, 0);
  // Visible disintegrating-link run from the armored ammunition coffin into
  // the receiver. Alternating gunmetal and shadow-steel links keep the belt
  // legible without sampling the host camouflage onto the ammunition.
  for (let index = 0; index < 8; index++) {
    const t = index / 7;
    const x = (-0.205 + t * 0.205) * s;
    const y = recY + (-0.025 + t * 0.030) * s;
    const z = (0.175 + t * 0.045) * s;
    parts.add('dark', box(0.030 * s, 0.040 * s, 0.028 * s), x, y, z,
      0, 0, -0.08 + t * 0.13);
    parts.add('shadow', box(0.011 * s, 0.044 * s, 0.031 * s),
      x + 0.008 * s, y, z);
  }
  // Receiver guard and service tower carry the added lights, wiring, and
  // ammunition hardware.  The guard is dark steel; the tower stays in the
  // same continuous fitting-paint finish as the armored head.
  for (const side of [-1, 1]) {
    parts.add('dark', box(0.026 * s, 0.245 * s, 0.034 * s),
      side * 0.165 * s, recY - 0.015 * s, 0.105 * s,
      0, 0, side * 0.115);
  }
  parts.add('dark', box(0.355 * s, 0.028 * s, 0.034 * s),
    0, recY + 0.105 * s, 0.105 * s);
  const serviceY = recY + 0.105 * s;
  parts.add(body, box(0.175 * s, 0.205 * s, 0.165 * s),
    0.205 * s, serviceY, -0.065 * s);
  parts.add('dark', box(0.195 * s, 0.022 * s, 0.185 * s),
    0.205 * s, serviceY + 0.113 * s, -0.065 * s);
  parts.add('glass', box(0.095 * s, 0.070 * s, 0.018 * s),
    0.205 * s, serviceY + 0.025 * s, 0.027 * s);
  parts.add('dark', cylZ(0.030 * s, 0.72 * s, 14),
    0, recY, 0.74 * s);
  parts.add('dark', cylZ(0.050 * s, 0.105 * s, 14),
    0, recY, 1.1525 * s);
  parts.add('dark', cylZ(0.017 * s, 0.018 * s, 10),
    0, recY, 1.214 * s);
}

function addAmericanRwsVariantArmor(context: AmericanRwsBuildContext): void {
  const { box, cylY } = KIT;
  const {
    armored, body, headD, headH, headW, headY, hunter, low, parts, recY, s, standard,
  } = context;
  if (standard) {
    // Baseline M1A2 station: open service cheeks and a narrow sensor brow.
    // It keeps the TTS-derived gun/head anatomy while remaining visibly
    // lighter than the TUSK compact and SEP armored installations.
    parts.add(body, box(headW + 0.09 * s, 0.025 * s, headD + 0.05 * s),
      0, headY + headH / 2 + 0.060 * s, 0.04 * s);
    for (const side of [-1, 1]) {
      parts.add('dark', box(0.025 * s, headH * 0.68, headD + 0.03 * s),
        side * (headW / 2 + 0.030 * s), headY - 0.02 * s, 0.04 * s,
        0, 0, side * 0.055);
    }
  } else if (armored) {
    parts.add(body, box(headW + 0.16 * s, 0.030 * s, headD + 0.10 * s),
      0, recY + 0.105 * s, 0.08 * s);
    for (const side of [-1, 1]) {
      parts.add(body, box(0.035 * s, headH + 0.27 * s, headD + 0.08 * s),
        side * (headW / 2 + 0.06 * s), headY + 0.08 * s, 0.04 * s,
        0, 0, side * 0.06);
    }
  } else if (hunter) {
    parts.add(body, box(0.25 * s, 0.28 * s, 0.25 * s),
      0.31 * s, headY + 0.06 * s, 0.00);
    parts.add('glass', box(0.15 * s, 0.13 * s, 0.022 * s),
      0.31 * s, headY + 0.07 * s, 0.137 * s);
    parts.add('detail', cylY(0.045 * s, 0.060 * s, 0.10 * s, 14),
      0.31 * s, headY + 0.25 * s, 0.00);
  } else if (low) {
    for (const side of [-1, 1]) {
      parts.add(body, box(0.030 * s, headH + 0.08 * s, headD + 0.04 * s),
        side * (headW / 2 + 0.015 * s), headY, 0.04 * s);
      }
  }
}

function assembleAmericanRws(context: AmericanRwsBuildContext): THREE.Group {
  const { opts, parts, variant } = context;
  const fitting = fitAssemble('pintleMG', parts, opts);
  fitting.name = `fitting_americanRws_${variant}`;
  fitting.userData.americanRwsFamily = 'm551a1-tts-derived-v1';
  fitting.userData.browningDerivedStandard = 'cot-browning-family-v2';
  fitting.userData.stationVariant = variant;
  fitting.userData.remoteControlled = true;
  fitting.userData.weaponName = 'Browning M2HB';
  fitting.userData.caliberMm = 12.7;
  fitting.userData.finishStandard = 'continuous-fitting-paint';
  fitting.userData.hasVisibleFeedBelt = true;
  fitting.userData.hasWorkLights = true;
  fitting.userData.hasSteelReceiverGuard = true;
  fitting.userData.machineGunFinish = 'gunmetal';
  fitting.userData.hasConnectedFeed = true;
  fitting.userData.hasEngineeredCradle = true;
  fitting.userData.firingAxis = '+Z';
  fitting.userData.barrelAxisLocal = [0, 0, 1];
  fitting.userData.barrelElevationRad = 0;
  const weaponMesh = fitting.children.find((child) => child.userData.fittingSlot === 'dark');
  if (weaponMesh) {
    weaponMesh.name = 'americanRwsMachineGun';
    weaponMesh.userData.appearanceRole = 'machineGun';
  }
  return fitting;
}

function fittingAmericanRws(opts: FittingOptions = {}): THREE.Group {
  const context = createAmericanRwsBuildContext(opts);
  addAmericanRwsPedestal(context);
  addAmericanRwsSensorHead(context);
  addAmericanRwsWeaponSystem(context);
  addAmericanRwsVariantArmor(context);
  return assembleAmericanRws(context);
}

/**
 * AbramsX-inspired open-yoke remote machine-gun family.
 *
 * This is deliberately a different silhouette from the enclosed CROWS/FLW
 * stations above: the slew drum, two load-bearing fork arms, cross-shaft,
 * receiver rails, ammunition coffin and EO head remain visibly separate.
 * Host-specific variants change protection and sensor layout while retaining
 * the same mechanical load path. Origin is the mounting foot; +Z is fire.
 */
interface OpenYokeBuildContext {
  readonly opts: FittingOptions;
  readonly variant: string;
  readonly sizeStandard: string;
  readonly s: number;
  readonly ammoSide: number;
  readonly sensorSide: number;
  readonly body: string;
  readonly hasWeapon: boolean;
  readonly parts: FittingParts;
  readonly yokeCenterY: number;
  readonly receiverY: number;
  readonly receiverZ: number;
  readonly roofSensor: boolean;
  readonly sensorX: number;
  readonly classicPanther: boolean;
  readonly panther: boolean;
  readonly twinOptics: boolean;
  readonly sensorY: number;
}

function createOpenYokeContext(opts: FittingOptions): OpenYokeBuildContext {
  const variant = opts.variant || 'expeditionary';
  const sizeStandard = opts.sizeStandard || 'custom';
  // The M1A3 tower is the fleet reference: its weapon and open-yoke hardware
  // are authored at 1.28x. Hosts may change armor, optics and ammunition
  // layout, but a full-size station must not quietly become a miniature.
  const s = sizeStandard === 'm1a3-full-tower' ? 1.28 : (opts.scale || 1);
  const ammoSide = Math.sign(opts.ammoSide || -1);
  const sensorSide = Math.sign(opts.sensorSide || -ammoSide);
  const body = opts.bodySlot || 'detail';
  const hasWeapon = opts.weapon !== false;
  const parts = fitParts();
  const yokeCenterY = 0.385 * s;
  const receiverY = yokeCenterY + 0.018 * s;
  const receiverZ = 0.185 * s;
  const roofSensor = opts.sensorMount === 'roof';
  const sensorX = roofSensor ? 0 : sensorSide * 0.30 * s;
  const classicPanther = variant === 'kf51-panther';
  const panther = classicPanther || variant === 'kf51b-panther';
  const twinOptics = variant === 'korean-twin' || panther;
  const sensorY = roofSensor
    ? yokeCenterY + 0.31 * s
    : yokeCenterY + (variant === 'a6m-arctic' || panther ? 0.015 : 0.005) * s;
  return {
    opts,variant,sizeStandard,s,ammoSide,sensorSide,body,hasWeapon,parts,
    yokeCenterY,receiverY,receiverZ,roofSensor,sensorX,classicPanther,panther,
    twinOptics,sensorY,
  };
}

function aimOpenYokeGeometry(
  _context: OpenYokeBuildContext,
  geometry: THREE.BufferGeometry,
  dz: number,
  dy = 0,
): THREE.BufferGeometry {
  return placeMachineGunBarrelGeometry(geometry, dz, dy);
}

function addOpenYokeBase(context: OpenYokeBuildContext): void {
  const {box,cylX,cylY,torus}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  // Buried slew bearing and gearbox: every upper member resolves to this
  // broad roof foot, so the station never reads as a floating gun prop.
  parts.add(body,cylY(0.245 * s,0.270 * s,0.075 * s,20),0,0.0375 * s,0);
  parts.add('dark',torus(0.225 * s,0.018 * s,22),0,0.081 * s,0);
  parts.add(body,box(0.34 * s,0.105 * s,0.30 * s),0,0.1375 * s,-0.015 * s);
  parts.add('dark',box(0.28 * s,0.025 * s,0.24 * s),0,0.2025 * s,-0.015 * s);

  // Open fork, exposed cross-shaft and recoil rails are the AbramsX cues.
  for (const side of [-1,1]) {
    parts.add(body,box(0.065 * s,0.30 * s,0.105 * s),
      side * 0.165 * s,0.34 * s,-0.015 * s,0,0,side * 0.075);
    parts.add('dark',box(0.027 * s,0.25 * s,0.040 * s),
      side * 0.213 * s,0.345 * s,0.010 * s,0,0,side * 0.14);
    parts.add('dark',box(0.032 * s,0.035 * s,0.42 * s),
      side * 0.090 * s,yokeCenterY - 0.045 * s,0.145 * s);
  }
  parts.add('dark',cylX(0.050 * s,0.41 * s,14),0,yokeCenterY,0.025 * s);
}

function addOpenYokeWeapon(context: OpenYokeBuildContext): void {
  if (!context.hasWeapon) return;
  const {box,cylZ,torus}=KIT;
  const {ammoSide,body,parts,receiverY,receiverZ,s,yokeCenterY}=context;
  // M2/K6-class receiver and long, true forward run.
  parts.add('dark',box(0.170 * s,0.135 * s,0.43 * s),0,receiverY,receiverZ);
  parts.add('dark',box(0.145 * s,0.020 * s,0.37 * s),
    0,receiverY + 0.078 * s,receiverZ - 0.005 * s);
  parts.add('dark',box(0.075 * s,0.045 * s,0.070 * s),
    0,receiverY - 0.018 * s,receiverZ - 0.250 * s);
  const trunnionZ=receiverZ + 0.215 * s;
  parts.add('dark',aimOpenYokeGeometry(context,cylZ(0.033 * s,0.18 * s,14),0.09 * s),
    0,receiverY,trunnionZ);
  for (let index=0;index<4;index++) {
    parts.add('dark',aimOpenYokeGeometry(context,torus(0.034 * s,0.0045 * s,12),
      (0.025 + index * 0.042) * s),0,receiverY,trunnionZ);
  }
  parts.add('dark',aimOpenYokeGeometry(context,cylZ(0.0155 * s,0.62 * s,10),0.49 * s),
    0,receiverY,trunnionZ);
  parts.add('dark',aimOpenYokeGeometry(context,cylZ(0.028 * s,0.085 * s,12),0.8425 * s),
    0,receiverY,trunnionZ);
  parts.add('dark',aimOpenYokeGeometry(context,cylZ(0.010 * s,0.015 * s,10),0.895 * s),
    0,receiverY,trunnionZ);

  // Asymmetric ammunition coffin and feed bridge. Individual alternating
  // links remain legible in the gallery without creating per-link meshes.
  const ammoX=ammoSide * 0.305 * s;
  parts.add(body,box(0.245 * s,0.255 * s,0.31 * s),
    ammoX,yokeCenterY - 0.055 * s,0.015 * s);
  parts.add('detail',box(0.265 * s,0.023 * s,0.33 * s),
    ammoX,yokeCenterY + 0.084 * s,0.015 * s);
  parts.add('dark',box(0.022 * s,0.22 * s,0.27 * s),
    ammoX + ammoSide * 0.133 * s,yokeCenterY - 0.055 * s,0.015 * s);
  for (let index=0;index<8;index++) {
    const t=index / 7;
    const x=ammoX * (1 - t) + ammoSide * 0.075 * s * t;
    const y=yokeCenterY + (0.055 + 0.018 * t) * s;
    const z=(0.13 + 0.085 * t) * s;
    parts.add(index % 2 ? 'shadow' : 'dark',box(0.032 * s,0.041 * s,0.026 * s),
      x,y,z,0,0,-ammoSide * (0.10 + t * 0.12));
  }
}

function addOpenYokeSensorHead(context: OpenYokeBuildContext): void {
  if (context.opts.sensorHead === false) return;
  const {box,cylZ}=KIT;
  const {body,parts,roofSensor,s,sensorSide,sensorX,sensorY,twinOptics}=context;
  // Independent EO/thermal head on the opposite cheek. Hosts with a proper
  // roof-seated panoramic tower can omit this compact side head so the weapon
  // has an unobstructed firing lane and the two systems remain visually
  // distinct.
  if (roofSensor) {
    parts.add(body,box(0.34 * s,0.040 * s,0.29 * s),
      0,sensorY - 0.125 * s,0.025 * s);
  }
  parts.add(body,box(0.215 * s,(twinOptics ? 0.20 : 0.24) * s,0.215 * s),
    sensorX,sensorY,0.055 * s);
  parts.add('dark',box(0.190 * s,0.024 * s,0.19 * s),
    sensorX,sensorY + (twinOptics ? 0.112 : 0.132) * s,0.055 * s);
  const opticXs=twinOptics ? [-0.045,0.045] : [0];
  for (const dx of opticXs) {
    parts.add('glass',box((twinOptics ? 0.065 : 0.125) * s,
      (twinOptics ? 0.075 : 0.105) * s,0.014 * s),
    sensorX + dx * s,sensorY + 0.018 * s,0.170 * s);
  }
  parts.add('glass',cylZ(0.026 * s,0.014 * s,10),
    sensorX - sensorSide * 0.055 * s,sensorY - 0.075 * s,0.171 * s);
}

function addOpenYokeSepv3Armor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  parts.add(body,box(0.70 * s,0.035 * s,0.35 * s),0,yokeCenterY + 0.175 * s,0.035 * s);
  for (const side of [-1,1]) {
    parts.add(body,box(0.035 * s,0.24 * s,0.29 * s),
      side * 0.355 * s,yokeCenterY + 0.035 * s,0.035 * s,0,0,side * 0.07);
  }
}

function addOpenYokeTuskArmor(context: OpenYokeBuildContext): void {
  const {box,cylZ}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  for (const side of [-1,1]) {
    parts.add(body,box(0.25 * s,0.25 * s,0.030 * s),
      side * 0.225 * s,yokeCenterY + 0.015 * s,0.275 * s,0,-side * 0.08,0);
  }
  for (const x of [-0.095,0.095]) {
    parts.add('dark',cylZ(0.032 * s,0.040 * s,12),
      x * s,yokeCenterY - 0.105 * s,0.265 * s);
    parts.add('glass',cylZ(0.024 * s,0.008 * s,12),
      x * s,yokeCenterY - 0.105 * s,0.289 * s);
  }
}

function addOpenYokeArcticArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,parts,s,sensorX,sensorY,yokeCenterY}=context;
  parts.add(body,box(0.29 * s,0.030 * s,0.25 * s),
    sensorX,sensorY + 0.148 * s,0.055 * s);
  parts.add('dark',box(0.030 * s,0.18 * s,0.20 * s),
    -sensorX,yokeCenterY - 0.05 * s,0.06 * s);
}

function addOpenYokeA7vArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  parts.add(body,box(0.58 * s,0.030 * s,0.28 * s),
    0,yokeCenterY + 0.135 * s,0.035 * s);
  parts.add('dark',box(0.44 * s,0.075 * s,0.028 * s),
    0,yokeCenterY - 0.105 * s,0.23 * s);
}

function addOpenYokePumaArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  // Puma S1 signature: a narrow arrow brow, tall faceted yoke cheeks and a
  // central recoil bridge echo the RCT30 turret without widening the roof
  // footprint. This station is deliberately independent of the panoramic
  // optics tower fitted on the opposite side of the roof.
  parts.add(body,box(0.46 * s,0.034 * s,0.27 * s),
    0,yokeCenterY + 0.145 * s,0.025 * s);
  parts.add('detail',box(0.28 * s,0.026 * s,0.035 * s),
    0,yokeCenterY + 0.172 * s,0.175 * s);
  for (const side of [-1,1]) {
    parts.add(body,box(0.042 * s,0.23 * s,0.25 * s),
      side * 0.265 * s,yokeCenterY + 0.018 * s,0.020 * s,
      0,-side * 0.10,side * 0.14);
  }
}

function addOpenYokeLightTigerArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,parts,s,yokeCenterY}=context;
  // Light Tiger signature: split low shoulders and clipped outer guards
  // create a lighter Japanese demonstrator silhouette while preserving the
  // same real bearing/yoke/receiver load path.
  for (const side of [-1,1]) {
    parts.add(body,box(0.20 * s,0.034 * s,0.29 * s),
      side * 0.12 * s,yokeCenterY + 0.140 * s,0.020 * s,
      0,0,-side * 0.08);
    parts.add('detail',box(0.032 * s,0.18 * s,0.22 * s),
      side * 0.255 * s,yokeCenterY + 0.005 * s,0.035 * s,
      0,-side * 0.08,side * 0.12);
  }
  parts.add('dark',box(0.30 * s,0.045 * s,0.032 * s),
    0,yokeCenterY - 0.118 * s,0.235 * s);
}

function addOpenYokeKoreanArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {parts,s,yokeCenterY}=context;
  for (const side of [-1,1]) {
    parts.add('detail',box(0.028 * s,0.16 * s,0.27 * s),
      side * 0.255 * s,yokeCenterY - 0.04 * s,0.045 * s,
      0,0,side * 0.12);
  }
}

function addOpenYokePantherArmor(context: OpenYokeBuildContext): void {
  const {box}=KIT;
  const {body,classicPanther,parts,s,sensorX,sensorY,yokeCenterY}=context;
  // Panther signature: a low arrow brow and two outward-canted armor
  // cheeks echo the main turret's faceting without hiding the open
  // mechanism. The base KF51 carries the denser demonstrator package:
  // three independently readable work lights, an elevated dual-channel
  // optic hood and two side warning apertures.
  parts.add(body,box(0.62 * s,0.035 * s,0.30 * s),
    0,yokeCenterY + 0.175 * s,0.035 * s,0,0,0);
  parts.add('detail',box(0.44 * s,0.022 * s,0.025 * s),
    0,yokeCenterY + 0.198 * s,0.188 * s);
  for (const side of [-1,1]) {
    parts.add(body,box(0.040 * s,0.27 * s,0.30 * s),
      side * 0.325 * s,yokeCenterY + 0.035 * s,0.030 * s,
      0,-side * 0.10,side * 0.16);
    parts.add('detail',box(0.026 * s,0.15 * s,0.22 * s),
      side * 0.365 * s,yokeCenterY - 0.015 * s,0.045 * s,
      0,-side * 0.10,side * 0.16);
  }
  if (!classicPanther) return;
  parts.add('dark',box(0.50 * s,0.105 * s,0.040 * s),
    0,yokeCenterY - 0.135 * s,0.274 * s);
  for (const x of [-0.155,0,0.155]) {
    parts.add('glass',box(0.105 * s,0.058 * s,0.014 * s),
      x * s,yokeCenterY - 0.135 * s,0.300 * s);
  }
  parts.add(body,box(0.31 * s,0.075 * s,0.245 * s),
    sensorX,sensorY + 0.158 * s,0.048 * s);
  for (const side of [-1,1]) {
    parts.add('dark',box(0.075 * s,0.085 * s,0.032 * s),
      side * 0.365 * s,yokeCenterY + 0.025 * s,0.218 * s,
      0,-side * 0.09,0);
    parts.add('glass',box(0.047 * s,0.050 * s,0.014 * s),
      side * 0.365 * s,yokeCenterY + 0.025 * s,0.239 * s,
      0,-side * 0.09,0);
  }
}

function addOpenYokeVariantArmor(context: OpenYokeBuildContext): void {
  if (context.variant === 'sepv3-armored') addOpenYokeSepv3Armor(context);
  else if (context.variant === 'tusk-urban') addOpenYokeTuskArmor(context);
  else if (context.variant === 'a6m-arctic') addOpenYokeArcticArmor(context);
  else if (context.variant === 'a7v-low') addOpenYokeA7vArmor(context);
  else if (context.variant === 'puma-s1-compact') addOpenYokePumaArmor(context);
  else if (context.variant === 'light-tiger-compact') addOpenYokeLightTigerArmor(context);
  else if (context.variant === 'korean-twin') addOpenYokeKoreanArmor(context);
  else if (context.panther) addOpenYokePantherArmor(context);
}

function fittingOpenYokeRws(opts: FittingOptions = {}): THREE.Group {
  const { box, cylX, cylY, cylZ, torus } = KIT;
  const context=createOpenYokeContext(opts);
  const {
    ammoSide,body,classicPanther,hasWeapon,panther,parts,receiverY,receiverZ,
    roofSensor,s,sensorSide,sensorX,sensorY,sizeStandard,twinOptics,variant,
    yokeCenterY,
  }=context;
  addOpenYokeBase(context);
  addOpenYokeWeapon(context);
  addOpenYokeSensorHead(context);
  addOpenYokeVariantArmor(context);

  // The reference M1A3 station stands on a real powered riser rather than a
  // bearing plate alone. Lift the complete working assembly as one unit and
  // close the load path back to the roof with a broad, contiguous pedestal.
  // This adds height without inflating the weapon, sensors or side armor.
  const towerRise = opts.towerRise
    ?? (sizeStandard === 'm1a3-full-tower' ? 0.18 : 0);
  if (towerRise > 0) {
    for (const geometries of Object.values(parts.bySlot)) {
      for (const geometry of geometries) geometry.translate(0, towerRise, 0);
    }
    parts.add(body, cylY(0.255 * s, 0.285 * s, towerRise, 20),
      0, towerRise / 2, 0);
    parts.add('dark', torus(0.245 * s, 0.018 * s, 22),
      0, towerRise - 0.010, 0);
  }

  const fitting = fitAssemble('openYokeRws', parts, opts);
  fitting.name = `fitting_openYokeRws_${variant}`;
  fitting.userData.designFamily = 'abramsx-open-yoke-v1';
  fitting.userData.browningDerivedStandard = 'cot-browning-family-v2';
  fitting.userData.stationVariant = variant;
  fitting.userData.remoteControlled = true;
  fitting.userData.hasWeapon = hasWeapon;
  fitting.userData.weaponName = hasWeapon ? (opts.weaponName || '12.7 mm remote machine gun') : null;
  fitting.userData.caliberMm = hasWeapon ? (opts.caliberMm || 12.7) : null;
  fitting.userData.ammoSide = ammoSide;
  fitting.userData.sensorSide = sensorSide;
  fitting.userData.hasIntegratedSensorHead = opts.sensorHead !== false;
  fitting.userData.sensorMount = roofSensor ? 'roof' : 'side';
  fitting.userData.hasVisibleFeedBelt = hasWeapon;
  fitting.userData.hasConnectedFeed = hasWeapon;
  fitting.userData.hasEngineeredCradle = true;
  fitting.userData.hasWorkLights = panther;
  fitting.userData.lightCount = classicPanther ? 5 : (panther ? 2 : 0);
  fitting.userData.machineGunFinish = 'gunmetal';
  fitting.userData.firingAxis = hasWeapon ? '+Z' : null;
  fitting.userData.barrelAxisLocal = hasWeapon ? [0, 0, 1] : null;
  fitting.userData.barrelElevationRad = hasWeapon ? 0 : null;
  fitting.userData.muzzleLocalZ = hasWeapon ? 1.295 * s : null;
  fitting.userData.barrelAxisLocalY = hasWeapon ? receiverY + towerRise : null;
  fitting.userData.sizeStandard = sizeStandard;
  fitting.userData.scale = s;
  fitting.userData.towerRise = towerRise;
  const weaponMesh = fitting.children.find((child) => child.userData.fittingSlot === 'dark');
  if (hasWeapon && weaponMesh) {
    weaponMesh.name = 'openYokeRwsMachineGun';
    weaponMesh.userData.appearanceRole = 'machineGun';
  }
  return fitting;
}

/**
 * Open-lattice stowage rack with soft fill (§B3 dressing). The rack is a
 * complete welded structure (floor grid, outer fence, end returns, diagonal
 * braces and hull/turret mounting feet), never a gray/black slab standing in
 * for a basket. Tone-varied duffels/crates/tarp rolls sit inside the lattice.
 * Origin: center of the rack FLOOR plane; +z is the open/outboard face.
 * @param {object} opts
 *   mats; w=1.2 rack width; d=0.45 depth; h=0.30 rail height;
 *   posts   post count                     (default from width)
 *   rails   1..3 horizontal rails          (default 2)
 *   mesh    open wire-grid fence            (default true)
 *   fill    0..1 soft-fill density         (default 0.75; 0 = bare rack)
 *   seed, shadows, rotation
 * Envelope: x ±w/2, y 0..~1.35h with fill (0..h bare), z ±d/2 — see
 * group.userData.aabb.
 */
interface StowageRackFrameReceipt {
  readonly floorCross: number;
  readonly floorStrings: number;
  readonly nPosts: number;
}

function addStowageRackFrame(
  parts: FittingParts,
  opts: FittingOptions,
  w: number,
  d: number,
  h: number,
  rails: number,
  rod: number,
): StowageRackFrameReceipt {
  const {box}=KIT;
  const rail=rod * 1.18;
  const zMount=-d / 2 + rod / 2;
  const zFace=d / 2 - rod / 2;
  const addSideBrace=(x: number,y0: number,z0: number,y1: number,z1: number): void => {
    const dy=y1 - y0;
    const dz=z1 - z0;
    parts.add('dark',box(rod,rod,Math.hypot(dy,dz) + rod),x,
      (y0 + y1) / 2,(z0 + z1) / 2,Math.atan2(-dy,dz),0,0);
  };

  // Floor lattice: cross-ribs and longitudinal stringers leave actual open
  // air between members. This is the silhouette the old full-size floor/back
  // boxes erased at rear and elevated three-quarter views.
  const floorY=rod / 2;
  const floorCross=Math.max(3,Math.min(8,Math.round(d / 0.12) + 1));
  const floorStrings=Math.max(3,Math.min(9,Math.round(w / 0.22) + 1));
  parts.add('dark',KIT.openRackGrid(w,d,rod,floorCross,floorStrings),0,floorY,0);

  // Fence: posts + rails on the outer face, short end rails closing the bay.
  const nPosts=Math.min(10,Math.max(2,opts.posts || Math.round(w / 0.22)));
  for (let i=0;i<nPosts;i++) {
    const x=-w / 2 + 0.02 + i * ((w - 0.04) / (nPosts - 1));
    parts.add('dark',box(rod,h,rod),x,h / 2,zFace);
  }
  const railYs=rails === 1
    ? [h * 0.95]
    : rails === 2 ? [h * 0.95,h * 0.45] : [h * 0.95,h * 0.70,h * 0.45];
  for (const ry of railYs) {
    parts.add('dark',box(w,rail,rail),0,ry,zFace);
    for (const sx of [-1,1]) parts.add('dark',box(rail,rail,d),
      sx * (w / 2 - rail / 2),ry,0);
  }
  for (const sx of [-1,1]) {
    const x=sx * (w / 2 - rod / 2);
    parts.add('dark',box(rod,h,rod),x,h / 2,zMount);
    // Triangulated end returns and two real mounting feet make the basket
    // visibly load-bearing instead of a floating rectangle.
    addSideBrace(x,rod,zFace,h * 0.94,zMount);
    addSideBrace(x,rod,zMount,h * 0.94,zFace);
    parts.add('hull',box(0.12,0.055,rod * 1.4),sx * (w * 0.31),
      0.035,zMount - rod * 0.25);
  }
  if (opts.mesh !== false) {
    // Open wire grid at the outer face. The former single box here was the
    // fleet-wide "gray square" proxy called out in visual review.
    const gridCols=Math.max(3,Math.min(12,Math.round(w / 0.14)));
    const gridRows=Math.max(2,Math.min(6,Math.round(h / 0.11)));
    for (let i=1;i<gridCols;i++) {
      const x=-w / 2 + i * (w / gridCols);
      parts.add('dark',box(rod * 0.55,h * 0.82,rod * 0.55),x,h * 0.52,zFace - rod * 0.62);
    }
    for (let i=1;i<gridRows;i++) {
      const y=h * 0.12 + i * (h * 0.76 / gridRows);
      parts.add('dark',box(w * 0.97,rod * 0.55,rod * 0.55),0,y,zFace - rod * 0.62);
    }
  }
  return {floorCross,floorStrings,nPosts};
}

function addStowageRackBundle(
  parts: FittingParts,
  rng: () => number,
  w: number,
  d: number,
  index: number,
  count: number,
): boolean {
  const {box,cylX,sph,xform}=KIT;
  const x=(count === 1 ? 0 : -w / 2 + 0.18 + index * ((w - 0.36) / (count - 1)))
    + (rng() - 0.5) * 0.03;
  const slots=['canvasCloth','wood','canvasCloth','detail'];
  const slot=slots[index % slots.length];
  const yaw=(rng() - 0.5) * 0.16;
  if (slot === 'wood') {
    const bw=0.24 + rng() * 0.06;
    const bh=0.16 + rng() * 0.05;
    parts.add('wood',box(bw,bh,d * 0.62),x,bh / 2 + 0.02,d * 0.02,0,yaw,0);
    parts.add('dark',box(bw * 1.03,bh * 0.16,0.02),x,bh * 0.5 + 0.02,d * 0.33,0,yaw,0);
    return false;
  }
  if (index % 3 === 0) {
    const r=0.10 + rng() * 0.035;
    const len=0.22 + rng() * 0.10;
    parts.add(slot,cylX(r,len,10),x,r * 0.92 + 0.02,d * 0.04,0,yaw,0);
    parts.add('dark',cylX(r * 1.05,0.022,10),x - len * 0.22,r * 0.92 + 0.02,d * 0.04,0,yaw,0);
    parts.add('dark',cylX(r * 1.05,0.022,10),x + len * 0.22,r * 0.92 + 0.02,d * 0.04,0,yaw,0);
    return true;
  }
  const bw=0.22 + rng() * 0.08;
  const bh=0.16 + rng() * 0.06;
  const bd=d * (0.46 + rng() * 0.16);
  // A low-poly ellipsoid produces an irregular, compressible duffel
  // silhouette. A raised flap, pockets and real straps explain how the
  // load stays in the lattice instead of reading as another gray box.
  parts.add(slot,xform(sph(0.5,10),0,0,0,0,yaw,0,[bw,bh,bd]),x,bh * 0.48 + 0.02,d * 0.04);
  parts.add(slot,box(bw * 0.76,0.026,bd * 0.54),x,bh * 0.88 + 0.02,d * 0.02,0,yaw,0);
  parts.add(slot,box(bw * 0.56,bh * 0.34,0.024),x,bh * 0.46 + 0.02,d * 0.18,0,yaw,0);
  for (const sx of [-0.24,0.24]) {
    parts.add('dark',box(0.018,bh * 1.06,bd * 1.02),
      x + sx * bw,bh * 0.49 + 0.02,d * 0.04,0,yaw,0);
  }
  return true;
}

function addStowageRackFill(
  parts: FittingParts,
  opts: FittingOptions,
  w: number,
  d: number,
  h: number,
  rng: () => number,
): number {
  const {cylX}=KIT;
  const fill=opts.fill ?? 0.75;
  if (fill <= 0) return 0;
  const count=Math.max(1,Math.round(fill * w / 0.26));
  let softBundleCount=0;
  for (let index=0;index<count;index++) {
    if (addStowageRackBundle(parts,rng,w,d,index,count)) softBundleCount++;
  }
  // One long tarp roll across wide racks, over the bundles.
  if (w > 0.8 && fill >= 0.5) {
    const r=0.085;
    parts.add('canvasCloth',cylX(r,w * 0.55,10),0,h * 0.9 + r * 0.4,d * 0.02);
    parts.add('dark',cylX(r * 1.06,0.024,10),-w * 0.16,h * 0.9 + r * 0.4,d * 0.02);
    parts.add('dark',cylX(r * 1.06,0.024,10),w * 0.16,h * 0.9 + r * 0.4,d * 0.02);
  }
  return softBundleCount;
}

function fittingStowageRack(opts: FittingOptions = {}): THREE.Group {
  const w = opts.w || 1.2, d = opts.d || 0.45, h = opts.h || 0.30;
  const rails = Math.min(3, Math.max(1, opts.rails || 2));
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();
  const rod = Math.max(0.018, Math.min(0.032, Math.min(w, d, h) * 0.085));
  const {floorCross,floorStrings,nPosts}=addStowageRackFrame(parts,opts,w,d,h,rails,rod);
  const softBundleCount=addStowageRackFill(parts,opts,w,d,h,rng);
  const fitting = fitAssemble('stowageRack', parts, opts);
  fitting.userData.designFamily = 'cot-open-lattice-bustle-v2';
  fitting.userData.openLattice = true;
  fitting.userData.solidProxyPanels = 0;
  fitting.userData.floorCrossMembers = floorCross;
  fitting.userData.floorStringers = floorStrings;
  fitting.userData.outerFencePosts = nPosts;
  fitting.userData.mountingFeet = 2;
  fitting.userData.softBundleCount = softBundleCount;
  fitting.userData.fabricProfiles = ['rolled-tarp', 'duffel', 'ruck-with-flap'];
  fitting.userData.rackEnvelope = { widthM: w, depthM: d, heightM: h };
  return fitting;
}

/**
 * Draped tow cable with end eyes + clamp blocks.
 * Origin: caller's local frame — `pts` are LOCAL [x,y,z] knots (>= 2), the
 * tube runs through them (CatmullRom, centripetal).
 * @param {object} opts  mats; pts (required); r=0.020; eyes=true; seg=20;
 *   tone 'dark'|'pale' (default 'dark'); seed, shadows, rotation
 */
function fittingTowCable(opts: FittingOptions = {}): THREE.Group {
  const pts = opts.pts;
  if (!pts || pts.length < 2) throw new Error('KIT.fittings.towCable: opts.pts (>= 2 local [x,y,z]) required');
  const { box, xform } = KIT;
  const r = opts.r || 0.020;
  const slot = opts.tone === 'pale' ? 'detail' : 'dark';
  const parts = fitParts();
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  parts.add(slot, new THREE.TubeGeometry(curve, opts.seg || 20, r, 6, false));
  if (opts.eyes !== false) {
    for (const t of [0, 1]) {
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).multiplyScalar(t === 0 ? -1 : 1);
      const yaw = Math.atan2(tan.x, tan.z);
      const eye = xform(new THREE.TorusGeometry(r * 2.6, r * 0.75, 6, 12), 0, 0, r * 3.4);
      parts.add(slot, xform(eye, 0, 0, 0, 0, yaw, 0), p.x, p.y, p.z);
      parts.add(slot, xform(box(r * 2.6, r * 2.4, r * 3.2), 0, 0, r * 1.2, 0, yaw, 0), p.x, p.y, p.z);
    }
  }
  return fitAssemble('towCable', parts, opts);
}

/**
 * Jerry can row with retaining strap.
 * Origin: bottom center of the row; cans face +z.
 * @param {object} opts  mats; count=2; gap=0.05; slot='detail'
 *   ('detail' pale metal | 'canvasCloth' olive | 'hull' scheme-painted);
 *   strap=true; seed, shadows, rotation
 * Envelope: x ±(count*(0.16+gap))/2, y 0..0.50, z ±0.17.
 */
function fittingJerryCans(opts: FittingOptions = {}): THREE.Group {
  const { box, cylY, cylZ } = KIT;
  const requestedCount = Math.max(2, Math.floor(opts.count ?? 2));
  const count = requestedCount % 2 === 0 ? requestedCount : requestedCount + 1;
  const gap = opts.gap ?? 0.05;
  // owner 2026-08-06: cans read too bright fleet-wide in 'detail' pale
  // metal — default to the olive canvas tone; callers may still opt in.
  const slot = opts.slot || 'canvasCloth';
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();
  const pitchX = 0.16 + gap;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitchX;
    const yaw = (rng() - 0.5) * 0.10;
    parts.add(slot, box(0.16, 0.44, 0.32), x, 0.22, 0, 0, yaw, 0);
    // Stamped X ribs on both broad faces; these are shallow equipment
    // details, never armor plates or floating decals.
    for (const face of [-1, 1]) {
      for (const rz of [-0.48, 0.48]) {
        parts.add(slot, box(0.014, 0.29, 0.020), x, 0.22, face * 0.166, 0, yaw, rz);
      }
    }
    // Triple bridge handle and offset threaded spout.
    for (const hx of [-0.045, 0, 0.045]) {
      parts.add(slot, box(0.020, 0.055, 0.12), x + hx, 0.465, 0, 0, yaw, 0);
    }
    parts.add(slot, box(0.11, 0.018, 0.020), x, 0.495, -0.050, 0, yaw, 0);
    parts.add(slot, cylY(0.030, 0.033, 0.050, 10), x + 0.045, 0.463, 0.105, 0, yaw, 0);
    parts.add('dark', cylY(0.027, 0.027, 0.018, 10), x + 0.045, 0.496, 0.105, 0, yaw, 0);
    // Foot seam and lower corner protectors seat every can in the rack.
    parts.add('dark', box(0.15, 0.018, 0.31), x, 0.018, 0, 0, yaw, 0);
    for (const sx of [-1, 1]) parts.add('dark', box(0.018, 0.08, 0.034),
      x + sx * 0.071, 0.055, 0.145, 0, yaw, 0);
  }
  if (opts.strap !== false) {
    const w = count * pitchX + 0.02;
    parts.add('dark', box(w, 0.028, 0.018), 0, 0.30, 0.168);
    parts.add('dark', box(w, 0.028, 0.018), 0, 0.30, -0.168);
    parts.add('dark', box(0.026, 0.48, 0.026), -w / 2 + 0.018, 0.24, -0.16);
    parts.add('dark', box(0.026, 0.48, 0.026), w / 2 - 0.018, 0.24, -0.16);
    parts.add('detail', box(0.055, 0.045, 0.030), 0, 0.30, 0.182);
  }
  const fitting = fitAssemble('jerryCans', parts, opts);
  fitting.userData.designFamily = 'cot-jerry-can-rack-v2';
  fitting.userData.requestedCanCount = requestedCount;
  fitting.userData.canCount = count;
  fitting.userData.paired = true;
  fitting.userData.pairCount = count / 2;
  fitting.userData.stampedFaces = count * 2;
  fitting.userData.bridgeHandles = count * 3;
  fitting.userData.threadedSpouts = count;
  fitting.userData.retainingCradle = opts.strap !== false;
  return fitting;
}

/**
 * Spare track-link strip (worn track steel — never blockout black, r5 law).
 * Origin: strip center; links run along z. Use opts.rotation for glacis
 * lay-flat / turret-side hang poses.
 * @param {object} opts  mats; links=4; width=0.5; pitch=0.165; seed,
 *   shadows, rotation=[rx,ry,rz]
 */
function fittingSpareTrackLinks(opts: FittingOptions = {}): THREE.Group {
  const { box } = KIT;
  const links = Math.max(1, opts.links || 4);
  const width = opts.width || 0.5;
  const pitch = opts.pitch || 0.165;
  const runDepth = (links - 1) * pitch + 0.15;
  const parts = fitParts();
  // A real stowed link course is retained by rails/clamps, not balanced on
  // isolated pads. The rails meet the underside of every link and the four
  // broad feet recess into the host armor, providing one continuous load
  // path even when the fitting is rotated onto a glacis or turret wall.
  const railY = -0.0315;
  for (const x of [-width * 0.32, width * 0.32]) {
    parts.add('detail', box(0.030, 0.018, runDepth), x, railY, 0);
    for (const z of [-runDepth * 0.4, runDepth * 0.4]) {
      parts.add('detail', box(0.105, 0.019, 0.045), x, -0.031, z);
    }
  }
  for (let k = 0; k < links; k++) {
    const z = (k - (links - 1) / 2) * pitch;
    parts.add('spareTrack', box(width, 0.045, 0.15), 0, 0, z);
    parts.add('spareTrack', box(width * 0.88, 0.06, 0.05), 0, 0.02, z);
  }
  const fitting = fitAssemble('spareTrackLinks', parts, opts);
  fitting.userData.designFamily = 'cot-spare-track-carrier-v2';
  fitting.userData.mountAxisLocal = [0, 1, 0];
  fitting.userData.mountBaseOffsetM = 0.041;
  fitting.userData.hasContinuousCarrier = true;
  fitting.userData.carrierRailCount = 2;
  fitting.userData.carrierFootCount = 4;
  return fitting;
}

/**
 * Headlight pod cluster with brush guards.
 * Origin: center between pods at drum axis height; lenses face +z.
 * @param {object} opts  mats; pods=2; spacing=0.16; r=0.055; guard=true;
 *   lens='glass' ('glass' | 'dark' — dark-lens law for pale decks);
 *   rake=-0.30 (drum pitch, matches glacis rake); seed, shadows, rotation
 */
function fittingLightCluster(opts: FittingOptions = {}): THREE.Group {
  const { box, cylZ, xform } = KIT;
  const pods = Math.max(1, opts.pods || 2);
  const spacing = opts.spacing ?? 0.16;
  const r = opts.r || 0.055;
  const rake = opts.rake ?? -0.30;
  const lensSlot = opts.lens === 'dark' ? 'dark' : 'glass';
  const parts = fitParts();
  for (let i = 0; i < pods; i++) {
    const x = (i - (pods - 1) / 2) * spacing;
    parts.add('detail', xform(cylZ(r, r * 1.35, 12), 0, 0, 0, rake, 0, 0), x, 0, 0);
    parts.add(lensSlot, xform(xform(cylZ(r * 0.8, 0.02, 12), 0, 0, r * 0.72), 0, 0, 0, rake, 0, 0), x, 0, 0);
    if (opts.guard !== false) {
      for (const sx of [-1, 1]) {
        parts.add('dark', xform(xform(box(0.016, r * 2.5, 0.016), sx * r * 0.62, 0, r * 0.55), 0, 0, 0, rake, 0, 0), x, 0, 0);
      }
      parts.add('dark', xform(xform(box(r * 1.9, 0.016, 0.016), 0, r * 0.85, r * 0.55), 0, 0, 0, rake, 0, 0), x, 0, 0);
    }
  }
  return fitAssemble('lightCluster', parts, opts);
}

/**
 * Smoke-launcher tube bank (one cluster — call twice for L/R, mirroring
 * `splay` sign and x anchor).
 * Origin: bracket center; tubes fan forward/up from it.
 * @param {object} opts  mats; count=4; r=0.038; len=0.24; pitch=-0.5 (tube
 *   pitch rx); splay=1.12 (cluster yaw — negative for the far side);
 *   arc=0.55; spacing=0.095; base=true; caps=true; slot='detail'
 *   ('detail' pale tubes | 'dark'); seed, shadows, rotation
 */
function fittingSmokeBank(opts: FittingOptions = {}): THREE.Group {
  const { box, cylZ, xform } = KIT;
  const n = Math.min(8, Math.max(1, opts.count || 4));
  const r = opts.r || 0.038;
  const len = opts.len || 0.24;
  const pitch = opts.pitch ?? -0.5;
  const splay = opts.splay ?? 1.12;
  const arc = opts.arc ?? 0.55;
  const spacing = opts.spacing ?? 0.095;
  const slot = opts.slot || 'detail';
  const parts = fitParts();
  for (let k = 0; k < n; k++) {
    const f = k - (n - 1) / 2;
    const a = splay + f * (arc / n);
    const dx = Math.cos(splay) * f * spacing;
    const dz = -Math.sin(splay) * f * spacing;
    parts.add(slot, xform(cylZ(r, len, 8), 0, 0, 0, pitch, a, 0), dx, 0, dz);
    if (opts.caps !== false) {
      parts.add('dark', xform(xform(cylZ(r * 0.88, 0.012, 8), 0, 0, len / 2 + 0.007), 0, 0, 0, pitch, a, 0), dx, 0, dz);
    }
  }
  if (opts.base !== false) {
    parts.add('dark', xform(box(n * spacing + 0.06, 0.05, 0.08), 0, -0.06, -0.06, 0, splay * 0.5, 0));
  }
  return fitAssemble('smokeBank', parts, opts);
}

/**
 * Whip antenna on a base pot (PALE-REFUND-aware: the thin member defaults to
 * the PALE detail slot so it refunds silhouette cost; pass slot:'dark' only
 * over pale backdrops).
 * Origin: pot base on the deck.
 * @param {object} opts  mats; h=0.9; r=0.011; rake=0.06 (rz lean);
 *   base=true; slot='detail'; seed, shadows, rotation
 */
function fittingAntennaWhip(opts: FittingOptions = {}): THREE.Group {
  const { box, cylY } = KIT;
  const h = opts.h || 0.9;
  const r = opts.r || 0.011;
  const rake = opts.rake ?? 0.06;
  const slot = opts.slot || 'detail';
  const parts = fitParts();
  if (opts.base !== false) {
    parts.add('dark', cylY(0.035, 0.045, 0.08, 10), 0, 0.04, 0);
    parts.add('dark', cylY(0.020, 0.020, 0.05, 8), 0, 0.10, 0);
  }
  const baseTop = opts.base !== false ? 0.12 : 0;
  parts.add(slot, box(r * 2, h, r * 2), -Math.sin(rake) * h * 0.5, baseTop + Math.cos(rake) * h * 0.5, 0, 0, 0, rake);
  return fitAssemble('antennaWhip', parts, opts);
}

/**
 * Unditching log with cinch straps (rear-deck dressing, soviet tradition).
 * Origin: log axis center; log runs along x ('x') or z ('z').
 * @param {object} opts  mats; len=2.4; r=0.13; axis='x'; straps=2; seed,
 *   shadows, rotation
 */
function fittingUnditchingLog(opts: FittingOptions = {}): THREE.Group {
  const { box, cylX } = KIT;
  const len = opts.len || 2.4;
  const r = opts.r || 0.13;
  const straps = Math.max(0, opts.straps ?? 2);
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();
  parts.add('wood', cylX(r, len, 14), 0, 0, 0);
  parts.add('detail', cylX(r * 0.94, 0.016, 14), -(len / 2 + 0.004), 0, 0);
  parts.add('detail', cylX(r * 0.94, 0.016, 14), len / 2 + 0.004, 0, 0);
  for (let i = 0; i < straps; i++) {
    const x = -len / 2 + (i + 1) * (len / (straps + 1)) + (rng() - 0.5) * 0.10;
    parts.add('dark', cylX(r * 1.06, 0.032, 14), x, 0, 0);
    parts.add('dark', box(0.034, r * 0.9, 0.016), x, -r * 0.62, r * 0.55, 0.5, 0, 0);
  }
  if (opts.axis !== 'z') return fitAssemble('unditchingLog', parts, opts);
  const r0 = opts.rotation || [0, 0, 0];
  return fitAssemble('unditchingLog', parts, { ...opts, rotation: [r0[0] || 0, (r0[1] || 0) + Math.PI / 2, r0[2] || 0] });
}

// Register a source-measured fitting whose exterior cannot be represented by
// one of the generic constructors without losing certified geometry. The
// caller supplies the real mesh group; this helper only validates/stamps the
// same marker and AABB contract as fitAssemble. It is intentionally not a
// marker-only escape hatch: at least one visible mesh is mandatory and every
// mesh in the group receives the fitting type for the integrity census.
function fittingMarkExact(group: THREE.Group, type: string): THREE.Group {
  if (!group?.isGroup || !type) throw new Error('KIT.fittings.markExact: visible Group and type are required');
  let meshCount = 0;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material?.colorWrite === false) return;
    meshCount++;
    if (!object.name) object.name = `fitting_${type}_part_${meshCount}`;
    object.userData.fitting = type;
    object.userData.fittingExact = true;
    object.userData.combatHitboxRole = 'equipment';
    object.userData.surfaceMarkupSelectable = true;
  });
  if (!meshCount) throw new Error('KIT.fittings.markExact: group must contain visible mesh geometry');
  group.name = `fitting_${type}_exact`;
  group.userData.fitting = type;
  group.userData.fittingRoot = true;
  group.userData.fittingExact = true;
  group.userData.combatHitboxRole = 'equipment';
  group.userData.surfaceMarkupSelectable = true;
  if (type === 'pintleMG') {
    // Exact hero weapons retain their source-measured exterior, but still
    // participate in the fleet-wide Browning-family quality/finish contract.
    // Do not claim feed/cradle capabilities here: exact builders stamp those
    // only when their authored geometry actually contains them.
    group.userData.browningDerivedStandard = 'cot-browning-family-v2-exact';
    group.userData.machineGunFinish = 'gunmetal';
    group.userData.sourceMeasuredMachineGun = true;
  }
  const bb = new THREE.Box3().setFromObject(group);
  group.userData.aabb = { min: bb.min.toArray(), max: bb.max.toArray() };
  return group;
}

export const FITTINGS = {
  pintleMG: fittingPintleMG,
  americanM2: fittingAmericanM2,
  americanRws: fittingAmericanRws,
  openYokeRws: fittingOpenYokeRws,
  stowageRack: fittingStowageRack,
  towCable: fittingTowCable,
  jerryCans: fittingJerryCans,
  spareTrackLinks: fittingSpareTrackLinks,
  lightCluster: fittingLightCluster,
  smokeBank: fittingSmokeBank,
  antennaWhip: fittingAntennaWhip,
  unditchingLog: fittingUnditchingLog,
  markExact: fittingMarkExact,
};
