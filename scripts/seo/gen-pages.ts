// Gera o site estático em dist/: copia a landing (landing/) e cria as páginas
// de conteúdo para SEO (guias de circuito, lendas, como jogar) e o sitemap.
// Roda no build, depois do `vite build` (o jogo fica em dist/jogar/).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AERO_PARTS, ENGINE_PARTS, TYRE_PARTS, WEEKEND_BUDGET } from '../../src/engine/data/parts';
import { TEAMS } from '../../src/engine/data/teams';
import { TRACKS } from '../../src/engine/data/tracks';
import { SEASON_CALENDAR } from '../../src/engine/season';
import type { Team, Track } from '../../src/engine/types';
import { DRIVER_COPY, TRACK_COPY } from './content';

const SITE = 'https://estrategiaf1.com.br';
const OUT = 'dist';
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (v: number) => `${Math.round(v * 100)}%`;

interface PageMeta {
  path: string;
  title: string;
  description: string;
  h1: string;
  crumbs: [string, string][];
  body: string;
  jsonLd?: object[];
  image?: string;
}

const pages: PageMeta[] = [];

function layout(p: PageMeta): string {
  const url = SITE + p.path;
  const crumbs = [['Início', '/'] as [string, string], ...p.crumbs];
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  };
  const ld = [breadcrumbLd, ...(p.jsonLd ?? [])].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Estratégia F1" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}${p.image ?? '/img/og.png'}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0f1020" />
  <link rel="icon" href="/jogar/icon-192.png" />
  <link rel="apple-touch-icon" href="/jogar/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
  ${ld}
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="/"><img class="px" src="/jogar/icon-192.png" alt="" width="32" height="32"><span><b>ESTRATÉGIA</b> F1</span></a>
      <nav aria-label="Principal">
        <a href="/como-jogar/">Como jogar</a>
        <a href="/pistas/">Circuitos</a>
        <a href="/pilotos/">Lendas</a>
      </nav>
      <a class="btn small" href="/jogar/">Jogar ▶</a>
    </div>
  </header>
  <main class="wrap article">
    <nav class="crumbs" aria-label="Você está em">${crumbs
      .map(([name, path], i) => (i === crumbs.length - 1 ? `<span>${esc(name)}</span>` : `<a href="${path}">${esc(name)}</a>`))
      .join(' › ')}</nav>
    <h1>${esc(p.h1)}</h1>
    ${p.body}
    <div class="card cta-box">
      <h2>Pronto para a largada?</h2>
      <p>Estratégia F1 é grátis e roda no navegador, no computador ou no celular.</p>
      <a class="btn" href="/jogar/">Jogar agora ▶</a>
      <a class="btn secondary" href="/jogar/?tela=online">Criar liga com amigos</a>
    </div>
  </main>
  ${footer()}
</body>
</html>
`;
}

function footer(): string {
  return `<footer>
    <div class="wrap">
      <div class="foot-links">
        <div><b>Circuitos</b>${TRACKS.map((t) => `<a href="/pistas/${TRACK_COPY[t.id].slug}/">${esc(t.name)}</a>`).join('')}</div>
        <div><b>Lendas</b>${TEAMS.map((t) => `<a href="/pilotos/${DRIVER_COPY[t.id].slug}/">${esc(t.driver.name)}</a>`).join('')}</div>
        <div><b>Jogo</b><a href="/jogar/">Jogar</a><a href="/como-jogar/">Como jogar</a><a href="/jogar/?tela=online">Liga online</a></div>
      </div>
      <p><b>Estratégia F1</b> · Grande Prêmio 8-Bit</p>
      <p>Projeto de fã, sem fins comerciais e sem vínculo com a Fórmula 1, equipes ou pilotos. Nomes, pinturas e marcas pertencem aos seus donos.</p>
      <p>Traçados dos circuitos a partir de <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a> (licença MIT).</p>
    </div>
  </footer>`;
}

/** Mapa do circuito em SVG (traçado real simplificado). */
function trackSvg(t: Track, big = true): string {
  const xs = t.shape.map((p) => p[0]);
  const ys = t.shape.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const pad = 6;
  const pts = t.shape.map(([x, y]) => `${(x - minX + pad).toFixed(1)},${(y - minY + pad).toFixed(1)}`).join(' ');
  const [sx, sy] = t.shape[0];
  return `<svg class="track-map${big ? '' : ' small'}" viewBox="0 0 ${(w + pad * 2).toFixed(1)} ${(h + pad * 2).toFixed(1)}" role="img" aria-label="Traçado do circuito ${esc(t.name)}">
    <polygon points="${pts}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round" />
    <polygon points="${pts}" fill="none" stroke="#e8e8e8" stroke-width="3" stroke-linejoin="round" />
    <rect x="${(sx - minX + pad - 2.5).toFixed(1)}" y="${(sy - minY + pad - 2.5).toFixed(1)}" width="5" height="5" fill="#ffd23f" />
  </svg>`;
}

function statRow(label: string, value: number, text: string): string {
  const on = Math.round(Math.max(0, Math.min(1, value)) * 10);
  return `<tr><th scope="row">${esc(label)}</th><td><span class="bar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span></td><td>${esc(text)}</td></tr>`;
}

