// Tipos centrais do motor de simulação. Este módulo (src/engine) não usa DOM,
// para poder rodar também no servidor na fase multiplayer.

export type Era = 'classic' | 'wing' | 'modern';

export interface Livery {
  primary: string;
  secondary: string;
  accent: string;
}

export interface HelmetDesign {
  base: string;
  stripe1: string;
  stripe2: string;
  visor: string;
}

/** Atributos de 0 a 100. */
export interface DriverSkills {
  pace: number;
  qualifying: number;
  wet: number;
  tyres: number;
  consistency: number;
  start: number;
}

export interface Driver {
  name: string;
  shortName: string;
  country: string;
  helmet: HelmetDesign;
  skills: DriverSkills;
}

/** Pequenos bônus/ônus do chassi. Soma próxima de zero para manter equilíbrio. */
export interface ChassisTraits {
  straight: number;
  slow: number;
  fast: number;
  /** Multiplicador de desgaste de pneu (1 = neutro). */
  tyreWear: number;
  /** Multiplicador da chance de quebra (1 = neutro). */
  reliability: number;
}

export interface Team {
  id: string;
  car: string;
  year: number;
  era: Era;
  number: number;
  livery: Livery;
  driver: Driver;
  chassis: ChassisTraits;
  strength: string;
}

export interface TrackProfile {
  /** Frações do tempo de volta; somam 1. */
  straights: number;
  slowCorners: number;
  fastCorners: number;
}

export interface Track {
  id: string;
  name: string;
  country: string;
  flag: string;
  profile: TrackProfile;
  /** Tempo de volta de referência em segundos. */
  baseLap: number;
  laps: number;
  /** Multiplicador de desgaste de pneu. */
  tyreWear: number;
  /** 0 = nível do mar, 1 = muito alto (Cidade do México). */
  altitude: number;
  rainChance: number;
  hotChance: number;
  windChance: number;
  /** 0 = fácil ultrapassar, 1 = quase impossível. */
  overtaking: number;
  /** Tempo perdido na entrada/saída dos boxes (s). */
  pitLoss: number;
  safetyCarChance: number;
  shape: [number, number][];
  demand: string;
}

export interface AeroPart {
  id: string;
  name: string;
  downforce: number;
  drag: number;
  windSensitivity: number;
  price: number;
  description: string;
}

export interface EnginePart {
  id: string;
  name: string;
  power: number;
  reliability: number;
  consumption: number;
  heatTolerance: number;
  altitudeLoss: number;
  /** Vida útil em corridas (temporada). Depois disso quebra muito mais. */
  life: number;
  price: number;
  description: string;
}

export type TyreKind = 'seco' | 'inter' | 'chuva';

export interface TyrePart {
  id: string;
  name: string;
  kind: TyreKind;
  /** Aderência no seco. */
  grip: number;
  /** Aderência em chuva leve / forte. */
  wetGrip: { light: number; heavy: number };
  /** Desgaste no seco / no molhado. */
  wear: { dry: number; wet: number };
  /** Multiplicador de aderência no frio / calor. */
  cold: number;
  hot: number;
  price: number;
  description: string;
}

/** 0 = sem chuva, 1 = chuva leve, 2 = chuva forte. */
export type RainLevel = 0 | 1 | 2;

export interface Weather {
  rain: RainLevel;
  hot: boolean;
  windy: boolean;
  temperature: number;
  windSpeed: number;
}

export type SessionId = 'teste' | 'classificacao' | 'corrida';
export const SESSIONS: SessionId[] = ['teste', 'classificacao', 'corrida'];

export interface Forecast {
  session: SessionId;
  rainProb: number;
  heavyRainProb: number;
  hotProb: number;
  windProb: number;
  tempRange: [number, number];
  windRange: [number, number];
  /** 0..1 — quão confiável é esta previsão. */
  confidence: number;
}

export interface CarSetup {
  aero: string;
  engine: string;
  tyre: string;
}

export type DriveMode = 'poupar' | 'normal' | 'agressivo';

export interface RaceStrategy {
  /** Composto de cada stint; stints.length - 1 = número de paradas. */
  stints: string[];
  /** Volta ao fim da qual cada parada acontece (length = stints.length - 1). */
  pitLaps: number[];
  mode: DriveMode;
}

export interface Difficulty {
  id: 'facil' | 'normal' | 'dificil';
  label: string;
  candidates: number;
  /** Ruído de avaliação dos bots (quanto maior, pior eles decidem). */
  noise: number;
}
