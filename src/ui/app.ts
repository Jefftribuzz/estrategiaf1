import { DIFFICULTIES } from '../engine/ai';
import { getAero, getEngine, getTyre, TYRE_PARTS } from '../engine/data/parts';
import { getTeam, TEAMS } from '../engine/data/teams';
import { getTrack, TRACKS } from '../engine/data/tracks';
import { formatLap, type PracticeRun } from '../engine/session';
import { strategyCost } from '../engine/strategy';
import type { CarSetup, Difficulty, DriveMode, RaceStrategy, SessionId } from '../engine/types';
import { describeWeather } from '../engine/weather';
import {
  createWeekend,
  forecasts,
  MAX_PRACTICE_RUNS,
  runPractice,
  runQualifying,
  runRace,
  SESSION_LABEL,
  setupCost,
  validateStrategy,
  type WeekendState,
} from '../engine/weekend';
import { chip } from './audio';
import { Replay } from './replay';
import { carSprite, drawTrack, helmetSprite } from './sprites';
import { bar, esc, forecastCard, partPicker, tyreBadge } from './views';

type Screen = 'title' | 'help' | 'team' | 'track' | 'hub' | 'practice' | 'quali' | 'race' | 'replay' | 'results';
type PartKind = 'aero' | 'engine' | 'tyre';

interface UiState {
  screen: Screen;
  teamId: string;
  trackId: string;
  difficulty: Difficulty['id'];
  weekend: WeekendState | null;
  drafts: CarSetup[];
  active: number;
  kind: PartKind;
  quali: CarSetup;
  raceDraft: RaceStrategy;
  error: string;
  replayDone: boolean;
  fanfarePending: boolean;
}

const SAVE_KEY = 'f1m8.save.v1';
const CRT_KEY = 'f1m8.crt';
const DEFAULT_SETUP: CarSetup = { aero: 'A5', engine: 'M5', tyre: 'P4' };

const ui: UiState = {
  screen: 'title',
  teamId: 'mclaren-mp4-4',
  trackId: 'interlagos',
  difficulty: 'normal',
  weekend: null,
  drafts: [{ ...DEFAULT_SETUP }],
  active: 0,
  kind: 'aero',
  quali: { ...DEFAULT_SETUP },
  raceDraft: { stints: ['P4', 'P4'], pitLaps: [14], mode: 'normal' },
  error: '',
  replayDone: false,
  fanfarePending: false,
};

let root: HTMLElement;
let replay: Replay | null = null;

// ------------------------------------------------------------- estado ------

function save() {
  try {
    if (!ui.weekend) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ weekend: ui.weekend, drafts: ui.drafts, quali: ui.quali, raceDraft: ui.raceDraft }));
  } catch {
    /* armazenamento indisponível: o jogo segue sem salvar */
  }
}

function loadSave(): Pick<UiState, 'weekend' | 'drafts' | 'quali' | 'raceDraft'> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.weekend?.version === 1 ? data : null;
  } catch {
    return null;
  }
}

function go(screen: Screen) {
  replay?.stop();
  replay = null;
  ui.screen = screen;
  ui.error = '';
  render();
  root.classList.remove('enter');
  void root.offsetWidth;
  root.classList.add('enter');
  if (screen === 'results' && ui.fanfarePending) {
    ui.fanfarePending = false;
    chip.sfx('fanfare');
  }
  window.scrollTo(0, 0);
}

function attempt(fn: () => void) {
  try {
    fn();
    ui.error = '';
  } catch (e) {
    ui.error = e instanceof Error ? e.message : String(e);
    render();
  }
}

// -------------------------------------------------------------- telas ------

function header(): string {
  const w = ui.weekend;
  if (!w) return '';
  const team = getTeam(w.playerTeamId);
  const track = getTrack(w.trackId);
  const spent = w.spent[w.playerTeamId] ?? 0;
  return `<div class="panel tight row between">
    <div class="row">
      <img class="px" src="${helmetSprite(team)}" width="32" height="32" alt="">
      <img class="px" src="${carSprite(team)}" width="120" height="42" alt="${esc(team.car)}">
      <div><div class="yellow">${esc(team.driver.name)}</div><div class="muted">${esc(team.car)} (${team.year})</div></div>
    </div>
    <div><div>GP de ${esc(track.name)}</div><div class="muted">Orçamento: $${w.budget}M · Gasto: $${spent}M</div></div>
    <button class="btn small secondary" data-act="goto" data-arg="hub">Agenda</button>
  </div>`;
}

