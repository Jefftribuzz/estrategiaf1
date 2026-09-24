import { DIFFICULTIES } from '../engine/ai';
import { TEAMS } from '../engine/data/teams';
import type { LeagueView } from '../engine/league';
import type { SessionId } from '../engine/types';
import { carSprite, helmetSprite } from './sprites';
import { esc } from './views';

// Cliente da API do multiplayer + telas de conta, lista de ligas e lobby.

const TOKEN_KEY = 'f1m8.token';

export interface MeResponse {
  user: { id: string; name: string; google?: boolean; devices?: number; push?: number };
  leagues: { id: string; name: string; code: string; status: string; round: number; members: number }[];
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sem armazenamento: o login vale só nesta aba */
  }
  memToken = t;
}

let memToken: string | null = null;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = memToken ?? getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Sem conexão com o servidor do jogo.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) setToken(null);
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

export interface ServerConfig {
  googleClientId: string | null;
  vapidPublicKey: string;
}

export interface RankingRow {
  name: string;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: number;
}

export function useToken(t: string) {
  setToken(t);
}

export const api = {
  async register(name: string) {
    const r = await call<{ token: string }>('/api/register', { name });
    setToken(r.token);
  },
  config: () => call<ServerConfig>('/api/config'),
  ranking: () => call<{ ranking: RankingRow[] }>('/api/ranking'),
  /** Login (ou vínculo, se já logado) com a credencial do Google. */
  async google(credential: string) {
    const r = await call<{ token?: string; linked?: boolean }>('/api/login/google', { credential });
    if (r.token) setToken(r.token);
    return r;
  },
  newDeviceToken: () => call<{ token: string }>('/api/token/new', {}),
  async rotate() {
    const r = await call<{ token: string }>('/api/token/rotate', {});
    setToken(r.token);
  },
  pushSubscribe: (subscription: unknown) => call<{ ok: boolean }>('/api/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint: string) => call<{ ok: boolean }>('/api/push/unsubscribe', { endpoint }),
  logout: () => setToken(null),
  me: () => call<MeResponse>('/api/me'),
  create: (name: string, difficulty: string, pace: string) =>
    call<LeagueView>('/api/leagues', { name, difficulty, pace, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  join: (code: string) => call<{ leagueId: string }>('/api/join', { code }),
  league: (id: string) => call<LeagueView>(`/api/leagues/${id}`),
  team: (id: string, teamId: string) => call<LeagueView>(`/api/leagues/${id}/team`, { teamId }),
  leave: (id: string) => call<LeagueView>(`/api/leagues/${id}/leave`, {}),
  start: (id: string) => call<LeagueView>(`/api/leagues/${id}/start`, {}),
  force: (id: string) => call<LeagueView>(`/api/leagues/${id}/force`, {}),
  decision: (id: string, session: SessionId, payload: unknown) => call<LeagueView>(`/api/leagues/${id}/decision`, { session, payload }),
  buy: (id: string, kind: 'engine' | 'aero' | 'dev', item: string) => call<LeagueView>(`/api/leagues/${id}/buy`, { kind, id: item }),
};

export function fmtDeadline(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const when = d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (mins <= 0) return `${when} (agora)`;
  const rel = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${Math.floor(mins / 1440)} dias`;
  return `${when} (em ${rel})`;
}

const STATUS: Record<string, string> = { lobby: 'Aguardando largada', running: 'Em andamento', finished: 'Encerrada' };

export function onlineView(me: MeResponse | null, loading: boolean, deviceLink: string | null = null): string {
  if (!getToken()) {
    return `<h1>Multiplayer online</h1>
      <div class="panel"><h2>Crie seu perfil</h2>
        <p>Escolha um apelido. Seu acesso fica salvo neste navegador.</p>
        <div class="row"><input id="nick" type="text" maxlength="20" placeholder="Seu apelido" style="font:inherit;padding:8px;background:#0f1020;color:#fff;border:3px solid #5a5f9a">
        <button class="btn" data-act="online-register">Entrar ▶</button></div>
        <div id="google-btn" style="margin-top:14px"></div></div>
      <div class="panel tight"><p class="muted" style="font-size:8px">Já tem perfil em outro aparelho? Lá, abra <b>Multiplayer → Conta → Levar perfil para outro aparelho</b> e abra o link aqui.</p></div>
      <button class="btn secondary" data-act="goto" data-arg="title">Voltar</button>`;
  }
  if (!me) return `<h1>Multiplayer online</h1><div class="panel">${loading ? 'Carregando...' : 'Não foi possível carregar.'}</div>
    <button class="btn secondary" data-act="goto" data-arg="title">Voltar</button>`;
  const leagues = me.leagues.length
    ? me.leagues
        .map((l) => `<div class="part"><span class="id">${esc(l.code)}</span>
          <span>${esc(l.name)}<div class="desc">${STATUS[l.status] ?? l.status} · ${l.members} humano(s)${l.status !== 'lobby' ? ` · GP ${Math.min(l.round + 1, 10)}/10` : ''}</div></span>
          <button class="btn small" data-act="open-league" data-arg="${esc(l.id)}">Abrir ▶</button></div>`)
        .join('')
    : '<p class="muted">Você ainda não está em nenhuma liga.</p>';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `<h1>Multiplayer online</h1>
    <p>Olá, <span class="yellow">${esc(me.user.name)}</span>! <button class="btn small secondary" data-act="goto" data-arg="ranking">🏆 Hall da fama</button></p>
    <div class="panel"><h2>Minhas ligas</h2><div class="parts">${leagues}</div></div>
    <div class="grid two">
      <div class="panel"><h2>Criar liga</h2>
        <label>Nome da liga</label><input id="league-name" type="text" maxlength="40" placeholder="Liga dos amigos" style="font:inherit;padding:8px;width:100%;background:#0f1020;color:#fff;border:3px solid #5a5f9a">
        <label style="margin-top:8px">Dificuldade dos bots</label>
        <select id="league-diff">${DIFFICULTIES.map((d) => `<option value="${d.id}"${d.id === 'normal' ? ' selected' : ''}>${d.label}</option>`).join('')}</select>
        <label style="margin-top:8px">Ritmo</label>
        <select id="league-pace"><option value="diario">Diário: 1 sessão por dia às 20h (${esc(tz)})</option><option value="rapido">Rápido: 1 sessão a cada 10 min (para testar)</option></select>
        <p class="muted" style="font-size:8px;margin-top:8px">As sessões seguem as 20h no seu fuso. Amigos em outros fusos veem o horário convertido para o deles.</p>
        <button class="btn" data-act="online-create">Criar liga ▶</button></div>
      <div class="panel"><h2>Entrar com código</h2>
        <input id="league-code" type="text" maxlength="8" placeholder="ABC123" style="font:inherit;padding:8px;text-transform:uppercase;background:#0f1020;color:#fff;border:3px solid #5a5f9a">
        <button class="btn" data-act="online-join">Entrar ▶</button></div>
    </div>
    ${accountPanel(me, deviceLink)}
    <button class="btn secondary" data-act="goto" data-arg="title">Voltar</button>`;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushState(): 'ligado' | 'bloqueado' | 'desligado' | 'indisponivel' {
  if (!pushSupported()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  return Notification.permission === 'granted' && localStorage.getItem('f1m8.push') === '1' ? 'ligado' : 'desligado';
}

function accountPanel(me: MeResponse, deviceLink: string | null): string {
  const st = pushState();
  const push =
    st === 'indisponivel'
      ? '<p class="muted" style="font-size:8px">Este navegador não aceita notificações. No iPhone, instale o jogo na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p>'
      : st === 'bloqueado'
        ? '<p class="red" style="font-size:8px">Notificações bloqueadas neste navegador. Libere nas configurações do site.</p>'
        : st === 'ligado'
          ? '<p class="green">🔔 Notificações ligadas neste aparelho.</p><button class="btn small secondary" data-act="push-off">Desligar notificações</button>'
          : '<button class="btn" data-act="push-on">🔔 Ligar notificações</button><p class="muted" style="font-size:8px">Avisos de sessão aberta, lembrete 1 hora antes do prazo e resultados.</p>';
  return `<div class="panel"><h2>Conta</h2>
    <div class="grid two">
      <div><h3>Notificações</h3>${push}</div>
      <div><h3>Seus aparelhos</h3>
        <p class="muted" style="font-size:8px">Conectado em ${me.user.devices ?? 1} aparelho(s)${me.user.google ? ' · Google vinculado ✓' : ''}.</p>
        ${deviceLink
          ? `<p style="font-size:8px;word-break:break-all" class="yellow">${esc(deviceLink)}</p>
             <button class="btn small secondary" data-act="copy-invite" data-arg="${esc(deviceLink)}">Copiar link</button>
             <p class="red" style="font-size:8px">Esse link dá acesso ao seu perfil: não compartilhe com ninguém.</p>`
          : '<button class="btn small secondary" data-act="device-link">📱 Levar perfil para outro aparelho</button>'}
        ${me.user.google ? '' : '<div id="google-link" style="margin-top:8px"></div>'}
        <div class="row" style="margin-top:8px">
          <button class="btn small secondary" data-act="rotate-token">Desconectar outros aparelhos</button>
          <button class="btn small danger" data-act="online-logout">Sair deste aparelho</button></div>
      </div>
    </div></div>`;
}

export function rankingView(rows: RankingRow[] | null): string {
  const body = !rows
    ? '<p>Carregando...</p>'
    : !rows.length
      ? '<p class="muted">Ninguém terminou uma temporada online ainda. Seja o primeiro campeão!</p>'
      : `<div class="table-wrap"><table><tr><th>#</th><th>Piloto</th><th class="num">Títulos</th><th class="num">Vitórias</th><th class="num">Pódios</th><th class="num">Pontos</th><th class="num">Temporadas</th></tr>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${i === 0 ? '👑 ' : ''}${esc(r.name)}</td><td class="num yellow">${r.titles}</td><td class="num">${r.wins}</td><td class="num">${r.podiums}</td><td class="num">${r.points}</td><td class="num">${r.seasons}</td></tr>`).join('')}
      </table></div>`;
  return `<h1>🏆 Hall da fama</h1><div class="panel">${body}
    <p class="muted" style="font-size:8px;margin-top:8px">Conta as temporadas terminadas nas ligas online. Ordem: títulos, vitórias, pódios, pontos.</p></div>
    <button class="btn secondary" data-act="goto" data-arg="online">Voltar</button>`;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Liga as notificações push neste aparelho. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador não aceita notificações.');
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('As notificações só funcionam na versão publicada do jogo (https).')), 5000)),
  ]);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
  const cfg = await api.config();
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey) }));
  } catch {
    throw new Error('Este navegador não deixou ligar as notificações (em janela anônima elas não funcionam).');
  }
  await api.pushSubscribe(sub.toJSON());
  localStorage.setItem('f1m8.push', '1');
}

export async function disablePush(): Promise<void> {
  localStorage.removeItem('f1m8.push');
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
}

// ------------------------------------------------------ login com Google --

interface GoogleIdApi {
  accounts: { id: { initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void; renderButton(el: HTMLElement, o: Record<string, string>): void } };
}

let gsi: Promise<GoogleIdApi> | null = null;
function loadGsi(): Promise<GoogleIdApi> {
  return (gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: GoogleIdApi }).google);
    s.onerror = () => {
      gsi = null;
      reject(new Error('Não foi possível carregar o login do Google.'));
    };
    document.head.appendChild(s);
  }));
}

/** Desenha o botão "Entrar com Google" no elemento, se o servidor tiver o login ativado. */
export async function mountGoogleButton(el: HTMLElement | null, clientId: string | null, onCredential: (c: string) => void) {
  if (!el || !clientId) return;
  const g = await loadGsi();
  g.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
  g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: el.id === 'google-link' ? 'continue_with' : 'signin_with', shape: 'rectangular' });
}

export function lobbyView(v: LeagueView): string {
  const byTeam = new Map(v.members.map((m) => [m.teamId, m]));
  const cards = TEAMS.map((t) => {
    const m = byTeam.get(t.id);
    const mine = t.id === v.myTeamId;
    return `<button class="card${mine ? ' selected' : ''}" data-act="league-team" data-arg="${t.id}"${m && !mine ? ' disabled' : ''}>
      <img class="px car" src="${carSprite(t)}" alt="${esc(t.car)}">
      <div><img class="px helmet" src="${helmetSprite(t)}" alt="">${esc(t.driver.name)}</div>
      <div class="yellow" style="margin-top:6px">${esc(t.car)}</div>
      <div class="${m ? 'green' : 'muted'}" style="margin-top:6px">${m ? `👤 ${esc(m.name)}${m.isOwner ? ' (dono)' : ''}` : '🤖 bot'}</div></button>`;
  }).join('');
  const link = `${location.origin}${location.pathname}?liga=${encodeURIComponent(v.code)}`;
  return `<h1>${esc(v.name)}</h1>
    <div class="panel row between">
      <div><div class="muted">Código de convite</div><div class="yellow" style="font-size:22px;letter-spacing:4px">${esc(v.code)}</div></div>
      <div style="max-width:100%"><div class="muted">Link para os amigos</div><div style="word-break:break-all;font-size:8px">${esc(link)}</div>
        <button class="btn small secondary" data-act="copy-invite" data-arg="${esc(link)}">Copiar link</button></div>
      <div><div class="muted">Ritmo</div><div>${v.pace === 'rapido' ? 'Rápido (10 min)' : `Diário, 20h (${esc(v.timezone)})`}</div></div>
    </div>
    <p>Escolha sua equipe. As que ninguém escolher serão pilotadas por bots.</p>
    <div class="grid cards">${cards}</div>
    <div class="row" style="margin-top:16px">
      <button class="btn secondary" data-act="goto" data-arg="online">Voltar</button>
      ${v.myTeamId ? '<button class="btn secondary" data-act="league-leave">Liberar minha equipe</button>' : ''}
      ${v.isOwner ? `<button class="btn big" data-act="league-start"${v.members.length ? '' : ' disabled'}>Dar a largada na temporada ▶</button>` : '<span class="muted">Aguardando o dono da liga dar a largada...</span>'}
    </div>`;
}

/** Painel do GP atual na liga: prazo, quem já está pronto e botão do dono. */
export function leagueSessionPanel(v: LeagueView, sessionLabel: string): string {
  if (!v.session) return '';
  const members = v.members
    .map((m) => {
      const t = TEAMS.find((x) => x.id === m.teamId)!;
      return `<span class="pill">${m.ready ? '✅' : '⏳'} ${esc(m.name)} <span class="muted">(${esc(t.driver.shortName)})</span></span>`;
    })
    .join('');
  return `<div class="panel tight">
    <div class="row between"><h3>Liga: ${esc(v.name)} · ${esc(sessionLabel)}</h3><span class="yellow">Prazo: ${esc(fmtDeadline(v.nextDeadline))}</span></div>
    <div style="margin:6px 0">${members}</div>
    <p class="muted" style="font-size:8px">A sessão roda no horário marcado, ou antes se todos estiverem prontos. Quem não enviar fica com a decisão do engenheiro.</p>
    ${v.isOwner ? '<button class="btn small secondary" data-act="league-force">⏩ Rodar sessão agora (dono)</button>' : ''}
  </div>`;
}
