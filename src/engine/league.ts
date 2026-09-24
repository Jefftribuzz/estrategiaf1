import { getDifficulty } from './ai';
import { getAero, getEngine } from './data/parts';
import { TEAMS } from './data/teams';
import { getTrack } from './data/tracks';
import { hashString } from './rng';
import {
  applyHumanRound,
  applyRoundToField,
  DEV_AREAS,
  devCost,
  engineWearMul,
  MAX_DEV_LEVEL,
  modsFor,
  SEASON_CALENDAR,
  SPONSOR_PER_GP,
  START_CASH,
  type DevArea,
  type DevLevels,
  type HumanSeason,
  type SeasonState,
} from './season';
import { SESSIONS, type CarSetup, type Difficulty, type RaceStrategy, type SessionId, type Weather } from './types';
import { forecastFor } from './weather';
import {
  createWeekend,
  humanIds,
  MAX_PRACTICE_RUNS,
  runNextSession,
  validateSetupFor,
  validateStrategyFor,
  type HumanTeam,
  type SessionDecisions,
  type WeekendState,
} from './weekend';

// Liga multiplayer: até 10 humanos numa temporada, com as vagas restantes
// preenchidas por bots. O servidor guarda este estado e o avança de forma
// "preguiçosa": a cada acesso, todas as sessões cujo horário já passou são
// simuladas. Como o motor é determinístico, o resultado é o mesmo que seria
// se a sessão tivesse rodado exatamente no horário marcado.

export type Pace = 'diario' | 'rapido';
export type LeagueStatus = 'lobby' | 'running' | 'finished';

/** Horário das sessões no fuso da liga (padrão: o fuso de quem criou). */
export const SESSION_HOUR = 20;
/** Liga rápida: uma sessão a cada N minutos (bom para testar com amigos). */
export const FAST_SESSION_MINUTES = 10;

export interface LeagueSlot extends HumanSeason {
  userId: string;
  name: string;
}

export interface LeagueState {
  version: 1;
  id: string;
  name: string;
  code: string;
  ownerId: string;
  difficulty: Difficulty['id'];
  timezone: string;
  pace: Pace;
  seed: number;
  calendar: string[];
  status: LeagueStatus;
  createdAt: string;
  /** Liga diária: dia (AAAA-MM-DD, no fuso da liga) da primeira sessão. */
  startDay?: string;
  /** Liga rápida: instante da primeira sessão. */
  startAt?: string;
  round: number;
  humans: Record<string, LeagueSlot>;
  dev: Record<string, DevLevels>;
  botCash: Record<string, number>;
  points: Record<string, number>;
  results: SeasonState['results'];
  weekend: WeekendState | null;
  /** Último GP concluído (para replay e resultado). */
  lastWeekend?: WeekendState | null;
  decisions: SessionDecisions;
  /** Aumenta a cada mudança (o cliente usa para saber se precisa redesenhar). */
  rev: number;
}

export interface CreateLeagueInput {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  difficulty: Difficulty['id'];
  timezone: string;
  pace: Pace;
  seed: number;
  now: Date;
}

const zeroDev = (): DevLevels => ({ straight: 0, slow: 0, fast: 0, reliability: 0, tyres: 0 });

export function createLeague(i: CreateLeagueInput): LeagueState {
  getDifficulty(i.difficulty);
  assertTimezone(i.timezone);
  const name = i.name.trim().slice(0, 40);
  if (!name) throw new Error('Dê um nome para a liga.');
  return {
    version: 1,
    id: i.id,
    name,
    code: i.code,
    ownerId: i.ownerId,
    difficulty: i.difficulty,
    timezone: i.timezone,
    pace: i.pace,
    seed: i.seed,
    calendar: [...SEASON_CALENDAR],
    status: 'lobby',
    createdAt: i.now.toISOString(),
    round: 0,
    humans: {},
    dev: Object.fromEntries(TEAMS.map((t) => [t.id, zeroDev()])),
    botCash: Object.fromEntries(TEAMS.map((t) => [t.id, 0])),
    points: Object.fromEntries(TEAMS.map((t) => [t.id, 0])),
    results: [],
    weekend: null,
    decisions: {},
    rev: 0,
  };
}

