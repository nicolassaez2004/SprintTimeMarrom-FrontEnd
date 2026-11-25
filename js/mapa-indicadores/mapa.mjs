import { classeDaFeicao, nomeFeicao } from './modelo.mjs';
import { dataHora, valorFormatado } from '../series/modelo.mjs';
import { escapar as h } from '../comum/formatacao.mjs';

let carregamento;
function carregarLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (carregamento) return carregamento;
  carregamento = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('O mapa demorou para carregar.')); }, 15000);
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.onload = () => { clearTimeout(timer); resolve(globalThis.L); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Não foi possível carregar a base do mapa.')); };
    document.head.append(script);
  }).catch(erro => { carregamento = null; throw erro; });
  return carregamento;
}

export function estiloFeicao(f, cortes) {
  const classe = classeDaFeicao(f, cortes);
  return { color: f.geometry.type === 'LineString' ? classe.cor : classe.indice === null ? '#67756a' : '#315a72', fillColor: classe.cor,
    fillOpacity: 0.8, opacity: 1, weight: f.geometry.type === 'LineString' ? 6 : 2,
    dashArray: classe.indice === null ? '5 5' : null, radius: 8 };
}

export function criarMapa(elemento) {
  let mapa = null, camada = null, itens = [], sequencia = 0;
  function limpar() { sequencia += 1; if (camada && mapa) mapa.removeLayer(camada); camada = null; itens = []; }
  function ajustar() {
    if (camada?.getBounds().isValid()) mapa.fitBounds(camada.getBounds(), { padding: [25, 25], maxZoom: 16 });
  }
  async function mostrar(features, cortes, legendaApi) {
    const atual = ++sequencia;
    const L = await carregarLeaflet();
    if (atual !== sequencia) return;
    if (!mapa) {
      mapa = L.map(elemento, { preferCanvas: false, maxZoom: 19 }).setView([-23.55, -46.63], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
    }
    if (camada) mapa.removeLayer(camada);
    itens = [];
    const indices = new Map(features.map((f, i) => [f, i]));
    camada = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: f => estiloFeicao(f, cortes),
      pointToLayer: (f, latlng) => L.circleMarker(latlng, estiloFeicao(f, cortes)),
      onEachFeature: (f, layer) => {
        const p = f.properties, indice = indices.get(f), classe = classeDaFeicao(f, cortes);
        const ausencia = p.ausencia ? (legendaApi.ausencia[p.ausencia] ?? p.ausencia) : null;
        const periodo = p.inicio ? `${dataHora(p.inicio)} a ${dataHora(p.fim)}` : 'Sem janela publicada para esta área';
        layer.bindPopup(`<div class="popup-indicador"><strong>${h(nomeFeicao(f))}</strong><p>${h(valorFormatado(p.valor, p.unidade ?? ''))}</p><p>${h(classe.rotulo)}</p>${ausencia ? `<p>${h(ausencia)}</p>` : ''}<p>${h(periodo)}</p><p>Fonte: indicadores publicados pelo Observa SP</p>${p.territorio_ausente ? '<p>Sem vínculo territorial informado</p>' : ''}${p.cruza_limite ? '<p>Trecho cruza limites; vínculo territorial informado pela API.</p>' : ''}${p.versao_conjunto ? `<small>Conjunto: ${h(p.versao_conjunto)}</small>` : ''}</div>`);
        layer.bindTooltip(nomeFeicao(f));
        layer.on('add', () => {
          const desenho = layer.getElement();
          if (!desenho) return;
          desenho.dataset.feicao = String(indice);
          desenho.dataset.valor = p.valor === null ? 'null' : String(p.valor);
          desenho.dataset.faixa = classe.indice === null ? 'ausente' : String(classe.indice);
          desenho.setAttribute('tabindex', '0'); desenho.setAttribute('role', 'button');
          desenho.setAttribute('aria-label', `${nomeFeicao(f)}: ${valorFormatado(p.valor, p.unidade ?? '')}, ${classe.rotulo}`);
          desenho.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); layer.openPopup(); } });
        });
        itens[indice] = layer;
      },
    }).addTo(mapa);
    mapa.invalidateSize(); ajustar();
  }
  function localizar(indice) {
    const layer = itens[indice];
    if (!layer) return false;
    if (layer.getBounds) mapa.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 17 });
    else mapa.setView(layer.getLatLng(), 17);
    layer.openPopup(); return true;
  }
  return { mostrar, limpar, localizar, ajustar };
}
