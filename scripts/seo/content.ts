// Textos próprios das páginas de SEO (guias de circuito e perfis das lendas).
// Os números do jogo (voltas, perfil da pista, atributos) vêm dos dados do
// motor; aqui fica só o texto escrito à mão.

export interface TrackCopy {
  slug: string;
  /** Nome completo do circuito. */
  official: string;
  /** Como as pessoas buscam o GP (ex.: "GP do Brasil (Interlagos)"). */
  gp: string;
  history: string[];
  tips: string[];
}

export const TRACK_COPY: Record<string, TrackCopy> = {
  interlagos: {
    slug: 'interlagos',
    official: 'Autódromo José Carlos Pace (Interlagos), São Paulo',
    gp: 'GP do Brasil (Interlagos)',
    history: [
      'Inaugurado em 1940 na zona sul de São Paulo, Interlagos é a casa do GP do Brasil e um dos circuitos mais queridos do calendário. O traçado corre no sentido anti-horário e começa com o famoso S do Senna, logo depois da reta de largada.',
      'A pista é curta, cheia de subidas e descidas, e o clima paulistano muda rápido: não é raro sair o sol no teste e cair uma tempestade na corrida. Títulos mundiais foram decididos aqui em finais dramáticas.',
    ],
    tips: [
      'Olhe a previsão com atenção: a chance de chuva em Interlagos é a maior do jogo. Na classificação, você trava aerodinâmica e motor sem saber se a corrida será seca.',
      'O traçado é equilibrado entre retas e curvas. Uma asa média costuma ser o meio-termo mais seguro.',
      'No jogo, a corrida acontece no entardecer, às 17h locais. A pista esfria e o calor fica menos provável.',
    ],
  },
  monaco: {
    slug: 'monaco',
    official: 'Circuit de Monaco, Monte Carlo',
    gp: 'GP de Mônaco',
    history: [
      'Disputado nas ruas de Monte Carlo desde 1929 e parte da Fórmula 1 desde o primeiro campeonato, em 1950, o GP de Mônaco é a corrida mais glamorosa do calendário. Muros, túnel, o grampo do antigo Hotel Loews e quase nenhum espaço para ultrapassar.',
      'Ayrton Senna venceu seis vezes em Mônaco, recorde da prova. É a pista em que o piloto mais faz diferença e o erro custa mais caro.',
    ],
    tips: [
      'Setenta por cento da volta são curvas lentas: use o máximo de pressão aerodinâmica que o orçamento permitir. Potência de motor quase não aparece no tempo de volta.',
      'Ultrapassar é quase impossível no jogo (dificuldade 95%). A classificação decide a corrida, então invista no pneu mais macio para a volta rápida.',
      'O desgaste de pneus é baixo: dá para fazer a corrida com pouquíssimas paradas.',
    ],
  },
  monza: {
    slug: 'monza',
    official: 'Autodromo Nazionale di Monza, Itália',
    gp: 'GP da Itália (Monza)',
    history: [
      'Construído em 1922 no parque real de Monza, perto de Milão, é o Templo da Velocidade: longas retas, chicanes e a curva Parabolica. Recebe a Fórmula 1 em quase todas as temporadas desde 1950 e é a casa da torcida da Ferrari, os tifosi.',
      'É o circuito mais rápido do calendário. As equipes levam asas especiais, bem finas, só para esta prova.',
    ],
    tips: [
      'Setenta por cento da volta são retas: motor forte e asa de baixo arrasto (a Asa Monza, A1) valem muito mais que pressão nas curvas.',
      'Cuidado com o calor: motores potentes com pouca tolerância a temperatura quebram mais em dias quentes.',
      'A dificuldade de ultrapassagem é baixa. Uma boa estratégia de pneus recupera posições perdidas na classificação.',
    ],
  },
  spa: {
    slug: 'spa-francorchamps',
    official: 'Circuit de Spa-Francorchamps, Bélgica',
    gp: 'GP da Bélgica (Spa)',
    history: [
      'Nas florestas das Ardenas, Spa-Francorchamps tem cerca de 7 km, o traçado mais longo da Fórmula 1 atual. É famoso pela sequência Eau Rouge e Raidillon, uma subida em alta velocidade que desafia a coragem dos pilotos.',
      'O clima é imprevisível: pode chover num trecho da pista e fazer sol em outro. Muitos campeões chamam Spa de a melhor pista do mundo.',
    ],
    tips: [
      'Metade da volta é reta, mas as curvas rápidas também pesam. É um meio-termo difícil: asas eficientes (muita pressão com pouco arrasto) brilham aqui.',
      'A chance de chuva é alta. Leve em conta pneus intermediários ou de chuva na sua estratégia.',
      'Como a volta é longa, a corrida tem poucas voltas no jogo, e cada parada nos boxes pesa proporcionalmente mais.',
    ],
  },
  silverstone: {
    slug: 'silverstone',
    official: 'Silverstone Circuit, Inglaterra',
    gp: 'GP da Inglaterra (Silverstone)',
    history: [
      'Antiga base aérea da Segunda Guerra Mundial, Silverstone recebeu a primeira corrida da história do Campeonato Mundial de Fórmula 1, em 13 de maio de 1950. É a casa do GP da Inglaterra e de boa parte das equipes, sediadas no Reino Unido.',
      'Curvas de altíssima velocidade como Copse, Maggotts, Becketts e Chapel fazem de Silverstone um teste de aerodinâmica.',
    ],
    tips: [
      'Metade da volta é curva rápida: pressão aerodinâmica é o que mais conta.',
      'O vento é frequente em Silverstone, e asas muito sensíveis ao vento (como o Efeito Solo) ficam instáveis. Confira a previsão antes de escolher.',
      'O desgaste de pneus é alto: planeje ao menos uma parada.',
    ],
  },
  suzuka: {
    slug: 'suzuka',
    official: 'Suzuka International Racing Course, Japão',
    gp: 'GP do Japão (Suzuka)',
    history: [
      'Suzuka é o único circuito em formato de oito da Fórmula 1: o traçado passa por cima de si mesmo num viaduto. Foi construído pela Honda como pista de testes e virou palco de decisões de título históricas, como as disputas entre Senna e Prost em 1989 e 1990.',
      'Os Esses do primeiro setor e a curva 130R estão entre os trechos mais técnicos do mundo.',
    ],
    tips: [
      'Os Esses técnicos gastam pneu: o desgaste em Suzuka é um dos maiores do jogo. Pneus duráveis ou duas paradas são o caminho.',
      'Curvas rápidas representam quase metade da volta. Aposte em pressão aerodinâmica.',
      'Ultrapassar é difícil: não negligencie a classificação.',
    ],
  },
  hungaroring: {
    slug: 'hungaroring',
    official: 'Hungaroring, Budapeste',
    gp: 'GP da Hungria (Hungaroring)',
    history: [
      'Em 1986, o Hungaroring recebeu o primeiro GP de Fórmula 1 atrás da Cortina de Ferro. Nelson Piquet venceu aquela primeira corrida, com uma ultrapassagem por fora sobre Ayrton Senna que virou lenda.',
      'É uma pista travada, estreita e quente, muitas vezes comparada a um Mônaco sem muros.',
    ],
    tips: [
      'Mais da metade da volta é curva lenta: asa alta e aderência mecânica.',
      'O verão húngaro é quente, com a maior chance de calor do jogo. Pneus que superaquecem e motores sensíveis ao calor sofrem.',
      'Ultrapassar é muito difícil: a posição de largada vale ouro.',
    ],
  },
  montreal: {
    slug: 'montreal',
    official: 'Circuit Gilles Villeneuve, Montreal',
    gp: 'GP do Canadá (Montreal)',
    history: [
      'Na ilha de Notre-Dame, em Montreal, o circuito leva o nome de Gilles Villeneuve, ídolo canadense da Ferrari. Longas retas terminam em freadas fortes e chicanes, e o Muro dos Campeões, na última chicane, já pegou vários campeões mundiais.',
      'Com muros próximos e freadas bruscas, o safety car aparece com frequência.',
    ],
    tips: [
      'Sessenta por cento da volta são retas: motor e asa de baixo arrasto.',
      'O safety car é muito provável no jogo. Uma estratégia flexível aproveita a parada mais barata sob bandeira amarela.',
      'O desgaste de pneus é baixo: uma estratégia de uma parada com compostos mais macios pode compensar.',
    ],
  },
  mexico: {
    slug: 'cidade-do-mexico',
    official: 'Autódromo Hermanos Rodríguez, Cidade do México',
    gp: 'GP do México',
    history: [
      'A cerca de 2.240 metros de altitude, o Autódromo Hermanos Rodríguez é o circuito mais alto do calendário. O ar rarefeito reduz a potência dos motores e a pressão aerodinâmica.',
      'O trecho final passa por dentro de um estádio de beisebol, o Foro Sol, com arquibancadas lotadas.',
    ],
    tips: [
      'A altitude rouba potência dos motores aspirados. Motores turbo (Turbo Baixa Pressão, Turbo Alta Pressão e o Híbrido V6) perdem muito menos.',
      'A reta principal é longa: velocidade de reta importa muito.',
      'O ar rarefeito também tira pressão das asas, então asa alta rende menos do que parece.',
    ],
  },
  baku: {
    slug: 'baku',
    official: 'Baku City Circuit, Azerbaijão',
    gp: 'GP do Azerbaijão (Baku)',
    history: [
      'Circuito de rua em volta da cidade velha de Baku, capital do Azerbaijão. Combina uma das retas mais longas da Fórmula 1, com mais de 2 km, com o trecho do castelo, tão estreito que mal cabem dois carros.',
      'Muros por todo lado fazem de Baku uma das corridas com mais safety cars e reviravoltas.',
    ],
    tips: [
      'O dilema mais difícil do jogo: reta enorme pede asa baixa; o castelo travado pede asa alta. Teste as duas opções na sessão de teste.',
      'No jogo, Baku é uma corrida noturna (fictícia, como os GPs de rua de Singapura e Jidá). À noite a pista esfria, e o calor fica bem menos provável.',
      'O vento é frequente perto do Mar Cáspio: asas sensíveis ao vento ficam instáveis.',
    ],
  },
};

