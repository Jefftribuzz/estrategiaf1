import { botChooseSetup, botChooseStrategy, getDifficulty } from './ai';
import { getAero, getEngine, getTyre, TYRE_PARTS, WEEKEND_BUDGET } from './data/parts';
import { getTeam, TEAMS } from './data/teams';
import { getTrack } from './data/tracks';
import { createRng } from './rng';
import {
  buildFor,
  simulatePractice,
  simulateQualifying,
  simulateRace,
  type PracticeRun,
  type QualiResult,
  type RaceEntry,
  type RaceResult,
} from './session';
import { strategyCost } from './strategy';
import { SESSIONS, type CarSetup, type Team, type Difficulty, type Forecast, type RaceStrategy, type SessionId } from './types';
import { forecastFor, rollWeekendWeather, type WeekendWeather } from './weather';

export const MAX_PRACTICE_RUNS = 3;

const TYRE_IDS = new Set(TYRE_PARTS.map((t) => t.id));

export const SESSION_LABEL: Record<SessionId, string> = {
  teste: 'Teste',
  classificacao: 'Classificação',
  corrida: 'Corrida',
};

export interface ScheduleItem {
  session: SessionId;
  date: string;
}

export interface WeekendState {
  version: 1;
  seed: number;
  trackId: string;
  playerTeamId: string;
  difficulty: Difficulty['id'];
  budget: number;
  weather: WeekendWeather;
  /** Quantas sessões já aconteceram (0 a 3). */
  completed: number;
  schedule: ScheduleItem[];
  practiceRuns: PracticeRun[];
  practiceBoard: { teamId: string; best: number }[];
  quali: QualiResult[] | null;
  setups: Record<string, CarSetup>;
  spent: Record<string, number>;
  strategies: Record<string, RaceStrategy>;
  race: RaceResult | null;
  /** Temporada: peças que o jogador já tem na garagem (não pagam de novo). */
  owned?: { aero: string[]; engine: string[] };
  /** Temporada: multiplicador de quebra por motor do jogador (desgaste). */
  engineWear?: Record<string, number>;
  /** Temporada: evolução do chassi de cada equipe (desenvolvimento). */
  mods?: Record<string, ChassisMods>;
  /** Orçamento dos bots neste fim de semana (padrão: o mesmo do jogador). */
  botBudget?: number;
  /** Multiplayer: todas as equipes humanas (o jogador local fica nos campos acima). */
  humans?: Record<string, HumanTeam>;
  /** Telemetria do teste de cada equipe humana. */
  practiceByTeam?: Record<string, PracticeRun[]>;
  /** Multiplayer: previsão calculada pelo servidor (o cliente não vê o tempo real). */
  forecastView?: Forecast[];
}

/** Situação de uma equipe humana no fim de semana. */
export interface HumanTeam {
  budget: number;
  owned?: { aero: string[]; engine: string[] };
  engineWear?: Record<string, number>;
}

/** Evolução do chassi conquistada com desenvolvimento. */
export interface ChassisMods {
  straight: number;
  slow: number;
  fast: number;
  /** Multiplicadores (1 = sem mudança). */
  tyreWear: number;
  reliability: number;
}

export interface WeekendConfig {
  trackId: string;
  playerTeamId: string;
  difficulty: Difficulty['id'];
  seed?: number;
  /** Data de referência do cronograma (padrão: agora). */
  now?: Date;
  budget?: number;
  owned?: WeekendState['owned'];
  engineWear?: WeekendState['engineWear'];
  mods?: WeekendState['mods'];
  botBudget?: number;
}

/** Cronograma: uma sessão por dia, às 20h, a partir do dia seguinte. */
export function buildSchedule(now: Date): ScheduleItem[] {
  return SESSIONS.map((session, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1 + i);
    d.setHours(20, 0, 0, 0);
    return { session, date: d.toISOString() };
  });
}

