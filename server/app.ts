import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import {
  advance,
  createLeague,
  forceSession,
  joinLeague,
  leagueBuy,
  leaveLeague,
  startLeague,
  submitDecision,
  viewFor,
  type LeagueState,
  type Pace,
} from '../src/engine/league';
import type { Difficulty, SessionId } from '../src/engine/types';
import { KeyedMutex, type Store } from './store';

// API do multiplayer. Estado autoritativo no servidor: o cliente só envia
// decisões e recebe a visão dele da liga.

interface User {
  id: string;
  name: string;
  tokenHash: string;
  leagues: string[];
  createdAt: string;
}

export interface AppOptions {
  store: Store;
  now?: () => Date;
  /** Pasta com o jogo compilado (dist/) para servir junto com a API. */
  staticDir?: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_BODY = 64 * 1024;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIFFICULTIES: Difficulty['id'][] = ['facil', 'normal', 'dificil'];
const SESSIONS: SessionId[] = ['teste', 'classificacao', 'corrida'];
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function cleanName(v: unknown, max: number, what: string): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
  if (!s) throw new HttpError(400, `Informe ${what}.`);
  return s;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Requisição grande demais.');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

export function createApp(opts: AppOptions) {
  const { store } = opts;
  const now = opts.now ?? (() => new Date());
  const locks = new KeyedMutex();

  async function auth(req: IncomingMessage): Promise<User> {
    const h = req.headers.authorization ?? '';
    const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(h);
    if (!m) throw new HttpError(401, 'Faça login.');
    const user = await store.get<User>(`user:${m[1]}`);
    if (!user) throw new HttpError(401, 'Sessão inválida.');
    const a = Buffer.from(sha256(m[2]));
    const b = Buffer.from(user.tokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Sessão inválida.');
    return user;
  }

  async function loadLeague(id: string): Promise<LeagueState> {
    const l = await store.get<LeagueState>(`league:${id}`);
    if (!l) throw new HttpError(404, 'Liga não encontrada.');
    return l;
  }

  /** Carrega, avança sessões vencidas, aplica a mudança e grava, tudo sob trava. */
  function mutate(id: string, fn: (l: LeagueState) => LeagueState): Promise<LeagueState> {
    return locks.run(`league:${id}`, async () => {
      const before = await loadLeague(id);
      let l = advance(before, now());
      l = fn(l);
      if (l !== before) await store.put(`league:${id}`, l);
      return l;
    });
  }

  /** Erros de regra do jogo viram 400 com a mensagem para o jogador. */
  function wrap(fn: () => LeagueState): LeagueState {
    try {
      return fn();
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
  }

  async function addLeagueToUser(user: User, leagueId: string) {
    await locks.run(`user:${user.id}`, async () => {
      const u = (await store.get<User>(`user:${user.id}`))!;
      if (!u.leagues.includes(leagueId)) await store.put(`user:${u.id}`, { ...u, leagues: [...u.leagues, leagueId] });
    });
  }

  async function newCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const bytes = randomBytes(6);
      const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      if (!(await store.get(`code:${code}`))) return code;
    }
    throw new HttpError(500, 'Não foi possível gerar o código.');
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';

    if (method === 'POST' && path === '/api/register') {
      const body = await readJson(req);
      const name = cleanName(body.name, 20, 'seu nome');
      const id = randomUUID();
      const secret = randomBytes(24).toString('base64url');
      const user: User = { id, name, tokenHash: sha256(secret), leagues: [], createdAt: now().toISOString() };
      await store.put(`user:${id}`, user);
      return send(res, 200, { token: `${id}.${secret}`, user: { id, name } });
    }

    const user = await auth(req);

    if (method === 'GET' && path === '/api/me') {
      const leagues = [];
      for (const id of user.leagues) {
        const l = await store.get<LeagueState>(`league:${id}`);
        if (l) leagues.push({ id: l.id, name: l.name, code: l.code, status: l.status, round: l.round, members: Object.keys(l.humans).length });
      }
      return send(res, 200, { user: { id: user.id, name: user.name }, leagues });
    }

    if (method === 'POST' && path === '/api/leagues') {
      const body = await readJson(req);
      const difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty['id']) ? (body.difficulty as Difficulty['id']) : 'normal';
      const pace: Pace = body.pace === 'rapido' ? 'rapido' : 'diario';
      const timezone = typeof body.timezone === 'string' ? body.timezone : 'America/Sao_Paulo';
      const id = randomUUID();
      const code = await newCode();
      let league: LeagueState;
      try {
        league = createLeague({ id, code, name: cleanName(body.name, 40, 'o nome da liga'), ownerId: user.id, difficulty, timezone, pace, seed: randomBytes(4).readUInt32BE(0), now: now() });
      } catch (e) {
        throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
      }
      await store.put(`league:${id}`, league);
      await store.put(`code:${code}`, { leagueId: id });
      await addLeagueToUser(user, id);
      return send(res, 200, viewFor(league, user.id));
    }

    if (method === 'POST' && path === '/api/join') {
      const body = await readJson(req);
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ref = await store.get<{ leagueId: string }>(`code:${code}`);
      if (!ref) throw new HttpError(404, 'Código de liga não encontrado.');
      await addLeagueToUser(user, ref.leagueId);
      return send(res, 200, { leagueId: ref.leagueId });
    }

    const m = /^\/api\/leagues\/([\w-]+)(?:\/(\w+))?$/.exec(path);
    if (m) {
      const [, id, action] = m;
      if (!user.leagues.includes(id)) throw new HttpError(404, 'Liga não encontrada.');
      if (method === 'GET' && !action) {
        const l = await mutate(id, (x) => x);
        return send(res, 200, viewFor(l, user.id));
      }
      if (method !== 'POST') throw new HttpError(405, 'Método não suportado.');
      const body = await readJson(req);
      const t = now();
      const l = await mutate(id, (x) => {
        switch (action) {
          case 'team':
            return wrap(() => joinLeague(x, user.id, user.name, String(body.teamId)));
          case 'leave':
            return wrap(() => leaveLeague(x, user.id));
          case 'start':
            return wrap(() => startLeague(x, user.id, t));
          case 'force':
            return wrap(() => forceSession(x, user.id));
          case 'decision': {
            const session = body.session as SessionId;
            if (!SESSIONS.includes(session)) throw new HttpError(400, 'Sessão inválida.');
            return wrap(() => advance(submitDecision(x, user.id, session, body.payload, t), t));
          }
          case 'buy': {
            const kind = body.kind === 'engine' || body.kind === 'aero' || body.kind === 'dev' ? body.kind : null;
            if (!kind) throw new HttpError(400, 'Compra inválida.');
            return wrap(() => leagueBuy(x, user.id, kind, String(body.id)));
          }
          default:
            throw new HttpError(404, 'Ação desconhecida.');
        }
      });
      return send(res, 200, viewFor(l, user.id));
    }

    throw new HttpError(404, 'Rota não encontrada.');
  }

  async function serveStatic(res: ServerResponse, path: string) {
    if (!opts.staticDir) throw new HttpError(404, 'Não encontrado.');
    const root = resolve(opts.staticDir);
    let file = resolve(join(root, decodeURIComponent(path)));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Não encontrado.');
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(root, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  }

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não suportado.');
      return await serveStatic(res, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Erro interno.' });
    }
  };
}
