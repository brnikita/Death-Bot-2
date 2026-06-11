import * as THREE from 'three';

function softCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Atmosphere {
  constructor(scene, hdri) {
    scene.environment = hdri;
    scene.background = hdri;
    scene.backgroundBlurriness = 0.04;
    scene.backgroundIntensity = 0.75;
    scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(0x6e4630, 0.013);

    this.sun = new THREE.DirectionalLight(0xffa868, 3.4);
    this.sun.position.set(34, 20, -10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const hemi = new THREE.HemisphereLight(0x68596a, 0x2e241c, 0.6);
    scene.add(hemi);

    // Floating dust motes
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    this.vel = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 76;
      pos[i * 3 + 1] = Math.random() * 11;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 76;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.35;
      this.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.12;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.07,
      map: softCircleTexture(),
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
  }

  update(dt) {
    const pos = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += this.vel[i] * dt;
      pos[i + 1] += this.vel[i + 1] * dt;
      pos[i + 2] += this.vel[i + 2] * dt;
      if (pos[i] > 38) pos[i] = -38;
      if (pos[i] < -38) pos[i] = 38;
      if (pos[i + 1] > 11) pos[i + 1] = 0;
      if (pos[i + 1] < 0) pos[i + 1] = 11;
      if (pos[i + 2] > 38) pos[i + 2] = -38;
      if (pos[i + 2] < -38) pos[i + 2] = 38;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
