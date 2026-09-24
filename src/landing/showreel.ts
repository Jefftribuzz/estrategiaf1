import { TEAMS } from '../engine/data/teams';
import { getTrack } from '../engine/data/tracks';
import { createRng } from '../engine/rng';
import { SEASON_CALENDAR } from '../engine/season';
import type { Team } from '../engine/types';
import { drawRain, drawTopCar, drawWindsock, makeDrops, moveDrops, paintScenery, pixelText, TrackPath, type Drop } from '../ui/scenery';
import { carSprite, fitShape, helmetSprite } from '../ui/sprites';

// Vitrine animada do topo da landing: os carros correndo nas 10 pistas da
// temporada (com chuva, noite, vento e calor) e, no fim, o pódio.

const W = 320;
const H = 200;
const TRACK_SCENE = 4.2;
const PODIUM_SCENE = 6;
const FADE = 0.35;

interface Weather {
  rain: 0 | 1 | 2;
  hot: boolean;
  windy: boolean;
  label: string;
}

/** Clima de cada pista na vitrine (inclui corridas de chuva). */
const WEATHER: Record<string, Weather> = {
  baku: { rain: 0, hot: false, windy: true, label: 'NOITE E VENTO' },
  monaco: { rain: 0, hot: true, windy: false, label: 'SOL E CALOR' },
  montreal: { rain: 1, hot: false, windy: false, label: 'CHUVA LEVE' },
  silverstone: { rain: 0, hot: false, windy: true, label: 'VENTO FORTE' },
  hungaroring: { rain: 0, hot: true, windy: false, label: 'CALOR' },
  spa: { rain: 2, hot: false, windy: false, label: 'CHUVA FORTE' },
  monza: { rain: 0, hot: true, windy: false, label: 'SOL E CALOR' },
  suzuka: { rain: 0, hot: false, windy: false, label: 'TEMPO SECO' },
  mexico: { rain: 0, hot: false, windy: false, label: '2.240 M DE ALTITUDE' },
  interlagos: { rain: 1, hot: false, windy: false, label: 'CHUVA NO ENTARDECER' },
};

const GP_NAME: Record<string, string> = {
  baku: 'GP DO AZERBAIJÃO',
  monaco: 'GP DE MÔNACO',
  montreal: 'GP DO CANADÁ',
  silverstone: 'GP DA INGLATERRA',
  hungaroring: 'GP DA HUNGRIA',
  spa: 'GP DA BÉLGICA',
  monza: 'GP DA ITÁLIA',
  suzuka: 'GP DO JAPÃO',
  mexico: 'GP DO MÉXICO',
  interlagos: 'GP DO BRASIL',
};

interface TrackScene {
  kind: 'track';
  trackId: string;
  tp: TrackPath;
  bg: HTMLCanvasElement;
  weather: Weather;
  night: boolean;
  order: Team[];
  offsets: number[];
  wobble: number[];
  drops: Drop[];
}

interface PodiumScene {
  kind: 'podium';
}

type Scene = TrackScene | PodiumScene;

