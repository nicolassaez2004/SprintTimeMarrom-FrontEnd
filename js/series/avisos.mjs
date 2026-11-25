// Consome o estado calculado pela API. O navegador não recalcula a qualidade.
const dataHora = valor => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(valor));

export function avisosQualidade(pontos) {
  return pontos.filter(ponto => ponto.qualidade_coleta?.incompleto === true)
    .map(ponto => ({
      inicio: ponto.inicio,
      fim: ponto.fim,
      percentual: ponto.qualidade_coleta.percentual_falhas,
      motivo: ponto.qualidade_coleta.motivo || 'Causa não informada pela API',
      texto: `${dataHora(ponto.inicio)} · ${ponto.qualidade_coleta.percentual_falhas}% de falhas · ${ponto.qualidade_coleta.motivo || 'Causa não informada pela API'}`,
    }));
}
