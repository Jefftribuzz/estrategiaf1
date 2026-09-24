import { getDifficulty } from './ai';
import { getAero, getEngine } from './data/parts';
import { TEAMS } from './data/teams';
import { createRng, hashString } from './rng';
import { POINTS } from './session';
import type { Difficulty } from './types';
import { createWeekend, type ChassisMods, type WeekendState } from './weekend';

// Temporada de 10 GPs, estilo Elifoot: caixa, garagem, desgaste de motor,
// desenvolvimento do carro e campeonato.

export const SEASON_CALENDAR = ['baku', 'monaco', 'montreal', 'silverstone', 'hungaroring', 'spa', 'monza', 'suzuka', 'mexico', 'interlagos'];
export const START_CASH = 150;
export const SPONSOR_PER_GP = 12;
/** Prêmio em $M por posição de chegada (1º ao 10º). */
export const PRIZE = [14, 11, 9, 7, 6, 5, 4, 3, 2, 1];
export const DAYS_PER_GP = 3;
export const MAX_DEV_LEVEL = 5;

export type DevArea = 'straight' | 'slow' | 'fast' | 'reliability' | 'tyres';

export const DEV_AREAS: { id: DevArea; label: string; short: string; description: string }[] = [
  { id: 'straight', label: 'Retas', short: 'Retas', description: 'Carenagem e arrefecimento: mais velocidade final.' },
  { id: 'slow', label: 'Curvas lentas', short: 'Lentas', description: 'Suspensão e tração: mais aderência mecânica.' },
  { id: 'fast', label: 'Curvas rápidas', short: 'Rápid.', description: 'Assoalho e difusor: mais pressão aerodinâmica.' },
  { id: 'reliability', label: 'Confiabilidade', short: 'Conf.', description: 'Controle de qualidade: menos quebras.' },
  { id: 'tyres', label: 'Pneus', short: 'Pneus', description: 'Geometria de suspensão: menos desgaste.' },
];

/** Custo para subir do nível `level` para `level + 1`. */
export function devCost(level: number): number {
  return 8 + level * 6;
}

const BOT_WEEKEND_BUDGET: Record<Difficulty['id'], number> = { facil: 42, normal: 48, dificil: 55 };

export type DevLevels = Record<DevArea, number>;

export interface OwnedEngine {
  id: string;
  /** Corridas já disputadas com este motor. */
  races: number;
}

export interface LedgerEntry {
  round: number;
  label: string;
  amount: number;
}

export interface RoundResult {
  trackId: string;
  order: { teamId: string; position: number; points: number; status: 'finished' | 'dnf' }[];
  fastestLap: string;
}

export interface SeasonState {
  version: 1;
  seed: number;
  playerTeamId: string;
  difficulty: Difficulty['id'];
  startDate: string;
  calendar: string[];
  /** Índice do próximo GP (0 a 10). */
  round: number;
  cash: number;
  ledger: LedgerEntry[];
  ownedAero: string[];
  engines: OwnedEngine[];
  dev: Record<string, DevLevels>;
  botCash: Record<string, number>;
  points: Record<string, number>;
  results: RoundResult[];
  weekend: WeekendState | null;
  finished: boolean;
  /** Multiplayer: início de cada GP (ISO), vindo do cronograma da liga. */
  gpTimes?: string[];
}

export interface SeasonConfig {
  playerTeamId: string;
  difficulty: Difficulty['id'];
  seed?: number;
  now?: Date;
}

const zeroDev = (): DevLevels => ({ straight: 0, slow: 0, fast: 0, reliability: 0, tyres: 0 });

export function createSeason(cfg: SeasonConfig): SeasonState {
  getDifficulty(cfg.difficulty);
  const start = new Date(cfg.now ?? new Date());
  return {
    version: 1,
    seed: cfg.seed ?? Math.floor(Math.random() * 2 ** 31),
    playerTeamId: cfg.playerTeamId,
    difficulty: cfg.difficulty,
    startDate: start.toISOString(),
    calendar: [...SEASON_CALENDAR],
    round: 0,
    cash: START_CASH,
    ledger: [{ round: 0, label: 'Caixa inicial', amount: START_CASH }],
    ownedAero: [],
    engines: [],
    dev: Object.fromEntries(TEAMS.map((t) => [t.id, zeroDev()])),
    botCash: Object.fromEntries(TEAMS.map((t) => [t.id, 0])),
    points: Object.fromEntries(TEAMS.map((t) => [t.id, 0])),
    results: [],
    weekend: null,
    finished: false,
  };
}

