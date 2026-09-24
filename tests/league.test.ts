import { describe, expect, test } from 'vitest';
import {
  advance,
  allReady,
  createLeague,
  forceSession,
  joinLeague,
  leagueBuy,
  nextDeadline,
  sessionInstant,
  startLeague,
  submitDecision,
  viewFor,
  zonedInstant,
  type LeagueState,
} from '../src/engine/league';

const NOW = new Date('2026-03-10T15:00:00Z');
const SETUP = { aero: 'A5', engine: 'M5', tyre: 'P4' };

function base(pace: 'diario' | 'rapido' = 'diario'): LeagueState {
  let l = createLeague({ id: 'l1', code: 'ABC123', name: 'Liga dos amigos', ownerId: 'u1', difficulty: 'normal', timezone: 'America/Sao_Paulo', pace, seed: 42, now: NOW });
  l = joinLeague(l, 'u1', 'Jeff', 'mclaren-mp4-4');
  l = joinLeague(l, 'u2', 'Ana', 'williams-fw14b');
  return l;
}

describe('liga', () => {
  test('fuso horário: 20h em São Paulo = 23h UTC; 20h em Lisboa no verão = 19h UTC', () => {
    expect(zonedInstant('2026-03-11', 20, 'America/Sao_Paulo').toISOString()).toBe('2026-03-11T23:00:00.000Z');
    expect(zonedInstant('2026-07-01', 20, 'Europe/Lisbon').toISOString()).toBe('2026-07-01T19:00:00.000Z');
  });

  test('lobby: equipe ocupada, troca de equipe e largada só pelo dono', () => {
    let l = base();
    expect(() => joinLeague(l, 'u3', 'Bia', 'mclaren-mp4-4')).toThrow(/Jeff/);
    l = joinLeague(l, 'u2', 'Ana', 'ferrari-f2004');
    expect(Object.keys(l.humans).sort()).toEqual(['ferrari-f2004', 'mclaren-mp4-4']);
    expect(() => startLeague(l, 'u2', NOW)).toThrow(/criou/);
    l = startLeague(l, 'u1', NOW);
    expect(l.status).toBe('running');
    // Primeira sessão: amanhã às 20h no fuso da liga.
    expect(nextDeadline(l)!.toISOString()).toBe('2026-03-11T23:00:00.000Z');
    expect(sessionInstant(l, 3).toISOString()).toBe('2026-03-14T23:00:00.000Z');
    expect(l.humans['mclaren-mp4-4'].cash).toBe(150 + 12);
  });

  test('sessão roda no horário; quem não enviou fica com o engenheiro', () => {
    let l = startLeague(base(), 'u1', NOW);
    l = submitDecision(l, 'u1', 'teste', [SETUP, { ...SETUP, aero: 'A7' }], NOW);
    l = advance(l, new Date('2026-03-11T22:59:00Z'));
    expect(l.weekend!.completed).toBe(0);
    l = advance(l, new Date('2026-03-11T23:00:00Z'));
    expect(l.weekend!.completed).toBe(1);
    expect(l.weekend!.practiceByTeam!['mclaren-mp4-4']).toHaveLength(2);
    expect(l.weekend!.practiceByTeam!['williams-fw14b']).toHaveLength(1);
    expect(() => submitDecision(l, 'u1', 'teste', [SETUP], NOW)).toThrow(/aberta/);
  });

  test('todos prontos antecipa a sessão', () => {
    let l = startLeague(base(), 'u1', NOW);
    l = submitDecision(l, 'u1', 'teste', [SETUP], NOW);
    expect(allReady(l)).toBe(false);
    l = submitDecision(l, 'u2', 'teste', [SETUP], NOW);
    l = advance(l, NOW);
    expect(l.weekend!.completed).toBe(1);
  });

  test('visão do jogador esconde semente, tempo futuro e telemetria alheia', () => {
    let l = startLeague(base(), 'u1', NOW);
    l = forceSession(l, 'u1');
    const v = viewFor(l, 'u2');
    const w = v.season!.weekend!;
    expect(w.seed).toBe(0);
    expect(w.weather.corrida.temperature).toBe(0);
    expect(w.forecastView).toHaveLength(3);
    expect(w.practiceRuns.every((r) => r.teamId === 'williams-fw14b')).toBe(true);
    expect(Object.keys(w.humans!)).toEqual(['williams-fw14b']);
    expect(v.season!.cash).toBe(162);
    expect(JSON.stringify(v)).not.toContain('"seed":42');
  });

  test('prazo, validação e compras antes do teste', () => {
    let l = startLeague(base(), 'u1', NOW);
    expect(() => submitDecision(l, 'u1', 'teste', [SETUP], new Date('2026-03-12T00:00:00Z'))).toThrow(/prazo/);
    expect(() => submitDecision(l, 'u1', 'teste', [{ aero: 'X', engine: 'M5', tyre: 'P4' }], NOW)).toThrow();
    expect(() => submitDecision(l, 'u9', 'teste', [SETUP], NOW)).toThrow(/participa/);
    l = leagueBuy(l, 'u1', 'engine', 'M9');
    expect(l.humans['mclaren-mp4-4'].cash).toBe(162 - 28);
    expect(l.weekend!.humans!['mclaren-mp4-4'].owned!.engine).toContain('M9');
    l = leagueBuy(l, 'u1', 'dev', 'fast');
    expect(l.weekend!.mods!['mclaren-mp4-4'].fast).toBeGreaterThan(0);
    l = forceSession(l, 'u1');
    expect(() => leagueBuy(l, 'u1', 'aero', 'A5')).toThrow(/antes do teste/);
  });

  test('temporada inteira avança sozinha até o campeão', () => {
    let l = startLeague(base('rapido'), 'u1', NOW);
    l = advance(l, new Date(NOW.getTime() + 365 * 864e5));
    expect(l.status).toBe('finished');
    expect(l.results).toHaveLength(10);
    for (const slot of Object.values(l.humans)) expect(slot.cash).toBeGreaterThanOrEqual(0);
    expect(viewFor(l, 'u1').season!.finished).toBe(true);
    const last = viewFor(l, 'u1').lastWeekend!;
    expect(last.race!.classification).toHaveLength(10);
    expect(last.trackId).toBe('interlagos');
  }, 60000);
});
