import { expect, test } from 'vitest';
import { TEAMS } from '../src/engine/data/teams';
import { TRACKS } from '../src/engine/data/tracks';
import { createRng } from '../src/engine/rng';
import { buildFor, simulateRace } from '../src/engine/session';
import { rollWeekendWeather } from '../src/engine/weather';

// Com o mesmo acerto para todos, nenhum piloto/chassi pode dominar.
test('pilotos e chassis equilibrados com acerto igual', () => {
  const wins: Record<string, number> = Object.fromEntries(TEAMS.map((t) => [t.id, 0]));
  const points: Record<string, number> = Object.fromEntries(TEAMS.map((t) => [t.id, 0]));
  let races = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const track of TRACKS) {
      const rng = createRng(seed * 1000 + races);
      const weather = rollWeekendWeather(track, rng.fork('w')).corrida;
      const tyre = weather.rain === 2 ? 'P10' : weather.rain === 1 ? 'P9' : 'P4';
      const grid = [...TEAMS].sort(() => rng.next() - 0.5).map((team) => ({
        team,
        build: buildFor(team, { aero: 'A5', engine: 'M5' }),
        strategy: { stints: [tyre, tyre], pitLaps: [Math.floor(track.laps / 2)], mode: 'normal' as const },
      }));
      const r = simulateRace(grid, track, weather, rng);
      wins[r.classification[0].teamId]++;
      for (const c of r.classification) points[c.teamId] += c.points;
      races++;
    }
  }
  for (const id of Object.keys(wins)) {
    expect(wins[id] / races).toBeLessThan(0.2);
    expect(wins[id] / races).toBeGreaterThan(0.03);
  }
  const pts = Object.values(points);
  expect(Math.max(...pts) / Math.min(...pts)).toBeLessThan(2.2);
}, 60000);
