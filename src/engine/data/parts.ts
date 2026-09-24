import type { AeroPart, EnginePart, TyrePart } from '../types';

// Preços em milhões ($M). Nenhuma peça é a melhor em tudo: as caras são mais
// eficientes, mas o orçamento do fim de semana não paga o "melhor de tudo".

export const AERO_PARTS: AeroPart[] = [
  { id: 'A1', name: 'Asa Monza', downforce: 0.2, drag: 0.1, windSensitivity: 0.2, price: 4, description: 'Mínimo arrasto. Voa nas retas, escorrega nas curvas.' },
  { id: 'A2', name: 'Baixa Pressão', downforce: 0.3, drag: 0.2, windSensitivity: 0.25, price: 6, description: 'Para pistas de alta velocidade.' },
  { id: 'A3', name: 'Asa Plana', downforce: 0.38, drag: 0.33, windSensitivity: 0.45, price: 3, description: 'Barata e ineficiente. Sofre com o vento.' },
  { id: 'A4', name: 'Média-Baixa', downforce: 0.45, drag: 0.35, windSensitivity: 0.3, price: 9, description: 'Pende para as retas sem abandonar as curvas.' },
  { id: 'A5', name: 'Asa Média', downforce: 0.55, drag: 0.45, windSensitivity: 0.35, price: 10, description: 'O meio-termo clássico.' },
  { id: 'A6', name: 'Efeito Solo', downforce: 0.62, drag: 0.4, windSensitivity: 0.6, price: 16, description: 'Muito eficiente, mas instável com vento.' },
  { id: 'A7', name: 'Média-Alta', downforce: 0.7, drag: 0.6, windSensitivity: 0.4, price: 12, description: 'Mais pressão para pistas mistas.' },
  { id: 'A8', name: 'Asa Dupla', downforce: 0.8, drag: 0.72, windSensitivity: 0.45, price: 14, description: 'Muita pressão, bastante arrasto.' },
  { id: 'A9', name: 'Difusor Soprado', downforce: 0.88, drag: 0.7, windSensitivity: 0.5, price: 22, description: 'A mais eficiente em pressão. Cara.' },
  { id: 'A10', name: 'Asa Máxima', downforce: 0.95, drag: 1.0, windSensitivity: 0.55, price: 18, description: 'Configuração de Mônaco. Lenta nas retas.' },
];

export const ENGINE_PARTS: EnginePart[] = [
  { id: 'M1', name: 'V8 Básico', power: 0.5, reliability: 0.98, consumption: 0.4, heatTolerance: 0.8, altitudeLoss: 0.3, price: 4, description: 'Fraco, mas quase não quebra.' },
  { id: 'M2', name: 'V8 Clássico', power: 0.58, reliability: 0.97, consumption: 0.45, heatTolerance: 0.8, altitudeLoss: 0.3, price: 6, description: 'Robusto e econômico.' },
  { id: 'M3', name: 'V12 Aspirado', power: 0.68, reliability: 0.9, consumption: 0.8, heatTolerance: 0.5, altitudeLoss: 0.3, price: 10, description: 'Potente e gastão. Sofre no calor.' },
  { id: 'M4', name: 'V10 Econômico', power: 0.66, reliability: 0.95, consumption: 0.45, heatTolerance: 0.7, altitudeLoss: 0.28, price: 11, description: 'Equilibrado, carrega pouco combustível.' },
  { id: 'M5', name: 'V10 Padrão', power: 0.74, reliability: 0.93, consumption: 0.55, heatTolerance: 0.7, altitudeLoss: 0.28, price: 13, description: 'A escolha segura.' },
  { id: 'M6', name: 'Turbo Baixa Pressão', power: 0.76, reliability: 0.9, consumption: 0.6, heatTolerance: 0.6, altitudeLoss: 0.1, price: 14, description: 'O turbo quase não perde força na altitude.' },
  { id: 'M7', name: 'V10 Corrida', power: 0.82, reliability: 0.88, consumption: 0.65, heatTolerance: 0.6, altitudeLoss: 0.28, price: 17, description: 'Forte, com risco moderado.' },
  { id: 'M8', name: 'Turbo Alta Pressão', power: 0.92, reliability: 0.78, consumption: 0.8, heatTolerance: 0.4, altitudeLoss: 0.08, price: 20, description: 'Um canhão de vidro: potência bruta, quebra fácil.' },
  { id: 'M9', name: 'Híbrido V6', power: 0.86, reliability: 0.91, consumption: 0.45, heatTolerance: 0.75, altitudeLoss: 0.12, price: 28, description: 'O mais completo. E o mais caro.' },
  { id: 'M10', name: 'V10 Qualificação', power: 1.0, reliability: 0.7, consumption: 0.85, heatTolerance: 0.35, altitudeLoss: 0.28, price: 24, description: 'Feito para uma volta. Numa corrida inteira, é roleta.' },
];