function titleView(): string {
  const saved = loadSave();
  return `<div class="title-screen">
    <div class="title-lights">${'<span></span>'.repeat(5)}</div>
    <h1>GRANDE PRÊMIO 8-BIT</h1>
    <p class="muted">Gerência de F1 · Estratégia · Lendas das pistas</p>
    <div class="parade"><div class="lane">${TEAMS.map((t) => `<img class="px" src="${carSprite(t)}" alt="${esc(t.car)}">`).join('')}</div></div>
    <p class="press-start">APERTE START</p>
    <div class="row" style="justify-content:center">
      <button class="btn big" data-act="goto" data-arg="team">▶ Corrida rápida</button>
      ${saved ? '<button class="btn big secondary" data-act="continue">Continuar fim de semana</button>' : ''}
      <button class="btn big secondary" data-act="goto" data-arg="help">Como jogar</button>
    </div>
    <p class="muted" style="margin-top:24px">Fase 1 · Modo solo contra a IA · Multiplayer online em breve</p>
  </div>`;
}

function helpView(): string {
  return `<div class="panel">
    <h2>Como jogar</h2>
    <p>Você é o chefe de equipe. Não pilota: escolhe as peças, lê a previsão do tempo e define a estratégia.</p>
    <h3 class="yellow">O fim de semana (1 sessão por dia, às 20h)</h3>
    <p><b>D1 · Teste:</b> experimente até ${MAX_PRACTICE_RUNS} acertos. A telemetria mostra os tempos por setor, o desgaste dos pneus e os comentários do piloto. As peças do teste são emprestadas e não custam nada.</p>
    <p><b>D2 · Classificação:</b> uma volta rápida define o grid. <span class="red">Parque fechado:</span> a aerodinâmica e o motor escolhidos aqui ficam travados para a corrida.</p>
    <p><b>D3 · Corrida:</b> escolha os pneus de cada stint, as voltas de parada e o ritmo (poupar, normal ou agressivo).</p>
    <h3 class="yellow">Os 3 fatores</h3>
    <p><b>Aerodinâmica:</b> mais pressão ajuda nas curvas e atrapalha nas retas (arrasto). Com vento, asas sensíveis ficam instáveis.</p>
    <p><b>Motor:</b> mais potência em troca de consumo e risco de quebra. Calor e altitude roubam potência (turbos sofrem menos com a altitude).</p>
    <p><b>Pneus:</b> macio é rápido e dura pouco. Cada composto tem uma faixa ideal de temperatura. Intermediário para chuva leve, chuva extrema para chuva forte.</p>
    <h3 class="yellow">Orçamento</h3>
    <p>Você tem $55M por fim de semana para motor, asa e todos os jogos de pneus (classificação + corrida). O "melhor de tudo" não cabe no orçamento.</p>
    <h3 class="yellow">Meteorologia</h3>
    <p>Chuva, calor e vento são sorteados para cada sessão. A previsão fica mais precisa a cada dia. Na classificação, você precisa apostar no tempo da corrida.</p>
    <button class="btn" data-act="goto" data-arg="title">Voltar</button>
  </div>`;
}

function skillRows(team: (typeof TEAMS)[number]): string {
  const s = team.driver.skills;
  const rows: [string, number][] = [
    ['Ritmo', s.pace], ['Classif.', s.qualifying], ['Chuva', s.wet],
    ['Pneus', s.tyres], ['Consist.', s.consistency], ['Largada', s.start],
  ];
  return rows.map(([l, v]) => `<div class="stat"><span>${l} ${v}</span>${bar((v - 80) / 20)}</div>`).join('');
}

function teamView(): string {
  return `<h1>Escolha sua equipe</h1>
    <div class="grid cards">${TEAMS.map(
      (t) => `<button class="card${t.id === ui.teamId ? ' selected' : ''}" data-act="team" data-arg="${t.id}">
        <img class="px car" src="${carSprite(t)}" alt="${esc(t.car)}">
        <div><img class="px helmet" src="${helmetSprite(t)}" alt="">${esc(t.driver.name)}</div>
        <div class="yellow" style="margin:6px 0">${esc(t.car)} · ${t.year} · #${t.number}</div>
        <div class="muted" style="margin-bottom:6px">★ ${esc(t.strength)}</div>
        ${skillRows(t)}
      </button>`,
    ).join('')}</div>
    <div class="row" style="margin-top:16px"><button class="btn secondary" data-act="goto" data-arg="title">Voltar</button>
    <button class="btn big" data-act="goto" data-arg="track">Próximo ▶</button></div>`;
}

