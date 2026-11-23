import { MAPA_CONFIG } from './config.js';
import {
  calcularDefasagemSegundos,
  LIMITE_DEFASAGEM_SEGUNDOS,
  criarCoordenadorDeRequisicoes,
  criarEstadoPosicoes,
} from './atualizacao.js';

(() => {
  const API_BASE_URL = MAPA_CONFIG.apiBaseUrl.replace(/\/$/, '');
  const REFRESH_MS = 30_000;
  const mapElement = document.querySelector('#map');
  const message = document.querySelector('#map-message');
  const messageTitle = document.querySelector('#message-title');
  const messageDetail = document.querySelector('#message-detail');
  const retryButton = document.querySelector('#retry-button');
  const lineSelect = document.querySelector('#line-select');
  const countElement = document.querySelector('#vehicle-count');

  let map;
  let markers;
  let municipio;
  let municipioBounds;
  const requestCoordinator = criarCoordenadorDeRequisicoes();
  const positionStore = criarEstadoPosicoes();
  let hasSuccessfulResponse = false;
  let timer;
  let freshnessTimer;

  function setMessage(state, title, detail, canRetry = false) {
    message.className = `map-message ${state}`;
    messageTitle.textContent = title;
    messageDetail.textContent = detail;
    retryButton.hidden = !canRetry;
    message.hidden = false;
  }

  function hideMessage() {
    message.hidden = true;
    message.className = 'map-message';
  }

  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('MAP_LIBRARY_UNAVAILABLE'));
      document.head.append(script);
    });
  }

  function initializeMap() {
    if (!window.L) throw new Error('MAP_LIBRARY_UNAVAILABLE');
    map = L.map(mapElement, {
      zoomControl: false, preferCanvas: true, maxZoom: 19,
      zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 120, wheelDebounceTime: 60,
    }).setView([-23.56, -46.63], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    markers = L.layerGroup().addTo(map);
  }

  function municipioPolygons(geometry) {
    if (geometry?.type === 'Polygon') return [geometry.coordinates];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
    throw new Error('Limite municipal inválido.');
  }

  async function loadMunicipality() {
    const response = await fetch('./data/municipio-sp-3550308.geojson', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Não foi possível carregar o limite municipal de São Paulo.');
    const featureCollection = await response.json();
    const feature = featureCollection.features?.find((item) => item.properties?.codarea === '3550308')
      || featureCollection.features?.[0];
    if (!feature?.geometry) throw new Error('O limite municipal de São Paulo está vazio.');
    municipio = feature.geometry;

    const boundaryLayer = L.geoJSON(feature);
    municipioBounds = boundaryLayer.getBounds();
    boundaryLayer.setStyle({ color: '#23634d', weight: 2, opacity: 0.9, fill: false, interactive: false });
    boundaryLayer.addTo(map);
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(municipioBounds.pad(0.025));
    map.fitBounds(municipioBounds, { padding: [20, 20] });
    map.setMinZoom(map.getZoom());
    map.invalidateSize();
  }

  function pointInRing(lat, lng, ring) {
    let inside = false;
    const pointOnSegment = (x, y, x1, y1, x2, y2) => {
      const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
      if (Math.abs(cross) > 1e-10) return false;
      const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
      return dot >= -1e-10 && dot <= (x2 - x1) ** 2 + (y2 - y1) ** 2 + 1e-10;
    };
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (pointOnSegment(lng, lat, xi, yi, xj, yj)) return true;
      const crosses = (yi > lat) !== (yj > lat)
        && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function insideMunicipality(lat, lng) {
    return municipioPolygons(municipio).some((polygon) =>
      pointInRing(lat, lng, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(lat, lng, hole)));
  }

  function formatDate(value) {
    if (!value) return 'Horário indisponível';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Horário indisponível';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
  }

  function formatAge(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'idade não informada';
    if (seconds < 60) return `há ${Math.ceil(seconds)} s`;
    const minutes = Math.floor(seconds / 60);
    return `há ${minutes} min`;
  }

  function markerFor(vehicle) {
    const lagSeconds = calcularDefasagemSegundos(vehicle.coletado_em);
    const isFresh = lagSeconds !== null && lagSeconds <= LIMITE_DEFASAGEM_SEGUNDOS;
    const icon = L.divIcon({
      className: '',
      html: `<div class="bus-marker ${isFresh ? 'fresh' : 'delayed'}" title="${isFresh ? 'Posição coletada há até 60 segundos' : 'Atenção: posição antiga ou horário de coleta indisponível'}"><span aria-hidden="true">▰</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 29],
      popupAnchor: [0, -28],
    });
    const line = vehicle.linha?.codigo_olho_vivo || 'Linha não informada';
    const gtfs = vehicle.linha?.gtfs?.nome || vehicle.linha?.gtfs?.codigo;
    const popup = document.createElement('div');
    popup.className = 'bus-popup';
    const title = document.createElement('strong');
    title.textContent = `Ônibus ${vehicle.prefixo || 'sem prefixo'}`;
    popup.append(title);
    const details = [
      `Linha Olho Vivo: ${line}`,
      ...(gtfs ? [`Linha GTFS: ${gtfs}`] : []),
      isFresh
        ? `Defasagem coleta até exibição: ${formatAge(lagSeconds)}`
        : `ATENÇÃO: posição antiga — ${lagSeconds === null ? 'horário da coleta indisponível' : `defasagem de ${formatAge(lagSeconds)}`}`,
      `Horário GPS: ${formatDate(vehicle.horario_gps)}`,
      `Coletado em: ${formatDate(vehicle.coletado_em)}`,
    ];
    for (const detail of details) {
      const span = document.createElement('span');
      span.textContent = detail;
      popup.append(span);
    }
    return L.marker([vehicle.latitude, vehicle.longitude], { icon }).bindPopup(popup);
  }

  function scheduleFreshnessTransition(vehicles) {
    clearTimeout(freshnessTimer);
    const nextTransition = vehicles
      .map((vehicle) => calcularDefasagemSegundos(vehicle.coletado_em))
      .filter((age) => age !== null && age < LIMITE_DEFASAGEM_SEGUNDOS)
      .map((age) => Math.ceil((LIMITE_DEFASAGEM_SEGUNDOS - age) * 1000) + 1)
      .sort((a, b) => a - b)[0];
    if (nextTransition !== undefined) {
      freshnessTimer = setTimeout(() => renderVehicles(positionStore.obter()), nextTransition);
    }
  }

  function renderVehicles(vehicles) {
    markers.clearLayers();
    const bounds = [];
    for (const vehicle of vehicles) {
      const lat = Number(vehicle.latitude);
      const lng = Number(vehicle.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180
          || !insideMunicipality(lat, lng)) continue;
      markerFor(vehicle).addTo(markers);
      bounds.push([lat, lng]);
    }
    countElement.textContent = String(bounds.length);
    scheduleFreshnessTransition(vehicles);
    return bounds.length;
  }

  function updateLineOptions(vehicles) {
    const previous = lineSelect.value;
    const lines = [...new Set(vehicles.map((vehicle) => vehicle.linha?.codigo_olho_vivo).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    lineSelect.replaceChildren(new Option('Todas as linhas', ''));
    for (const line of lines) lineSelect.add(new Option(`Linha ${line}`, line));
    lineSelect.value = lines.includes(previous) ? previous : '';
    lineSelect.disabled = false;
  }

  async function loadPositions({ keepTimer = true } = {}) {
    const selectedLine = lineSelect.value;
    const query = new URLSearchParams();
    if (selectedLine) query.set('linha', selectedLine);
    const endpoint = `${API_BASE_URL}/posicoes/atuais${query.size ? `?${query}` : ''}`;
    const request = requestCoordinator.iniciar(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!hasSuccessfulResponse) setMessage('loading', 'Carregando posições…', 'Consultando dados públicos da frota.');
    retryButton.hidden = true;

    try {
      const response = await request.promise;
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(payload?.erro?.mensagem || `HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (!requestCoordinator.eAtual(request.id)) return;
      if (!payload || !Array.isArray(payload.veiculos)) throw new Error('Resposta inesperada do serviço de posições.');

      const latestVehicles = positionStore.substituir(payload.veiculos);
      hasSuccessfulResponse = true;
      if (!selectedLine) updateLineOptions(latestVehicles);
      // Respostas de filtros rápidos não mudam a lista-base de linhas.
      const visibleCount = renderVehicles(latestVehicles);

      if (visibleCount === 0) {
        setMessage('empty', 'Nenhum veículo para este filtro', 'A consulta foi concluída com sucesso. Tente outra linha ou aguarde a próxima atualização.');
      } else {
        hideMessage();
      }
    } catch (error) {
      if (!requestCoordinator.eAtual(request.id)) return;
      const detail = error.status === 503
        ? 'O serviço de posições está indisponível. Isso não confirma que a frota esteja vazia.'
        : error instanceof TypeError
          ? 'Não foi possível conectar ao serviço de posições. Verifique a conexão e tente novamente.'
          : error.message || 'Não foi possível consultar as posições agora.';
      if (hasSuccessfulResponse) {
        renderVehicles(positionStore.obter());
        setMessage('error', 'Falha ao atualizar o mapa', `${detail} Os marcadores exibidos são da última consulta válida. Posições com mais de 60 s aparecem em âmbar.`, true);
      } else {
        setMessage('error', 'Não foi possível carregar o mapa', detail, true);
        countElement.textContent = '—';
      }
    } finally {
      if (keepTimer && requestCoordinator.eAtual(request.id)) {
        clearTimeout(timer);
        timer = setTimeout(() => loadPositions(), REFRESH_MS);
      }
    }
  }

  ensureLeaflet().then(() => {
    try {
      initializeMap();
      window.addEventListener('pagehide', () => {
        requestCoordinator.cancelar();
        clearTimeout(timer);
        clearTimeout(freshnessTimer);
      }, { once: true });
      lineSelect.addEventListener('change', () => loadPositions());
      retryButton.addEventListener('click', () => loadPositions());
      document.querySelector('#fit-button').addEventListener('click', () => {
        if (municipioBounds) map.fitBounds(municipioBounds, { padding: [20, 20] });
      });
      loadMunicipality().then(() => loadPositions()).catch((error) => {
        setMessage('error', 'Mapa indisponível', error.message || 'Não foi possível carregar o limite municipal.', true);
      });
    } catch (error) {
      setMessage('error', 'Mapa indisponível', 'Não foi possível inicializar o mapa.', true);
    }
  }).catch(() => {
    setMessage('error', 'Mapa indisponível', 'A biblioteca do mapa não carregou. Verifique sua conexão e recarregue a página.', true);
  });
})();
