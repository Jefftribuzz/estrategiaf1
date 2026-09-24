// Som chiptune sintetizado com Web Audio: nenhum arquivo de áudio. Ondas
// quadradas e triangulares como num console de 8 bits, mais ruído para
// batidas e chuva.

type Wave = OscillatorType;

export type Sfx = 'blip' | 'select' | 'beep' | 'go' | 'overtake' | 'pit' | 'crash' | 'error' | 'fanfare' | 'sc';

const NOTE: Record<string, number> = {};
{
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) names.forEach((n, i) => (NOTE[`${n}${o}`] = 440 * Math.pow(2, (o - 4) + (i - 9) / 12)));
}

/** Tema de abertura: melodia (quadrada) e baixo (triangular), em semicolcheias. */
const THEME_LEAD = 'E5 . G5 . A5 . . E5 D5 . E5 . G5 . . . E5 . G5 . A5 . C6 . B5 . A5 . G5 . . . A5 . . G5 E5 . D5 . E5 . G5 . A5 . . . G5 . E5 . D5 . C5 . D5 . E5 . . . . .'.split(' ');
const THEME_BASS = 'A2 . A3 . A2 . A3 . F2 . F3 . F2 . F3 . C3 . C4 . C3 . C4 . G2 . G3 . G2 . G3 . A2 . A3 . A2 . A3 . F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 . E2 . E3 . E2 . E3 .'.split(' ');
const TEMPO = 150;

const STORE_KEY = 'f1m8.audio.muted';

class Chip {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer = 0;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  muted: boolean;

  constructor() {
    let m = false;
    try {
      m = localStorage.getItem(STORE_KEY) === '1';
    } catch {
      /* sem armazenamento */
    }
    this.muted = m;
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Precisa ser chamado dentro de um gesto do usuário (clique). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(STORE_KEY, m ? '1' : '0');
    } catch {
      /* sem armazenamento */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: Wave = 'square', vol = 0.12, when = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noise(dur: number, vol = 0.2, when = 0, cutoff = 2000) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  sfx(name: Sfx) {
    if (!this.ctx) return;
    switch (name) {
      case 'blip':
        this.tone(NOTE.A5, 0.05, 'square', 0.06);
        break;
      case 'select':
        this.tone(NOTE.E5, 0.06, 'square', 0.08);
        this.tone(NOTE.A5, 0.08, 'square', 0.08, 0.06);
        break;
      case 'beep':
        this.tone(NOTE.A4, 0.25, 'square', 0.12);
        break;
      case 'go':
        this.tone(NOTE.A5, 0.5, 'square', 0.14);
        this.noise(0.8, 0.08, 0.05, 900);
        break;
      case 'overtake':
        this.tone(NOTE.C5, 0.12, 'square', 0.06, 0, NOTE.C6);
        break;
      case 'pit':
        this.noise(0.08, 0.1, 0, 5000);
        this.noise(0.08, 0.1, 0.12, 5000);
        this.tone(NOTE.G4, 0.1, 'triangle', 0.1, 0.25);
        break;
      case 'crash':
        this.noise(0.6, 0.35, 0, 1200);
        this.tone(NOTE.C3, 0.5, 'square', 0.12, 0, NOTE.C2);
        break;
      case 'error':
        this.tone(NOTE.E4, 0.3, 'square', 0.08, 0, NOTE.E3);
        break;
      case 'sc':
        [0, 0.2, 0.4].forEach((w) => this.tone(NOTE.E5, 0.12, 'square', 0.07, w));
        break;
      case 'fanfare': {
        const seq: [string, number][] = [['C5', 0.12], ['E5', 0.12], ['G5', 0.12], ['C6', 0.36], ['G5', 0.12], ['C6', 0.6]];
        let w = 0;
        for (const [n, d] of seq) {
          this.tone(NOTE[n], d, 'square', 0.1, w);
          this.tone(NOTE[n] / 2, d, 'triangle', 0.12, w);
          w += d;
        }
        break;
      }
    }
  }

  playTheme() {
    if (!this.ctx || this.musicTimer) return;
    const step = 60 / TEMPO / 4;
    let i = 0;
    let next = this.ctx.currentTime + 0.1;
    const schedule = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.25) {
        const lead = THEME_LEAD[i % THEME_LEAD.length];
        const bass = THEME_BASS[i % THEME_BASS.length];
        const when = next - this.ctx.currentTime;
        if (lead !== '.') this.tone(NOTE[lead], step * 1.8, 'square', 0.05, when);
        if (bass !== '.') this.tone(NOTE[bass], step * 1.6, 'triangle', 0.12, when);
        if (i % 4 === 0) this.noise(0.04, 0.05, when, 6000);
        next += step;
        i++;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 60);
  }

  stopTheme() {
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  /** Ronco contínuo do pelotão durante o replay. */
  engineStart() {
    if (!this.ctx || !this.master || this.engineOsc) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.3);
    osc.connect(f).connect(g).connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = g;
  }

  engineRev(level: number) {
    if (!this.ctx || !this.engineOsc) return;
    this.engineOsc.frequency.setTargetAtTime(60 + level * 90, this.ctx.currentTime, 0.2);
  }

  engineStop() {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const osc = this.engineOsc;
    this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    setTimeout(() => osc.stop(), 600);
    this.engineOsc = null;
    this.engineGain = null;
  }

  rainStart(level: number) {
    if (!this.ctx || !this.master || this.rain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const gain = this.ctx.createGain();
    gain.gain.value = level === 2 ? 0.06 : 0.03;
    src.connect(f).connect(gain).connect(this.master);
    src.start();
    this.rain = { src, gain };
  }

  rainStop() {
    this.rain?.src.stop();
    this.rain = null;
  }

  stopAll() {
    this.stopTheme();
    this.engineStop();
    this.rainStop();
  }
}

export const chip = new Chip();
