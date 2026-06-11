import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RAPIER } from '../core/Physics.js';

const SPEED_MIN = 2.4;
const SPEED_MAX = 3.5;
const ATTACK_RANGE = 2.3;
const ATTACK_DAMAGE = 12;
const HP = 78;

let nextId = 1;

class Enemy {
  constructor(mgr, pos) {
    this.mgr = mgr;
    this.id = nextId++;
    this.hp = HP;
    this.state = 'spawn';
    this.t = 0;
    this.speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    this.flash = 0;
    this.attackHitDone = false;
    this.dead = false;

    this.model = skeletonClone(mgr.template.scene);
    this.model.scale.setScalar(1.04);
    this.mats = [];
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(0.62, 0.78, 0.55));
        o.material.emissive = new THREE.Color(0x0a1f06);
        o.material.emissiveIntensity = 0.6;
        this.mats.push(o.material);
      }
      // hide weapon/prop attachments except a random blade
      if (/shield|crossbow|quiver|staff|arrow/i.test(o.name)) o.visible = false;
      if (/blade|axe/i.test(o.name)) o.visible = Math.random() < 0.3;
    });
    this.root = new THREE.Group();
    this.root.add(this.model);
    this.root.position.copy(pos);
    mgr.scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null;

    const body = mgr.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z)
    );
    this.body = body;
    this.collider = mgr.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.33).setTranslation(0, 0.85, 0),
      body
    );
    this.pos = pos.clone();
    this.faceYaw = 0;
    this.velY = 0;

    this.play(Math.random() < 0.7 ? 'Skeletons_Awaken_Floor' : 'Spawn_Ground_Skeletons', 0, true);
    this.spawnDur = this.clipDuration() * 0.92;
    mgr.audio.play3d('zombie_spawn', pos, { volume: 0.6 });
  }

  clipDuration() {
    return this.current ? this.current.getClip().duration : 1.5;
  }

  play(name, fade = 0.15, once = false, timeScale = 1) {
    const clip = THREE.AnimationClip.findByName(this.mgr.template.animations, name);
    if (!clip) return null;
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(clip);
    const a = this.actions[name];
    if (this.current === a && !once) return a;
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
    this.currentName = name;
    return a;
  }

  takeDamage(dmg, point, dir) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (this.state === 'chase' && Math.random() < 0.3) {
      this.state = 'hit';
      this.t = 0.45;
      this.play('Hit_A', 0.06, true);
    }
    if (Math.random() < 0.25) this.mgr.audio.play3d('zombie_growl', this.pos, { volume: 0.5 });
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.t = 2.6;
    this.play(Math.random() < 0.5 ? 'Death_A' : 'Death_B', 0.1, true);
    this.mgr.audio.play3d('zombie_death', this.pos, { volume: 0.7 });
    this.mgr.physics.world.removeCollider(this.collider, false);
    this.mgr.physics.world.removeRigidBody(this.body);
    this.collider = null;
    this.body = null;
    if (Math.random() < 0.2) this.mgr.spawnPickup(this.pos.clone());
    this.mgr.onKill();
  }

  update(dt, player) {
    this.mixer.update(dt);

    // hit flash decay
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.mats) m.emissiveIntensity = 0.6 + this.flash * 6;
    }

    if (this.state === 'dead') {
      this.t -= dt;
      if (this.t <= 0) {
        // dissolve
        let op = 1;
        for (const m of this.mats) {
          m.transparent = true;
          op = m.opacity = Math.max(0, m.opacity - dt * 1.4);
        }
        if (op <= 0) this.disposed = true;
      }
      return;
    }

    const toPlayer = player.pos.clone().sub(this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (this.state === 'spawn') {
      this.t += dt;
      if (this.t >= this.spawnDur) {
        this.state = 'chase';
        this.play('Running_A', 0.25, false, this.speed / 3);
      }
      return;
    }

    if (this.state === 'hit') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'chase';
        this.play('Running_A', 0.12, false, this.speed / 3);
      }
      return;
    }

    if (this.state === 'attack') {
      this.t += dt;
      // face player while attacking
      this.faceTowards(toPlayer, dt, 8);
      if (!this.attackHitDone && this.t > 0.42) {
        this.attackHitDone = true;
        if (dist < ATTACK_RANGE + 0.9 && !player.dead) {
          player.takeDamage(ATTACK_DAMAGE, this.pos);
          this.mgr.audio.play3d('zombie_attack', this.pos, { volume: 0.65 });
        }
      }
      if (this.t > 1.05) {
        if (dist < ATTACK_RANGE) {
          this.startAttack();
        } else {
          this.state = 'chase';
          this.play('Running_A', 0.15, false, this.speed / 3);
        }
      }
      return;
    }

    // ---- chase ----
    if (dist < ATTACK_RANGE && !player.dead) {
      this.startAttack();
      return;
    }

    const seek = toPlayer.normalize();
    // separation from other enemies (weaker near the player so the pack can actually reach him)
    const sep = new THREE.Vector3();
    for (const other of this.mgr.enemies) {
      if (other === this || other.dead) continue;
      const d = this.pos.distanceTo(other.pos);
      if (d < 1.1 && d > 0.001) {
        sep.add(this.pos.clone().sub(other.pos).multiplyScalar((1.1 - d) / d));
      }
    }
    const sepW = dist < 3.5 ? 0.4 : 0.9;
    const steer = seek.add(sep.multiplyScalar(sepW)).normalize();

    this.velY -= 19 * dt;
    const move = {
      x: steer.x * this.speed * dt,
      y: this.velY * dt,
      z: steer.z * this.speed * dt,
    };
    this.mgr.controller.computeColliderMovement(this.collider, move);
    const c = this.mgr.controller.computedMovement();
    this.pos.x += c.x;
    this.pos.y += c.y;
    this.pos.z += c.z;
    if (this.mgr.controller.computedGrounded()) this.velY = -1;
    this.body.setNextKinematicTranslation(this.pos);

    this.faceTowards(steer, dt, 9);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.faceYaw;
  }

  faceTowards(dir, dt, rate) {
    const target = Math.atan2(dir.x, dir.z);
    let dy = target - this.faceYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.faceYaw += dy * Math.min(1, dt * rate);
    this.root.rotation.y = this.faceYaw;
  }

  startAttack() {
    this.state = 'attack';
    this.t = 0;
    this.attackHitDone = false;
    this.play(Math.random() < 0.5 ? 'Unarmed_Melee_Attack_Punch_A' : 'Unarmed_Melee_Attack_Punch_B', 0.1, true, 1.15);
  }

  dispose() {
    this.mgr.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
  }
}

