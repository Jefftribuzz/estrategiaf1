import { createRng } from '../engine/rng';
import type { Light, Team } from '../engine/types';

// Cenário em pixel art usado pelo replay do jogo e pela vitrine da landing
// page: grama, árvores, arquibancadas, boxes, zebras, asfalto, iluminação,
// chuva e os carros vistos de cima.

export interface SceneryOptions {
  wet: boolean;
  hot: boolean;
  light: Light;
  seed: number;
}

/** Traçado ajustado ao canvas, com posição por fração da volta. */
export class TrackPath {
  readonly path: [number, number][];
  private seg: number[] = [];
  readonly length: number;

  constructor(points: [number, number][]) {
    this.path = [...points, points[0]];
    for (let i = 1; i < this.path.length; i++) {
      const [x0, y0] = this.path[i - 1];
      const [x1, y1] = this.path[i];
      this.seg.push(Math.hypot(x1 - x0, y1 - y0));
    }
    this.length = this.seg.reduce((a, b) => a + b, 0);
  }

  pointAt(frac: number): { x: number; y: number; angle: number } {
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
}

/** Cenário estático (desenhado uma vez por pista). */
export function paintScenery(track: TrackPath, W: number, H: number, o: SceneryOptions): HTMLCanvasElement {
  const path = track.path;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g1 = o.wet ? '#1f5229' : o.hot ? '#4a8a3a' : '#2a6b35';
  const g2 = o.wet ? '#23592d' : o.hot ? '#539645' : '#2f7a3b';
  for (let y = 0; y < H; y += 8) {
    ctx.fillStyle = (y / 8) % 2 ? g2 : g1;
    ctx.fillRect(0, y, W, 8);
  }
  const rng = createRng(o.seed).fork('scenery');
  const nearTrack = (x: number, y: number, dist: number) =>
    path.some(([px, py], i) => {
      if (i === 0) return false;
      const [ax, ay] = path[i - 1];
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

  const [sx, sy] = path[0];
  const [nx, ny] = path[1];
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
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  stroke(16, '#e8e8e8');
  stroke(16, '#e43b44', [4, 4]);
  stroke(12, '#111');
  stroke(10, o.wet ? '#3b4150' : '#555a66');
  stroke(1, o.wet ? '#6b7690' : '#6a6f7c', [2, 6]);
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
  paintLighting(ctx, path, W, H, o.light);
  return c;
}

/** Iluminação pelo horário local do circuito: noite com holofotes, entardecer alaranjado. */
export function paintLighting(ctx: CanvasRenderingContext2D, path: [number, number][], W: number, H: number, light: Light) {
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
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
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

/** Carro visto de cima, apontando na direção do traçado. */
export function drawTopCar(
  ctx: CanvasRenderingContext2D,
  team: Team,
  x: number,
  y: number,
  angle: number,
  o: { highlight?: boolean; out?: boolean; night?: boolean } = {},
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  if (o.highlight) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-7, -5, 14, 10);
  }
  const P = o.out ? '#666' : team.livery.primary;
  const S = o.out ? '#888' : team.livery.secondary;
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
  ctx.fillStyle = o.out ? '#888' : team.livery.accent;
  ctx.fillRect(5, -3, 1, 6);
  if (!o.out && o.night) {
    ctx.fillStyle = 'rgba(255,90,90,0.9)';
    ctx.fillRect(-7, -1, 1, 2);
  }
  ctx.restore();
}

export interface Drop {
  x: number;
  y: number;
  len: number;
}

export function makeDrops(n: number, W: number, H: number, seed: number): Drop[] {
  const rng = createRng(seed).fork('drops');
  return Array.from({ length: n }, () => ({ x: rng.range(0, W), y: rng.range(0, H), len: rng.range(3, 7) }));
}

export function moveDrops(drops: Drop[], dt: number, W: number, H: number, windy: boolean) {
  const wind = windy ? 60 : 20;
  for (const d of drops) {
    d.y += 260 * dt;
    d.x += wind * dt;
    if (d.y > H) d.y -= H;
    if (d.x > W) d.x -= W;
  }
}

/** Escurece a cena e desenha as gotas de chuva. */
export function drawRain(ctx: CanvasRenderingContext2D, drops: Drop[], W: number, H: number, heavy: boolean, windy: boolean) {
  ctx.fillStyle = heavy ? 'rgba(10,20,40,0.35)' : 'rgba(10,20,40,0.2)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(180,200,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const slant = windy ? 0.35 : 0.12;
  for (const d of drops) {
    ctx.moveTo(Math.round(d.x), Math.round(d.y));
    ctx.lineTo(Math.round(d.x + d.len * slant), Math.round(d.y + d.len));
  }
  ctx.stroke();
}

/** Biruta de vento no canto da tela. */
export function drawWindsock(ctx: CanvasRenderingContext2D, W: number) {
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

/** Texto em pixel art com sombra. */
export function pixelText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, align: CanvasTextAlign = 'center') {
  ctx.font = `${8 * scale}px 'Press Start 2P', monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = '#000';
  ctx.fillText(s, Math.round(x) + scale, Math.round(y) + scale);
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
}
