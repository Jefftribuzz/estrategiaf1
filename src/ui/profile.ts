import { getTeam, TEAMS } from '../engine/data/teams';
import { getTrack } from '../engine/data/tracks';
import { helmetFromDesign } from './sprites';
import { esc } from './views';

// Telas de conta: entrar/criar conta e o perfil (dados, avatar, preferências,
// histórico e segurança).

export interface Avatar {
  base: string;
  stripe1: string;
  stripe2: string;
}

export interface Prefs {
  sound: boolean;
  crt: boolean;
  notify: { session: boolean; reminder: boolean; results: boolean };
}

export interface Profile {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  hasPassword: boolean;
  google: boolean;
  avatar: Avatar | null;
  prefs: Prefs;
  devices: number;
  push: number;
  createdAt: string;
}

export interface LeagueHistory {
  id: string;
  name: string;
  status: string;
  teamId: string;
  createdAt: string;
  position: number | null;
  points: number;
  wins: number;
  podiums: number;
  champion: boolean;
  races: { trackId: string; position: number; status: string; points: number; winner: string }[];
}

export interface SoloEntry {
  mode: 'rapida' | 'temporada';
  date: string;
  teamId: string;
  difficulty: string;
  trackId?: string;
  position?: number;
  points?: number;
  championship?: number;
  wins?: number;
  podiums?: number;
}

export interface History {
  leagues: LeagueHistory[];
  solo: SoloEntry[];
}

export type ProfileTab = 'dados' | 'avatar' | 'preferencias' | 'historico' | 'seguranca';
export type LoginTab = 'entrar' | 'criar';

/** Paleta de 16 cores no estilo dos consoles 8 bits. */
export const PALETTE = [
  '#ffd700', '#ffffff', '#111111', '#e43b44', '#d40000', '#f18f3b', '#ffb000', '#3fbf6f',
  '#009b3a', '#00d2be', '#3b8bea', '#1b3a8c', '#1e1b4b', '#7b2fbe', '#d67bff', '#8a8a8a',
];

export const DEFAULT_AVATAR: Avatar = { base: '#ffd700', stripe1: '#009b3a', stripe2: '#1b3a8c' };

export function avatarImg(a: Avatar | null | undefined, size = 32): string {
  const av = a ?? DEFAULT_AVATAR;
  return `<img class="px" src="${helmetFromDesign({ ...av, visor: '#222222' })}" width="${size}" height="${size}" alt="Avatar">`;
}

/** O que a pessoa digitou (menos senhas), para não perder se der erro. */
const drafts: Record<string, string> = {};

export function keepDrafts(values: Record<string, string>) {
  Object.assign(drafts, values);
}

export function clearDrafts() {
  for (const k of Object.keys(drafts)) delete drafts[k];
}

const input = (id: string, label: string, value = '', type = 'text', extra = '') =>
  `<label for="${id}">${esc(label)}</label><input class="field" id="${id}" type="${type}" value="${esc(type === 'password' ? '' : (drafts[id] ?? value))}" ${extra}>`;

export function loginView(tab: LoginTab, googleEnabled: boolean): string {
  const tabs = `<div class="tabs">
    <button class="tab${tab === 'entrar' ? ' active' : ''}" data-act="login-tab" data-arg="entrar">Entrar</button>
    <button class="tab${tab === 'criar' ? ' active' : ''}" data-act="login-tab" data-arg="criar">Criar conta</button></div>`;
  const form =
    tab === 'entrar'
      ? `<form class="form" data-form="login">
          ${input('login-email', 'E-mail', '', 'email', 'autocomplete="email" required')}
          ${input('login-password', 'Senha', '', 'password', 'autocomplete="current-password" required')}
          <button class="btn" type="submit">Entrar ▶</button>
        </form>
        <p class="muted" style="font-size:8px">Esqueceu a senha? Entre com o Google (se vinculado) ou use o link de acesso de outro aparelho em que você já está conectado (Perfil → Segurança).</p>`
      : `<form class="form" data-form="signup">
          <div class="grid two">
            <div>${input('su-first', 'Nome', '', 'text', 'autocomplete="given-name" maxlength="30" required')}</div>
            <div>${input('su-last', 'Sobrenome', '', 'text', 'autocomplete="family-name" maxlength="40" required')}</div>
          </div>
          ${input('su-nick', 'Apelido (aparece nas ligas)', '', 'text', 'maxlength="20" required')}
          ${input('su-email', 'E-mail', '', 'email', 'autocomplete="email" required')}
          ${input('su-password', 'Senha (8+ caracteres, letras e números)', '', 'password', 'autocomplete="new-password" minlength="8" required')}
          ${input('su-password2', 'Confirme a senha', '', 'password', 'autocomplete="new-password" minlength="8" required')}
          <button class="btn" type="submit">Criar conta ▶</button>
        </form>`;
  return `<h1>Sua conta</h1>
    <div class="panel narrow">${tabs}${form}
      ${googleEnabled ? '<div class="or">ou</div><div id="google-btn"></div>' : ''}
    </div>
    <div class="panel tight narrow"><p class="muted" style="font-size:8px">Com conta você joga as ligas online de qualquer aparelho, guarda o histórico de corridas e campeonatos e escolhe seu avatar.</p></div>
    <button class="btn secondary" data-act="goto" data-arg="title">Voltar</button>`;
}

