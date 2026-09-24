import { AERO_PARTS, ENGINE_PARTS, TYRE_PARTS } from '../engine/data/parts';
import type { Forecast, TyrePart } from '../engine/types';

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Barra de 10 segmentos; `bad` pinta em laranja (quanto mais, pior). */
export function bar(value: number, bad = false): string {
  const on = Math.round(Math.max(0, Math.min(1, value)) * 10);
  let out = `<span class="bar${bad ? ' bad' : ''}">`;
  for (let i = 0; i < 10; i++) out += `<i class="${i < on ? 'on' : ''}"></i>`;
  return `${out}</span>`;
}

const TYRE_COLOR: Record<string, string> = {
  P1: '#b04bff', P2: '#e43b44', P3: '#ff7b7b', P4: '#ffd23f', P5: '#f4f4f4',
  P6: '#8fd3ff', P7: '#3fd0c9', P8: '#ffb000', P9: '#3fbf6f', P10: '#3b8bea',
};

export function tyreBadge(id: string): string {
  return `<span class="tyre" style="border-color:${TYRE_COLOR[id]}" title="${esc(id)}">${esc(id.slice(1))}</span>`;
}

export function tyreColor(id: string): string {
  return TYRE_COLOR[id];
}

type Kind = 'aero' | 'engine' | 'tyre';

function stat(label: string, v: number, bad = false): string {
  return `<span>${label} ${bar(v, bad)}</span>`;
}

export function partPicker(kind: Kind, selected: string, action = 'pick', disabled = false): string {
  const rows =
    kind === 'aero'
      ? AERO_PARTS.map((p) => ({
          id: p.id, name: p.name, price: p.price, desc: p.description,
          stats: stat('Pressão', p.downforce) + stat('Arrasto', p.drag, true) + stat('Sens. vento', p.windSensitivity, true),
        }))
      : kind === 'engine'
        ? ENGINE_PARTS.map((p) => ({
            id: p.id, name: p.name, price: p.price, desc: p.description,
            stats:
              stat('Potência', p.power) + stat('Confiab.', (p.reliability - 0.6) / 0.4) + stat('Consumo', p.consumption, true) +
              stat('Calor', p.heatTolerance) + stat('Perda altitude', p.altitudeLoss / 0.3, true),
          }))
        : TYRE_PARTS.map((p) => ({
            id: p.id, name: p.name, price: p.price, desc: p.description,
            stats: tyreStats(p),
          }));
  return `<div class="parts">${rows
    .map(
      (r) => `<button class="part${r.id === selected ? ' selected' : ''}" data-act="${action}" data-kind="${kind}" data-id="${r.id}"${disabled ? ' disabled' : ''}>
        <span class="id">${kind === 'tyre' ? tyreBadge(r.id) : esc(r.id)}</span>
        <span><span>${esc(r.name)}</span><div class="desc">${esc(r.desc)}</div><div class="stats">${r.stats}</div></span>
        <span class="price">$${r.price}M</span>
      </button>`,
    )
    .join('')}</div>`;
}

function tyreStats(p: TyrePart): string {
  return (
    stat('Seco', (p.grip - 0.55) / 0.45) +
    stat('Chuva leve', p.wetGrip.light) +
    stat('Chuva forte', p.wetGrip.heavy) +
    stat('Desgaste', p.wear.dry / 3, true) +
    stat('Frio', (p.cold - 0.8) / 0.25) +
    stat('Calor', (p.hot - 0.8) / 0.2)
  );
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function forecastCard(f: Forecast, title: string, when: string): string {
  const rainIcon = f.rainProb >= 0.5 ? (f.heavyRainProb / Math.max(f.rainProb, 0.01) >= 0.5 ? '⛈️' : '🌧️') : f.rainProb >= 0.25 ? '⛅' : '☀️';
  const certain = f.confidence >= 1;
  return `<div class="panel tight forecast">
    <div class="row between"><h3>${esc(title)}</h3><span class="big">${rainIcon}</span></div>
    <div class="muted">${esc(when)}</div>
    ${certain ? '<div class="yellow">TEMPO REAL</div>' : `<div class="muted">Confiança da previsão: ${pct(f.confidence)}</div>`}
    <div>🌧️ Chuva: ${pct(f.rainProb)}${f.rainProb > 0 ? ` <span class="muted">(forte: ${pct(f.heavyRainProb)})</span>` : ''}</div>
    <div class="meter"><span style="width:${pct(f.rainProb)}"></span></div>
    <div>🌡️ ${f.tempRange[0]}–${f.tempRange[1]}°C · Calor: ${pct(f.hotProb)}</div>
    <div>💨 ${f.windRange[0]}–${f.windRange[1]} km/h · Vento: ${pct(f.windProb)}</div>
  </div>`;
}
