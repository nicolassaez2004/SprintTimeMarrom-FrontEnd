// US17-T03A-FE: regularidade dos intervalos (CV) como a API devolve, sem transformar ausência em zero.
export const REGULARIDADE = 'REGULARIDADE_INTERVALOS';

const MOTIVOS = Object.freeze({
  passagens_insuficientes: 'Menos de três passagens na janela',
  media_invalida: 'Média dos intervalos inválida',
  oferta_sem_frequencia: 'A linha não opera por frequência nesta data',
  lacuna_maxima_indefinida: 'Lacuna máxima de interpolação não configurada',
  sem_evidencia_gps: 'Passagem sem evidência GPS na parada',
  estimativa_nao_executada: 'Estimativa de passagens não executada',
  programacao_ausente: 'Programação da data ausente',
  programacao_ambigua: 'Programação da data ambígua',
});

/** Motivo legível; códigos de coleta (coleta_<situação>) e combinados também são explicados. */
export function motivoLegivel(codigo) {
  if (!codigo) return null;
  return codigo.split(/_(?=coleta_|sem_evidencia|estimativa_)/).map(parte => MOTIVOS[parte]
    ?? (parte.startsWith('coleta_') ? `Coleta não confiável (${parte.slice(7).replaceAll('_', ' ').toLowerCase()})` : parte))
    .join('; ');
}

/** Linha da tabela para um ponto de regularidade publicado. */
export function detalheRegularidade(item) {
  const q = item.qualidade ?? {};
  const intervalos = item.contagens?.numerador;
  const limite = new Intl.NumberFormat('pt-BR').format(q.limite_agrupamento ?? 0.5);
  return {
    agrupamento: q.agrupamento === true ? `Agrupamento: sim (CV acima de ${limite})`
      : q.agrupamento === false ? `Agrupamento: não (CV até ${limite})`
        : 'Agrupamento: não avaliado sem CV',
    motivo: item.valor === null ? `Motivo: ${motivoLegivel(q.motivo) ?? 'não informado pela API'}` : null,
    intervalos: intervalos === null || intervalos === undefined ? 'Intervalos: não considerados'
      : `Intervalos entre passagens: ${intervalos}`,
  };
}
