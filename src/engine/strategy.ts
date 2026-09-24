import { TYRE_PARTS } from './data/parts';
import { estimatedTyreLife, failureChancePerLap, idealLap, wearPerLap, type CarBuild } from './performance';
import type { DriveMode, RaceStrategy, Track, TyrePart, Weather } from './types';

/** Tempo estimado de um stint, sem ruído nem tráfego. */
export function estimateStint(
  build: CarBuild,
  tyre: TyrePart,
  track: Track,
  weather: Weather,
  startLap: number,
  length: number,
  mode: DriveMode,
): number {
  const perLap = wearPerLap(tyre, track, weather, build.team, mode);
  let t = 0;
  let wear = 0;
  for (let i = 0; i < length; i++) {
    const lap = startLap + i;
    const fuel = 1 - (lap - 1) / track.laps;
    t += idealLap({ build, tyre, track, weather, wear, fuel, mode }).total;
    if (wear > 1.35) t += 25 * 0.15;
    wear += perLap;
  }
  return t;
}

export function estimateRace(build: CarBuild, strategy: RaceStrategy, track: Track, weather: Weather): number {
  const bounds = [0, ...strategy.pitLaps, track.laps];
  let t = 0;
  for (let i = 0; i < strategy.stints.length; i++) {
    const tyre = TYRE_PARTS.find((x) => x.id === strategy.stints[i])!;
    t += estimateStint(build, tyre, track, weather, bounds[i] + 1, bounds[i + 1] - bounds[i], strategy.mode);
  }
  t += strategy.pitLaps.length * (track.pitLoss + 2.8);
  const pLap = failureChancePerLap(build.engine, build.team, weather, strategy.mode);
  const pFail = 1 - Math.pow(1 - pLap, track.laps);
  return t + pFail * track.baseLap * track.laps * 0.5;
}

/** Distribui as paradas proporcionalmente à vida útil de cada composto. */
export function planPitLaps(build: CarBuild, stints: string[], track: Track, weather: Weather, mode: DriveMode): number[] {
  if (stints.length <= 1) return [];
  const lives = stints.map((id) => estimatedTyreLife(TYRE_PARTS.find((x) => x.id === id)!, track, weather, build.team, mode));
  const sum = lives.reduce((a, b) => a + b, 0);
  const pits: number[] = [];
  let acc = 0;
  for (let i = 0; i < stints.length - 1; i++) {
    acc += lives[i];
    const lap = Math.round((acc / sum) * track.laps);
    const min = (pits[pits.length - 1] ?? 0) + 1;
    pits.push(Math.max(min, Math.min(track.laps - (stints.length - 1 - i), lap)));
  }
  return pits;
}

export function usableTyres(weather: Weather): TyrePart[] {
  return TYRE_PARTS.filter((t) => (weather.rain ? t.kind !== 'seco' : t.kind === 'seco'));
}

export function strategyCost(strategy: RaceStrategy): number {
  return strategy.stints.reduce((s, id) => s + TYRE_PARTS.find((x) => x.id === id)!.price, 0);
}

/** Busca a melhor estratégia (até 2 paradas) dentro do orçamento de pneus. */
export function bestStrategy(
  build: CarBuild,
  track: Track,
  weather: Weather,
  tyreBudget: number,
  mode: DriveMode = 'normal',
  maxStops = 2,
): { strategy: RaceStrategy; time: number } | null {
  const tyres = usableTyres(weather);
  let best: { strategy: RaceStrategy; time: number } | null = null;
  const tryStints = (stints: string[]) => {
    const pitLaps = planPitLaps(build, stints, track, weather, mode);
    const strategy: RaceStrategy = { stints, pitLaps, mode };
    if (strategyCost(strategy) > tyreBudget) return;
    const time = estimateRace(build, strategy, track, weather);
    if (!best || time < best.time) best = { strategy, time };
  };
  const rec = (prefix: string[], left: number) => {
    tryStints(prefix);
    if (left === 0) return;
    for (const t of tyres) rec([...prefix, t.id], left - 1);
  };
  for (const t of tyres) rec([t.id], maxStops);
  return best;
}
