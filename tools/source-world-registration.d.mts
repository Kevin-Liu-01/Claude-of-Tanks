export interface SourceWorldCertificate {
  readonly sha256:string;
  readonly turret:readonly[number,number,number];
  readonly gun:readonly[number,number,number];
  readonly fused?:boolean;
}
export const SOURCE_WORLD_FRAMES:Readonly<Record<string,SourceWorldCertificate|undefined>>;
export const SOURCE_WORLD_BUILD_OFFSETS:Readonly<Record<string,readonly[number,number,number]|undefined>>;
export function verifySourceWorldBytes(bytes:ArrayBuffer,certificate:SourceWorldCertificate):Promise<string>;
export function hashLocalOracle(url:string):Promise<string>;
export function validateSourceWorldFrame(certificate:SourceWorldCertificate|undefined,
  measuredHash:string,frames:unknown,buildOffset?:readonly[number,number,number]):{passed:boolean;failures:string[];mode:string;fixedReg?:{dAlong:number;dy:number}};
