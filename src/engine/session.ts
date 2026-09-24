import { getAero, getEngine, getTyre } from './data/parts';
import {
  errorChancePerLap,
  failureChancePerLap,
  idealLap,
  lapNoiseSigma,
  wearPerLap,
  type CarBuild,
  type LapBreakdown,
} from './performance';
import { clamp, type Rng } from './rng';
import type { CarSetup, RaceStrategy, Team, Track, Weather } from './types';

export function buildFor(team: Team, setup: Pick<CarSetup, 'aero' | 'engine'>): CarBuild {
  return { team, aero: getAero(setup.aero), engine: getEngine(setup.engine) };
}

// ---------------------------------------------------------------- Teste ----

export interface PracticeLap {
  total: number;
  straights: number;
  slow: number;
  fast: number;
  wear: number;
}

export interface PracticeRun {
  teamId: string;
  setup: CarSetup;
  laps: PracticeLap[];
  best: number;
  bestSectors: { straights: number; slow: number; fast: number };
  wearPerLap: number;
  tyreLife: number;
  feedback: string[];
}

export const PRACTICE_LAPS = 6;

export function simulatePractice(team: Team, setup: CarSetup, track: Track, weather: Weather, rng: Rng): PracticeRun {
  const build = buildFor(team, setup);
  const tyre = getTyre(setup.tyre);
  const sigma = lapNoiseSigma(team, build.aero, track, weather);
  const perLap = wearPerLap(tyre, track, weather, team, 'normal');
  const laps: PracticeLap[] = [];
  let wear = 0;
  for (let i = 0; i < PRACTICE_LAPS; i++) {
    const b = idealLap({ build, tyre, track, weather, wear, fuel: 0.5, mode: 'normal' });
    const n = () => rng.gauss(sigma / Math.sqrt(3));
    const lap = { straights: b.straights + n(), slow: b.slow + n(), fast: b.fast + n(), total: 0, wear };
    lap.total = lap.straights + lap.slow + lap.fast + b.fuel;
    laps.push(lap);
    wear += perLap;
  }
  const best = Math.min(...laps.map((l) => l.total));
  return {
    teamId: team.id,
    setup,
    laps,
    best,
    bestSectors: {
      straights: Math.min(...laps.map((l) => l.straights)),
      slow: Math.min(...laps.map((l) => l.slow)),
      fast: Math.min(...laps.map((l) => l.fast)),
    },
    wearPerLap: perLap,
    tyreLife: 1 / perLap,
    feedback: driverFeedback(build, setup, track, weather, perLap),
  };
}

/** Comentários do piloto após o teste: pistas para o jogador deduzir o acerto. */
function driverFeedback(build: CarBuild, setup: CarSetup, track: Track, weather: Weather, perLap: number): string[] {
  const { aero, engine } = build;
  const tyre = getTyre(setup.tyre);
  const b: LapBreakdown = idealLap({ build, tyre, track, weather, wear: 0, fuel: 0.5, mode: 'normal' });
  const out: string[] = [];
  if (weather.rain && tyre.kind === 'seco') out.push('Impossível guiar de slick na chuva! Parece um sabão.');
  if (weather.rain === 2 && tyre.kind === 'inter') out.push('Chuva forte demais para o intermediário, estou aquaplanando.');
  if (weather.rain === 1 && tyre.kind === 'chuva') out.push('O pneu de chuva extrema está pesado demais para essa garoa.');
  if (!weather.rain && tyre.kind !== 'seco') out.push('Os pneus de chuva estão se desfazendo no seco!');
  if (!weather.rain && weather.hot && tyre.hot < 0.93) out.push('Os pneus estão superaquecendo com esse calor.');
  if (!weather.rain && !weather.hot && tyre.cold < 0.9) out.push('Não consigo aquecer os pneus, a pista está fria.');
  if (weather.hot && engine.heatTolerance < 0.5) out.push('O motor está fervendo! No calor, o risco de quebra é alto.');
  if (track.altitude > 0.5 && engine.altitudeLoss > 0.2) out.push('O motor está sem fôlego nessa altitude.');
  if (weather.windy && aero.windSensitivity >= 0.5) out.push('O carro fica nervoso com as rajadas de vento.');
  if (engine.consumption >= 0.8) out.push('Com tanque cheio, esse motor deixa o carro bem pesado.');
  if (engine.reliability < 0.8) out.push('Os mecânicos estão preocupados com a confiabilidade desse motor.');

  const p = track.profile;
  if (p.straights >= 0.5 && b.speedIdx < 0.6) out.push('Estamos perdendo muito tempo nas retas.');
  if (p.slowCorners >= 0.4 && b.slowIdx < 0.62) out.push('Falta aderência nas curvas lentas.');
  if (p.fastCorners >= 0.4 && b.fastIdx < 0.62) out.push('O carro está sem pressão nas curvas rápidas.');
  if (p.straights <= 0.3 && aero.drag < 0.4) out.push('Asa baixa demais para esse traçado cheio de curvas.');
  if (p.straights >= 0.55 && aero.drag > 0.7) out.push('Tem asa demais: somos uma carroça nas retas.');

  const life = 1 / perLap;
  if (life < track.laps / 3) out.push(`Esse pneu dura só ~${Math.floor(life)} voltas aqui.`);
  else if (life > track.laps * 1.05) out.push('Esse pneu aguentaria a corrida inteira sem parar.');
  if (out.length === 0) out.push('O carro está bem equilibrado. Gostei!');
  return out;
}

