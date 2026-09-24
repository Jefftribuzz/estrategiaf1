# Grande Prêmio 8-Bit

Jogo de gerência de F1 em 8 bits, no estilo Elifoot/Brasfoot. Você é o chefe de
equipe: escolhe aerodinâmica, motor e pneus, lê a previsão do tempo e define a
estratégia. O jogo simula o resto.

## Rodar

```bash
npm install
npm run dev      # servidor local em http://localhost:5173
npm test         # testes do motor (física, equilíbrio, fim de semana)
npm run build    # versão estática em dist/ (pode ir para GitHub Pages)
```

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
src/ui/       Interface (telas, sprites, replay)
tests/        Vitest
```

## Próximas fases

1. ~~MVP solo~~ ✔
2. Visual: sprites mais detalhados, trilha chiptune, efeitos de chuva no replay
3. Temporada: 10 GPs, campeonato, desgaste de peças entre corridas, orçamento
   da temporada e desenvolvimento
4. Multiplayer: login, ligas privadas, sessões agendadas no servidor e
   notificações
5. Polimento: balanceamento, ranking e celular (PWA)

As cores dos carros e capacetes são aproximações em pixel art das pinturas
históricas. Nomes e marcas reais pertencem aos seus donos: isso é um projeto de
fã sem fins comerciais.
