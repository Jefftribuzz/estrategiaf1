import { describe, expect, test } from 'vitest';
import { AERO_PARTS, ENGINE_PARTS, getAero, getEngine, getTyre, TYRE_PARTS } from '../src/engine/data/parts';
import { getTeam, TEAMS } from '../src/engine/data/teams';
import { getTrack, TRACKS } from '../src/engine/data/tracks';
import { effectivePower, idealLap } from '../src/engine/performance';
import { createRng } from '../src/engine/rng';
import { buildFor } from '../src/engine/session';
import type { Weather } from '../src/engine/types';
import { createWeekend, forecasts, runPractice, runQualifying, runRace, validateStrategy } from '../src/engine/weekend';

const DRY: Weather = { rain: 0, hot: false, windy: false, temperature: 18, windSpeed: 5 };
const HEAVY_RAIN: Weather = { rain: 2, hot: false, windy: false, temperature: 15, windSpeed: 5 };
const team = getTeam('lotus-72d');

function lap(trackId: string, aero: string, engine: string, tyre: string, weather: Weather) {
  return idealLap({
    build: buildFor(team, { aero, engine }),
    tyre: getTyre(tyre),
    track: getTrack(trackId),
    weather,
    wear: 0,
    fuel: 0.5,
    mode: 'normal',
  }).total;
}

describe('dados', () => {
  test('10 carros, 10 pistas e 10 modelos de cada fator', () => {
    expect(TEAMS).toHaveLength(10);
    expect(TRACKS).toHaveLength(10);
    expect(AERO_PARTS).toHaveLength(10);
    expect(ENGINE_PARTS).toHaveLength(10);
    expect(TYRE_PARTS).toHaveLength(10);
  });

  test('perfis de pista somam 1 e atributos de piloto somam 552', () => {
    for (const t of TRACKS) {
      const p = t.profile;
      expect(p.straights + p.slowCorners + p.fastCorners).toBeCloseTo(1, 5);
    }
    for (const t of TEAMS) {
      const s = t.driver.skills;
      expect(s.pace + s.qualifying + s.wet + s.tyres + s.consistency + s.start).toBe(552);
    }
  });
});

describe('física', () => {
  test('Monza pede asa baixa; Mônaco pede asa alta', () => {
    expect(lap('monza', 'A1', 'M5', 'P4', DRY)).toBeLessThan(lap('monza', 'A10', 'M5', 'P4', DRY));
    expect(lap('monaco', 'A10', 'M5', 'P4', DRY)).toBeLessThan(lap('monaco', 'A1', 'M5', 'P4', DRY));
  });

  test('pneu de chuva ganha na chuva e perde no seco', () => {
    expect(lap('spa', 'A5', 'M5', 'P10', HEAVY_RAIN)).toBeLessThan(lap('spa', 'A5', 'M5', 'P1', HEAVY_RAIN));
    expect(lap('spa', 'A5', 'M5', 'P1', DRY)).toBeLessThan(lap('spa', 'A5', 'M5', 'P10', DRY));
  });

  test('turbo perde menos potência na altitude', () => {
    const mex = getTrack('mexico');
    const loss = (id: string) => 1 - effectivePower(getEngine(id), mex, DRY) / effectivePower(getEngine(id), getTrack('monza'), DRY);
    expect(loss('M6')).toBeLessThan(loss('M5'));
  });

  test('o melhor nem sempre é o melhor: peça mais cara não vence em todas as pistas', () => {
    const top = getAero('A10');
    const low = getAero('A1');
    expect(top.price).toBeGreaterThan(low.price);
    expect(lap('monza', 'A1', 'M9', 'P4', DRY)).toBeLessThan(lap('monza', 'A10', 'M9', 'P4', DRY));
  });
});

describe('fim de semana', () => {
  const setup = { aero: 'A5', engine: 'M5', tyre: 'P4' };

  function play(seed: number) {
    let s = createWeekend({ trackId: 'interlagos', playerTeamId: 'mclaren-mp4-4', difficulty: 'normal', seed, now: new Date('2026-01-01T12:00:00') });
    s = runPractice(s, [setup, { ...setup, aero: 'A7' }]);
    s = runQualifying(s, setup);
    s = runRace(s, { stints: ['P4', 'P4'], pitLaps: [14], mode: 'normal' });
    return s;
  }

  test('mesma semente, mesmo resultado', () => {
    expect(play(7).race!.classification).toEqual(play(7).race!.classification);
  });

  test('corrida completa com 10 classificados e pontos', () => {
    const s = play(11);
    expect(s.race!.classification).toHaveLength(10);
    expect(s.race!.laps).toHaveLength(getTrack('interlagos').laps);
    expect(s.completed).toBe(3);
    for (const id of Object.keys(s.spent)) expect(s.spent[id]).toBeLessThanOrEqual(s.budget);
  });

  test('cronograma: uma sessão por dia, às 20h', () => {
    const s = createWeekend({ trackId: 'monza', playerTeamId: 'lotus-49', difficulty: 'facil', seed: 1, now: new Date('2026-01-01T12:00:00') });
    expect(s.schedule.map((x) => new Date(x.date).getDate())).toEqual([2, 3, 4]);
    expect(new Date(s.schedule[0].date).getHours()).toBe(20);
  });

  test('previsão fica mais confiável e vira o tempo real após a sessão', () => {
    let s = createWeekend({ trackId: 'spa', playerTeamId: 'lotus-49', difficulty: 'facil', seed: 3 });
    const before = forecasts(s)[2].confidence;
    s = runPractice(s, [setup]);
    s = runQualifying(s, setup);
    expect(forecasts(s)[2].confidence).toBeGreaterThan(before);
    const qf = forecasts(s)[1];
    expect(qf.rainProb).toBe(s.weather.classificacao.rain ? 1 : 0);
  });

  test('orçamento e estratégia são validados', () => {
    let s = createWeekend({ trackId: 'monza', playerTeamId: 'lotus-49', difficulty: 'facil', seed: 5 });
    s = runPractice(s, [setup]);
    expect(() => runQualifying(s, { aero: 'A9', engine: 'M9', tyre: 'P8' })).toThrow(/orçamento/);
    s = runQualifying(s, setup);
    expect(validateStrategy(s, { stints: ['P4', 'P4'], pitLaps: [], mode: 'normal' })).toMatch(/volta/);
    expect(validateStrategy(s, { stints: ['P4', 'P4'], pitLaps: [40], mode: 'normal' })).toMatch(/entre/);
    expect(validateStrategy(s, { stints: ['P8', 'P8', 'P8', 'P8'], pitLaps: [5, 10, 15], mode: 'normal' })).toMatch(/restam/);
    expect(validateStrategy(s, { stints: ['P4', 'P4'], pitLaps: [13], mode: 'normal' })).toBeNull();
  });

  test('rng determinístico', () => {
    const a = createRng(99);
    const b = createRng(99);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});