export function profileView(p: Profile, tab: ProfileTab, history: History | null, avatarDraft: Avatar, deviceLink: string | null = null): string {
  const tabs: [ProfileTab, string][] = [
    ['dados', '👤 Dados'], ['avatar', '⛑️ Avatar'], ['preferencias', '⚙️ Preferências'], ['historico', '🏆 Histórico'], ['seguranca', '🔒 Segurança'],
  ];
  const header = `<div class="panel row">
    ${avatarImg(p.avatar, 64)}
    <div><div class="yellow" style="font-size:14px">${esc(p.name)}</div>
    <div class="muted">${esc([p.firstName, p.lastName].filter(Boolean).join(' ') || 'Complete seu perfil')}${p.email ? ` · ${esc(p.email)}` : ''}</div></div>
  </div>`;
  const body =
    tab === 'dados' ? dataTab(p) :
    tab === 'avatar' ? avatarTab(avatarDraft) :
    tab === 'preferencias' ? prefsTab(p) :
    tab === 'historico' ? historyTab(history) : securityTab(p, deviceLink);
  return `<h1>Meu perfil</h1>${header}
    <div class="tabs">${tabs.map(([id, l]) => `<button class="tab${tab === id ? ' active' : ''}" data-act="profile-tab" data-arg="${id}">${l}</button>`).join('')}</div>
    ${body}
    <div class="row" style="margin-top:12px"><button class="btn secondary" data-act="goto" data-arg="title">Voltar</button></div>`;
}

function dataTab(p: Profile): string {
  const creds = p.hasPassword
    ? `<p class="muted" style="font-size:8px">E-mail de acesso: <b>${esc(p.email ?? '')}</b>. Para trocar a senha, veja a aba Segurança.</p>`
    : `<div class="panel tight"><h3>Proteja seu perfil</h3>
        <p style="font-size:8px">Seu perfil ainda não tem e-mail e senha. Sem eles, você perde o acesso se limpar o navegador.</p>
        <form class="form" data-form="add-credentials">
          ${input('ac-email', 'E-mail', '', 'email', 'autocomplete="email" required')}
          ${input('ac-password', 'Senha (8+ caracteres, letras e números)', '', 'password', 'autocomplete="new-password" required')}
          <button class="btn" type="submit">Adicionar e-mail e senha</button>
        </form></div>`;
  return `<div class="panel">
    <form class="form" data-form="profile">
      <div class="grid two">
        <div>${input('pf-first', 'Nome', p.firstName, 'text', 'maxlength="30" autocomplete="given-name"')}</div>
        <div>${input('pf-last', 'Sobrenome', p.lastName, 'text', 'maxlength="40" autocomplete="family-name"')}</div>
      </div>
      ${input('pf-nick', 'Apelido (aparece nas ligas e no Hall da fama)', p.name, 'text', 'maxlength="20" required')}
      <button class="btn" type="submit">Salvar</button>
    </form>
    ${creds}
  </div>`;
}

