import * as THREE from 'three';
import { RAPIER } from '../core/Physics.js';

const UPPER_RE = /(spine|chest|head|arm|wrist|hand|slot)/i;

// К-250 ~2.2 м — заметно выше зомби, но не гигант (модель ×SIZE,
// физика и скорости масштабированы соответственно).
const SIZE = 1.3;
const RUN_SPEED = 6;
const SPRINT_SPEED = 8.8;
const AIM_SPEED = 3.6;
const ACCEL = 34;
const JUMP_VEL = 9.6;
const GRAVITY = 24;
const FIRE_INTERVAL = 0.115;
const MAG_SIZE = 30;
const RELOAD_TIME = 1.7;
const DAMAGE = 26;

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
    // ремкомплекты: подбираются с врагов/ящиков, активируются на Q
    this.kits = 1;
    this.maxKits = 3;
    this.repairT = 0;
    hud.setKits(this.kits, this.maxKits);
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
    this.model.scale.setScalar(1.15); // пропорции дроида собраны на этом масштабе
    this.buildDroid();
    this.model.scale.setScalar(1.15 * SIZE); // и затем увеличены целиком
    this.root = new THREE.Group();
    this.root.add(this.model);
    scene.add(this.root);

    // оружия нет — выстрелы идут из ладони правой руки
    this.muzzle = new THREE.Object3D();
    let hand = null;
    this.model.traverse((o) => {
      if (!hand && /^handr$/i.test(o.name)) hand = o;
    });
    if (hand) {
      this.muzzle.position.set(-0.12, 0, 0); // чуть за ладонь по оси руки
      hand.add(this.muzzle);
    } else {
      this.model.add(this.muzzle);
    }

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
      RAPIER.ColliderDesc.capsule(0.52 * SIZE, 0.32 * SIZE).setTranslation(0, 0.85 * SIZE, 0),
      this.body
    );
    this.controller = physics.world.createCharacterController(0.07);
    this.controller.enableAutostep(0.58, 0.28, true);
    this.controller.enableSnapToGround(0.5);
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

  /** Подбор ремкомплекта: в запас, при полном запасе — мгновенный ремонт. */
  collectRepair() {
    if (this.kits < this.maxKits) {
      this.kits++;
      this.hud.setKits(this.kits, this.maxKits);
      return true;
    }
    if (this.hp < this.maxHp - 0.5) {
      this.hp = Math.min(this.maxHp, this.hp + 25);
      this.hud.setHealth(this.hp / this.maxHp);
      return true;
    }
    return false; // некуда — оставляем лежать
  }

  /**
   * К-250: высокий худой дроид охраны — матово-чёрный корпус, куполообразная
   * голова с круглыми светящимися глазами, тонкие конечности с шарнирами.
   * Меши рыцаря скрываются, детали дроида крепятся прямо к костям скелета,
   * поэтому все анимации (бег, прыжок, стрельба) работают без изменений.
   */
  buildDroid() {
    const M = (o) => new THREE.MeshStandardMaterial(o);
    const body = M({ color: 0x121419, metalness: 0.6, roughness: 0.56 });
    const dark = M({ color: 0x0a0c0f, metalness: 0.5, roughness: 0.66 });
    const joint = M({ color: 0x555b62, metalness: 0.92, roughness: 0.3 });
    const accent = M({ color: 0x4f4839, metalness: 0.35, roughness: 0.7 });
    const eyeM = M({ color: 0x020308, emissive: 0x1a35d4, emissiveIntensity: 2.6 }); // тёмно-синее свечение
    const coreM = M({ color: 0x000000, emissive: 0x33e8ff, emissiveIntensity: 3 });

    // спрятать всё родное тело рыцаря — скелет продолжает анимироваться
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) o.visible = false;
    });
    this.model.updateMatrixWorld(true);

    const bones = {};
    this.model.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
    });
    const W = (b) => b.getWorldPosition(new THREE.Vector3());
    const UPV = new THREE.Vector3(0, 1, 0);

    // детали задаются в мировых координатах (поза покоя, лицом к +Z),
    // затем конвертируются в локальное пространство кости
    const attach = (b, mesh, wpos, wquat = null) => {
      b.add(mesh);
      mesh.position.copy(b.worldToLocal(wpos.clone()));
      const bq = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      mesh.quaternion.copy(wquat ? bq.multiply(wquat) : bq);
      mesh.scale.multiplyScalar(1 / b.getWorldScale(new THREE.Vector3()).x);
      mesh.castShadow = true;
      return mesh;
    };
    const box = (b, w, h, d, mat, wpos) =>
      attach(b, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), wpos);
    const ball = (b, r, mat, wpos) =>
      attach(b, new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat), wpos);
    const seg = (bA, bB, r, mat) => {
      const a = W(bA);
      const dir = W(bB).sub(a);
      const len = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
      const q = new THREE.Quaternion().setFromUnitVectors(UPV, dir.clone().normalize());
      return attach(bA, mesh, a.addScaledVector(dir, 0.5), q);
    };

    // --- голова: купол, лицевой блок, глаза ---
    const hd = W(bones.head);
    attach(bones.head, new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.18, 10), dark), hd.clone().add(new THREE.Vector3(0, -0.06, 0)));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 16), body);
    dome.scale.set(0.95, 1.12, 1.02);
    attach(bones.head, dome, hd.clone().add(new THREE.Vector3(0, 0.1, 0.01)));
    box(bones.head, 0.115, 0.1, 0.09, dark, hd.clone().add(new THREE.Vector3(0, 0.015, 0.07)));
    for (const sx of [-1, 1]) {
      ball(bones.head, 0.031, dark, hd.clone().add(new THREE.Vector3(sx * 0.047, 0.105, 0.112)));
      const eye = ball(bones.head, 0.023, eyeM, hd.clone().add(new THREE.Vector3(sx * 0.047, 0.105, 0.125)));
      eye.castShadow = false;
    }

    // --- торс ---
    const c = W(bones.chest);
    box(bones.chest, 0.34, 0.3, 0.21, body, c.clone().add(new THREE.Vector3(0, 0.07, 0)));
    box(bones.chest, 0.45, 0.09, 0.17, body, c.clone().add(new THREE.Vector3(0, 0.175, 0)));
    box(bones.chest, 0.13, 0.28, 0.05, dark, c.clone().add(new THREE.Vector3(0, 0.06, 0.112)));
    box(bones.chest, 0.2, 0.24, 0.07, dark, c.clone().add(new THREE.Vector3(0, 0.1, -0.125)));
    attach(bones.chest, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 10), dark), c.clone().add(new THREE.Vector3(0, 0.215, 0)));
    const core = attach(
      bones.chest,
      new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), coreM),
      c.clone().add(new THREE.Vector3(0, 0.12, 0.13)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
    );
    core.castShadow = false;

    // --- открытый "позвоночник" между грудью и тазом ---
    const s = W(bones.spine);
    attach(bones.spine, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.38, 10), dark), s.clone().add(new THREE.Vector3(0, 0.2, 0)));
    box(bones.spine, 0.18, 0.13, 0.12, body, s.clone().add(new THREE.Vector3(0, 0.01, 0)));

    // --- таз ---
    const h = W(bones.hips);
    box(bones.hips, 0.26, 0.15, 0.18, body, h.clone().add(new THREE.Vector3(0, 0.01, 0)));

    // --- конечности ---
    for (const side of ['l', 'r']) {
      const sgn = side === 'l' ? 1 : -1;
      const ua = bones['upperarm' + side];
      const la = bones['lowerarm' + side];
      const wr = bones['wrist' + side];
      const ha = bones['hand' + side];
      ball(ua, 0.068, joint, W(ua));
      seg(ua, la, 0.04, body);
      ball(la, 0.05, joint, W(la));
      seg(la, wr, 0.042, accent);
      ball(wr, 0.036, joint, W(wr));
      box(ha, 0.085, 0.09, 0.06, dark, W(ha).add(new THREE.Vector3(sgn * 0.045, -0.005, 0)));

      const ul = bones['upperleg' + side];
      const ll = bones['lowerleg' + side];
      const ft = bones['foot' + side];
      ball(ul, 0.06, joint, W(ul));
      seg(ul, ll, 0.054, body);
      ball(ll, 0.054, joint, W(ll));
      seg(ll, ft, 0.045, body);
      ball(ft, 0.038, joint, W(ft));
      const fp = W(ft);
      box(ft, 0.095, 0.06, 0.21, dark, new THREE.Vector3(fp.x, 0.05, fp.z + 0.055));
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
    if (this.hp > 0 && this.hp < 32 && (this.lowHpVoiceT === undefined || this.lowHpVoiceT < performance.now() - 18000)) {
      this.lowHpVoiceT = performance.now();
      this.audio.voice('voice_ai_lowhp');
    }
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

    const maxSpeed =
      this.repairT > 0 || input.aimHeld ? AIM_SPEED : sprint ? SPRINT_SPEED : RUN_SPEED;
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
    if (this.grounded && this.velY < -3.5) this.velY = -3.5;

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
    if (this.velY <= 0.8) {
      rayGrounded = !!this.physics.raycast(
        { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z },
        { x: 0, y: -1, z: 0 },
        0.62,
        this.collider
      );
    }
    this.grounded = this.controller.computedGrounded() || rayGrounded;
    this.airTime = this.grounded ? 0 : (this.airTime || 0) + dt;
    if (this.grounded && wasAirborneLong) {
      this.jumpPhase = 'land';
      this.landT = 0.22;
      this.cameraRig.addTrauma(0.1);
      this.audio.play3d('footstep', this.pos, { volume: 0.85, rate: 0.7 });
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

    if (input.fireHeld && this.fireT <= 0 && this.ammo > 0 && this.reloadT <= 0 && this.repairT <= 0) {
      this.fireT = FIRE_INTERVAL;
      this.shoot(input, enemyLookup);
    }

    // ---- саморемонт (Q): тратит ремкомплект, +45 брони за 1.8с ----
    if (input.wasPressed('KeyQ') && this.kits > 0 && this.repairT <= 0 && this.hp < this.maxHp - 1) {
      this.kits--;
      this.repairT = 1.8;
      this.hud.setKits(this.kits, this.maxKits);
      this.audio.play2d('pickup', { volume: 0.8, rate: 0.85 });
    }
    if (this.repairT > 0) {
      this.repairT -= dt;
      this.hp = Math.min(this.maxHp, this.hp + 25 * dt);
      this.hud.setHealth(this.hp / this.maxHp);
      this._repairFxT = (this._repairFxT || 0) - dt;
      if (this._repairFxT <= 0) {
        this._repairFxT = 0.22;
        this.vfx.burst(
          this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8)),
          new THREE.Vector3(0, 1, 0),
          0x2ee8ff,
          6,
          1.6
        );
      }
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
          ts = THREE.MathUtils.clamp(speed / 2.9, 0.6, 1.5);
        }
        this.setBase(anim, 0.16, ts);
      }

      // шаги
      const speedNow = Math.hypot(this.vel.x, this.vel.z);
      if (speedNow > 1.3) {
        this.footT -= dt * speedNow;
        if (this.footT <= 0) {
          this.footT = 2.5;
          this.audio.play3d('footstep', this.pos, { volume: 0.45, rate: 0.95 });
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

    this.vfx.tracer(muzzlePos, end, 0x7fe8ff, 1.4);
    this.vfx.muzzle(muzzlePos, 0x9fd8ff, 1.4);
    this.audio.play3d('shot', muzzlePos, { volume: 0.75 });
    this.cameraRig.pitchKick(0.0095);
    this.cameraRig.addTrauma(0.06);
  }
}
