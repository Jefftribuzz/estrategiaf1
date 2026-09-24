import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../server/app';
import { hashPassword, verifyPassword } from '../server/auth';
import type { PushPayload } from '../server/push';
import { FileStore } from '../server/store';

let server: Server;
let base = '';
let dir = '';
let clock = new Date('2026-03-10T15:00:00Z');
const sent: { endpoint: string; payload: PushPayload }[] = [];
let ipSeq = 0;

async function call(path: string, token?: string, body?: unknown, ip = `10.0.0.${++ipSeq % 250}`) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const signup = (over: Record<string, unknown> = {}, token?: string) =>
  call('/api/auth/signup', token, { firstName: 'Jeff', lastName: 'Tribuzz', nickname: 'Jeff', email: 'jeff@exemplo.com', password: 'senhaForte1', ...over });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gp8-acc-'));
  server = createServer(
    createApp({
      store: new FileStore(dir),
      now: () => clock,
      trustProxy: true,
      pushSend: async (s, payload) => void sent.push({ endpoint: s.endpoint, payload }),
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('senhas', () => {
  test('hash scrypt com sal: confere a certa, recusa a errada', async () => {
    const h = await hashPassword('minhaSenha9');
    expect(h).toMatch(/^scrypt\$/);
    expect(h).not.toContain('minhaSenha9');
    expect(await hashPassword('minhaSenha9')).not.toBe(h);
    expect(await verifyPassword('minhaSenha9', h)).toBe(true);
    expect(await verifyPassword('outraSenha9', h)).toBe(false);
    expect(await verifyPassword('x', undefined)).toBe(false);
  });
});

describe('conta com e-mail e senha', () => {
  test('cadastro, login, e-mail duplicado e validações', async () => {
    expect((await signup({ password: 'curta' })).body.error).toMatch(/8 caracteres/);
    expect((await signup({ password: 'somenteletras' })).body.error).toMatch(/letras e números/);
    expect((await signup({ email: 'nao-e-email' })).body.error).toMatch(/e-mail/);
    const r = await signup();
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ name: 'Jeff', firstName: 'Jeff', lastName: 'Tribuzz', email: 'jeff@exemplo.com', hasPassword: true });
    expect(JSON.stringify(r.body)).not.toMatch(/senhaForte1|scrypt/);
    expect((await signup({ email: 'JEFF@exemplo.com' })).status).toBe(409);

    const bad = await call('/api/auth/login', undefined, { email: 'jeff@exemplo.com', password: 'errada123' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('E-mail ou senha incorretos.');
    const ghost = await call('/api/auth/login', undefined, { email: 'ninguem@exemplo.com', password: 'errada123' });
    expect(ghost.body.error).toBe('E-mail ou senha incorretos.');
    const ok = await call('/api/auth/login', undefined, { email: ' Jeff@Exemplo.com ', password: 'senhaForte1' });
    expect(ok.status).toBe(200);
    expect((await call('/api/profile', ok.body.token)).body.email).toBe('jeff@exemplo.com');
  });

  test('bloqueia força bruta por e-mail', async () => {
    await signup({ email: 'alvo@exemplo.com', nickname: 'Alvo' });
    for (let i = 0; i < 10; i++) await call('/api/auth/login', undefined, { email: 'alvo@exemplo.com', password: `tentativa${i}` });
    const r = await call('/api/auth/login', undefined, { email: 'alvo@exemplo.com', password: 'senhaForte1' });
    expect(r.status).toBe(429);
  });

  test('perfil antigo só com apelido ganha e-mail e senha sem perder nada', async () => {
    const old = (await call('/api/register', undefined, { name: 'Ana' })).body;
    const up = await signup({ firstName: 'Ana', lastName: 'Souza', nickname: 'AnaF1', email: 'ana@exemplo.com' }, old.token);
    expect(up.body.user.id).toBe(old.user.id);
    expect(up.body.user.name).toBe('AnaF1');
    expect((await signup({ email: 'ana2@exemplo.com' }, old.token)).status).toBe(409);
  });

  test('troca de senha desconecta os outros aparelhos; sair só deste aparelho', async () => {
    const r = (await signup({ email: 'bia@exemplo.com', nickname: 'Bia' })).body;
    const other = (await call('/api/auth/login', undefined, { email: 'bia@exemplo.com', password: 'senhaForte1' })).body.token;
    expect((await call('/api/auth/password', r.token, { current: 'errada123', next: 'novaSenha2' })).status).toBe(401);
    const ch = await call('/api/auth/password', r.token, { current: 'senhaForte1', next: 'novaSenha2' });
    expect(ch.status).toBe(200);
    expect((await call('/api/me', other)).status).toBe(401);
    expect((await call('/api/me', r.token)).status).toBe(401);
    expect((await call('/api/me', ch.body.token)).status).toBe(200);
    expect((await call('/api/auth/login', undefined, { email: 'bia@exemplo.com', password: 'novaSenha2' })).status).toBe(200);
    await call('/api/auth/logout', ch.body.token, {});
    expect((await call('/api/me', ch.body.token)).status).toBe(401);
  });
});

describe('perfil e histórico', () => {
  test('edita perfil, avatar e preferências; apelido muda na liga', async () => {
    const me = (await signup({ email: 'caio@exemplo.com', nickname: 'Caio' })).body;
    const league = (await call('/api/leagues', me.token, { name: 'Liga Perfil', pace: 'rapido', timezone: 'America/Sao_Paulo' })).body;
    await call(`/api/leagues/${league.id}/team`, me.token, { teamId: 'lotus-72d' });
    expect((await call('/api/profile', me.token, { avatar: { base: 'red', stripe1: '#fff', stripe2: '#000' } })).status).toBe(400);
    const p = await call('/api/profile', me.token, {
      nickname: 'Caião',
      firstName: 'Caio',
      lastName: 'Lima',
      avatar: { base: '#FFD700', stripe1: '#009b3a', stripe2: '#1b3a8c' },
      prefs: { sound: false, crt: true, notify: { session: false, reminder: true, results: true } },
    });
    expect(p.body).toMatchObject({ name: 'Caião', lastName: 'Lima', avatar: { base: '#ffd700' }, prefs: { sound: false, crt: true, notify: { session: false } } });
    const v = (await call(`/api/leagues/${league.id}`, me.token)).body;
    expect(v.members[0].name).toBe('Caião');

    // Preferência: sem aviso de "sessão aberta", mas recebe resultados.
    await call('/api/push/subscribe', me.token, { subscription: { endpoint: 'https://push.example/caio', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } } });
    sent.length = 0;
    await call(`/api/leagues/${league.id}/start`, me.token, {});
    expect(sent).toHaveLength(0);
    clock = new Date(clock.getTime() + 60 * 60_000);
    await call(`/api/leagues/${league.id}`, me.token);
    expect(sent.some((s) => /Resultado/.test(s.payload.title))).toBe(true);
    expect(sent.some((s) => /⏱/.test(s.payload.title))).toBe(false);

    const h = (await call('/api/profile/history', me.token)).body;
    expect(h.leagues[0]).toMatchObject({ name: 'Liga Perfil', teamId: 'lotus-72d' });
    expect(h.leagues[0].races.length).toBeGreaterThan(0);
  }, 60000);

  test('histórico solo: grava e valida', async () => {
    const me = (await signup({ email: 'duda@exemplo.com', nickname: 'Duda' })).body;
    expect((await call('/api/profile/history', me.token, { entry: { mode: 'rapida', teamId: 'x' } })).status).toBe(400);
    await call('/api/profile/history', me.token, { entry: { mode: 'rapida', teamId: 'mclaren-mp4-4', trackId: 'monaco', position: 1, points: 10, difficulty: 'dificil' } });
    await call('/api/profile/history', me.token, { entry: { mode: 'temporada', teamId: 'mclaren-mp4-4', championship: 2, points: 61, wins: 3, podiums: 6, difficulty: 'normal' } });
    const h = (await call('/api/profile/history', me.token)).body;
    expect(h.solo).toHaveLength(2);
    expect(h.solo[0]).toMatchObject({ mode: 'temporada', championship: 2 });
    expect(h.solo[1]).toMatchObject({ mode: 'rapida', trackId: 'monaco', position: 1 });
  });
});