// ----------------------------------------------------------- fuso/horário --

function assertTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(`Fuso horário inválido: ${tz}`);
  }
}

/** Diferença (ms) entre o horário local do fuso e UTC num instante. */
function tzOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ms;
}

/** Instante UTC de um horário local (dia + hora) num fuso, respeitando horário de verão. */
export function zonedInstant(day: string, hour: number, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return new Date(t);
}

/** Dia (AAAA-MM-DD) de um instante no fuso dado. */
export function localDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Horário da sessão global `k` (GP = k / 3, sessão = k % 3). */
export function sessionInstant(l: LeagueState, k: number): Date {
  if (l.pace === 'rapido') return new Date(new Date(l.startAt!).getTime() + k * FAST_SESSION_MINUTES * 60_000);
  return zonedInstant(addDays(l.startDay!, k), SESSION_HOUR, l.timezone);
}

export function currentSessionIndex(l: LeagueState): number {
  return l.round * 3 + (l.weekend?.completed ?? 0);
}

export function nextDeadline(l: LeagueState): Date | null {
  if (l.status !== 'running' || !l.weekend) return null;
  return sessionInstant(l, currentSessionIndex(l));
}

// ------------------------------------------------------------------ lobby --

export function joinLeague(l: LeagueState, userId: string, name: string, teamId: string): LeagueState {
  if (l.status !== 'lobby') throw new Error('A temporada já começou: não dá mais para entrar.');
  if (!TEAMS.some((t) => t.id === teamId)) throw new Error('Equipe desconhecida.');
  const taken = l.humans[teamId];
  if (taken && taken.userId !== userId) throw new Error(`${taken.name} já escolheu essa equipe.`);
  const humans = Object.fromEntries(Object.entries(l.humans).filter(([, s]) => s.userId !== userId));
  humans[teamId] = { userId, name: name.slice(0, 20), cash: START_CASH, ledger: [{ round: 0, label: 'Caixa inicial', amount: START_CASH }], ownedAero: [], engines: [] };
  return { ...l, humans, rev: l.rev + 1 };
}

export function leaveLeague(l: LeagueState, userId: string): LeagueState {
  if (l.status !== 'lobby') throw new Error('A temporada já começou.');
  const humans = Object.fromEntries(Object.entries(l.humans).filter(([, s]) => s.userId !== userId));
  return { ...l, humans, rev: l.rev + 1 };
}

export function teamOf(l: LeagueState, userId: string): string | null {
  return Object.entries(l.humans).find(([, s]) => s.userId === userId)?.[0] ?? null;
}

export function startLeague(l: LeagueState, userId: string, now: Date): LeagueState {
  if (userId !== l.ownerId) throw new Error('Só quem criou a liga pode dar a largada.');
  if (l.status !== 'lobby') throw new Error('A temporada já começou.');
  if (!Object.keys(l.humans).length) throw new Error('Escolha uma equipe antes de começar.');
  const started: LeagueState =
    l.pace === 'rapido'
      ? { ...l, status: 'running', startAt: new Date(now.getTime() + FAST_SESSION_MINUTES * 60_000).toISOString() }
      : { ...l, status: 'running', startDay: addDays(localDay(now, l.timezone), 1) };
  return openRound({ ...started, rev: l.rev + 1 });
}

// ----------------------------------------------------------------- rodadas --

function humanTeam(slot: LeagueSlot, budget: number): HumanTeam {
  return {
    budget,
    owned: { aero: [...slot.ownedAero], engine: slot.engines.map((e) => e.id) },
    engineWear: Object.fromEntries(slot.engines.map((e) => [e.id, engineWearMul(e)])),
  };
}

const BOT_WEEKEND_BUDGET: Record<Difficulty['id'], number> = { facil: 42, normal: 48, dificil: 55 };

