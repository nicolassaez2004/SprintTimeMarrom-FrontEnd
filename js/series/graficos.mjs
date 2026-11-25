import { prepararGraficos, coordenadas } from './grafico.mjs';
import { TIPOS, TITULOS_SERIE, contagensFormatadas, dataHora, valorFormatado } from './modelo.mjs';
import { escapar as h } from '../comum/formatacao.mjs';
import { avisosQualidade } from './avisos.mjs';

const numero = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v);
const dia = ms => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(ms);

export function figura(grupo, indice, largura) {
  const id = `grafico-${indice}`;
  const ref = grupo.referencia;
  const avisos = avisosQualidade(grupo.pontos);
  const cabecalho = `<div class="cabecalho-grafico"><div><p class="eyebrow">SÉRIE DESTA PÁGINA</p><h2 id="${id}-titulo">${h(TITULOS_SERIE[ref.tipo] ?? TIPOS[ref.tipo] ?? ref.tipo)}</h2></div><span class="unidade-grafico">Unidade: <strong>${h(ref.unidade)}</strong></span></div>`;
  const legenda = `<figcaption id="${id}-legenda">${grupo.numericos.length} ${grupo.numericos.length === 1 ? 'resultado numérico' : 'resultados numéricos'} · ${grupo.pontos.length - grupo.numericos.length} sem resultado. Horário de São Paulo. <strong>Zero é um resultado; intervalos sem dados não são preenchidos.</strong></figcaption>`;
  const versoes = `<details class="versoes-grafico"><summary>Versões desta série</summary><p>Rede GTFS: ${h(ref.versao_gtfs_id)}</p><p>Regra: ${h(ref.versao_calculo ?? 'Não informada')} · Correspondência: ${h(ref.versao_correspondencia ?? 'Não informada')} · Reconstrução: ${h(ref.qualidade.versao_reconstrucao ?? 'Não informada')}</p><p>Os conjuntos de cada janela estão na tabela de resultados.</p></details>`;
  if (!grupo.numericos.length) {
    const lista = avisos.length ? `<ul class="avisos-qualidade-grafico" aria-label="Janelas com dados incompletos">${avisos.map(a => `<li>${h(a.texto)}</li>`).join('')}</ul>` : '';
    const linhas = avisos.map((a, i) => `<text x="16" y="${24 + i * 22}">${h(a.texto)}</text>`).join('');
    const svg = avisos.length ? `<svg class="grafico-serie" viewBox="0 0 900 ${32 + avisos.length * 22}" role="img" aria-label="Avisos de qualidade da coleta">${linhas}</svg><button class="button secondary exportar-grafico" type="button">Baixar imagem SVG</button><p class="exportacao-grafico-status" role="status" aria-live="polite"></p>` : '';
    return `<figure class="panel figura-serie">${cabecalho}${svg}<div class="grafico-sem-valores" role="status"><strong>Nenhum valor numérico neste recorte</strong><p>Os resultados recebidos estão indisponíveis. A unidade é ${h(ref.unidade)}; não há valor zero implícito.</p></div>${lista}${legenda}${versoes}</figure>`;
  }
  const c = coordenadas(grupo, largura);
  const gradacoes = Array.from({ length: 5 }, (_, i) => grupo.minimo + i * (grupo.maximo - grupo.minimo) / 4);
  const rotulos = largura < 500 ? 2 : 4;
  const eixoX = Array.from({ length: rotulos }, (_, i) => {
    const ms = grupo.inicio + i * (grupo.fim - grupo.inicio) / (rotulos - 1);
    const rotulo = grupo.fim - grupo.inicio <= 86400000
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(ms)
      : dia(ms);
    return `<text x="${c.x(new Date(ms).toISOString())}" y="262" text-anchor="${i === 0 ? 'start' : i === rotulos - 1 ? 'end' : 'middle'}">${h(rotulo)}</text>`;
  }).join('');
  const ausencias = grupo.ausencias.map(a => {
    const x1 = Math.max(c.esquerda, c.x(a.inicio)), x2 = Math.min(c.direita, c.x(a.fim));
    const nulo = a.motivo === 'RESULTADO_NULO';
    return x2 > x1 ? `<rect class="faixa-ausencia${nulo ? ' resultado-nulo' : ''}" data-motivo="${h(a.motivo)}" x="${x1}" y="${c.topo}" width="${x2 - x1}" height="${c.base - c.topo}" fill="url(#${id}-${nulo ? 'nulo' : 'ausencia'})"><title>${h(dataHora(a.inicio))} a ${h(dataHora(a.fim))}: ${nulo ? 'resultado publicado sem valor (null)' : 'sem publicação'}</title></rect>` : '';
  }).join('');
  const alertasSvg = avisos.map((aviso, i) => `<text class="alerta-qualidade-svg" x="52" y="${298 + i * 20}">⚠ ${h(aviso.texto)}</text>`).join('');
  const altura = avisos.length ? 305 + avisos.length * 20 : 282;
  const pontos = grupo.numericos.map(p => {
    const aviso = p.qualidade_coleta?.incompleto === true;
    const rotulo = aviso ? ` Dados incompletos: ${p.qualidade_coleta.percentual_falhas}% de falhas. Motivo: ${p.qualidade_coleta.motivo || 'não informado pela API'}.` : '';
    const x = c.x(p.inicio), y = c.y(p.valor);
    return `<g class="ponto-serie${aviso ? ' ponto-incompleto' : ''}" tabindex="0" role="img" aria-label="${h(`${dataHora(p.inicio)}: ${valorFormatado(p.valor, p.unidade)}.${rotulo}`)}"><title>${h(`${dataHora(p.inicio)} a ${dataHora(p.fim)}: ${valorFormatado(p.valor, p.unidade)} · ${contagensFormatadas(p.contagens)} · conjunto ${p.versao_conjunto}${rotulo}`)}</title>${aviso ? `<path class="marcador-incompleto" d="M ${x} ${y - 12} l 6 10 h -12 Z"/>` : ''}<circle data-valor="${p.valor}" cx="${x}" cy="${y}" r="4.5"/></g>`;
  }).join('');
  const listaAvisos = avisos.length ? `<ul class="avisos-qualidade-grafico" aria-label="Janelas com dados incompletos">${avisos.map(a => `<li>${h(a.texto)}</li>`).join('')}</ul>` : '';
  return `<figure class="panel figura-serie">${cabecalho}<svg class="grafico-serie" viewBox="0 0 ${largura} ${altura}" role="img" aria-labelledby="${id}-titulo ${id}-legenda"><defs><pattern id="${id}-ausencia" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#d3d8d0" stroke-width="1"/></pattern><pattern id="${id}-nulo" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3 H6" stroke="#b9a08f" stroke-width="1"/></pattern></defs>${ausencias}${gradacoes.map(v => `<line class="grade-grafico" x1="${c.esquerda}" x2="${c.direita}" y1="${c.y(v)}" y2="${c.y(v)}"/><text x="${c.esquerda - 10}" y="${c.y(v) + 4}" text-anchor="end">${h(numero(v))}</text>`).join('')}${eixoX}${c.caminhos.map(d => `<path class="linha-serie" d="${d}"/>`).join('')}${pontos}${alertasSvg}</svg>${listaAvisos}<button class="button secondary exportar-grafico" type="button">Baixar imagem SVG</button><p class="exportacao-grafico-status" role="status" aria-live="polite"></p><div class="legenda-grafico"><span><i class="amostra-legenda"></i> Resultado publicado</span><span><i class="ausencia-legenda"></i> Sem publicação</span><span><i class="nulo-legenda"></i> Publicado sem valor (null)</span><span class="legenda-incompleto">⚠ Janela incompleta</span></div>${grupo.sobrepostas ? '<p class="aviso-versoes">Há janelas ou versões sobrepostas. Os resultados aparecem separados, sem criar uma média nem conectá-los.</p>' : ''}${legenda}${versoes}</figure>`;
}