export function createWeekend(cfg: WeekendConfig): WeekendState {
  const seed = cfg.seed ?? Math.floor(Math.random() * 2 ** 31);
  const track = getTrack(cfg.trackId);
  getTeam(cfg.playerTeamId);
  const rng = createRng(seed);
  return {
    version: 1,
    seed,
    trackId: track.id,
    playerTeamId: cfg.playerTeamId,
    difficulty: cfg.difficulty,
    budget: cfg.budget ?? WEEKEND_BUDGET,
    weather: rollWeekendWeather(track, rng.fork('weather')),
    completed: 0,
    schedule: buildSchedule(cfg.now ?? new Date()),
    practiceRuns: [],
    practiceBoard: [],
    quali: null,
    setups: {},
    spent: {},
    strategies: {},
    race: null,
    owned: cfg.owned,
    engineWear: cfg.engineWear,
    mods: cfg.mods,
    botBudget: cfg.botBudget,
  };
}

export function forecasts(state: WeekendState): Forecast[] {
  if (state.forecastView) return state.forecastView;
  const track = getTrack(state.trackId);
  return SESSIONS.map((s) => forecastFor(track, state.weather, state.seed, s, state.completed));
}

export function forecastOf(state: WeekendState, session: SessionId): Forecast {
  return forecastFor(getTrack(state.trackId), state.weather, state.seed, session, state.completed);
}

export function setupCost(setup: CarSetup): number {
  return getAero(setup.aero).price + getEngine(setup.engine).price + getTyre(setup.tyre).price;
}

/** Equipe humana (jogador local ou participante da liga), ou undefined se for bot. */
export function humanInfo(state: WeekendState, teamId: string): HumanTeam | undefined {
  if (state.humans) return state.humans[teamId];
  if (teamId === state.playerTeamId) return { budget: state.budget, owned: state.owned, engineWear: state.engineWear };
  return undefined;
}

export function humanIds(state: WeekendState): string[] {
  return state.humans ? Object.keys(state.humans) : [state.playerTeamId];
}

/** Preço efetivo de uma peça para uma equipe (0 se já está na garagem dela). */
export function partPrice(state: WeekendState, teamId: string, kind: 'aero' | 'engine', id: string): number {
  if (humanInfo(state, teamId)?.owned?.[kind].includes(id)) return 0;
  return kind === 'aero' ? getAero(id).price : getEngine(id).price;
}

/** Quanto um acerto custa de verdade para uma equipe neste fim de semana. */
export function costFor(state: WeekendState, teamId: string, setup: CarSetup): number {
  return partPrice(state, teamId, 'aero', setup.aero) + partPrice(state, teamId, 'engine', setup.engine) + getTyre(setup.tyre).price;
}

export function budgetOf(state: WeekendState, teamId: string): number {
  return humanInfo(state, teamId)?.budget ?? state.botBudget ?? state.budget;
}

/** Equipe com a evolução do chassi e o desgaste do motor aplicados. */
export function teamFor(state: WeekendState, teamId: string, engineId?: string): Team {
  const t = getTeam(teamId);
  const m = state.mods?.[teamId];
  const wear = engineId ? (humanInfo(state, teamId)?.engineWear?.[engineId] ?? 1) : 1;
  if (!m && wear === 1) return t;
  const c = t.chassis;
  return {
    ...t,
    chassis: {
      straight: c.straight + (m?.straight ?? 0),
      slow: c.slow + (m?.slow ?? 0),
      fast: c.fast + (m?.fast ?? 0),
      tyreWear: c.tyreWear * (m?.tyreWear ?? 1),
      reliability: c.reliability * (m?.reliability ?? 1) * wear,
    },
  };
}

function botSetup(state: WeekendState, teamId: string, rngLabel: string, qualiSession: SessionId): CarSetup {
  const track = getTrack(state.trackId);
  const diff = getDifficulty(state.difficulty);
  const rng = createRng(state.seed).fork(rngLabel);
  return botChooseSetup(teamFor(state, teamId), track, forecastOf(state, qualiSession), forecastOf(state, 'corrida'), budgetOf(state, teamId), diff, rng, {
    price: (kind, id) => partPrice(state, teamId, kind, id),
    teamFor: (engineId) => teamFor(state, teamId, engineId),
  });
}

/** D1 — Teste: o jogador experimenta até 3 acertos. */
export function runPractice(state: WeekendState, playerSetups: CarSetup[]): WeekendState {
  if (playerSetups.length < 1 || playerSetups.length > MAX_PRACTICE_RUNS) throw new Error(`Escolha de 1 a ${MAX_PRACTICE_RUNS} acertos.`);
  return runPracticeMulti(state, { [state.playerTeamId]: playerSetups });
}