function trackView(): string {
  return `<h1>Escolha o Grande Prêmio</h1>
    <div class="grid cards">${TRACKS.map(
      (t) => `<button class="card${t.id === ui.trackId ? ' selected' : ''}" data-act="track" data-arg="${t.id}">
        <div class="yellow">${esc(t.name)}</div><div class="muted">${esc(t.country)} · ${t.laps} voltas</div>
        <canvas class="px track-mini" width="140" height="80" data-track="${t.id}"></canvas>
        <div class="stat"><span>Retas ${Math.round(t.profile.straights * 100)}%</span>${bar(t.profile.straights)}</div>
        <div class="stat"><span>Curvas lentas ${Math.round(t.profile.slowCorners * 100)}%</span>${bar(t.profile.slowCorners)}</div>
        <div class="stat"><span>Curvas rápidas ${Math.round(t.profile.fastCorners * 100)}%</span>${bar(t.profile.fastCorners)}</div>
        <div style="margin-top:6px">
          <span class="pill">🌧️ ${Math.round(t.rainChance * 100)}%</span><span class="pill">🌡️ ${Math.round(t.hotChance * 100)}%</span>
          <span class="pill">💨 ${Math.round(t.windChance * 100)}%</span>${t.altitude > 0.3 ? '<span class="pill">⛰️ altitude</span>' : ''}
        </div>
        <div class="muted" style="margin-top:6px;font-size:8px">${esc(t.demand)}</div>
      </button>`,
    ).join('')}</div>
    <div class="panel tight" style="margin-top:16px"><h3>Dificuldade da IA</h3><div class="tabs">${DIFFICULTIES.map(
      (d) => `<button class="tab${d.id === ui.difficulty ? ' active' : ''}" data-act="difficulty" data-arg="${d.id}">${d.label}</button>`,
    ).join('')}</div></div>
    <div class="row"><button class="btn secondary" data-act="goto" data-arg="team">Voltar</button>
    <button class="btn big" data-act="start">Começar fim de semana ▶</button></div>`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${day} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const SESSION_SCREEN: Record<SessionId, Screen> = { teste: 'practice', classificacao: 'quali', corrida: 'race' };

function hubView(): string {
  const w = ui.weekend!;
  const track = getTrack(w.trackId);
  const fc = forecasts(w);
  const next = w.schedule[w.completed];
  const schedule = w.schedule
    .map((s, i) => {
      const status = i < w.completed ? 'done' : i === w.completed ? 'next' : '';
      const icon = i < w.completed ? '✓' : i === w.completed ? '▶' : '🔒';
      return `<div class="item ${status}"><span>D${i + 1}</span><span>${SESSION_LABEL[s.session]}<br><span class="muted">${fmtDate(s.date)}</span></span><span>${icon}</span></div>`;
    })
    .join('');
  const action = next
    ? `<button class="btn big" data-act="goto" data-arg="${SESSION_SCREEN[next.session]}">Ir para: ${SESSION_LABEL[next.session]} ▶</button>`
    : '<button class="btn big" data-act="goto" data-arg="results">Ver resultado final ▶</button>';
  return `${header()}
    <div class="grid two">
      <div class="panel schedule"><h2>Cronograma · GP de ${esc(track.name)}</h2>${schedule}
        <p class="muted" style="margin-top:10px;font-size:8px">Modo corrida rápida: você pode antecipar a próxima sessão. No multiplayer, cada sessão roda no horário marcado.</p>
        <div class="row">${action}</div>
      </div>
      <div class="panel"><h2>A pista</h2>
        <canvas class="px track-mini" style="height:130px" width="200" height="110" data-track="${track.id}"></canvas>
        <p>${esc(track.demand)}</p>
        <div class="stat"><span>Retas ${Math.round(track.profile.straights * 100)}%</span>${bar(track.profile.straights)}</div>
        <div class="stat"><span>Curvas lentas ${Math.round(track.profile.slowCorners * 100)}%</span>${bar(track.profile.slowCorners)}</div>
        <div class="stat"><span>Curvas rápidas ${Math.round(track.profile.fastCorners * 100)}%</span>${bar(track.profile.fastCorners)}</div>
        <div class="stat"><span>Desgaste de pneus</span>${bar(track.tyreWear / 1.3, true)}</div>
        <div class="stat"><span>Dificuldade p/ ultrapassar</span>${bar(track.overtaking, true)}</div>
        <div class="stat"><span>Altitude</span>${bar(track.altitude)}</div>
      </div>
    </div>
    <h2>Previsão do tempo</h2>
    <div class="grid three">${fc.map((f, i) => forecastCard(f, `D${i + 1} · ${SESSION_LABEL[f.session]}`, fmtDate(w.schedule[i].date))).join('')}</div>
    ${w.completed >= 1 ? `<div class="row"><button class="btn secondary" data-act="goto" data-arg="practice">Telemetria do teste</button>
      ${w.completed >= 2 ? '<button class="btn secondary" data-act="goto" data-arg="quali">Grid de largada</button>' : ''}
      ${w.completed >= 3 ? '<button class="btn secondary" data-act="goto" data-arg="results">Resultado da corrida</button>' : ''}</div>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn small danger" data-act="abandon">Abandonar fim de semana</button></div>`;
}

function setupSummary(s: CarSetup): string {
  return `<span class="pill">${s.aero} ${esc(getAero(s.aero).name)}</span><span class="pill">${s.engine} ${esc(getEngine(s.engine).name)}</span><span class="pill">${tyreBadge(s.tyre)} ${esc(getTyre(s.tyre).name)}</span>`;
}

function kindTabs(): string {
  const tabs: [PartKind, string][] = [['aero', 'Aerodinâmica'], ['engine', 'Motor'], ['tyre', 'Pneus']];
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${ui.kind === k ? ' active' : ''}" data-act="kind" data-arg="${k}">${l}</button>`).join('')}</div>`;
}

function budgetMeter(cost: number, budget: number, label: string): string {
  const over = cost > budget;
  return `<div style="margin:8px 0"><div class="row between"><span>${esc(label)}</span><span class="${over ? 'red' : 'green'}">$${cost}M / $${budget}M</span></div>
    <div class="meter budget${over ? ' over' : ''}"><span style="width:${Math.min(100, (cost / budget) * 100)}%"></span></div></div>`;
}

function practiceView(): string {
  const w = ui.weekend!;
  if (w.completed >= 1) return practiceResultsView();
  const f = forecasts(w)[0];
  const draft = ui.drafts[ui.active];
  const tabs = ui.drafts
    .map((_, i) => `<button class="tab${i === ui.active ? ' active' : ''}" data-act="draft" data-arg="${i}">Acerto ${i + 1}</button>`)
    .join('');
  return `${header()}
    <h1>D1 · Teste</h1>
    <div class="grid two">
      <div class="panel tight"><p>Monte até ${MAX_PRACTICE_RUNS} acertos. Cada um roda ${6} voltas e gera telemetria. Use o teste para descobrir o que funciona nesta pista.</p>
        <p class="muted">As peças do teste são emprestadas: o orçamento só conta a partir da classificação.</p></div>
      ${forecastCard(f, 'Tempo no teste', fmtDate(w.schedule[0].date))}
    </div>
    <div class="panel">
      <div class="tabs">${tabs}${ui.drafts.length < MAX_PRACTICE_RUNS ? '<button class="tab" data-act="add-draft">+ Novo acerto</button>' : ''}
        ${ui.drafts.length > 1 ? '<button class="tab" data-act="remove-draft">✕ Remover</button>' : ''}</div>
      <div style="margin-bottom:10px">${setupSummary(draft)} <span class="muted">Custo na corrida: $${setupCost(draft)}M</span></div>
      ${kindTabs()}
      ${partPicker(ui.kind, draft[ui.kind])}
    </div>
    <div class="row"><button class="btn secondary" data-act="goto" data-arg="hub">Voltar</button>
      <button class="btn big" data-act="run-practice">Rodar teste (${ui.drafts.length} acerto${ui.drafts.length > 1 ? 's' : ''}) ▶</button></div>`;
}

function practiceResultsView(): string {
  const w = ui.weekend!;
  const track = getTrack(w.trackId);
  const team = getTeam(w.playerTeamId);
  const best = w.practiceBoard[0]?.best ?? 0;
  const runs = w.practiceRuns
    .map((r, i) => {
      const fastest = Math.min(...r.laps.map((l) => l.total));
      return `<div class="panel">
        <h2>Acerto ${i + 1}</h2><div style="margin-bottom:8px">${setupSummary(r.setup)}</div>
        <div class="table-wrap"><table><tr><th>Volta</th><th class="num">Retas</th><th class="num">C. lentas</th><th class="num">C. rápidas</th><th class="num">Tempo</th><th class="num">Desgaste</th></tr>
        ${r.laps
          .map(
            (l, n) => `<tr><td>${n + 1}</td><td class="num${l.straights === r.bestSectors.straights ? ' best' : ''}">${l.straights.toFixed(3)}</td>
            <td class="num${l.slow === r.bestSectors.slow ? ' best' : ''}">${l.slow.toFixed(3)}</td>
            <td class="num${l.fast === r.bestSectors.fast ? ' best' : ''}">${l.fast.toFixed(3)}</td>
            <td class="num${l.total === fastest ? ' best' : ''}">${formatLap(l.total)}</td><td class="num">${Math.round(l.wear * 100)}%</td></tr>`,
          )
          .join('')}</table></div>
        <p style="margin-top:8px">Vida útil estimada do pneu: <span class="yellow">~${Math.floor(r.tyreLife)} voltas</span> <span class="muted">(a corrida tem ${track.laps})</span></p>
        ${r.feedback.map((q) => `<div class="quote"><img class="px" src="${helmetSprite(team)}" alt=""><span>"${esc(q)}"</span></div>`).join('')}
      </div>`;
    })
    .join('');
  return `${header()}
    <h1>D1 · Teste: telemetria</h1>
    <p>Tempo no teste: <span class="yellow">${esc(describeWeather(w.weather.teste))}</span></p>
    <div class="grid two">
      <div>${runs}</div>
      <div class="panel"><h2>Tabela de tempos</h2><div class="table-wrap"><table>
        <tr><th>#</th><th>Piloto</th><th class="num">Melhor</th><th class="num">Dif.</th></tr>
        ${w.practiceBoard
          .map((b, i) => {
            const t = getTeam(b.teamId);
            return `<tr class="${b.teamId === w.playerTeamId ? 'me' : ''}"><td>${i + 1}</td><td><img class="px" src="${helmetSprite(t)}" width="16" height="16" alt=""> ${esc(t.driver.shortName)}</td>
              <td class="num">${formatLap(b.best)}</td><td class="num">${i ? `+${(b.best - best).toFixed(3)}` : ''}</td></tr>`;
          })
          .join('')}
      </table></div>
      <p class="muted" style="margin-top:8px;font-size:8px">Os rivais também escondem o jogo: cada equipe testou com o acerto que imaginava usar.</p></div>
    </div>
    <div class="row"><button class="btn big" data-act="goto" data-arg="hub">Voltar à agenda ▶</button></div>`;
}

function qualiView(): string {
  const w = ui.weekend!;
  if (w.completed >= 2) return gridView();
  const fc = forecasts(w);
  const cost = setupCost(ui.quali);
  const tested = w.practiceRuns
    .map((r, i) => `<button class="btn small secondary" data-act="use-run" data-arg="${i}">Usar acerto ${i + 1} (${formatLap(r.best)})</button>`)
    .join('');
  return `${header()}
    <h1>D2 · Classificação</h1>
    <div class="grid three">
      ${forecastCard(fc[1], 'Tempo na classificação', fmtDate(w.schedule[1].date))}
      ${forecastCard(fc[2], 'Previsão p/ corrida', fmtDate(w.schedule[2].date))}
      <div class="panel tight"><h3 class="red">Parque fechado</h3>
        <p style="font-size:8px">A aerodinâmica e o motor escolhidos aqui <b>ficam travados para a corrida</b>. Só os pneus e a estratégia podem mudar. Pense no tempo da corrida, não só no de hoje!</p>
        ${budgetMeter(cost, w.budget, 'Custo do acerto')}
        <p class="muted" style="font-size:8px">Sobram $${Math.max(0, w.budget - cost)}M para os pneus da corrida.</p></div>
    </div>
    <div class="panel">
      <div class="row" style="margin-bottom:8px">${tested}</div>
      <div style="margin-bottom:10px">${setupSummary(ui.quali)}</div>
      ${kindTabs()}
      ${partPicker(ui.kind, ui.quali[ui.kind], 'pick-quali')}
    </div>
    <div class="row"><button class="btn secondary" data-act="goto" data-arg="hub">Voltar</button>
      <button class="btn big" data-act="run-quali"${cost > w.budget ? ' disabled' : ''}>Volta rápida! ▶</button></div>`;
}

function gridView(): string {
  const w = ui.weekend!;
  const pole = w.quali![0].time ?? 0;
  return `${header()}
    <h1>D2 · Grid de largada</h1>
    <p>Tempo na classificação: <span class="yellow">${esc(describeWeather(w.weather.classificacao))}</span></p>
    <div class="panel"><div class="table-wrap"><table>
      <tr><th>Pos</th><th>Piloto</th><th>Carro</th><th>Acerto</th><th class="num">Tempo</th><th class="num">Dif.</th></tr>
      ${w.quali!
        .map((q, i) => {
          const t = getTeam(q.teamId);
          return `<tr class="${q.teamId === w.playerTeamId ? 'me' : ''}"><td>${i + 1}</td>
            <td><img class="px" src="${helmetSprite(t)}" width="16" height="16" alt=""> ${esc(t.driver.shortName)}</td>
            <td><img class="px" src="${carSprite(t)}" width="60" height="21" alt="${esc(t.car)}"></td>
            <td>${q.setup.aero} ${q.setup.engine} ${tyreBadge(q.setup.tyre)}</td>
            <td class="num">${q.time ? formatLap(q.time) : `<span class="red">${esc(q.note ?? 'sem tempo')}</span>`}</td>
            <td class="num">${q.time && i ? `+${(q.time - pole).toFixed(3)}` : ''}</td></tr>`;
        })
        .join('')}
    </table></div><p class="muted" style="margin-top:8px;font-size:8px">Agora você vê o acerto dos rivais. Use isso na estratégia de corrida.</p></div>
    <div class="row"><button class="btn big" data-act="goto" data-arg="hub">Voltar à agenda ▶</button></div>`;
}

/** Pneus que o jogador conhece do teste: vida útil medida. */
function testedTyreLife(runs: PracticeRun[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of runs) out[r.setup.tyre] = Math.floor(r.tyreLife);
  return out;
}

function raceView(): string {
  const w = ui.weekend!;
  if (w.completed >= 3) return resultsView();
  const track = getTrack(w.trackId);
  const fc = forecasts(w);
  const setup = w.setups[w.playerTeamId];
  const gridPos = w.quali!.findIndex((q) => q.teamId === w.playerTeamId) + 1;
  const left = w.budget - (w.spent[w.playerTeamId] ?? 0);
  const s = ui.raceDraft;
  const cost = strategyCost(s);
  const err = validateStrategy(w, s);
  const known = testedTyreLife(w.practiceRuns);
  const stints = s.stints
    .map((tyre, i) => {
      const from = i === 0 ? 1 : s.pitLaps[i - 1] + 1;
      const to = i < s.pitLaps.length ? s.pitLaps[i] : track.laps;
      return `<div class="stint">
        <div><label>Stint ${i + 1}</label>${tyreBadge(tyre)}</div>
        <div><label>Pneu (voltas ${from}–${to})${known[tyre] ? ` · no teste${w.weather.teste.rain ? ' (chuva)' : ''}: ~${known[tyre]} voltas` : ''}</label>
          <select data-act="stint-tyre" data-arg="${i}">${TYRE_PARTS.map((t) => `<option value="${t.id}"${t.id === tyre ? ' selected' : ''}>${t.id} ${esc(t.name)} ($${t.price}M)</option>`).join('')}</select></div>
        <div>${i < s.pitLaps.length ? `<label>Parar na volta</label><input type="number" min="1" max="${track.laps - 1}" value="${s.pitLaps[i]}" data-act="pit-lap" data-arg="${i}">` : '<label>&nbsp;</label>🏁'}</div>
      </div>`;
    })
    .join('');
  const modes: [DriveMode, string, string][] = [
    ['poupar', 'Poupar', 'Mais lento, poupa pneus e motor.'],
    ['normal', 'Normal', 'Equilíbrio.'],
    ['agressivo', 'Agressivo', 'Mais rápido e ultrapassa mais. Gasta pneu e arrisca o motor.'],
  ];
  return `${header()}
    <h1>D3 · Corrida</h1>
    <div class="grid three">
      ${forecastCard(fc[2], 'Tempo na corrida', fmtDate(w.schedule[2].date))}
      <div class="panel tight"><h3>Seu carro (travado)</h3>${setupSummary({ ...setup })}
        <p style="margin-top:8px">Largada: <span class="yellow">P${gridPos}</span> · ${track.laps} voltas</p>
        <p class="muted" style="font-size:8px">Perda no pit: ~${track.pitLoss + 3}s</p></div>
      <div class="panel tight"><h3>Orçamento de pneus</h3>${budgetMeter(cost, left, 'Pneus da corrida')}
        <p class="muted" style="font-size:8px">Cada stint usa um jogo novo de pneus.</p></div>
    </div>
    <div class="panel">
      <h2>Estratégia</h2>
      <div class="row"><span>Paradas:</span>${[0, 1, 2, 3].map((n) => `<button class="tab${s.stints.length - 1 === n ? ' active' : ''}" data-act="stops" data-arg="${n}">${n}</button>`).join('')}</div>
      ${stints}
      <h3 style="margin-top:14px">Ritmo</h3>
      <div class="tabs">${modes.map(([m, l]) => `<button class="tab${s.mode === m ? ' active' : ''}" data-act="mode" data-arg="${m}">${l}</button>`).join('')}</div>
      <p class="muted" style="font-size:8px">${esc(modes.find((m) => m[0] === s.mode)![2])}</p>
      ${err ? `<div class="error">${esc(err)}</div>` : ''}
    </div>
    <div class="row"><button class="btn secondary" data-act="goto" data-arg="hub">Voltar</button>
      <button class="btn big" data-act="run-race"${err ? ' disabled' : ''}>Luzes apagadas! ▶</button></div>`;
}

function replayView(): string {
  const w = ui.weekend!;
  return `${header()}
    <h1>GP de ${esc(getTrack(w.trackId).name)}</h1>
    <p class="muted">${esc(describeWeather(w.weather.corrida))}</p>
    <div class="replay">
      <div>
        <div class="hud" id="hud"></div>
        <canvas class="px" id="replay-canvas"></canvas>
        <div class="row" style="margin-top:8px">
          ${[1, 2, 4, 8].map((n) => `<button class="btn small secondary" data-act="speed" data-arg="${n}">x${n}</button>`).join('')}
          <button class="btn small secondary" data-act="skip">Pular ⏭</button>
          <button class="btn small" id="to-results" data-act="goto" data-arg="results" ${ui.replayDone ? '' : 'hidden'}>Resultado ▶</button>
        </div>
        <div class="panel tight"><h3>Narração</h3><div class="feed" id="feed"></div></div>
      </div>
      <div class="panel tight tower" id="tower"></div>
    </div>`;
}

function resultsView(): string {
  const w = ui.weekend!;
  const race = w.race!;
  const me = race.classification.find((c) => c.teamId === w.playerTeamId)!;
  const winner = getTeam(race.classification[0].teamId);
  const msg =
    me.status === 'dnf' ? `Abandono: ${me.reason}. Faz parte!` :
    me.position === 1 ? 'VITÓRIA! Estratégia perfeita!' :
    me.position <= 3 ? `Pódio! P${me.position}.` :
    me.points > 0 ? `P${me.position} e ${me.points} pontos.` : `P${me.position}. Ainda dá para ajustar a estratégia.`;
  return `${header()}
    <h1>Resultado · GP de ${esc(getTrack(w.trackId).name)}</h1>
    ${podium(race.classification.filter((c) => c.status === 'finished').slice(0, 3).map((c) => c.teamId), w.playerTeamId)}
    <div class="panel tight"><span class="yellow">🏆 ${esc(winner.driver.name)}</span> <span class="muted">(${esc(winner.car)})</span> · ${esc(msg)}</div>
    <div class="panel"><div class="table-wrap"><table>
      <tr><th>Pos</th><th>Piloto</th><th class="num">Grid</th><th>Estratégia</th><th class="num">Paradas</th><th class="num">Melhor volta</th><th class="num">Tempo</th><th class="num">Pts</th></tr>
      ${race.classification
        .map((c) => {
          const t = getTeam(c.teamId);
          const st = w.strategies[c.teamId];
          return `<tr class="${c.teamId === w.playerTeamId ? 'me' : ''}"><td>${c.status === 'dnf' ? 'AB' : c.position}</td>
            <td><img class="px" src="${helmetSprite(t)}" width="16" height="16" alt=""> ${esc(t.driver.shortName)}</td>
            <td class="num">${c.grid}</td><td>${st.stints.map(tyreBadge).join('')} <span class="muted">${st.mode}</span></td>
            <td class="num">${c.pits}</td>
            <td class="num${race.fastestLap.teamId === c.teamId ? ' best' : ''}">${formatLap(c.bestLap)}</td>
            <td class="num">${esc(c.gap)}</td><td class="num yellow">${c.points || ''}</td></tr>`;
        })
        .join('')}
    </table></div></div>
    <div class="row">
      <button class="btn secondary" data-act="goto" data-arg="replay">Ver replay</button>
      <button class="btn secondary" data-act="goto" data-arg="hub">Agenda</button>
      <button class="btn big" data-act="new">Novo fim de semana ▶</button>
    </div>`;
}

function podium(top: string[], playerId: string): string {
  const confetti = Array.from({ length: 36 }, (_, i) => {
    const colors = ['#ffd23f', '#e43b44', '#3b8bea', '#3fbf6f', '#f4f4f4', '#d67bff'];
    return `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${((i * 0.23) % 2.4).toFixed(2)}s;animation-duration:${(2.2 + ((i * 0.37) % 1.6)).toFixed(2)}s"></i>`;
  }).join('');
  const step = (pos: number) => {
    const id = top[pos - 1];
    if (!id) return `<div class="step p${pos}"><div class="block">${pos}</div></div>`;
    const t = getTeam(id);
    return `<div class="step p${pos}${id === playerId ? ' me' : ''}">
      <img class="px podium-helmet" src="${helmetSprite(t)}" alt="">
      <img class="px podium-car" src="${carSprite(t)}" alt="${esc(t.car)}">
      <div class="name">${esc(t.driver.shortName)}</div>
      <div class="block">${pos}</div></div>`;
  };
  return `<div class="panel podium-wrap"><div class="confetti">${confetti}</div>
    <div class="podium">${step(2)}${step(1)}${step(3)}</div></div>`;
}

// ------------------------------------------------------------- render ------

function render() {
  const views: Record<Screen, () => string> = {
    title: titleView, help: helpView, team: teamView, track: trackView, hub: hubView,
    practice: practiceView, quali: qualiView, race: raceView, replay: replayView, results: resultsView,
  };
  const needsWeekend = !['title', 'help', 'team', 'track'].includes(ui.screen);
  if (needsWeekend && !ui.weekend) ui.screen = 'title';
  const toolbar = `<div class="toolbar">
    <button class="tab" data-act="sound" title="Som">${chip.muted ? '🔇 SOM' : '🔊 SOM'}</button>
    <button class="tab${document.body.classList.contains('crt') ? ' active' : ''}" data-act="crt" title="Efeito de TV antiga">📺 CRT</button></div>`;
  root.innerHTML = toolbar + (ui.error ? `<div class="error">${esc(ui.error)}</div>` : '') + views[ui.screen]();
  if (['title', 'help', 'team', 'track'].includes(ui.screen)) chip.playTheme();
  else chip.stopTheme();
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-track]').forEach((c) => drawTrack(c, getTrack(c.dataset.track!)));
  if (ui.screen === 'replay' && !replay) {
    replay = new Replay(
      root.querySelector('#replay-canvas')!,
      root.querySelector('#tower')!,
      root.querySelector('#feed')!,
      root.querySelector('#hud')!,
      ui.weekend!,
      () => {
        ui.replayDone = true;
        ui.fanfarePending = true;
        root.querySelector('#to-results')?.removeAttribute('hidden');
      },
    );
    replay.start();
  }
}

