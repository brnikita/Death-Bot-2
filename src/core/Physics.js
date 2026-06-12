import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -19.62, z: 0 });
    this.world.timestep = 1 / 60;
    // тонкие препятствия (столбы, антенны, деревья): пули и ходьба их учитывают,
    // а камера игнорирует — иначе она схлопывается, зацепившись за мачту
    this.cameraIgnore = new Set();
  }

  step() {
    this.world.step();
  }

  /** Static cuboid collider. size = full extents. */
  addBox(x, y, z, sx, sy, sz, rotY = 0) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation({
        x: 0,
        y: Math.sin(rotY / 2),
        z: 0,
        w: Math.cos(rotY / 2),
      })
    );
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2), body);
    // тонкие и высокие объекты камера не считает препятствием
    if (Math.min(sx, sz) < 0.9 && sy > 2) this.cameraIgnore.add(col.handle);
    return body;
  }

  /**
   * Raycast for bullets / line of sight.
   * Returns { point: {x,y,z}, normal, collider, toi } or null.
   */
  raycast(origin, dir, maxDist, excludeCollider = null, filterGroups = undefined) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      filterGroups,
      undefined,
      excludeCollider,
      undefined
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    const point = ray.pointAt(toi);
    return { point, normal: hit.normal, collider: hit.collider, toi };
  }

  /** Sphere sweep used by the camera to avoid clipping into walls. */
  sweepSphere(origin, dir, maxDist, radius, excludeCollider = null) {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      shape,
      0,
      maxDist,
      true,
      undefined,
      undefined,
      excludeCollider,
      undefined,
      (c) => !this.cameraIgnore.has(c.handle)
    );
    return hit ? hit.time_of_impact ?? hit.timeOfImpact : null;
  }
}
