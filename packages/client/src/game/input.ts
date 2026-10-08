const JOYSTICK_RADIUS = 56;

export interface JoystickView {
  active: boolean;
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
}

export class Controls {
  angle = 0;
  hasInput = false;
  /** 'joystick': drag relative to where the finger landed. 'follow': steer towards the finger. */
  mode: 'joystick' | 'follow' = 'joystick';
  joystick: JoystickView = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 };

  private pointerBoost = false;
  private buttonBoost = false;
  private keyBoost = false;
  private stickId: number | null = null;
  private readonly boostTouches = new Set<number>();
  private readonly keys = new Set<string>();
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly surface: HTMLElement, boostButton: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(surface, 'pointerdown', (e) => this.onDown(e));
    on(surface, 'pointermove', (e) => this.onMove(e));
    on(surface, 'pointerup', (e) => this.onUp(e));
    on(surface, 'pointercancel', (e) => this.onUp(e));
    on(surface, 'contextmenu', (e) => e.preventDefault());

    on(boostButton, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      boostButton.setPointerCapture(e.pointerId);
      this.buttonBoost = true;
      boostButton.classList.add('active');
    });
    const release = () => {
      this.buttonBoost = false;
      boostButton.classList.remove('active');
    };
    on(boostButton, 'pointerup', release);
    on(boostButton, 'pointercancel', release);
    on(boostButton, 'lostpointercapture', release);

    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => {
      this.keys.clear();
      this.keyBoost = this.pointerBoost = this.buttonBoost = false;
      this.boostTouches.clear();
    });
  }

  get boost(): boolean {
    return this.pointerBoost || this.buttonBoost || this.keyBoost || this.boostTouches.size > 0;
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 || e.button === 2) this.pointerBoost = true;
      this.aimFromCenter(e);
      return;
    }
    e.preventDefault();
    if (this.stickId === null) {
      this.stickId = e.pointerId;
      this.surface.setPointerCapture(e.pointerId);
      if (this.mode === 'follow') this.aimFromCenter(e);
      else this.joystick = { active: true, baseX: e.clientX, baseY: e.clientY, knobX: e.clientX, knobY: e.clientY };
    } else {
      this.boostTouches.add(e.pointerId);
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.aimFromCenter(e);
      return;
    }
    if (e.pointerId !== this.stickId) return;
    if (this.mode === 'follow') {
      this.aimFromCenter(e);
      return;
    }
    const dx = e.clientX - this.joystick.baseX;
    const dy = e.clientY - this.joystick.baseY;
    const len = Math.hypot(dx, dy);
    if (len > 6) {
      this.angle = Math.atan2(dy, dx);
      this.hasInput = true;
    }
    const k = len > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / len : 1;
    this.joystick.knobX = this.joystick.baseX + dx * k;
    this.joystick.knobY = this.joystick.baseY + dy * k;
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 || e.button === 2) this.pointerBoost = false;
      return;
    }
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.joystick.active = false;
    }
    this.boostTouches.delete(e.pointerId);
  }

  private aimFromCenter(e: PointerEvent): void {
    const rect = this.surface.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) > 4) {
      this.angle = Math.atan2(dy, dx);
      this.hasInput = true;
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ') {
      this.keyBoost = down;
      e.preventDefault();
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1], w: [0, -1],
      ArrowDown: [0, 1], s: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0],
      ArrowRight: [1, 0], d: [1, 0],
    };
    if (!(k in dirs)) return;
    e.preventDefault();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    let x = 0;
    let y = 0;
    for (const key of this.keys) {
      x += dirs[key][0];
      y += dirs[key][1];
    }
    if (x !== 0 || y !== 0) {
      this.angle = Math.atan2(y, x);
      this.hasInput = true;
    }
  }
}
