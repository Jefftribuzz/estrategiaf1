import { getTeam } from '../engine/data/teams';
import { getTrack } from '../engine/data/tracks';
import { createRng } from '../engine/rng';
import type { RaceEvent } from '../engine/session';
import type { Team, Track } from '../engine/types';
import type { WeekendState } from '../engine/weekend';
import { chip } from './audio';
import { fitShape } from './sprites';
import { esc, tyreBadge } from './views';

const W = 320;
const H = 200;
/** Segundos reais por volta na velocidade 1x. */
const SECONDS_PER_LAP = 2.5;
/** Duração do semáforo de largada (s reais). */
const LIGHTS_TIME = 3.4;

interface CarTrack {
  id: string;
  team: Team;
  cums: number[];
  lapsCompleted: number;
  retired: boolean;
}

interface Effect {
  kind: 'text' | 'smoke' | 'spark';
  x: number;
  y: number;
  age: number;
  life: number;
  text?: string;
  color?: string;
  vx?: number;
  vy?: number;
}

interface Drop {
  x: number;
  y: number;
  len: number;
}

export class Replay {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private path: [number, number][];
  private seg: number[] = [];
  private length = 0;
  private cars: CarTrack[];
  private track: Track;
  private t = 0;
  private endT: number;
  private speed = 1;
  private raf = 0;
  private last = 0;
  private lastDom = 0;
  private shownEvents = 0;
  /** Quantos eventos já estão escritos na narração (-1 = reescrever). */
  private feedCount = -1;
  private finished = false;
  private lightsClock = 0;
  private lightsShown = 0;
  private effects: Effect[] = [];
  private wrecks: { x: number; y: number }[] = [];
  private drops: Drop[] = [];
  private flash = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private tower: HTMLElement,
    private feed: HTMLElement,
    private hud: HTMLElement,
    private state: WeekendState,
    private onEnd: () => void,
  ) {
    const race = state.race!;
    this.track = getTrack(state.trackId);
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.path = fitShape(this.track.shape, W, H, 22);
    this.path.push(this.path[0]);
    for (let i = 1; i < this.path.length; i++) {
      const [x0, y0] = this.path[i - 1];
      const [x1, y1] = this.path[i];
      this.seg.push(Math.hypot(x1 - x0, y1 - y0));
    }
    this.length = this.seg.reduce((a, b) => a + b, 0);
    this.cars = race.classification.map((c) => ({
      id: c.teamId,
      team: getTeam(c.teamId),
      cums: [race.gridTimes[c.teamId], ...race.laps.map((l) => l.cum[c.teamId])],
      lapsCompleted: c.lapsCompleted,
      retired: c.status === 'dnf',
    }));
    const finishers = this.cars.filter((c) => !c.retired);
    this.endT = Math.max(...finishers.map((c) => c.cums[this.track.laps])) + 2;
    this.bg = this.paintBackground();
    const weather = state.weather.corrida;
    const rng = createRng(state.seed).fork('drops');
    const n = weather.rain === 2 ? 160 : weather.rain === 1 ? 70 : 0;
    for (let i = 0; i < n; i++) this.drops.push({ x: rng.range(0, W), y: rng.range(0, H), len: rng.range(3, 7) });
  }

  /**
   * Reconecta o replay a elementos novos, quando a tela é redesenhada no meio
   * da corrida (a corrida continua de onde estava).
   */
  attach(canvas: HTMLCanvasElement, tower: HTMLElement, feed: HTMLElement, hud: HTMLElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.tower = tower;
    this.feed = feed;
    this.hud = hud;
    this.feedCount = -1;
    this.lastDom = 0;
  }

  start() {
    this.last = performance.now();
    chip.engineStart();
    if (this.state.weather.corrida.rain) chip.rainStart(this.state.weather.corrida.rain);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      const dom = now - this.lastDom > 150;
      if (dom) this.lastDom = now;
      this.draw(dom);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    chip.engineStop();
    chip.rainStop();
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  skip() {
    this.lightsClock = LIGHTS_TIME;
    this.t = this.endT - 0.01;
  }

  private tick(dt: number) {
    if (this.lightsClock < LIGHTS_TIME) {
      this.lightsClock += dt;
      const lit = Math.min(5, Math.floor(this.lightsClock / 0.5));
      if (lit > this.lightsShown) {
        this.lightsShown = lit;
        chip.sfx('beep');
      }
      if (this.lightsClock >= LIGHTS_TIME) chip.sfx('go');
      return;
    }
    if (!this.finished) {
      this.t += dt * this.speed * (this.track.baseLap / SECONDS_PER_LAP);
      chip.engineRev(Math.min(1, this.speed / 4));
      if (this.t >= this.endT) {
        this.t = this.endT;
        this.finished = true;
        chip.engineStop();
        chip.rainStop();
        this.onEnd();
      }
    }
    for (const e of this.effects) {
      e.age += dt;
      e.x += (e.vx ?? 0) * dt;
      e.y += (e.vy ?? 0) * dt;
    }
    this.effects = this.effects.filter((e) => e.age < e.life);
    const wind = this.state.weather.corrida.windy ? 60 : 20;
    for (const d of this.drops) {
      d.y += 260 * dt;
      d.x += wind * dt;
      if (d.y > H) d.y -= H;
      if (d.x > W) d.x -= W;
    }
    this.flash = Math.max(0, this.flash - dt);
  }

  // ------------------------------------------------------- posições ------

  private progress(c: CarTrack): number {
    if (c.retired) {
      const stopAt = c.cums[c.lapsCompleted] + this.track.baseLap * 0.5;
      if (this.t >= stopAt) return c.lapsCompleted + 0.5;
    }
    const n = c.retired ? c.lapsCompleted : this.track.laps;
    // Antes da largada, os carros esperam em fila no grid.
    const grid = -c.cums[0] * 0.04;
    if (this.t <= c.cums[0]) return grid;
    for (let k = 0; k < n; k++) {
      const a = c.cums[k];
      const b = c.cums[k + 1];
      if (this.t < b) {
        const r = (this.t - a) / (b - a);
        return k === 0 ? grid + (1 - grid) * r : k + r;
      }
    }
    if (c.retired) return n + Math.min(0.5, (this.t - c.cums[n]) / this.track.baseLap);
    return this.track.laps;
  }

  private isOut(c: CarTrack): boolean {
    return c.retired && this.t >= c.cums[c.lapsCompleted] + this.track.baseLap * 0.5;
  }

  private pointAt(frac: number): { x: number; y: number; angle: number } {
    let d = (((frac % 1) + 1) % 1) * this.length;
    for (let i = 0; i < this.seg.length; i++) {
      if (d <= this.seg[i]) {
        const r = d / this.seg[i];
        const [x0, y0] = this.path[i];
        const [x1, y1] = this.path[i + 1];
        return { x: x0 + (x1 - x0) * r, y: y0 + (y1 - y0) * r, angle: Math.atan2(y1 - y0, x1 - x0) };
      }
      d -= this.seg[i];
    }
    return { x: this.path[0][0], y: this.path[0][1], angle: 0 };
  }

  // -------------------------------------------------------- cenário ------

  /** Cenário estático: grama, árvores, arquibancadas, boxes, zebras e asfalto. */
  private paintBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    const wet = this.state.weather.corrida.rain > 0;
    const hot = this.state.weather.corrida.hot;
    const g1 = wet ? '#1f5229' : hot ? '#4a8a3a' : '#2a6b35';
    const g2 = wet ? '#23592d' : hot ? '#539645' : '#2f7a3b';
    for (let y = 0; y < H; y += 8) {
      ctx.fillStyle = (y / 8) % 2 ? g2 : g1;
      ctx.fillRect(0, y, W, 8);
    }
    const rng = createRng(this.state.seed).fork('scenery');
    const nearTrack = (x: number, y: number, dist: number) =>
      this.path.some(([px, py], i) => {
        if (i === 0) return false;
        const [ax, ay] = this.path[i - 1];
        const len2 = (px - ax) ** 2 + (py - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * (px - ax) + (y - ay) * (py - ay)) / len2));
        return Math.hypot(x - (ax + t * (px - ax)), y - (ay + t * (py - ay))) < dist;
      });
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(rng.range(2, W - 8));
      const y = Math.floor(rng.range(2, H - 10));
      if (nearTrack(x + 3, y + 3, 15)) continue;
      ctx.fillStyle = '#123d1a';
      ctx.fillRect(x + 1, y + 6, 6, 2);
      ctx.fillStyle = '#1b5e2a';
      ctx.fillRect(x + 1, y, 5, 6);
      ctx.fillRect(x, y + 1, 7, 4);
      ctx.fillStyle = '#2f8a3f';
      ctx.fillRect(x + 2, y + 1, 2, 2);
    }

    const [sx, sy] = this.path[0];
    const [nx, ny] = this.path[1];
    const ang = Math.atan2(ny - sy, nx - sx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#2d3048';
      ctx.fillRect(-4 + i * 11, -26, 10, 3);
      ctx.fillStyle = '#5a5f7a';
      ctx.fillRect(-4 + i * 11, -23, 10, 8);
      for (let p = 0; p < 8; p++) {
        ctx.fillStyle = ['#e43b44', '#ffd23f', '#3b8bea', '#f4f4f4'][(p + i) % 4];
        ctx.fillRect(-2 + i * 11 + (p % 4) * 2, -22 + Math.floor(p / 4) * 3, 1, 2);
      }
    }
    ctx.fillStyle = '#8a8fa8';
    ctx.fillRect(-2, 11, 50, 6);
    ctx.fillStyle = '#3a3d55';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 6, 13, 4, 4);
    ctx.restore();

    const stroke = (w: number, color: string, dash: number[] = []) => {
      ctx.setLineDash(dash);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      this.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };
    stroke(16, '#e8e8e8');
    stroke(16, '#e43b44', [4, 4]);
    stroke(12, '#111');
    stroke(10, wet ? '#3b4150' : '#555a66');
    stroke(1, wet ? '#6b7690' : '#6a6f7c', [2, 6]);
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang + Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#fff' : '#000';
        ctx.fillRect(-5 + i * 2, -2 + j * 2, 2, 2);
      }
    }
    ctx.restore();
    this.paintLighting(ctx);
    return c;
  }

  /** Iluminação pelo horário local do circuito: noite com holofotes, entardecer alaranjado. */
  private paintLighting(ctx: CanvasRenderingContext2D) {
    const light = this.track.times.corrida.light;
    if (light === 'entardecer') {
      ctx.fillStyle = 'rgba(255,110,40,0.16)';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (light !== 'noite') return;
    ctx.fillStyle = 'rgba(4,6,28,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let acc = 0;
    for (let i = 1; i < this.path.length; i++) {
      const [x0, y0] = this.path[i - 1];
      const [x1, y1] = this.path[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d < len; d += 4) {
        acc += 4;
        if (acc < 26) continue;
        acc = 0;
        const x = x0 + ((x1 - x0) * d) / len;
        const y = y0 + ((y1 - y0) * d) / len;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
        g.addColorStop(0, 'rgba(255,236,190,0.32)');
        g.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 16, y - 16, 32, 32);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------- desenho -------

  /** Carro visto de cima, apontando na direção do traçado. */
  private drawCar(team: Team, x: number, y: number, angle: number, highlight: boolean, out: boolean) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    if (highlight) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-7, -5, 14, 10);
    }
    const P = out ? '#666' : team.livery.primary;
    const S = out ? '#888' : team.livery.secondary;
    ctx.fillStyle = '#000';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-5, -4, 3, 8);
    ctx.fillRect(2, -4, 2, 8);
    ctx.fillStyle = P;
    ctx.fillRect(-5, -1, 11, 2);
    ctx.fillRect(-6, -3, 1, 6);
    ctx.fillStyle = S;
    ctx.fillRect(-2, -1, 3, 2);
    ctx.fillStyle = team.driver.helmet.base;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = out ? '#888' : team.livery.accent;
    ctx.fillRect(5, -3, 1, 6);
    if (!out && this.track.times.corrida.light === 'noite') {
      ctx.fillStyle = 'rgba(255,90,90,0.9)';
      ctx.fillRect(-7, -1, 1, 2);
    }
    ctx.restore();
  }

  private drawSafetyCar(x: number, y: number, angle: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.fillStyle = '#000';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(-5, -3, 10, 6);
    ctx.fillStyle = Math.floor(performance.now() / 200) % 2 ? '#ffd23f' : '#f18f3b';
    ctx.fillRect(-1, -3, 2, 6);
    ctx.restore();
  }

  private drawLights() {
    const ctx = this.ctx;
    const bx = W / 2 - 55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx - 4, 56, 118, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(bx - 4, 60, 118, 34);
    const out = this.lightsClock >= LIGHTS_TIME - 0.4;
    for (let i = 0; i < 5; i++) {
      const on = !out && i < this.lightsShown;
      ctx.fillStyle = '#000';
      ctx.fillRect(bx + i * 22, 64, 20, 26);
      ctx.fillStyle = on ? '#ff2a2a' : '#3a0d0d';
      ctx.fillRect(bx + i * 22 + 4, 67, 12, 8);
      ctx.fillRect(bx + i * 22 + 4, 78, 12, 8);
      if (on) {
        ctx.fillStyle = '#ffb0b0';
        ctx.fillRect(bx + i * 22 + 6, 68, 3, 2);
      }
    }
    if (out) this.text('VAI!', W / 2, 120, '#3fbf6f', 2);
  }

  private text(s: string, x: number, y: number, color: string, scale = 1) {
    const ctx = this.ctx;
    ctx.font = `${8 * scale}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(s, Math.round(x) + scale, Math.round(y) + scale);
    ctx.fillStyle = color;
    ctx.fillText(s, Math.round(x), Math.round(y));
  }

  private floatText(x: number, y: number, text: string, color: string, life = 1.6) {
    this.effects.push({ kind: 'text', x, y: y - 7, age: 0, life, text, color, vy: -7 });
  }

  private spawn(e: RaceEvent, pos: { x: number; y: number } | null) {
    switch (e.type) {
      case 'overtake':
        if (pos) this.floatText(pos.x, pos.y, '▲', '#3fbf6f', 1.1);
        chip.sfx('overtake');
        break;
      case 'pit':
        if (pos) this.floatText(pos.x, pos.y, 'PIT', '#ffd23f');
        chip.sfx('pit');
        break;
      case 'error':
        if (pos) this.floatText(pos.x, pos.y, 'RODOU!', '#f18f3b');
        chip.sfx('error');
        break;
      case 'puncture':
        if (pos) this.floatText(pos.x, pos.y, 'FURO!', '#f18f3b');
        chip.sfx('error');
        break;
      case 'dnf':
        if (pos) {
          this.wrecks.push({ ...pos });
          for (let i = 0; i < 12; i++) {
            this.effects.push({
              kind: 'spark', x: pos.x, y: pos.y, age: 0, life: 0.6,
              color: i % 2 ? '#ffd23f' : '#f18f3b', vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70,
            });
          }
          this.floatText(pos.x, pos.y, 'OUT', '#e43b44', 2);
        }
        chip.sfx('crash');
        this.flash = 0.25;
        break;
      case 'safetycar':
        chip.sfx('sc');
        break;
      case 'fastest':
        if (pos) this.floatText(pos.x, pos.y, 'V.RÁPIDA', '#d67bff');
        break;
      default:
        break;
    }
  }

  private draw(updateDom: boolean) {
    const ctx = this.ctx;
    const race = this.state.race!;
    const weather = this.state.weather.corrida;
    ctx.drawImage(this.bg, 0, 0);

    for (const w of this.wrecks) {
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(w.x) - 4, Math.round(w.y) - 3, 8, 6);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y) - 2, 6, 4);
      if (Math.random() < 0.25) {
        this.effects.push({ kind: 'smoke', x: w.x + (Math.random() - 0.5) * 3, y: w.y - 2, age: 0, life: 1.4, vy: -10, vx: weather.windy ? 10 : 2 });
      }
    }

    const prog = this.cars.map((c) => ({ c, p: this.progress(c), out: this.isOut(c) }));
    const leader = prog.reduce((a, b) => (b.p > a.p ? b : a));
    const lapIdx = Math.max(0, Math.min(this.track.laps - 1, Math.floor(leader.p)));
    const sc = !this.finished && this.lightsClock >= LIGHTS_TIME && (race.laps[lapIdx]?.safetyCar ?? false);

    const pos = new Map<string, { x: number; y: number }>();
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const { c, p, out } of [...prog].sort((a, b) => a.p - b.p)) {
      const pt = this.pointAt(p);
      pos.set(c.id, pt);
      this.drawCar(c.team, pt.x, pt.y, pt.angle, c.id === this.state.playerTeamId && blink, out);
    }
    if (sc) {
      const pt = this.pointAt(leader.p + 0.03);
      this.drawSafetyCar(pt.x, pt.y, pt.angle);
    }

    if (this.lightsClock >= LIGHTS_TIME) {
      const visible = race.events.filter((e) => e.lap === 0 || leader.p >= e.lap - 0.5 || this.finished);
      if (visible.length > this.shownEvents) {
        const fresh = visible.slice(this.shownEvents);
        this.shownEvents = visible.length;
        // Ao pular para o fim, não dispara dezenas de sons de uma vez.
        if (fresh.length <= 6) for (const e of fresh) this.spawn(e, e.teamId ? (pos.get(e.teamId) ?? null) : null);
      }
      if (visible.length !== this.feedCount) {
        this.feedCount = visible.length;
        this.feed.innerHTML = [...visible]
          .reverse()
          .map((e) => `<div class="ev ev-${e.type}"><span class="yellow">${e.lap ? `V${e.lap}` : 'LARG'}</span> ${esc(e.text)}</div>`)
          .join('');
      }
    }

    for (const e of this.effects) {
      const a = 1 - e.age / e.life;
      if (e.kind === 'smoke') {
        ctx.fillStyle = `rgba(130,130,130,${0.5 * a})`;
        const s = 2 + Math.floor(e.age * 3);
        ctx.fillRect(Math.round(e.x), Math.round(e.y), s, s);
      } else if (e.kind === 'spark') {
        ctx.fillStyle = e.color!;
        ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
      } else {
        ctx.globalAlpha = Math.min(1, a * 2);
        this.text(e.text!, e.x, e.y, e.color!);
        ctx.globalAlpha = 1;
      }
    }

    if (weather.rain) {
      ctx.fillStyle = weather.rain === 2 ? 'rgba(10,20,40,0.35)' : 'rgba(10,20,40,0.2)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(180,200,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const slant = weather.windy ? 0.35 : 0.12;
      for (const d of this.drops) {
        ctx.moveTo(Math.round(d.x), Math.round(d.y));
        ctx.lineTo(Math.round(d.x + d.len * slant), Math.round(d.y + d.len));
      }
      ctx.stroke();
    } else if (weather.hot) {
      ctx.fillStyle = 'rgba(255,170,60,0.07)';
      ctx.fillRect(0, 0, W, H);
    }
    if (weather.windy) this.drawWindsock();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (sc) this.text('SAFETY CAR', W / 2, 14, '#ffd23f');
    if (this.lightsClock < LIGHTS_TIME) this.drawLights();
    if (this.finished) this.drawCheckered();

    if (!updateDom) return;
    const shownLap = Math.max(1, Math.min(this.track.laps, Math.floor(leader.p) + 1));
    this.hud.innerHTML = `<span>VOLTA ${this.finished ? this.track.laps : shownLap}/${this.track.laps}</span>
      ${sc ? '<span class="sc">SAFETY CAR</span>' : ''}
      <span>${this.finished ? '🏁 BANDEIRADA' : this.lightsClock < LIGHTS_TIME ? 'LARGADA...' : `x${this.speed}`}</span>`;

    const ordered = [...prog].sort((a, b) => (a.out === b.out ? b.p - a.p : a.out ? 1 : -1));
    const lead = ordered[0];
    this.tower.innerHTML = ordered
      .map(({ c, p, out }, i) => {
        const done = Math.max(0, Math.floor(p));
        let gap = '';
        if (out) gap = 'OUT';
        else if (i === 0) gap = done >= this.track.laps ? '🏁' : 'LÍDER';
        else if (done >= 1) {
          const s = Math.max(0, c.cums[done] - lead.c.cums[done]);
          gap = s >= this.track.baseLap ? `+${Math.floor(s / this.track.baseLap)}V` : `+${s.toFixed(1)}`;
        }
        const tyreId = done === 0 ? this.state.strategies[c.id].stints[0] : race.laps[Math.min(done, race.laps.length) - 1].tyre[c.id];
        return `<div class="pos${c.id === this.state.playerTeamId ? ' me' : ''}${out ? ' out' : ''}">
          <span>${i + 1}</span><span class="sw" style="background:${c.team.livery.primary};border-color:${c.team.livery.secondary}"></span>
          <span>${esc(c.team.driver.shortName)}</span><span>${gap}</span>${tyreBadge(tyreId)}</div>`;
      })
      .join('');
  }

  private drawWindsock() {
    const ctx = this.ctx;
    const x = W - 16;
    const y = 8;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x, y, 1, 16);
    const wave = Math.floor(performance.now() / 150) % 2;
    ctx.fillStyle = '#f18f3b';
    ctx.fillRect(x + 1, y + wave, 4, 3);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(x + 5, y + wave, 3, 3);
    ctx.fillStyle = '#f18f3b';
    ctx.fillRect(x + 8, y + 1 - wave, 3, 2);
  }

  private drawCheckered() {
    const ctx = this.ctx;
    const wave = Math.floor(performance.now() / 180) % 2;
    const x = 10;
    const y = 10;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x, y, 1, 26);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#000' : '#fff';
        ctx.fillRect(x + 1 + i * 3, y + j * 3 + ((i + wave) % 2), 3, 3);
      }
    }
  }
}