// ---------------------------------------------------------------- pistas --

const LIGHT: Record<string, string> = { dia: '☀️ de dia', entardecer: '🌇 no entardecer', noite: '🌙 à noite' };

function wingAdvice(t: Track): string {
  if (t.profile.straights >= 0.55) return 'asa de baixo arrasto (A1 a A4) e o motor mais forte que o orçamento permitir';
  if (t.profile.slowCorners >= 0.5) return 'asa de alta pressão (A8 a A10); o motor fica em segundo plano';
  if (t.profile.fastCorners >= 0.4) return 'asas eficientes em curvas rápidas (A6, A7 ou A9), atento ao vento';
  return 'asa média (A5 a A7), o meio-termo mais seguro';
}

function trackPage(t: Track): PageMeta {
  const c = TRACK_COPY[t.id];
  const round = SEASON_CALENDAR.indexOf(t.id) + 1;
  const times = t.times;
  const body = `
    <p class="lead">Guia de estratégia do <b>${esc(c.gp)}</b> no Estratégia F1, o manager de Fórmula 1 em 8 bits: como acertar aerodinâmica, motor e pneus, e o que esperar do clima.</p>
    <div class="grid g2 split">
      <figure class="card map-card">${trackSvg(t)}<figcaption>Traçado de ${esc(c.official)}. O quadrado amarelo marca a linha de chegada.</figcaption></figure>
      <div class="card">
        <h2>Ficha do circuito no jogo</h2>
        <table class="facts">
          ${statRow('Retas', t.profile.straights, pct(t.profile.straights))}
          ${statRow('Curvas lentas', t.profile.slowCorners, pct(t.profile.slowCorners))}
          ${statRow('Curvas rápidas', t.profile.fastCorners, pct(t.profile.fastCorners))}
          ${statRow('Desgaste de pneus', t.tyreWear / 1.3, t.tyreWear >= 1.1 ? 'alto' : t.tyreWear <= 0.85 ? 'baixo' : 'médio')}
          ${statRow('Dificuldade de ultrapassar', t.overtaking, pct(t.overtaking))}
          ${statRow('Chance de chuva', t.rainChance, pct(t.rainChance))}
          ${statRow('Chance de calor', t.hotChance, pct(t.hotChance))}
          ${statRow('Chance de vento', t.windChance, pct(t.windChance))}
          ${statRow('Altitude', t.altitude, t.altitude > 0.5 ? 'muito alta' : t.altitude > 0.2 ? 'média' : 'baixa')}
        </table>
        <p class="muted">${t.laps} voltas no jogo · ${round ? `etapa ${round} de 10 da temporada` : ''} · corrida ${LIGHT[times.corrida.light]} (${times.corrida.local} no horário local)</p>
      </div>
    </div>
    <h2>A história de ${esc(t.name)}</h2>
    ${c.history.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>Estratégia para ${esc(t.name)}</h2>
    <p>${esc(t.demand)} Em geral, funciona melhor ${esc(wingAdvice(t))}.</p>
    <ul>${c.tips.map((tip) => `<li>${esc(tip)}</li>`).join('')}</ul>
    <h2>Horários do fim de semana</h2>
    <p>No jogo, o GP de ${esc(t.name)} tem três sessões, uma por dia, sempre às 20h no seu fuso. No circuito, os horários locais seguem o estilo da F1:</p>
    <ul>
      <li><b>D1 · Teste:</b> ${times.teste.local} em ${esc(t.city)} (${LIGHT[times.teste.light]})</li>
      <li><b>D2 · Classificação:</b> ${times.classificacao.local} (${LIGHT[times.classificacao.light]})</li>
      <li><b>D3 · Corrida:</b> ${times.corrida.local} (${LIGHT[times.corrida.light]})</li>
    </ul>
    <p>Veja também: <a href="/como-jogar/">como jogar</a> · <a href="/pistas/">todos os circuitos</a> · <a href="/pilotos/">as 10 lendas</a></p>`;
  return {
    path: `/pistas/${c.slug}/`,
    title: `${c.gp}: guia de estratégia | Estratégia F1`,
    description: `Como vencer o ${c.gp} no jogo de F1 Estratégia F1: acerto de asa, motor e pneus, clima, história do circuito e dicas. Grátis no navegador.`,
    h1: `${c.gp}: guia de estratégia`,
    crumbs: [['Circuitos', '/pistas/'], [t.name, `/pistas/${c.slug}/`]],
    body,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${c.gp}: guia de estratégia`,
      inLanguage: 'pt-BR',
      about: { '@type': 'Place', name: c.official },
      author: { '@type': 'Organization', name: 'Estratégia F1' },
      publisher: { '@type': 'Organization', name: 'Estratégia F1', logo: { '@type': 'ImageObject', url: `${SITE}/jogar/icon-512.png` } },
      dateModified: TODAY,
      mainEntityOfPage: `${SITE}/pistas/${c.slug}/`,
      image: `${SITE}/img/og.png`,
    }],
  };
}

// ---------------------------------------------------------------- pilotos --

const SKILL_LABEL: [keyof Team['driver']['skills'], string][] = [
  ['pace', 'Ritmo'], ['qualifying', 'Classificação'], ['wet', 'Chuva'], ['tyres', 'Pneus'], ['consistency', 'Consistência'], ['start', 'Largada'],
];

function driverPage(t: Team): PageMeta {
  const c = DRIVER_COPY[t.id];
  const s = t.driver.skills;
  const best = [...SKILL_LABEL].sort((a, b) => s[b[0]] - s[a[0]])[0];
  const body = `
    <p class="lead">${esc(t.driver.name)} e a ${esc(t.car)} (${t.year}) estão entre as 10 lendas do Estratégia F1, o jogo de estratégia de Fórmula 1 em 8 bits. Veja a história, o carro e como aproveitar os pontos fortes da dupla.</p>
    <div class="grid g2 split">
      <figure class="card sprite-card">
        <img class="px" src="/img/car-${t.id}.png" alt="${esc(t.car)} em pixel art" width="320" height="112" />
        <figcaption><img class="px" src="/img/helmet-${t.id}.png" alt="Capacete de ${esc(t.driver.name)} em pixel art" width="32" height="32" /> ${esc(t.driver.name)} · ${esc(t.car)} · #${t.number}</figcaption>
      </figure>
      <div class="card">
        <h2>Atributos no jogo</h2>
        <table class="facts">${SKILL_LABEL.map(([k, l]) => statRow(l, (s[k] - 80) / 20, String(s[k]))).join('')}</table>
        <p class="muted">Ponto forte: ${esc(t.strength)}. Melhor atributo: ${esc(best[1])} (${s[best[0]]}).</p>
      </div>
    </div>
    <h2>Quem foi ${esc(t.driver.name)}</h2>
    ${c.bio.map((p) => `<p>${esc(p)}</p>`).join('')}
    <h2>O carro: ${esc(t.car)}</h2>
    <p>${esc(c.car)}</p>
    <h2>Como jogar com ${esc(t.driver.name.split(' ').slice(-1)[0])}</h2>
    <ul>
      <li>Todos os pilotos somam os mesmos pontos de atributo (552). O que muda é onde cada um é forte: ${esc(t.driver.name)} se destaca em ${esc(best[1].toLowerCase())}.</li>
      <li>${s.wet >= 95 ? 'Na chuva, aproveite: poucos pilotos rendem tanto no molhado.' : s.tyres >= 94 ? 'Com pouco desgaste de pneus, estratégias com menos paradas ficam viáveis.' : s.start >= 94 ? 'Largadas fortes ganham posições na primeira volta: vale arriscar na classificação.' : s.consistency >= 95 ? 'Com alta consistência, ele erra pouco: o modo agressivo é menos arriscado.' : 'Um piloto completo: adapte o acerto à pista, sem depender de um único atributo.'}</li>
      <li>Combine com circuitos que favorecem o chassi: ${esc(t.strength.toLowerCase())}. Veja os <a href="/pistas/">guias de circuito</a>.</li>
    </ul>
    <p>Veja também: <a href="/pilotos/">todas as lendas</a> · <a href="/como-jogar/">como jogar</a></p>`;
  return {
    path: `/pilotos/${c.slug}/`,
    title: `${t.driver.name} e a ${t.car} no jogo de F1 | Estratégia F1`,
    description: `Jogue com ${t.driver.name} e a ${t.car} (${t.year}) no Estratégia F1, manager de Fórmula 1 grátis em 8 bits: história, carro, atributos e dicas.`,
    h1: `${t.driver.name} e a ${t.car}`,
    crumbs: [['Lendas', '/pilotos/'], [t.driver.name, `/pilotos/${c.slug}/`]],
    body,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${t.driver.name} e a ${t.car} no Estratégia F1`,
      inLanguage: 'pt-BR',
      about: { '@type': 'Person', name: t.driver.name },
      author: { '@type': 'Organization', name: 'Estratégia F1' },
      publisher: { '@type': 'Organization', name: 'Estratégia F1', logo: { '@type': 'ImageObject', url: `${SITE}/jogar/icon-512.png` } },
      dateModified: TODAY,
      mainEntityOfPage: `${SITE}/pilotos/${c.slug}/`,
      image: `${SITE}/img/car-${t.id}.png`,
    }],
  };
}

