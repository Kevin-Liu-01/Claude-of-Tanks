export const JUGGERNAUT_SCALE=1.12;
interface ScaleSpec {dims:{hullLengthM:number;widthM:number;heightM:number;lengthM?:number};armor:{boundingRadiusM?:number}}
const variants=new WeakMap<ScaleSpec,ScaleSpec>();
/** Match-owned dimensions; never mutate the shared fleet or multiply the scale twice. */
export function applyJuggernautScale(entity:{spec?:ScaleSpec;state:{modeScale?:number}}):void {
 if(entity.state.modeScale===JUGGERNAUT_SCALE)return;
 entity.state.modeScale=JUGGERNAUT_SCALE;
 const source=entity.spec;if(!source)return;
 let spec=variants.get(source);
 if(!spec){spec={...source,dims:{...source.dims,hullLengthM:source.dims.hullLengthM*JUGGERNAUT_SCALE,widthM:source.dims.widthM*JUGGERNAUT_SCALE,heightM:source.dims.heightM*JUGGERNAUT_SCALE,...(source.dims.lengthM?{lengthM:source.dims.lengthM*JUGGERNAUT_SCALE}:{})},armor:{...source.armor,boundingRadiusM:(source.armor.boundingRadiusM??source.dims.hullLengthM)*JUGGERNAUT_SCALE}};variants.set(source,spec);}
 entity.spec=spec;
}
