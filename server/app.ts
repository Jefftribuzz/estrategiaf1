import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { getTeam } from '../src/engine/data/teams';
import { getTrack } from '../src/engine/data/tracks';
import {
  advance,
  createLeague,
  currentSession,
  currentSessionIndex,
  forceSession,
  joinLeague,
  leagueBuy,
  leaveLeague,
  nextDeadline,
  pendingHumans,
  startLeague,
  submitDecision,
  viewFor,
  type LeagueState,
  type Pace,
} from '../src/engine/league';
import { standings, type SeasonState } from '../src/engine/season';
import type { Difficulty, SessionId } from '../src/engine/types';
import { SESSION_LABEL } from '../src/engine/weekend';
import type { GoogleVerifier } from './google';
import { isSubscription, loadVapid, webPushSender, type PushPayload, type PushSender, type PushSubscriptionJSON, type Vapid } from './push';
import { RateLimiter } from './ratelimit';
import { KeyedMutex, type Store } from './store';

// API do multiplayer. Estado autoritativo no servidor: o cliente só envia
// decisões e recebe a visão dele da liga.

interface User {
  id: string;
  name: string;
  /** Hashes dos tokens de acesso válidos (um por aparelho). */
  tokenHashes: string[];
  /** Formato antigo (um só token). */
  tokenHash?: string;
  leagues: string[];
  createdAt: string;
  googleSub?: string;
  push?: PushSubscriptionJSON[];
}

export interface RankingEntry {
  name: string;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: number;
}