interface Confetti {
  x: number;
  y: number;
  vy: number;
  vx: number;
  color: string;
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export class Showreel {
  private ctx: CanvasRenderingContext2D;
  private scenes: Scene[] = [];
  private index = 0;
  private t = 0;
  private last = 0;
  private raf = 0;
  private playing = true;
  private visible = true;
  private podiumTeams: Team[] = [];
  private confetti: Confetti[] = [];
  private spray: { x: number; y: number; age: number }[] = [];
  private sprites = new Map<string, { car: HTMLImageElement; helmet: HTMLImageElement }>();
  onScene: (index: number, total: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    const rng = createRng(2026);
    for (const id of SEASON_CALENDAR) {
      const track = getTrack(id);
      const tp = new TrackPath(fitShape(track.shape, W, H, 22));
      const weather = WEATHER[id];
      const night = track.times.corrida.light === 'noite';
      const light = track.times.corrida.light;
      const order = [...TEAMS].sort(() => rng.next() - 0.5);
      this.scenes.push({
        kind: 'track',
        trackId: id,
        tp,
        bg: paintScenery(tp, W, H, { wet: weather.rain > 0, hot: weather.hot, light, seed: 7 + this.scenes.length }),
        weather,
        night,
        order,
        offsets: order.map((_, i) => 0.35 - i * 0.022 + rng.range(-0.004, 0.004)),
        wobble: order.map(() => rng.range(0, Math.PI * 2)),
        drops: makeDrops(weather.rain === 2 ? 160 : weather.rain === 1 ? 70 : 0, W, H, 11 + this.scenes.length),
      });
    }
    this.scenes.push({ kind: 'podium' });
    for (const team of TEAMS) this.sprites.set(team.id, { car: loadImage(carSprite(team)), helmet: loadImage(helmetSprite(team)) });
  }

  get total() {
    return this.scenes.length;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.playing && this.visible) this.tick(dt);
      if (this.visible) this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.onScene(this.index, this.total);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  setPlaying(p: boolean) {
    this.playing = p;
  }

  get isPlaying() {
    return this.playing;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.last = performance.now();
  }

  goTo(i: number) {
    this.index = ((i % this.total) + this.total) % this.total;
    this.t = 0;
    this.enterScene();
    this.onScene(this.index, this.total);
  }

  /** Desenha só o primeiro quadro (para quem prefere menos movimento). */
  still() {
    this.t = 1.2;
    this.draw();
  }

  private duration(): number {
    return this.scenes[this.index].kind === 'podium' ? PODIUM_SCENE : TRACK_SCENE;
  }

  private enterScene() {
    this.spray = [];
    if (this.scenes[this.index].kind === 'podium') {
      const prev = this.scenes[this.total - 2] as TrackScene;
      this.podiumTeams = this.leaders(prev, TRACK_SCENE).slice(0, 3);
      this.confetti = [];
    }
  }

  private tick(dt: number) {
    this.t += dt;
    const scene = this.scenes[this.index];
    if (scene.kind === 'track') {
      moveDrops(scene.drops, dt, W, H, scene.weather.windy);
    } else {
      if (this.t > 1.4 && this.confetti.length < 90) {
        const colors = ['#ffd23f', '#e43b44', '#3b8bea', '#3fbf6f', '#f4f4f4', '#d67bff'];
        for (let i = 0; i < 3; i++) {
          this.confetti.push({ x: Math.random() * W, y: -4, vy: 30 + Math.random() * 40, vx: (Math.random() - 0.5) * 20, color: colors[Math.floor(Math.random() * colors.length)] });
        }
      }
      for (const c of this.confetti) {
        c.y += c.vy * dt;
        c.x += c.vx * dt;
      }
      this.confetti = this.confetti.filter((c) => c.y < H + 4);
    }
    for (const s of this.spray) s.age += dt;
    this.spray = this.spray.filter((s) => s.age < 0.4);
    if (this.t >= this.duration()) this.goTo(this.index + 1);
  }

  /** Posição de cada carro (fração de volta), com pequenas variações que geram ultrapassagens. */
  private progress(scene: TrackScene, t: number): number[] {
    const speed = scene.weather.rain === 2 ? 0.13 : scene.weather.rain === 1 ? 0.15 : 0.17;
    return scene.order.map((_, i) => scene.offsets[i] + t * speed + Math.sin(t * 1.3 + scene.wobble[i]) * 0.006);
  }

  private leaders(scene: TrackScene, t: number): Team[] {
    const p = this.progress(scene, t);
    return scene.order.map((team, i) => ({ team, p: p[i] })).sort((a, b) => b.p - a.p).map((x) => x.team);
  }

  private draw() {
    const scene = this.scenes[this.index];
    if (scene.kind === 'track') this.drawTrack(scene);
    else this.drawPodium();
    // Transição: escurece no começo e no fim de cada cena.
    const d = this.duration();
    const fade = this.t < FADE ? 1 - this.t / FADE : this.t > d - FADE ? (this.t - (d - FADE)) / FADE : 0;
    if (fade > 0) {
      this.ctx.fillStyle = `rgba(15,16,32,${Math.min(1, fade)})`;
      this.ctx.fillRect(0, 0, W, H);
    }
  }

  private drawTrack(scene: TrackScene) {
    const ctx = this.ctx;
    ctx.drawImage(scene.bg, 0, 0);
    const p = this.progress(scene, this.t);
    const idx = scene.order.map((_, i) => i).sort((a, b) => p[a] - p[b]);
    for (const i of idx) {
      const pt = scene.tp.pointAt(p[i]);
      if (scene.weather.rain && Math.random() < 0.5) {
        this.spray.push({ x: pt.x - Math.cos(pt.angle) * 7 + (Math.random() - 0.5) * 3, y: pt.y - Math.sin(pt.angle) * 7 + (Math.random() - 0.5) * 3, age: 0 });
      }
      drawTopCar(ctx, scene.order[i], pt.x, pt.y, pt.angle, { night: scene.night });
    }
    for (const s of this.spray) {
      ctx.fillStyle = `rgba(210,220,240,${0.45 * (1 - s.age / 0.4)})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    if (scene.weather.rain) drawRain(ctx, scene.drops, W, H, scene.weather.rain === 2, scene.weather.windy);
    else if (scene.weather.hot) {
      ctx.fillStyle = 'rgba(255,170,60,0.07)';
      ctx.fillRect(0, 0, W, H);
    }
    if (scene.weather.windy) drawWindsock(ctx, W);

    // Legenda da cena
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 30, W, 30);
    pixelText(ctx, GP_NAME[scene.trackId], 8, H - 16, '#ffd23f', 1, 'left');
    pixelText(ctx, scene.weather.label, 8, H - 5, '#f4f4f4', 1, 'left');
    const leader = this.leaders(scene, this.t)[0];
    pixelText(ctx, `P1 ${leader.driver.shortName}`, W - 8, H - 16, '#3fbf6f', 1, 'right');
    pixelText(ctx, `${SEASON_CALENDAR.indexOf(scene.trackId) + 1}/10`, W - 8, H - 5, '#a3a8d0', 1, 'right');
  }

  private drawPodium() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1d3a');
    g.addColorStop(1, '#262950');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, 0, 8, H);
    }
    pixelText(ctx, 'PÓDIO · GP DO BRASIL', W / 2, 20, '#ffd23f', 1);
    // Degraus: 2º, 1º, 3º
    const slots = [
      { team: this.podiumTeams[1], x: 60, h: 46, color: '#d8d8e8', n: '2', delay: 0.3 },
      { team: this.podiumTeams[0], x: 160, h: 66, color: '#ffd23f', n: '1', delay: 0.6 },
      { team: this.podiumTeams[2], x: 260, h: 32, color: '#e0a060', n: '3', delay: 0 },
    ];
    const baseY = H - 18;
    for (const s of slots) {
      const rise = Math.min(1, Math.max(0, (this.t - s.delay) / 0.6));
      const h = Math.round(s.h * (1 - Math.pow(1 - rise, 3)));
      ctx.fillStyle = '#000';
      ctx.fillRect(s.x - 42, baseY - h - 2, 84, h + 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 40, baseY - h, 80, h);
      if (h > 20) pixelText(ctx, s.n, s.x, baseY - h + 20, '#ffffff', 2);
      if (!s.team) continue;
      const drop = Math.min(1, Math.max(0, (this.t - s.delay - 0.6) / 0.5));
      if (drop <= 0) continue;
      const sp = this.sprites.get(s.team.id)!;
      const carY = baseY - h - 28 - (1 - drop) * 60;
      if (sp.car.complete) ctx.drawImage(sp.car, s.x - 40, carY, 80, 28);
      const bounce = this.t > 2.4 && s.n === '1' ? Math.floor(this.t * 4) % 2 : 0;
      if (sp.helmet.complete) ctx.drawImage(sp.helmet, s.x - 8, carY - 20 - bounce, 16, 16);
      pixelText(ctx, s.team.driver.shortName, s.x, baseY + 12, '#f4f4f4', 1);
    }
    if (this.t > 2) pixelText(ctx, 'CAMPEÃO DO GP!', 160, 44, '#3fbf6f', 1);
    for (const c of this.confetti) {
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 3);
    }
  }
}