/** Teste com as decisões de cada equipe humana; quem não decidiu fica com o engenheiro. */
export function runPracticeMulti(state: WeekendState, decisions: Record<string, CarSetup[]>): WeekendState {
  if (state.completed !== 0) throw new Error('O teste já aconteceu.');
  const track = getTrack(state.trackId);
  const weather = state.weather.teste;
  const rng = createRng(state.seed).fork('practice');
  const humans = new Set(humanIds(state));
  const byTeam: Record<string, PracticeRun[]> = {};
  const board = TEAMS.map((team) => {
    if (humans.has(team.id)) {
      const d = decisions[team.id];
      const setups = d && d.length >= 1 && d.length <= MAX_PRACTICE_RUNS ? d : [botSetup(state, team.id, `engineer:0:${team.id}`, 'teste')];
      const runs = setups.map((su, i) => simulatePractice(teamFor(state, team.id, su.engine), su, track, weather, rng.fork(`run:${team.id}:${i}`)));
      byTeam[team.id] = runs;
      return { teamId: team.id, best: Math.min(...runs.map((r) => r.best)) };
    }
    const setup = botSetup(state, team.id, `practice:bot:${team.id}`, 'teste');
    return { teamId: team.id, best: simulatePractice(teamFor(state, team.id), setup, track, weather, rng.fork(`bot:${team.id}`)).best };
  }).sort((a, b) => a.best - b.best);
  return {
    ...state,
    practiceRuns: byTeam[state.playerTeamId] ?? [],
    practiceByTeam: state.humans ? byTeam : undefined,
    practiceBoard: board,
    completed: 1,
  };
}

/** D2 — Classificação: aero e motor ficam travados daqui em diante (parque fechado). */
export function runQualifying(state: WeekendState, playerSetup: CarSetup): WeekendState {
  if (state.completed !== 1) throw new Error('A classificação não está disponível agora.');
  const cost = costFor(state, state.playerTeamId, playerSetup);
  const budget = budgetOf(state, state.playerTeamId);
  if (cost > budget) throw new Error(`Acerto custa $${cost}M e o orçamento é $${budget}M.`);
  return runQualifyingMulti(state, { [state.playerTeamId]: playerSetup });
}

export function validateSetupFor(state: WeekendState, teamId: string, setup: CarSetup): string | null {
  let cost: number;
  try {
    cost = costFor(state, teamId, setup);
  } catch {
    return 'Peça desconhecida.';
  }
  const budget = budgetOf(state, teamId);
  return cost > budget ? `Acerto custa $${cost}M e o orçamento é $${budget}M.` : null;
}

export function runQualifyingMulti(state: WeekendState, decisions: Record<string, CarSetup>): WeekendState {
  if (state.completed !== 1) throw new Error('A classificação não está disponível agora.');
  const track = getTrack(state.trackId);
  const rng = createRng(state.seed).fork('quali');
  const setups: Record<string, CarSetup> = {};
  for (const team of TEAMS) {
    const d = decisions[team.id];
    const human = humanInfo(state, team.id);
    setups[team.id] = human && d && !validateSetupFor(state, team.id, d)
      ? d
      : botSetup(state, team.id, human ? `engineer:1:${team.id}` : `quali:bot:${team.id}`, 'classificacao');
  }
  const quali = simulateQualifying(
    TEAMS.map((team) => ({ team: teamFor(state, team.id, setups[team.id].engine), setup: setups[team.id] })),
    track,
    state.weather.classificacao,
    rng,
  );
  const spent = Object.fromEntries(TEAMS.map((t) => [t.id, costFor(state, t.id, setups[t.id])]));
  return { ...state, quali, setups, spent, completed: 2 };
}

export function validateStrategy(state: WeekendState, s: RaceStrategy): string | null {
  return validateStrategyFor(state, state.playerTeamId, s);
}

