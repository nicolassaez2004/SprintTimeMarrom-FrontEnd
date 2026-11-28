import { API_BASE } from '../comum/config.mjs';
import { agruparPosicoes, classificarGrupo } from './agrupamento.mjs';
import { corDoTexto, letreiroDoVeiculo, listarCores, listarLinhas } from './linhas.mjs';
import {
  calcularDefasagemSegundos,
  descreverUltimaColeta,
  INTERVALO_CONSULTA_MS,
  LIMITE_DEFASAGEM_SEGUNDOS,
  criarBuscaPosicoes,
  criarCoordenadorDeRequisicoes,
  criarEstadoPosicoes,
} from './atualizacao.mjs';
import {
  corDoValor, descreverJanela, ehContexto, instanteDoCampo, legendaDa, rotuloDoValor, situacaoDa,
  urlDaVisualizacao, valorDaFeature, VISUALIZACOES,
} from './contexto.mjs';

(() => {
  const API_BASE_URL = API_BASE.replace(/\/$/, '');
  const REFRESH_MS = INTERVALO_CONSULTA_MS;
  const ESPERA_INICIAL_MS = 5_000;
  const mapElement = document.querySelector('#map');
  const message = document.querySelector('#map-message');
  const messageTitle = document.querySelector('#message-title');
  const messageDetail = document.querySelector('#message-detail');
  const retryButton = document.querySelector('#retry-button');
  const lineFilter = document.querySelector('#line-filter');
  const selectedLineLabel = document.querySelector('#selected-line');
  const lineSearch = document.querySelector('#line-search');
  const lineColor = document.querySelector('#line-color');
  const lineOptions = document.querySelector('#line-options');
  const moreLines = document.querySelector('#more-lines');
  const TAMANHO_PAGINA = 60;
  let catalogo;
  let linhaSelecionada = '';
  let corSelecionada = '';
  let quantidadeOpcoes = TAMANHO_PAGINA;
  const countElement = document.querySelector('#vehicle-count');
  const lastUpdate = document.querySelector('#last-update');
  let ultimaColetaEm = null;
  let ultimaEtag = null;

  const viewSelect = document.querySelector('#map-view');
  const momentFilter = document.querySelector('#moment-filter');
  const momentInput = document.querySelector('#map-moment');
  const legendElement = document.querySelector('#map-legend');
  const contextNote = document.querySelector('#context-note');
  const busSummary = document.querySelectorAll('.vehicle-count, #last-update');
  const CONTEXTO_MS = 5 * 60_000;
  let visualizacao = 'onibus';
  let contextoController;
  let contextoTimer;

  let map;
  let markers;
  let camadaContexto;
  let poligonosMunicipais;
  let municipioBounds;
  const requestCoordinator = criarCoordenadorDeRequisicoes(criarBuscaPosicoes());
  const positionStore = criarEstadoPosicoes();
  let hasSuccessfulResponse = false;
  let usaUltimaColeta = true;
  let timer;
  let freshnessTimer;
  let redrawFrame;
  let popupAberto = false;
  let desenhoPendente = false;
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

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

  // O carregamento dos ônibus continua em segundo plano nas outras visualizações, mas só
  // mostra mensagens quando os ônibus estão na tela.
  function mensagemOnibus(...argumentos) {
    if (visualizacao === 'onibus') setMessage(...argumentos);
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
    camadaContexto = L.layerGroup().addTo(map);
  }

  function enquadrarLocalizacao(latitude, longitude) {
    // Aproxima um quadrado de 1 km; a correção da longitude considera a latitude.
    const meiaAltura = 500 / 111_320;
    const meiaLargura = meiaAltura / Math.cos(latitude * Math.PI / 180);
    const limites = L.latLngBounds(
      [latitude - meiaAltura, longitude - meiaLargura],
      [latitude + meiaAltura, longitude + meiaLargura],
    );
    map.fitBounds(limites, { animate: false });
  }

  function localizarUsuario() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 },
      );
    });
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
    poligonosMunicipais = municipioPolygons(feature.geometry);

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
    return municipioBounds.contains([lat, lng]) && poligonosMunicipais.some((polygon) =>
      pointInRing(lat, lng, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(lat, lng, hole)));
  }

  function formatDate(value) {
    if (!value) return 'Horário indisponível';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Horário indisponível';
    return dateFormatter.format(date);
  }

  function formatAge(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'idade não informada';
    if (seconds < 60) return `há ${Math.ceil(seconds)} s`;
    const minutes = Math.floor(seconds / 60);
    return `há ${minutes} min`;
  }

  function markerFor(vehicle, isFresh) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="bus-marker ${isFresh ? 'fresh' : 'delayed'}" title="${isFresh ? 'Posição coletada há até 60 segundos' : 'Atenção: posição antiga ou horário de coleta indisponível'}"><span aria-hidden="true">▰</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 29],
      popupAnchor: [0, -28],
    });
    return L.marker([vehicle.latitude, vehicle.longitude], { icon }).bindPopup(() => popupFor(vehicle));
  }

  function popupFor(vehicle) {
    const lagSeconds = calcularDefasagemSegundos(vehicle.coletado_em);
    const isFresh = lagSeconds !== null && lagSeconds <= LIMITE_DEFASAGEM_SEGUNDOS;
    const line = vehicle.letreiro || 'Letreiro não identificado';
    const gtfs = vehicle.linha?.gtfs?.nome || vehicle.linha?.gtfs?.codigo;
    const popup = document.createElement('div');
    popup.className = 'bus-popup';
    const title = document.createElement('strong');
    title.textContent = `Ônibus ${vehicle.prefixo || 'sem prefixo'}`;
    popup.append(title);
    const details = [
      `Linha: ${line}`,
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
    return popup;
  }

  function popupDoGrupo(veiculos) {
    const painel = document.createElement('div');
    const seletor = document.createElement('select');
    seletor.setAttribute('aria-label', 'Escolher ônibus do grupo');
    veiculos.forEach((veiculo, i) => {
      seletor.add(new Option('Ônibus ' + (veiculo.prefixo || 'sem prefixo'), String(i)));
    });
    const detalhes = document.createElement('div');
    const mostrar = () => detalhes.replaceChildren(popupFor(veiculos[Number(seletor.value)]));
    seletor.addEventListener('change', mostrar);
    painel.append(seletor, detalhes);
    mostrar();
    return painel;
  }

  function desenharGrupo(grupo, antigos) {
    const { latitude, longitude, veiculos } = grupo;
    const quantidade = veiculos.length;
    const icon = L.divIcon({
      className: '',
      html: '<span class="bus-cluster ' + classificarGrupo(quantidade, antigos) + '">' + quantidade + '</span>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    const titulo = quantidade + ' ônibus agrupados' + (antigos ? ', ' + antigos + ' com posição antiga (mais de 60 s)' : '');
    const marcador = L.marker([latitude, longitude], { icon, title: titulo });
    if (map.getZoom() < map.getMaxZoom()) {
      marcador.on('click', () => map.setView([latitude, longitude], Math.min(map.getZoom() + 2, map.getMaxZoom())));
    } else {
      marcador.bindPopup(() => popupDoGrupo(veiculos));
    }
    marcador.addTo(markers);
  }

  function desenharVisiveis() {
    clearTimeout(freshnessTimer);
    markers.clearLayers();
    const zoom = map.getZoom();
    const limites = map.getPixelBounds();
    const margem = 24;
    const grupos = agruparPosicoes(posicoesFiltradas(), veiculo => map.project([veiculo.latitude, veiculo.longitude], zoom), {
      minX: limites.min.x - margem, minY: limites.min.y - margem,
      maxX: limites.max.x + margem, maxY: limites.max.y + margem,
    });
    const agora = Date.now();
    const limiteMs = LIMITE_DEFASAGEM_SEGUNDOS * 1000;
    let proximaMudanca = Infinity;

    for (const grupo of grupos) {
      let antigos = 0;
      for (const veiculo of grupo.veiculos) {
        const idade = agora - veiculo.coletaMs;
        if (idade >= 0 && idade <= limiteMs) {
          proximaMudanca = Math.min(proximaMudanca, limiteMs - idade + 1);
        } else {
          antigos += 1;
        }
      }
      if (grupo.veiculos.length === 1) markerFor(grupo.veiculos[0], antigos === 0).addTo(markers);
      else desenharGrupo(grupo, antigos);
    }
    if (Number.isFinite(proximaMudanca)) {
      freshnessTimer = setTimeout(agendarDesenho, Math.max(1000, proximaMudanca));
    }
  }

  function agendarDesenho() {
    if (popupAberto) {
      desenhoPendente = true;
      return;
    }
    if (!municipioBounds || redrawFrame !== undefined) return;
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = undefined;
      desenharVisiveis();
    });
  }

  function prepararPosicoes(veiculos) {
    const posicoes = [];
    for (const veiculo of veiculos) {
      if (veiculo.latitude == null || veiculo.longitude == null) continue;
      const lat = Number(veiculo.latitude);
      const lng = Number(veiculo.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !insideMunicipality(lat, lng)) continue;
      posicoes.push({
        ...veiculo, latitude: lat, longitude: lng,
        coletaMs: Date.parse(veiculo.coletado_em),
        letreiro: catalogo ? letreiroDoVeiculo(veiculo.linha, catalogo) : null,
      });
    }
    return posicoes;
  }

  function posicoesFiltradas() {
    const veiculos = positionStore.obter();
    if (!linhaSelecionada && !corSelecionada) return veiculos;
    return veiculos.filter(({ letreiro }) => (
      (!linhaSelecionada || letreiro === linhaSelecionada)
      && (!corSelecionada || catalogo.linhas[letreiro] === corSelecionada)
    ));
  }

  function atualizarMapa({ preservarErro = false } = {}) {
    const quantidade = posicoesFiltradas().length;
    countElement.textContent = String(quantidade);
    const coleta = descreverUltimaColeta(ultimaColetaEm);
    lastUpdate.textContent = coleta.texto;
    lastUpdate.classList.toggle('stale', coleta.desatualizada);
    agendarDesenho();
    if (visualizacao !== 'onibus') return;
    if (preservarErro && message.classList.contains('error')) return;
    if (quantidade === 0 && positionStore.obter().length === 0) {
      setMessage('empty', 'Nenhuma posição disponível', 'Não há posições coletadas nas últimas 24 h. Isso não indica que a frota esteja parada.');
    } else if (quantidade === 0) {
      setMessage('empty', 'Nenhum veículo para este filtro', 'Tente outra linha ou aguarde a próxima atualização.');
    } else {
      hideMessage();
    }
  }

  function exibirOpcoes() {
    const linhas = listarLinhas(catalogo, lineSearch.value, corSelecionada);
    const fragmento = document.createDocumentFragment();
    for (const { letreiro, cor } of linhas.slice(0, quantidadeOpcoes)) {
      const opcao = document.createElement('button');
      opcao.type = 'button';
      opcao.dataset.letreiro = letreiro;
      opcao.textContent = letreiro;
      opcao.setAttribute('aria-pressed', String(letreiro === linhaSelecionada));
      opcao.style.backgroundColor = cor ?? '';
      opcao.style.color = corDoTexto(cor);
      fragmento.append(opcao);
    }
    lineOptions.replaceChildren(fragmento);
    moreLines.hidden = linhas.length <= quantidadeOpcoes;
    document.querySelector('#line-empty').hidden = linhas.length > 0;
  }

  function selecionarLinha(letreiro, foco = lineFilter.querySelector('summary')) {
    linhaSelecionada = letreiro;
    const cor = catalogo.linhas[letreiro];
    selectedLineLabel.textContent = letreiro || 'Todas as linhas';
    selectedLineLabel.style.backgroundColor = cor ?? '';
    selectedLineLabel.style.color = corDoTexto(cor);
    lineFilter.open = false;
    foco.focus();
    map.closePopup();
    if (hasSuccessfulResponse) atualizarMapa({ preservarErro: true });
    if (visualizacao === 'transito') carregarContexto();
  }

  async function carregarCatalogo() {
    try {
      const resposta = await fetch('./data/linhas-sptrans.json');
      if (!resposta.ok) throw new Error('Catálogo indisponível.');
      catalogo = await resposta.json();
      for (const { nome, cor } of listarCores(catalogo)) {
        lineColor.add(new Option(nome, cor));
      }
      document.querySelector('#color-filter').hidden = false;
      lineFilter.hidden = false;
    } catch {
      document.querySelector('#line-unavailable').hidden = false;
    }
  }

  function elemento(tag, texto, classe) {
    const no = document.createElement(tag);
    if (texto !== undefined) no.textContent = texto;
    if (classe) no.className = classe;
    return no;
  }

  function popupDoContexto(propriedades, janela) {
    const valor = valorDaFeature(visualizacao, propriedades);
    const caixa = elemento('div', undefined, 'context-popup');
    const titulo = visualizacao === 'transito'
      ? `Linha ${propriedades.linha} · sentido ${propriedades.sentido} · trecho ${propriedades.ordem}`
      : `${propriedades.nome} (${propriedades.fonte} ${propriedades.codigo})`;
    caixa.append(
      elemento('strong', titulo),
      elemento('span', `${VISUALIZACOES[visualizacao].rotulo}: ${rotuloDoValor(visualizacao, valor)}`),
    );
    if (valor === null && propriedades.motivo) caixa.append(elemento('small', `Motivo: ${propriedades.motivo}`));
    caixa.append(elemento('small', `Janela ${descreverJanela(janela)} (horário de São Paulo)`));
    return caixa;
  }

  function desenharLegenda() {
    const lista = elemento('ul');
    for (const { cor, rotulo } of legendaDa(visualizacao)) {
      const item = elemento('li', rotulo);
      const amostra = elemento('i');
      amostra.style.backgroundColor = cor;
      item.prepend(amostra);
      lista.append(item);
    }
    legendElement.replaceChildren(elemento('strong', VISUALIZACOES[visualizacao].rotulo), lista);
    legendElement.hidden = false;
  }

  function desenharContexto(corpo) {
    camadaContexto.clearLayers();
    const cor = feature => corDoValor(visualizacao, valorDaFeature(visualizacao, feature.properties));
    const camada = L.geoJSON(corpo, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 9, color: '#3d4a52', weight: 1.5, fillOpacity: 0.95, fillColor: cor(feature),
      }),
      style: feature => ({ color: cor(feature), weight: 7, opacity: 0.9 }),
      onEachFeature: (feature, layer) => layer.bindPopup(popupDoContexto(feature.properties, corpo.janela)),
    }).addTo(camadaContexto);
    if (visualizacao === 'transito' && corpo.features?.length) {
      map.fitBounds(camada.getBounds(), { padding: [30, 30] });
    }
  }

  async function carregarContexto() {
    clearTimeout(contextoTimer);
    contextoController?.abort();
    if (!ehContexto(visualizacao)) return;
    camadaContexto.clearLayers();
    contextNote.hidden = true;
    let instante;
    try {
      instante = instanteDoCampo(momentInput.value);
    } catch {
      setMessage('error', 'Momento inválido', 'Escolha data e hora no campo MOMENTO.');
      return;
    }
    const url = urlDaVisualizacao(API_BASE_URL, visualizacao, { instante, linha: linhaSelecionada });
    if (!url) {
      const { titulo, detalhe } = situacaoDa(visualizacao, null, { linha: linhaSelecionada });
      setMessage('empty', titulo, detalhe);
      return;
    }
    const controller = new AbortController();
    contextoController = controller;
    setMessage('loading', `Carregando ${VISUALIZACOES[visualizacao].rotulo.toLowerCase()}…`,
      'Consultando os dados públicos de contexto.');
    try {
      const resposta = await fetch(url, {
        headers: { Accept: 'application/geo+json, application/json' }, signal: controller.signal,
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok || !corpo) {
        throw new Error(corpo?.erro?.mensagem || (resposta.status === 503
          ? 'O serviço está indisponível agora.' : `Resposta inesperada (HTTP ${resposta.status}).`));
      }
      if (contextoController !== controller) return;
      desenharContexto(corpo);
      if (corpo.aviso) {
        contextNote.textContent = corpo.aviso;
        contextNote.hidden = false;
      }
      const situacao = situacaoDa(visualizacao, corpo, { linha: linhaSelecionada });
      if (situacao) setMessage('empty', situacao.titulo, situacao.detalhe);
      else hideMessage();
    } catch (erro) {
      if (erro.name === 'AbortError') return;
      setMessage('error', 'Não foi possível carregar o contexto', erro instanceof TypeError
        ? 'Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.' : erro.message, true);
    } finally {
      if (contextoController === controller && !momentInput.value) {
        contextoTimer = setTimeout(carregarContexto, CONTEXTO_MS);  // "agora" acompanha o relógio
      }
    }
  }

  function mostrarVisualizacao(nova) {
    visualizacao = nova;
    const contexto = ehContexto(nova);
    momentFilter.hidden = !contexto;
    for (const no of busSummary) no.hidden = contexto;
    map.closePopup();
    if (contexto) {
      map.removeLayer(markers);
      desenharLegenda();
      carregarContexto();
      return;
    }
    clearTimeout(contextoTimer);
    contextoController?.abort();
    camadaContexto.clearLayers();
    legendElement.hidden = true;
    contextNote.hidden = true;
    map.addLayer(markers);
    hideMessage();
    if (hasSuccessfulResponse) atualizarMapa();
    else loadPositions();
  }

  async function loadPositions() {
    const modo = usaUltimaColeta ? '?modo=ultima_coleta' : '';
    const endpoint = API_BASE_URL + '/posicoes/atuais' + modo;
    const request = requestCoordinator.iniciar(endpoint, {
      headers: { Accept: 'application/json' },
      etagLocal: ultimaEtag,
    });
    if (!hasSuccessfulResponse) mensagemOnibus('loading', 'Carregando posições…', 'Consultando dados públicos da frota.');
    if (visualizacao === 'onibus') retryButton.hidden = true;

    try {
      const { response } = await request.promise;
      if (!requestCoordinator.eAtual(request.id)) return;
      const etag = response.headers.get('ETag');
      if ((response.ok || response.status === 304) && etag && etag === ultimaEtag) {
        // Mesmo ciclo de coleta: idades e cores são recalculadas sem reprocessar a frota.
        atualizarMapa();
        return;
      }
      if (response.status === 304) {
        throw new Error('O serviço não enviou as posições completas. Tente novamente.');
      }
      const payload = await response.json().catch(() => null);
      if (!requestCoordinator.eAtual(request.id)) return;
      if (usaUltimaColeta && response.status === 400 && payload?.erro?.campo === 'modo') {
        usaUltimaColeta = false;
        return loadPositions();
      }
      if (!response.ok) {
        const error = new Error(payload?.erro?.mensagem || `HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (!payload || !Array.isArray(payload.veiculos)) throw new Error('Resposta inesperada do serviço de posições.');

      positionStore.substituir(prepararPosicoes(payload.veiculos));
      ultimaColetaEm = payload.ultima_coleta_ok_em ?? null;
      ultimaEtag = etag;
      hasSuccessfulResponse = true;
      atualizarMapa();
    } catch (error) {
      if (!requestCoordinator.eAtual(request.id)) return;
      const detail = error.status === 503
        ? 'O serviço de posições está indisponível. Isso não confirma que a frota esteja vazia.'
        : error instanceof TypeError
          ? 'Não foi possível conectar ao serviço de posições. Verifique a conexão e tente novamente.'
          : error.message || 'Não foi possível consultar as posições agora.';
      if (hasSuccessfulResponse) {
        agendarDesenho();
        mensagemOnibus('error', 'Falha ao atualizar o mapa', `${detail} Os marcadores exibidos são da última consulta válida. Posições com mais de 60 s aparecem em âmbar.`, true);
      } else {
        mensagemOnibus('error', 'Não foi possível carregar o mapa', detail, true);
        countElement.textContent = '—';
      }
    } finally {
      if (requestCoordinator.eAtual(request.id)) {
        clearTimeout(timer);
        const intervalo = positionStore.obter().length ? REFRESH_MS : ESPERA_INICIAL_MS;
        timer = setTimeout(loadPositions, intervalo);
      }
    }
  }

  ensureLeaflet().then(() => {
    try {
      initializeMap();
      map.on('moveend', agendarDesenho);
      map.on('popupopen', () => { popupAberto = true; });
      map.on('popupclose', () => {
        popupAberto = false;
        if (desenhoPendente) {
          desenhoPendente = false;
          agendarDesenho();
        }
      });
      window.addEventListener('pagehide', () => {
        requestCoordinator.cancelar();
        clearTimeout(timer);
        clearTimeout(freshnessTimer);
        clearTimeout(contextoTimer);
        contextoController?.abort();
        cancelAnimationFrame(redrawFrame);
      }, { once: true });
      lineFilter.addEventListener('toggle', () => {
        if (lineFilter.open) {
          exibirOpcoes();
          lineSearch.focus();
        }
      });
      lineFilter.addEventListener('keydown', event => {
        if (event.key === 'Escape' && lineFilter.open) {
          lineFilter.open = false;
          lineFilter.querySelector('summary').focus();
        }
      });
      lineColor.addEventListener('change', () => {
        corSelecionada = lineColor.value;
        document.querySelector('#color-swatch').style.backgroundColor = corSelecionada;
        quantidadeOpcoes = TAMANHO_PAGINA;
        lineSearch.value = '';
        if (linhaSelecionada && corSelecionada && catalogo.linhas[linhaSelecionada] !== corSelecionada) {
          selecionarLinha('', lineColor);
        } else {
          map.closePopup();
          if (hasSuccessfulResponse) atualizarMapa({ preservarErro: true });
        }
        if (lineFilter.open) exibirOpcoes();
      });
      lineSearch.addEventListener('input', () => {
        quantidadeOpcoes = TAMANHO_PAGINA;
        exibirOpcoes();
      });
      moreLines.addEventListener('click', () => {
        const primeiraNovaOpcao = quantidadeOpcoes;
        quantidadeOpcoes += TAMANHO_PAGINA;
        exibirOpcoes();
        lineOptions.children[primeiraNovaOpcao]?.focus();
      });
      lineOptions.addEventListener('click', event => {
        const opcao = event.target.closest('button[data-letreiro]');
        if (opcao) selecionarLinha(opcao.dataset.letreiro);
      });
      document.querySelector('#all-lines').addEventListener('click', () => selecionarLinha(''));
      document.addEventListener('click', event => {
        if (lineFilter.open && !lineFilter.contains(event.target)) lineFilter.open = false;
      });
      retryButton.addEventListener('click', () => (ehContexto(visualizacao) ? carregarContexto() : loadPositions()));
      viewSelect.addEventListener('change', () => mostrarVisualizacao(viewSelect.value));
      momentInput.addEventListener('change', () => carregarContexto());
      document.querySelector('#fit-button').addEventListener('click', () => {
        if (municipioBounds) map.fitBounds(municipioBounds, { padding: [20, 20] });
      });
      Promise.all([loadMunicipality(), carregarCatalogo()]).then(async () => {
        loadPositions();
        const localizacao = await localizarUsuario();
        if (localizacao && insideMunicipality(localizacao.latitude, localizacao.longitude)) {
          enquadrarLocalizacao(localizacao.latitude, localizacao.longitude);
        } else {
          enquadrarLocalizacao(-23.56, -46.63);
        }
      }).catch((error) => {
        setMessage('error', 'Mapa indisponível', error.message || 'Não foi possível carregar o limite municipal.', true);
      });
    } catch (error) {
      setMessage('error', 'Mapa indisponível', 'Não foi possível inicializar o mapa.', true);
    }
  }).catch(() => {
    setMessage('error', 'Mapa indisponível', 'A biblioteca do mapa não carregou. Verifique sua conexão e recarregue a página.', true);
  });
})();