/** Risco de quebra cresce com o uso; passado da vida útil, fica 3x maior. */
export function engineWearMul(e: OwnedEngine): number {
  const life = getEngine(e.id).life;
  return e.races < life ? 1 + (0.3 * e.races) / life : 3 + (e.races - life);
}

export function modsFor(levels: DevLevels): ChassisMods {
  return {
    straight: levels.straight * 0.006,
    slow: levels.slow * 0.006,
    fast: levels.fast * 0.006,
    reliability: 1 - levels.reliability * 0.08,
    tyreWear: 1 - levels.tyres * 0.03,
  };
}

export function gpDate(season: SeasonState, round: number): Date {
  if (season.gpTimes?.[round]) {
    // Na liga, o calendário mostra o dia anterior à primeira sessão do GP.
    const d = new Date(season.gpTimes[round]);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const d = new Date(season.startDate);
  d.setDate(d.getDate() + round * DAYS_PER_GP);
  return d;
}

function spend(season: SeasonState, amount: number, label: string): SeasonState {
  if (amount > season.cash) throw new Error(`Caixa insuficiente: faltam $${amount - season.cash}M.`);
  return { ...season, cash: season.cash - amount, ledger: [...season.ledger, { round: season.round, label, amount: -amount }] };
}

/** Abre o fim de semana do próximo GP (credita o patrocínio). */
export function startRound(season: SeasonState): SeasonState {
  if (season.finished) throw new Error('A temporada acabou.');
  if (season.weekend) return season;
  const trackId = season.calendar[season.round];
  const cash = season.cash + SPONSOR_PER_GP;
  const weekend = createWeekend({
    trackId,
    playerTeamId: season.playerTeamId,
    difficulty: season.difficulty,
    seed: hashString(`${season.seed}:gp:${season.round}`),
    now: gpDate(season, season.round),
    budget: cash,
    owned: { aero: [...season.ownedAero], engine: season.engines.map((e) => e.id) },
    engineWear: Object.fromEntries(season.engines.map((e) => [e.id, engineWearMul(e)])),
    mods: Object.fromEntries(Object.entries(season.dev).map(([id, lv]) => [id, modsFor(lv)])),
    botBudget: BOT_WEEKEND_BUDGET[season.difficulty],
  });
  return {
    ...season,
    cash,
    ledger: [...season.ledger, { round: season.round, label: 'Patrocínio', amount: SPONSOR_PER_GP }],
    weekend,
  };
}

export function updateWeekend(season: SeasonState, weekend: WeekendState): SeasonState {
  return { ...season, weekend };
}

/** Parte da temporada que pertence a uma equipe humana. */
export interface HumanSeason {
  cash: number;
  ledger: LedgerEntry[];
  ownedAero: string[];
  engines: OwnedEngine[];
}

/** Fecha o GP para uma equipe humana: paga peças, garagem, desgaste e prêmio. */
export function applyHumanRound(h: HumanSeason, w: WeekendState, teamId: string, round: number): HumanSeason {
  const setup = w.setups[teamId];
  const spent = w.spent[teamId] ?? 0;
  let ledger = [...h.ledger, { round, label: 'Peças e pneus', amount: -spent }];
  let cash = h.cash - spent;
  const ownedAero = h.ownedAero.includes(setup.aero) ? [...h.ownedAero] : [...h.ownedAero, setup.aero];
  let engines = h.engines.some((e) => e.id === setup.engine) ? [...h.engines] : [...h.engines, { id: setup.engine, races: 0 }];
  engines = engines.map((e) => (e.id === setup.engine ? { ...e, races: e.races + 1 } : e));
  const mine = w.race!.classification.find((c) => c.teamId === teamId)!;
  let aero = ownedAero;
  if (mine.reason === 'Acidente') {
    aero = ownedAero.filter((a) => a !== setup.aero);
    ledger = [...ledger, { round, label: `${getAero(setup.aero).name} destruída no acidente`, amount: 0 }];
  }
  const prize = mine.status === 'finished' ? (PRIZE[mine.position - 1] ?? 0) : 0;
  if (prize) {
    cash += prize;
    ledger = [...ledger, { round, label: `Prêmio (P${mine.position})`, amount: prize }];
  }
  return { cash, ledger, ownedAero: aero, engines };
}

/** Pontos do GP e desenvolvimento dos bots com o dinheiro dos prêmios. */
export function applyRoundToField(
  w: WeekendState,
  humans: Set<string>,
  points: Record<string, number>,
  botCash: Record<string, number>,
  dev: Record<string, DevLevels>,
  seed: number,
  round: number,
): { points: Record<string, number>; botCash: Record<string, number>; dev: Record<string, DevLevels>; result: RoundResult } {
  const p = { ...points };
  const cash = { ...botCash };
  for (const c of w.race!.classification) {
    p[c.teamId] += c.points;
    if (!humans.has(c.teamId) && c.status === 'finished') cash[c.teamId] += PRIZE[c.position - 1] ?? 0;
  }
  const d = { ...dev };
  const rng = createRng(seed).fork(`dev:${round}`);
  for (const team of TEAMS) {
    if (humans.has(team.id)) continue;
    const lv = { ...d[team.id] };
    const open = DEV_AREAS.filter((a) => lv[a.id] < MAX_DEV_LEVEL);
    if (!open.length) continue;
    const minLevel = Math.min(...open.map((a) => lv[a.id]));
    const area = rng.pick(open.filter((a) => lv[a.id] === minLevel)).id;
    const cost = devCost(lv[area]);
    if (cash[team.id] >= cost) {
      cash[team.id] -= cost;
      lv[area]++;
      d[team.id] = lv;
    }
  }
  const result: RoundResult = {
    trackId: w.trackId,
    order: w.race!.classification.map((c) => ({ teamId: c.teamId, position: c.position, points: c.points, status: c.status })),
    fastestLap: w.race!.fastestLap.teamId,
  };
  return { points: p, botCash: cash, dev: d, result };
}

/** Fecha o GP: paga peças, prêmios, pontos, desgaste e desenvolvimento dos bots. */
export function finishRound(season: SeasonState): SeasonState {
  const w = season.weekend;
  if (!w || w.completed < 3 || !w.race) throw new Error('O GP ainda não terminou.');
  const me = season.playerTeamId;
  const h = applyHumanRound(season, w, me, season.round);
  const field = applyRoundToField(w, new Set([me]), season.points, season.botCash, season.dev, season.seed, season.round);
  const round = season.round + 1;
  return {
    ...season,
    ...h,
    points: field.points,
    botCash: field.botCash,
    dev: field.dev,
    results: [...season.results, field.result],
    round,
    weekend: null,
    finished: round >= season.calendar.length,
  };
}

export function buyDevelopment(season: SeasonState, area: DevArea): SeasonState {
  const lv = season.dev[season.playerTeamId][area];
  if (lv >= MAX_DEV_LEVEL) throw new Error('Área já no nível máximo.');
  if (season.weekend) throw new Error('Desenvolvimento só entre um GP e outro.');
  const label = DEV_AREAS.find((a) => a.id === area)!.label;
  const s = spend(season, devCost(lv), `Desenvolvimento: ${label} nível ${lv + 1}`);
  return { ...s, dev: { ...s.dev, [season.playerTeamId]: { ...s.dev[season.playerTeamId], [area]: lv + 1 } } };
}

/** Compra um motor novo (substitui o usado do mesmo modelo, se houver). */
export function buyEngine(season: SeasonState, id: string): SeasonState {
  if (season.weekend) throw new Error('Compras na garagem só entre um GP e outro.');
  const e = getEngine(id);
  const s = spend(season, e.price, `Motor novo: ${e.name}`);
  return { ...s, engines: [...s.engines.filter((x) => x.id !== id), { id, races: 0 }] };
}

export function buyAero(season: SeasonState, id: string): SeasonState {
  if (season.weekend) throw new Error('Compras na garagem só entre um GP e outro.');
  if (season.ownedAero.includes(id)) throw new Error('Essa asa já está na garagem.');
  const a = getAero(id);
  const s = spend(season, a.price, `Aerodinâmica: ${a.name}`);
  return { ...s, ownedAero: [...s.ownedAero, id] };
}

export interface StandingRow {
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
  position: number;
}

export function standings(season: SeasonState): StandingRow[] {
  const rows = TEAMS.map((t) => {
    const finishes = season.results.map((r) => r.order.find((o) => o.teamId === t.id)!);
    return {
      teamId: t.id,
      points: season.points[t.id],
      wins: finishes.filter((f) => f.position === 1 && f.status === 'finished').length,
      podiums: finishes.filter((f) => f.position <= 3 && f.status === 'finished').length,
      position: 0,
    };
  });
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums);
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}

export { POINTS };
