import { AERO_PARTS, ENGINE_PARTS, getTyre } from './data/parts';
import { idealLap } from './performance';
import { createRng, type Rng } from './rng';
import { buildFor } from './session';
import { bestStrategy, estimateRace, planPitLaps, usableTyres } from './strategy';
import type { CarSetup, Difficulty, DriveMode, Forecast, RaceStrategy, Team, Track, Weather } from './types';
import { sampleFromForecast } from './weather';

export const DIFFICULTIES: Difficulty[] = [
  { id: 'facil', label: 'Fácil', candidates: 10, noise: 8 },
  { id: 'normal', label: 'Normal', candidates: 35, noise: 3 },
  { id: 'dificil', label: 'Difícil', candidates: 100, noise: 0.5 },
];

export function getDifficulty(id: Difficulty['id']): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id)!;
}

/** Reserva de orçamento para os pneus da corrida. */
const RACE_TYRE_RESERVE = 12;

/** Cenário mais provável segundo a previsão. */
export function mostLikely(f: Forecast): Weather {
  const rainy = f.rainProb >= 0.5;
  return {
    rain: rainy ? (f.heavyRainProb / f.rainProb >= 0.5 ? 2 : 1) : 0,
    hot: f.hotProb >= 0.5,
    windy: f.windProb >= 0.5,
    temperature: Math.round((f.tempRange[0] + f.tempRange[1]) / 2),
    windSpeed: Math.round((f.windRange[0] + f.windRange[1]) / 2),
  };
}

function quickRace(team: Team, setup: Pick<CarSetup, 'aero' | 'engine'>, track: Track, weather: Weather): number {
  const build = buildFor(team, setup);
  let best = Infinity;
  for (const t of usableTyres(weather)) {
    for (let stops = 0; stops <= 2; stops++) {
      const stints = Array(stops + 1).fill(t.id);
      const strategy: RaceStrategy = { stints, pitLaps: planPitLaps(build, stints, track, weather, 'normal'), mode: 'normal' };
      best = Math.min(best, estimateRace(build, strategy, track, weather));
    }
  }
  return best;
}

function bestQualiTyre(team: Team, setup: Pick<CarSetup, 'aero' | 'engine'>, track: Track, weather: Weather, maxPrice: number): { id: string; time: number } {
  const build = buildFor(team, setup);
  let best = { id: 'P4', time: Infinity };
  for (const t of usableTyres(weather)) {
    if (t.price > maxPrice) continue;
    const time = idealLap({ build, tyre: t, track, weather, wear: 0.03, fuel: 0.05, mode: 'agressivo', qualifying: true }).total;
    if (time < best.time) best = { id: t.id, time };
  }
  return best;
}

/** Bot escolhe aero + motor (travados após a classificação) e o pneu da classificação. */
export function botChooseSetup(
  team: Team,
  track: Track,
  qualiForecast: Forecast,
  raceForecast: Forecast,
  budget: number,
  difficulty: Difficulty,
  rng: Rng,
): CarSetup {
  const qualiScen = [0, 1, 2].map(() => sampleFromForecast(qualiForecast, rng));
  const raceScen = [0, 1, 2].map(() => sampleFromForecast(raceForecast, rng));
  const combos = AERO_PARTS.flatMap((a) => ENGINE_PARTS.map((e) => ({ aero: a, engine: e })));
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  let best: { setup: Pick<CarSetup, 'aero' | 'engine'>; score: number } | null = null;
  let evaluated = 0;
  for (const { aero, engine } of combos) {
    if (evaluated >= difficulty.candidates) break;
    const left = budget - aero.price - engine.price - RACE_TYRE_RESERVE;
    if (left < 5) continue;
    evaluated++;
    const setup = { aero: aero.id, engine: engine.id };
    const q = qualiScen.reduce((s, w) => s + bestQualiTyre(team, setup, track, w, left).time, 0) / qualiScen.length;
    const r = raceScen.reduce((s, w) => s + quickRace(team, setup, track, w), 0) / raceScen.length;
    const score = r + 3 * q + rng.gauss(difficulty.noise * 3);
    if (!best || score < best.score) best = { setup, score };
  }
  const chosen = best?.setup ?? { aero: 'A5', engine: 'M5' };
  const aeroPrice = AERO_PARTS.find((a) => a.id === chosen.aero)!.price;
  const enginePrice = ENGINE_PARTS.find((e) => e.id === chosen.engine)!.price;
  const tyre = bestQualiTyre(team, chosen, track, mostLikely(qualiForecast), budget - aeroPrice - enginePrice - RACE_TYRE_RESERVE).id;
  return { ...chosen, tyre };
}

export function botChooseStrategy(
  team: Team,
  setup: CarSetup,
  track: Track,
  raceForecast: Forecast,
  tyreBudget: number,
  difficulty: Difficulty,
  seed: number,
): RaceStrategy {
  const rng = createRng(seed).fork(`strategy:${team.id}`);
  const build = buildFor(team, setup);
  const weather = rng.chance(Math.min(0.5, difficulty.noise / 20)) ? sampleFromForecast(raceForecast, rng) : mostLikely(raceForecast);
  const modes: DriveMode[] = difficulty.id === 'facil' ? ['normal'] : ['normal', 'agressivo', 'poupar'];
  let best: { strategy: RaceStrategy; time: number } | null = null;
  for (const mode of modes) {
    const r = bestStrategy(build, track, weather, tyreBudget, mode, difficulty.id === 'facil' ? 1 : 2, () => rng.gauss(difficulty.noise * 2));
    if (r && (!best || r.time < best.time)) best = r;
  }
  if (best) return best.strategy;
  // Sem orçamento: um jogo do pneu mais barato, sem parar.
  const cheapest = usableTyres(weather).sort((a, b) => a.price - b.price)[0] ?? getTyre('P6');
  return { stints: [cheapest.id], pitLaps: [], mode: 'poupar' };
}
