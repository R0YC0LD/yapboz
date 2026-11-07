import * as THREE from 'three';
import { textures } from './stage.js';

export const THICK = 0.16;

const TAB = 0.1;
const JITTER = 0.035;

function seeded(text) {
  let h = 1779033703;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t ^ (t >>> 14);
    return ((t ^ (t >>> 9)) >>> 0) / 4294967296;
  };
}

function tabEdge(rand, ax, ay, bx, by) {
  const j = () => (rand() - 0.5) * 2 * JITTER;
  const flip = rand() < 0.5 ? 1 : -1;
  const a = j(), b = j(), c = j(), d = j(), e = j();
  const t = TAB;
  const ux = bx - ax, uy = by - ay;
  const point = (l, w) => [ax + ux * l - uy * w * flip, ay + uy * l + ux * w * flip];
  return {
    straight: false,
    pts: [
      point(0, 0), point(0.2, a), point(0.5 + b + d, -t + c), point(0.5 - t + b, t + c),
      point(0.5 - 2 * t + b - d, 3 * t + c), point(0.5 + 2 * t + b - d, 3 * t + c), point(0.5 + t + b, t + c),
      point(0.5 + b + d, -t + c), point(0.8, e), point(1, 0),
    ],
  };
}

const lineEdge = (ax, ay, bx, by) => ({ straight: true, pts: [[ax, ay], [bx, by]] });
const reversed = (edge) => ({ straight: edge.straight, pts: [...edge.pts].reverse() });

function buildEdges(p) {
  const rand = seeded(p.id);
  const across = [];
  const down = [];
  for (let r = 0; r <= p.rows; r++) {
    across[r] = [];
    for (let c = 0; c < p.cols; c++) {
      const border = r === 0 || r === p.rows;
      across[r][c] = (border ? lineEdge : tabEdge.bind(null, rand))(c, r, c + 1, r);
    }
  }
  for (let r = 0; r < p.rows; r++) {
    down[r] = [];
    for (let c = 0; c <= p.cols; c++) {
      const border = c === 0 || c === p.cols;
      down[r][c] = (border ? lineEdge : tabEdge.bind(null, rand))(c, r, c, r + 1);
    }
  }
  return { across, down };
}

function traceShape(shape, edges, cx, cy) {
  const to = ([x, y]) => [x - cx, cy - y];
  shape.moveTo(...to(edges[0].pts[0]));
  for (const edge of edges) {
    if (edge.straight) {
      shape.lineTo(...to(edge.pts[1]));
      continue;
    }
    for (let i = 1; i < 10; i += 3) shape.bezierCurveTo(...to(edge.pts[i]), ...to(edge.pts[i + 1]), ...to(edge.pts[i + 2]));
  }
}

export function drawOutlines(ctx, p, scale) {
  const { across, down } = buildEdges(p);
  const stroke = (edge) => {
    if (edge.straight) return;
    ctx.beginPath();
    ctx.moveTo(edge.pts[0][0] * scale, edge.pts[0][1] * scale);
    for (let i = 1; i < 10; i += 3) {
      ctx.bezierCurveTo(...edge.pts[i].map((v) => v * scale), ...edge.pts[i + 1].map((v) => v * scale), ...edge.pts[i + 2].map((v) => v * scale));
    }
    ctx.stroke();
  };
  across.flat().forEach(stroke);
  down.flat().forEach(stroke);
}

export function buildPuzzle(p, photo) {
  const { across, down } = buildEdges(p);
  const large = p.cols * p.rows > 120;

  const front = new THREE.MeshStandardMaterial({
    map: photo,
    normalMap: textures.linenN,
    normalScale: new THREE.Vector2(0.14, 0.14),
    roughness: 0.56,
  });
  const back = new THREE.MeshStandardMaterial({ color: '#8f8d84', roughness: 0.92 });
  const side = new THREE.MeshStandardMaterial({ color: '#c8b596', roughness: 0.85 });
  const materials = [front, back, side];

  const pieces = [];
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const cx = c + 0.5, cy = r + 0.5;
      const shape = new THREE.Shape();
      traceShape(shape, [across[r][c], down[r][c + 1], reversed(across[r + 1][c]), reversed(down[r][c])], cx, cy);

      const bevel = 0.028;
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: THICK - bevel * 2,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: large ? 1 : 2,
        curveSegments: large ? 4 : 7,
        UVGenerator: {
          generateTopUV(_g, v, a, b, d) {
            const uv = (i) => new THREE.Vector2((v[i * 3] + cx) / p.cols, 1 - (cy - v[i * 3 + 1]) / p.rows);
            return [uv(a), uv(b), uv(d)];
          },
          generateSideWallUV() {
            return [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
          },
        },
      });
      const [caps] = geometry.groups;
      geometry.clearGroups();
      geometry.addGroup(0, caps.count / 2, 1);
      geometry.addGroup(caps.count / 2, caps.count / 2, 0);
      geometry.addGroup(caps.count, geometry.attributes.position.count - caps.count, 2);
      geometry.translate(0, 0, -(THICK / 2 - bevel));
      geometry.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pieces.push({
        index: pieces.length,
        col: c,
        row: r,
        mesh,
        shape,
        target: new THREE.Vector3(cx - p.cols / 2, 0, cy - p.rows / 2),
        placed: false,
        edge: c === 0 || r === 0 || c === p.cols - 1 || r === p.rows - 1,
      });
    }
  }
  return {
    pieces,
    dispose() {
      pieces.forEach((piece) => piece.mesh.geometry.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
