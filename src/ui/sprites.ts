import type { HelmetDesign, Team, Track } from '../engine/types';

// Sprites em pixel art desenhados com retângulos num canvas minúsculo e
// ampliados via CSS (image-rendering: pixelated). Cores vêm da pintura do
// carro e do capacete de cada piloto.

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, string>();

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Clareia (amt > 0) ou escurece (amt < 0) uma cor #rrggbb. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const TYRE = '#161616';
const RIM = '#8a8a8a';
const OUTLINE = '#000000';

function wheel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rect(ctx, x + 1, y, w - 2, h, TYRE);
  rect(ctx, x, y + 1, w, h - 2, TYRE);
  const hx = x + Math.floor(w / 2) - 1;
  const hy = y + Math.floor(h / 2) - 1;
  rect(ctx, hx, hy, 2, 2, RIM);
}

function helmetSide(ctx: Ctx, x: number, y: number, h: HelmetDesign) {
  rect(ctx, x, y, 4, 3, h.base);
  rect(ctx, x, y + 1, 4, 1, h.stripe1);
  rect(ctx, x + 2, y + 1, 2, 1, h.visor);
}

/** Carro de perfil, virado para a direita (40x14 px). */
export function carSprite(team: Team): string {
  const key = `car:${team.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(40, 14);
  const { primary: P, secondary: S, accent: A } = team.livery;
  const H = team.driver.helmet;
  rect(ctx, 2, 13, 36, 1, 'rgba(0,0,0,0.35)');

  if (team.era === 'classic') {
    // Charuto dos anos 50/60: sem asas, rodas expostas, piloto alto.
    rect(ctx, 1, 7, 3, 2, P);
    rect(ctx, 3, 6, 32, 4, P);
    rect(ctx, 35, 7, 3, 3, P);
    rect(ctx, 38, 8, 1, 1, OUTLINE);
    rect(ctx, 5, 6, 29, 1, S);
    rect(ctx, 3, 9, 32, 1, shade(P, -0.35));
    rect(ctx, 35, 7, 2, 1, shade(P, 0.3));
    rect(ctx, 8, 10, 12, 1, RIM);
    rect(ctx, 21, 4, 1, 2, '#9fd8ff');
    helmetSide(ctx, 16, 3, H);
    rect(ctx, 16, 6, 5, 1, OUTLINE);
    rect(ctx, 12, 7, 3, 2, '#f4f4f4');
    wheel(ctx, 3, 6, 8, 8);
    wheel(ctx, 27, 6, 8, 8);
  } else if (team.era === 'wing') {
    // Anos 70 a 90: asa traseira alta, pontões laterais, bico em cunha.
    rect(ctx, 0, 1, 7, 2, S);
    rect(ctx, 0, 1, 1, 4, A);
    rect(ctx, 3, 3, 1, 3, A);
    rect(ctx, 7, 4, 12, 2, P);
    rect(ctx, 16, 3, 3, 1, P);
    rect(ctx, 2, 6, 33, 3, P);
    rect(ctx, 9, 6, 15, 1, S);
    rect(ctx, 2, 8, 33, 1, shade(P, -0.35));
    rect(ctx, 7, 4, 12, 1, shade(P, 0.3));
    rect(ctx, 33, 7, 5, 2, P);
    rect(ctx, 33, 8, 5, 1, shade(P, -0.35));
    rect(ctx, 34, 9, 6, 2, A);
    rect(ctx, 12, 7, 3, 2, '#f4f4f4');
    helmetSide(ctx, 19, 3, H);
    rect(ctx, 23, 4, 1, 2, '#9fd8ff');
    wheel(ctx, 1, 6, 9, 8);
    wheel(ctx, 27, 7, 7, 7);
  } else {
    // Era moderna: carro longo e baixo, asas complexas.
    rect(ctx, 0, 1, 6, 3, S);
    rect(ctx, 0, 1, 1, 6, P);
    rect(ctx, 5, 2, 1, 5, P);
    rect(ctx, 6, 3, 13, 3, P);
    rect(ctx, 17, 2, 3, 2, A);
    rect(ctx, 3, 6, 33, 3, P);
    rect(ctx, 10, 7, 14, 1, S);
    rect(ctx, 3, 8, 33, 1, shade(P, -0.35));
    rect(ctx, 6, 3, 13, 1, shade(P, 0.3));
    rect(ctx, 34, 7, 5, 2, P);
    rect(ctx, 34, 8, 5, 1, shade(P, -0.35));
    rect(ctx, 33, 9, 7, 2, A);
    rect(ctx, 36, 8, 4, 1, S);
    rect(ctx, 12, 6, 3, 1, '#f4f4f4');
    helmetSide(ctx, 20, 4, H);
    if (team.year >= 2018) rect(ctx, 19, 3, 6, 1, RIM);
    wheel(ctx, 2, 6, 8, 8);
    wheel(ctx, 27, 7, 7, 7);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** Capacete de frente/perfil (16x16 px). */
export function helmetSprite(team: Team): string {
  return helmetFromDesign(team.driver.helmet);
}

/** Capacete com qualquer combinação de cores (usado também no avatar do perfil). */
export function helmetFromDesign(h: HelmetDesign): string {
  const key = `helmet:${h.base}:${h.stripe1}:${h.stripe2}:${h.visor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(16, 16);
  // contorno
  rect(ctx, 4, 1, 8, 1, OUTLINE);
  rect(ctx, 2, 2, 12, 1, OUTLINE);
  rect(ctx, 1, 3, 14, 10, OUTLINE);
  rect(ctx, 2, 13, 12, 2, OUTLINE);
  // casco
  rect(ctx, 4, 2, 8, 1, h.base);
  rect(ctx, 3, 3, 10, 1, h.base);
  rect(ctx, 2, 4, 12, 9, h.base);
  rect(ctx, 3, 13, 10, 1, h.base);
  // listras do desenho do piloto
  rect(ctx, 2, 6, 12, 1, h.stripe1);
  rect(ctx, 2, 11, 12, 1, h.stripe2);
  rect(ctx, 5, 3, 2, 3, h.stripe2);
  // volume: brilho no topo, sombra embaixo
  rect(ctx, 4, 3, 3, 1, shade(h.base, 0.45));
  rect(ctx, 3, 4, 1, 2, shade(h.base, 0.3));
  rect(ctx, 3, 12, 10, 1, shade(h.base, -0.3));
  rect(ctx, 12, 10, 2, 2, shade(h.base, -0.3));
  // viseira
  rect(ctx, 6, 7, 8, 3, h.visor);
  rect(ctx, 8, 8, 2, 1, '#7a8aa0');
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** Desenho do traçado da pista num canvas existente. */
export function drawTrack(target: HTMLCanvasElement, track: Track, color = '#e8e8e8', width = 3) {
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  const pts = fitShape(track.shape, target.width, target.height, 6);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = width + 2;
  strokePath(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  strokePath(ctx, pts);
  const [sx, sy] = pts[0];
  rect(ctx, Math.round(sx) - 2, Math.round(sy) - 2, 4, 4, '#ffd23f');
}

function strokePath(ctx: Ctx, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
}

export function fitShape(shape: [number, number][], w: number, h: number, pad: number): [number, number][] {
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const sw = Math.max(...xs) - minX || 1;
  const sh = Math.max(...ys) - minY || 1;
  const scale = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * scale) / 2;
  const oy = (h - sh * scale) / 2;
  return shape.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]);
}
