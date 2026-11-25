class SoundEngine {
  private ac: AudioContext | null = null;
  private muted = false;
  private suspended = false;
  private bgmEnabled = true;
  private sfxVolume = 0.75;
  private bgmVolume = 0.35;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  public ensure(): void {
    if (this.suspended) return;
    if (
      typeof navigator !== 'undefined' &&
      'userActivation' in navigator &&
      navigator.userActivation &&
      !navigator.userActivation.hasBeenActive
    ) {
      return;
    }
    if (!this.ac) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new AudioCtx();
      } catch {
        this.ac = null;
      }
    }
    if (this.ac && this.ac.state === 'suspended') {
      const ctx = this.ac;
      ctx
        .resume()
        .then(() => {
          if (this.suspended && this.ac === ctx) {
            void ctx.close().catch(() => {});
            this.ac = null;
          }
        })
        .catch(() => {});
    }
    this.syncBgmLoop();
  }

  public setSuspended(val: boolean): void {
    if (this.suspended === val) return;
    this.suspended = val;
    if (val && this.ac) {
      const ctx = this.ac;
      this.ac = null;
      void ctx.close().catch(() => {});
    } else if (!val && !this.muted) {
      this.ensure();
    }
    this.syncBgmLoop();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    this.syncBgmLoop();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.syncBgmLoop();
    return this.muted;
  }

  public setSettings(settings: {
    muted: boolean;
    bgmEnabled: boolean;
    sfxVolume: number;
    bgmVolume: number;
  }): void {
    this.muted = settings.muted;
    this.bgmEnabled = settings.bgmEnabled;
    this.sfxVolume = settings.sfxVolume;
    this.bgmVolume = settings.bgmVolume;
    this.syncBgmLoop();
  }

  private syncBgmLoop(): void {
    if (typeof window === 'undefined') return;
    if (this.suspended || this.muted || !this.bgmEnabled || this.bgmVolume <= 0.01) {
      if (this.bgmTimer !== null) {
        window.clearInterval(this.bgmTimer);
        this.bgmTimer = null;
      }
      return;
    }
    if (!this.ac || this.bgmTimer !== null) return;

    // Gentle medieval-fantasy pentatonic arpeggio loop
    const notes = [220, 261.63, 329.63, 392.0, 329.63, 293.66, 261.63, 196.0];
    this.bgmTimer = window.setInterval(() => {
      if (!this.ac || this.ac.state !== 'running' || this.suspended || this.muted || !this.bgmEnabled) return;
      const freq = notes[this.bgmStep % notes.length];
      this.bgmStep++;
      const t = this.ac.currentTime;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      const peak = 0.025 * this.bgmVolume;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
      o.connect(g).connect(this.ac.destination);
      o.start(t);
      o.stop(t + 0.75);
    }, 680);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.05,
    slide: number | null = null
  ): void {
    if (!this.ac || this.suspended || this.muted || this.sfxVolume <= 0.01) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    }
    g.gain.setValueAtTime(vol * this.sfxVolume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  public swing(): void {
    this.tone(420, 0.06, 'triangle', 0.032, 180);
  }
  public bow(): void {
    this.tone(560, 0.07, 'triangle', 0.036, 260);
  }
  public arcane(): void {
    this.tone(620, 0.08, 'sine', 0.036, 390);
  }
  public hit(): void {
    this.tone(170, 0.08, 'square', 0.055, 70);
  }
  public crit(): void {
    this.tone(330, 0.13, 'sawtooth', 0.07, 90);
  }
  public hurt(): void {
    this.tone(120, 0.16, 'sawtooth', 0.075, 48);
  }
  public coin(): void {
    this.tone(880, 0.05, 'sine', 0.055);
    setTimeout(() => this.tone(1320, 0.07, 'sine', 0.045), 48);
  }
  public potion(): void {
    this.tone(600, 0.1, 'sine', 0.06, 950);
  }
  public fire(): void {
    this.tone(300, 0.16, 'sawtooth', 0.055, 760);
  }
  public whirl(): void {
    this.tone(520, 0.2, 'triangle', 0.06, 190);
  }
  public bash(): void {
    this.tone(150, 0.2, 'sawtooth', 0.075, 55);
  }
  public ice(): void {
    this.tone(920, 0.18, 'sine', 0.06, 340);
    setTimeout(() => this.tone(1280, 0.15, 'triangle', 0.04, 620), 40);
  }
  public dash(): void {
    this.tone(480, 0.11, 'triangle', 0.05, 160);
  }
  public lvl(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.16, 'sine', 0.065), i * 80)
    );
  }
  public boss(): void {
    this.tone(78, 0.7, 'sawtooth', 0.1, 38);
  }
  public buy(): void {
    this.tone(700, 0.07, 'square', 0.055, 1050);
  }
  public equip(): void {
    this.tone(540, 0.06, 'triangle', 0.05, 820);
  }
  public quest(): void {
    [587, 740, 880].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.14, 'sine', 0.06), i * 75)
    );
  }
  public chest(): void {
    [430, 620, 840].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.1, 'sine', 0.055), i * 58)
    );
  }
  public slam(): void {
    this.tone(90, 0.3, 'sawtooth', 0.09, 35);
  }
}

export const sfx = new SoundEngine();