export class EnemyManager {
  constructor(template, scene, physics, vfx, audio) {
    this.template = template;
    this.scene = scene;
    this.physics = physics;
    this.vfx = vfx;
    this.audio = audio;
    this.enemies = [];
    this.pickups = [];
    this.killCount = 0;
    this.onKill = () => {
      this.killCount++;
    };
    this.controller = physics.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.4, 0.2, true);
    this.controller.enableSnapToGround(0.4);
  }

  spawnAt(pos) {
    this.enemies.push(new Enemy(this, pos));
  }

  byCollider(handle) {
    for (const e of this.enemies) {
      if (e.collider && e.collider.handle === handle) return e;
    }
    return null;
  }

  aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  spawnPickup(pos) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshStandardMaterial({ color: 0x062228, emissive: 0x2ee8ff, emissiveIntensity: 2.6 })
    );
    pos.y = 0.7;
    m.position.copy(pos);
    this.scene.add(m);
    this.pickups.push({ m, t: 0 });
  }

  update(dt, player) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, player);
      if (e.disposed) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.m.rotation.y += dt * 2.4;
      p.m.position.y = 0.7 + Math.sin(p.t * 3) * 0.12;
      if (!player.dead && p.m.position.distanceTo(player.pos) < 1.4) {
        player.hp = Math.min(player.maxHp, player.hp + 25);
        player.hud.setHealth(player.hp / player.maxHp);
        this.audio.play2d('pickup', { volume: 0.7 });
        this.scene.remove(p.m);
        this.pickups.splice(i, 1);
      } else if (p.t > 25) {
        this.scene.remove(p.m);
        this.pickups.splice(i, 1);
      }
    }
  }
}
