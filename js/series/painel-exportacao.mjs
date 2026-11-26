// US25: fixa a resposta exibida (filtros, página, horário e `versao_dados`) antes de renderizar.
// O CSV é gerado pelo backend a partir da versão fixada (US25-T01); a imagem vem do gráfico já
// desenhado (o diagrama de componentes atribui a captura de imagem ao Frontend).
import { TIPOS, dataHora, parametrosApi } from './modelo.mjs';
import { ESPERA } from './espera.mjs';

export const FONTE_PAINEL = 'Indicadores publicados pelo Observa SP (API /series)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_VERSAO = { ATUALIZACAO_INDICADORES: 'atualização de 15 min', CONSOLIDACAO_DIA: 'consolidação do dia' };

// `versao_dados` (US25-T01) é um objeto {id, tipo, publicada_em, ...} ou null. Uma versão ausente
// ou malformada não impede a leitura do painel: só bloqueia a exportação por versão.
function lerVersao(valor) {
  if (valor === null || valor === undefined) return { versao: null, erro: 'A API não informou a versão publicada destes dados; a exportação não teria como garantir os mesmos valores.' };
  if (typeof valor !== 'object' || typeof valor.id !== 'string' || !UUID.test(valor.id)) {
    return { versao: null, erro: 'A versão dos dados recebida da API é inválida. Consulte o painel novamente.' };
  }
  return { versao: valor, erro: null };
}

export function fixarPainel(resposta, filtros, pagina = 1, capturadoEm = new Date().toISOString()) {
  const dados = resposta?.dados;
  if (!Array.isArray(dados) || !dados.every(p => typeof p.versao_conjunto === 'string' && p.versao_conjunto.trim())) {
    throw new Error('A versão dos resultados exibidos está indisponível. Consulte o painel novamente.');
  }
  const { versao, erro } = lerVersao(resposta.versao_dados);
  return structuredClone({ resposta, filtros, pagina, capturadoEm, versaoDados: versao, erroVersao: erro,
    versoesConjunto: [...new Set(dados.map(p => p.versao_conjunto))] });
}

export function textoVersao(versao) {
  if (!versao) return 'Versão dos dados não informada pela API';
  const detalhes = [TIPOS_VERSAO[versao.tipo] ?? versao.tipo,
    versao.publicada_em && `publicada em ${dataHora(versao.publicada_em)}`].filter(Boolean);
  return `Versão dos dados: ${versao.id}${detalhes.length ? ` (${detalhes.join(', ')})` : ''}`;
}

// Mesmos filtros enviados a /series, com o período efetivo da resposta e a versão fixada.
export function parametrosExportacao(snapshot) {
  if (!snapshot?.versaoDados) throw new Error(snapshot?.erroVersao ?? 'Não há versão de dados para exportar.');
  const { inicio, fim } = snapshot.resposta.consulta ?? {};
  if (!inicio || !fim || !snapshot.resposta.dados.length) throw new Error('Não há resultados publicados neste recorte para exportar.');
  const args = parametrosApi(snapshot.filtros, 1);
  args.delete('page'); args.delete('page_size');
  // A espera é exibida com o excesso (US18); no download os dois saem pelo tipo público ESPERA.
  if (snapshot.filtros.tipo === ESPERA) args.set('tipo', 'ESPERA');
  args.set('inicio', inicio); args.set('fim', fim);
  args.set('formato', 'csv'); args.set('versao_dados', snapshot.versaoDados.id);
  return args;
}

// Total da seleção informado por /series (todas as páginas); a espera traz também o excesso.
export const registrosEsperados = snapshot => snapshot.resposta.paginacao.total * (snapshot.filtros.tipo === ESPERA ? 2 : 1);

export function metadadosDoPainel(snapshot, titulo, legenda) {
  if (!snapshot?.versoesConjunto?.length) throw new Error('A versão do gráfico está indisponível.');
  const { filtros, pagina, capturadoEm, versaoDados, versoesConjunto } = snapshot;
  return {
    titulo,
    filtros: `Linha ${filtros.linha} · sentido ${filtros.sentido === '0' ? 'ida' : 'volta'} · ${TIPOS[filtros.tipo] ?? filtros.tipo}${filtros.parada ? ` · parada ${filtros.parada}` : ''} · ${filtros.inicio || 'início'} a ${filtros.fim || 'último resultado'}${filtros.hora_inicio ? ` · ${filtros.hora_inicio}–${filtros.hora_fim}` : ''} · página ${pagina}`,
    versao: versaoDados ? textoVersao(versaoDados) : `Conjuntos exibidos: ${versoesConjunto.join(', ')}`,
    data: `Exibido em: ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(capturadoEm))} (São Paulo)`,
    fonte: snapshot.resposta.dados.some(p => p.qualidade?.origem === 'SINTETICA')
      ? `${FONTE_PAINEL}; cenário sintético` : FONTE_PAINEL,
    legenda,
  };
}
