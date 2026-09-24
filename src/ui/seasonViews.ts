import { AERO_PARTS, ENGINE_PARTS, getAero, getEngine } from '../engine/data/parts';
import { getTeam, TEAMS } from '../engine/data/teams';
import { getTrack } from '../engine/data/tracks';
import {
  DEV_AREAS,
  devCost,
  engineWearMul,
  gpDate,
  MAX_DEV_LEVEL,
  PRIZE,
  SPONSOR_PER_GP,
  standings,
  type SeasonState,
} from '../engine/season';
import { POINTS } from '../engine/session';
import { carSprite, helmetSprite } from './sprites';
import { bar, esc } from './views';

export type HqTab = 'calendario' | 'classificacao' | 'garagem' | 'desenvolvimento' | 'financas';

const TABS: [HqTab, string][] = [
  ['calendario', '📅 Calendário'],
  ['classificacao', '🏆 Campeonato'],
  ['garagem', '🔧 Garagem'],
  ['desenvolvimento', '🧪 Desenvolvimento'],
  ['financas', '💰 Finanças'],
];

function fmtDay(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function seasonHeader(s: SeasonState): string {
  const team = getTeam(s.playerTeamId);
  const pos = standings(s).find((r) => r.teamId === s.playerTeamId)!;
  return `<div class="panel tight row between">
    <div class="row">
      <img class="px" src="${helmetSprite(team)}" width="32" height="32" alt="">
      <img class="px" src="${carSprite(team)}" width="120" height="42" alt="${esc(team.car)}">
      <div><div class="yellow">${esc(team.driver.name)}</div><div class="muted">${esc(team.car)} (${team.year})</div></div>
    </div>
    <div><div>Temporada · GP ${Math.min(s.round + 1, s.calendar.length)}/${s.calendar.length}</div>
      <div class="muted">${s.results.length ? `P${pos.position} no campeonato · ${pos.points} pts` : 'Campeonato ainda não começou'}</div></div>
    <div><div class="green">Caixa: $${s.cash}M</div></div>
  </div>`;
}

export interface HqOptions {
  /** Garagem e desenvolvimento liberados (padrão: só sem GP em andamento). */
  shopOpen?: boolean;
  /** Ações extras no topo (ex.: liga online). */
  extra?: string;
  /** Liga online: sem botão de abandonar e sem "ir para o GP" local. */
  online?: boolean;
}

export function hqView(s: SeasonState, tab: HqTab, opts: HqOptions = {}): string {
  const shopOpen = opts.shopOpen ?? !s.weekend;
  const tabs = `<div class="tabs">${TABS.map(([id, l]) => `<button class="tab${tab === id ? ' active' : ''}" data-act="hq-tab" data-arg="${id}">${l}</button>`).join('')}</div>`;
  const next = s.finished ? null : getTrack(s.calendar[s.round]);
  const w = s.weekend;
  let action = '';
  if (s.finished) action = '<button class="btn big" data-act="goto" data-arg="champion">Ver o campeão 🏆</button>';
  else if (w && w.completed >= 3) action = '<button class="btn big" data-act="goto" data-arg="results">Resultado do GP ▶</button>';
  else if (w) action = `<button class="btn big" data-act="goto" data-arg="hub">Continuar GP de ${esc(next!.name)} ▶</button>`;
  else action = `<button class="btn big" data-act="start-round">Ir para o GP de ${esc(next!.name)} ▶</button>`;
  if (opts.extra) action += opts.extra;
  const body =
    tab === 'calendario' ? calendarTab(s) :
    tab === 'classificacao' ? standingsTab(s) :
    tab === 'garagem' ? garageTab(s, shopOpen) :
    tab === 'desenvolvimento' ? devTab(s, shopOpen) : financeTab(s);
  return `${seasonHeader(s)}
    <h1>QG da equipe</h1>
    <div class="row" style="margin-bottom:10px">${action}</div>
    ${tabs}${body}
    ${opts.online ? '' : '<div class="row" style="margin-top:12px"><button class="btn small danger" data-act="abandon-season">Abandonar temporada</button></div>'}`;
}

function calendarTab(s: SeasonState): string {
  const rows = s.calendar
    .map((id, i) => {
      const t = getTrack(id);
      const r = s.results[i];
      let status = '';
      if (r) {
        const me = r.order.find((o) => o.teamId === s.playerTeamId)!;
        const win = getTeam(r.order[0].teamId);
        status = `<span class="${me.position <= 3 && me.status === 'finished' ? 'yellow' : ''}">${me.status === 'dnf' ? 'AB' : `P${me.position}`}</span> <span class="muted">· 🏆 ${esc(win.driver.shortName)}</span>`;
      } else if (i === s.round) status = '<span class="yellow">▶ PRÓXIMO</span>';
      else status = '<span class="muted">🔒</span>';
      const d = gpDate(s, i);
      const end = new Date(d);
      end.setDate(end.getDate() + 3);
      return `<div class="item${i < s.round ? ' done' : i === s.round ? ' next' : ''}">
        <span>${i + 1}</span>
        <span>GP de ${esc(t.name)}<br><span class="muted">${fmtDay(new Date(d.getTime() + 864e5))} a ${fmtDay(end)} · ${esc(t.demand)}</span></span>
        <span>${status}</span></div>`;
    })
    .join('');
  return `<div class="panel schedule"><h2>Calendário (1 GP a cada 3 dias)</h2>${rows}</div>`;
}

function standingsTab(s: SeasonState): string {
  const table = standings(s);
  const abbrev = s.calendar.map((id) => getTrack(id).flag);
  return `<div class="panel"><h2>Campeonato de pilotos</h2><div class="table-wrap"><table>
    <tr><th>Pos</th><th>Piloto</th><th></th><th class="num">Pts</th><th class="num">Vit.</th><th class="num">Pód.</th>
      ${abbrev.map((a, i) => `<th class="num${i === s.round ? ' yellow' : ''}">${a}</th>`).join('')}</tr>
    ${table
      .map((r) => {
        const t = getTeam(r.teamId);
        const cells = s.calendar
          .map((_, i) => {
            const res = s.results[i]?.order.find((o) => o.teamId === r.teamId);
            if (!res) return '<td class="num muted">·</td>';
            const cls = res.status === 'dnf' ? 'red' : res.position === 1 ? 'yellow' : res.position <= 3 ? 'green' : '';
            return `<td class="num ${cls}">${res.status === 'dnf' ? 'AB' : res.position}</td>`;
          })
          .join('');
        return `<tr class="${r.teamId === s.playerTeamId ? 'me' : ''}"><td>${r.position}</td>
          <td><img class="px" src="${helmetSprite(t)}" width="16" height="16" alt=""> ${esc(t.driver.shortName)}</td>
          <td><img class="px" src="${carSprite(t)}" width="60" height="21" alt="${esc(t.car)}"></td>
          <td class="num yellow">${r.points}</td><td class="num">${r.wins}</td><td class="num">${r.podiums}</td>${cells}</tr>`;
      })
      .join('')}
  </table></div>
  <p class="muted" style="margin-top:8px;font-size:8px">Pontos: ${POINTS.join('-')} do 1º ao 8º. Empate: mais vitórias, depois mais pódios.</p></div>`;
}

function garageTab(s: SeasonState, shopOpen: boolean): string {
  const locked = !shopOpen;
  const lockNote = locked ? '<p class="red" style="font-size:8px">Garagem fechada agora: compre entre um GP e outro, antes do teste (peças novas também podem ser escolhidas direto na classificação).</p>' : '';
  const engines = s.engines.length
    ? s.engines
        .map((e) => {
          const p = getEngine(e.id);
          const mul = engineWearMul(e);
          const worn = e.races >= p.life;
          return `<div class="part"><span class="id">${p.id}</span>
            <span>${esc(p.name)}<div class="stats"><span>Uso ${e.races}/${p.life} corridas ${bar(Math.min(1, e.races / p.life), true)}</span>
            <span class="${worn ? 'red' : mul > 1.15 ? 'yellow' : 'green'}">Risco de quebra ×${mul.toFixed(2)}${worn ? ' · NO LIMITE!' : ''}</span></div></span>
            <button class="btn small" data-act="buy-engine" data-arg="${p.id}"${locked || s.cash < p.price ? ' disabled' : ''}>Motor novo $${p.price}M</button></div>`;
        })
        .join('')
    : '<p class="muted">Nenhum motor ainda. Compre aqui ou escolha um na classificação.</p>';
  const aero = s.ownedAero.length
    ? s.ownedAero.map((id) => `<span class="pill">${id} ${esc(getAero(id).name)}</span>`).join('')
    : '<span class="muted">Nenhuma asa ainda.</span>';
  const shopAero = AERO_PARTS.filter((a) => !s.ownedAero.includes(a.id))
    .map((a) => `<button class="btn small secondary" data-act="buy-aero" data-arg="${a.id}"${locked || s.cash < a.price ? ' disabled' : ''}>${a.id} ${esc(a.name)} · $${a.price}M</button>`)
    .join('');
  const shopEngine = ENGINE_PARTS.filter((e) => !s.engines.some((x) => x.id === e.id))
    .map((e) => `<button class="btn small secondary" data-act="buy-engine" data-arg="${e.id}"${locked || s.cash < e.price ? ' disabled' : ''}>${e.id} ${esc(e.name)} · $${e.price}M · ${e.life} corr.</button>`)
    .join('');
  return `<div class="grid two">
    <div class="panel"><h2>Motores na garagem</h2>${lockNote}<div class="parts">${engines}</div>
      <p class="muted" style="margin-top:8px;font-size:8px">Cada motor tem vida útil em corridas. Depois do limite, o risco de quebra triplica.</p></div>
    <div class="panel"><h2>Aerodinâmica na garagem</h2><div>${aero}</div>
      <p class="muted" style="margin-top:8px;font-size:8px">Asas não se desgastam, mas um acidente destrói a asa que estava no carro.</p></div>
  </div>
  <div class="panel"><h2>Loja</h2>
    <h3>Aerodinâmica</h3><div class="row">${shopAero || '<span class="muted">Você já tem todas.</span>'}</div>
    <h3 style="margin-top:12px">Motores</h3><div class="row">${shopEngine || '<span class="muted">Você já tem todos.</span>'}</div>
    <p class="muted" style="margin-top:8px;font-size:8px">Peças da garagem não são cobradas de novo nos fins de semana. Pneus são comprados a cada GP.</p></div>`;
}

function devTab(s: SeasonState, shopOpen: boolean): string {
  const mine = s.dev[s.playerTeamId];
  const locked = !shopOpen;
  const areas = DEV_AREAS.map((a) => {
    const lv = mine[a.id];
    const cost = devCost(lv);
    const pips = Array.from({ length: MAX_DEV_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="part"><span class="id">${lv}/${MAX_DEV_LEVEL}</span>
      <span>${esc(a.label)}<div class="desc">${esc(a.description)}</div><div class="stats"><span class="bar">${pips}</span></span></div></span>
      ${lv >= MAX_DEV_LEVEL ? '<span class="green">MÁX</span>' : `<button class="btn small" data-act="buy-dev" data-arg="${a.id}"${locked || s.cash < cost ? ' disabled' : ''}>Evoluir $${cost}M</button>`}</div>`;
  }).join('');
  const rivals = TEAMS.map((t) => {
    const lv = s.dev[t.id];
    const total = Object.values(lv).reduce((x, y) => x + y, 0);
    return { t, total, lv };
  })
    .sort((a, b) => b.total - a.total)
    .map(({ t, total, lv }) => `<tr class="${t.id === s.playerTeamId ? 'me' : ''}"><td><img class="px" src="${helmetSprite(t)}" width="16" height="16" alt=""> ${esc(t.driver.shortName)}</td>
      ${DEV_AREAS.map((a) => `<td class="num">${lv[a.id]}</td>`).join('')}<td class="num yellow">${total}</td></tr>`)
    .join('');
  return `<div class="grid two">
    <div class="panel"><h2>Desenvolver o carro</h2>${locked ? '<p class="red" style="font-size:8px">Desenvolvimento só entre um GP e outro, antes do teste.</p>' : ''}
      <div class="parts">${areas}</div>
      <p class="muted" style="margin-top:8px;font-size:8px">Cada nível custa mais que o anterior. As rivais também investem o dinheiro dos prêmios.</p></div>
    <div class="panel"><h2>Espionagem: rivais</h2><div class="table-wrap"><table>
      <tr><th>Equipe</th>${DEV_AREAS.map((a) => `<th class="num">${esc(a.short)}</th>`).join('')}<th class="num">Total</th></tr>${rivals}
    </table></div></div>
  </div>`;
}

function financeTab(s: SeasonState): string {
  const income = s.ledger.filter((l) => l.amount > 0).reduce((a, b) => a + b.amount, 0);
  const spent = -s.ledger.filter((l) => l.amount < 0).reduce((a, b) => a + b.amount, 0);
  const rows = [...s.ledger]
    .reverse()
    .map((l) => `<tr><td>${l.round < s.calendar.length ? `GP ${l.round + 1}` : '—'}</td><td>${esc(l.label)}</td>
      <td class="num ${l.amount > 0 ? 'green' : l.amount < 0 ? 'red' : 'muted'}">${l.amount > 0 ? '+' : ''}${l.amount}</td></tr>`)
    .join('');
  return `<div class="grid two">
    <div class="panel"><h2>Resumo</h2>
      <p>Caixa: <span class="green">$${s.cash}M</span></p>
      <p>Entradas: <span class="green">+$${income}M</span> · Saídas: <span class="red">-$${spent}M</span></p>
      <p class="muted" style="font-size:8px">Receita por GP: patrocínio de $${SPONSOR_PER_GP}M + prêmio pela posição (${PRIZE.map((p, i) => `P${i + 1} $${p}M`).join(', ')}).</p></div>
    <div class="panel"><h2>Extrato ($M)</h2><div class="table-wrap" style="max-height:360px;overflow-y:auto"><table>${rows}</table></div></div>
  </div>`;
}

export function championView(s: SeasonState): string {
  const table = standings(s);
  const champ = getTeam(table[0].teamId);
  const me = table.find((r) => r.teamId === s.playerTeamId)!;
  const msg = me.position === 1 ? 'VOCÊ É O CAMPEÃO MUNDIAL!' : me.position <= 3 ? `Temporada de respeito: P${me.position} no campeonato.` : `P${me.position} no campeonato. Na próxima, o título!`;
  const confetti = Array.from({ length: 40 }, (_, i) => {
    const colors = ['#ffd23f', '#e43b44', '#3b8bea', '#3fbf6f', '#f4f4f4', '#d67bff'];
    return `<i style="left:${(i * 29) % 100}%;background:${colors[i % colors.length]};animation-delay:${((i * 0.19) % 2.4).toFixed(2)}s;animation-duration:${(2.4 + ((i * 0.31) % 1.6)).toFixed(2)}s"></i>`;
  }).join('');
  return `${seasonHeader(s)}
    <div class="panel podium-wrap" style="text-align:center"><div class="confetti">${confetti}</div>
      <h1>🏆 CAMPEÃO MUNDIAL 🏆</h1>
      <img class="px" src="${helmetSprite(champ)}" width="64" height="64" alt="">
      <div><img class="px" src="${carSprite(champ)}" width="240" height="84" alt="${esc(champ.car)}"></div>
      <h2>${esc(champ.driver.name)}</h2>
      <p>${esc(champ.car)} · ${table[0].points} pontos · ${table[0].wins} vitórias</p>
      <p class="yellow" style="margin-top:12px">${esc(msg)}</p>
    </div>
    ${standingsTab(s)}
    <div class="row"><button class="btn big" data-act="new-season">Nova temporada ▶</button>
      <button class="btn secondary" data-act="goto" data-arg="title">Menu</button></div>`;
}