function evenPits(stops: number, laps: number): number[] {
  return Array.from({ length: stops }, (_, i) => Math.round(((i + 1) * laps) / (stops + 1)));
}

function handle(act: string, arg: string, el: HTMLElement) {
  const w = ui.weekend;
  switch (act) {
    case 'goto':
      go(arg as Screen);
      return;
    case 'continue': {
      const s = loadSave();
      if (s) Object.assign(ui, s);
      go('hub');
      return;
    }
    case 'team':
      ui.teamId = arg;
      break;
    case 'track':
      ui.trackId = arg;
      break;
    case 'difficulty':
      ui.difficulty = arg as Difficulty['id'];
      break;
    case 'start':
      ui.weekend = createWeekend({ trackId: ui.trackId, playerTeamId: ui.teamId, difficulty: ui.difficulty });
      ui.drafts = [{ ...DEFAULT_SETUP }];
      ui.active = 0;
      ui.kind = 'aero';
      ui.replayDone = false;
      save();
      go('hub');
      return;
    case 'new':
      go('team');
      return;
    case 'abandon':
      if (!confirm('Abandonar este fim de semana?')) return;
      ui.weekend = null;
      save();
      go('title');
      return;
    case 'kind':
      ui.kind = arg as PartKind;
      break;
    case 'draft':
      ui.active = Number(arg);
      break;
    case 'add-draft':
      ui.drafts.push({ ...ui.drafts[ui.active] });
      ui.active = ui.drafts.length - 1;
      break;
    case 'remove-draft':
      ui.drafts.splice(ui.active, 1);
      ui.active = Math.max(0, ui.active - 1);
      break;
    case 'pick': {
      const kind = el.dataset.kind as PartKind;
      ui.drafts[ui.active] = { ...ui.drafts[ui.active], [kind]: el.dataset.id! };
      break;
    }
    case 'pick-quali': {
      const kind = el.dataset.kind as PartKind;
      ui.quali = { ...ui.quali, [kind]: el.dataset.id! };
      break;
    }
    case 'use-run':
      ui.quali = { ...w!.practiceRuns[Number(arg)].setup };
      break;
    case 'run-practice':
      attempt(() => {
        ui.weekend = runPractice(w!, ui.drafts);
        const bestRun = [...ui.weekend.practiceRuns].sort((a, b) => a.best - b.best)[0];
        ui.quali = { ...bestRun.setup };
        ui.kind = 'aero';
        save();
        go('practice');
      });
      return;
    case 'run-quali':
      attempt(() => {
        ui.weekend = runQualifying(w!, ui.quali);
        const laps = getTrack(ui.weekend.trackId).laps;
        ui.raceDraft = { stints: [ui.quali.tyre, ui.quali.tyre], pitLaps: evenPits(1, laps), mode: 'normal' };
        save();
        go('quali');
      });
      return;
    case 'stops': {
      const n = Number(arg);
      const laps = getTrack(w!.trackId).laps;
      const stints = Array.from({ length: n + 1 }, (_, i) => ui.raceDraft.stints[i] ?? ui.raceDraft.stints[ui.raceDraft.stints.length - 1]);
      ui.raceDraft = { ...ui.raceDraft, stints, pitLaps: evenPits(n, laps) };
      break;
    }
    case 'mode':
      ui.raceDraft = { ...ui.raceDraft, mode: arg as DriveMode };
      break;
    case 'stint-tyre': {
      const stints = [...ui.raceDraft.stints];
      stints[Number(arg)] = (el as HTMLSelectElement).value;
      ui.raceDraft = { ...ui.raceDraft, stints };
      break;
    }
    case 'pit-lap': {
      const pitLaps = [...ui.raceDraft.pitLaps];
      pitLaps[Number(arg)] = Math.round(Number((el as HTMLInputElement).value));
      ui.raceDraft = { ...ui.raceDraft, pitLaps };
      break;
    }
    case 'run-race':
      attempt(() => {
        ui.weekend = runRace(w!, ui.raceDraft);
        ui.replayDone = false;
        save();
        go('replay');
      });
      return;
    case 'sound':
      chip.setMuted(!chip.muted);
      break;
    case 'crt': {
      const on = document.body.classList.toggle('crt');
      try {
        localStorage.setItem(CRT_KEY, on ? '1' : '0');
      } catch {
        /* sem armazenamento */
      }
      break;
    }
    case 'speed':
      replay?.setSpeed(Number(arg));
      return;
    case 'skip':
      replay?.skip();
      return;
    default:
      return;
  }
  save();
  render();
}

export function mount(el: HTMLElement) {
  root = el;
  try {
    if (localStorage.getItem(CRT_KEY) === '1') document.body.classList.add('crt');
  } catch {
    /* sem armazenamento */
  }
  const SELECT_ACTS = new Set(['team', 'track', 'pick', 'pick-quali', 'difficulty', 'stops', 'mode', 'kind', 'draft']);
  root.addEventListener('click', (e) => {
    // O navegador só libera áudio depois de um gesto do usuário.
    const firstUnlock = !chip.ready;
    chip.unlock();
    if (firstUnlock && ['title', 'help', 'team', 'track'].includes(ui.screen)) chip.playTheme();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
    if ((t as HTMLButtonElement).disabled) return;
    chip.sfx(SELECT_ACTS.has(t.dataset.act!) ? 'select' : 'blip');
    handle(t.dataset.act!, t.dataset.arg ?? '', t);
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.act) handle(t.dataset.act, t.dataset.arg ?? '', t);
  });
  render();
}
