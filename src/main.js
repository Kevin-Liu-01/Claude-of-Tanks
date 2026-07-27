// Claude of Tanks — entry point (placeholder scene; replaced during the Build phase)
import * as THREE from 'three';

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88aacc);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 5, 12);
camera.lookAt(0, 0, 0);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(50, 80, 30);
scene.add(sun, new THREE.AmbientLight(0x668899, 0.6));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x4a5d3a })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const placeholder = new THREE.Mesh(
  new THREE.BoxGeometry(6, 2, 3),
  new THREE.MeshStandardMaterial({ color: 0x5a6b4a })
);
placeholder.position.y = 1;
scene.add(placeholder);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Screenshot harness contract (see docs/SCREENSHOT_CONTRACT.md) ---
window.__SHOTS = {
  views: ['battlefield'],
  set(name) {
    // Placeholder: single fixed view. Real game must implement all views deterministically.
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);
  },
};

function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
}
tick();
window.__GAME_READY = true;
