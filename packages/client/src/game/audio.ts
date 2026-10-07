import type { SoundSettings } from '@snake/shared/site-config';

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// A minor: Am – F – C – G
const PROGRESSION = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private element: HTMLAudioElement | null = null;
  private lastEat = 0;
  private eatCombo = 0;
  private readonly onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) {
      void this.ctx.suspend();
      this.element?.pause();
    } else {
      void this.ctx.resume();
      if (this.element && this.musicVolume > 0) void this.element.play().catch(() => undefined);
    }
  };

  constructor(
    private readonly cfg: SoundSettings,
    private musicVolume: number,
    private sfxVolume: number,
    private muted: boolean
  ) {}

  /** Must be called from a user gesture (tap/click) so browsers allow audio. */
  start(): void {
    if (!this.cfg.enabled || this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.applyVolumes();

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', this.onVisibility);
    this.startMusic();
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.element?.pause();
    this.element = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.muted = muted;
    this.applyVolumes();
    if (this.element) {
      if (music > 0 && !muted) void this.element.play().catch(() => undefined);
      else this.element.pause();
    }
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
  }

  private startMusic(): void {
    const ctx = this.ctx!;
    if (this.cfg.customMusicUrl) {
      const el = new Audio(this.cfg.customMusicUrl);
      el.loop = true;
      el.crossOrigin = 'anonymous';
      this.element = el;
      try {
        ctx.createMediaElementSource(el).connect(this.musicBus);
      } catch {
        el.volume = this.musicVolume;
      }
      if (this.musicVolume > 0 && !this.muted) void el.play().catch(() => undefined);
      return;
    }
    if (this.cfg.musicStyle === 'off') return;

    const arcade = this.cfg.musicStyle === 'arcade';
    const bpm = arcade ? 124 : 88;
    const sixteenth = 60 / bpm / 4;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.step = 0;

    const delay = ctx.createDelay(1);
    delay.delayTime.value = sixteenth * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.musicBus);

    this.timer = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.step, this.nextNoteTime, sixteenth, arcade, delay);
        this.nextNoteTime += sixteenth;
        this.step = (this.step + 1) % (16 * PROGRESSION.length * 2);
      }
    }, 50);
  }

  private scheduleStep(step: number, t: number, sixteenth: number, arcade: boolean, delay: DelayNode): void {
    const bar = Math.floor(step / 16) % PROGRESSION.length;
    const inBar = step % 16;
    const chord = PROGRESSION[bar];

    if (inBar === 0) {
      for (const n of chord) this.pad(NOTE(n), t, sixteenth * 16, arcade);
    }
    if (inBar % 8 === 0) this.bass(NOTE(chord[0] - 12), t, sixteenth * (arcade ? 3 : 7), arcade);
    if (arcade && inBar % 4 === 2) this.bass(NOTE(chord[0] - 12), t, sixteenth * 1.5, true);

    const arpEvery = arcade ? 1 : 2;
    if (inBar % arpEvery === 0) {
      const idx = (inBar / arpEvery) % 4;
      const pattern = [0, 1, 2, 1];
      const octave = idx === 3 && step % 64 > 32 ? 24 : 12;
      this.pluck(NOTE(chord[pattern[idx]] + octave), t, arcade ? 'square' : 'triangle', arcade ? 0.05 : 0.07, delay);
    }

    if (arcade) {
      if (inBar % 4 === 0) this.kick(t);
      if (inBar % 4 === 2) this.hat(t, 0.06);
      if (inBar % 2 === 1) this.hat(t, 0.025);
    } else if (inBar === 8) {
      this.hat(t, 0.02);
    }
  }

  private pad(freq: number, t: number, dur: number, arcade: boolean): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(arcade ? 1400 : 700, t);
    filter.frequency.linearRampToValueAtTime(arcade ? 2200 : 1200, t + dur / 2);
    filter.frequency.linearRampToValueAtTime(arcade ? 1400 : 700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(arcade ? 0.025 : 0.04, t + 0.5);
    g.gain.setValueAtTime(arcade ? 0.025 : 0.04, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    filter.connect(g).connect(this.musicBus);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bass(freq: number, t: number, dur: number, arcade: boolean): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = arcade ? 'square' : 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const lvl = arcade ? 0.06 : 0.12;
    g.gain.setValueAtTime(lvl, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(freq: number, t: number, type: OscillatorType, lvl: number, delay: DelayNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(lvl, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(delay);
    o.start(t);
    o.stop(t + 0.4);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.22);
  }

  private hat(t: number, lvl: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(lvl, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.5, 0.06);
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, lvl: number, delay = 0): void {
    if (!this.ctx || this.muted || this.sfxVolume <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(lvl, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  eat(): void {
    const now = performance.now();
    if (now - this.lastEat < 55) return;
    this.eatCombo = now - this.lastEat < 400 ? Math.min(this.eatCombo + 1, 12) : 0;
    this.lastEat = now;
    const base = 520 * Math.pow(2, this.eatCombo / 12);
    this.tone('sine', base, base * 1.5, 0.08, 0.12);
  }

  boost(): void {
    if (!this.ctx || this.muted || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, 0, 0.4);
  }

  kill(): void {
    [0, 4, 7, 12].forEach((s, i) => this.tone('triangle', 660 * Math.pow(2, s / 12), 660 * Math.pow(2, s / 12) * 1.01, 0.12, 0.13, i * 0.06));
  }

  death(): void {
    this.tone('sawtooth', 420, 60, 0.7, 0.16);
    this.tone('sine', 220, 40, 0.8, 0.18, 0.05);
  }

  spawn(): void {
    this.tone('sine', 440, 660, 0.12, 0.1);
    this.tone('sine', 660, 990, 0.14, 0.1, 0.1);
  }

  click(): void {
    this.tone('square', 900, 700, 0.04, 0.05);
  }
}
