import * as THREE from 'three';

// Ambient life: crows circling overhead, rats darting between rubble piles.
export class Wildlife {
  constructor(scene) {
    this.scene = scene;
    this.crows = [];
    this.rats = [];
    this.time = 0;

    const feather = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, side: THREE.DoubleSide });

    // 3 flocks of crows
    for (let f = 0; f < 3; f++) {
      const cx = (Math.random() - 0.5) * 50;
      const cz = (Math.random() - 0.5) * 50;
      const radius = 12 + Math.random() * 14;
      const height = 13 + Math.random() * 8;
      const speed = (0.18 + Math.random() * 0.14) * (Math.random() < 0.5 ? 1 : -1);
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const bird = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), feather);
        body.rotation.x = Math.PI / 2;
        bird.add(body);
        const wings = [];
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.22), feather);
          wing.position.x = side * 0.3;
          wing.rotation.y = 0;
          bird.add(wing);
          wings.push({ wing, side });
        }
        scene.add(bird);
        this.crows.push({
          bird,
          wings,
          cx,
          cz,
          radius: radius + i * 0.9,
          height: height + (Math.random() - 0.5) * 2,
          speed,
          phase: (i / n) * Math.PI * 2,
          flap: Math.random() * 10,
        });
      }
    }

    // rats
    const fur = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const rat = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), fur);
      body.scale.set(0.8, 0.6, 1.5);
      body.position.y = 0.1;
      rat.add(body);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.3, 5), fur);
      tail.rotation.x = Math.PI / 2 - 0.3;
      tail.position.set(0, 0.08, 0.32);
      rat.add(tail);
      const home = new THREE.Vector3((Math.random() - 0.5) * 70, 0, (Math.random() - 0.5) * 70);
      rat.position.copy(home);
      scene.add(rat);
      this.rats.push({ rat, home, target: home.clone(), wait: Math.random() * 4, speed: 3.2 + Math.random() });
    }
  }

  update(dt) {
    this.time += dt;

    for (const c of this.crows) {
      c.phase += c.speed * dt;
      c.flap += dt * (9 + Math.abs(c.speed) * 10);
      const x = c.cx + Math.cos(c.phase) * c.radius;
      const z = c.cz + Math.sin(c.phase) * c.radius;
      const y = c.height + Math.sin(c.phase * 3) * 0.7;
      c.bird.position.set(x, y, z);
      // face along the tangent of the circle
      const dir = Math.sign(c.speed);
      c.bird.rotation.y = -c.phase - (dir > 0 ? 0 : Math.PI);
      const flap = Math.sin(c.flap) * 0.7;
      for (const { wing, side } of c.wings) wing.rotation.z = side * flap;
    }

    for (const r of this.rats) {
      if (r.wait > 0) {
        r.wait -= dt;
        continue;
      }
      const d = r.target.clone().sub(r.rat.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.2) {
        // pick a new dash point near home
        r.target = r.home
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14));
        r.wait = 1.5 + Math.random() * 5;
      } else {
        d.normalize();
        r.rat.position.addScaledVector(d, Math.min(r.speed * dt, dist));
        r.rat.rotation.y = Math.atan2(d.x, d.z) + Math.PI;
      }
    }
  }
}
