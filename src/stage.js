import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';

export const renderer = {};
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
camera.up.set(0, 0, -1);

export const view = { x: 0, y: 40, z: 20, tx: 0, ty: 0, tz: 0, fov: 30 };
export const size = { w: 1, h: 1 };
export const coarse = matchMedia('(pointer: coarse)').matches;
export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const textures = {};
let lampLight;
let clock = 0;
let shadowsUntil = Infinity;

export function liveShadows(seconds = Infinity) {
  shadowsUntil = seconds === Infinity ? Infinity : Math.max(shadowsUntil === Infinity ? 0 : shadowsUntil, clock + seconds);
}

export function restShadows() {
  shadowsUntil = clock + 1.2;
}
const frameHooks = new Set();
const resizeHooks = new Set();
let gl;

export const onFrame = (fn) => (frameHooks.add(fn), () => frameHooks.delete(fn));
export const onResize = (fn) => (resizeHooks.add(fn), () => resizeHooks.delete(fn));

let quake = 0;

export function shakeCamera(amount) {
  if (!calm) quake = Math.max(quake, amount);
}

function applyView() {
  const jx = (Math.random() - 0.5) * quake, jz = (Math.random() - 0.5) * quake;
  quake = quake < 0.002 ? 0 : quake * 0.88;
  camera.position.set(view.x + jx, view.y, view.z + jz);
  camera.lookAt(view.tx + jx, view.ty, view.tz + jz);
  if (camera.fov !== view.fov) {
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
  }
}

export function moveView(pose, duration = 1.1, ease = 'power2.inOut') {
  gsap.killTweensOf(view);
  if (duration === 0) {
    Object.assign(view, pose);
    return Promise.resolve();
  }
  return new Promise((resolve) => gsap.to(view, { ...pose, duration, ease, onComplete: resolve }));
}

function resize() {
  size.w = window.innerWidth;
  size.h = window.innerHeight;
  gl.setSize(size.w, size.h, false);
  camera.aspect = size.w / size.h;
  camera.updateProjectionMatrix();
  resizeHooks.forEach((fn) => fn());
}

async function loadTexture(url, srgb) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = gl.capabilities.getMaxAnisotropy();
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function initStage(canvas) {
  gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.gl = gl;
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 0;

  scene.background = new THREE.Color('#0d0705');

  const pmrem = new THREE.PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.34;
  pmrem.dispose();

  const base = import.meta.env.BASE_URL;
  const [wood, woodN, linenN] = await Promise.all([
    loadTexture(`${base}tex/wood.jpg`, true),
    loadTexture(`${base}tex/wood_n.jpg`),
    loadTexture(`${base}tex/linen_n.jpg`),
  ]);
  textures.wood = wood;
  textures.linenN = linenN;
  linenN.repeat.set(3, 4);

  const tableWood = wood.clone();
  const tableNormal = woodN.clone();
  tableWood.repeat.set(4.5, 4.5);
  tableNormal.repeat.set(4.5, 4.5);
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({
      map: tableWood,
      color: '#a08a78',
      normalMap: tableNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.58,
      metalness: 0,
    }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const fill = new THREE.HemisphereLight('#ffe9cf', '#3b2214', 0.62);
  scene.add(fill);

  const lamp = new THREE.DirectionalLight('#ffe6c8', 2.3);
  lamp.position.set(-9, 26, -10);
  lamp.castShadow = true;
  const shadowSize = coarse ? 1536 : 2048;
  lamp.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(lamp.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 2, far: 64 });
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  lampLight = lamp;

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  gsap.ticker.add((_, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    clock += dt;
    gl.shadowMap.autoUpdate = clock < shadowsUntil;
    if (!calm && gl.shadowMap.autoUpdate) lampLight.position.set(-9 + Math.sin(clock * 0.53) * 0.8, 26, -10 + Math.cos(clock * 0.37) * 0.7);
    frameHooks.forEach((fn) => fn(dt));
    applyView();
    gl.render(scene, camera);
  });
}

export function lampOn(duration = 1.5) {
  if (calm) {
    gl.toneMappingExposure = 1;
    return gsap.timeline();
  }
  const light = { v: 0 };
  const apply = () => (gl.toneMappingExposure = light.v);
  return gsap
    .timeline({ onUpdate: apply })
    .to(light, { v: 0.55, duration: 0.08 })
    .to(light, { v: 0.12, duration: 0.1 })
    .to(light, { v: 0.8, duration: 0.09 })
    .to(light, { v: 0.4, duration: 0.14 })
    .to(light, { v: 1, duration, ease: 'power2.out' });
}

export function lampPulse() {
  if (calm) return;
  const light = { v: gl.toneMappingExposure };
  gsap.timeline({ onUpdate: () => (gl.toneMappingExposure = light.v) })
    .to(light, { v: 1.42, duration: 0.3, ease: 'power2.out' })
    .to(light, { v: 1, duration: 1.3, ease: 'power2.inOut' });
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function screenToTable(x, y, height = 0, out = new THREE.Vector3()) {
  ndc.set((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -height;
  return ray.ray.intersectPlane(plane, out);
}

const projected = new THREE.Vector3();

export function worldToScreen(position) {
  projected.copy(position).project(camera);
  return { x: ((projected.x + 1) / 2) * size.w, y: ((1 - projected.y) / 2) * size.h };
}

export function fitDistance(spanW, spanH, fov = 30) {
  const k = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2));
  return Math.max(spanH / k, spanW / (k * camera.aspect));
}
