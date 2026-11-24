// Preparação visual dos valores já calculados pela API, sem médias ou preenchimento.
export function prepararGraficos(resposta) {
  const grupos = new Map();
  for (const ponto of resposta.dados) {
    const chave = JSON.stringify([ponto.linha, ponto.sentido, ponto.tipo, ponto.unidade,
      ponto.versao_gtfs_id, ponto.versao_correspondencia, ponto.versao_calculo,
      ponto.qualidade.versao_reconstrucao ?? null]);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(ponto);
  }
  return [...grupos.values()].map(pontos => {
    pontos = [...pontos].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio)
      || Date.parse(a.fim) - Date.parse(b.fim) || a.id.localeCompare(b.id));
    let maiorFim = -Infinity, sobrepostas = false;
    for (const p of pontos) {
      if (Date.parse(p.inicio) < maiorFim) sobrepostas = true;
      maiorFim = Math.max(maiorFim, Date.parse(p.fim));
    }
    const segmentos = [];
    let atual = null;
    for (const p of pontos) {
      if (p.valor === null) { atual = null; continue; }
      const anterior = atual?.at(-1);
      if (!sobrepostas && anterior && Date.parse(anterior.fim) === Date.parse(p.inicio)) {
        atual.push(p);
      } else {
        atual = [p]; segmentos.push(atual);
      }
    }
    const numericos = pontos.filter(p => p.valor !== null);
    const primeiro = pontos[0];
    const ausencias = resposta.lacunas.filter(l => l.linha === primeiro.linha
      && l.sentido === primeiro.sentido && l.tipo === primeiro.tipo
      && (l.unidade === null || l.unidade === primeiro.unidade));
    const inicioPagina = Math.min(...pontos.map(p => Date.parse(p.inicio)));
    const fimPagina = Math.max(...pontos.map(p => Date.parse(p.fim)));
    const primeiraPagina = resposta.paginacao.page === 1;
    const ultimaPagina = resposta.paginacao.page * resposta.paginacao.page_size >= resposta.paginacao.total;
    return {
      referencia: primeiro, pontos, segmentos, numericos, ausencias, sobrepostas,
      inicio: primeiraPagina && resposta.consulta.inicio ? Math.min(inicioPagina, Date.parse(resposta.consulta.inicio)) : inicioPagina,
      fim: ultimaPagina && resposta.consulta.fim ? Math.max(fimPagina, Date.parse(resposta.consulta.fim)) : fimPagina,
      minimo: numericos.length ? Math.min(0, ...numericos.map(p => p.valor)) : null,
      maximo: numericos.length ? Math.max(primeiro.unidade === '%' ? 100 : 1, ...numericos.map(p => p.valor)) : null,
    };
  });
}

export function coordenadas(grupo, largura = 900) {
  const esquerda = 48, direita = largura - 18, topo = 24, base = 235;
  const x = instante => esquerda + (Date.parse(instante) - grupo.inicio)
    / Math.max(1, grupo.fim - grupo.inicio) * (direita - esquerda);
  const y = valor => base - (valor - grupo.minimo)
    / Math.max(1, grupo.maximo - grupo.minimo) * (base - topo);
  const caminhos = grupo.segmentos.map(segmento => segmento.map((p, indice) =>
    `${indice === 0 ? 'M' : 'L'} ${x(p.inicio)} ${y(p.valor)} L ${x(p.fim)} ${y(p.valor)}`,
  ).join(' '));
  return { x, y, caminhos, esquerda, direita, topo, base };
}
