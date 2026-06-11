import * as THREE from 'three';

const DAY_LENGTH = 300; // seconds per full day
const C_DAY = new THREE.Color(0xfff0d8);
const C_DUSK = new THREE.Color(0xffa868);
const C_NIGHT = new THREE.Color(0x5a78b8);
const FOG_DAY = new THREE.Color(0x8a6a4c);
const FOG_NIGHT = new THREE.Color(0x141a26);

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
  return new THREE.CanvasTexture(c);
}

function rainStreakTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, 'rgba(180,210,255,0)');
  g.addColorStop(0.5, 'rgba(180,210,255,0.9)');
  g.addColorStop(1, 'rgba(180,210,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(3, 0, 2, 32);
  return new THREE.CanvasTexture(c);
}

export class Atmosphere {
  constructor(scene, hdri) {
    this.scene = scene;
    scene.environment = hdri;
    scene.background = hdri;
    scene.backgroundBlurriness = 0.04;
    scene.backgroundIntensity = 0.75;
    scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(0x6e4630, 0.012);

    this.dayTime = 0.62; // start in the late afternoon (matches the sunset sky)
    this.nightF = 0;
    this.dayF = 1;

    this.sun = new THREE.DirectionalLight(0xffa868, 3.4);
    this.sun.position.set(40, 26, -12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -65;
    sc.right = 65;
    sc.top = 65;
    sc.bottom = -65;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x68596a, 0x2e241c, 0.6);
    scene.add(this.hemi);

    // lightning flash light
    this.flash = new THREE.DirectionalLight(0xdde8ff, 0);
    this.flash.position.set(20, 50, 10);
    scene.add(this.flash);
    this.flashT = 0;
    this.nextBolt = 10;

    // ---- dust motes ----
    const COUNT = 800;
    const pos = new Float32Array(COUNT * 3);
    this.vel = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 112;
      pos[i * 3 + 1] = Math.random() * 11;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 112;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.35;
      this.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.12;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      size: 0.07,
      map: softCircleTexture(),
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // ---- rain (positions are local around the player; the whole cloud follows him) ----
    const RAIN = 1400;
    const rpos = new Float32Array(RAIN * 3);
    this.rainSpeed = new Float32Array(RAIN);
    for (let i = 0; i < RAIN; i++) {
      rpos[i * 3] = (Math.random() - 0.5) * 56;
      rpos[i * 3 + 1] = Math.random() * 24;
      rpos[i * 3 + 2] = (Math.random() - 0.5) * 56;
      this.rainSpeed[i] = 26 + Math.random() * 12;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rainMat = new THREE.PointsMaterial({
      size: 0.55,
      map: rainStreakTexture(),
      color: 0xbdd4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rain = new THREE.Points(rgeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    this.rainTarget = 0; // 0..1
    this.rainLevel = 0;
    this.weatherT = 35 + Math.random() * 40; // time until weather change
  }

  update(dt, playerPos = null) {
    // ---------- time of day ----------
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    const elev = Math.sin((this.dayTime - 0.25) * Math.PI * 2); // 1 = noon, <0 = night
    const dayF = THREE.MathUtils.clamp(elev * 1.5, 0, 1);
    const nightF = THREE.MathUtils.clamp(-elev * 1.6, 0, 1);
    const duskF = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3.2, 0, 1) * (1 - nightF);
    this.dayF = dayF;
    this.nightF = nightF;

    // sun position on its arc (moon at night: opposite, dim, blue)
    const az = this.dayTime * Math.PI * 2 + Math.PI / 2;
    const el = Math.max(elev, 0.06);
    const r = 70;
    if (elev > -0.08) {
      this.sun.position.set(Math.cos(az) * r * Math.cos(el), Math.sin(el) * r, Math.sin(az) * r * Math.cos(el));
    } else {
      // moon: mirrored azimuth, fixed gentle height
      this.sun.position.set(-Math.cos(az) * r * 0.8, 30, -Math.sin(az) * r * 0.8);
    }

    const rainDim = 1 - this.rainLevel * 0.55;
    // color: night -> dusk -> day
    const c = this.sun.color;
    if (nightF > 0.5) c.copy(C_NIGHT);
    else c.copy(C_DAY).lerp(C_DUSK, duskF).lerp(C_NIGHT, nightF * 2);
    this.sun.intensity = (0.45 + dayF * 3.0) * rainDim;
    this.hemi.intensity = (0.2 + dayF * 0.5) * rainDim;
    this.scene.backgroundIntensity = (0.1 + dayF * 0.75 + duskF * 0.15) * rainDim;
    this.scene.environmentIntensity = 0.12 + dayF * 0.42;

    this.scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, nightF).multiplyScalar(rainDim * 0.6 + 0.4);
    this.scene.fog.density = 0.011 + nightF * 0.003 + this.rainLevel * 0.007;

    // dust fades at night and in rain
    this.dustMat.opacity = 0.32 * (0.35 + dayF * 0.65) * (1 - this.rainLevel * 0.8);

    // ---------- weather state ----------
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.rainTarget = this.rainTarget > 0 ? 0 : 0.7 + Math.random() * 0.3;
      this.weatherT = this.rainTarget > 0 ? 28 + Math.random() * 22 : 50 + Math.random() * 60;
    }
    this.rainLevel = THREE.MathUtils.damp(this.rainLevel, this.rainTarget, 0.5, dt);
    this.rain.visible = this.rainLevel > 0.02;
    this.rainMat.opacity = 0.5 * this.rainLevel;

    if (this.rain.visible) {
      if (playerPos) this.rain.position.set(playerPos.x, 0, playerPos.z);
      const rp = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        rp[i * 3 + 1] -= this.rainSpeed[i] * dt;
        if (rp[i * 3 + 1] < 0) {
          rp[i * 3 + 1] = 24;
          rp[i * 3] = (Math.random() - 0.5) * 56;
          rp[i * 3 + 2] = (Math.random() - 0.5) * 56;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;

      // lightning
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flashT = 0.22;
        this.nextBolt = 7 + Math.random() * 14;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = this.flashT / 0.22;
      this.flash.intensity = (Math.sin(k * 24) > 0 ? 7 : 1.5) * k * this.rainLevel;
    } else {
      this.flash.intensity = 0;
    }

    // ---------- dust drift ----------
    const pos = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += this.vel[i] * dt;
      pos[i + 1] += this.vel[i + 1] * dt;
      pos[i + 2] += this.vel[i + 2] * dt;
      if (pos[i] > 56) pos[i] = -56;
      if (pos[i] < -56) pos[i] = 56;
      if (pos[i + 1] > 11) pos[i + 1] = 0;
      if (pos[i + 1] < 0) pos[i + 1] = 11;
      if (pos[i + 2] > 56) pos[i + 2] = -56;
      if (pos[i + 2] < -56) pos[i + 2] = 56;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
