import * as THREE from 'three';
import gsap from 'gsap';
import { scene, onFrame, worldToScreen, calm, view } from './stage.js';

const SIZE = 280;
const COLORS = ['#c4202f', '#e8596a', '#f4e9d6', '#9c1623', '#f2b9a7'].map((c) => new THREE.Color(c));
const heart = new THREE.Shape();
heart.moveTo(0, -0.5);
heart.bezierCurveTo(-0.7, -0.05, -0.55, 0.5, -0.2, 0.5);
heart.bezierCurveTo(-0.08, 0.5, 0, 0.42, 0, 0.3);
heart.bezierCurveTo(0, 0.42, 0.08, 0.5, 0.2, 0.5);
heart.bezierCurveTo(0.55, 0.5, 0.7, -0.05, 0, -0.5);

const flakes = new THREE.InstancedMesh(
  new THREE.ShapeGeometry(heart, 6),
  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }),
  SIZE,
);
flakes.frustumCulled = false;
flakes.castShadow = true;
flakes.count = SIZE;

const alive = Array.from({ length: SIZE }, () => ({
  life: 0, max: 1, size: 0, gravity: 0, drag: 0,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
}));
const dummy = new THREE.Object3D();
let cursor = 0;
let ready = false;

export function initFx() {
  if (ready) return;
  ready = true;
  const color = new THREE.Color();
  for (let i = 0; i < SIZE; i++) {
    flakes.setColorAt(i, color.copy(COLORS[i % COLORS.length]));
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    flakes.setMatrixAt(i, dummy.matrix);
  }
  scene.add(flakes);
  onFrame(update);
  onFrame(updateDust);
  if (!calm) initMotes();
}

function update(dt) {
  let dirty = false;
  for (let i = 0; i < SIZE; i++) {
    const p = alive[i];
    if (p.life <= 0) continue;
    dirty = true;
    p.life -= dt;
    p.vel.y -= p.gravity * dt;
    p.vel.multiplyScalar(1 - p.drag * dt);
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.y < 0.12) {
      p.pos.y = 0.12;
      p.vel.set(0, 0, 0);
      p.spin.set(0, 0, 0);
      p.rot.x = -Math.PI / 2;
    }
    p.rot.x += p.spin.x * dt;
    p.rot.y += p.spin.y * dt;
    p.rot.z += p.spin.z * dt;
    const fade = Math.min(1, p.life / 0.35);
    dummy.position.copy(p.pos);
    dummy.rotation.copy(p.rot);
    dummy.scale.setScalar(Math.max(p.life, 0) > 0 ? p.size * fade : 0);
    dummy.updateMatrix();
    flakes.setMatrixAt(i, dummy.matrix);
  }
  if (dirty) flakes.instanceMatrix.needsUpdate = true;
}

function spawn(setup) {
  const p = alive[cursor];
  cursor = (cursor + 1) % SIZE;
  setup(p);
}

export function burst(position, count = 8) {
  if (calm) return;
  for (let i = 0; i < count; i++) {
    spawn((p) => {
      const a = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      p.pos.copy(position).setY(0.5);
      p.vel.set(Math.cos(a) * speed, 7 + Math.random() * 6, Math.sin(a) * speed);
      p.rot.set(-Math.PI / 2, 0, Math.random() * 6);
      p.spin.set(Math.random() * 7 - 3.5, Math.random() * 7 - 3.5, Math.random() * 7 - 3.5);
      p.size = 0.2 + Math.random() * 0.22;
      p.gravity = 26;
      p.drag = 2.2;
      p.max = p.life = 0.75 + Math.random() * 0.3;
    });
  }
}

export function rain(center, spanX, spanZ, count = 200) {
  if (calm) return;
  for (let i = 0; i < count; i++) {
    spawn((p) => {
      p.pos.set(center.x + (Math.random() - 0.5) * spanX, 12 + Math.random() * 16, center.z + (Math.random() - 0.5) * spanZ);
      p.vel.set((Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set(Math.random() * 7 - 3.5, Math.random() * 7 - 3.5, Math.random() * 7 - 3.5);
      p.size = 0.32 + Math.random() * 0.34;
      p.gravity = 2.8;
      p.drag = 0.5;
      p.max = p.life = 5.5 + Math.random() * 2.5;
    });
  }
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, '#fff0d8');
  g.addColorStop(0.45, '#7a5a3c');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

let flashMap;
export function flash(position) {
  flashMap ??= radialTexture();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: flashMap, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position).setY(0.32);
  scene.add(mesh);
  gsap.fromTo(mesh.scale, { x: 0.4, y: 0.4 }, { x: 1.2, y: 1.2, duration: 0.45, ease: 'power2.out' });
  gsap.to(mesh.material, {
    opacity: 0,
    duration: 0.45,
    onComplete() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  });
}

export function lightSweep(width, depth, cols) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 4;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0.3, '#000');
  g.addColorStop(0.5, '#a38a68');
  g.addColorStop(0.7, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 4);
  const map = new THREE.CanvasTexture(c);
  map.center.set(0.5, 0.5);
  map.rotation = 0.5;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.36;
  scene.add(mesh);
  map.offset.x = 0.75;
  return gsap.to(map.offset, {
    x: -0.75,
    duration: 1 + cols * 0.03,
    ease: 'power1.inOut',
    onComplete() {
      scene.remove(mesh);
      map.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  });
}

const fxLayer = () => document.getElementById('fx');