// -------------------------------------------------------- Classificação ----

export interface QualiResult {
  teamId: string;
  setup: CarSetup;
  time: number | null;
  runs: (number | null)[];
  note?: string;
}

export function simulateQualifying(
  entries: { team: Team; setup: CarSetup }[],
  track: Track,
  weather: Weather,
  rng: Rng,
): QualiResult[] {
  const results: QualiResult[] = entries.map(({ team, setup }) => {
    const r = rng.fork(`quali:${team.id}`);
    const build = buildFor(team, setup);
    const tyre = getTyre(setup.tyre);
    const sigma = lapNoiseSigma(team, build.aero, track, weather);
    const runs: (number | null)[] = [];
    let note: string | undefined;
    for (let run = 0; run < 2; run++) {
      const b = idealLap({ build, tyre, track, weather, wear: 0.03, fuel: 0.05, mode: 'agressivo', qualifying: true });
      if (r.chance(failureChancePerLap(build.engine, team, weather, 'agressivo') * 2)) {
        runs.push(null);
        note = 'Quebra de motor';
        break;
      }
      if (r.chance(errorChancePerLap(team, weather, b.grip, 'agressivo') * 3)) {
        runs.push(null);
        note = 'Erro na volta rápida';
        continue;
      }
      runs.push(b.total + r.gauss(sigma));
    }
    const valid = runs.filter((x): x is number => x !== null);
    return { teamId: team.id, setup, runs, time: valid.length ? Math.min(...valid) : null, note: valid.length ? undefined : note };
  });
  return results.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}

// ---------------------------------------------------------------- Corrida ---

export interface RaceEntry {
  team: Team;
  build: CarBuild;
  strategy: RaceStrategy;
}

export type RaceEventType = 'start' | 'overtake' | 'pit' | 'dnf' | 'error' | 'safetycar' | 'puncture' | 'finish' | 'fastest';

export interface RaceEvent {
  lap: number;
  type: RaceEventType;
  teamId?: string;
  text: string;
}

export interface LapRecord {
  lap: number;
  order: string[];
  cum: Record<string, number>;
  lapTime: Record<string, number>;
  tyre: Record<string, string>;
  wear: Record<string, number>;
  safetyCar: boolean;
}

export interface Classification {
  teamId: string;
  position: number;
  status: 'finished' | 'dnf';
  totalTime: number | null;
  lapsCompleted: number;
  gap: string;
  pits: number;
  bestLap: number;
  points: number;
  reason?: string;
  grid: number;
}

export interface RaceResult {
  laps: LapRecord[];
  events: RaceEvent[];
  classification: Classification[];
  fastestLap: { teamId: string; time: number; lap: number };
  gridTimes: Record<string, number>;
}

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

interface CarState {
  entry: RaceEntry;
  id: string;
  name: string;
  cum: number;
  wear: number;
  stint: number;
  retired: boolean;
  reason?: string;
  lapsDone: number;
  pits: number;
  bestLap: number;
  grid: number;
}

