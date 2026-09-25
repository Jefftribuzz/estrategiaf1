import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../server/app';
import type { Mail } from '../server/mailer';
import { FileStore } from '../server/store';

let server: Server;
let base = '';
let dir = '';
let clock = new Date('2026-03-10T15:00:00Z');
const mails: Mail[] = [];
let ipSeq = 0;

interface Opts {
  token?: string;
  cookie?: string;
  headers?: Record<string, string>;
}

/** Requisição como o navegador faz: cookie + X-GP8: 1 (sem token no corpo). */
async function call(path: string, body?: unknown, o: Opts = {}) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.1.0.${++ipSeq % 250}`,
      'x-gp8': '1',
      ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...o.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return { status: res.status, setCookie, cookie: setCookie.split(';')[0], body: await res.json().catch(() => null) };
}

const signup = (email: string, nickname = 'Piloto') =>
  call('/api/auth/signup', { firstName: 'Ana', lastName: 'Lima', nickname, email, password: 'senhaForte1' });

const linkToken = (m: Mail, param: string) => new URL(/https:\/\/\S+/.exec(m.text)![0]).searchParams.get(param)!;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gp8-sec-'));
  server = createServer(
    createApp({
      store: new FileStore(dir),
      now: () => clock,
      trustProxy: true,
      pushSend: async () => undefined,
      mailer: async (m) => void mails.push(m),
      publicUrl: 'https://estrategiaf1.com.br',
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('sessão em cookie HttpOnly', () => {
  test('login grava cookie HttpOnly e não devolve o token para a página', async () => {
    const r = await signup('cookie@exemplo.com');
    expect(r.status).toBe(200);
    expect(r.body.token).toBeUndefined();
    expect(r.setCookie).toMatch(/^gp8_session=[\w-]+\.[\w-]+;/);
    expect(r.setCookie).toContain('HttpOnly');
    expect(r.setCookie).toContain('SameSite=Lax');
    expect(r.setCookie).toContain('Path=/api');
    expect((await call('/api/me', undefined, { cookie: r.cookie })).body.user.email).toBe('cookie@exemplo.com');

    const https = await call('/api/auth/login', { email: 'cookie@exemplo.com', password: 'senhaForte1' }, { headers: { 'x-forwarded-proto': 'https' } });
    expect(https.setCookie).toContain('Secure');

    const out = await call('/api/auth/logout', {}, { cookie: r.cookie });
    expect(out.setCookie).toContain('Max-Age=0');
    expect((await call('/api/me', undefined, { cookie: r.cookie })).status).toBe(401);
  });

  test('CSRF: sem o cabeçalho X-GP8 ou vindo de outro site, recusa', async () => {
    const r = await signup('csrf@exemplo.com');
    const noHeader = await call('/api/profile', { nickname: 'Hacker' }, { cookie: r.cookie, headers: { 'x-gp8': '' } });
    expect(noHeader.status).toBe(403);
    const evil = await call('/api/profile', { nickname: 'Hacker' }, { cookie: r.cookie, headers: { origin: 'https://site-malicioso.com' } });
    expect(evil.status).toBe(403);
    const loginCsrf = await call('/api/auth/login', { email: 'csrf@exemplo.com', password: 'senhaForte1' }, { headers: { 'x-gp8': '' } });
    expect(loginCsrf.status).toBe(403);
    const own = await call('/api/profile', { nickname: 'Legal' }, { cookie: r.cookie, headers: { origin: base } });
    expect(own.status).toBe(200);
    // Leitura (GET) não muda nada e continua liberada.
    expect((await call('/api/me', undefined, { cookie: r.cookie, headers: { 'x-gp8': '' } })).status).toBe(200);
  });

  test('migra o token antigo do localStorage para cookie e invalida o antigo', async () => {
    const old = await call('/api/register', { name: 'Antigo' }, { headers: { 'x-gp8': 'api' } });
    expect(old.body.token).toMatch(/\./);
    const m = await call('/api/auth/cookie', {}, { token: old.body.token });
    expect(m.status).toBe(200);
    expect(m.body.token).toBeUndefined();
    expect((await call('/api/me', undefined, { token: old.body.token })).status).toBe(401);
    expect((await call('/api/me', undefined, { cookie: m.cookie })).body.user.name).toBe('Antigo');
  });
});

describe('recuperação de senha por e-mail', () => {
  test('link de uso único, 30 minutos, desconecta os outros aparelhos', async () => {
    const r = await signup('esqueci@exemplo.com', 'Esquecido');
    mails.length = 0;
    const ghost = await call('/api/auth/forgot', { email: 'ninguem@exemplo.com' });
    expect(ghost).toMatchObject({ status: 200, body: { ok: true } });
    expect(mails).toHaveLength(0);

    await call('/api/auth/forgot', { email: 'Esqueci@Exemplo.com' });
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('esqueci@exemplo.com');
    expect(mails[0].text).toContain('https://estrategiaf1.com.br/jogar/?reset=');
    const token = linkToken(mails[0], 'reset');

    expect((await call('/api/auth/reset', { token, password: 'curta' })).status).toBe(400);
    const ok = await call('/api/auth/reset', { token, password: 'novaSenha3' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect((await call('/api/me', undefined, { cookie: r.cookie })).status).toBe(401);
    expect((await call('/api/me', undefined, { cookie: ok.cookie })).status).toBe(200);
    expect((await call('/api/auth/reset', { token, password: 'outraSenha4' })).status).toBe(400);
    expect((await call('/api/auth/login', { email: 'esqueci@exemplo.com', password: 'novaSenha3' })).status).toBe(200);
  });

  test('link vence em 30 minutos e só o mais recente vale', async () => {
    await signup('vence@exemplo.com');
    mails.length = 0;
    await call('/api/auth/forgot', { email: 'vence@exemplo.com' });
    await call('/api/auth/forgot', { email: 'vence@exemplo.com' });
    const [first, second] = mails.map((m) => linkToken(m, 'reset'));
    expect((await call('/api/auth/reset', { token: first, password: 'novaSenha3' })).status).toBe(400);
    clock = new Date(clock.getTime() + 31 * 60_000);
    expect((await call('/api/auth/reset', { token: second, password: 'novaSenha3' })).status).toBe(400);
  });

  test('limita pedidos por e-mail sem revelar nada', async () => {
    await signup('spam@exemplo.com');
    mails.length = 0;
    for (let i = 0; i < 5; i++) expect((await call('/api/auth/forgot', { email: 'spam@exemplo.com' })).status).toBe(200);
    expect(mails).toHaveLength(3);
  });
});

describe('confirmação de e-mail', () => {
  test('cadastro envia link; confirmar marca o e-mail', async () => {
    mails.length = 0;
    const r = await signup('confirma@exemplo.com');
    expect(r.body.user.emailVerified).toBe(false);
    expect(mails[0].subject).toMatch(/Confirme/);
    const token = linkToken(mails[0], 'verificar');
    expect((await call('/api/auth/verify', { token: 'x'.repeat(40) })).status).toBe(400);
    expect((await call('/api/auth/verify', { token })).body).toMatchObject({ ok: true, email: 'confirma@exemplo.com' });
    expect((await call('/api/profile', undefined, { cookie: r.cookie })).body.emailVerified).toBe(true);
    expect((await call('/api/auth/verify', { token })).status).toBe(400);
    expect((await call('/api/auth/verify/resend', {}, { cookie: r.cookie })).body.verified).toBe(true);
  });

  test('reenviar gera link novo e invalida o anterior', async () => {
    mails.length = 0;
    const r = await signup('reenvia@exemplo.com');
    await call('/api/auth/verify/resend', {}, { cookie: r.cookie });
    const [first, second] = mails.map((m) => linkToken(m, 'verificar'));
    expect((await call('/api/auth/verify', { token: first })).status).toBe(400);
    expect((await call('/api/auth/verify', { token: second })).status).toBe(200);
  });
});

describe('código para entrar em outro aparelho', () => {
  test('código curto, uso único, vence em 10 minutos', async () => {
    const r = await signup('aparelho@exemplo.com');
    const { code } = (await call('/api/device/code', {}, { cookie: r.cookie })).body;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const other = await call('/api/device/redeem', { code: code.toLowerCase().replace(/(.{4})/, '$1-') });
    expect(other.status).toBe(200);
    expect(other.body.token).toBeUndefined();
    expect((await call('/api/me', undefined, { cookie: other.cookie })).body.user.email).toBe('aparelho@exemplo.com');
    expect((await call('/api/device/redeem', { code })).status).toBe(400);

    const late = (await call('/api/device/code', {}, { cookie: r.cookie })).body.code;
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await call('/api/device/redeem', { code: late })).status).toBe(400);
    expect((await call('/api/token/new', {}, { cookie: r.cookie })).status).toBe(404);
  });
});
