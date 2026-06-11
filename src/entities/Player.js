import * as THREE from 'three';
import { RAPIER } from '../core/Physics.js';

const UPPER_RE = /(spine|chest|head|arm|wrist|hand|slot)/i;

const RUN_SPEED = 5.2;
const SPRINT_SPEED = 7.4;
const AIM_SPEED = 3.0;
const ACCEL = 30;
const JUMP_VEL = 8.6;
const GRAVITY = 22;
const FIRE_INTERVAL = 0.115;
const MAG_SIZE = 30;
const RELOAD_TIME = 1.7;
const DAMAGE = 26;

function buildBlaster() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: 0.85, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.62), dark);
  body.position.z = -0.18;
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.42, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.045, -0.66);
  g.add(barrel);
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.06, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x33e8ff, emissiveIntensity: 3.5 })
  );
  core.position.set(0.052, 0.02, -0.2);
  g.add(core);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.2), dark);
  stock.position.set(0, -0.02, 0.16);
  g.add(stock);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -0.9);
  g.add(muzzle);
  return { gun: g, muzzle };
}

export class Player {
  constructor(gltf, scene, physics, camera, vfx, audio, hud) {
    this.scene = scene;
    this.physics = physics;
    this.cameraRig = camera;
    this.vfx = vfx;
    this.audio = audio;
    this.hud = hud;

    this.hp = 100;
    this.maxHp = 100;
    this.dead = false;
    this.ammo = MAG_SIZE;
    this.reloadT = 0;
    this.fireT = 0;
    this.sinceFire = 99;
    this.sinceDamage = 99;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.velY = 0;
    this.grounded = false;
    this.landT = 0;
    this.jumpPhase = null; // 'start' | 'air' | 'land'
    this.footT = 0;
    this.onDeath = null;

    // ---------- visual ----------
    this.model = gltf.scene;
    this.model.scale.setScalar(1.0);
    this.restyleAsRobot();
    this.root = new THREE.Group();
    this.root.add(this.model);
    scene.add(this.root);

    // weapon in right hand slot
    const { gun, muzzle } = buildBlaster();
    this.muzzle = muzzle;
    // GLTFLoader strips dots from node names: 'handslot.r' -> 'handslotr'
    let slot = null;
    this.model.traverse((o) => {
      if (!slot && /^handslot\.?r$/i.test(o.name)) slot = o;
    });
    if (slot) slot.add(gun);
    else this.model.add(gun);
    gun.scale.setScalar(1.8); // KayKit style: chunky oversized weapon reads well on chibi rigs
    gun.rotation.set(0, -Math.PI / 2, 0); // slot's forward axis is +X; our barrel is -Z

    // ---------- animation ----------
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    this.actions = {};
    this.baseName = null;
    this.upperName = null;
    this.upperActive = false;
    this.setBase('Idle');

    // ---------- physics ----------
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.2, 24);
    this.body = physics.world.createRigidBody(desc);
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.34).setTranslation(0, 0.9, 0),
      this.body
    );
    this.controller = physics.world.createCharacterController(0.06);
    this.controller.enableAutostep(0.45, 0.25, true);
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    this.pos = new THREE.Vector3(0, 1.2, 24);
    this.vel = new THREE.Vector3();
    this.faceYaw = Math.PI; // facing -z at spawn... model faces +z by default; we rotate
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  setSpawn(p) {
    this.pos.copy(p);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
  }

  restyleAsRobot() {
    const armor = new THREE.MeshStandardMaterial({
      color: 0x707d8a,
      metalness: 0.88,
      roughness: 0.34,
      envMapIntensity: 1.1,
    });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.65, roughness: 0.55 });
    // the robot's "face" glows cyan through the helmet slit
    const face = new THREE.MeshStandardMaterial({
      color: 0x05161a,
      emissive: 0x22d8ff,
      emissiveIntensity: 1.6,
      metalness: 0.2,
      roughness: 0.4,
    });
    const cape = new THREE.MeshStandardMaterial({ color: 0x47201c, metalness: 0.0, roughness: 0.95 });
    const HIDE = /shield|sword|offhand/i;

    this.model.traverse((o) => {
      if (HIDE.test(o.name)) o.visible = false;
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      if (/cape/i.test(o.name)) o.material = cape;
      else if (/head/i.test(o.name)) o.material = face;
      else if (/pete|body/i.test(o.name)) o.material = carbon;
      else o.material = armor;
    });
    // chest core
    const chest = this.model.getObjectByName('chest');
    if (chest) {
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x33e8ff, emissiveIntensity: 3 })
      );
      core.rotation.x = Math.PI / 2;
      core.position.set(0, 0.22, 0.18);
      chest.add(core);
    }
  }

  // ----- animation helpers: full clips, plus split variants for run+shoot -----
  getAction(clipName, variant = 'full') {
    const key = `${clipName}__${variant}`;
    if (this.actions[key]) return this.actions[key];
    const src = this.clips[clipName];
    if (!src) return null;
    let clip = src;
    if (variant === 'lower') {
      clip = new THREE.AnimationClip(key, src.duration, src.tracks.filter((t) => !UPPER_RE.test(t.name)));
    } else if (variant === 'upper') {
      clip = new THREE.AnimationClip(key, src.duration, src.tracks.filter((t) => UPPER_RE.test(t.name)));
    }
    const action = this.mixer.clipAction(clip);
    this.actions[key] = action;
    return action;
  }

  setBase(name, fade = 0.16, timeScale = 1) {
    const variant = this.upperActive ? 'lower' : 'full';
    const key = `${name}__${variant}`;
    if (this.baseKey === key) {
      const a = this.actions[key];
      if (a) a.timeScale = timeScale;
      return;
    }
    const next = this.getAction(name, variant);
    if (!next) return;
    next.reset();
    next.timeScale = timeScale;
    if (/Jump_Start|Jump_Land/.test(name)) {
      next.setLoop(THREE.LoopOnce);
      next.clampWhenFinished = true;
    }
    next.play();
    if (this.baseKey && this.actions[this.baseKey]) {
      next.crossFadeFrom(this.actions[this.baseKey], fade, false);
    }
    this.baseKey = key;
    this.baseName = name;
  }

  setUpper(name, fade = 0.12, once = false) {
    if (this.upperName === name) return;
    const prev = this.upperName ? this.getAction(this.upperName, 'upper') : null;
    if (name) {
      const a = this.getAction(name, 'upper');
      if (a) {
        a.reset();
        if (once) {
          a.setLoop(THREE.LoopOnce);
          a.clampWhenFinished = true;
        } else {
          a.setLoop(THREE.LoopRepeat);
        }
        a.play();
        if (prev) a.crossFadeFrom(prev, fade, false);
        else a.fadeIn(fade);
      }
    } else if (prev) {
      prev.fadeOut(fade);
    }
    this.upperName = name;
  }

  /** Switch base between full/lower variants when upper-body layer toggles. */
  setUpperActive(on) {
    if (this.upperActive === on) return;
    this.upperActive = on;
    const cur = this.baseName;
    if (cur) {
      const oldKey = this.baseKey;
      this.baseKey = null;
      this.setBase(cur, 0.1);
      if (oldKey && this.actions[oldKey]) this.actions[oldKey].fadeOut(0.1);
    }
  }

  takeDamage(dmg, fromPos) {
    if (this.dead) return;
    this.hp -= dmg;
    this.sinceDamage = 0;
    this.hud.damageFlash();
    this.hud.setHealth(this.hp / this.maxHp);
    this.cameraRig.addTrauma(0.35);
    this.audio.play2d('player_hurt', { volume: 0.7 });
    if (this.hp <= 0) {
      this.dead = true;
      this.setUpperActive(false);
      this.setUpper(null);
      this.setBase('Death_A', 0.2);
      const a = this.actions[this.baseKey];
      if (a) {
        a.setLoop(THREE.LoopOnce);
        a.clampWhenFinished = true;
      }
      if (this.onDeath) this.onDeath();
    }
  }

  fixedUpdate(dt, input, enemyLookup) {
    if (this.dead) {
      this.mixer.update(dt);
      return;
    }
    if (this.posing) {
      // debug: freeze gameplay logic, keep playing whatever anim was set manually
      this.mixer.update(dt);
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.faceYaw;
      return;
    }

    const cam = this.cameraRig;
    cam.aiming = input.aimHeld;

    // ---- movement input in camera space ----
    let ix = 0;
    let iz = 0;
    if (input.isDown('KeyW')) iz += 1;
    if (input.isDown('KeyS')) iz -= 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const sprint = input.isDown('ShiftLeft') && iz > 0 && !input.aimHeld && this.reloadT <= 0;
    cam.sprinting = sprint && moving;

    const fwd = cam.forwardDir(this._tmp);
    const right = this._tmp2.set(-fwd.z, 0, fwd.x);
    const wishDir = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
    if (wishDir.lengthSq() > 0) wishDir.normalize();

    const maxSpeed = input.aimHeld ? AIM_SPEED : sprint ? SPRINT_SPEED : RUN_SPEED;
    const targetVel = wishDir.multiplyScalar(moving ? maxSpeed : 0);
    this.vel.x = THREE.MathUtils.damp(this.vel.x, targetVel.x, ACCEL / 4, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, targetVel.z, ACCEL / 4, dt);

    // ---- jump ----
    this.coyote = this.grounded ? 0.13 : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.wasPressed('Space') ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velY = JUMP_VEL;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.grounded = false;
      this.jumpPhase = 'start';
      this.setBase('Jump_Start', 0.08);
      setTimeout(() => {
        if (this.jumpPhase === 'start') {
          this.jumpPhase = 'air';
        }
      }, 200);
    }
    this.velY -= GRAVITY * dt;
    if (this.grounded && this.velY < -3) this.velY = -3;

    // ---- move through rapier character controller ----
    const move = {
      x: this.vel.x * dt,
      y: this.velY * dt,
      z: this.vel.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, move);
    const corrected = this.controller.computedMovement();
    this.pos.x += corrected.x;
    this.pos.y += corrected.y;
    this.pos.z += corrected.z;
    // airTime debounces grounded flicker so land/air anims never loop
    const wasAirborneLong = this.airTime > 0.12;
    // computedGrounded is unreliable while the controller keeps its offset gap —
    // back it up with a short downward ray (skipped while ascending after a jump)
    let rayGrounded = false;
    if (this.velY <= 0.5) {
      rayGrounded = !!this.physics.raycast(
        { x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z },
        { x: 0, y: -1, z: 0 },
        0.42,
        this.collider
      );
    }
    this.grounded = this.controller.computedGrounded() || rayGrounded;
    this.airTime = this.grounded ? 0 : (this.airTime || 0) + dt;
    if (this.grounded && wasAirborneLong) {
      this.jumpPhase = 'land';
      this.landT = 0.22;
      this.cameraRig.addTrauma(0.08);
      this.audio.play3d('footstep', this.pos, { volume: 0.8, rate: 0.8 });
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });

    // ---- facing ----
    const combat = input.aimHeld || this.sinceFire < 0.5 || this.reloadT > 0;
    let targetYaw;
    if (combat) {
      targetYaw = Math.atan2(-fwd.x, -fwd.z) + Math.PI;
    } else if (moving) {
      targetYaw = Math.atan2(this.vel.x, this.vel.z);
    } else {
      targetYaw = this.faceYaw;
    }
    let dy = targetYaw - this.faceYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.faceYaw += dy * Math.min(1, dt * 13);

    // ---- shooting / reload ----
    this.fireT -= dt;
    this.sinceFire += dt;
    this.sinceDamage += dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = MAG_SIZE;
        this.hud.setAmmo(this.ammo, false);
      }
    }
    if ((input.wasPressed('KeyR') || (input.fireHeld && this.ammo === 0)) && this.reloadT <= 0 && this.ammo < MAG_SIZE) {
      this.reloadT = RELOAD_TIME;
      this.hud.setAmmo(0, true);
      this.audio.play2d('reload', { volume: 0.8 });
      this.setUpperActive(true);
      this.setUpper('2H_Ranged_Reload', 0.1, true);
    }

    if (input.fireHeld && this.fireT <= 0 && this.ammo > 0 && this.reloadT <= 0) {
      this.fireT = FIRE_INTERVAL;
      this.shoot(input, enemyLookup);
    }

    // ---- upper body layer ----
    if (this.reloadT > 0) {
      // reload anim already set
    } else if (this.sinceFire < 0.25) {
      this.setUpperActive(true);
      this.setUpper('2H_Ranged_Shooting');
    } else if (input.aimHeld) {
      this.setUpperActive(true);
      this.setUpper('2H_Ranged_Aiming');
    } else if (this.sinceFire > 0.6) {
      this.setUpper(null);
      this.setUpperActive(false);
    }

    // ---- base locomotion anim ----
    if (this.jumpPhase === 'land') {
      this.landT -= dt;
      this.setBase('Jump_Land', 0.06);
      if (this.landT <= 0) this.jumpPhase = null;
    } else if (!this.grounded && this.airTime > 0.12 && this.jumpPhase !== 'start') {
      this.jumpPhase = 'air';
      this.setBase('Jump_Idle', 0.14);
    } else if (this.grounded && (this.jumpPhase === null || this.jumpPhase === 'air')) {
      this.jumpPhase = null;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed < 0.4) {
        this.setBase('Idle', 0.2);
      } else {
        // local move direction relative to facing
        const localF = this.vel.x * Math.sin(this.faceYaw) + this.vel.z * Math.cos(this.faceYaw);
        const localR = this.vel.x * Math.cos(this.faceYaw) - this.vel.z * Math.sin(this.faceYaw);
        let anim = 'Running_A';
        let ts = THREE.MathUtils.clamp(speed / RUN_SPEED, 0.5, 1.45);
        if (combat && Math.abs(localR) > Math.abs(localF) * 1.2) {
          anim = localR > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
        } else if (localF < -0.5) {
          anim = 'Walking_Backwards';
          ts = THREE.MathUtils.clamp(speed / 2.4, 0.6, 1.5);
        }
        this.setBase(anim, 0.16, ts);
      }

      // footsteps
      const speedNow = Math.hypot(this.vel.x, this.vel.z);
      if (speedNow > 1.2) {
        this.footT -= dt * speedNow;
        if (this.footT <= 0) {
          this.footT = 2.05;
          this.audio.play3d('footstep', this.pos, { volume: 0.35, rate: 1.1 });
        }
      }
    }

    if (this.jumpPhase === 'start' && this.velY < 2) this.jumpPhase = 'air';

    // ---- health regen ----
    if (this.sinceDamage > 5 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 6 * dt);
      this.hud.setHealth(this.hp / this.maxHp);
    }

    this.mixer.update(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.faceYaw;
  }

  shoot(input, enemyLookup) {
    this.ammo--;
    this.hud.setAmmo(this.ammo, false);
    this.sinceFire = 0;

    const cam = this.cameraRig.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());

    // spread
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    let spread = 0.006 + (moving ? 0.014 : 0) + (this.grounded ? 0 : 0.025);
    if (input.aimHeld) spread *= 0.45;
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();

    const hit = this.physics.raycast(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
      120,
      this.collider
    );

    const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
    let end;
    if (hit) {
      end = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      const enemy = enemyLookup(hit.collider.handle);
      if (enemy) {
        enemy.takeDamage(DAMAGE, end, dir);
        this.hud.hitmarker();
        if (!enemy.isCrate) {
          this.vfx.burst(end, normal, 0x88ff66, 10, 3.5);
          this.audio.play3d('impact_zombie', end, { volume: 0.55 });
        }
      } else {
        this.vfx.burst(end, normal, 0xffaa44, 12, 4);
        this.audio.play3d('impact_metal', end, { volume: 0.4 });
      }
    } else {
      end = origin.clone().addScaledVector(dir, 120);
    }

    this.vfx.tracer(muzzlePos, end);
    this.vfx.muzzle(muzzlePos);
    this.audio.play3d('shot', muzzlePos, { volume: 0.75 });
    this.cameraRig.pitchKick(0.0095);
    this.cameraRig.addTrauma(0.06);
  }
}
