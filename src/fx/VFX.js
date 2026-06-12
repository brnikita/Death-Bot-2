import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(180,240,255,0.9)');
  g.addColorStop(1, 'rgba(0,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flashes = [];
    this.bursts = [];
    this.rings = [];

    this.tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
    this.flashTex = flashTexture();

    // один постоянный источник света для вспышек выстрелов: создание/удаление
    // PointLight на лету меняет число источников и перекомпилирует все шейдеры
    this.flashLight = new THREE.PointLight(0xffffff, 0, 14, 2);
    this.flashLight.position.y = -100;
    scene.add(this.flashLight);
  }

  tracer(from, to, color = 0x7fe8ff, width = 1) {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(this.tracerGeo, mat);
    const dir = to.clone().sub(from).normalize();
    m.quaternion.setFromUnitVectors(UP, dir);
    m.position.copy(from).addScaledVector(dir, len / 2);
    m.scale.set(width, len, width);
    this.scene.add(m);
    this.tracers.push({ m, life: 0.06, max: 0.06 });
  }

  muzzle(pos, color = 0x9fd8ff, size = 1) {
    const mat = new THREE.SpriteMaterial({
      map: this.flashTex,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar((0.5 + Math.random() * 0.25) * size);
    s.material.rotation = Math.random() * Math.PI;
    this.scene.add(s);

    this.flashLight.color.setHex(color);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 26;
    this.flashes.push({ s, life: 0.055 });
  }

  burst(pos, normal, color = 0xffaa44, count = 12, speed = 4) {
    const positions = new Float32Array(count * 3);
    const vels = [];
    const n = normal ? normal.clone().normalize() : UP.clone();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      )
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8))
        .addScaledVector(n, speed * 0.7);
      vels.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.06,
      map: this.flashTex,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    this.scene.add(p);
    this.bursts.push({ p, vels, life: 0.55, max: 0.55 });
  }

  ring(pos, color = 0xff5533, maxR = 4.5) {
    const geo = new THREE.RingGeometry(0.82, 1, 40);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).y += 0.12;
    this.scene.add(m);
    this.rings.push({ m, life: 0.55, max: 0.55, maxR });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.m.material.opacity = (t.life / t.max) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.m);
        t.m.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 480);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.s);
        f.s.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.p.geometry.attributes.position.array;
      for (let j = 0; j < b.vels.length; j++) {
        b.vels[j].y -= 12 * dt;
        pos[j * 3] += b.vels[j].x * dt;
        pos[j * 3 + 1] += b.vels[j].y * dt;
        pos[j * 3 + 2] += b.vels[j].z * dt;
      }
      b.p.geometry.attributes.position.needsUpdate = true;
      b.p.material.opacity = b.life / b.max;
      if (b.life <= 0) {
        this.scene.remove(b.p);
        b.p.geometry.dispose();
        b.p.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.5 + k * r.maxR);
      r.m.material.opacity = (1 - k) * 0.95;
      if (r.life <= 0) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }
}