export const TYRE_PARTS: TyrePart[] = [
  { id: 'P1', name: 'Ultramacio', kind: 'seco', grip: 1.0, wetGrip: { light: 0.45, heavy: 0.3 }, wear: { dry: 2.2, wet: 2.0 }, cold: 1.0, hot: 0.88, price: 8, description: 'Aderência máxima por poucas voltas. Superaquece no calor.' },
  { id: 'P2', name: 'Supermacio', kind: 'seco', grip: 0.96, wetGrip: { light: 0.45, heavy: 0.3 }, wear: { dry: 1.7, wet: 1.6 }, cold: 0.99, hot: 0.92, price: 7, description: 'Muito rápido, dura pouco.' },
  { id: 'P3', name: 'Macio', kind: 'seco', grip: 0.92, wetGrip: { light: 0.45, heavy: 0.3 }, wear: { dry: 1.3, wet: 1.2 }, cold: 0.97, hot: 0.96, price: 6, description: 'Rápido e versátil.' },
  { id: 'P4', name: 'Médio', kind: 'seco', grip: 0.88, wetGrip: { light: 0.44, heavy: 0.29 }, wear: { dry: 1.0, wet: 1.0 }, cold: 0.94, hot: 0.99, price: 5, description: 'O equilíbrio entre ritmo e duração.' },
  { id: 'P5', name: 'Duro', kind: 'seco', grip: 0.84, wetGrip: { light: 0.42, heavy: 0.28 }, wear: { dry: 0.7, wet: 0.8 }, cold: 0.88, hot: 1.0, price: 4, description: 'Dura muito. Não aquece no frio.' },
  { id: 'P6', name: 'Extraduro', kind: 'seco', grip: 0.8, wetGrip: { light: 0.4, heavy: 0.27 }, wear: { dry: 0.5, wet: 0.6 }, cold: 0.82, hot: 1.0, price: 3, description: 'Corrida inteira sem parar, mas lento.' },
  { id: 'P7', name: 'Macio de Inverno', kind: 'seco', grip: 0.9, wetGrip: { light: 0.5, heavy: 0.32 }, wear: { dry: 1.3, wet: 1.2 }, cold: 1.04, hot: 0.82, price: 6, description: 'Feito para pista fria. No calor, derrete.' },
  { id: 'P8', name: 'Médio Premium', kind: 'seco', grip: 0.91, wetGrip: { light: 0.46, heavy: 0.3 }, wear: { dry: 1.15, wet: 1.1 }, cold: 0.96, hot: 1.0, price: 10, description: 'O melhor pneu de seco. Caro.' },
  { id: 'P9', name: 'Intermediário', kind: 'inter', grip: 0.74, wetGrip: { light: 0.8, heavy: 0.62 }, wear: { dry: 2.0, wet: 1.0 }, cold: 1.0, hot: 0.95, price: 5, description: 'Para chuva leve ou pista secando.' },
  { id: 'P10', name: 'Chuva Extrema', kind: 'chuva', grip: 0.62, wetGrip: { light: 0.76, heavy: 0.86 }, wear: { dry: 3.0, wet: 0.8 }, cold: 1.0, hot: 0.95, price: 6, description: 'Para chuva forte. No seco, destrói-se.' },
];

/** Orçamento por fim de semana no modo corrida rápida ($M). */
export const WEEKEND_BUDGET = 55;

export function getAero(id: string): AeroPart {
  const p = AERO_PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`Aerodinâmica desconhecida: ${id}`);
  return p;
}

export function getEngine(id: string): EnginePart {
  const p = ENGINE_PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`Motor desconhecido: ${id}`);
  return p;
}

export function getTyre(id: string): TyrePart {
  const p = TYRE_PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`Pneu desconhecido: ${id}`);
  return p;
}