export function validateStrategyFor(state: WeekendState, teamId: string, s: RaceStrategy): string | null {
  const track = getTrack(state.trackId);
  if (!Array.isArray(s?.stints) || !Array.isArray(s?.pitLaps) || !['poupar', 'normal', 'agressivo'].includes(s.mode)) return 'Estratégia inválida.';
  if (s.stints.some((id) => !TYRE_IDS.has(id))) return 'Pneu desconhecido.';
  if (s.stints.length < 1 || s.stints.length > 4) return 'Escolha de 0 a 3 paradas.';
  if (s.pitLaps.length !== s.stints.length - 1) return 'Defina a volta de cada parada.';
  for (let i = 0; i < s.pitLaps.length; i++) {
    const lap = s.pitLaps[i];
    if (!Number.isInteger(lap) || lap < 1 || lap >= track.laps) return `Parada ${i + 1}: volta deve estar entre 1 e ${track.laps - 1}.`;
    if (i > 0 && lap <= s.pitLaps[i - 1]) return 'As paradas devem estar em ordem crescente.';
  }
  const left = budgetOf(state, teamId) - (state.spent[teamId] ?? 0);
  const cost = strategyCost(s);
  if (cost > left) return `Os pneus custam $${cost}M e só restam $${left}M.`;
  return null;
}

function botStrategy(state: WeekendState, teamId: string): RaceStrategy {
  const setup = state.setups[teamId];
  return botChooseStrategy(
    teamFor(state, teamId, setup.engine),
    setup,
    getTrack(state.trackId),
    forecastOf(state, 'corrida'),
    budgetOf(state, teamId) - (state.spent[teamId] ?? 0),
    getDifficulty(state.difficulty),
    state.seed,
  );
}

/** D3 — Corrida. */
export function runRace(state: WeekendState, playerStrategy: RaceStrategy): WeekendState {
  if (state.completed !== 2 || !state.quali) throw new Error('A corrida não está disponível agora.');
  const err = validateStrategy(state, playerStrategy);
  if (err) throw new Error(err);
  return runRaceMulti(state, { [state.playerTeamId]: playerStrategy });
}

export function runRaceMulti(state: WeekendState, decisions: Record<string, RaceStrategy>): WeekendState {
  if (state.completed !== 2 || !state.quali) throw new Error('A corrida não está disponível agora.');
  const track = getTrack(state.trackId);
  const strategies: Record<string, RaceStrategy> = {};
  for (const team of TEAMS) {
    const d = decisions[team.id];
    strategies[team.id] = humanInfo(state, team.id) && d && !validateStrategyFor(state, team.id, d) ? d : botStrategy(state, team.id);
  }
  const grid: RaceEntry[] = state.quali.map((q) => {
    const team = teamFor(state, q.teamId, state.setups[q.teamId].engine);
    return { team, build: buildFor(team, state.setups[q.teamId]), strategy: strategies[q.teamId] };
  });
  const race = simulateRace(grid, track, state.weather.corrida, createRng(state.seed).fork('race'));
  const spent = { ...state.spent };
  for (const team of TEAMS) spent[team.id] += strategyCost(strategies[team.id]);
  return { ...state, strategies, spent, race, completed: 3 };
}

// ------------------------------------------------ engenheiro automático ---
// Usado para "pular dia": o engenheiro decide a sessão pelo jogador, com a
// mesma lógica de um bot de dificuldade normal.

export function engineerSetup(state: WeekendState): CarSetup {
  const session: SessionId = state.completed === 0 ? 'teste' : 'classificacao';
  return botSetup(state, state.playerTeamId, `engineer:${state.completed}`, session);
}

export function engineerStrategy(state: WeekendState): RaceStrategy {
  return botStrategy(state, state.playerTeamId);
}

/** Roda a próxima sessão com as decisões do engenheiro. */
export function skipSession(state: WeekendState): WeekendState {
  return runNextSession(state, {});
}

/** Decisões de uma sessão, por equipe humana. */
export type SessionDecisions = {
  teste?: Record<string, CarSetup[]>;
  classificacao?: Record<string, CarSetup>;
  corrida?: Record<string, RaceStrategy>;
};

/** Roda a próxima sessão; humanos sem decisão válida ficam com o engenheiro. */
export function runNextSession(state: WeekendState, d: SessionDecisions): WeekendState {
  switch (state.completed) {
    case 0:
      return runPracticeMulti(state, d.teste ?? {});
    case 1:
      return runQualifyingMulti(state, d.classificacao ?? {});
    case 2:
      return runRaceMulti(state, d.corrida ?? {});
    default:
      return state;
  }
}

/** Simula todas as sessões restantes do fim de semana. */
export function simulateRestOfWeekend(state: WeekendState): WeekendState {
  let s = state;
  while (s.completed < 3) s = skipSession(s);
  return s;
}