export interface AppOptions {
  store: Store;
  now?: () => Date;
  /** Pasta com o jogo compilado (dist/) para servir junto com a API. */
  staticDir?: string;
  /** Login com Google: Client ID do Google Cloud (opcional). */
  googleClientId?: string;
  googleVerify?: GoogleVerifier;
  /** Envio de notificações (padrão: Web Push com VAPID). */
  pushSend?: PushSender;
  /** Atrás de proxy (Render, Fly...): usa X-Forwarded-For para o IP. */
  trustProxy?: boolean;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_BODY = 64 * 1024;
const MAX_TOKENS = 10;
const MAX_PUSH = 5;
const REMIND_BEFORE_MS = 60 * 60_000;
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
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com",
    "connect-src 'self' https://accounts.google.com",
    'frame-src https://accounts.google.com',
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
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

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function tokenOk(user: User, secret: string): boolean {
  const a = Buffer.from(sha256(secret));
  const hashes = user.tokenHashes ?? (user.tokenHash ? [user.tokenHash] : []);
  let ok = false;
  for (const h of hashes) {
    const b = Buffer.from(h);
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}

/** Data/hora de um instante no fuso da liga, em português. */
function fmtIn(date: Date, tz: string): string {
  return date.toLocaleString('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Note = { userIds: string[]; payload: PushPayload };

export function createApp(opts: AppOptions) {
  const { store } = opts;
  const now = opts.now ?? (() => new Date());
  const locks = new KeyedMutex();
  const limiter = new RateLimiter(() => now().getTime());
  let vapid: Promise<Vapid> | null = null;
  const getVapid = () => (vapid ??= loadVapid(store));
  let sender: PushSender | null = opts.pushSend ?? null;

  function ipOf(req: IncomingMessage): string {
    if (opts.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? '?';
  }

  function limit(key: string, max: number, windowMs: number) {
    if (!limiter.take(key, max, windowMs)) throw new HttpError(429, 'Muitas requisições. Espere um pouco e tente de novo.');
  }

  async function auth(req: IncomingMessage): Promise<User> {
    const h = req.headers.authorization ?? '';
    const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(h);
    if (!m) throw new HttpError(401, 'Faça login.');
    const user = await store.get<User>(`user:${m[1]}`);
    if (!user || !tokenOk(user, m[2])) throw new HttpError(401, 'Sessão inválida.');
    return { ...user, tokenHashes: user.tokenHashes ?? (user.tokenHash ? [user.tokenHash] : []) };
  }

  async function optionalAuth(req: IncomingMessage): Promise<User | null> {
    if (!req.headers.authorization) return null;
    try {
      return await auth(req);
    } catch {
      return null;
    }
  }

  function updateUser(id: string, fn: (u: User) => User): Promise<User> {
    return locks.run(`user:${id}`, async () => {
      const u = await store.get<User>(`user:${id}`);
      if (!u) throw new HttpError(404, 'Usuário não encontrado.');
      const next = fn({ ...u, tokenHashes: u.tokenHashes ?? (u.tokenHash ? [u.tokenHash] : []), tokenHash: undefined });
      await store.put(`user:${id}`, next);
      return next;
    });
  }

  /** Emite um token novo para o usuário (um por aparelho, até MAX_TOKENS). */
  async function issueToken(userId: string, replaceAll = false): Promise<string> {
    const secret = randomBytes(24).toString('base64url');
    await updateUser(userId, (u) => ({ ...u, tokenHashes: replaceAll ? [sha256(secret)] : [...u.tokenHashes, sha256(secret)].slice(-MAX_TOKENS) }));
    return `${userId}.${secret}`;
  }

  async function loadLeague(id: string): Promise<LeagueState> {
    const l = await store.get<LeagueState>(`league:${id}`);
    if (!l) throw new HttpError(404, 'Liga não encontrada.');
    return l;
  }

  // ------------------------------------------------------- notificações ---

  async function notify(notes: Note[]) {
    if (!notes.length) return;
    if (!sender) sender = webPushSender(await getVapid());
    for (const n of notes) {
      for (const userId of n.userIds) {
        const u = await store.get<User>(`user:${userId}`);
        const dead: string[] = [];
        for (const sub of u?.push ?? []) {
          try {
            await sender(sub, n.payload);
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(sub.endpoint);
          }
        }
        if (dead.length) await updateUser(userId, (x) => ({ ...x, push: (x.push ?? []).filter((s) => !dead.includes(s.endpoint)) }));
      }
    }
  }

  /** O que mudou na liga e merece notificação. */
  function diffNotes(before: LeagueState, after: LeagueState): Note[] {
    const users = Object.values(after.humans).map((h) => h.userId);
    const url = `/jogar/?abrir=${after.id}`;
    const tag = `liga-${after.id}`;
    const deadline = nextDeadline(after);
    const session = currentSession(after);
    const openMsg = session && deadline ? `${SESSION_LABEL[session]} do GP de ${getTrack(after.calendar[after.round]).name} aberta. Prazo: ${fmtIn(deadline, after.timezone)}.` : '';
    if (before.status === 'lobby' && after.status === 'running') {
      return [{ userIds: users, payload: { title: `🏁 ${after.name}: a temporada começou!`, body: openMsg, url, tag } }];
    }
    if (after.results.length > before.results.length) {
      const r = after.results[after.results.length - 1];
      const winner = getTeam(r.order[0].teamId).driver.name;
      const table = standings({ results: after.results, points: after.points } as SeasonState);
      return Object.entries(after.humans).map(([teamId, h]) => {
        const me = r.order.find((o) => o.teamId === teamId)!;
        const pos = me.status === 'dnf' ? 'abandonou' : `chegou em P${me.position}`;
        const champ = table.find((x) => x.teamId === teamId)!;
        const body =
          after.status === 'finished'
            ? `${winner} venceu a última prova. Campeão: ${getTeam(table[0].teamId).driver.name}. Você terminou em P${champ.position}.`
            : `${winner} venceu. Você ${pos}. ${openMsg}`;
        return {
          userIds: [h.userId],
          payload: { title: after.status === 'finished' ? `🏆 ${after.name}: fim de temporada!` : `🏁 Resultado: GP de ${getTrack(r.trackId).name}`, body, url, tag },
        };
      });
    }
    if (currentSessionIndex(after) > currentSessionIndex(before) && openMsg) {
      return [{ userIds: users, payload: { title: `⏱ ${after.name}`, body: openMsg, url, tag } }];
    }
    return [];
  }

  async function recordRanking(l: LeagueState) {
    await locks.run('ranking', async () => {
      const doc = (await store.get<{ entries: Record<string, RankingEntry> }>('ranking')) ?? { entries: {} };
      const table = standings({ results: l.results, points: l.points } as SeasonState);
      for (const [teamId, h] of Object.entries(l.humans)) {
        const row = table.find((r) => r.teamId === teamId)!;
        const e = doc.entries[h.userId] ?? { name: h.name, titles: 0, wins: 0, podiums: 0, points: 0, seasons: 0 };
        doc.entries[h.userId] = {
          name: h.name,
          titles: e.titles + (row.position === 1 ? 1 : 0),
          wins: e.wins + row.wins,
          podiums: e.podiums + row.podiums,
          points: e.points + row.points,
          seasons: e.seasons + 1,
        };
      }
      await store.put('ranking', doc);
    });
  }

  /** Carrega, avança sessões vencidas, aplica a mudança, grava e notifica. */
  async function mutate(id: string, fn: (l: LeagueState) => LeagueState, extra: (l: LeagueState) => Note[] = () => []): Promise<LeagueState> {
    let notes: Note[] = [];
    let finished = false;
    const result = await locks.run(`league:${id}`, async () => {
      const before = await loadLeague(id);
      let l = advance(before, now());
      l = fn(l);
      const more = extra(l);
      if (more.length) l = { ...l, remindedIndex: currentSessionIndex(l) };
      if (l !== before) await store.put(`league:${id}`, l);
      notes = [...diffNotes(before, l), ...more];
      finished = before.status !== 'finished' && l.status === 'finished';
      return l;
    });
    if (finished) await recordRanking(result);
    await notify(notes).catch((e) => console.error('push', e));
    return result;
  }

  /** Lembrete 1h antes do prazo para quem ainda não decidiu. */
  function reminders(l: LeagueState): Note[] {
    const deadline = nextDeadline(l);
    const session = currentSession(l);
    if (!deadline || !session) return [];
    const idx = currentSessionIndex(l);
    if ((l.remindedIndex ?? -1) >= idx) return [];
    const left = deadline.getTime() - now().getTime();
    if (left > REMIND_BEFORE_MS || left <= 0) return [];
    const users = pendingHumans(l).map((teamId) => l.humans[teamId].userId);
    if (!users.length) return [];
    return [{
      userIds: users,
      payload: {
        title: `⏰ ${l.name}: falta 1 hora!`,
        body: `Envie sua decisão para ${SESSION_LABEL[session]} do GP de ${getTrack(l.calendar[l.round]).name} até ${fmtIn(deadline, l.timezone)}. Senão, o engenheiro decide.`,
        url: `/jogar/?abrir=${l.id}`,
        tag: `liga-${l.id}`,
      },
    }];
  }

  /** Relógio do servidor: roda sessões vencidas e manda lembretes (chamar a cada minuto). */
  async function tick() {
    const index = (await store.get<{ ids: string[] }>('index:leagues')) ?? { ids: [] };
    for (const id of index.ids) {
      const l = await store.get<LeagueState>(`league:${id}`);
      if (!l || l.status !== 'running') continue;
      await mutate(id, (x) => x, reminders).catch((e) => console.error('tick', id, e));
    }
  }

  // ------------------------------------------------------------ rotas -----

  function wrap(fn: () => LeagueState): LeagueState {
    try {
      return fn();
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
  }

  async function addLeagueToUser(user: User, leagueId: string) {
    await updateUser(user.id, (u) => (u.leagues.includes(leagueId) ? u : { ...u, leagues: [...u.leagues, leagueId] }));
  }

  async function newCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const bytes = randomBytes(6);
      const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      if (!(await store.get(`code:${code}`))) return code;
    }
    throw new HttpError(500, 'Não foi possível gerar o código.');
  }

  async function createUser(name: string, googleSub?: string): Promise<{ token: string; user: User }> {
    const id = randomUUID();
    const secret = randomBytes(24).toString('base64url');
    const user: User = { id, name, tokenHashes: [sha256(secret)], leagues: [], createdAt: now().toISOString(), googleSub };
    await store.put(`user:${id}`, user);
    if (googleSub) await store.put(`google:${googleSub}`, { userId: id });
    return { token: `${id}.${secret}`, user };
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';
    const ip = ipOf(req);
    limit(`api:${ip}`, 600, 10 * 60_000);

    if (method === 'GET' && path === '/api/config') {
      return send(res, 200, { googleClientId: opts.googleClientId ?? null, vapidPublicKey: (await getVapid()).publicKey });
    }

    if (method === 'GET' && path === '/api/ranking') {
      const doc = (await store.get<{ entries: Record<string, RankingEntry> }>('ranking')) ?? { entries: {} };
      const list = Object.values(doc.entries)
        .sort((a, b) => b.titles - a.titles || b.wins - a.wins || b.podiums - a.podiums || b.points - a.points)
        .slice(0, 50);
      return send(res, 200, { ranking: list });
    }

    if (method === 'POST' && path === '/api/register') {
      limit(`register:${ip}`, 5, 60 * 60_000);
      const body = await readJson(req);
      const { token, user } = await createUser(cleanName(body.name, 20, 'seu nome'));
      return send(res, 200, { token, user: { id: user.id, name: user.name } });
    }

    if (method === 'POST' && path === '/api/login/google') {
      limit(`google:${ip}`, 20, 60 * 60_000);
      if (!opts.googleVerify) throw new HttpError(404, 'Login com Google não está ativado neste servidor.');
      const body = await readJson(req);
      let identity;
      try {
        identity = await opts.googleVerify(String(body.credential ?? ''));
      } catch (e) {
        throw new HttpError(401, (e as Error).message);
      }
      const linked = await store.get<{ userId: string }>(`google:${identity.sub}`);
      const current = await optionalAuth(req);
      if (current) {
        // Já logado por apelido: vincula a conta Google a este perfil.
        if (linked && linked.userId !== current.id) throw new HttpError(409, 'Essa conta Google já está vinculada a outro perfil.');
        if (!linked) {
          await store.put(`google:${identity.sub}`, { userId: current.id });
          await updateUser(current.id, (u) => ({ ...u, googleSub: identity.sub }));
        }
        return send(res, 200, { linked: true, user: { id: current.id, name: current.name } });
      }
      if (linked) {
        const token = await issueToken(linked.userId);
        const u = (await store.get<User>(`user:${linked.userId}`))!;
        return send(res, 200, { token, user: { id: u.id, name: u.name } });
      }
      const name = cleanName(body.name ?? identity.name ?? 'Piloto', 20, 'seu nome');
      const { token, user } = await createUser(name, identity.sub);
      return send(res, 200, { token, user: { id: user.id, name: user.name } });
    }

    const user = await auth(req);

    if (method === 'GET' && path === '/api/me') {
      const leagues = [];
      for (const id of user.leagues) {
        const l = await store.get<LeagueState>(`league:${id}`);
        if (l) leagues.push({ id: l.id, name: l.name, code: l.code, status: l.status, round: l.round, members: Object.keys(l.humans).length });
      }
      return send(res, 200, { user: { id: user.id, name: user.name, google: !!user.googleSub, devices: user.tokenHashes.length, push: (user.push ?? []).length }, leagues });
    }

    if (method === 'POST' && path === '/api/token/new') {
      // Link para levar o perfil a outro aparelho (token extra).
      return send(res, 200, { token: await issueToken(user.id) });
    }

    if (method === 'POST' && path === '/api/token/rotate') {
      // Desconecta todos os outros aparelhos.
      return send(res, 200, { token: await issueToken(user.id, true) });
    }

    if (method === 'POST' && path === '/api/push/subscribe') {
      const body = await readJson(req);
      if (!isSubscription(body.subscription)) throw new HttpError(400, 'Inscrição de notificação inválida.');
      const sub = body.subscription;
      const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      await updateUser(user.id, (u) => ({ ...u, push: [...(u.push ?? []).filter((s) => s.endpoint !== clean.endpoint), clean].slice(-MAX_PUSH) }));
      await notify([{ userIds: [user.id], payload: { title: '🔔 Notificações ligadas!', body: 'Você vai receber avisos de sessões, prazos e resultados.', tag: 'teste' } }]).catch(() => undefined);
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && path === '/api/push/unsubscribe') {
      const body = await readJson(req);
      const endpoint = String(body.endpoint ?? '');
      await updateUser(user.id, (u) => ({ ...u, push: (u.push ?? []).filter((s) => s.endpoint !== endpoint) }));
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && path === '/api/leagues') {
      limit(`create:${user.id}`, 10, 60 * 60_000);
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
      await locks.run('index:leagues', async () => {
        const idx = (await store.get<{ ids: string[] }>('index:leagues')) ?? { ids: [] };
        await store.put('index:leagues', { ids: [...idx.ids, id] });
      });
      await addLeagueToUser(user, id);
      return send(res, 200, viewFor(league, user.id));
    }

    if (method === 'POST' && path === '/api/join') {
      limit(`join:${ip}`, 30, 60 * 60_000);
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

  /** Caminho do jogo dentro do domínio (a raiz é a landing page). */
  const GAME = '/jogar/';

  function redirect(res: ServerResponse, location: string, status = 301) {
    res.writeHead(status, { ...SECURITY_HEADERS, location, 'cache-control': 'no-cache' });
    res.end();
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (!opts.staticDir) throw new HttpError(404, 'Não encontrado.');
    const path = url.pathname;
    // O jogo usa caminhos relativos: /jogar precisa da barra no fim.
    if (path === GAME.slice(0, -1)) return redirect(res, GAME + url.search);
    // Links de convite, perfil e notificação feitos na raiz vão para o jogo.
    if (path === '/' && /[?&](liga|perfil|abrir|tela)=/.test(url.search)) return redirect(res, GAME + url.search, 302);

    const root = resolve(opts.staticDir);
    let rel: string;
    try {
      rel = decodeURIComponent(path);
    } catch {
      throw new HttpError(400, 'Endereço inválido.');
    }
    let file = resolve(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Não encontrado.');
    let status = 200;
    try {
      if ((await stat(file)).isDirectory()) {
        // Um endereço só por página (bom para o Google): /pistas/x → /pistas/x/
        if (!path.endsWith('/')) return redirect(res, path + '/' + url.search);
        file = join(file, 'index.html');
      }
      await stat(file);
    } catch {
      // Página que não existe: dentro do jogo, abre o jogo; fora, a página 404 da landing.
      if (path.startsWith(GAME)) file = join(root, 'jogar', 'index.html');
      else {
        status = 404;
        file = join(root, '404.html');
      }
    }
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      throw new HttpError(404, 'Não encontrado.');
    }
    const https = opts.trustProxy && req.headers['x-forwarded-proto'] === 'https';
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      ...(https ? { 'strict-transport-security': 'max-age=31536000' } : {}),
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  const handler = async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não suportado.');
      return await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message }, e.status === 429 ? { 'retry-after': '60' } : {});
      console.error(e);
      return send(res, 500, { error: 'Erro interno.' });
    }
  };
  return Object.assign(handler, { tick });
}
