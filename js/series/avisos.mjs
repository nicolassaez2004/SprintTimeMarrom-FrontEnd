// US26: apresenta `qualidade_coleta` exatamente como publicada pela API (US26-T01/T02).
// O navegador não recalcula percentuais nem aplica limite: `incompleto` decide o aviso.
import { numeroPublicado } from './modelo.mjs';

const dataHora = valor => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(valor));

// Rótulos dos códigos de `motivo` do contrato QualidadeColeta (o código continua visível).
const MOTIVOS = Object.freeze({
  FALHAS_ACIMA_DO_LIMITE: 'falhas de coleta acima do limite',
  NENHUM_CICLO_COM_DADOS: 'nenhum ciclo de coleta com dados',
  FORA_DO_MONITORAMENTO: 'fora do período monitorado',
  JANELA_FUTURA: 'janela ainda não encerrada',
  JANELA_FORA_DA_GRADE_15MIN: 'janela fora da grade de 15 min',
  DENOMINADOR_ZERO: 'nenhum ciclo de coleta esperado',
  MULTIPLOS_MOTIVOS: 'mais de um motivo',
  PUBLICADO_SEM_QUALIDADE_DE_COLETA: 'publicado sem registro da qualidade da coleta',
  PERIODO_DIVERGENTE: 'período divergente',
  SEM_PERIODO_ASSOCIADO: 'sem período associado',
});

/** 'incompleta' | 'avaliada' | 'indeterminada' | 'nao_informada', conforme `incompleto` da API. */
export function estadoQualidade(q) {
  if (q === null || typeof q !== 'object') return 'nao_informada';
  if (q.incompleto === true) return 'incompleta';
  return q.incompleto === false ? 'avaliada' : 'indeterminada';
}

export function motivoQualidade(q) {
  const motivo = q?.motivo ? `${MOTIVOS[q.motivo] ?? q.motivo} (${q.motivo})` : 'motivo não informado pela API';
  const causas = Array.isArray(q?.causas) && q.causas.length ? `; causas: ${q.causas.join(', ')}` : '';
  return `${motivo}${causas}`;
}

export const percentualFalhas = q => (Number.isFinite(q?.percentual_falhas)
  ? `${numeroPublicado(q.percentual_falhas, 2)}% de falhas` : 'percentual de falhas não informado');

export function avisosQualidade(pontos) {
  return pontos.filter(ponto => estadoQualidade(ponto.qualidade_coleta) === 'incompleta')
    .map(ponto => ({
      inicio: ponto.inicio,
      fim: ponto.fim,
      percentual: percentualFalhas(ponto.qualidade_coleta),
      motivo: motivoQualidade(ponto.qualidade_coleta),
      texto: `${dataHora(ponto.inicio)} · ${percentualFalhas(ponto.qualidade_coleta)} · ${motivoQualidade(ponto.qualidade_coleta)}`,
    }));
}

// Sem `incompleto` booleano a qualidade é desconhecida: nunca apresentar como 0% ou satisfatória.
export function textoIndeterminado(q) {
  return estadoQualidade(q) === 'nao_informada' ? 'qualidade da coleta não informada pela API'
    : `${q.situacao ?? 'situação não informada'} · ${motivoQualidade(q)}`;
}

/** Janelas sem qualidade determinada, agrupadas pelo mesmo motivo (um aviso por motivo). */
export function qualidadeIndeterminada(pontos) {
  const grupos = new Map();
  for (const ponto of pontos) {
    if (['incompleta', 'avaliada'].includes(estadoQualidade(ponto.qualidade_coleta))) continue;
    const chave = textoIndeterminado(ponto.qualidade_coleta);
    grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
  }
  return [...grupos].map(([motivo, quantidade]) => ({ quantidade, motivo,
    texto: `${quantidade} ${quantidade === 1 ? 'janela' : 'janelas'} sem qualidade da coleta determinada (não é 0% de falhas): ${motivo}` }));
}
