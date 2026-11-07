import * as THREE from 'three';
import gsap from 'gsap';
import { scene, onFrame, onResize, moveView, screenToTable, size, fitDistance, coarse, calm, textures, shakeCamera, lampPulse, worldToScreen, liveShadows, restShadows } from './stage.js';
import { buildPuzzle, drawOutlines, THICK } from './pieces.js';
import { createPour } from './pour.js';
import { burst, dust, flash, flyKiss, kissScatter, lightSweep, rain, ring, toast } from './fx.js';
import { sfx } from './sound.js';
import { save, persist, puzzleState } from './store.js';
import { PUZZLES } from './data.js';

const REST = 0.05 + THICK / 2;
const BOX_Z = -5;
const SNAP_RANGE = 0.55;
const PITCH = 1.42;
const FRAME = 0.36;

function solveLayout(innerCols, innerRows, count) {
  const cols = innerCols + FRAME * 2, rows = innerRows + FRAME * 2;
  const W = size.w, H = size.h;
  const pad = 10;
  const hud = document.getElementById('hud').getBoundingClientRect();
  const dockedHud = hud.left > 10;
  const top = dockedHud ? 0 : hud.bottom;
  const bottom = H - safeBottom();
  const avail = bottom - top;
  const wide = W / avail > 1.02;

  const fits = (s) => {
    const cell = PITCH * s;
    if (wide) return Math.floor((W - cols * s - pad * 3) / cell) * Math.floor((bottom - hud.bottom - pad * 2) / cell) >= count;
    return Math.floor((W - pad * 2) / cell) * Math.floor((avail - rows * s - pad * 3) / cell) >= count;
  };

  const minLines = wide ? 2 : W >= 700 ? 3 : 2;
  const maxS = wide
    ? Math.min((avail - pad * 2) / rows, (W - pad * 3) / (cols + PITCH * minLines))
    : Math.min((W - pad * 2) / cols, (avail - pad * 3) / (rows + PITCH * minLines));
  const floor = maxS * (W < 700 ? 0.94 : W < 900 ? 0.8 : 0.72);
  let s = maxS;
  while (s > floor && !fits(s)) s -= 1;

  if (wide) {
    const boardW = cols * s;
    const bx = pad + boardW / 2;
    const by = top + avail / 2;
    return { s, bx, by, axis: 'y', W, H, tray: { left: bx + boardW / 2 + pad, right: W - pad, top: Math.max(hud.bottom, pad), bottom } };
  }
  const bx = W / 2;
  const by = top + pad + (rows * s) / 2;
  return { s, bx, by, axis: 'x', W, H, tray: { left: 0, right: W, top: by + (rows * s) / 2 + pad, bottom: bottom - 2 } };
}

function safeBottom() {
  return document.getElementById('sabProbe').offsetHeight;
}