/** Abre o GP atual: credita patrocínio e monta o fim de semana. */
function openRound(l: LeagueState): LeagueState {
  const humans: Record<string, LeagueSlot> = {};
  const wHumans: Record<string, HumanTeam> = {};
  for (const [teamId, slot] of Object.entries(l.humans)) {
    const s = { ...slot, cash: slot.cash + SPONSOR_PER_GP, ledger: [...slot.ledger, { round: l.round, label: 'Patrocínio', amount: SPONSOR_PER_GP }] };
    humans[teamId] = s;
    wHumans[teamId] = humanTeam(s, s.cash);
  }
  const first = Object.keys(humans)[0];
  const weekend = createWeekend({
    trackId: l.calendar[l.round],
    playerTeamId: first,
    difficulty: l.difficulty,
    seed: hashString(`${l.seed}:gp:${l.round}`),
    budget: wHumans[first].budget,
    mods: Object.fromEntries(Object.entries(l.dev).map(([id, lv]) => [id, modsFor(lv)])),
    botBudget: BOT_WEEKEND_BUDGET[l.difficulty],
  });
  weekend.humans = wHumans;
  weekend.schedule = SESSIONS.map((session, i) => ({ session, date: sessionInstant(l, l.round * 3 + i).toISOString() }));
  return { ...l, humans, weekend, decisions: {} };
}

function closeRound(l: LeagueState): LeagueState {
  const w = l.weekend!;
  const humans: Record<string, LeagueSlot> = {};
  for (const [teamId, slot] of Object.entries(l.humans)) {
    humans[teamId] = { ...slot, ...applyHumanRound(slot, w, teamId, l.round) };
  }
  const field = applyRoundToField(w, new Set(Object.keys(l.humans)), l.points, l.botCash, l.dev, l.seed, l.round);
  const round = l.round + 1;
  const next: LeagueState = {
    ...l,
    humans,
    points: field.points,
    botCash: field.botCash,
    dev: field.dev,
    results: [...l.results, field.result],
    round,
    weekend: null,
    lastWeekend: w,
    decisions: {},
  };
  return round >= l.calendar.length ? { ...next, status: 'finished' } : openRound(next);
}

/** Todos os humanos já enviaram a decisão da sessão atual? */
export function allReady(l: LeagueState): boolean {
  const session = currentSession(l);
  if (!session) return false;
  const d = l.decisions[session] ?? {};
  return Object.keys(l.humans).every((id) => d[id]);
}

export function currentSession(l: LeagueState): SessionId | null {
  if (l.status !== 'running' || !l.weekend || l.weekend.completed >= 3) return null;
  return SESSIONS[l.weekend.completed];
}

function resolveSession(l: LeagueState): LeagueState {
  const session = currentSession(l)!;
  const weekend = runNextSession(l.weekend!, { [session]: l.decisions[session] ?? {} });
  const next: LeagueState = { ...l, weekend, decisions: { ...l.decisions, [session]: undefined } };
  return weekend.completed >= 3 ? closeRound(next) : next;
}

/**
 * Simula todas as sessões vencidas. Também antecipa a sessão quando todos os
 * humanos já enviaram suas decisões.
 */
export function advance(l: LeagueState, now: Date): LeagueState {
  let cur = l;
  let changed = false;
  for (let guard = 0; guard < 40 && cur.status === 'running'; guard++) {
    const deadline = nextDeadline(cur);
    if (!deadline) break;
    if (now.getTime() < deadline.getTime() && !allReady(cur)) break;
    cur = resolveSession(cur);
    changed = true;
  }
  return changed ? { ...cur, rev: l.rev + 1 } : cur;
}

/** O dono da liga pode rodar a sessão atual na hora. */
export function forceSession(l: LeagueState, userId: string): LeagueState {
  if (userId !== l.ownerId) throw new Error('Só quem criou a liga pode antecipar sessões.');
  if (!currentSession(l)) throw new Error('Não há sessão para rodar.');
  return { ...resolveSession(l), rev: l.rev + 1 };
}

// --------------------------------------------------------------- decisões --

function isSetup(x: unknown): x is CarSetup {
  const s = x as CarSetup;
  return !!s && typeof s.aero === 'string' && typeof s.engine === 'string' && typeof s.tyre === 'string';
}

