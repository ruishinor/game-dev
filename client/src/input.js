// Keyboard and mouse input in the classic MMO scheme:
//   W/S move, A/D turn (strafe while the right button is held), Q/E strafe,
//   Space jump, right-drag steers, left-drag orbits, both buttons run.
// The module only reports intent; it never touches game state.

const DRAG_THRESHOLD = 5;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  /** @param {{lock?: boolean}} opts lock=false never captures the pointer. */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.useLock = opts.lock !== false;
    this.keys = new Set();
    this.lmb = false;
    this.rmb = false;
    this.dragDist = 0;
    this.downAt = null;
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.skipMoves = 0;
    this.lockPending = false;
    this.enabled = false;
    /** (code, event) for non-movement key presses. */
    this.onAction = () => {};
    this.onReset = () => {};
    /** (button, clientX, clientY) for clicks that were not drags. */
    this.onClick = () => {};

    const typing = (e) => {
      const el = document.activeElement;
      if (!el) return false;
      if (['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable) return true;
      // Dialogs and binding capture own their keys. A clicked actionbar button
      // does NOT swallow future shortcuts, while Tab/Enter/Space remain native.
      const dialog = el.closest?.('[role="dialog"]');
      if (dialog && !dialog.hidden) return true;
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')
        return e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space';
      return false;
    };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || typing(e)) return;
      if (e.metaKey) return;
      // Ctrl/Alt action-bar bindings may be handled by onAction; movement
      // still uses the existing raw keys without modifiers.
      if (MOVE_KEYS.has(e.code) && !e.ctrlKey && !e.altKey) {
        this.keys.add(e.code);
        e.preventDefault();
        return;
      }
      if (e.repeat) {
        if (e.code === 'Tab') e.preventDefault();
        return;
      }
      this.onAction(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (e.button === 0) this.lmb = true;
      else if (e.button === 2) this.rmb = true;
      else return;
      if (!this.downAt) {
        this.downAt = { x: e.clientX, y: e.clientY, button: e.button };
        this.dragDist = 0;
      }
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.lmb && !this.rmb) return;
      // While a pointer-lock request is pending or held, mouseup always
      // reaches us, and Chromium's cursor-warp move as the lock engages
      // (sent before pointerlockchange) reports buttons 0 and a huge delta.
      // Treating it as an unseen release ended every locked drag after a few
      // pixels, so drop such moves instead.
      if (e.buttons === 0 && (this.lockPending || document.pointerLockElement === canvas)) return;
      if (e.buttons === 0) {
        // The button was released where we could not see it.
        this.lmb = false;
        this.rmb = false;
        this.downAt = null;
        return;
      }
      // Browsers occasionally report one huge delta as pointer lock engages.
      if (this.skipMoves > 0) {
        this.skipMoves--;
        return;
      }
      const clamp = (v) => Math.max(-120, Math.min(120, v || 0));
      const dx = clamp(e.movementX);
      const dy = clamp(e.movementY);
      this.dragDist += Math.abs(dx) + Math.abs(dy);
      if (this.dragDist <= DRAG_THRESHOLD) return;
      this.lookX += dx;
      this.lookY += dy;
      // Hide and capture the cursor while steering; failure is harmless
      // because unlocked mousemove deltas keep working.
      if (this.useLock && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          if (this.lockPending) return;
          this.lockPending = true;
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => { this.lockPending = false; });
        } catch {
          this.lockPending = false;
          /* pointer lock unavailable; continue unlocked */
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      const wasDown = (e.button === 0 && this.lmb) || (e.button === 2 && this.rmb);
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
      if (!this.lmb && !this.rmb) {
        if (wasDown && this.downAt && this.dragDist <= DRAG_THRESHOLD && this.downAt.button === e.button) {
          this.onClick(e.button, this.downAt.x, this.downAt.y);
        }
        this.downAt = null;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );

    // Anything that takes focus or the pointer away must not leave a key or
    // button stuck down.
    const reset = () => this.reset();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) reset();
    });
    document.addEventListener('pointerlockchange', () => {
      this.lockPending = false;
      if (document.pointerLockElement === canvas) {
        // A request may finish after mouse-up, blur or a reset.
        if (!this.enabled || (!this.lmb && !this.rmb)) {
          document.exitPointerLock();
          return;
        }
        this.skipMoves = 1;
      }
      if (document.pointerLockElement !== canvas && (this.lmb || this.rmb) && this.dragDist > DRAG_THRESHOLD) {
        // Lock was taken away (Esc): end the drag rather than steer blindly.
        this.lmb = false;
        this.rmb = false;
        this.downAt = null;
      }
    });
    document.addEventListener('pointerlockerror', () => { this.lockPending = false; });
  }

  reset() {
    this.onReset();
    this.keys.clear();
    this.lmb = false;
    this.rmb = false;
    this.downAt = null;
    this.lookX = 0;
    this.lookY = 0;
    this.skipMoves = 0;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Consume accumulated look/zoom deltas and report movement intent. */
  sample() {
    const k = (a, b) => (this.down(...a) ? 1 : 0) - (this.down(...b) ? 1 : 0);
    const steering = this.rmb && this.dragDist > DRAG_THRESHOLD;
    const turnKeys = k(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    let f = k(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    if (this.lmb && this.rmb) f = 1;
    let s = k(['KeyE'], ['KeyQ']);
    if (steering) s -= turnKeys;
    const out = {
      f,
      s: Math.max(-1, Math.min(1, s)),
      turn: steering ? 0 : turnKeys,
      jump: this.keys.has('Space'),
      steering,
      orbiting: this.lmb && !this.rmb && this.dragDist > DRAG_THRESHOLD,
      lookX: this.lookX,
      lookY: this.lookY,
      wheel: this.wheel,
    };
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    return out;
  }
}