function buildBoard(p, img) {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  const scale = 150;
  canvas.width = p.cols * scale;
  canvas.height = p.rows * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3b2519';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(244,233,214,.08)';
  ctx.lineWidth = 3;
  drawOutlines(ctx, p, scale);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(p.cols, p.rows), new THREE.MeshStandardMaterial({ map, roughness: 0.82 }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.03;
  plate.receiveShadow = true;
  group.add(plate);

  const frameWood = textures.wood.clone();
  frameWood.repeat.set(0.5, 0.06);
  const material = new THREE.MeshStandardMaterial({ map: frameWood, color: '#d9b48d', roughness: 0.45 });
  const t = 0.34, h = 0.3;
  const bar = (w, d, x, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  bar(p.cols + t * 2, t, 0, -p.rows / 2 - t / 2);
  bar(p.cols + t * 2, t, 0, p.rows / 2 + t / 2);
  bar(t, p.rows, -p.cols / 2 - t / 2, 0);
  bar(t, p.rows, p.cols / 2 + t / 2, 0);

  return {
    group,
    dispose() {
      map.dispose();
      frameWood.dispose();
      group.traverse((o) => o.geometry?.dispose());
    },
  };
}

export class Session {
  constructor({ puzzle, photo, img, box, ui, onExit }) {
    Object.assign(this, { puzzle, photo, img, box, ui, onExit });
    this.state = puzzleState(puzzle.id);
    if (this.state.placed.length >= puzzle.cols * puzzle.rows) this.state.placed = [];
    this.alive = true;
    this.streak = 0;
    this.lastPlaced = 0;
    this.total = puzzle.cols * puzzle.rows;
    this.phase = 'lid';
    this.held = null;
    this.pointer = null;
    this.tray = new THREE.Group();
    this.scroll = 0;
    this.scrollVel = 0;
    this.cleanups = [];

    const built = buildPuzzle(puzzle, photo);
    this.built = built;
    this.pieces = built.pieces;
    this.board = buildBoard(puzzle, img);
    this.board.group.position.z = -60;
    scene.add(this.board.group, this.tray);

    for (const piece of this.pieces) {
      if (this.state.placed.includes(piece.index)) piece.placed = true;
      scene.add(piece.mesh);
    }
    this.loose = this.pieces.filter((p) => !p.placed);
    this.order = this.buildOrder();

    this.handlers = {
      pointerdown: (e) => this.onDown(e),
      pointermove: (e) => this.onMove(e),
      pointerup: (e) => this.onUp(e),
      pointercancel: (e) => this.onUp(e),
      wheel: (e) => this.onWheel(e),
    };
    for (const [name, fn] of Object.entries(this.handlers)) ui.canvas.addEventListener(name, fn, { passive: true });
    this.cleanups.push(() => {
      for (const [name, fn] of Object.entries(this.handlers)) ui.canvas.removeEventListener(name, fn);
    });
    this.cleanups.push(onFrame((dt) => this.update(dt)));
    this.cleanups.push(onResize(() => this.onResized()));

    this.startPour();
  }

  buildOrder() {
    const rows = [...this.loose];
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    return rows;
  }

  posePour(close, duration) {
    const span = close ? { w: 9.6, h: 14 } : { w: 12.5, h: 22 };
    const distance = fitDistance(span.w, span.h);
    const focus = close ? BOX_Z : -1;
    return moveView({ x: 0, y: distance * 0.84, z: distance * 0.54 + focus, tx: 0, ty: 0, tz: focus, fov: 30 }, duration);
  }

  async startPour() {
    const { box } = this;
    const distance = fitDistance(12.5, 22);
    const visibleW = 2 * distance * Math.tan(THREE.MathUtils.degToRad(15)) * (size.w / size.h);
    let lastDust = 0;

    box.group.position.set(0, 0, BOX_Z);
    box.group.quaternion.identity();
    this.pour = createPour({
      pieces: this.loose,
      box,
      origin: new THREE.Vector3(0, 0, BOX_Z),
      limits: { x: Math.max(6.5, Math.min(12, visibleW / 2 - 0.4)), front: 9.5, back: -13 },
      onImpact: (position, speed) => {
        const now = performance.now();
        if (now - lastDust < 60) return;
        lastDust = now;
        dust(position, 1 + Math.min(speed / 14, 1));
        shakeCamera(Math.min(speed / 90, 0.2));
      },
    });
    this.ui.prompt('Kutuyu biz açıyoruz, sen izle');
    await this.posePour(true, 0.9);
    if (this.alive) this.liftLid();
  }

  liftLid() {
    this.phase = 'lifting';
    sfx.lid();
    const { lid } = this.box;
    const side = this.box.size.w + 5;
    this.flow = gsap
      .timeline({ onComplete: () => this.shakeAndPour() })
      .to(lid.position, { y: 4.4, duration: 0.5, ease: 'power2.out' })
      .to(lid.rotation, { z: -0.3, x: 0.12, duration: 0.5, ease: 'power2.out' }, 0)
      .call(() => dust(this.box.group.position, 2.4), null, 0.1)
      .to(lid.position, { x: side, duration: 0.55, ease: 'power2.inOut' })
      .to(lid.position, { y: -6, duration: 0.4, ease: 'power2.in' }, '-=.2')
      .to(lid.rotation, { z: 0, x: 0, duration: 0.4 }, '<')
      .set(lid, { visible: false });
  }

  shakeAndPour() {
    this.phase = 'pouring';
    this.ui.prompt('Parçalar karışıyor');
    const { pour } = this;
    this.flow = gsap
      .timeline()
      .call(() => pour.setLift(1))
      .call(() => {
        pour.setShake(calm ? 0 : 1);
        sfx.shake();
        shakeCamera(0.22);
      }, null, 0.45)
      .call(() => shakeCamera(0.28), null, 0.8)
      .call(() => shakeCamera(0.28), null, 1.15)
      .call(() => pour.setShake(0), null, 1.45)
      .call(() => {
        this.ui.prompt('Dökülüyor');
        this.posePour(false, 1);
        pour.setTilt(1);
      }, null, 1.6);
  }

  arrange() {
    if (this.phase !== 'pouring') return;
    this.phase = 'arranging';
    this.pour.dispose();
    this.pour = null;
    sfx.sweep();
    this.ui.prompt(null);

    const { box } = this;
    gsap.to(box.group.position, { z: -46, y: 8, duration: 0.8, ease: 'power2.in', onComplete: () => (box.group.visible = false) });

    this.ui.playHud(true);
    this.updateProgress();
    this.layout = solveLayout(this.puzzle.cols, this.puzzle.rows, this.order.length);
    this.applyCamera(1.1);

    gsap.to(this.board.group.position, { z: 0, duration: 0.9, ease: 'power3.out', delay: 0.15 });

    for (const piece of this.pieces) {
      if (piece.placed) {
        piece.mesh.position.copy(piece.target).setY(REST);
        piece.mesh.position.z -= 60;
        piece.mesh.quaternion.identity();
        gsap.to(piece.mesh.position, { z: piece.target.z, duration: 0.9, ease: 'power3.out', delay: 0.15 });
      }
    }

    this.slots();
    this.order.forEach((piece) => {
      const { mesh, home, yaw } = piece;
      const from = mesh.quaternion.clone();
      const to = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const flip = { t: 0 };
      this.tray.attach(mesh);
      const delay = 0.25 + (calm ? 0 : Math.random() * 0.6);
      gsap.to(flip, {
        t: 1,
        duration: 0.7,
        delay,
        ease: 'power2.inOut',
        onUpdate: () => mesh.quaternion.slerpQuaternions(from, to, flip.t),
      });
      gsap.to(mesh.position, { x: home.x, z: home.z, duration: 0.7, delay, ease: 'power2.inOut' });
      gsap
        .timeline({ delay })
        .to(mesh.position, { y: 1.8 + Math.random() * 1.4, duration: 0.33, ease: 'power2.out' })
        .to(mesh.position, { y: REST, duration: 0.37, ease: 'bounce.out' });
    });
    gsap.delayedCall(calm ? 1.1 : 1.7, () => {
      if (!this.alive) return;
      this.phase = 'play';
      restShadows();
    });
  }

  onResized() {
    liveShadows(1);
    if (this.phase === 'done') {
      this.poseFinish(0.3);
      return;
    }
    if (this.layout) this.applyLayout(false);
    else this.posePour(this.phase !== 'pouring', 0.3);
  }

  applyCamera(duration) {
    const { s, bx, by, W, H } = this.layout;
    const fov = 20;
    const height = H / s / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    const x = (W / 2 - bx) / s, z = (H / 2 - by) / s;
    return moveView({ x, y: height, z, tx: x, ty: 0, tz: z - 0.001, fov }, duration);
  }

  slots() {
    const { s, tray, axis } = this.layout;
    const left = (tray.left - this.layout.bx) / s, right = (tray.right - this.layout.bx) / s;
    const top = (tray.top - this.layout.by) / s, bottom = (tray.bottom - this.layout.by) / s;
    const spanX = right - left, spanZ = bottom - top;
    const count = this.order.length;
    const cross = axis === 'x' ? spanZ : spanX;
    const along = axis === 'x' ? spanX : spanZ;
    const lines = Math.max(1, Math.floor(cross / PITCH));
    const crossPitch = cross / lines;
    const steps = Math.ceil(count / lines);
    const length = steps * PITCH + 0.5;
    const overflow = Math.max(0, length - along);
    const lead = overflow > 0 ? 0.25 : (along - steps * PITCH) / 2;
    this.scrollMax = overflow;
    this.scroll = Math.min(this.scroll, overflow);

    this.order.forEach((piece, i) => {
      const step = Math.floor(i / lines);
      const line = i % lines;
      const a = lead + (step + 0.5) * PITCH + (line % 2 ? 0.16 : -0.16);
      const c = (line + 0.5) * crossPitch;
      piece.home ??= new THREE.Vector3();
      piece.yaw ??= (Math.random() - 0.5) * 0.3;
      if (axis === 'x') piece.home.set(left + a, REST, top + c);
      else piece.home.set(left + c, REST, top + a);
    });
  }

  applyLayout(animated) {
    if (!this.layout) return;
    if (!animated) {
      this.layout = solveLayout(this.puzzle.cols, this.puzzle.rows, this.order.length);
      this.applyCamera(0.25);
    }
    this.slots();
    for (const piece of this.order) {
      if (piece === this.held) continue;
      gsap.to(piece.mesh.position, { x: piece.home.x, z: piece.home.z, duration: animated ? 0.32 : 0.2, ease: 'power2.out', overwrite: 'auto' });
    }
  }

  applyScroll() {
    const offset = -this.scroll;
    this.tray.position.x = this.layout?.axis === 'x' ? offset : 0;
    this.tray.position.z = this.layout?.axis === 'y' ? offset : 0;
  }

  updateProgress() {
    const done = this.total - this.order.length;
    this.ui.progress(`${done} / ${this.total}`);
  }

  pieceAt(point) {
    let best = null;
    let bestDistance = coarse ? 0.95 : 0.72;
    for (const piece of this.order) {
      const x = piece.mesh.position.x + this.tray.position.x;
      const z = piece.mesh.position.z + this.tray.position.z;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < bestDistance) {
        best = piece;
        bestDistance = distance;
      }
    }
    return best;
  }

  onDown(e) {
    if (this.phase !== 'play' || this.pointer) return;
    this.ui.canvas.setPointerCapture(e.pointerId);
    const point = screenToTable(e.clientX, e.clientY);
    const hit = this.pieceAt(point);
    this.scrollVel = 0;
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, hit, mode: null, at: performance.now(), type: e.pointerType };
    if (hit && this.scrollMax === 0) this.pick(hit, e);
  }

  onMove(e) {
    const p = this.pointer;
    if (this.phase !== 'play') return;
    if (this.held) {
      if (p && p.id === e.pointerId) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
      return;
    }
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
    if (!p.mode && Math.hypot(dx, dy) > 7) {
      const along = Math.abs(this.layout.axis === 'x' ? dx : dy);
      const cross = Math.abs(this.layout.axis === 'x' ? dy : dx);
      if (p.hit && cross > along * 0.75) {
        p.x = e.clientX;
        p.y = e.clientY;
        this.pick(p.hit, e);
        return;
      }
      p.mode = 'scroll';
    }
    if (p.mode === 'scroll') {
      const delta = (this.layout.axis === 'x' ? e.clientX - p.x : e.clientY - p.y) / this.layout.s;
      this.scroll = THREE.MathUtils.clamp(this.scroll - delta, 0, this.scrollMax);
      liveShadows(1);
      this.scrollVel = -delta * 60;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  }

  onUp(e) {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    this.pointer = null;
    if (!this.held) return;
    if (e.type === 'pointercancel') this.drop(null);
    else this.drop(screenToTable(e.clientX, e.clientY));
  }

  onWheel(e) {
    if (this.phase !== 'play') return;
    this.scroll = THREE.MathUtils.clamp(this.scroll + (e.deltaY + e.deltaX) / this.layout.s, 0, this.scrollMax);
    liveShadows(1);
  }

  pick(piece, e) {
    liveShadows();
    this.held = piece;
    this.heldOffset = { z: 0, target: e.pointerType === 'mouse' ? 0 : -1.3 };
    gsap.killTweensOf(piece.mesh.position);
    gsap.killTweensOf(piece.mesh.rotation);
    scene.attach(piece.mesh);
    gsap.to(this.heldOffset, { z: this.heldOffset.target, duration: 0.16, ease: 'power2.out' });
    gsap.to(piece.mesh.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.18, ease: 'back.out(3)' });
    gsap.to(piece.mesh.rotation, { y: 0, duration: 0.18 });
    piece.tilt = { x: 0, z: 0, px: piece.mesh.position.x, pz: piece.mesh.position.z };
    dust(piece.mesh.position, 0.5);
    sfx.pick();
  }

  drop(point) {
    restShadows();
    liveShadows(1.8);
    const piece = this.held;
    this.held = null;
    const distance = point ? Math.hypot(point.x - piece.target.x, point.z + this.heldOffset.target - piece.target.z) : Infinity;
    if (distance <= SNAP_RANGE) this.place(piece);
    else this.sendHome(piece);
  }

  sendHome(piece) {
    sfx.drop();
    const { mesh, home, yaw } = piece;
    this.tray.attach(mesh);
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    gsap.to(mesh.rotation, { x: 0, y: yaw, duration: 0.34, ease: 'power2.out' });
    gsap.fromTo(mesh.rotation, { z: 0.3 }, { z: 0, duration: 0.5, ease: 'elastic.out(1.2, .3)' });
    gsap.to(mesh.position, { x: home.x, z: home.z, duration: 0.42, ease: 'power3.out' });
    gsap.timeline().to(mesh.position, { y: 0.9, duration: 0.14 }).to(mesh.position, { y: REST, duration: 0.28, ease: 'bounce.out' });
  }

  place(piece) {
    piece.placed = true;
    this.order = this.order.filter((p) => p !== piece);
    this.state.placed.push(piece.index);
    save.kisses += 1;
    save.earned += 1;
    persist();

    const { mesh, target } = piece;
    gsap
      .timeline({ onComplete: () => this.afterPlace(piece) })
      .to(mesh.rotation, { x: 0, y: 0, z: 0, duration: 0.12 }, 0)
      .to(mesh.position, { x: target.x, z: target.z, duration: 0.13, ease: 'power2.out' }, 0)
      .to(mesh.position, { y: REST, duration: 0.17, ease: 'power3.in' }, 0)
      .to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.17 }, 0);
    this.updateProgress();
    if (this.order.length) this.applyLayout(true);
  }

  afterPlace(piece) {
    if (!this.alive) return;
    liveShadows(2.4);
    const now = performance.now();
    this.streak = now - this.lastPlaced < 9000 ? this.streak + 1 : 1;
    this.lastPlaced = now;
    const { streak } = this;

    sfx.snap(streak);
    const { target, mesh } = piece;
    const world = target.clone().setY(0.2);
    flash(world);
    ring(world);
    dust(world, 0.9);
    burst(world, Math.min(8 + streak * 2, 26));
    shakeCamera(Math.min(0.03 + streak * 0.012, 0.12));
    gsap.fromTo(mesh.scale, { y: 0.7 }, { y: 1, duration: 0.3, ease: 'back.out(4)' });

    for (const other of this.pieces) {
      if (other === piece || !other.placed) continue;
      const distance = Math.hypot(other.col - piece.col, other.row - piece.row);
      if (distance > 4.5) continue;
      gsap.fromTo(
        other.mesh.position,
        { y: REST },
        { y: REST + 0.16 * (1 - distance / 4.5), duration: 0.12, delay: distance * 0.04, yoyo: true, repeat: 1, ease: 'sine.out', overwrite: true },
      );
    }

    const row = this.pieces.filter((p) => p.row === piece.row);
    const col = this.pieces.filter((p) => p.col === piece.col);
    for (const line of [row, col]) if (line.every((p) => p.placed)) this.celebrateLine(line);

    const earnedNow = save.earned;
    flyKiss(world, this.layout.s, () => {
      sfx.kiss();
      this.ui.bumpKiss();
      if (earnedNow % 25 === 0) toast(`${earnedNow} öpücük kazanıldı`);
    });
    if (streak >= 3) toast(`${streak} parça üst üste`);
    if (!this.order.length) gsap.delayedCall(1.05, () => this.alive && this.finish());
  }

  celebrateLine(line) {
    sfx.sweep();
    line.forEach((p, i) => {
      gsap.fromTo(p.mesh.position, { y: REST }, { y: REST + 0.5, duration: 0.17, delay: i * 0.045, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: true });
      gsap.delayedCall(i * 0.045, () => {
        if (!this.alive) return;
        flash(p.target);
        burst(p.target, 4);
      });
    });
  }

  poseFinish(duration) {
    const { cols, rows } = this.puzzle;
    const availH = size.h - finishCardSpace();
    const scale = Math.min(size.w / (cols + 1.2), availH / (rows + 1.2));
    const fov = 20;
    const height = size.h / scale / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    const z = (size.h / 2 - availH / 2) / scale;
    return moveView({ x: 0, y: height, z, tx: 0, ty: 0, tz: z - 0.001, fov }, duration, 'power2.inOut');
  }

  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    liveShadows();
    const { puzzle } = this;
    this.state.finished += 1;
    this.state.placed = [];
    persist();
    this.box.repaint(true);
    this.ui.playHud(false);

    const whole = new THREE.Mesh(
      new THREE.PlaneGeometry(puzzle.cols, puzzle.rows),
      new THREE.MeshStandardMaterial({ map: this.photo, roughness: 0.5, transparent: true, opacity: 0 }),
    );
    whole.rotation.x = -Math.PI / 2;
    whole.position.y = REST + THICK / 2 + 0.01;
    scene.add(whole);
    this.whole = whole;

    this.poseFinish(1.6);

    const center = new THREE.Vector3(0, 0.2, 0);
    ring(center, 2.4);
    shakeCamera(0.2);
    for (const piece of this.pieces) {
      const distance = Math.hypot(piece.target.x, piece.target.z);
      gsap.fromTo(
        piece.mesh.position,
        { y: REST },
        { y: REST + 0.9, duration: 0.2, delay: distance * 0.05, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: true },
      );
    }

    gsap.delayedCall(0.8, () => {
      if (!this.alive) return;
      sfx.win();
      lampPulse();
      lightSweep(puzzle.cols, puzzle.rows, puzzle.cols);
      gsap.to(whole.material, { opacity: 1, duration: 1 });
      rain(center, puzzle.cols + 8, puzzle.rows + 14, 240);
    });

    gsap.delayedCall(1.7, () => {
      if (!this.alive) return;
      const { left, right, top, bottom } = boardRect(this);
      kissScatter(16, { x: left, y: top, w: right - left, h: bottom - top });
    });

    gsap.delayedCall(2.5, () => {
      if (!this.alive) return;
      const allDone = PUZZLES.every((p) => (save.puzzles[p.id]?.finished ?? 0) > 0);
      this.ui.finish(allDone
        ? { title: 'Bütün kutular bitti', text: `Cebinde ${save.kisses} öpücük var. Mağazaya uğra, Tuğba.` }
        : { title: 'Bitti, Tuğba', text: `Bu resimden ${this.total} öpücük çıktı. Cebinde ${save.kisses} var, mağazada harca.` });
    });
  }

  update(dt) {
    if (this.pour) {
      this.pour.update(dt);
      if (this.phase === 'pouring' && this.pour.settled()) this.arrange();
    }
    if (this.phase === 'play' || this.phase === 'done') {
      if (!this.pointer || this.pointer.mode !== 'scroll') {
        if (Math.abs(this.scrollVel) > 0.02) {
          liveShadows(0.5);
          this.scroll = THREE.MathUtils.clamp(this.scroll + this.scrollVel * dt, 0, this.scrollMax ?? 0);
          this.scrollVel *= Math.exp(-dt * 5);
        }
      }
      this.applyScroll();
    }

    const p = this.pointer;
    if (this.phase === 'play' && p && !this.held && !p.mode && p.hit && performance.now() - p.at > 200) {
      this.pick(p.hit, { pointerType: p.type });
    }
    if (this.held && p) {
      const { mesh, tilt } = this.held;
      const world = screenToTable(p.x, p.y);
      if (world) {
        const k = 1 - Math.exp(-dt * 28);
        mesh.position.x += (world.x - mesh.position.x) * k;
        mesh.position.z += (world.z + this.heldOffset.z - mesh.position.z) * k;
        mesh.position.y += (1.35 - mesh.position.y) * (1 - Math.exp(-dt * 16));
        const vx = (mesh.position.x - tilt.px) / Math.max(dt, 0.001);
        const vz = (mesh.position.z - tilt.pz) / Math.max(dt, 0.001);
        tilt.px = mesh.position.x;
        tilt.pz = mesh.position.z;
        tilt.x += (THREE.MathUtils.clamp(vz * 0.012, -0.4, 0.4) - tilt.x) * 0.2;
        tilt.z += (THREE.MathUtils.clamp(-vx * 0.012, -0.4, 0.4) - tilt.z) * 0.2;
        mesh.rotation.x = tilt.x;
        mesh.rotation.z = tilt.z;
      }
    }
  }

  exit() {
    this.alive = false;
    liveShadows();
    this.flow?.kill();
    gsap.killTweensOf(this);
    this.pour?.dispose();
    this.pour = null;
    this.cleanups.forEach((fn) => fn());
    for (const piece of this.pieces) {
      gsap.killTweensOf(piece.mesh.position);
      gsap.killTweensOf(piece.mesh.rotation);
      gsap.killTweensOf(piece.mesh.scale);
      piece.mesh.removeFromParent();
    }
    scene.remove(this.board.group, this.tray);
    if (this.whole) {
      scene.remove(this.whole);
      this.whole.geometry.dispose();
      this.whole.material.dispose();
    }
    this.board.dispose();
    this.built.dispose();
  }
}

function finishCardSpace() {
  const docked = size.h < 520 && size.w > size.h;
  return docked ? 0 : 216 + 24 + safeBottom();
}

function boardRect(session) {
  const a = worldToScreen(new THREE.Vector3(-session.puzzle.cols / 2, 0, -session.puzzle.rows / 2));
  const b = worldToScreen(new THREE.Vector3(session.puzzle.cols / 2, 0, session.puzzle.rows / 2));
  return { left: a.x, top: a.y, right: b.x, bottom: b.y };
}