// ---------------------------------------------------------------- índices --

function tracksIndex(): PageMeta {
  const cards = SEASON_CALENDAR.map((id, i) => {
    const t = TRACKS.find((x) => x.id === id)!;
    const c = TRACK_COPY[id];
    return `<a class="card link-card" href="/pistas/${c.slug}/">${trackSvg(t, false)}<h2>${i + 1}. ${esc(c.gp)}</h2><p>${esc(t.demand)}</p></a>`;
  }).join('');
  return {
    path: '/pistas/',
    title: 'Circuitos do jogo de F1: guias de estratégia | Estratégia F1',
    description: 'Os 10 circuitos do Estratégia F1 com traçado real: Interlagos, Mônaco, Monza, Spa, Silverstone, Suzuka e mais. Guia de acerto e estratégia de cada GP.',
    h1: 'Circuitos: guias de estratégia',
    crumbs: [['Circuitos', '/pistas/']],
    body: `<p class="lead">A temporada do Estratégia F1 tem 10 GPs, de Baku à final em Interlagos, todos com traçado real. Cada pista pede um acerto diferente de aerodinâmica, motor e pneus.</p><div class="grid g3">${cards}</div>`,
  };
}

function driversIndex(): PageMeta {
  const cards = TEAMS.map((t) => `<a class="card link-card legend" href="/pilotos/${DRIVER_COPY[t.id].slug}/">
      <img class="px car" src="/img/car-${t.id}.png" alt="${esc(t.car)}" width="120" height="42" loading="lazy" />
      <h2><img class="px helmet" src="/img/helmet-${t.id}.png" alt="" width="24" height="24" loading="lazy" />${esc(t.driver.name)}</h2>
      <p>${esc(t.car)} · ${t.year}</p><p class="muted">★ ${esc(t.strength)}</p></a>`).join('');
  return {
    path: '/pilotos/',
    title: 'Lendas da F1 no jogo: Senna, Schumacher, Hamilton | Estratégia F1',
    description: 'Jogue com Ayrton Senna, Michael Schumacher, Lewis Hamilton, Fittipaldi, Piquet, Lauda e outras lendas da Fórmula 1 com seus carros históricos em 8 bits.',
    h1: '10 lendas da Fórmula 1',
    crumbs: [['Lendas', '/pilotos/']],
    body: `<p class="lead">No Estratégia F1 você comanda uma de 10 duplas históricas de piloto e carro, de Fangio com a Maserati 250F a Hamilton com a Mercedes W11. Todas equilibradas: quem decide é a estratégia.</p><div class="grid g5">${cards}</div>`,
  };
}

