import { describe, expect, test } from 'vitest';
import {
  buyAero,
  buyDevelopment,
  buyEngine,
  createSeason,
  engineWearMul,
  finishRound,
  standings,
  startRound,
  updateWeekend,
  type SeasonState,
} from '../src/engine/season';
import { costFor, simulateRestOfWeekend, skipSession, teamFor } from '../src/engine/weekend';

function playSeason(seed: number): SeasonState {
  let s = createSeason({ playerTeamId: 'lotus-72d', difficulty: 'normal', seed, now: new Date('2026-03-01T12:00:00') });
  while (!s.finished) {
    s = startRound(s);
    s = updateWeekend(s, simulateRestOfWeekend(s.weekend!));
    s = finishRound(s);
    expect(s.cash).toBeGreaterThanOrEqual(0);
  }
  return s;
}

describe('temporada', () => {
  test('10 GPs, campeonato completo e caixa nunca negativo', () => {
    const s = playSeason(21);
    expect(s.results).toHaveLength(10);
    expect(s.round).toBe(10);
    const table = standings(s);
    expect(table[0].points).toBeGreaterThan(0);
    const total = Object.values(s.points).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(10 * 39);
    expect(total).toBeGreaterThan(10 * 25);
  }, 60000);

  test('determinística', () => {
    expect(playSeason(5).points).toEqual(playSeason(5).points);
  }, 60000);

  test('patrocínio creditado e peças da garagem não são cobradas de novo', () => {
    let s = createSeason({ playerTeamId: 'lotus-49', difficulty: 'facil', seed: 3 });
    s = buyAero(s, 'A5');
    s = buyEngine(s, 'M5');
    expect(s.cash).toBe(150 - 10 - 13);
    s = startRound(s);
    expect(s.weekend!.budget).toBe(150 - 23 + 12);
    expect(costFor(s.weekend!, 'lotus-49', { aero: 'A5', engine: 'M5', tyre: 'P4' })).toBe(5);
    expect(costFor(s.weekend!, 'lotus-49', { aero: 'A6', engine: 'M5', tyre: 'P4' })).toBe(16 + 5);
  });

  test('motor desgasta a cada corrida e o risco sobe', () => {
    let s = createSeason({ playerTeamId: 'lotus-49', difficulty: 'facil', seed: 4 });
    s = startRound(s);
    let w = skipSession(s.weekend!);
    w = skipSession(w);
    s = finishRound(updateWeekend(s, skipSession(w)));
    const engine = s.engines.find((e) => e.id === w.setups['lotus-49'].engine)!;
    expect(engine.races).toBe(1);
    expect(engineWearMul(engine)).toBeGreaterThan(1);
    expect(engineWearMul({ id: 'M10', races: 2 })).toBeGreaterThanOrEqual(3);
  });

  test('desenvolvimento melhora o chassi e custa caixa', () => {
    let s = createSeason({ playerTeamId: 'lotus-49', difficulty: 'facil', seed: 4 });
    s = buyDevelopment(s, 'fast');
    expect(s.cash).toBe(150 - 8);
    s = startRound(s);
    const base = teamFor({ ...s.weekend!, mods: undefined }, 'lotus-49');
    expect(teamFor(s.weekend!, 'lotus-49').chassis.fast).toBeGreaterThan(base.chassis.fast);
    expect(() => buyDevelopment(s, 'fast')).toThrow(/entre um GP/);
  });
});
