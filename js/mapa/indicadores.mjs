import { somarDias } from '../comum/formatacao.mjs';
import { meiaNoiteSP } from '../series/modelo.mjs';

// A situação e o percentual são fornecidos pelo servidor; este módulo apenas apresenta o aviso.
export function avisoQualidadeIndicador(qualidade) {
  if (!qualidade || typeof qualidade !== 'object') return 'Qualidade da coleta não informada pela API.';
  if (qualidade.incompleto === true) {
    const percentual = Number.isFinite(qualidade.percentual_falhas)
      ? `${qualidade.percentual_falhas}% de falhas` : 'falhas acima do limite';
    return `Dados incompletos: ${percentual}. Motivo: ${qualidade.motivo || 'não informado pela API'}.`;
  }
  if (qualidade.incompleto === null || qualidade.percentual_falhas === null) {
    return `Qualidade indisponível: ${qualidade.motivo || qualidade.situacao || 'motivo não informado pela API'}.`;
  }
  return null;
}

export function resumoQualidadeMapa(features) {
  const avisos = features.filter(f => f.properties?.qualidade_coleta?.incompleto === true);
  const indisponiveis = features.filter(f => f.properties?.qualidade_coleta?.incompleto === null);
  return { avisos: avisos.length, indisponiveis: indisponiveis.length };
}

export function periodoMapa(inicio, fim) {
  return { inicio: meiaNoiteSP(inicio), fim: meiaNoiteSP(somarDias(fim, 1)) };
}
