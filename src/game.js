import * as THREE from 'three';
import gsap from 'gsap';
import { camera, fitDistance, initStage, lampOn, moveView, onFrame, onResize, renderer, scene, size } from './stage.js';
import { buildBox } from './box.js';
import { initShop, openShop } from './shop.js';
import { restoreProgress, syncCoupons } from './coupons.js';
import { initFx } from './fx.js';
import { initPhysics } from './pour.js';
import { Session } from './session.js';
import { createMusic } from './music.js';
import { PUZZLES } from './data.js';
import { alignGrids, save, puzzleState } from './store.js';
import { sfx, toggleSound, wakeSound } from './sound.js';

const SPACING = 8.8;
const $ = (id) => document.getElementById(id);

let boxes = [];
let focus = 0;
const carousel = { f: 0, active: false, drag: null };
let session = null;
let music = null;

export async function prepareGame(images) {
  await restoreProgress();
  alignGrids(PUZZLES);
  await Promise.all([
    document.fonts.load('400 40px Shrikhand', 'Tuğba Şampiyonası'),
    document.fonts.load('600 20px "Bricolage Grotesque"', 'parça ızgara'),
  ]);
  await Promise.all([initStage($('stage')), initPhysics()]);
  initFx();

  boxes = PUZZLES.map((p, i) => {
    const box = buildBox(p, images[i], i + 1, PUZZLES.length, puzzleState(p.id).finished > 0);
    box.puzzle = p;
    box.img = images[i];
    scene.add(box.group);
    return box;
  });

  renderer.gl.compile(scene, camera);
  onFrame(carouselFrame);
  onResize(() => carousel.active && poseCarousel(0.4));
  wireUi();
}

function carouselFrame() {
  if (!carousel.active) return;
  boxes.forEach((box, i) => {
    const offset = i - carousel.f;
    box.group.position.set(offset * SPACING, 0, Math.abs(offset) * 1.2);
    box.group.rotation.y = -offset * 0.12;
    box.group.visible = Math.abs(offset) < 3.2;
  });
}

function poseCarousel(duration) {
  const docked = size.h < 520 && size.w > size.h;
  const picker = $('picker').getBoundingClientRect().height;
  const below = picker + (docked ? 8 : 24);
  const free = Math.max(size.h - below - (docked ? 0 : 56), 120);
  const distance = fitDistance(10, 9.6 * (size.h / free));
  const visible = 0.536 * distance;
  const shift = ((below - (docked ? 0 : 56)) / 2 / size.h) * visible;
  return moveView({ x: 0, y: distance * 0.84, z: distance * 0.54 + shift, tx: 0, ty: 0, tz: shift, fov: 30 }, duration);
}

function showBoxInfo() {
  const p = PUZZLES[focus];
  const state = puzzleState(p.id);
  const count = p.cols * p.rows;
  $('boxTitle').textContent = p.title;
  let status = 'Daha açılmadı';
  if (state.placed.length) status = `${state.placed.length} parça yerleşti`;
  else if (state.finished) status = 'Bitti, yine yapabilirsin';
  $('boxMeta').textContent = `${count} parça, ${p.cols} × ${p.rows}. ${status}`;
  $('prevBox').disabled = focus === 0;
  $('nextBox').disabled = focus === boxes.length - 1;
}

function goTo(index) {
  focus = THREE.MathUtils.clamp(index, 0, boxes.length - 1);
  gsap.to(carousel, { f: focus, duration: 0.5, ease: 'power3.out', overwrite: true });
  showBoxInfo();
}

function enterCarousel() {
  session = null;
  boxes.forEach((box) => {
    gsap.killTweensOf(box.group.position);
    gsap.killTweensOf(box.lid.position);
    gsap.killTweensOf(box.lid.rotation);
    box.group.quaternion.identity();
    box.group.visible = true;
    box.lid.visible = true;
    box.lid.position.set(0, 1.55, 0);
    box.lid.rotation.set(0, 0, 0);
  });
  carousel.active = true;
  $('picker').hidden = false;
  $('hud').hidden = false;
  $('backBtn').hidden = true;
  $('tools').hidden = true;
  $('shopBtn').hidden = false;
  $('progress').textContent = '';
  showBoxInfo();
  poseCarousel(0.9);
}

function pickBox() {
  if (!carousel.active) return;
  carousel.active = false;
  $('picker').hidden = true;
  $('shopBtn').hidden = true;
  const chosen = boxes[focus];
  boxes.forEach((box, i) => {
    if (i === focus) return;
    gsap.to(box.group.position, { x: (i - focus) * 34, duration: 0.6, ease: 'power2.in', onComplete: () => (box.group.visible = false) });
  });

  const photo = new THREE.Texture(chosen.img);
  photo.colorSpace = THREE.SRGBColorSpace;
  const boardShape = chosen.puzzle.cols / chosen.puzzle.rows;
  const photoShape = chosen.img.naturalWidth / chosen.img.naturalHeight;
  photo.repeat.set(Math.min(boardShape / photoShape, 1), Math.min(photoShape / boardShape, 1));
  photo.offset.set((1 - photo.repeat.x) / 2, (1 - photo.repeat.y) / 2);
  photo.anisotropy = renderer.gl.capabilities.getMaxAnisotropy();
  photo.needsUpdate = true;

  $('photoImg').src = chosen.img.src;

  session = new Session({
    puzzle: chosen.puzzle,
    photo,
    img: chosen.img,
    box: chosen,
    ui,
    onExit: enterCarousel,
  });
  session.photoTexture = photo;
}