function swatches(part: keyof Avatar, current: string): string {
  return `<div class="swatches">${PALETTE.map(
    (c) => `<button type="button" class="swatch${c === current ? ' on' : ''}" style="background:${c}" data-act="avatar-color" data-part="${part}" data-arg="${c}" aria-label="Cor ${c}"></button>`,
  ).join('')}</div>`;
}

function avatarTab(a: Avatar): string {
  const presets = TEAMS.map(
    (t) => `<button type="button" class="preset" data-act="avatar-preset" data-arg="${t.id}" title="${esc(t.driver.name)}">${avatarImg(t.driver.helmet, 32)}</button>`,
  ).join('');
  return `<div class="grid two">
    <div class="panel" style="text-align:center">${avatarImg(a, 128)}
      <p class="muted" style="font-size:8px">Prévia do seu capacete</p>
      <button class="btn" data-act="avatar-save">Salvar avatar</button></div>
    <div class="panel">
      <h3>Capacetes das lendas</h3><div class="presets">${presets}</div>
      <h3 style="margin-top:12px">Casco</h3>${swatches('base', a.base)}
      <h3>Listra de cima</h3>${swatches('stripe1', a.stripe1)}
      <h3>Listra de baixo</h3>${swatches('stripe2', a.stripe2)}
    </div>
  </div>`;
}

const check = (id: string, label: string, on: boolean, hint = '') =>
  `<label class="check"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> <span>${esc(label)}${hint ? `<br><span class="muted" style="font-size:8px">${esc(hint)}</span>` : ''}</span></label>`;

function prefsTab(p: Profile): string {
  return `<div class="panel">
    <form class="form" data-form="prefs">
      <h3>Jogo</h3>
      ${check('pr-sound', 'Som e música', p.prefs.sound)}
      ${check('pr-crt', 'Efeito de TV antiga (CRT)', p.prefs.crt)}
      <h3 style="margin-top:14px">Notificações das ligas online</h3>
      ${check('pr-n-session', 'Sessão aberta', p.prefs.notify.session, 'Quando começa o teste, a classificação ou a corrida.')}
      ${check('pr-n-reminder', 'Lembrete de prazo', p.prefs.notify.reminder, '1 hora antes do fim do prazo, se você ainda não decidiu.')}
      ${check('pr-n-results', 'Resultados', p.prefs.notify.results, 'Resultado de cada GP e o campeão da temporada.')}
      <p class="muted" style="font-size:8px">Para receber no celular, ligue as notificações em Multiplayer → Conta (em cada aparelho). Aparelhos com notificações ligadas: ${p.push}.</p>
      <button class="btn" type="submit">Salvar preferências</button>
    </form>
  </div>`;
}

