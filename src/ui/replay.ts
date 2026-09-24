import { getTeam } from '../engine/data/teams';
import { getTrack } from '../engine/data/tracks';
import type { Track } from '../engine/types';
import type { WeekendState } from '../engine/weekend';
import { fitShape } from './sprites';
import { esc, tyreBadge } from './views';

const W = 320;
const H = 200;
/** Segundos reais por volta na velocidade 1x. */
const SECONDS_PER_LAP = 2.5;

interface CarTrack {
  id: string;
  cums: number[];
  lapsCompleted: number;
  retired: boolean;
}

export class Replay {
  private ctx: CanvasRenderingContext2D;
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
  private lastTowerUpdate = 0;
  private shownEvents = -1;
  private finished = false;

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
    this.path = fitShape(this.track.shape, W, H, 18);
    this.path.push(this.path[0]);
    for (let i = 1; i < this.path.length; i++) {
      const [x0, y0] = this.path[i - 1];
      const [x1, y1] = this.path[i];
      this.seg.push(Math.hypot(x1 - x0, y1 - y0));
    }
    this.length = this.seg.reduce((a, b) => a + b, 0);
    this.cars = race.classification.map((c) => ({
      id: c.teamId,
      cums: [race.gridTimes[c.teamId], ...race.laps.map((l) => l.cum[c.teamId])],
      lapsCompleted: c.lapsCompleted,
      retired: c.status === 'dnf',
    }));
    const finishers = this.cars.filter((c) => !c.retired);
    this.endT = Math.max(...finishers.map((c) => c.cums[this.track.laps])) + 2;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.finished) this.t += dt * this.speed * (this.track.baseLap / SECONDS_PER_LAP);
      if (this.t >= this.endT && !this.finished) {
        this.t = this.endT;
        this.finished = true;
        this.draw(true);
        this.onEnd();
      }
      this.draw(now - this.lastTowerUpdate > 150);
      if (now - this.lastTowerUpdate > 150) this.lastTowerUpdate = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  skip() {
    this.t = this.endT - 0.01;
  }

  private progress(c: CarTrack): number {
    if (c.retired) {
      const stopAt = c.cums[c.lapsCompleted] + this.track.baseLap * 0.5;
      if (this.t >= stopAt) return c.lapsCompleted + 0.5;
    }
    const n = c.retired ? c.lapsCompleted : this.track.laps;
    if (this.t <= c.cums[0]) return 0;
    for (let k = 0; k < n; k++) {
      const a = c.cums[k];
      const b = c.cums[k + 1];
      if (this.t < b) return k + (this.t - a) / (b - a);
    }
    if (c.retired) {
      const a = c.cums[n];
      return n + Math.min(0.5, (this.t - a) / this.track.baseLap);
    }
    return this.track.laps;
  }

  private isOut(c: CarTrack): boolean {
    return c.retired && this.t >= c.cums[c.lapsCompleted] + this.track.baseLap * 0.5;
  }

  private pointAt(frac: number): [number, number] {
    let d = (((frac % 1) + 1) % 1) * this.length;
    for (let i = 0; i < this.seg.length; i++) {
      if (d <= this.seg[i]) {
        const r = d / this.seg[i];
        const [x0, y0] = this.path[i];
        const [x1, y1] = this.path[i + 1];
        return [x0 + (x1 - x0) * r, y0 + (y1 - y0) * r];
      }
      d -= this.seg[i];
    }
    return this.path[0];
  }

  private draw(updateDom: boolean) {
    const ctx = this.ctx;
    const race = this.state.race!;
    ctx.fillStyle = '#2a6b35';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) {
      ctx.fillStyle = y % 16 ? '#2f7a3b' : '#2a6b35';
      ctx.fillRect(0, y, W, 4);
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 14;
    this.strokePath();
    ctx.strokeStyle = '#555a66';
    ctx.lineWidth = 10;
    this.strokePath();
    const [sx, sy] = this.path[0];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.fillRect(Math.round(sx) - 5 + i * 3, Math.round(sy) - 5, 3, 10);
    }

    const prog = this.cars.map((c) => ({ c, p: this.progress(c), out: this.isOut(c) }));
    const leaderP = Math.max(...prog.map((x) => x.p));
    const lapIdx = Math.min(this.track.laps, Math.floor(leaderP));
    const sc = race.laps[Math.min(lapIdx, race.laps.length - 1)]?.safetyCar ?? false;

    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const { c, p, out } of [...prog].sort((a, b) => a.p - b.p)) {
      const team = getTeam(c.id);
      const [x, y] = this.pointAt(p);
      const px = Math.round(x) - 3;
      const py = Math.round(y) - 3;
      const me = c.id === this.state.playerTeamId;
      ctx.fillStyle = out ? '#444' : me && blink ? '#ffd23f' : '#000';
      ctx.fillRect(px - 1, py - 1, 8, 8);
      ctx.fillStyle = out ? '#777' : team.livery.primary;
      ctx.fillRect(px, py, 6, 6);
      ctx.fillStyle = out ? '#777' : team.livery.secondary;
      ctx.fillRect(px + 2, py + 2, 2, 2);
    }

    if (!updateDom) return;
    const shownLap = Math.min(this.track.laps, Math.floor(leaderP) + 1);
    this.hud.innerHTML = `<span>VOLTA ${this.finished ? this.track.laps : shownLap}/${this.track.laps}</span>
      ${sc && !this.finished ? '<span class="sc">SAFETY CAR</span>' : ''}
      <span>${this.finished ? '🏁 BANDEIRADA' : `x${this.speed}`}</span>`;

    const ordered = [...prog].sort((a, b) => (a.out === b.out ? b.p - a.p : a.out ? 1 : -1));
    const leader = ordered[0];
    this.tower.innerHTML = ordered
      .map(({ c, p, out }, i) => {
        const team = getTeam(c.id);
        const done = Math.floor(p);
        let gap = '';
        if (out) gap = 'OUT';
        else if (i === 0) gap = done >= this.track.laps ? '🏁' : 'LÍDER';
        else if (done >= 1) {
          const s = Math.max(0, c.cums[done] - leader.c.cums[done]);
          gap = s >= this.track.baseLap ? `+${Math.floor(s / this.track.baseLap)}V` : `+${s.toFixed(1)}`;
        }
        const tyreId = done === 0 ? this.state.strategies[c.id].stints[0] : race.laps[Math.min(done, race.laps.length) - 1].tyre[c.id];
        return `<div class="pos${c.id === this.state.playerTeamId ? ' me' : ''}${out ? ' out' : ''}">
          <span>${i + 1}</span><span class="sw" style="background:${team.livery.primary}"></span>
          <span>${esc(team.driver.shortName)}</span><span>${gap}</span>${tyreBadge(tyreId)}</div>`;
      })
      .join('');

    const visible = race.events.filter((e) => e.lap === 0 || leaderP >= e.lap - 0.5 || this.finished);
    if (visible.length !== this.shownEvents) {
      this.shownEvents = visible.length;
      this.feed.innerHTML = [...visible]
        .reverse()
        .map((e) => `<div><span class="yellow">${e.lap ? `V${e.lap}` : 'LARG'}</span> ${esc(e.text)}</div>`)
        .join('');
    }
  }

  private strokePath() {
    const ctx = this.ctx;
    ctx.beginPath();
    this.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}
