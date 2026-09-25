import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newDb } from 'pg-mem';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../server/app';
import { FileStore, PgStore } from '../server/store';

let server: Server;
let base = '';
let dir = '';
let clock = new Date('2026-03-10T15:00:00Z');

async function call(path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-gp8': 'api', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gp8-'));
  server = createServer(createApp({ store: new FileStore(dir), now: () => clock }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('API multiplayer', () => {
  test('fluxo completo: cadastro, liga, convite, largada, decisões e resultado', async () => {
    const jeff = (await call('/api/register', undefined, { name: 'Jeff' })).body;
    const ana = (await call('/api/register', undefined, { name: 'Ana' })).body;
    expect(jeff.token).toMatch(/\./);

    expect((await call('/api/me')).status).toBe(401);
    expect((await call('/api/me', 'x.y')).status).toBe(401);

    const league = (await call('/api/leagues', jeff.token, { name: 'Liga dos amigos', difficulty: 'normal', timezone: 'America/Sao_Paulo', pace: 'diario' })).body;
    expect(league.code).toHaveLength(6);
    expect(league.status).toBe('lobby');

    const joined = await call('/api/join', ana.token, { code: league.code.toLowerCase() });
    expect(joined.body.leagueId).toBe(league.id);

    await call(`/api/leagues/${league.id}/team`, jeff.token, { teamId: 'mclaren-mp4-4' });
    const taken = await call(`/api/leagues/${league.id}/team`, ana.token, { teamId: 'mclaren-mp4-4' });
    expect(taken.status).toBe(400);
    expect(taken.body.error).toMatch(/Jeff/);
    await call(`/api/leagues/${league.id}/team`, ana.token, { teamId: 'ferrari-f2004' });

    expect((await call(`/api/leagues/${league.id}/start`, ana.token, {})).status).toBe(400);
    const started = (await call(`/api/leagues/${league.id}/start`, jeff.token, {})).body;
    expect(started.status).toBe('running');
    expect(started.nextDeadline).toBe('2026-03-11T23:00:00.000Z');
    expect(started.session).toBe('teste');

    const setup = { aero: 'A5', engine: 'M5', tyre: 'P4' };
    const d1 = (await call(`/api/leagues/${league.id}/decision`, jeff.token, { session: 'teste', payload: [setup] })).body;
    expect(d1.myDecision).toEqual([setup]);
    expect(d1.members.find((m: { teamId: string }) => m.teamId === 'mclaren-mp4-4').ready).toBe(true);

    // Ana também envia: todos prontos, o teste roda na hora.
    const d2 = (await call(`/api/leagues/${league.id}/decision`, ana.token, { session: 'teste', payload: [setup] })).body;
    expect(d2.session).toBe('classificacao');
    expect(d2.season.weekend.practiceRuns).toHaveLength(1);
    expect(d2.season.weekend.seed).toBe(0);

    // Ninguém envia a classificação: o relógio passa do prazo e o engenheiro decide.
    clock = new Date('2026-03-13T00:00:00Z');
    const v = (await call(`/api/leagues/${league.id}`, ana.token)).body;
    expect(v.session).toBe('corrida');
    expect(v.season.weekend.quali).toHaveLength(10);

    // Um mês depois, a temporada terminou.
    clock = new Date('2026-05-01T00:00:00Z');
    const end = (await call(`/api/leagues/${league.id}`, jeff.token)).body;
    expect(end.status).toBe('finished');
    expect(end.season.results).toHaveLength(10);

    const me = (await call('/api/me', jeff.token)).body;
    expect(me.leagues[0].status).toBe('finished');
  }, 60000);

  test('não serve liga de quem não participa e bloqueia path traversal', async () => {
    const bia = (await call('/api/register', undefined, { name: 'Bia' })).body;
    expect((await call('/api/leagues/abc', bia.token)).status).toBe(404);
    expect((await call('/api/register', undefined, { name: '' })).status).toBe(400);
    const res = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    expect(res.status).toBe(404);
  });
});

test('PgStore grava e lê documentos (Postgres em memória)', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const store = new PgStore(new Pool());
  expect(await store.get('x')).toBeNull();
  await store.put('x', { a: 1, nested: { b: [1, 2] } });
  await store.put('x', { a: 2 });
  expect(await store.get('x')).toEqual({ a: 2 });
});