function historyTab(h: History | null): string {
  if (!h) return '<div class="panel">Carregando histórico...</div>';
  const races = h.leagues.reduce((n, l) => n + l.races.length, 0) + h.solo.filter((s) => s.mode === 'rapida').length;
  const wins = h.leagues.reduce((n, l) => n + l.wins, 0) + h.solo.filter((s) => s.mode === 'rapida' && s.position === 1).length;
  const titles = h.leagues.filter((l) => l.champion).length + h.solo.filter((s) => s.mode === 'temporada' && s.championship === 1).length;
  const podiums = h.leagues.reduce((n, l) => n + l.podiums, 0) + h.solo.filter((s) => s.mode === 'rapida' && (s.position ?? 99) <= 3).length;
  const stats = `<div class="grid three stats-grid">
    <div class="panel tight stat-box"><div class="big yellow">${titles}</div>títulos</div>
    <div class="panel tight stat-box"><div class="big yellow">${wins}</div>vitórias</div>
    <div class="panel tight stat-box"><div class="big yellow">${podiums}</div>pódios</div>
    <div class="panel tight stat-box"><div class="big yellow">${races}</div>corridas</div>
    <div class="panel tight stat-box"><div class="big yellow">${h.leagues.length}</div>ligas online</div>
    <div class="panel tight stat-box"><div class="big yellow">${h.solo.filter((s) => s.mode === 'temporada').length}</div>temporadas solo</div>
  </div>`;
  const leagues = h.leagues.length
    ? h.leagues
        .map((l) => {
          const t = getTeam(l.teamId);
          const status = l.status === 'finished' ? (l.champion ? '🏆 CAMPEÃO' : `Final: P${l.position}`) : l.status === 'lobby' ? 'Aguardando largada' : `Em andamento: P${l.position ?? '-'}`;
          const chips = l.races
            .map((r) => `<span class="chip ${r.status === 'dnf' ? 'dnf' : r.position === 1 ? 'win' : r.position <= 3 ? 'pod' : ''}" title="GP de ${esc(getTrack(r.trackId).name)}">${esc(getTrack(r.trackId).flag)} ${r.status === 'dnf' ? 'AB' : `P${r.position}`}</span>`)
            .join('');
          return `<div class="panel tight">
            <div class="row between"><div><span class="yellow">${esc(l.name)}</span> <span class="muted">· ${esc(t.driver.shortName)} (${esc(t.car)})</span></div><span>${status}</span></div>
            <div class="muted" style="font-size:8px">${l.points} pts · ${l.wins} vitórias · ${l.podiums} pódios</div>
            <div class="chips">${chips || '<span class="muted" style="font-size:8px">Nenhuma corrida ainda.</span>'}</div>
            <button class="btn small secondary" data-act="open-league" data-arg="${esc(l.id)}">Abrir liga</button>
          </div>`;
        })
        .join('')
    : '<p class="muted">Você ainda não participou de ligas online.</p>';
  const solo = h.solo.length
    ? `<div class="table-wrap"><table><tr><th>Data</th><th>Modo</th><th>Equipe</th><th>GP</th><th class="num">Resultado</th><th class="num">Pts</th></tr>
      ${h.solo
        .slice(0, 50)
        .map((s) => {
          const t = getTeam(s.teamId);
          const res = s.mode === 'temporada' ? (s.championship === 1 ? '🏆 Campeão' : `P${s.championship ?? '-'} no campeonato`) : s.position ? `P${s.position}` : 'Abandono';
          return `<tr><td>${new Date(s.date).toLocaleDateString('pt-BR')}</td><td>${s.mode === 'rapida' ? 'Corrida rápida' : 'Temporada'}</td>
            <td>${esc(t.driver.shortName)}</td><td>${s.trackId ? esc(getTrack(s.trackId).name) : '10 GPs'}</td><td class="num">${res}</td><td class="num">${s.points ?? ''}</td></tr>`;
        })
        .join('')}</table></div>`
    : '<p class="muted">Suas corridas rápidas e temporadas solo aparecem aqui quando você joga logado.</p>';
  return `${stats}<h2>Ligas online</h2>${leagues}<h2>Modo solo</h2><div class="panel">${solo}</div>`;
}

function securityTab(p: Profile, deviceLink: string | null): string {
  const pw = p.hasPassword
    ? `<div class="panel"><h3>Trocar senha</h3>
        <form class="form" data-form="password">
          ${input('pw-current', 'Senha atual', '', 'password', 'autocomplete="current-password" required')}
          ${input('pw-next', 'Nova senha (8+ caracteres, letras e números)', '', 'password', 'autocomplete="new-password" required')}
          <button class="btn" type="submit">Trocar senha</button>
          <p class="muted" style="font-size:8px">Ao trocar a senha, os outros aparelhos são desconectados.</p>
        </form></div>`
    : '<div class="panel"><p>Adicione e-mail e senha na aba Dados para proteger o perfil.</p></div>';
  return `${pw}
    <div class="panel"><h3>Aparelhos</h3>
      <p style="font-size:8px">Conectado em ${p.devices} aparelho(s)${p.google ? ' · Google vinculado ✓' : ''}.</p>
      ${deviceLink ? `<p style="font-size:8px;word-break:break-all" class="yellow">${esc(deviceLink)}</p>
        <button class="btn small secondary" data-act="copy-invite" data-arg="${esc(deviceLink)}">Copiar link</button>
        <p class="red" style="font-size:8px">Esse link dá acesso ao seu perfil: não compartilhe com ninguém.</p>` : ''}
      <div class="row">
        <button class="btn small secondary" data-act="device-link">📱 Link de acesso para outro aparelho</button>
        <button class="btn small secondary" data-act="rotate-token">Desconectar outros aparelhos</button>
        <button class="btn small danger" data-act="account-logout">Sair deste aparelho</button>
      </div></div>`;
}
