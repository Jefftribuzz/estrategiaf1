# Grande Prêmio 8-Bit

Jogo de gerência de F1 em 8 bits, no estilo Elifoot/Brasfoot. Você é o chefe de
equipe: escolhe aerodinâmica, motor e pneus, lê a previsão do tempo e define a
estratégia. O jogo simula o resto.

## Rodar

```bash
npm install
npm run dev          # jogo em http://localhost:5173 (modos solo)
npm run dev:server   # servidor do multiplayer em http://localhost:8787
npm test             # testes (física, equilíbrio, temporada, liga, API)
npm run build        # jogo em dist/ + servidor em dist-server/
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
- **Perfil em vários aparelhos**: em *Multiplayer → Conta*, "Levar perfil para
  outro aparelho" gera um link de acesso. "Desconectar outros aparelhos"
  invalida todos os links antigos.
- **Login com Google** (opcional): ativado quando o servidor tem
  `GOOGLE_CLIENT_ID`. Quem já tem perfil por apelido pode vincular a conta
  Google e recuperar o acesso em qualquer aparelho.
- **Hall da fama**: ranking global de títulos, vitórias e pódios nas ligas.
- **Proteção do servidor**: limite de requisições por IP (cadastro, login,
  convites e API), cabeçalhos de segurança (CSP, HSTS, nosniff, anti-iframe) e
  tokens guardados só como hash.

## Publicar online (grátis)

1. **Banco de dados (Supabase)**: crie um projeto em https://supabase.com.
   Em *Project Settings → Database → Connection string → URI*, copie a string
   (modo *Session pooler*) e troque `[YOUR-PASSWORD]` pela senha do projeto.
2. **Servidor (Render)**: em https://render.com, escolha *New → Blueprint* e
   aponte para este repositório. O `render.yaml` já configura tudo. Quando ele
   pedir `DATABASE_URL`, cole a string do Supabase.
3. Abra o endereço que o Render criar (ex.: `https://grande-premio-8bit.onrender.com`)
   e mande o link da liga para os amigos.

4. **Manter acordado (para as notificações saírem na hora)**: o plano grátis
   do Render dorme depois de 15 min sem acesso, e dormindo não manda
   lembretes. Crie uma conta grátis em https://cron-job.org e agende um acesso
   a `https://SEU-ENDERECO.onrender.com/health` a cada 10 minutos. O plano
   grátis do Render cobre um serviço ligado o mês inteiro.
5. **Login com Google (opcional)**: no https://console.cloud.google.com, crie
   um *OAuth Client ID* do tipo *Web application*, com o endereço do Render em
   *Authorized JavaScript origins*, e coloque o Client ID em `GOOGLE_CLIENT_ID`
   no Render.

As chaves das notificações (VAPID) são geradas e guardadas no banco
automaticamente. O servidor cria a tabela sozinho (`gp8_kv`). Sem `DATABASE_URL`, ele grava em
arquivos na pasta `DATA_DIR` (padrão `./data`), o que serve para rodar num
computador ou VPS com disco. No plano gratuito do Render o serviço dorme sem
acesso e demora uns 50 s para acordar, mas nenhuma sessão se perde.

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