export function submitDecision(l: LeagueState, userId: string, session: SessionId, payload: unknown, now: Date): LeagueState {
  const teamId = teamOf(l, userId);
  if (!teamId) throw new Error('Você não participa desta liga.');
  const cur = currentSession(l);
  if (!cur || cur !== session) throw new Error('Essa sessão não está aberta.');
  const deadline = nextDeadline(l)!;
  if (now.getTime() >= deadline.getTime()) throw new Error('O prazo desta sessão já passou.');
  const w = l.weekend!;
  let value: CarSetup[] | CarSetup | RaceStrategy;
  if (session === 'teste') {
    if (!Array.isArray(payload) || payload.length < 1 || payload.length > MAX_PRACTICE_RUNS || !payload.every(isSetup)) {
      throw new Error(`Envie de 1 a ${MAX_PRACTICE_RUNS} acertos.`);
    }
    for (const s of payload) {
      const err = validateSetupFor({ ...w, humans: { ...w.humans, [teamId]: { ...w.humans![teamId], budget: Infinity } } }, teamId, s);
      if (err) throw new Error(err);
    }
    value = payload.map((s) => ({ aero: s.aero, engine: s.engine, tyre: s.tyre }));
  } else if (session === 'classificacao') {
    if (!isSetup(payload)) throw new Error('Acerto inválido.');
    const err = validateSetupFor(w, teamId, payload);
    if (err) throw new Error(err);
    value = { aero: payload.aero, engine: payload.engine, tyre: payload.tyre };
  } else {
    const s = payload as RaceStrategy;
    const err = validateStrategyFor(w, teamId, s);
    if (err) throw new Error(err);
    value = { stints: [...s.stints], pitLaps: [...s.pitLaps], mode: s.mode };
  }
  const d = { ...(l.decisions[session] ?? {}), [teamId]: value };
  return { ...l, decisions: { ...l.decisions, [session]: d } as SessionDecisions, rev: l.rev + 1 };
}

// ----------------------------------------------------------------- compras --

function ensureShopOpen(l: LeagueState) {
  if (l.status !== 'running' || !l.weekend) throw new Error('A temporada não está em andamento.');
  if (l.weekend.completed > 0) throw new Error('Garagem e desenvolvimento só antes do teste de cada GP.');
}

function withSlot(l: LeagueState, teamId: string, slot: LeagueSlot, modsChanged = false): LeagueState {
  const w = l.weekend!;
  const humans = { ...l.humans, [teamId]: slot };
  // Compras só antes do teste: nada foi gasto no fim de semana ainda.
  const weekend: WeekendState = {
    ...w,
    humans: { ...w.humans, [teamId]: humanTeam(slot, slot.cash) },
    mods: modsChanged ? Object.fromEntries(Object.entries(l.dev).map(([id, lv]) => [id, modsFor(lv)])) : w.mods,
  };
  return { ...l, humans, weekend, rev: l.rev + 1 };
}

function pay(slot: LeagueSlot, amount: number, label: string, round: number): LeagueSlot {
  if (amount > slot.cash) throw new Error(`Caixa insuficiente: faltam $${amount - slot.cash}M.`);
  return { ...slot, cash: slot.cash - amount, ledger: [...slot.ledger, { round, label, amount: -amount }] };
}

export function leagueBuy(l: LeagueState, userId: string, kind: 'engine' | 'aero' | 'dev', id: string): LeagueState {
  const teamId = teamOf(l, userId);
  if (!teamId) throw new Error('Você não participa desta liga.');
  ensureShopOpen(l);
  const slot = l.humans[teamId];
  if (kind === 'engine') {
    const e = getEngine(id);
    const paid = pay(slot, e.price, `Motor novo: ${e.name}`, l.round);
    return withSlot(l, teamId, { ...paid, engines: [...paid.engines.filter((x) => x.id !== id), { id, races: 0 }] });
  }
  if (kind === 'aero') {
    if (slot.ownedAero.includes(id)) throw new Error('Essa asa já está na garagem.');
    const a = getAero(id);
    const paid = pay(slot, a.price, `Aerodinâmica: ${a.name}`, l.round);
    return withSlot(l, teamId, { ...paid, ownedAero: [...paid.ownedAero, id] });
  }
  const area = DEV_AREAS.find((a) => a.id === id);
  if (!area) throw new Error('Área desconhecida.');
  const lv = l.dev[teamId][area.id as DevArea];
  if (lv >= MAX_DEV_LEVEL) throw new Error('Área já no nível máximo.');
  const paid = pay(slot, devCost(lv), `Desenvolvimento: ${area.label} nível ${lv + 1}`, l.round);
  const dev = { ...l.dev, [teamId]: { ...l.dev[teamId], [area.id]: lv + 1 } };
  return withSlot({ ...l, dev }, teamId, paid, true);
}

