import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RAPIER } from '../core/Physics.js';

const HP = 1500;
const SCALE = 2.5;

export class Boss {
  constructor(template, scene, physics, vfx, audio, hud, enemyMgr) {
    this.template = template;
    this.scene = scene;
    this.physics = physics;
    this.vfx = vfx;
    this.audio = audio;
    this.hud = hud;
    this.enemyMgr = enemyMgr;

    this.hp = HP;
    this.active = false;
    this.dead = false;
    this.state = 'idle';
    this.t = 0;
    this.chargeCD = 4;
    this.summonCD = 6;
    this.volleyCD = 9;
    this.whirlCD = 5;
    this.staggered60 = false;
    this.staggered25 = false;
    this.projectiles = [];
    this.onDeath = null;

    this.model = skeletonClone(template.scene);
    this.model.scale.setScalar(SCALE);
    this.mats = [];
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(0.55, 0.42, 0.4));
        o.material.emissive = new THREE.Color(0x330505);
        o.material.emissiveIntensity = 0.5;
        this.mats.push(o.material);
      }
      if (/shield|crossbow|quiver|staff|arrow|blade/i.test(o.name)) o.visible = false;
      if (/axe/i.test(o.name)) o.visible = true;
    });

    // ---- horns (the engineer's mutation) ----
    const head = this.model.getObjectByName('head');
    if (head) {
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x1c0f0a, roughness: 0.55, metalness: 0.1 });
      for (const side of [-1, 1]) {
        const horn = new THREE.Group();
        const seg1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), hornMat);
        seg1.position.y = 0.15;
        horn.add(seg1);
        const seg2 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 8), hornMat);
        seg2.position.set(0, 0.3, 0.04);
        seg2.rotation.x = 0.5;
        horn.add(seg2);
        horn.position.set(side * 0.16, 0.3, 0);
        horn.rotation.z = -side * 0.55;
        horn.rotation.x = -0.15;
        head.add(horn);

        // glowing red eye
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1a00, emissiveIntensity: 6 })
        );
        eye.position.set(side * 0.09, 0.1, 0.22);
        head.add(eye);
      }
    }

    // свет всегда в сцене с intensity 0: смена числа видимых источников
    // заставляет three.js перекомпилировать шейдеры всей сцены (фриз)
    this.glow = new THREE.PointLight(0xff2210, 0, 12, 2);
    this.glow.position.y = -100;
    scene.add(this.glow);

    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.add(this.model);
    scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null;

    this.pos = new THREE.Vector3();
    this.faceYaw = 0;
    this.velY = 0;
    this.body = null;
    this.collider = null;
    this.controller = physics.world.createCharacterController(0.06);
    this.controller.enableAutostep(0.6, 0.3, true);
    this.controller.enableSnapToGround(0.5);
  }

  play(name, fade = 0.18, once = false, timeScale = 1) {
    const clip = THREE.AnimationClip.findByName(this.template.animations, name);
    if (!clip) return null;
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(clip);
    const a = this.actions[name];
    a.reset();
    a.timeScale = timeScale;
    if (once) {
      a.setLoop(THREE.LoopOnce);
      a.clampWhenFinished = true;
    } else {
      a.setLoop(THREE.LoopRepeat);
    }
    a.play();
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    this.current = a;
    return a;
  }

  spawn(pos) {
    this.pos.copy(pos);
    this.root.position.copy(pos);
    this.root.visible = true;
    this.glow.intensity = 10;
    this.active = true;
    this.state = 'awaken';
    this.t = 0;

    this.body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z)
    );
    this.collider = this.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55 * SCALE, 0.36 * SCALE).setTranslation(0, 0.9 * SCALE, 0),
      this.body
    );

    const a = this.play('Skeletons_Awaken_Standing', 0, true, 0.85) || this.play('Idle', 0, false);
    this.awakenDur = a ? a.getClip().duration / 0.85 : 2;
    this.hud.showBoss('ИНЖЕНЕР ХААС — СОЗДАТЕЛЬ Р-111');
    this.hud.setBossHealth(1);
    this.audio.play3d('boss_roar', pos, { volume: 1 });
    this.audio.voice('voice_haas_intro');
  }

  takeDamage(dmg, point) {
    if (!this.active || this.dead || this.state === 'awaken') return;
    this.hp -= dmg;
    this.hud.setBossHealth(this.hp / HP);
    for (const m of this.mats) m.emissiveIntensity = 2.2;
    setTimeout(() => {
      if (!this.dead) for (const m of this.mats) m.emissiveIntensity = this.phase() === 3 ? 1.2 : 0.5;
    }, 70);

    if (this.hp <= 0) {
      this.die();
      return;
    }
    const frac = this.hp / HP;
    if (frac < 0.6 && !this.staggered60) {
      this.staggered60 = true;
      this.stagger();
    } else if (frac < 0.25 && !this.staggered25) {
      this.staggered25 = true;
      this.stagger();
      this.audio.play3d('boss_roar', this.pos, { volume: 1, rate: 0.85 });
      this.audio.voice('voice_haas_enrage');
    }
  }

  stagger() {
    this.state = 'stagger';
    this.t = 0.8;
    this.play('Hit_B', 0.08, true);
  }

  phase() {
    const f = this.hp / HP;
    return f < 0.25 ? 3 : f < 0.6 ? 2 : 1;
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.hud.setBossHealth(0);
    this.play('Death_B', 0.2, true, 0.65);
    this.audio.play3d('boss_roar', this.pos, { volume: 1, rate: 0.6 });
    this.audio.voice('voice_haas_death');
    if (this.collider) {
      this.physics.world.removeCollider(this.collider, false);
      this.physics.world.removeRigidBody(this.body);
      this.collider = null;
      this.body = null;
    }
    for (const p of this.projectiles) this.scene.remove(p.m);
    this.projectiles = [];
    setTimeout(() => {
      if (this.onDeath) this.onDeath();
    }, 3200);
  }

  fireVolley(player) {
    this.play('Spellcast_Shoot', 0.12, true);
    const origin = this.pos.clone().add(new THREE.Vector3(0, 2.6, 0));
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (this.dead) return;
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0x041a04, emissive: 0x3aff2a, emissiveIntensity: 4 })
        );
        m.position.copy(origin);
        this.scene.add(m);
        const target = player.pos.clone().add(new THREE.Vector3(0, 3.4, 0));
        const dir = target.sub(origin).normalize();
        dir.x += (Math.random() - 0.5) * 0.12;
        dir.z += (Math.random() - 0.5) * 0.12;
        this.projectiles.push({ m, vel: dir.multiplyScalar(11), life: 4 });
      }, i * 220);
    }
  }

  update(dt, player) {
    if (!this.active) return;
    this.mixer.update(dt);

    // projectiles fly regardless of boss state
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      let hit = false;
      if (!player.dead && p.m.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 3.4, 0))) < 1.9) {
        player.takeDamage(16, p.m.position);
        hit = true;
      }
      if (p.m.position.y < 0.1) hit = true;
      if (hit || p.life <= 0) {
        this.vfx.burst(p.m.position, new THREE.Vector3(0, 1, 0), 0x3aff2a, 10, 3);
        this.scene.remove(p.m);
        this.projectiles.splice(i, 1);
      }
    }

    if (this.dead) {
      this.glow.intensity = Math.max(0, this.glow.intensity - dt * 4);
      return;
    }

    const toPlayer = player.pos.clone().sub(this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const phase = this.phase();
    const speedMul = phase === 3 ? 1.35 : 1;

    this.chargeCD -= dt;
    this.summonCD -= dt;
    this.volleyCD -= dt;
    this.whirlCD -= dt;

    switch (this.state) {
      case 'awaken': {
        this.t += dt;
        if (this.t > this.awakenDur) {
          this.state = 'walk';
          this.play('Walking_B', 0.3);
        }
        break;
      }
      case 'stagger': {
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'walk';
          this.play('Walking_B', 0.2);
        }
        break;
      }
      case 'walk': {
        this.faceTowards(toPlayer, dt, 5);
        this.moveAlong(toPlayer.normalize(), 2.3 * speedMul, dt);

        if (dist < 4.7 && !player.dead) {
          this.startMelee();
        } else if (phase >= 3 && this.whirlCD <= 0 && dist < 7.5) {
          this.startWhirl();
        } else if (this.chargeCD <= 0 && dist > 8 && !player.dead) {
          this.state = 'charge_tele';
          this.t = 0.55;
          this.play('Taunt', 0.1, true, 1.6);
          this.audio.play3d('boss_roar', this.pos, { volume: 0.8, rate: 1.1 });
        } else if (phase >= 2 && this.summonCD <= 0 && this.enemyMgr.aliveCount() < 6) {
          this.state = 'summon';
          this.t = 1.6;
          this.play('Spellcast_Summon', 0.15, true);
        } else if (phase >= 2 && this.volleyCD <= 0 && dist > 5) {
          this.state = 'volley';
          this.t = 1.1;
          this.volleyCD = 8;
          this.fireVolley(player);
        }
        break;
      }
      case 'charge_tele': {
        this.faceTowards(toPlayer, dt, 7);
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'charge';
          this.t = 1.15;
          this.chargeDir = toPlayer.clone().normalize();
          this.chargeHit = false;
          this.play('Running_A', 0.08, false, 1.5);
        }
        break;
      }
      case 'charge': {
        this.t -= dt;
        this.moveAlong(this.chargeDir, 13.5, dt);
        if (!this.chargeHit && dist < 3.9 && !player.dead) {
          this.chargeHit = true;
          player.takeDamage(30, this.pos);
          player.cameraRig.addTrauma(0.5);
          this.t = Math.min(this.t, 0.15);
        }
        if (this.t <= 0) {
          this.vfx.ring(this.pos.clone(), 0xff5533, 3.4);
          this.audio.play3d('boss_slam', this.pos, { volume: 0.9 });
          this.chargeCD = 6.5;
          this.state = 'walk';
          this.play('Walking_B', 0.25);
        }
        break;
      }
      case 'melee': {
        this.t += dt;
        this.faceTowards(toPlayer, dt, 4);
        if (!this.meleeHitDone && this.t > 0.62) {
          this.meleeHitDone = true;
          if (dist < 5.7 && !player.dead) {
            // arc check: is player roughly in front?
            const fwd = new THREE.Vector3(Math.sin(this.faceYaw), 0, Math.cos(this.faceYaw));
            if (fwd.dot(toPlayer.clone().normalize()) > 0.25) {
              player.takeDamage(26, this.pos);
              player.cameraRig.addTrauma(0.4);
              this.audio.play3d('boss_slam', this.pos, { volume: 0.8, rate: 1.2 });
            }
          }
        }
        if (this.t > 1.35) {
          this.state = 'walk';
          this.play('Walking_B', 0.2);
        }
        break;
      }
      case 'whirl': {
        this.t -= dt;
        this.faceYaw += dt * 9;
        this.root.rotation.y = this.faceYaw;
        this.moveAlong(toPlayer.normalize(), 2.8, dt);
        if (!this.whirlRingDone && this.t < 0.7) {
          this.whirlRingDone = true;
          this.vfx.ring(this.pos.clone(), 0xff3322, 4.6);
          this.audio.play3d('boss_slam', this.pos, { volume: 1 });
          if (dist < 5.9 && !player.dead) {
            player.takeDamage(24, this.pos);
            player.cameraRig.addTrauma(0.45);
          }
        }
        if (this.t <= 0) {
          this.whirlCD = 9;
          this.state = 'walk';
          this.play('Walking_B', 0.25);
        }
        break;
      }
      case 'summon': {
        this.t -= dt;
        if (this.t <= 0) {
          this.summonCD = 13;
          this.state = 'walk';
          this.play('Walking_B', 0.2);
          this.audio.voice('voice_haas_summon');
          for (let i = 0; i < 3; i++) {
            const ang = Math.random() * Math.PI * 2;
            const p = this.pos.clone().add(new THREE.Vector3(Math.cos(ang) * 4, 0, Math.sin(ang) * 4));
            p.y = 0;
            this.enemyMgr.spawnAt(p);
          }
        }
        break;
      }
    }

    if (phase === 3) this.glow.intensity = 14 + Math.sin(performance.now() * 0.01) * 4;
    this.root.position.copy(this.pos);
    this.glow.position.set(this.pos.x, this.pos.y + 3.5, this.pos.z);
  }

  startMelee() {
    this.state = 'melee';
    this.t = 0;
    this.meleeHitDone = false;
    this.play(Math.random() < 0.5 ? '2H_Melee_Attack_Slice' : '2H_Melee_Attack_Chop', 0.1, true, 0.9);
  }

  startWhirl() {
    this.state = 'whirl';
    this.t = 1.6;
    this.whirlRingDone = false;
    this.play('2H_Melee_Attack_Spinning', 0.12, false, 1.2);
  }

  moveAlong(dir, speed, dt) {
    this.velY -= 19 * dt;
    const move = { x: dir.x * speed * dt, y: this.velY * dt, z: dir.z * speed * dt };
    this.controller.computeColliderMovement(this.collider, move);
    const c = this.controller.computedMovement();
    this.pos.x += c.x;
    this.pos.y += c.y;
    this.pos.z += c.z;
    if (this.controller.computedGrounded()) this.velY = -1;
    this.body.setNextKinematicTranslation(this.pos);
  }

  faceTowards(dir, dt, rate) {
    if (dir.lengthSq() < 0.0001) return;
    const target = Math.atan2(dir.x, dir.z);
    let dy = target - this.faceYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.faceYaw += dy * Math.min(1, dt * rate);
    this.root.rotation.y = this.faceYaw;
  }
}