export function flyKiss(position, pieceSize, onArrive) {
  const point = worldToScreen(position);
  const counter = document.querySelector('#counter svg').getBoundingClientRect();
  const width = Math.max(pieceSize * 1.5, 64);
  const height = (width * 2) / 3;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'kiss-fly');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '<use href="#kiss"/>';
  fxLayer().append(svg);

  const endX = counter.left + counter.width / 2 - width / 2;
  const endY = counter.top + counter.height / 2 - height / 2;
  gsap.set(svg, { x: point.x - width / 2, y: point.y - height / 2, rotation: gsap.utils.random(-22, 22), scale: 1.9, opacity: 0 });
  gsap
    .timeline({ onComplete: () => svg.remove() })
    .to(svg, { scale: 1, opacity: 1, duration: 0.16, ease: 'power3.in' })
    .to(svg, { duration: 0.2 })
    .to(svg, { x: endX, duration: 0.56, ease: 'power1.inOut' })
    .to(svg, { y: endY, duration: 0.56, ease: 'back.in(1.5)' }, '<')
    .to(svg, { scale: counter.width / width, rotation: 0, duration: 0.56, ease: 'power2.in' }, '<')
    .call(onArrive);
}

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let softMap;
const puffs = [];
let puffCursor = 0;

export function dust(position, strength = 1) {
  if (calm) return;
  softMap ??= softTexture();
  const count = Math.round(2 + strength * 2);
  for (let i = 0; i < count; i++) {
    let puff = puffs[puffCursor];
    if (!puff) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softMap, color: '#d9c3a3', transparent: true, depthWrite: false, opacity: 0 }));
      puff = { sprite, life: 0, max: 1, vx: 0, vz: 0, grow: 0, peak: 0 };
      puffs[puffCursor] = puff;
      scene.add(sprite);
    }
    puffCursor = (puffCursor + 1) % 36;
    const a = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 1.6;
    puff.sprite.position.set(position.x, 0.3, position.z);
    puff.sprite.scale.setScalar(0.5 + Math.random() * 0.5);
    puff.vx = Math.cos(a) * speed;
    puff.vz = Math.sin(a) * speed;
    puff.grow = 1.6 + Math.random() * 1.4;
    puff.peak = 0.16 + Math.min(strength, 2) * 0.09;
    puff.life = puff.max = 0.6 + Math.random() * 0.5;
  }
}

function updateDust(dt) {
  for (const puff of puffs) {
    if (!puff || puff.life <= 0) continue;
    puff.life -= dt;
    const { sprite } = puff;
    sprite.position.x += puff.vx * dt;
    sprite.position.z += puff.vz * dt;
    sprite.position.y += 0.7 * dt;
    sprite.scale.addScalar(puff.grow * dt);
    sprite.material.opacity = Math.max(puff.life / puff.max, 0) * puff.peak;
  }
}

function initMotes() {
  softMap ??= softTexture();
  const COUNT = 60;
  const spots = new Float32Array(COUNT * 3);
  const seeds = Array.from({ length: COUNT }, () => ({ x: Math.random() * 44 - 22, y: 1 + Math.random() * 9, z: Math.random() * 44 - 22, phase: Math.random() * 6.28, speed: 0.1 + Math.random() * 0.25 }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(spots, 3));
  const motes = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: softMap,
    color: '#ffe4bd',
    size: 0.2,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false;
  scene.add(motes);
  let t = 0;
  onFrame((dt) => {
    t += dt;
    seeds.forEach((s, i) => {
      spots[i * 3] = view.tx + s.x + Math.sin(t * s.speed + s.phase) * 1.5;
      spots[i * 3 + 1] = s.y + Math.sin(t * s.speed * 0.7 + s.phase) * 0.6;
      spots[i * 3 + 2] = view.tz + s.z + Math.cos(t * s.speed + s.phase) * 1.5;
    });
    geometry.attributes.position.needsUpdate = true;
  });
}

export function ring(position, size = 1) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 56),
    new THREE.MeshBasicMaterial({ color: '#fff0d4', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position).setY(0.34);
  scene.add(mesh);
  mesh.scale.setScalar(0.5);
  gsap.to(mesh.scale, { x: 3.2 * size, y: 3.2 * size, duration: 0.55, ease: 'power2.out' });
  gsap.to(mesh.material, {
    opacity: 0,
    duration: 0.55,
    ease: 'power1.in',
    onComplete() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  });
}

export function kissScatter(count, area) {
  const layer = fxLayer();
  for (let i = 0; i < count; i++) {
    const width = 44 + Math.random() * 58;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'kiss-fly');
    svg.setAttribute('width', width);
    svg.setAttribute('height', (width * 2) / 3);
    svg.innerHTML = '<use href="#kiss"/>';
    layer.append(svg);
    gsap.set(svg, { x: area.x + Math.random() * Math.max(area.w - width, 1), y: area.y + Math.random() * Math.max(area.h - width, 1), rotation: gsap.utils.random(-35, 35), scale: 2.2, opacity: 0 });
    gsap
      .timeline({ delay: i * (0.9 / count), onComplete: () => svg.remove() })
      .to(svg, { scale: 1, opacity: 0.92, duration: 0.14, ease: 'power3.in' })
      .to(svg, { opacity: 0, y: '+=14', duration: 0.7, delay: 1.1 });
  }
}

export function rainOver(count) {
  rain(new THREE.Vector3(view.tx, 0, view.tz), 26, 26, count);
}

export function screenShake(power) {
  if (calm) return;
  gsap.fromTo('#couponCard', { x: -14 * power }, { x: 0, duration: 0.6, ease: `elastic.out(${1 + power}, .16)` });
}

export function toast(text) {
  const el = document.createElement('p');
  el.className = 'toast';
  el.textContent = text;
  fxLayer().append(el);
  gsap
    .timeline({ onComplete: () => el.remove() })
    .from(el, { y: -14, opacity: 0, duration: 0.25, ease: 'back.out(2)' })
    .to(el, { opacity: 0, y: -8, duration: 0.3, delay: 1.5 });
}
