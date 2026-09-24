import { clamp } from './rng';
import type { AeroPart, DriveMode, EnginePart, Team, Track, TyrePart, Weather } from './types';

export interface CarBuild {
  team: Team;
  aero: AeroPart;
  engine: EnginePart;
}

export interface LapInput {
  build: CarBuild;
  tyre: TyrePart;
  track: Track;
  weather: Weather;
  /** Desgaste do pneu: 0 = novo, 1 = fim da vida útil, >1 = no "penhasco". */
  wear: number;
  /** Combustível restante: 1 = tanque cheio, 0 = vazio. */
  fuel: number;
  mode: DriveMode;
  qualifying?: boolean;
}

export interface LapBreakdown {
  straights: number;
  slow: number;
  fast: number;
  fuel: number;
  total: number;
  speedIdx: number;
  slowIdx: number;
  fastIdx: number;
  grip: number;
  power: number;
  downforce: number;
}

/** Sensibilidade do tempo de setor a cada ponto de índice. */
const SECTOR_K = 0.35;

/**
 * Retas ocupam em média ~45% da volta, curvas lentas ~30% e rápidas ~25%.
 * Estes pesos fazem um bônus de chassi valer o mesmo em média, qualquer que
 * seja o tipo de trecho.
 */
const CHASSIS_WEIGHT = { straight: 0.75, slow: 1.09, fast: 1.33 };

const MODE_PACE: Record<DriveMode, number> = { poupar: 1.008, normal: 1, agressivo: 0.992 };
const MODE_WEAR: Record<DriveMode, number> = { poupar: 0.75, normal: 1, agressivo: 1.3 };
const MODE_FAIL: Record<DriveMode, number> = { poupar: 0.55, normal: 1, agressivo: 1.8 };
const MODE_ERROR: Record<DriveMode, number> = { poupar: 0.7, normal: 1, agressivo: 1.5 };

/** Aderência efetiva do pneu no clima e no desgaste atuais. */
export function tyreGrip(tyre: TyrePart, weather: Weather, wear: number): number {
  let g: number;
  if (weather.rain === 0) {
    g = tyre.grip * (weather.hot ? tyre.hot : tyre.cold);
  } else {
    g = weather.rain === 1 ? tyre.wetGrip.light : tyre.wetGrip.heavy;
  }
  const w = Math.min(wear, 1);
  g *= 1 - 0.3 * Math.pow(w, 1.6);
  if (wear > 1) g *= Math.max(0.55, 1 - (wear - 1) * 1.5);
  return g;
}

export function effectivePower(engine: EnginePart, track: Track, weather: Weather): number {
  let p = engine.power * (1 - engine.altitudeLoss * track.altitude);
  if (weather.hot) p *= 1 - 0.12 * (1 - engine.heatTolerance);
  else p *= 1.02;
  return p;
}

export function effectiveDownforce(aero: AeroPart, track: Track, weather: Weather): number {
  let d = aero.downforce * (1 - 0.2 * track.altitude);
  if (weather.windy) d *= 1 - 0.25 * aero.windSensitivity;
  return d;
}

/** Tempo de volta ideal (sem ruído, erros ou tráfego). */
export function idealLap(input: LapInput): LapBreakdown {
  const { build, tyre, track, weather, wear, fuel, mode } = input;
  const { team, aero, engine } = build;
  const c = team.chassis;
  const g = tyreGrip(tyre, weather, wear);
  const p = effectivePower(engine, track, weather);
  const d = effectiveDownforce(aero, track, weather);
  const drag = aero.drag;

  let speedIdx: number;
  let slowIdx: number;
  let fastIdx: number;
  if (weather.rain === 0) {
    speedIdx = 0.55 * p + 0.45 * (1 - drag);
    slowIdx = 0.75 * g + 0.25 * d;
    fastIdx = 0.45 * g + 0.55 * d;
  } else {
    // Na chuva, tração e pressão valem mais do que potência.
    speedIdx = 0.45 * p + 0.3 * (1 - drag) + 0.25 * g;
    slowIdx = 0.8 * g + 0.2 * d;
    fastIdx = 0.55 * g + 0.45 * d;
  }
  speedIdx += c.straight * CHASSIS_WEIGHT.straight;
  slowIdx += c.slow * CHASSIS_WEIGHT.slow;
  fastIdx += c.fast * CHASSIS_WEIGHT.fast;

  const base = track.baseLap * (1 + (weather.rain === 1 ? 0.08 : weather.rain === 2 ? 0.15 : 0));
  const sector = (share: number, idx: number) => base * share * (0.93 + SECTOR_K * (1 - idx));
  const s = sector(track.profile.straights, speedIdx);
  const sl = sector(track.profile.slowCorners, slowIdx);
  const f = sector(track.profile.fastCorners, fastIdx);

  const skills = team.driver.skills;
  let driverMul = 1 + (100 - (input.qualifying ? skills.qualifying : skills.pace)) * 0.0005;
  if (weather.rain) driverMul *= 1 + (100 - skills.wet) * 0.0008 * (weather.rain === 2 ? 1.5 : 1);
  const modeMul = input.qualifying ? 0.992 : MODE_PACE[mode];
  const mul = driverMul * modeMul;

  const fuelTime = fuel * (0.6 + 1.6 * engine.consumption);
  return {
    straights: s * mul,
    slow: sl * mul,
    fast: f * mul,
    fuel: fuelTime,
    total: (s + sl + f) * mul + fuelTime,
    speedIdx,
    slowIdx,
    fastIdx,
    grip: g,
    power: p,
    downforce: d,
  };
}

export function lapNoiseSigma(team: Team, aero: AeroPart, track: Track, weather: Weather): number {
  let s = track.baseLap * 0.0035 * (1 + (100 - team.driver.skills.consistency) / 15);
  if (weather.rain) s *= 1.8;
  if (weather.windy) s *= 1 + aero.windSensitivity * 0.5;
  return s;
}

export function wearPerLap(tyre: TyrePart, track: Track, weather: Weather, team: Team, mode: DriveMode): number {
  const base = weather.rain === 0 ? tyre.wear.dry : tyre.wear.wet;
  const temp = weather.rain === 0 && weather.hot ? 1.15 + (1 - tyre.hot) * 2 : 0.95;
  const driver = clamp(1 - (team.driver.skills.tyres - 90) * 0.012, 0.8, 1.2);
  return 0.04 * base * track.tyreWear * temp * team.chassis.tyreWear * driver * MODE_WEAR[mode];
}

export function failureChancePerLap(engine: EnginePart, team: Team, weather: Weather, mode: DriveMode): number {
  const heat = weather.hot ? 1 + (1 - engine.heatTolerance) * 1.2 : 1;
  return (1 - engine.reliability) * 0.016 * heat * team.chassis.reliability * MODE_FAIL[mode];
}

export function errorChancePerLap(team: Team, weather: Weather, grip: number, mode: DriveMode): number {
  const sk = team.driver.skills;
  let p = (100 - sk.consistency) * 0.00035;
  if (weather.rain) p *= 1 + (100 - sk.wet) * 0.12 * weather.rain;
  if (weather.windy) p *= 1.2;
  p *= 1 + Math.max(0, 0.6 - grip) * 5;
  return p * MODE_ERROR[mode];
}

/** Estimativa de voltas até o pneu chegar ao fim da vida útil. */
export function estimatedTyreLife(tyre: TyrePart, track: Track, weather: Weather, team: Team, mode: DriveMode): number {
  return 1 / wearPerLap(tyre, track, weather, team, mode);
}
