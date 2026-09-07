import * as THREE from 'three';

/** Original closed forged-web primitive; +Z is the moving axle end. */
export function dimensionedSuspensionArm(width: number, pivotHeight: number, axleHeight: number): THREE.BufferGeometry {
  // Two rounded endpoint forgings are joined by the sloping web. The source
  // axial sides are flat: an elliptical XY tube would falsely narrow the
  // web's vertical silhouette near either measured lateral side face.
  const outline=new THREE.Shape();
  for(const [centerZ,height,phase] of [[-.5,pivotHeight,Math.PI/2],[.5,axleHeight,-Math.PI/2]]) {
    for(let i=0;i<=8;i++) {
      const angle=phase+i*Math.PI/8;
      const z=centerZ+Math.cos(angle)*.12,y=Math.sin(angle)*height/2;
      if(centerZ<0&&i===0)outline.moveTo(z,y);else outline.lineTo(z,y);
    }
  }
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline,{depth:width,bevelEnabled:false,curveSegments:8})
    .translate(0,0,-width/2).rotateY(-Math.PI/2);
}