export function simulateRace(gridOrder: RaceEntry[], track: Track, weather: Weather, rng: Rng): RaceResult {
  const cars: CarState[] = gridOrder.map((entry, i) => ({
    entry,
    id: entry.team.id,
    name: entry.team.driver.shortName,
    cum: i * 0.3,
    wear: 0,
    stint: 0,
    retired: false,
    lapsDone: 0,
    pits: 0,
    bestLap: Infinity,
    grid: i + 1,
  }));
  const gridTimes = Object.fromEntries(cars.map((c) => [c.id, c.cum]));
  const events: RaceEvent[] = [];
  const laps: LapRecord[] = [];
  const total = track.laps;
  const scChance = clamp(track.safetyCarChance * (weather.rain ? 1.4 : 1), 0, 0.95);
  let plannedSc = rng.chance(scChance) ? rng.int(3, Math.max(3, total - 4)) : -1;
  let scLapsLeft = 0;
  let fastest = { teamId: '', time: Infinity, lap: 0 };

  events.push({ lap: 0, type: 'start', text: `Luzes apagadas em ${track.name}! ${describeStart(weather)}` });

  for (let lap = 1; lap <= total; lap++) {
    if (lap === plannedSc && scLapsLeft === 0) {
      scLapsLeft = 3;
      events.push({ lap, type: 'safetycar', text: 'SAFETY CAR na pista! O pelotão se agrupa.' });
    }
    const sc = scLapsLeft > 0;
    const prevOrder = cars.filter((c) => !c.retired).sort((a, b) => a.cum - b.cum);
    const lapTimes: Record<string, number> = {};
    const fuel = 1 - (lap - 1) / total;

    for (const car of prevOrder) {
      const { team, build, strategy } = car.entry;
      const tyre = getTyre(strategy.stints[car.stint]);
      const b = idealLap({ build, tyre, track, weather, wear: car.wear, fuel, mode: strategy.mode });
      let t = b.total + rng.gauss(lapNoiseSigma(team, build.aero, track, weather));
      if (lap === 1) t += 2.5 - (team.driver.skills.start - 90) * 0.12 + rng.gauss(0.5);

      if (!sc && rng.chance(failureChancePerLap(build.engine, team, weather, strategy.mode))) {
        retire(car, lap, 'Quebra de motor', `${car.name} abandona com o motor quebrado! Fumaça na pista.`);
        continue;
      }
      if (!sc && rng.chance(errorChancePerLap(team, weather, b.grip, strategy.mode))) {
        const crash = rng.chance(weather.rain ? 0.2 : 0.08);
        if (crash) {
          retire(car, lap, 'Acidente', `${car.name} bate forte e está fora da corrida!`);
          if (scLapsLeft === 0 && lap < total - 1 && rng.chance(0.7)) plannedSc = lap + 1;
          continue;
        }
        const lost = rng.range(2, weather.rain ? 12 : 7);
        t += lost;
        events.push({ lap, type: 'error', teamId: car.id, text: `${car.name} erra e roda! Perde ${lost.toFixed(1)}s.` });
      }
      if (car.wear > 1.35 && rng.chance(0.15)) {
        t += 25;
        car.wear = 0;
        car.pits++;
        events.push({ lap, type: 'puncture', teamId: car.id, text: `Pneu furado para ${car.name}! Volta lenta até os boxes.` });
      }
      if (sc) t = Math.max(t, track.baseLap * 1.35);

      car.wear += wearPerLap(tyre, track, weather, team, strategy.mode) * (sc ? 0.3 : 1);
      const pitIdx = strategy.pitLaps.indexOf(lap);
      if (pitIdx >= 0 && car.stint < strategy.stints.length - 1 && lap < total) {
        const stop = rng.range(2.2, 3.4) + (rng.chance(0.05) ? rng.range(3, 8) : 0);
        t += track.pitLoss * (sc ? 0.55 : 1) + stop;
        car.stint++;
        car.wear = 0;
        car.pits++;
        const next = getTyre(strategy.stints[car.stint]);
        events.push({ lap, type: 'pit', teamId: car.id, text: `${car.name} vai aos boxes: ${next.name} (${stop.toFixed(1)}s parado).` });
      }

      car.cum += t;
      car.lapsDone = lap;
      lapTimes[car.id] = t;
      if (!sc && t < car.bestLap) car.bestLap = t;
      if (!sc && t < fastest.time && pitIdx < 0) fastest = { teamId: car.id, time: t, lap };
    }

    // Tráfego e ultrapassagens, na ordem da volta anterior.
    const order = prevOrder.filter((c) => !c.retired);
    for (let i = 1; i < order.length; i++) {
      let k = i;
      while (k > 0) {
        const car = order[k];
        const ahead = order[k - 1];
        if (car.cum >= ahead.cum + 0.2) break;
        const delta = (lapTimes[ahead.id] ?? 0) - (lapTimes[car.id] ?? 0);
        const aggressive = car.entry.strategy.mode === 'agressivo' ? 0.08 : 0;
        const p = sc ? 0 : clamp(0.2 + delta * 0.4 - track.overtaking * 0.35 + aggressive, 0.03, 0.9);
        if (car.cum < ahead.cum && rng.chance(p)) {
          order[k] = ahead;
          order[k - 1] = car;
          if (ahead.cum < car.cum + 0.15) ahead.cum = car.cum + 0.15 + rng.range(0, 0.3);
          if (lap > 1) events.push({ lap, type: 'overtake', teamId: car.id, text: `${car.name} ultrapassa ${ahead.name}!` });
          k--;
        } else {
          car.cum = ahead.cum + 0.25 + rng.range(0, 0.4);
          break;
        }
      }
    }
    if (sc) {
      for (let i = 1; i < order.length; i++) order[i].cum = Math.max(order[i].cum, order[i - 1].cum + 0.6);
      for (let i = 1; i < order.length; i++) order[i].cum = Math.min(order[i].cum, order[i - 1].cum + 1.0);
      scLapsLeft--;
      if (scLapsLeft === 0) events.push({ lap, type: 'safetycar', text: 'Safety car recolhe! Relargada!' });
    }

    const active = cars.filter((c) => !c.retired).sort((a, b) => a.cum - b.cum);
    const retiredNow = cars.filter((c) => c.retired).sort((a, b) => b.lapsDone - a.lapsDone);
    laps.push({
      lap,
      order: [...active, ...retiredNow].map((c) => c.id),
      cum: Object.fromEntries(cars.map((c) => [c.id, c.cum])),
      lapTime: lapTimes,
      tyre: Object.fromEntries(cars.map((c) => [c.id, c.entry.strategy.stints[c.stint]])),
      wear: Object.fromEntries(cars.map((c) => [c.id, c.wear])),
      safetyCar: sc,
    });
  }

  function retire(car: CarState, lap: number, reason: string, text: string) {
    car.retired = true;
    car.reason = reason;
    car.lapsDone = lap - 1;
    events.push({ lap, type: 'dnf', teamId: car.id, text });
  }

  const finishers = cars.filter((c) => !c.retired).sort((a, b) => a.cum - b.cum);
  const dnfs = cars.filter((c) => c.retired).sort((a, b) => b.lapsDone - a.lapsDone);
  const winner = finishers[0];
  if (winner) events.push({ lap: total, type: 'finish', teamId: winner.id, text: `BANDEIRADA! ${winner.entry.team.driver.name} vence em ${track.name}!` });
  if (fastest.teamId) {
    const who = cars.find((c) => c.id === fastest.teamId)!;
    events.push({ lap: fastest.lap, type: 'fastest', teamId: who.id, text: `Volta mais rápida: ${who.name} (${formatLap(fastest.time)}).` });
  }

  const classification: Classification[] = [...finishers, ...dnfs].map((c, i) => ({
    teamId: c.id,
    position: i + 1,
    status: c.retired ? 'dnf' : 'finished',
    totalTime: c.retired ? null : c.cum - (gridTimes[c.id] ?? 0),
    lapsCompleted: c.lapsDone,
    gap: c.retired ? `ABANDONO (${c.reason})` : i === 0 ? formatRaceTime(c.cum - gridTimes[c.id]) : `+${(c.cum - winner.cum).toFixed(3)}s`,
    pits: c.pits,
    bestLap: c.bestLap,
    points: c.retired ? 0 : (POINTS[i] ?? 0),
    reason: c.reason,
    grid: c.grid,
  }));

  return { laps, events: events.sort((a, b) => a.lap - b.lap), classification, fastestLap: fastest, gridTimes };
}

function describeStart(w: Weather): string {
  if (w.rain === 2) return 'Chuva forte, visibilidade quase zero!';
  if (w.rain === 1) return 'Pista molhada, cuidado!';
  return w.hot ? 'Sol forte e asfalto quente.' : 'Tempo seco e fresco.';
}

export function formatLap(t: number): string {
  if (!isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function formatRaceTime(t: number): string {
  const h = Math.floor(t / 3600);
  const rest = t - h * 3600;
  return h > 0 ? `${h}:${formatLap(rest).padStart(9, '0')}` : formatLap(rest);
}

