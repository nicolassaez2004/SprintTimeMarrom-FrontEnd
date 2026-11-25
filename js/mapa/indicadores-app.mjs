import { API_BASE } from '../comum/config.mjs';
import { avisoQualidadeIndicador, periodoMapa, resumoQualidadeMapa } from './indicadores.mjs';

const form = document.querySelector('#filtros-mapa-indicadores');
const status = document.querySelector('#mapa-status');
const baseWrap = document.querySelector('#base-wrap');
const api = API_BASE.replace(/\/$/, '');
let map, camada, atual = null;

function filtros() { return Object.fromEntries(new FormData(form)); }
function url(caminho, parametros) { const u = new URL(`${api}${caminho}`); u.search = new URLSearchParams(parametros); return u; }
async function json(urlConsulta) {
  const resposta = await fetch(urlConsulta, { headers: { Accept: 'application/json' }, credentials: 'omit' });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(corpo?.erro?.mensagem || `A API respondeu HTTP ${resposta.status}.`);
  return corpo;
}
function intervalo(f) {
  return periodoMapa(f.inicio, f.fim);
}
async function listarVersoes(f) {
  const periodo = intervalo(f);
  const parametros = { linha: f.linha, tipo: f.tipo, ...periodo, page: '1', page_size: '100' };
  const primeira = await json(url('/indicadores', parametros));
  const dados = [...primeira.dados];
  const paginas = Math.ceil(primeira.paginacao.total / primeira.paginacao.page_size);
  if (paginas > 10) throw new Error('Este recorte tem muitas versões. Reduza o período para listar as versões GTFS com segurança.');
  for (let page = 2; page <= paginas; page++) {
    dados.push(...(await json(url('/indicadores', { ...parametros, page: String(page) }))).dados);
  }
  const ids = [...new Set(dados.map(item => item.versao_gtfs_id).filter(Boolean))].sort();
  const seletor = form.elements.versao_gtfs_id;
  const anterior = seletor.value;
  seletor.replaceChildren(new Option(ids.length ? 'Escolha a versão GTFS' : 'Nenhuma versão no recorte', ''));
  ids.forEach(id => seletor.add(new Option(id, id)));
  if (ids.includes(anterior)) seletor.value = anterior;
  else if (ids.length === 1) seletor.value = ids[0];
  atual = { filtros: f, ids };
  if (!ids.length) throw new Error('Não há indicadores com versão GTFS neste recorte.');
  if (ids.length > 1 && !seletor.value) throw new Error('Escolha uma versão GTFS na lista e consulte novamente.');
  return seletor.value;
}
function prepararMapa() {
  if (map) return;
  map = L.map('mapa-indicadores', { preferCanvas: false }).setView([-23.56, -46.63], 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  camada = L.geoJSON([], {
    style: feature => ({
      color: feature.properties?.qualidade_coleta?.incompleto === true ? '#a84628' : '#765440',
      fillColor: feature.properties?.qualidade_coleta?.incompleto === true ? '#a84628' : '#9d8066',
      weight: feature.properties?.qualidade_coleta?.incompleto === true ? 3 : 1.5,
      fillOpacity: 0.35,
    }),
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: feature.properties?.qualidade_coleta?.incompleto === true ? 8 : 5,
      color: feature.properties?.qualidade_coleta?.incompleto === true ? '#a84628' : '#765440',
      fillOpacity: 0.8,
    }),
    onEachFeature: (feature, layer) => layer.bindPopup(() => {
      const p = feature.properties || {};
      const box = document.createElement('div'); box.className = 'popup-indicador';
      const title = document.createElement('strong'); title.textContent = `${p.nome || p.codigo || 'Unidade'} · ${p.escopo || ''}`; box.append(title);
      const details = [p.tipo && `Indicador: ${p.tipo}`, p.valor !== null && p.valor !== undefined && `${p.valor} ${p.unidade || ''}`, p.inicio && `Início: ${p.inicio}`, p.fim && `Fim: ${p.fim}`, p.versao_gtfs_id && `GTFS: ${p.versao_gtfs_id}`].filter(Boolean);
      for (const detail of details) { const line = document.createElement('span'); line.textContent = detail; box.append(line); }
      const texto = avisoQualidadeIndicador(p.qualidade_coleta);
      if (texto) { const warning = document.createElement('span'); warning.className = p.qualidade_coleta?.incompleto === true ? 'popup-aviso' : 'popup-indisponivel'; warning.textContent = texto; box.append(warning); }
      return box;
    }),
  }).addTo(map);
}
async function carregarMapa(f, versao) {
  const periodo = intervalo(f);
  const parametros = {
    escopo: f.escopo, versao_gtfs_id: versao, linha: f.linha, tipo: f.tipo,
    inicio: periodo.inicio, fim: periodo.fim, page: '1', page_size: '100',
    ...(f.escopo === 'distrito' || f.escopo === 'subprefeitura' ? { base: f.base } : {}),
  };
  const primeira = await json(url('/mapas/indicadores', parametros));
  const features = [...primeira.features];
  const paginas = Math.ceil(primeira.paginacao.total / primeira.paginacao.page_size);
  if (paginas > 30) throw new Error('O mapa tem mais de 3.000 unidades. Reduza o período ou filtre por linha.');
  for (let page = 2; page <= paginas; page++) {
    features.push(...(await json(url('/mapas/indicadores', { ...parametros, page: String(page) }))).features);
  }
  prepararMapa();
  camada.clearLayers(); camada.addData({ type: 'FeatureCollection', features });
  const totais = resumoQualidadeMapa(features);
  const lista = document.querySelector('#avisos-mapa');
  const avisos = features.filter(f => f.properties?.qualidade_coleta?.incompleto === true)
    .map(f => `${f.properties.nome || f.properties.codigo || 'Unidade'} · ${avisoQualidadeIndicador(f.properties.qualidade_coleta)}`);
  lista.hidden = avisos.length === 0;
  lista.replaceChildren(...avisos.map(texto => { const item = document.createElement('li'); item.textContent = texto; return item; }));
  status.hidden = false;
  status.className = totais.avisos ? 'message warning' : 'message';
  status.textContent = `${features.length} unidades no mapa. ${totais.avisos} com incompletude informada pela API; ${totais.indisponiveis} sem qualidade calculável. Os detalhes aparecem ao selecionar uma geometria.`;
  if (features.length && camada.getBounds().isValid()) map.fitBounds(camada.getBounds(), { padding: [20, 20], maxZoom: 14 });
}
form.elements.escopo.addEventListener('change', () => { baseWrap.hidden = !['distrito', 'subprefeitura'].includes(form.elements.escopo.value); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  status.hidden = false; status.className = 'message warning'; status.textContent = 'Consultando indicadores e qualidade publicados pela API…';
  try {
    const f = filtros();
    if (f.fim < f.inicio) throw new Error('A data final deve ser igual ou posterior à inicial.');
    if ((Date.parse(`${f.fim}T00:00Z`) - Date.parse(`${f.inicio}T00:00Z`)) / 86_400_000 > 30) throw new Error('Consulte até 31 dias por vez.');
    let versao = f.versao_gtfs_id;
    if (!atual || atual.filtros.linha !== f.linha || atual.filtros.tipo !== f.tipo || atual.filtros.inicio !== f.inicio || atual.filtros.fim !== f.fim || !atual.ids.includes(versao)) {
      versao = await listarVersoes(f);
      if (!versao) return;
    }
    await carregarMapa(f, versao);
  } catch (erro) {
    status.className = 'message error'; status.textContent = erro.message || 'Não foi possível consultar o mapa.';
  }
});
document.querySelector('#imprimir-mapa').addEventListener('click', () => window.print());
if (window.L) prepararMapa();
else {
  const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
  script.onload = prepararMapa;
  script.onerror = () => { status.hidden = false; status.className = 'message error'; status.textContent = 'O mapa não carregou. Verifique a conexão e tente novamente.'; };
  document.head.append(script);
}
