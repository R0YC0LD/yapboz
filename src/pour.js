import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BOX_H, WALL } from './box.js';
import { THICK } from './pieces.js';
import { sfx } from './sound.js';

const STEP = 1 / 60;
const MAX_TILT = 1.9;

let ready;
export const initPhysics = () => (ready ??= RAPIER.init());

const axisX = new THREE.Vector3(1, 0, 0);

export function createPour({ pieces, box, origin, limits, onImpact }) {
  const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
  const { w, d } = box.size;

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const ground = (hx, hy, hz, x, y, z) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.62).setRestitution(0.1), fixed);
  ground(80, 1, 80, 0, -1, 0);
  ground(1, 12, 40, -limits.x - 1, 12, 0);
  ground(1, 12, 40, limits.x + 1, 12, 0);
  ground(40, 12, 1, 0, 12, limits.front + 1);
  ground(40, 12, 1, 0, 12, limits.back - 1);

  const carrier = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(origin.x, origin.y, origin.z));
  const wall = (hx, hy, hz, x, y, z) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.14).setRestitution(0.05), carrier);
  const thick = WALL / 2 + 0.1;
  wall(w / 2, thick, d / 2, 0, WALL - thick, 0);
  wall(w / 2 + 0.2, BOX_H / 2, thick, 0, BOX_H / 2, -d / 2 + WALL - thick);
  wall(w / 2 + 0.2, BOX_H / 2, thick, 0, BOX_H / 2, d / 2 - WALL + thick);
  wall(thick, BOX_H / 2, d / 2, -w / 2 + WALL - thick, BOX_H / 2, 0);
  wall(thick, BOX_H / 2, d / 2, w / 2 - WALL + thick, BOX_H / 2, 0);

  const shrink = Math.min(1, Math.sqrt(63 / pieces.length));
  const cell = 1.02 * shrink;
  const across = Math.max(1, Math.floor((w - 0.5) / cell));
  const along = Math.max(1, Math.floor((d - 0.5) / cell));
  const layerCount = across * along;
  const bodies = pieces.map((piece, i) => {
    const layer = Math.floor(i / layerCount);
    const slot = i % layerCount;
    const x = origin.x + ((slot % across) + 0.5 - across / 2) * cell + (Math.random() - 0.5) * 0.06;
    const z = origin.z + (Math.floor(slot / across) + 0.5 - along / 2) * cell + (Math.random() - 0.5) * 0.06;
    const y = WALL + 0.2 + layer * 0.24 * shrink;
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.5);
    if (Math.random() < 0.55) yaw.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation({ x: yaw.x, y: yaw.y, z: yaw.z, w: yaw.w })
        .setLinearDamping(0.06)
        .setAngularDamping(0.5)
        .setCcdEnabled(pieces.length <= 100),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.46 * shrink, (THICK / 2) * shrink, 0.46 * shrink).setFriction(0.32).setRestitution(0.12).setDensity(1), body);
    piece.mesh.scale.setScalar(shrink);
    piece.mesh.position.set(x, y, z);
    piece.mesh.quaternion.copy(yaw);
    return { piece, body };
  });

  const pivot = new THREE.Vector3(0, 0, d / 2);
  const offset = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const axisZ = new THREE.Vector3(0, 0, 1);
  let theta = 0;
  let target = 0;
  let liftNow = 0;
  let liftTarget = 0;
  let accumulator = 0;
  let shakeClock = 0;
  let shakePower = 0;
  let shakeTarget = 0;
  let elapsed = 0;

  function poseCarrier(dt) {
    const speed = 1.7;
    theta += THREE.MathUtils.clamp(target - theta, -speed * dt, speed * dt);
    liftNow += (liftTarget - liftNow) * Math.min(dt * 6, 1);
    const lift = liftNow * 3.2;
    shakeClock += dt;
    shakePower += (shakeTarget - shakePower) * Math.min(dt * 12, 1);
    const wobble = theta > 1.5 ? Math.sin(shakeClock * 34) * 0.05 : 0;
    const swing = Math.sin(shakeClock * 17) * shakePower;
    quat.setFromAxisAngle(axisX, theta + wobble);
    quat.premultiply(roll.setFromAxisAngle(axisZ, swing * 0.09));
    offset.set(0, 0, -pivot.z).applyAxisAngle(axisX, theta + wobble).add(pivot);
    const x = origin.x + offset.x + swing * 0.22;
    const y = origin.y + offset.y + lift + Math.abs(Math.sin(shakeClock * 13)) * shakePower * 0.12;
    const z = origin.z + offset.z;
    carrier.setNextKinematicTranslation({ x, y, z });
    carrier.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    box.group.position.set(x, y, z);
    box.group.quaternion.copy(quat);
  }

  function sync() {
    let motion = 0;
    for (const { piece, body } of bodies) {
      const t = body.translation();
      const r = body.rotation();
      piece.mesh.position.set(t.x, t.y, t.z);
      piece.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (theta > 0.2 || shakePower > 0.05) {
        const v = body.linvel();
        motion += Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
        if (theta < 1.6) body.wakeUp();
        if (t.y < 0.5 && piece.fallSpeed < -9) onImpact?.(piece.mesh.position, -piece.fallSpeed);
        piece.fallSpeed = v.y;
      }
    }
    return motion / Math.max(bodies.length, 1);
  }

  for (let i = 0; i < 50; i++) world.step();
  sync();

  return {
    setTilt(amount) {
      target = amount * MAX_TILT;
    },
    setLift(amount) {
      liftTarget = amount;
    },
    setShake(amount) {
      shakeTarget = amount;
    },
    update(dt) {
      accumulator = Math.min(accumulator + dt, STEP * 3);
      while (accumulator >= STEP) {
        poseCarrier(STEP);
        world.step();
        accumulator -= STEP;
      }
      const motion = sync();
      if (motion > 1.5) sfx.rattle(Math.min(motion / 16, 0.75));
      if (target >= MAX_TILT * 0.98) elapsed += dt;
    },
    settled() {
      if (elapsed > 7) return true;
      if (elapsed < 1) return false;
      return bodies.every(({ body }) => {
        const v = body.linvel();
        return body.translation().y < 1.1 && Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 2.5;
      });
    },
    dispose() {
      world.free();
    },
  };
}
