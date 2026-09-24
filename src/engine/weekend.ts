import { botChooseSetup, botChooseStrategy, getDifficulty } from './ai';
import { getAero, getEngine, getTyre, WEEKEND_BUDGET } from './data/parts';
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
import { SESSIONS, type CarSetup, type Difficulty, type Forecast, type RaceStrategy, type SessionId } from './types';
import { forecastFor, rollWeekendWeather, type WeekendWeather } from './weather';

export const MAX_PRACTICE_RUNS = 3;

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
}

export interface WeekendConfig {
  trackId: string;
  playerTeamId: string;
  difficulty: Difficulty['id'];
  seed?: number;
  /** Data de referência do cronograma (padrão: agora). */
  now?: Date;
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
    budget: WEEKEND_BUDGET,
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
  };
}

export function forecasts(state: WeekendState): Forecast[] {
  const track = getTrack(state.trackId);
  return SESSIONS.map((s) => forecastFor(track, state.weather, state.seed, s, state.completed));
}

export function forecastOf(state: WeekendState, session: SessionId): Forecast {
  return forecastFor(getTrack(state.trackId), state.weather, state.seed, session, state.completed);
}

export function setupCost(setup: CarSetup): number {
  return getAero(setup.aero).price + getEngine(setup.engine).price + getTyre(setup.tyre).price;
}

/** D1 — Teste: o jogador experimenta até 3 acertos. */
export function runPractice(state: WeekendState, playerSetups: CarSetup[]): WeekendState {
  if (state.completed !== 0) throw new Error('O teste já aconteceu.');
  if (playerSetups.length < 1 || playerSetups.length > MAX_PRACTICE_RUNS) throw new Error(`Escolha de 1 a ${MAX_PRACTICE_RUNS} acertos.`);
  const track = getTrack(state.trackId);
  const weather = state.weather.teste;
  const rng = createRng(state.seed).fork('practice');
  const diff = getDifficulty(state.difficulty);
  const player = getTeam(state.playerTeamId);
  const runs = playerSetups.map((s, i) => simulatePractice(player, s, track, weather, rng.fork(`player:${i}`)));
  const board = TEAMS.map((team) => {
    if (team.id === player.id) return { teamId: team.id, best: Math.min(...runs.map((r) => r.best)) };
    const botRng = rng.fork(`bot:${team.id}`);
    const setup = botChooseSetup(team, track, forecastOf(state, 'teste'), forecastOf(state, 'corrida'), state.budget, diff, botRng);
    return { teamId: team.id, best: simulatePractice(team, setup, track, weather, botRng).best };
  }).sort((a, b) => a.best - b.best);
  return { ...state, practiceRuns: runs, practiceBoard: board, completed: 1 };
}

/** D2 — Classificação: aero e motor ficam travados daqui em diante (parque fechado). */
export function runQualifying(state: WeekendState, playerSetup: CarSetup): WeekendState {
  if (state.completed !== 1) throw new Error('A classificação não está disponível agora.');
  const cost = setupCost(playerSetup);
  if (cost > state.budget) throw new Error(`Acerto custa $${cost}M e o orçamento é $${state.budget}M.`);
  const track = getTrack(state.trackId);
  const rng = createRng(state.seed).fork('quali');
  const diff = getDifficulty(state.difficulty);
  const qF = forecastOf(state, 'classificacao');
  const rF = forecastOf(state, 'corrida');
  const setups: Record<string, CarSetup> = {};
  for (const team of TEAMS) {
    setups[team.id] = team.id === state.playerTeamId
      ? playerSetup
      : botChooseSetup(team, track, qF, rF, state.budget, diff, rng.fork(`bot:${team.id}`));
  }
  const quali = simulateQualifying(TEAMS.map((team) => ({ team, setup: setups[team.id] })), track, state.weather.classificacao, rng);
  const spent = Object.fromEntries(TEAMS.map((t) => [t.id, setupCost(setups[t.id])]));
  return { ...state, quali, setups, spent, completed: 2 };
}

export function validateStrategy(state: WeekendState, s: RaceStrategy): string | null {
  const track = getTrack(state.trackId);
  if (s.stints.length < 1 || s.stints.length > 4) return 'Escolha de 0 a 3 paradas.';
  if (s.pitLaps.length !== s.stints.length - 1) return 'Defina a volta de cada parada.';
  for (let i = 0; i < s.pitLaps.length; i++) {
    const lap = s.pitLaps[i];
    if (!Number.isInteger(lap) || lap < 1 || lap >= track.laps) return `Parada ${i + 1}: volta deve estar entre 1 e ${track.laps - 1}.`;
    if (i > 0 && lap <= s.pitLaps[i - 1]) return 'As paradas devem estar em ordem crescente.';
  }
  const left = state.budget - (state.spent[state.playerTeamId] ?? 0);
  const cost = strategyCost(s);
  if (cost > left) return `Os pneus custam $${cost}M e só restam $${left}M.`;
  return null;
}

/** D3 — Corrida. */
export function runRace(state: WeekendState, playerStrategy: RaceStrategy): WeekendState {
  if (state.completed !== 2 || !state.quali) throw new Error('A corrida não está disponível agora.');
  const err = validateStrategy(state, playerStrategy);
  if (err) throw new Error(err);
  const track = getTrack(state.trackId);
  const diff = getDifficulty(state.difficulty);
  const rF = forecastOf(state, 'corrida');
  const strategies: Record<string, RaceStrategy> = {};
  for (const team of TEAMS) {
    strategies[team.id] = team.id === state.playerTeamId
      ? playerStrategy
      : botChooseStrategy(team, state.setups[team.id], track, rF, state.budget - state.spent[team.id], diff, state.seed);
  }
  const grid: RaceEntry[] = state.quali.map((q) => {
    const team = getTeam(q.teamId);
    return { team, build: buildFor(team, state.setups[team.id]), strategy: strategies[team.id] };
  });
  const race = simulateRace(grid, track, state.weather.corrida, createRng(state.seed).fork('race'));
  const spent = { ...state.spent };
  for (const team of TEAMS) spent[team.id] += strategyCost(strategies[team.id]);
  return { ...state, strategies, spent, race, completed: 3 };
}
