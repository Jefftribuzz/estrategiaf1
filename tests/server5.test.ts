import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../server/app';
import { googleVerifier } from '../server/google';
import type { PushPayload, PushSubscriptionJSON } from '../server/push';
import { FileStore } from '../server/store';

let server: Server;
let app: ReturnType<typeof createApp>;
let base = '';
let dir = '';
let clock = new Date('2026-03-10T15:00:00Z');
const sent: { endpoint: string; payload: PushPayload }[] = [];
const deadEndpoints = new Set<string>();

async function call(path: string, token?: string, body?: unknown, ip = '1.1.1.1') {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-gp8': 'api', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

const sub = (n: string): PushSubscriptionJSON => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gp8-5-'));
  await mkdir(join(dir, 'static', 'jogar'), { recursive: true });
  await writeFile(join(dir, 'static', 'index.html'), '<!doctype html><title>landing</title>');
  await writeFile(join(dir, 'static', '404.html'), '<!doctype html><title>404</title>');
  await writeFile(join(dir, 'static', 'jogar', 'index.html'), '<!doctype html><title>jogo</title>');
  app = createApp({
    store: new FileStore(join(dir, 'data')),
    now: () => clock,
    staticDir: join(dir, 'static'),
    trustProxy: true,
    googleClientId: 'cliente-123',
    googleVerify: async (cred) => {
      if (!cred.startsWith('ok:')) throw new Error('Login do Google inválido.');
      return { sub: cred.slice(3), name: 'Google User' };
    },
    pushSend: async (s, payload) => {
      if (deadEndpoints.has(s.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push({ endpoint: s.endpoint, payload });
    },
  });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('Fase 5: segurança', () => {
  test('cabeçalhos de segurança na API e nas páginas', async () => {
    const api = await call('/api/config');
    expect(api.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(api.headers.get('x-content-type-options')).toBe('nosniff');
    expect(api.body.vapidPublicKey).toMatch(/^[\w-]{40,}$/);
    expect(api.body.googleClientId).toBe('cliente-123');
    const page = await fetch(`${base}/`, { headers: { 'x-forwarded-proto': 'https' } });
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(page.headers.get('strict-transport-security')).toContain('max-age');
  });

  test('limite de cadastros por IP', async () => {
    for (let i = 0; i < 5; i++) expect((await call('/api/register', undefined, { name: `P${i}` }, '9.9.9.9')).status).toBe(200);
    const blocked = await call('/api/register', undefined, { name: 'P6' }, '9.9.9.9');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect((await call('/api/register', undefined, { name: 'Outro IP' }, '8.8.8.8')).status).toBe(200);
  });
});

describe('domínio: landing na raiz e jogo em /jogar/', () => {
  test('rotas, redirecionamentos e 404', async () => {
    const get = (p: string) => fetch(base + p, { redirect: 'manual' });
    expect(await (await get('/')).text()).toContain('landing');
    expect(await (await get('/jogar/')).text()).toContain('jogo');
    const r1 = await get('/jogar');
    expect(r1.status).toBe(301);
    expect(r1.headers.get('location')).toBe('/jogar/');
    const r2 = await get('/?liga=ABC123');
    expect(r2.status).toBe(302);
    expect(r2.headers.get('location')).toBe('/jogar/?liga=ABC123');
    // Rota desconhecida dentro do jogo abre o jogo; fora dele, 404 da landing.
    expect(await (await get('/jogar/qualquer')).text()).toContain('jogo');
    const miss = await get('/nao-existe');
    expect(miss.status).toBe(404);
    expect(await miss.text()).toContain('404');
    expect((await get('/%E0%A4%A')).status).toBe(400);
    await mkdir(join(dir, 'static', 'pistas', 'monza'), { recursive: true });
    await writeFile(join(dir, 'static', 'pistas', 'monza', 'index.html'), '<!doctype html><title>monza</title>');
    const r3 = await get('/pistas/monza');
    expect(r3.status).toBe(301);
    expect(r3.headers.get('location')).toBe('/pistas/monza/');
    expect(await (await get('/pistas/monza/')).text()).toContain('monza');
  });
});

describe('Fase 5: perfil em vários aparelhos e Google', () => {
  test('código para outro aparelho e desconectar os outros', async () => {
    const me = (await call('/api/register', undefined, { name: 'Jeff' }, '2.2.2.2')).body;
    const { code } = (await call('/api/device/code', me.token, {})).body;
    const other = (await call('/api/device/redeem', undefined, { code })).body.token;
    expect((await call('/api/me', other)).body.user.devices).toBe(2);
    const fresh = (await call('/api/token/rotate', other, {})).body.token;
    expect((await call('/api/me', me.token)).status).toBe(401);
    expect((await call('/api/me', other)).status).toBe(401);
    expect((await call('/api/me', fresh)).body.user.name).toBe('Jeff');
  });

  test('login com Google cria, reencontra e vincula perfis', async () => {
    expect((await call('/api/login/google', undefined, { credential: 'ruim' })).status).toBe(401);
    const a = (await call('/api/login/google', undefined, { credential: 'ok:g1' })).body;
    expect(a.user.name).toBe('Google User');
    const again = (await call('/api/login/google', undefined, { credential: 'ok:g1' })).body;
    expect(again.user.id).toBe(a.user.id);
    expect(again.token).not.toBe(a.token);

    const nick = (await call('/api/register', undefined, { name: 'Ana' }, '3.3.3.3')).body;
    const link = await call('/api/login/google', nick.token, { credential: 'ok:g2' });
    expect(link.body.linked).toBe(true);
    expect((await call('/api/me', nick.token)).body.user.google).toBe(true);
    const back = (await call('/api/login/google', undefined, { credential: 'ok:g2' })).body;
    expect(back.user.id).toBe(nick.user.id);
    expect((await call('/api/login/google', nick.token, { credential: 'ok:g1' })).status).toBe(409);
  });

  test('verificador do Google confere audiência e validade', async () => {
    const good = { aud: 'c1', iss: 'https://accounts.google.com', exp: '9999999999', sub: '42', email: 'a@b.c', email_verified: 'true' };
    const fake = (body: object) => async () => ({ ok: true, json: async () => body });
    expect((await googleVerifier('c1', fake(good))('t')).sub).toBe('42');
    await expect(googleVerifier('c1', fake({ ...good, aud: 'outro' }))('t')).rejects.toThrow();
    await expect(googleVerifier('c1', fake({ ...good, exp: '1' }))('t')).rejects.toThrow();
    await expect(googleVerifier('c1', fake({ ...good, email_verified: 'false' }))('t')).rejects.toThrow();
  });
});

describe('Fase 5: notificações e ranking', () => {
  test('avisos de largada, lembrete 1h antes, resultado, inscrição morta e ranking', async () => {
    clock = new Date('2026-03-10T15:00:00Z');
    const jeff = (await call('/api/register', undefined, { name: 'Jeff' }, '4.4.4.4')).body;
    const ana = (await call('/api/register', undefined, { name: 'Ana' }, '5.5.5.5')).body;
    expect((await call('/api/push/subscribe', jeff.token, { subscription: { endpoint: 'http://x' } })).status).toBe(400);
    await call('/api/push/subscribe', jeff.token, { subscription: sub('jeff') });
    await call('/api/push/subscribe', ana.token, { subscription: sub('ana') });
    expect(sent.at(-1)!.payload.title).toMatch(/ligadas/);

    const league = (await call('/api/leagues', jeff.token, { name: 'Liga Push', timezone: 'America/Sao_Paulo', pace: 'diario' })).body;
    await call('/api/join', ana.token, { code: league.code });
    await call(`/api/leagues/${league.id}/team`, jeff.token, { teamId: 'mclaren-mp4-4' });
    await call(`/api/leagues/${league.id}/team`, ana.token, { teamId: 'williams-fw14b' });
    sent.length = 0;
    await call(`/api/leagues/${league.id}/start`, jeff.token, {});
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push.example/ana', 'https://push.example/jeff']);
    expect(sent[0].payload.title).toMatch(/começou/);
    expect(sent[0].payload.url).toContain(league.id);

    // Jeff decide; 30 min antes do prazo (23h UTC), só a Ana recebe lembrete, e uma vez só.
    await call(`/api/leagues/${league.id}/decision`, jeff.token, { session: 'teste', payload: [{ aero: 'A5', engine: 'M5', tyre: 'P4' }] });
    sent.length = 0;
    clock = new Date('2026-03-11T22:30:00Z');
    await app.tick();
    await app.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe('https://push.example/ana');
    expect(sent[0].payload.title).toMatch(/1 hora/);

    // Passou do prazo: o relógio do servidor roda o teste e avisa a classificação.
    sent.length = 0;
    clock = new Date('2026-03-11T23:01:00Z');
    await app.tick();
    expect(sent).toHaveLength(2);
    expect(sent[0].payload.body).toMatch(/Classificação/);

    // Inscrição morta (410) é removida.
    deadEndpoints.add('https://push.example/ana');
    clock = new Date('2026-03-13T23:01:00Z');
    await app.tick();
    expect((await call('/api/me', ana.token)).body.user.push).toBe(0);

    // Fim da temporada entra no ranking.
    clock = new Date('2026-05-01T00:00:00Z');
    sent.length = 0;
    await app.tick();
    expect(sent.at(-1)!.payload.title).toMatch(/fim de temporada/);
    const ranking = (await call('/api/ranking')).body.ranking as { name: string; seasons: number; titles: number }[];
    expect(ranking.map((r) => r.name).sort()).toEqual(['Ana', 'Jeff']);
    expect(ranking.every((r) => r.seasons === 1)).toBe(true);
  }, 60000);
});
