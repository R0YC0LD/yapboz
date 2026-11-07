import * as THREE from 'three';
import { renderer } from './stage.js';

export const BOX_H = 1.5;
export const WALL = 0.12;
const LID_RIM = 0.85;
const INK = '#241510', PAPER = '#f4e9d6', RED = '#c4202f', PALM = '#2f5d45';

export const boxSize = (p) => (p.rows > p.cols ? { w: 5.9, d: 7.5 } : { w: 7.5, d: 5.9 });

function coverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export function kissPath(ctx, x, y, width, angle = 0) {
  const s = width / 120;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.translate(-60, -40);
  ctx.fill(new Path2D('M6 39C20 25 36 10 49 11c6 .5 9 6 11 8 2-2 5-7.500 11-8 13-1 29 14 43 28-17-5-36-3-54-1-18-2-37-4-54 1Z'));
  ctx.fill(new Path2D('M6 42c17 1 36 3 54 5 18-2 37-4 54-5-13 19-33 31-54 31S19 61 6 42Z'));
  ctx.restore();
}

export function paintCover(canvas, p, img, number, total, finished) {
  const portrait = p.rows > p.cols;
  const W = canvas.width = 768;
  const H = canvas.height = Math.round(W * (portrait ? 7.66 / 6.06 : 6.06 / 7.66));
  const ctx = canvas.getContext('2d');
  const u = W / 100;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, 9 * u);
  ctx.fillStyle = PAPER;
  ctx.font = `800 ${4.4 * u}px Fraunces, Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Tuğba & Onur', 3 * u, 4.7 * u);
  ctx.textAlign = 'right';
  ctx.font = `600 ${3 * u}px "Bricolage Grotesque", sans-serif`;
  ctx.fillText(`Kutu ${number} / ${total}`, W - 3 * u, 4.7 * u);
  ctx.textAlign = 'left';

  const footer = 15 * u;
  const px = 3 * u, py = 11 * u, pw = W - 6 * u, ph = H - py - footer;
  coverImage(ctx, img, px, py, pw, ph);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  ctx.fillStyle = INK;
  ctx.font = `800 ${5.8 * u}px Fraunces, Georgia, serif`;
  let size = 5.8;
  while (ctx.measureText(p.title).width > W - 30 * u && size > 3) {
    size -= 0.2;
    ctx.font = `800 ${size * u}px Fraunces, Georgia, serif`;
  }
  ctx.fillText(p.title, 3 * u, H - 9.4 * u);
  ctx.font = `600 ${3 * u}px "Bricolage Grotesque", sans-serif`;
  ctx.fillStyle = PALM;
  ctx.fillText(`${p.cols} × ${p.rows} ızgara, oynaması kolay`, 3 * u, H - 4.2 * u);

  const cx = W - 12.5 * u, cy = H - 9.5 * u, radius = 10.5 * u;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rr = i % 2 ? radius : radius * 0.9;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.font = `800 ${7.6 * u}px Fraunces, Georgia, serif`;
  ctx.fillText(String(p.cols * p.rows), cx, cy - 1.4 * u);
  ctx.font = `600 ${2.9 * u}px "Bricolage Grotesque", sans-serif`;
  ctx.fillText('PARÇA', cx, cy + 4.5 * u);
  ctx.textAlign = 'left';

  if (finished) {
    ctx.fillStyle = 'rgba(196, 32, 47, .9)';
    kissPath(ctx, W * 0.74, py + 15 * u, 28 * u, -0.25);
  }
}

function sideCanvas(p) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, 1024, 18);
  ctx.fillRect(0, 110, 1024, 18);
  ctx.fillStyle = INK;
  ctx.font = '800 54px Fraunces, Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.title, 34, 66, 660);
  ctx.textAlign = 'right';
  ctx.font = '600 38px "Bricolage Grotesque", sans-serif';
  ctx.fillText(`${p.cols * p.rows} parça`, 990, 66);
  return canvas;
}

function canvasMaterial(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.gl.capabilities.getMaxAnisotropy();
  return new THREE.MeshStandardMaterial({ map, roughness: 0.5 });
}

export function buildBox(p, img, number, total, finished) {
  const { w, d } = boxSize(p);
  const group = new THREE.Group();

  const inner = new THREE.MeshStandardMaterial({ color: '#efe3cd', roughness: 0.82 });
  const outer = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55 });
  const lidEdge = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.6 });

  const add = (parent, sx, sy, sz, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const tray = new THREE.Group();
  group.add(tray);
  add(tray, w, WALL, d, 0, WALL / 2, 0, inner);
  add(tray, w, BOX_H, WALL, 0, BOX_H / 2, -(d - WALL) / 2, [outer, outer, inner, outer, inner, outer]);
  add(tray, w, BOX_H, WALL, 0, BOX_H / 2, (d - WALL) / 2, [outer, outer, inner, outer, outer, inner]);
  add(tray, WALL, BOX_H, d, -(w - WALL) / 2, BOX_H / 2, 0, [inner, outer, inner, outer, outer, outer]);
  add(tray, WALL, BOX_H, d, (w - WALL) / 2, BOX_H / 2, 0, [outer, inner, inner, outer, outer, outer]);

  const coverCanvas = document.createElement('canvas');
  paintCover(coverCanvas, p, img, number, total, finished);
  const cover = canvasMaterial(coverCanvas);
  const side = canvasMaterial(sideCanvas(p));

  const lid = new THREE.Group();
  lid.position.y = BOX_H + 0.05;
  group.add(lid);
  const lw = w + 0.16, ld = d + 0.16, t = 0.07;
  add(lid, lw, 0.08, ld, 0, 0, 0, [lidEdge, lidEdge, cover, lidEdge, lidEdge, lidEdge]);
  const rimY = -LID_RIM / 2;
  add(lid, lw, LID_RIM, t, 0, rimY, ld / 2 - t / 2, [lidEdge, lidEdge, lidEdge, lidEdge, side, lidEdge]);
  add(lid, lw, LID_RIM, t, 0, rimY, -ld / 2 + t / 2, [lidEdge, lidEdge, lidEdge, lidEdge, lidEdge, side]);
  add(lid, t, LID_RIM, ld, lw / 2 - t / 2, rimY, 0, [side, lidEdge, lidEdge, lidEdge, lidEdge, lidEdge]);
  add(lid, t, LID_RIM, ld, -lw / 2 + t / 2, rimY, 0, [lidEdge, side, lidEdge, lidEdge, lidEdge, lidEdge]);

  return {
    group,
    tray,
    lid,
    size: { w, d },
    repaint(done) {
      paintCover(coverCanvas, p, img, number, total, done);
      cover.map.needsUpdate = true;
    },
  };
}
