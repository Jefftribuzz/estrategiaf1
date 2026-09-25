# Grande Prêmio 8-Bit

Jogo de gerência de F1 em 8 bits, no estilo Elifoot/Brasfoot. Você é o chefe de
equipe: escolhe aerodinâmica, motor e pneus, lê a previsão do tempo e define a
estratégia. O jogo simula o resto.

## Rodar

```bash
npm install
npm run dev          # jogo em http://localhost:5173 (sem a landing)
npm run dev:server   # servidor do multiplayer em http://localhost:8787
npm test             # testes (física, equilíbrio, temporada, liga, API)
npm run build        # landing em dist/, jogo em dist/jogar/, servidor em dist-server/
npm start            # sobe o servidor, que serve o jogo e a API
```

Com `npm run dev` e `npm run dev:server` rodando juntos, o Vite repassa `/api`
para o servidor, então o multiplayer funciona também no modo de desenvolvimento.

## O que tem na Fase 1

- **10 equipes históricas** com pilotos, pintura e capacete em pixel art:
  Fangio (Maserati 250F), Clark (Lotus 49), Fittipaldi (Lotus 72D),
  Lauda (Ferrari 312T), Piquet (Brabham BT49), Senna (McLaren MP4/4),
  Mansell (Williams FW14B), Schumacher (Ferrari F2004), Vettel (Red Bull RB9)
  e Hamilton (Mercedes W11). Os atributos dos pilotos somam o mesmo total, e
  cada chassi tem pontos fortes e fracos que se anulam na média.
- **10 pistas** com perfil próprio (retas, curvas lentas e rápidas, desgaste,
  altitude, dificuldade de ultrapassar e clima típico).
- **3 fatores × 10 modelos**: aerodinâmica (pressão × arrasto × vento),
  motor (potência × confiabilidade × consumo × calor × altitude) e pneus
  (aderência × desgaste × faixa de temperatura × chuva).
- **Meteorologia** sorteada por sessão (sol ou chuva leve/forte, calor ou frio,
  vento ou não). A previsão fica mais precisa a cada dia.
- **Fim de semana em 3 dias**: Teste (até 3 acertos com telemetria e
  comentários do piloto), Classificação (parque fechado: aero e motor ficam
  travados) e Corrida (stints, paradas e ritmo).
- **Orçamento** de $55M por fim de semana para peças e jogos de pneus.
- **IA** com 3 níveis de dificuldade e **replay 8 bits** com narração.

## Fase 2: visual e som

- **Trilha chiptune** e efeitos sonoros sintetizados com Web Audio, sem
  nenhum arquivo de áudio: tema de abertura, semáforo, ronco do pelotão,
  ultrapassagens, pit stops, batidas, safety car, chuva e fanfarra no pódio.
- **Replay renovado**: cenário com árvores, arquibancadas, boxes e zebras;
  carros vistos de cima com a pintura de cada equipe; semáforo de 5 luzes;
  chuva animada (a intensidade e o vento mudam a cena); safety car na pista;
  fumaça e faíscas nos abandonos; avisos flutuantes (PIT, RODOU!, FURO!, OUT);
  bandeira quadriculada.
- **Pódio animado** com confete.
- Sprites com sombreamento, transições entre telas e filtro opcional de TV
  antiga (botão 📺 CRT). O som liga e desliga no botão 🔊.

## Fase 3: temporada

- **Temporada de 10 GPs** (Baku → Interlagos), um a cada 3 dias, com
  campeonato de pilotos (10-8-6-5-4-3-2-1) e tela de campeão.
- **QG da equipe**: calendário, campeonato GP a GP, garagem, desenvolvimento
  e finanças.
- **Economia**: caixa inicial de $150M, patrocínio de $12M por GP e prêmio por
  posição. Peças compradas ficam na garagem e não são pagas de novo.
- **Desgaste**: cada motor tem vida útil em corridas e, depois dela, o risco de
  quebra triplica. Um acidente destrói a asa que estava no carro.
