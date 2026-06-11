export class Input {
  constructor(canvas, debug = false) {
    this.canvas = canvas;
    this.debug = debug;
    this.keys = new Set();
    this.pressed = new Set(); // cleared each frame
    this.dx = 0;
    this.dy = 0;
    this.fireHeld = false;
    this.aimHeld = false;
    this.locked = false;
    this.onUnlock = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fireHeld = false;
      this.aimHeld = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.aimHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aimHeld = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.fireHeld = false;
        this.aimHeld = false;
        this.keys.clear();
        if (this.onUnlock) this.onUnlock();
      }
    });
  }

  lock() {
    if (this.debug) {
      this.locked = true;
      return;
    }
    this.canvas.requestPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Consume accumulated mouse delta; call once per frame. */
  consumeMouse() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
