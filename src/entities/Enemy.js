import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RAPIER } from '../core/Physics.js';

export const ENEMY_TYPES = {
  // медлительная пехота нежити
  shambler: {
    model: 'minion',
    hp: 78,
    speed: [2.4, 3.5],
    damage: 12,
    scale: 1.04,
    tint: new THREE.Color(0.62, 0.78, 0.55),
    runAnim: 'Running_A',
    ranged: false,
  },
  // быстрый и хрупкий — заходит со спины
  runner: {
    model: 'rogue',
    hp: 42,
    speed: [5.0, 6.2],
    damage: 9,
    scale: 0.98,
    tint: new THREE.Color(0.88, 0.62, 0.45),
    runAnim: 'Running_B',
    ranged: false,
  },
  // держит дистанцию, плюётся кислотой
  spitter: {
    model: 'mage',
    hp: 60,
    speed: [2.1, 2.7],
    damage: 14,
    scale: 1.0,
    tint: new THREE.Color(0.5, 0.9, 0.55),
    runAnim: 'Walking_C',
    ranged: true,
    range: 12,
    castTime: 1.4,
    cooldown: 2.8,
  },
};

const ATTACK_RANGE = 2.3;

let nextId = 1;

class Enemy {
  constructor(mgr, pos, typeKey) {
    this.mgr = mgr;
    this.id = nextId++;
    this.type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.shambler;
    this.typeKey = typeKey;
    this.hp = this.type.hp;
    this.state = 'spawn';
    this.t = 0;
    this.speed = this.type.speed[0] + Math.random() * (this.type.speed[1] - this.type.speed[0]);
    this.flash = 0;
    this.attackHitDone = false;
    this.dead = false;
    this.castCD = 0;

    this.model = skeletonClone(mgr.templates[this.type.model].scene);
    this.model.scale.setScalar(this.type.scale);
    this.mats = [];
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.color.multiply(this.type.tint);
        o.material.emissive = new THREE.Color(0x0a1f06);
        o.material.emissiveIntensity = 0.6;
        this.mats.push(o.material);
      }
      if (/shield|crossbow|quiver|arrow/i.test(o.name)) o.visible = false;
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
    const clip = THREE.AnimationClip.findByName(this.mgr.templates[this.type.model].animations, name);
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

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.mats) m.emissiveIntensity = 0.6 + this.flash * 6;
    }

    if (this.state === 'dead') {
      this.t -= dt;
      if (this.t <= 0) {
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
    this.castCD -= dt;

    if (this.state === 'spawn') {
      this.t += dt;
      if (this.t >= this.spawnDur) {
        this.state = 'chase';
        this.play(this.type.runAnim, 0.25, false, this.speed / 3);
      }
      return;
    }

    if (this.state === 'hit') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'chase';
        this.play(this.type.runAnim, 0.12, false, this.speed / 3);
      }
      return;
    }

    if (this.state === 'cast') {
      this.t += dt;
      this.faceTowards(toPlayer, dt, 6);
      if (!this.attackHitDone && this.t > this.type.castTime * 0.55) {
        this.attackHitDone = true;
        const origin = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const target = player.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const dir = target.sub(origin).normalize();
        this.mgr.spawnProjectile(origin, dir, this.type.damage);
        this.mgr.audio.play3d('zombie_attack', this.pos, { volume: 0.5, rate: 1.3 });
      }
      if (this.t > this.type.castTime) {
        this.castCD = this.type.cooldown;
        this.state = 'chase';
        this.play(this.type.runAnim, 0.15, false, this.speed / 3);
      }
      return;
    }

    if (this.state === 'attack') {
      this.t += dt;
      this.faceTowards(toPlayer, dt, 8);
      if (!this.attackHitDone && this.t > 0.42) {
        this.attackHitDone = true;
        if (dist < ATTACK_RANGE + 0.9 && !player.dead) {
          player.takeDamage(this.type.damage, this.pos);
          this.mgr.audio.play3d('zombie_attack', this.pos, { volume: 0.65 });
        }
      }
      if (this.t > 1.05) {
        if (dist < ATTACK_RANGE) {
          this.startAttack();
        } else {
          this.state = 'chase';
          this.play(this.type.runAnim, 0.15, false, this.speed / 3);
        }
      }
      return;
    }

    // ---- chase ----
    if (this.type.ranged && dist < this.type.range && dist > 4 && this.castCD <= 0 && !player.dead) {
      this.state = 'cast';
      this.t = 0;
      this.attackHitDone = false;
      this.play('Spellcast_Shoot', 0.12, true, 1.1);
      return;
    }
    if (dist < ATTACK_RANGE && !player.dead) {
      this.startAttack();
      return;
    }

    const seek = toPlayer.normalize();
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
    if (dir.lengthSq() < 0.0001) return;
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
  constructor(templates, scene, physics, vfx, audio) {
    this.templates = templates; // { minion, rogue, mage }
    this.scene = scene;
    this.physics = physics;
    this.vfx = vfx;
    this.audio = audio;
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.killCount = 0;
    this.onKill = () => {
      this.killCount++;
    };
    this.controller = physics.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.4, 0.2, true);
    this.controller.enableSnapToGround(0.4);
  }

  /** True when an enemy capsule can stand at (x, z) without overlapping walls/props. */
  isSpotFree(x, z) {
    const shape = new RAPIER.Capsule(0.45, 0.3);
    let blocked = false;
    this.physics.world.intersectionsWithShape(
      { x, y: 0.95, z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      () => {
        blocked = true;
        return false; // stop iterating
      }
    );
    return !blocked;
  }

  /** Spiral-search a free spot near the requested position so enemies never
   *  spawn inside buildings, cars, trees or other colliders. */
  findFreeSpot(pos) {
    if (this.isSpotFree(pos.x, pos.z)) return pos;
    for (let r = 2; r <= 14; r += 2) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + r * 0.7;
        const x = pos.x + Math.cos(a) * r;
        const z = pos.z + Math.sin(a) * r;
        if (Math.abs(x) > 88 || Math.abs(z) > 88) continue;
        if (this.isSpotFree(x, z)) {
          pos.x = x;
          pos.z = z;
          return pos;
        }
      }
    }
    return pos;
  }

  spawnAt(pos, type = 'shambler') {
    const p = this.findFreeSpot(pos.clone());
    p.y = 0;
    this.enemies.push(new Enemy(this, p, type));
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

  spawnProjectile(origin, dir, damage) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x041a04, emissive: 0x3aff2a, emissiveIntensity: 4 })
    );
    m.position.copy(origin);
    this.scene.add(m);
    this.projectiles.push({ m, vel: dir.multiplyScalar(13), life: 3, damage });
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

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      let hit = false;
      if (!player.dead && p.m.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 1, 0))) < 0.8) {
        player.takeDamage(p.damage, p.m.position);
        hit = true;
      }
      if (p.m.position.y < 0.05) hit = true;
      if (hit || p.life <= 0) {
        this.vfx.burst(p.m.position, new THREE.Vector3(0, 1, 0), 0x3aff2a, 8, 2.5);
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.projectiles.splice(i, 1);
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
