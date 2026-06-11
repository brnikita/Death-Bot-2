import * as THREE from 'three';

const SENS = 0.0022;
const PITCH_MIN = -1.25;
const PITCH_MAX = 0.95;

export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0; // forward = -z: player spawns at +z looking toward the arena center
    this.pitch = 0.22;
    this.dist = 6.4;
    this.curDist = 6.4;
    this.trauma = 0;
    this.fov = 62;
    this.aiming = false;
    this.sprinting = false;
    this._pivot = new THREE.Vector3();
    this._noiseT = 0;
  }

  addTrauma(t) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  pitchKick(amount) {
    this.pitch = THREE.MathUtils.clamp(this.pitch - amount, PITCH_MIN, PITCH_MAX);
  }

  applyMouse(dx, dy) {
    this.yaw -= dx * SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * SENS, PITCH_MIN, PITCH_MAX);
  }

  /** Horizontal forward direction the player should move/face along. */
  forwardDir(out) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  update(dt, playerPos, playerCollider) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this._noiseT += dt * 30;

    const targetDist = this.aiming ? 3.8 : 6.4;
    this.dist = THREE.MathUtils.damp(this.dist, targetDist, 10, dt);

    // pivot: above the shoulders, offset to the right of view
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    // strong shoulder offset keeps the hero's body clear of the crosshair line
    this._pivot.copy(playerPos).add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(right, this.aiming ? 1.25 : 0.95);

    // desired camera offset (spherical around pivot)
    const cp = Math.cos(this.pitch);
    const offsetDir = new THREE.Vector3(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp
    ); // points from pivot away from look direction

    // collision: sweep a sphere from pivot toward desired position
    let dist = this.dist;
    const toi = this.physics.sweepSphere(
      { x: this._pivot.x, y: this._pivot.y, z: this._pivot.z },
      { x: offsetDir.x, y: offsetDir.y, z: offsetDir.z },
      this.dist,
      0.22,
      playerCollider
    );
    if (toi !== null && toi < dist) dist = Math.max(0.35, toi - 0.04);
    this.curDist = Math.min(THREE.MathUtils.damp(this.curDist, dist, 18, dt), dist);

    const camPos = this._pivot.clone().addScaledVector(offsetDir, this.curDist);
    this.camera.position.copy(camPos);

    // camera pressed against a wall ends up inside the character — hide it
    if (this.playerModel) this.playerModel.visible = this.curDist > 1.15;

    // look slightly above pivot forward
    const lookTarget = this._pivot.clone().addScaledVector(fwd, 4).add(new THREE.Vector3(0, Math.sin(this.pitch) * -4, 0));
    this.camera.lookAt(lookTarget);

    // screen shake (rotational noise scaled by trauma^2)
    const sh = this.trauma * this.trauma;
    if (sh > 0.0001) {
      this.camera.rotation.x += Math.sin(this._noiseT * 1.3) * 0.05 * sh;
      this.camera.rotation.y += Math.cos(this._noiseT * 1.7) * 0.05 * sh;
      this.camera.rotation.z += Math.sin(this._noiseT * 1.1) * 0.03 * sh;
    }

    // FOV
    const targetFov = this.aiming ? 50 : this.sprinting ? 70 : 62;
    this.fov = THREE.MathUtils.damp(this.fov, targetFov, 12, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