function leaveSession() {
  if (!session) return;
  session.exit();
  session.photoTexture.dispose();
  ui.prompt(null);
  ui.playHud(false);
  $('finish').hidden = true;
  enterCarousel();
}

const ui = {
  canvas: $('stage'),
  prompt(text) {
    $('prompt').hidden = !text;
    $('promptText').textContent = text ?? '';
  },
  playHud(on) {
    $('backBtn').hidden = !on;
    $('tools').hidden = !on;
    if (!on) $('progress').textContent = '';
  },
  progress(text) {
    $('progress').textContent = text;
  },
  bumpKiss() {
    $('kissCount').textContent = save.kisses;
    gsap.fromTo('#counter', { scale: 1.24, rotation: -3 }, { scale: 1, rotation: 0, duration: 0.42, ease: 'back.out(3)', overwrite: true });
  },
  finish({ title, text }) {
    $('finishTitle').textContent = title;
    $('finishText').textContent = text;
    $('finish').hidden = false;
    gsap.from('#finish', { y: 40, opacity: 0, duration: 0.5, ease: 'back.out(1.6)', clearProps: 'all' });
    gsap.from('#finish .stamp', { scale: 2.4, opacity: 0, duration: 0.3, delay: 0.3, ease: 'power3.in', clearProps: 'all' });
  },
};

function setMusicPanel(open) {
  $('musicPanel').style.top = `${$('hud').getBoundingClientRect().bottom + 6}px`;
  $('musicPanel').setAttribute('aria-hidden', String(!open));
  $('musicBtn').setAttribute('aria-expanded', String(open));
}

function musicNote(text) {
  $('musicNote').hidden = !text;
  $('musicNote').textContent = text ?? '';
}

function wireUi() {
  $('kissCount').textContent = save.kisses;
  $('prevBox').onclick = () => goTo(focus - 1);
  $('nextBox').onclick = () => goTo(focus + 1);
  $('openBox').onclick = () => {
    wakeSound();
    pickBox();
  };
  $('backBtn').onclick = leaveSession;
  $('finishBtn').onclick = leaveSession;
  $('photoBtn').onclick = () => ($('photoView').hidden = false);
  $('photoClose').onclick = () => ($('photoView').hidden = true);
  $('soundBtn').onclick = () => {
    const on = toggleSound();
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundBtn').textContent = on ? 'Oyun sesi açık' : 'Oyun sesi kapalı';
  };
  $('skipBtn').onclick = () => music?.skip();
  $('bandBtn').onclick = () => {
    if (music) $('bandBtn').textContent = music.cycleMode();
  };
  $('musicBtn').onclick = () => setMusicPanel($('musicPanel').getAttribute('aria-hidden') === 'true');
  $('musicClose').onclick = () => setMusicPanel(false);
  $('shopBtn').onclick = openShop;
  $('counter').onclick = openShop;
  initShop(ui.bumpKiss);
  syncCoupons();

  const canvas = ui.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (carousel.active) carousel.drag = { x: e.clientX, y: e.clientY, f: carousel.f, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    const drag = carousel.drag;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 8) drag.moved = true;
    if (drag.moved) carousel.f = THREE.MathUtils.clamp(drag.f - dx / Math.min(size.w * 0.8, 520), -0.3, boxes.length - 0.7);
  });
  const release = () => {
    const drag = carousel.drag;
    carousel.drag = null;
    if (!drag || !carousel.active) return;
    if (drag.moved) {
      goTo(Math.round(carousel.f));
    } else {
      wakeSound();
      pickBox();
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => (carousel.drag = null));
  window.addEventListener('keydown', (e) => {
    if (!carousel.active) return;
    if (e.key === 'ArrowLeft') goTo(focus - 1);
    if (e.key === 'ArrowRight') goTo(focus + 1);
  });
}

let openedForBlock = false;

export function startTable() {
  $('hud').hidden = false;
  music = createMusic({
    onTrack: (name) => ($('trackName').textContent = name),
    onPlaying(on) {
      $('bars').classList.toggle('on', on);
      if (!on) return;
      musicNote(null);
      if (openedForBlock) setMusicPanel(false);
      openedForBlock = false;
    },
    onBlocked() {
      musicNote('Müziği başlatmak için videoya bir kez dokun');
      setMusicPanel(true);
      openedForBlock = true;
    },
    onFailed: () => musicNote('YouTube şu an açılmadı'),
  });
  gsap.set(document.getElementById('shade'), { opacity: 0 });
  enterCarousel();
  poseCarousel(0);
  lampOn();
  music.start();
}

if (import.meta.env.DEV) {
  window.__yapboz = { get session() { return session; }, goTo, pickBox, save, ui, renderer, scene, camera, music: () => music };
}
