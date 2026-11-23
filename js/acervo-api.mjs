const TIPOS = new Map([
  ['CONTRATO', 'Contrato'],
  ['INDICADOR_OFICIAL', 'Indicador oficial'],
]);

function dataCivil(valor) {
  if (typeof valor !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(valor) || valor.startsWith('0000')) return null;
  const data = new Date(valor + 'T00:00:00Z');
  if (!Number.isFinite(+data) || data.toISOString().slice(0, 10) !== valor) return null;
  return valor;
}

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

function documentosUrl(base, sufixo = '') {
  return new URL('api/documentos' + sufixo, base.endsWith('/') ? base : base + '/');
}

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
