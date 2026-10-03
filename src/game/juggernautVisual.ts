import * as THREE from 'three';
interface Shield {mesh:THREE.Mesh;material:THREE.ShaderMaterial;age:number;hp:number;pulse:number}
const scales=new WeakMap<THREE.Object3D,number>();
const shields=new WeakMap<THREE.Object3D,Shield>();
/** A translucent, pulsing shield shell stays attached to the enlarged vehicle. */
export function syncJuggernautVisual(root:THREE.Object3D,dims:{widthM:number;hullLengthM:number;heightM:number},scale:number,hp:number,maxHp:number,dt:number):void {
 const previous=scales.get(root)??1;
 if(previous!==scale){root.scale.multiplyScalar(scale/previous);scales.set(root,scale);}
 let shield=shields.get(root);
 if(scale<=1||hp<=0){if(shield)shield.mesh.visible=false;return;}
 if(!shield){
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   uniforms:{time:{value:0},strength:{value:.15},pulse:{value:0}},
   vertexShader:'varying vec3 n;varying vec3 eye;varying vec2 v;void main(){v=uv;n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
   fragmentShader:'varying vec3 n;varying vec3 eye;varying vec2 v;uniform float time;uniform float strength;uniform float pulse;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),2.5);vec2 q=v*vec2(28.,14.);q.x+=mod(floor(q.y),2.)*.5;vec2 g=abs(fract(q)-.5);float cells=smoothstep(.39,.47,max(g.x,g.y*.86+g.x*.5));float scan=pow(max(0.,sin(v.y*30.-time*2.)),12.);float a=(rim*.65+cells*.12+scan*.12)*strength+pulse*(rim*.45+.05);gl_FragColor=vec4(mix(vec3(.08,.48,1.),vec3(.55,.95,1.),pulse),a);}' });
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,28,16),material);mesh.name='Juggernaut energy shield';
  mesh.position.y=dims.heightM/scale*.46;mesh.scale.set(dims.widthM/scale*.69,dims.heightM/scale*.78,dims.hullLengthM/scale*.67);root.add(mesh);
  shield={mesh,material,age:0,hp,pulse:0};shields.set(root,shield);
  const dispose=()=>{mesh.removeFromParent();mesh.geometry.dispose();material.dispose();shields.delete(root);root.removeEventListener('removed',dispose);};root.addEventListener('removed',dispose);
 }
 shield.mesh.visible=true;shield.age+=dt;if(hp<shield.hp)shield.pulse=1;shield.hp=hp;shield.pulse=Math.max(0,shield.pulse-dt*2.4);
 shield.material.uniforms.time.value=shield.age;shield.material.uniforms.strength.value=.32+.12*Math.sin(shield.age*1.8)+.25*Math.max(0,hp/Math.max(1,maxHp));shield.material.uniforms.pulse.value=shield.pulse;
}