function howToPlay(): PageMeta {
  const table = (rows: string[][], head: string[]) =>
    `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  const aero = table(AERO_PARTS.map((p) => [p.id, p.name, pct(p.downforce), pct(p.drag), `$${p.price}M`, p.description]), ['', 'Asa', 'Pressão', 'Arrasto', 'Preço', 'Quando usar']);
  const engine = table(ENGINE_PARTS.map((p) => [p.id, p.name, pct(p.power), pct(p.reliability), `${p.life}`, `$${p.price}M`, p.description]), ['', 'Motor', 'Potência', 'Confiab.', 'Vida (corridas)', 'Preço', 'Características']);
  const tyres = table(TYRE_PARTS.map((p) => [p.id, p.name, p.kind === 'seco' ? 'seco' : p.kind === 'inter' ? 'chuva leve' : 'chuva forte', `$${p.price}M`, p.description]), ['', 'Pneu', 'Para', 'Preço', 'Características']);
  const faq = HOW_FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('');
  return {
    path: '/como-jogar/',
    title: 'Como jogar Estratégia F1: guia do manager de Fórmula 1',
    description: 'Guia completo do Estratégia F1: teste, classificação e corrida, aerodinâmica, motores, pneus, clima, orçamento, temporada e liga online com amigos.',
    h1: 'Como jogar Estratégia F1',
    crumbs: [['Como jogar', '/como-jogar/']],
    body: `
      <p class="lead">Estratégia F1 é um jogo de gerência de Fórmula 1 em 8 bits, no estilo Elifoot e Brasfoot. Você não pilota: é o chefe de equipe. Escolhe as peças, lê a previsão do tempo, define a estratégia de pneus e paradas, e o motor do jogo simula a corrida volta a volta.</p>
      <h2>O fim de semana: um GP a cada 3 dias</h2>
      <p>Cada Grande Prêmio tem três sessões, uma por dia, sempre às 20h no seu fuso horário.</p>
      <ol>
        <li><b>Teste (D1):</b> experimente até 3 acertos diferentes. A telemetria mostra os tempos em retas, curvas lentas e curvas rápidas, o desgaste dos pneus e os comentários do piloto. As peças do teste são emprestadas: não custam nada.</li>
        <li><b>Classificação (D2):</b> uma volta rápida define o grid de largada. Regra do parque fechado: a asa e o motor escolhidos aqui ficam travados para a corrida.</li>
        <li><b>Corrida (D3):</b> escolha o pneu de cada stint, as voltas de parada nos boxes e o ritmo (poupar, normal ou agressivo). Depois acompanhe o replay em 8 bits, com narração, safety car e abandonos.</li>
      </ol>
      <h2>Os 3 fatores do carro</h2>
      <p>São 10 modelos de cada fator. Nenhum é o melhor em tudo: o certo depende da pista, do clima e do orçamento (na corrida rápida, $${WEEKEND_BUDGET}M por fim de semana).</p>
      <h3>Aerodinâmica</h3><p>Mais pressão (downforce) ajuda nas curvas e cria arrasto nas retas. Com vento, asas sensíveis perdem estabilidade. A altitude também reduz a pressão.</p>${aero}
      <h3>Motor</h3><p>Mais potência significa mais consumo e mais risco de quebra. O calor e a altitude roubam potência (os turbos sofrem menos com a altitude). Na temporada, cada motor tem vida útil em corridas.</p>${engine}
      <h3>Pneus</h3><p>Macio é rápido e dura pouco; duro aguenta e é mais lento. Cada composto tem uma faixa de temperatura. Intermediário para chuva leve, chuva extrema para chuva forte.</p>${tyres}
      <h2>Meteorologia</h2>
      <p>Chuva, calor e vento são sorteados para cada sessão. A previsão fica mais precisa a cada dia: no teste você vê a tendência para a corrida, e na véspera a previsão é bem mais confiável. À noite (como em Baku) a pista esfria.</p>
      <h2>Modos de jogo</h2>
      <ul>
        <li><b>Corrida rápida:</b> um fim de semana contra a IA, com 3 níveis de dificuldade.</li>
        <li><b>Temporada:</b> 10 GPs, caixa de $150M, patrocínio e prêmios. Compre peças, cuide do desgaste dos motores e invista em desenvolvimento do carro.</li>
        <li><b>Liga online:</b> até 10 amigos na mesma temporada, cada um com uma lenda. Quem não decidir até o prazo fica com a decisão do engenheiro. Notificações no celular avisam dos prazos e resultados.</li>
      </ul>
      <h2>Perguntas frequentes</h2>
      ${faq}
      <p>Veja também: <a href="/pistas/">guias dos circuitos</a> · <a href="/pilotos/">as 10 lendas</a></p>`,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: HOW_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
  };
}

const HOW_FAQ: [string, string][] = [
  ['Qual pneu usar na chuva?', 'Intermediário (P9) para chuva leve e Chuva Extrema (P10) para chuva forte. Pneus de seco na chuva perdem muita aderência e aumentam a chance de rodar.'],
  ['Vale a pena usar o motor mais potente?', 'Depende da pista e do clima. Em Monza e Baku a potência faz muita diferença, mas motores potentes quebram mais no calor e custam caro. Em Mônaco, potência quase não aparece no tempo de volta.'],
  ['Quantas paradas fazer?', 'Depende do desgaste da pista e do composto. Pistas como Suzuka e Silverstone gastam muito pneu; em Mônaco e Montreal dá para parar menos. A telemetria do teste mostra a vida útil estimada de cada pneu.'],
  ['O que é o parque fechado?', 'É a regra que trava a asa e o motor escolhidos na classificação para a corrida. Por isso é preciso pensar no clima do dia da corrida já na classificação.'],
  ['E se eu não puder jogar no horário?', 'Nos modos solo, você pode pular o dia e deixar o engenheiro decidir. Na liga online, quem não enviar a decisão até o prazo também fica com a escolha do engenheiro.'],
];

// ---------------------------------------------------------------- gerar ---

function write(path: string, html: string) {
  const file = join(OUT, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

if (!existsSync(join(OUT, 'jogar', 'index.html'))) throw new Error('Rode o build do jogo antes (vite build).');
// Limpa a raiz (menos o jogo) para não sobrar arquivo antigo, como um sw.js
// perdido que controlaria o domínio inteiro.
for (const name of readdirSync(OUT)) if (name !== 'jogar') rmSync(join(OUT, name), { recursive: true, force: true });
cpSync('landing', OUT, { recursive: true });

pages.push(howToPlay(), tracksIndex(), driversIndex(), ...TRACKS.map(trackPage), ...TEAMS.map(driverPage));
for (const p of pages) write(p.path, layout(p));

const urls: [string, string][] = [
  ['/', '1.0'],
  ['/jogar/', '0.9'],
  ...pages.map((p): [string, string] => [p.path, p.path.split('/').length > 3 ? '0.7' : '0.8']),
];
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><priority>${pr}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
);
console.log(`site: landing + ${pages.length} páginas de conteúdo + sitemap (${urls.length} URLs)`);