// ------------------------------------------------------------------- visão --

const HIDDEN: Weather = { rain: 0, hot: false, windy: false, temperature: 0, windSpeed: 0 };

/** O que um jogador pode ver: sem semente, sem tempo futuro, sem telemetria alheia. */
export function redactWeekend(w: WeekendState, teamId: string): WeekendState {
  const track = getTrack(w.trackId);
  const forecastView = SESSIONS.map((s) => forecastFor(track, w.weather, w.seed, s, w.completed));
  const weather = { ...w.weather };
  SESSIONS.forEach((s, i) => {
    if (i >= w.completed) weather[s] = HIDDEN;
  });
  const me = w.humans?.[teamId];
  return {
    ...w,
    seed: w.completed >= 3 ? w.seed : 0,
    weather,
    forecastView,
    playerTeamId: teamId,
    budget: me?.budget ?? w.budget,
    owned: me?.owned,
    engineWear: me?.engineWear,
    humans: me ? { [teamId]: me } : {},
    practiceRuns: w.practiceByTeam?.[teamId] ?? [],
    practiceByTeam: undefined,
  };
}

export interface LeagueMemberView {
  teamId: string;
  name: string;
  isOwner: boolean;
  ready: boolean;
}

export interface LeagueView {
  id: string;
  name: string;
  code: string;
  status: LeagueStatus;
  difficulty: Difficulty['id'];
  timezone: string;
  pace: Pace;
  isOwner: boolean;
  myTeamId: string | null;
  members: LeagueMemberView[];
  nextDeadline: string | null;
  session: SessionId | null;
  /** Decisão que eu já enviei para a sessão atual. */
  myDecision: unknown;
  season: SeasonState | null;
  /** Último GP concluído, na visão deste jogador. */
  lastWeekend: WeekendState | null;
  rev: number;
}

export function viewFor(l: LeagueState, userId: string): LeagueView {
  const myTeamId = teamOf(l, userId);
  const session = currentSession(l);
  const decided = session ? (l.decisions[session] ?? {}) : {};
  const members = Object.entries(l.humans).map(([teamId, s]) => ({
    teamId,
    name: s.name,
    isOwner: s.userId === l.ownerId,
    ready: !!(decided as Record<string, unknown>)[teamId],
  }));
  let season: SeasonState | null = null;
  if (myTeamId && l.status !== 'lobby') {
    const slot = l.humans[myTeamId];
    season = {
      version: 1,
      seed: 0,
      playerTeamId: myTeamId,
      difficulty: l.difficulty,
      startDate: l.createdAt,
      calendar: l.calendar,
      round: l.round,
      cash: slot.cash,
      ledger: slot.ledger,
      ownedAero: slot.ownedAero,
      engines: slot.engines,
      dev: l.dev,
      botCash: {},
      points: l.points,
      results: l.results,
      weekend: l.weekend ? redactWeekend(l.weekend, myTeamId) : null,
      finished: l.status === 'finished',
      gpTimes: l.calendar.map((_, r) => sessionInstant(l, r * 3).toISOString()),
    };
  }
  return {
    id: l.id,
    name: l.name,
    code: l.code,
    status: l.status,
    difficulty: l.difficulty,
    timezone: l.timezone,
    pace: l.pace,
    isOwner: userId === l.ownerId,
    myTeamId,
    members,
    nextDeadline: nextDeadline(l)?.toISOString() ?? null,
    session,
    myDecision: myTeamId ? ((decided as Record<string, unknown>)[myTeamId] ?? null) : null,
    season,
    lastWeekend: myTeamId && l.lastWeekend ? redactWeekend(l.lastWeekend, myTeamId) : null,
    rev: l.rev,
  };
}

/** Humanos ainda sem decisão na sessão atual (para avisos). */
export function pendingHumans(l: LeagueState): string[] {
  const session = currentSession(l);
  if (!session) return [];
  const d = (l.decisions[session] ?? {}) as Record<string, unknown>;
  return humanIds(l.weekend!).filter((id) => !d[id]);
}

