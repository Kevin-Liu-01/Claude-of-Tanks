export interface SourceWorldCertificate {
  readonly sha256:string;
  readonly turret:readonly[number,number,number];
  readonly gun:readonly[number,number,number];
  readonly fused?:boolean;
}
export const SOURCE_WORLD_FRAMES:Readonly<Record<string,SourceWorldCertificate|undefined>>;
export function verifySourceWorldBytes(bytes:ArrayBuffer,certificate:SourceWorldCertificate):Promise<string>;
export function hashLocalOracle(url:string):Promise<string>;
export function validateSourceWorldFrame(certificate:SourceWorldCertificate|undefined,
  measuredHash:string,frames:unknown):{passed:boolean;failures:string[];mode:string;fixedReg?:{dAlong:number;dy:number}};
