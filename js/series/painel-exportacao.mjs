// Exporta exatamente a página recebida e renderizada, sem fazer uma nova consulta.
import { TIPOS } from './modelo.mjs';

export const FONTE_PAINEL = 'Indicadores publicados pelo Observa SP (API /series)';

export function fixarPainel(resposta, filtros, pagina = 1, capturadoEm = new Date().toISOString()) {
  const dados = resposta?.dados;
  if (!Array.isArray(dados) || !dados.every(p => typeof p.versao_conjunto === 'string' && p.versao_conjunto.trim())) {
    throw new Error('A versão dos resultados exibidos está indisponível. Consulte o painel novamente.');
  }
  const versaoDados = resposta.versao_dados;
  if (versaoDados != null && (typeof versaoDados !== 'string' || !versaoDados.trim())) {
    throw new Error('A versão dos resultados exibidos está inválida. Consulte o painel novamente.');
  }
  return structuredClone({ resposta, filtros, pagina, capturadoEm, versaoDados: versaoDados || null,
    versoesConjunto: [...new Set(dados.map(p => p.versao_conjunto))] });
}

const celula = valor => `"${String(valor ?? '').replace(/"/g, '""')}"`;
const numero = valor => valor == null ? '' : String(valor);

export function csvDoPainel(snapshot) {
  if (!snapshot?.versoesConjunto?.length || !snapshot.resposta?.dados?.length) {
    throw new Error('Não há resultados versionados visíveis para exportar.');
  }
  const { filtros, resposta, pagina, capturadoEm, versaoDados } = snapshot;
  const cabecalho = ['id', 'linha', 'sentido', 'indicador', 'parada', 'inicio', 'fim', 'valor', 'unidade', 'status',
    'excesso_valor', 'excesso_unidade', 'versao_conjunto', 'versao_dados', 'versao_gtfs_id', 'versao_calculo',
    'pagina', 'filtro_inicio', 'filtro_fim', 'filtro_hora_inicio', 'filtro_hora_fim', 'data_exibicao', 'fonte'];
  const linhas = resposta.dados.map(p => [p.id, p.linha, p.sentido, p.tipo, p.parada, p.inicio, p.fim,
    numero(p.valor), p.unidade, p.status, numero(p.excesso?.valor), p.excesso?.unidade, p.versao_conjunto,
    versaoDados, p.versao_gtfs_id, p.versao_calculo, pagina, filtros.inicio, filtros.fim,
    filtros.hora_inicio, filtros.hora_fim, capturadoEm,
    p.qualidade?.origem === 'SINTETICA' ? `${FONTE_PAINEL}; cenário sintético` : FONTE_PAINEL]);
  return `\uFEFF${[cabecalho, ...linhas].map(linha => linha.map(celula).join(';')).join('\r\n')}\r\n`;
}

export function metadadosDoPainel(snapshot, titulo, legenda) {
  if (!snapshot?.versoesConjunto?.length) throw new Error('A versão do gráfico está indisponível.');
  const { filtros, pagina, capturadoEm, versaoDados, versoesConjunto } = snapshot;
  return {
    titulo,
    filtros: `Linha ${filtros.linha} · sentido ${filtros.sentido === '0' ? 'ida' : 'volta'} · ${TIPOS[filtros.tipo] ?? filtros.tipo}${filtros.parada ? ` · parada ${filtros.parada}` : ''} · ${filtros.inicio || 'início'} a ${filtros.fim || 'último resultado'}${filtros.hora_inicio ? ` · ${filtros.hora_inicio}–${filtros.hora_fim}` : ''} · página ${pagina}`,
    versao: versaoDados ? `Versão dos dados: ${versaoDados}` : `Conjuntos exibidos: ${versoesConjunto.join(', ')}`,
    data: `Exibido em: ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(capturadoEm))} (São Paulo)`,
    fonte: snapshot.resposta.dados.some(p => p.qualidade?.origem === 'SINTETICA')
      ? `${FONTE_PAINEL}; cenário sintético` : FONTE_PAINEL,
    legenda,
  };
}