export interface DriverCopy {
  slug: string;
  bio: string[];
  car: string;
}

export const DRIVER_COPY: Record<string, DriverCopy> = {
  'maserati-250f': {
    slug: 'juan-manuel-fangio',
    bio: [
      'Juan Manuel Fangio, o "Chueco", foi cinco vezes campeão mundial de Fórmula 1 (1951, 1954, 1955, 1956 e 1957), por quatro equipes diferentes. Durante décadas foi o recordista de títulos, e ainda hoje tem a maior taxa de vitórias da história da categoria.',
      'O título de 1957 veio com a Maserati 250F, incluindo a lendária vitória no GP da Alemanha, em Nürburgring, quando tirou quase 50 segundos de desvantagem e bateu o recorde da pista volta após volta.',
    ],
    car: 'A Maserati 250F é um dos carros mais bonitos dos anos 50: motor dianteiro, formato de charuto e pintura vermelha italiana. No jogo, é forte em curvas lentas e muito consistente.',
  },
  'lotus-49': {
    slug: 'jim-clark',
    bio: [
      'O escocês Jim Clark foi bicampeão mundial (1963 e 1965) com a Lotus e é lembrado como um dos pilotos mais naturalmente rápidos de todos os tempos. Em 1965 também venceu as 500 Milhas de Indianápolis.',
      'Clark venceu a estreia da Lotus 49 no GP da Holanda de 1967, em Zandvoort.',
    ],
    car: 'A Lotus 49 estreou o motor Ford-Cosworth DFV, que dominaria a Fórmula 1 por mais de uma década. No jogo, o chassi é forte nas retas, com um pouco menos de confiabilidade.',
  },
  'lotus-72d': {
    slug: 'emerson-fittipaldi',
    bio: [
      'Emerson Fittipaldi foi o primeiro brasileiro campeão mundial de Fórmula 1, em 1972, com a Lotus, e voltou a ser campeão em 1974, pela McLaren. Abriu o caminho para gerações de pilotos brasileiros e depois ainda brilhou na Indy, com duas vitórias nas 500 Milhas de Indianápolis.',
      'Em 1972 tornou-se, aos 25 anos, o campeão mais jovem da história até então.',
    ],
    car: 'A Lotus 72, na versão 72D com a icônica pintura preta e dourada, trouxe radiadores laterais e um desenho em cunha que influenciou uma geração de carros. No jogo, é o chassi mais equilibrado.',
  },
  'ferrari-312t': {
    slug: 'niki-lauda',
    bio: [
      'O austríaco Niki Lauda foi tricampeão mundial (1975, 1977 e 1984). Após o grave acidente em Nürburgring em 1976, voltou a correr semanas depois e perdeu aquele título por apenas um ponto, numa das histórias mais marcantes do esporte.',
      'Conhecido pela precisão e pelo acerto técnico dos carros, era chamado de "o computador".',
    ],
    car: 'A Ferrari 312T, de 1975, tinha câmbio transversal (daí o T) e o motor flat-12. Deu a Lauda seu primeiro título. No jogo, é o carro mais confiável do grid.',
  },
  'brabham-bt49': {
    slug: 'nelson-piquet',
    bio: [
      'Nelson Piquet foi tricampeão mundial (1981, 1983 e 1987), os dois primeiros títulos pela Brabham e o terceiro pela Williams. Era famoso pela inteligência técnica e pela habilidade de poupar o equipamento.',
      'Venceu o primeiro GP da Hungria, em 1986, com uma ultrapassagem histórica sobre Ayrton Senna.',
    ],
    car: 'A Brabham BT49, projetada por Gordon Murray, levou Piquet ao título de 1981. No jogo, é a que menos gasta pneus, e Piquet é o melhor em economizar borracha.',
  },
  'mclaren-mp4-4': {
    slug: 'ayrton-senna',
    bio: [
      'Ayrton Senna foi tricampeão mundial (1988, 1990 e 1991) pela McLaren e é considerado por muitos o maior piloto de todos os tempos. Somou 41 vitórias e 65 pole positions, e é o recordista de vitórias em Mônaco, com seis.',
      'Era imbatível na chuva e nas voltas de classificação, como na lendária primeira volta de Donington em 1993.',
    ],
    car: 'A McLaren MP4/4 venceu 15 das 16 corridas de 1988, com Senna e Alain Prost. No jogo, Senna tem os melhores atributos de chuva e de classificação do grid.',
  },
  'williams-fw14b': {
    slug: 'nigel-mansell',
    bio: [
      'O inglês Nigel Mansell foi campeão mundial em 1992, com a Williams, vencendo 9 das 16 corridas daquele ano. Guerreiro dentro da pista, ficou famoso pelo estilo agressivo e pelas largadas explosivas.',
      'No ano seguinte, foi campeão da Fórmula Indy logo na temporada de estreia.',
    ],
    car: 'A Williams FW14B, com suspensão ativa eletrônica, é um dos carros mais avançados da história. No jogo, é imbatível em curvas rápidas, e Mansell tem a melhor largada do grid.',
  },
  'ferrari-f2004': {
    slug: 'michael-schumacher',
    bio: [
      'O alemão Michael Schumacher foi heptacampeão mundial (1994, 1995 e cinco títulos seguidos pela Ferrari, de 2000 a 2004), com 91 vitórias. Levou a Ferrari de volta ao topo depois de mais de duas décadas sem título de pilotos.',
      'Era conhecido pela preparação física, pelo ritmo de corrida e pela capacidade de fazer voltas de classificação em pleno stint.',
    ],
    car: 'A Ferrari F2004 venceu 15 das 18 corridas de 2004 e é um dos carros mais dominantes da história. No jogo, é um chassi neutro e Schumacher tem um dos melhores ritmos de corrida.',
  },
  'redbull-rb9': {
    slug: 'sebastian-vettel',
    bio: [
      'O alemão Sebastian Vettel foi tetracampeão mundial consecutivo (2010 a 2013) pela Red Bull. Em 2013 venceu 13 corridas, 9 delas em sequência.',
      'Foi também o campeão mais jovem da história da Fórmula 1, com 23 anos em 2010.',
    ],
    car: 'O Red Bull RB9, projetado por Adrian Newey, explorava o difusor soprado pelos gases de escape. No jogo, é fortíssimo em curvas rápidas e mais lento nas retas.',
  },
  'mercedes-w11': {
    slug: 'lewis-hamilton',
    bio: [
      'O inglês Lewis Hamilton é heptacampeão mundial (2008 e seis títulos pela Mercedes, entre 2014 e 2020) e recordista de vitórias e de pole positions na Fórmula 1.',
      'Com o W11, em 2020, igualou os sete títulos de Michael Schumacher.',
    ],
    car: 'O Mercedes W11, de 2020, com motor híbrido V6 turbo, é considerado um dos carros mais rápidos da história. No jogo, tem a melhor velocidade de reta.',
  },
};
