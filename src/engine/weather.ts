import { clamp, createRng, type Rng } from './rng';
import { SESSIONS, type Forecast, type RainLevel, type SessionId, type Track, type Weather } from './types';

export type WeekendWeather = Record<SessionId, Weather>;

/**
 * Sorteia o tempo real das três sessões. Há correlação entre dias seguidos:
 * se choveu no teste, é mais provável que chova na classificação.
 */
export function rollWeekendWeather(track: Track, rng: Rng): WeekendWeather {
  const out = {} as WeekendWeather;
  let prev: Weather | null = null;
  for (const s of SESSIONS) {
    const rainy: boolean = prev && rng.chance(0.5) ? prev.rain > 0 : rng.chance(track.rainChance);
    const rain: RainLevel = rainy ? (rng.chance(0.45) ? 2 : 1) : 0;
    const light = track.times[s].light;
    const hotChance = hotChanceFor(track, s);
    const hot: boolean = prev && rng.chance(0.6) ? prev.hot && light !== 'noite' : rng.chance(hotChance);
    const windy: boolean = prev && rng.chance(0.4) ? prev.windy : rng.chance(track.windChance);
    const temperature = Math.round((hot ? rng.range(26, 35) : rng.range(12, 21)) - (rain ? 3 : 0) - (light === 'noite' ? 3 : 0));
    const windSpeed = Math.round(windy ? rng.range(25, 45) : rng.range(3, 14));
    const w: Weather = { rain, hot, windy, temperature, windSpeed };
    out[s] = w;
    prev = w;
  }
  return out;
}

/** À noite a pista esfria: menos chance de calor. */
export function hotChanceFor(track: Track, session: SessionId): number {
  const light = track.times[session].light;
  return track.hotChance * (light === 'noite' ? 0.35 : light === 'entardecer' ? 0.7 : 1);
}

/** Precisão da previsão conforme a distância (em sessões) até o evento. */
const ACCURACY = [0.85, 0.65, 0.4];

/**
 * Previsão de uma sessão vista no "dia" `completed` (quantas sessões já
 * aconteceram). Quanto mais perto da sessão, mais precisa.
 */
export function forecastFor(
  track: Track,
  actual: WeekendWeather,
  seed: number,
  session: SessionId,
  completed: number,
): Forecast {
  const idx = SESSIONS.indexOf(session);
  const w = actual[session];
  const distance = idx - completed;
  if (distance < 0) {
    // Sessão já aconteceu: a "previsão" é o tempo que fez.
    return {
      session,
      rainProb: w.rain ? 1 : 0,
      heavyRainProb: w.rain === 2 ? 1 : 0,
      hotProb: w.hot ? 1 : 0,
      windProb: w.windy ? 1 : 0,
      tempRange: [w.temperature, w.temperature],
      windRange: [w.windSpeed, w.windSpeed],
      confidence: 1,
    };
  }
  const acc = ACCURACY[Math.min(distance, ACCURACY.length - 1)];
  const rng = createRng(seed).fork(`forecast:${session}:${completed}`);
  const blend = (truth: boolean, base: number) =>
    clamp(acc * (truth ? 1 : 0) + (1 - acc) * base + rng.gauss(0.06 * (1 - acc)), 0.03, 0.97);

  const rainProb = blend(w.rain > 0, track.rainChance);
  const heavyCond = clamp(acc * (w.rain === 2 ? 1 : w.rain === 1 ? 0 : 0.45) + (1 - acc) * 0.45, 0.05, 0.95);
  const spread = 2 + (1 - acc) * 14;
  const tCenter = w.temperature + rng.gauss((1 - acc) * 5);
  const wCenter = w.windSpeed + rng.gauss((1 - acc) * 10);
  return {
    session,
    rainProb: round2(rainProb),
    heavyRainProb: round2(rainProb * heavyCond),
    hotProb: round2(blend(w.hot, hotChanceFor(track, session))),
    windProb: round2(blend(w.windy, track.windChance)),
    tempRange: [Math.round(tCenter - spread / 2), Math.round(tCenter + spread / 2)],
    windRange: [Math.max(0, Math.round(wCenter - spread)), Math.round(wCenter + spread)],
    confidence: acc,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function describeWeather(w: Weather): string {
  const rain = w.rain === 0 ? 'Sol' : w.rain === 1 ? 'Chuva leve' : 'Chuva forte';
  return `${rain} · ${w.temperature}°C (${w.hot ? 'Calor' : 'Frio'}) · ${w.windy ? 'Com vento' : 'Sem vento'} ${w.windSpeed} km/h`;
}

/** Sorteia um cenário possível a partir de uma previsão (usado pelos bots). */
export function sampleFromForecast(f: Forecast, rng: Rng): Weather {
  const rainy = rng.chance(f.rainProb);
  const heavy = rainy && rng.chance(f.rainProb > 0 ? f.heavyRainProb / f.rainProb : 0);
  const hot = rng.chance(f.hotProb);
  const windy = rng.chance(f.windProb);
  return {
    rain: rainy ? (heavy ? 2 : 1) : 0,
    hot,
    windy,
    temperature: Math.round((f.tempRange[0] + f.tempRange[1]) / 2),
    windSpeed: Math.round((f.windRange[0] + f.windRange[1]) / 2),
  };
}
