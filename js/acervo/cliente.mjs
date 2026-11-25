import { dataValida } from '../comum/formatacao.mjs';
import { urlDaApi } from '../comum/http.mjs';

const TIPOS = new Map([
  ['CONTRATO', 'Contrato'],
  ['INDICADOR_OFICIAL', 'Indicador oficial'],
]);

// O ano 0000 aparece em datas vazias de exportações e não é uma data do acervo.
const dataCivil = valor => dataValida(valor) && !valor.startsWith('0000') ? valor : null;

export function formatarDocumento(item) {
  const texto = (valor, padrao) => typeof valor === 'string' && valor.trim() ? valor.trim() : padrao;
  const data = dataCivil(item.data_documento);
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : null,
    titulo: texto(item.titulo, 'Título não informado'),
    tipo: TIPOS.get(item.tipo) ?? texto(item.tipo, 'Tipo não informado'),
    orgao: texto(item.orgao, 'Órgão não informado'),
    data: data ? data.split('-').reverse().join('/') : 'Data não informada',
  };
}

const documentosUrl = (base, sufixo = '') => urlDaApi('api/documentos' + sufixo, base);

export async function buscarDocumentos(base, filtros, pagina = 1, { fetchImpl = fetch, signal } = {}) {
  const { tipo, data_inicio: inicio, data_fim: fim } = filtros;
  if ((inicio && !dataCivil(inicio)) || (fim && !dataCivil(fim))) {
    throw new Error('Informe datas válidas.');
  }
  if (inicio && fim && inicio > fim) {
    throw new Error('A data final deve ser igual ou posterior à inicial.');
  }
  const url = documentosUrl(base);
  if (tipo) url.searchParams.set('tipo', tipo);
  if (inicio) url.searchParams.set('data_inicio', inicio);
  if (fim) url.searchParams.set('data_fim', fim);
  url.searchParams.set('pagina', String(pagina));
  const resposta = await fetchImpl(url, { credentials: 'omit', signal });
  if (resposta.status === 400) throw new Error('Confira os filtros da busca.');
  if (!resposta.ok) throw new Error('O acervo está indisponível. Tente novamente.');
  const dados = await resposta.json();
  if (!Array.isArray(dados?.itens) || !dados.paginacao ||
      !['pagina', 'total', 'paginas'].every(k => Number.isSafeInteger(dados.paginacao[k]) && dados.paginacao[k] >= 0)) {
    throw new Error('O acervo retornou uma resposta incompleta.');
  }
  return { itens: dados.itens.map(item => formatarDocumento(item ?? {})), paginacao: dados.paginacao };
}

export async function obterPdf(base, id, { fetchImpl = fetch, signal } = {}) {
  // O endpoint é sempre construído a partir do ID, nunca de uma URL de metadados.
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Identificador do documento indisponível.');
  }
  const resposta = await fetchImpl(documentosUrl(base, '/' + encodeURIComponent(id) + '/arquivo'), {
    credentials: 'omit', signal,
  });
  const tipo = resposta.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!resposta.ok || tipo !== 'application/pdf') {
    throw new Error('O PDF original está indisponível.');
  }
  const pdf = await resposta.blob();
  if (!pdf.size) throw new Error('O PDF original está indisponível.');
  return pdf;
}