// Produz um arquivo a partir do SVG já renderizado, sem reler a resposta da API.
export function criarArquivoSvg(svg, { documentRef = document, serializer = new XMLSerializer(), parser = new DOMParser() } = {}) {
  const copia = svg?.cloneNode(true);
  if (!copia) throw new Error('O gráfico não está disponível para exportação.');
  const estilo = documentRef.createElementNS('http://www.w3.org/2000/svg', 'style');
  estilo.textContent = '.alerta-qualidade-svg{fill:#785621;font:11px Arial,sans-serif}.marcador-incompleto{fill:#9b5a23;stroke:#fff;stroke-width:1}.ponto-incompleto circle{stroke:#9b5a23;stroke-width:2}';
  copia.insertBefore(estilo, copia.firstChild);
  const conteudo = serializer.serializeToString(copia);
  const validacao = parser.parseFromString(conteudo, 'image/svg+xml');
  if (!conteudo.trim() || validacao.documentElement.localName !== 'svg'
      || validacao.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg'
      || validacao.querySelector('parsererror')) throw new Error('A imagem gerada está inválida. Tente novamente.');
  const arquivo = new Blob([conteudo], { type: 'image/svg+xml;charset=utf-8' });
  if (!arquivo.size) throw new Error('A imagem gerada está vazia. Tente novamente.');
  return arquivo;
}

export function instalarGraficos() {
  const alvo = document.getElementById('graficos-series');
  let resposta = null, ultimaLargura = 0;
  function renderizar() {
    if (!resposta?.dados.length) { alvo.hidden = true; alvo.replaceChildren(); return; }
    alvo.hidden = false;
    const largura = Math.max(280, Math.floor(alvo.clientWidth - 48));
    alvo.innerHTML = prepararGraficos(resposta).map((g, i) => figura(g, i, largura)).join('');
  }
  document.addEventListener('series:resultado', evento => { resposta = evento.detail.resposta; renderizar(); });
  document.addEventListener('series:limpar', () => { resposta = null; alvo.hidden = true; alvo.replaceChildren(); });
  alvo.addEventListener('click', evento => {
    const botao = evento.target.closest('.exportar-grafico');
    if (!botao) return;
    const figura = botao.closest('figure');
    const status = figura?.querySelector('.exportacao-grafico-status');
    try {
      // Serializar antes de qualquer operação de download fixa a imagem nos mesmos
      // valores e filtros que estavam visíveis quando o usuário clicou.
      const arquivo = criarArquivoSvg(figura?.querySelector('svg'));
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      const titulo = figura.querySelector('h2')?.textContent || 'grafico-indicadores';
      link.download = `${titulo}.svg`.replace(/[^\p{L}\p{N}_.-]+/gu, '-');
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (status) status.textContent = 'Imagem gerada com os valores exibidos no momento do clique.';
    } catch {
      if (status) status.textContent = 'Não foi possível gerar uma imagem válida. Nenhum arquivo foi baixado.';
    }
  });
  new ResizeObserver(entradas => {
    const largura = Math.round(entradas[0].contentRect.width);
    if (largura > 0 && largura !== ultimaLargura) { ultimaLargura = largura; renderizar(); }
  }).observe(alvo);
}