- **Desenvolvimento**: 5 áreas (retas, curvas lentas, curvas rápidas,
  confiabilidade, pneus) com 5 níveis cada. As rivais investem os prêmios delas.
- **Acelerar**: "⏩ Pular dia" (o engenheiro decide a sessão) e
  "⏭ Simular fim de semana", na temporada e na corrida rápida.
- **Traçados reais**: os circuitos vêm das coordenadas reais
  ([bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT).

## Fase 4: multiplayer online

- **Perfil por apelido**: sem senha. O acesso fica salvo no navegador.
- **Ligas privadas** com código de convite e link (`?liga=CODIGO`). Até 10
  humanos, cada um com uma equipe diferente; as outras ficam com os bots.
- **Temporada completa** online: garagem, desenvolvimento, finanças e
  campeonato de cada jogador.
- **Horário**: cada sessão roda às **20h no fuso da liga** (o fuso de quem
  criou), e cada amigo vê o horário convertido para o fuso dele. Existe também
  o ritmo **rápido** (uma sessão a cada 10 minutos), bom para testar.
- **Prazos**: a sessão roda no horário, ou antes se todos já enviaram. Quem
  não enviar fica com a decisão do engenheiro. O dono da liga pode antecipar a
  sessão.
- **Servidor autoritativo**: a simulação roda no servidor. O jogador não vê a
  semente, o tempo real futuro nem a telemetria dos outros, só a previsão.
- **Avanço preguiçoso**: sessões vencidas são simuladas no primeiro acesso
  depois do horário. Como o motor é determinístico, o resultado é o mesmo, e o
  servidor pode "dormir" (plano gratuito) sem perder corridas.

### Horários dos circuitos

Cada sessão mostra o horário local no circuito, no estilo da F1 real (corridas
de dia, 14h ou 15h locais). Dois são fictícios, para ter corridas em
iluminações diferentes: **Baku à noite** (como Singapura e Jidá) e
**Interlagos no entardecer** (como a final de Abu Dhabi). À noite a pista
esfria e o replay ganha holofotes. As sessões do jogador continuam às 20h no
fuso dele.

## Fase 5: celular, notificações e segurança

- **App instalável (PWA)**: no celular, "Adicionar à tela de início". Tem
  ícone próprio e os modos solo funcionam sem internet.
- **Notificações**: sessão aberta, lembrete **1 hora antes do prazo** (só para
  quem ainda não decidiu), resultado do GP e fim de temporada. Tocar na
  notificação abre a liga. No iPhone, só funciona com o jogo instalado na tela
  de início (iOS 16.4+).
- **Perfil em vários aparelhos**: em *Multiplayer → Conta* (ou *Perfil →
  Segurança*), "Levar perfil para outro aparelho" gera um **código de 8 letras**
  que vale por 10 minutos e só uma vez. No outro aparelho: *Conta → Tenho um
  código*. "Desconectar outros aparelhos" encerra as outras sessões.
- **Login com Google** (opcional): ativado quando o servidor tem
  `GOOGLE_CLIENT_ID`. Quem já tem perfil por apelido pode vincular a conta
  Google e recuperar o acesso em qualquer aparelho.
- **Hall da fama**: ranking global de títulos, vitórias e pódios nas ligas.
- **Proteção do servidor**: limite de requisições por IP (cadastro, login,
  convites e API), cabeçalhos de segurança (CSP, HSTS, nosniff, anti-iframe),
  tokens guardados só como hash, sessão em **cookie HttpOnly** (o JavaScript
  da página não lê o token) e proteção contra CSRF (cabeçalho `X-GP8`
  obrigatório e checagem de `Origin`).

## Domínio: estrategiaf1.com.br

Um único serviço no Render atende o domínio inteiro:

| Endereço | O que é |
|---|---|
| `estrategiaf1.com.br/` | landing page (pasta `landing/`) |
| `estrategiaf1.com.br/jogar/` | o jogo (PWA instalável) |
| `estrategiaf1.com.br/api/` | servidor do multiplayer |

Links com `?liga=`, `?abrir=`, `?reset=`, `?verificar=` ou `?codigo=` na raiz são redirecionados
para `/jogar/`. Para editar a landing, mexa em `landing/index.html` e
`landing/style.css`. As imagens ficam em `landing/img/`.

## Publicar online (grátis)

1. **Banco (Supabase)**: no projeto, clique em **Connect** e copie a URI do
   **Session pooler** (o Render só acessa por IPv4, e a conexão direta do
   Supabase é IPv6). Troque `[YOUR-PASSWORD]` pela senha do banco.
2. **Servidor (Render)**: em *New → Blueprint*, conecte o GitHub e escolha o
   repositório `estrategiaf1`. O `render.yaml` cria o serviço `estrategiaf1`.
   Quando ele pedir `DATABASE_URL`, cole a URI do passo 1. `GOOGLE_CLIENT_ID`
   pode ficar vazio.
3. **Teste** no endereço provisório `https://estrategiaf1.onrender.com` (ou o
   nome que o Render mostrar).
4. **Domínio**: no serviço do Render, abra *Settings → Custom Domains* e
   adicione `estrategiaf1.com.br` e `www.estrategiaf1.com.br`. O Render mostra
   os registros DNS; crie-os no Registro.br (*DNS → Editar zona*):
   - `estrategiaf1.com.br` → registro **A** com o IP que o Render indicar;
   - `www` → registro **CNAME** para o endereço `.onrender.com` do serviço.

   O certificado HTTPS sai sozinho depois que o DNS propaga (minutos a horas).
5. **Manter acordado**: em https://cron-job.org, agende um acesso a
   `https://estrategiaf1.com.br/health` a cada 10 minutos. Sem isso, o plano
   grátis dorme e os lembretes de prazo atrasam. Nenhuma corrida se perde.
6. **E-mails (recuperar senha e confirmar cadastro)**: crie uma conta grátis
   em https://resend.com, adicione o domínio `estrategiaf1.com.br` em
   *Domains* e crie no Registro.br os registros DNS que o Resend mostrar
   (SPF/DKIM). Depois gere uma chave em *API Keys* e coloque em
   `RESEND_API_KEY` no Render (*Environment*). `EMAIL_FROM` e `PUBLIC_URL` já
   vêm preenchidos pelo `render.yaml`. Sem a chave, o jogo funciona, mas não
   envia e-mails.
7. **Login com Google (opcional)**: no Google Cloud, crie um *OAuth Client ID*
   (*Web application*) com `https://estrategiaf1.com.br` em
   *Authorized JavaScript origins* e coloque o ID em `GOOGLE_CLIENT_ID`.

As chaves das notificações (VAPID) são geradas e guardadas no banco
automaticamente. O servidor cria a tabela sozinho (`gp8_kv`). Sem
`DATABASE_URL`, ele grava em arquivos na pasta `DATA_DIR`.

## Contas e perfil

- **Login com e-mail e senha**: senha guardada só como hash scrypt com sal
  próprio. Login com mensagem única ("E-mail ou senha incorretos"), limite de
  tentativas por IP e por e-mail. Trocar a senha desconecta os outros aparelhos.
- Perfis antigos, só com apelido, podem **adicionar e-mail e senha** sem perder
  ligas nem histórico.
- **Meu perfil**:
  - **Dados:** nome, sobrenome e apelido (o apelido também muda nas ligas e no
    Hall da fama);
  - **Avatar:** capacete em pixel art, com as cores de uma lenda ou uma paleta
    de 16 cores;
  - **Preferências:** som, CRT e tipos de notificação (sessão aberta, lembrete
    de prazo, resultados), sincronizados entre aparelhos;
  - **Histórico:** ligas online, com posição, pontos, vitórias, pódios e cada
    GP, e as corridas rápidas e temporadas solo jogadas logado;
  - **Segurança:** trocar senha, código para outro aparelho e sair.
- **Recuperar senha**: *Entrar → Esqueci minha senha* manda um link por e-mail
  que vale 30 minutos e só uma vez (só o link mais recente vale). A resposta é
  sempre a mesma, exista ou não a conta. Criar a senha nova desconecta os
  outros aparelhos.
- **Confirmar e-mail**: o cadastro manda um link de confirmação (vale 24 h). No
  perfil aparece "não confirmado" com o botão para reenviar.
- Os links e códigos são guardados só como hash e saem do endereço da página
  assim que ela abre.

## SEO (busca no Google)

O build gera, além da landing, páginas de conteúdo feitas para busca:

- `/como-jogar/`: guia completo, com as tabelas de peças e perguntas frequentes;
- `/pistas/` e `/pistas/<circuito>/`: guia de estratégia de cada GP (traçado,
  ficha, história, dicas, horários);
- `/pilotos/` e `/pilotos/<piloto>/`: cada lenda, com história, carro e atributos;
- `sitemap.xml` com todas as páginas, `robots.txt` e 404 com `noindex`.

Os textos ficam em `scripts/seo/content.ts` e o gerador em
`scripts/seo/gen-pages.ts`; os números vêm dos dados do jogo. Todas as páginas
têm título e descrição próprios, endereço canônico, Open Graph e dados
estruturados (VideoGame, FAQPage, Article, BreadcrumbList).

**Depois de publicar no domínio:**

1. **Google Search Console** (https://search.google.com/search-console):
   adicione uma propriedade do tipo **Domínio** (`estrategiaf1.com.br`). Ele
   pede um registro **TXT**; crie-o no DNS do Registro.br e clique em
   *Verificar*.
2. Em *Sitemaps*, envie `https://estrategiaf1.com.br/sitemap.xml`.
3. Em *Inspeção de URL*, peça a indexação da página inicial, de `/pistas/` e de
   `/pilotos/`.
4. **Bing Webmaster Tools** (https://www.bing.com/webmasters): importe o site
   direto do Search Console. O Bing também alimenta o DuckDuckGo e o
   buscador do ChatGPT.
5. **Links para o site**: divulgue em comunidades de F1 e de jogos (grupos,
   Reddit r/formula1 e r/brdev, fóruns, Discord), cadastre em diretórios de
   jogos de navegador (itch.io, Game Jolt) e peça para quem joga compartilhar
   o link da liga. Links de outros sites são o fator que mais pesa depois do
   conteúdo.

## Arquitetura

```
src/engine/   Motor puro em TypeScript, sem DOM e determinístico (semente).
              Na Fase 4, o mesmo código roda no servidor multiplayer.
  data/       equipes, pistas e peças
  performance.ts  modelo de tempo de volta, desgaste, quebras e erros
  session.ts      teste, classificação e corrida volta a volta
  strategy.ts     estimativas e busca de estratégia
  ai.ts           decisões dos bots
  weather.ts      clima e previsão
  weekend.ts      orquestração do fim de semana
  season.ts       temporada, economia, garagem e desenvolvimento
  league.ts       liga multiplayer (lobby, prazos, decisões, visão por jogador)
scripts/seo/  gerador do site estático (landing + páginas de SEO + sitemap)
server/       API HTTP (Node, sem framework) + armazenamento em arquivo ou Postgres
src/ui/       Interface (telas, sprites, replay, áudio chiptune, cliente online)
tests/        Vitest
```

## Próximas fases

1. ~~MVP solo~~ ✔
2. ~~Visual e som~~ ✔
3. ~~Temporada~~ ✔
4. ~~Multiplayer online~~ ✔ (notificações push ficam para a Fase 5)
5. ~~Celular, notificações, contas e segurança~~ ✔

As cores dos carros e capacetes são aproximações em pixel art das pinturas
históricas. Nomes e marcas reais pertencem aos seus donos: isso é um projeto de
fã sem fins comerciais.
