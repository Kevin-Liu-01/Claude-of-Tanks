type Vector3=readonly[number,number,number];
export interface SourceWorldCertificate {
  readonly sha256:string;
  readonly turret:Vector3;
  readonly gun:Vector3;
  readonly fused?:boolean;
  /** A second certified source whose turret and gun replace the first's: its own datums and the rigid translation that
   * seats its ring datum on the first source's (source metres). */
  readonly graft?:{readonly sha256:string;readonly turret:Vector3;readonly gun:Vector3;readonly translation:Vector3};
}
/** One vector for both pivots, or each pivot's own (an omitted pivot departs by 0). */
export type SourceWorldBuildOffset=Vector3|{readonly turret?:Vector3;readonly gun?:Vector3};
export const AUTHORING_SOURCE_WORLD_FRAMES:Readonly<Record<string,SourceWorldCertificate|undefined>>;
export const SOURCE_WORLD_FRAMES:Readonly<Record<string,SourceWorldCertificate|undefined>>;
export const SOURCE_WORLD_BUILD_OFFSETS:Readonly<Record<string,SourceWorldBuildOffset|undefined>>;
export function buildOffsetFor(buildOffset:SourceWorldBuildOffset|undefined,anchor:'turret'|'gun'):Vector3;
export function verifySourceWorldBytes(bytes:ArrayBuffer,certificate:{readonly sha256:string}):Promise<string>;
export function hashLocalOracle(url:string):Promise<string>;
export function validateSourceWorldFrame(certificate:SourceWorldCertificate|undefined,
  measuredHash:string,frames:unknown,buildOffset?:SourceWorldBuildOffset):{passed:boolean;failures:string[];mode:string;fixedReg?:{dAlong:number;dy:number}};
